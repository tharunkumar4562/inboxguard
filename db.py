"""
Postgres adapter that exposes a sqlite3-compatible API on top of Supabase Postgres.

The rest of the app was written against the stdlib `sqlite3` module. Rather than
rewriting every call site, this module returns a Connection wrapper whose
`.execute()` accepts the SQLite SQL dialect (`?` placeholders, PRAGMA queries,
INSERT OR IGNORE, INTEGER PRIMARY KEY AUTOINCREMENT, sqlite_master, ...) and
translates it on the fly to Postgres before executing it through psycopg2.

Rows are returned as a dict-subclass that supports both name and integer
indexing, mirroring `sqlite3.Row`.
"""

from __future__ import annotations

import os
import re
import threading
from typing import Any, Iterable, Optional

import psycopg2
from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor


def _resolve_db_url() -> str:
    """Build a usable Postgres DSN from the available Supabase env vars.

    Accepts a few input shapes so that minor copy/paste mistakes do not
    block local development:
      * Full DSN in SUPABASE_DB_URL (preferred).
      * Just a password in SUPABASE_DB_URL or SUPABASE_DB_PASSWORD; the rest
        of the DSN is derived from SUPABASE_URL.
      * Square brackets around the password (template artefact) are stripped.
    """
    raw = (
        os.environ.get("SUPABASE_POOLER_URL")
        or os.environ.get("SUPABASE_DB_URL")
        or ""
    ).strip().replace("[", "").replace("]", "")
    if not raw:
        return ""
    # Already a full DSN
    if "://" in raw:
        return raw

    # Otherwise treat the value as just a password and derive the rest.
    password = raw
    project_ref = ""
    supabase_url = (os.environ.get("SUPABASE_URL") or "").strip()
    if supabase_url:
        # https://<ref>.supabase.co
        m = re.match(r"https?://([^./]+)\.supabase\.co", supabase_url)
        if m:
            project_ref = m.group(1)
    if not project_ref:
        return ""
    region = (os.environ.get("SUPABASE_REGION") or "ap-south-1").strip()
    host = f"aws-1-{region}.pooler.supabase.com"
    return f"postgresql://postgres.{project_ref}:{password}@{host}:6543/postgres"


_DB_URL = _resolve_db_url()

_POOL: Optional[pg_pool.ThreadedConnectionPool] = None
_POOL_LOCK = threading.Lock()
_TABLE_HAS_ID_CACHE: dict[str, bool] = {}
_CACHE_LOCK = threading.Lock()


def _get_pool() -> pg_pool.ThreadedConnectionPool:
    global _POOL
    if _POOL is None:
        with _POOL_LOCK:
            if _POOL is None:
                if not _DB_URL:
                    raise RuntimeError(
                        "SUPABASE_DB_URL is not configured. "
                        "Set it to the Postgres connection string for your Supabase project."
                    )
                _POOL = pg_pool.ThreadedConnectionPool(
                    minconn=1, maxconn=10, dsn=_DB_URL
                )
    return _POOL


class Row(dict):
    """Dict subclass with sqlite3.Row-style integer + name indexing."""

    def __getitem__(self, key):
        if isinstance(key, int):
            try:
                return list(self.values())[key]
            except IndexError as exc:
                raise IndexError(f"Row index out of range: {key}") from exc
        return super().__getitem__(key)

    def keys(self):  # type: ignore[override]
        return super().keys()


class _StaticResult:
    """Result wrapper for synthetic rows produced by adapter (e.g. PRAGMA)."""

    def __init__(self, rows: list):
        self._rows = list(rows)

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return list(self._rows)

    def __iter__(self):
        return iter(self._rows)


class Cursor:
    """Cursor wrapper exposing sqlite3.Cursor-style fetch + lastrowid."""

    def __init__(self, raw_cursor, lastrowid: Optional[int] = None):
        self._cursor = raw_cursor
        self.lastrowid = lastrowid

    def fetchone(self) -> Optional[Row]:
        if self._cursor is None:
            return None
        row = self._cursor.fetchone()
        return Row(row) if row is not None else None

    def fetchall(self) -> list[Row]:
        if self._cursor is None:
            return []
        return [Row(r) for r in self._cursor.fetchall()]

    def __iter__(self):
        if self._cursor is None:
            return iter([])
        for r in self._cursor:
            yield Row(r)


_AUTOINC_RE = re.compile(
    r"INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT", re.IGNORECASE
)
_PRAGMA_TABLE_INFO_RE = re.compile(
    r"^\s*PRAGMA\s+table_info\(\s*([^\s)]+)\s*\)\s*;?\s*$", re.IGNORECASE
)
_SQLITE_MASTER_RE = re.compile(
    r"\bsqlite_master\b", re.IGNORECASE
)
_INSERT_OR_IGNORE_RE = re.compile(
    r"^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+", re.IGNORECASE
)
_INSERT_OR_REPLACE_RE = re.compile(
    r"^\s*INSERT\s+OR\s+REPLACE\s+INTO\s+", re.IGNORECASE
)
_INSERT_INTO_RE = re.compile(
    r"^\s*INSERT\s+INTO\s+(\"?[A-Za-z_][A-Za-z0-9_]*\"?)", re.IGNORECASE
)
_RETURNING_RE = re.compile(r"\bRETURNING\b", re.IGNORECASE)


def _translate_ddl(sql: str) -> str:
    """Translate SQLite DDL fragments into Postgres equivalents."""
    return _AUTOINC_RE.sub("SERIAL PRIMARY KEY", sql)


def _replace_placeholders(sql: str) -> str:
    """Replace SQLite '?' placeholders with psycopg2 '%s', skipping string literals.

    Also escapes literal '%' as '%%' so psycopg2's format string parser does not
    treat them as parameter markers.
    """
    out: list[str] = []
    i = 0
    n = len(sql)
    in_string = False
    quote_char: Optional[str] = None
    while i < n:
        ch = sql[i]
        if in_string:
            if ch == quote_char:
                # Doubled-quote escape stays in the string literal
                if i + 1 < n and sql[i + 1] == quote_char:
                    out.append(ch)
                    out.append(ch)
                    i += 2
                    continue
                in_string = False
                quote_char = None
            out.append(ch)
        else:
            if ch in ("'", '"'):
                in_string = True
                quote_char = ch
                out.append(ch)
            elif ch == "?":
                out.append("%s")
            elif ch == "%":
                out.append("%%")
            else:
                out.append(ch)
        i += 1
    return "".join(out)


def _is_ddl(sql_stripped: str) -> bool:
    s = sql_stripped.upper()
    return (
        s.startswith("CREATE TABLE")
        or s.startswith("CREATE INDEX")
        or s.startswith("CREATE UNIQUE INDEX")
        or s.startswith("ALTER TABLE")
        or s.startswith("DROP TABLE")
        or s.startswith("DROP INDEX")
    )


def _table_has_id_column(raw_conn, table: str) -> bool:
    table_key = table.lower()
    with _CACHE_LOCK:
        cached = _TABLE_HAS_ID_CACHE.get(table_key)
    if cached is not None:
        return cached
    has_id = False
    try:
        with raw_conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name=%s "
                "AND column_name='id' LIMIT 1",
                (table_key,),
            )
            has_id = cur.fetchone() is not None
    except psycopg2.Error:
        try:
            raw_conn.rollback()
        except Exception:
            pass
        has_id = False
    with _CACHE_LOCK:
        _TABLE_HAS_ID_CACHE[table_key] = has_id
    return has_id


class Connection:
    """sqlite3-style connection wrapper around a pooled psycopg2 connection."""

    def __init__(self, raw_conn):
        self._conn = raw_conn
        self._closed = False
        # Accept assignment for API compatibility; ignored — Row is always returned.
        self.row_factory: Any = None

    # --- statement execution -------------------------------------------------

    def execute(self, sql: str, params: Iterable[Any] = ()) -> Cursor:
        if not sql or not sql.strip():
            return Cursor(None)

        stripped = sql.strip()

        # PRAGMA table_info(table)
        m = _PRAGMA_TABLE_INFO_RE.match(stripped)
        if m:
            return self._handle_pragma_table_info(m.group(1))

        # sqlite_master query (for listing tables)
        if _SQLITE_MASTER_RE.search(stripped):
            return self._handle_sqlite_master()

        # DDL: CREATE/ALTER/DROP TABLE
        if _is_ddl(stripped):
            sql_translated = _translate_ddl(stripped)
            with self._conn.cursor() as cur:
                cur.execute(sql_translated)
            return Cursor(None)

        # DML: SELECT/INSERT/UPDATE/DELETE
        sql_translated = self._translate_dml(stripped)
        param_tuple = tuple(params) if params else None

        # INSERT statement: try to capture lastrowid by appending RETURNING id
        insert_m = _INSERT_INTO_RE.match(stripped)
        if (
            insert_m
            and not _RETURNING_RE.search(sql_translated)
            and _table_has_id_column(self._conn, insert_m.group(1).strip().strip('"'))
        ):
            sql_with_returning = (
                sql_translated.rstrip().rstrip(";") + " RETURNING id"
            )
            cur = self._conn.cursor(cursor_factory=RealDictCursor)
            try:
                cur.execute(sql_with_returning, param_tuple)
                row = cur.fetchone()
                last_id: Optional[int] = None
                if row and "id" in row and row["id"] is not None:
                    last_id = int(row["id"])
                return Cursor(cur, lastrowid=last_id)
            except psycopg2.Error:
                # ON CONFLICT DO NOTHING with RETURNING returns no rows on
                # conflict, but the call still succeeds — handled above. If
                # something else fails, fall through to a plain INSERT.
                self._conn.rollback()
                cur = self._conn.cursor(cursor_factory=RealDictCursor)
                cur.execute(sql_translated, param_tuple)
                return Cursor(cur)

        cur = self._conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(sql_translated, param_tuple)
        return Cursor(cur)

    # --- transaction control -------------------------------------------------

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            # Drop any in-progress transaction before returning the conn to pool
            try:
                self._conn.rollback()
            except Exception:
                pass
            _get_pool().putconn(self._conn)
        except Exception:
            try:
                self._conn.close()
            except Exception:
                pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            try:
                self.commit()
            except Exception:
                pass
        else:
            try:
                self.rollback()
            except Exception:
                pass

    # --- internals -----------------------------------------------------------

    def _translate_dml(self, sql: str) -> str:
        # INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
        if _INSERT_OR_IGNORE_RE.match(sql):
            sql = _INSERT_OR_IGNORE_RE.sub("INSERT INTO ", sql, count=1)
            if "ON CONFLICT" not in sql.upper():
                sql = sql.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
        # INSERT OR REPLACE is too ambiguous to auto-translate (needs the
        # conflict target). Call sites that need it must be rewritten to use
        # explicit `ON CONFLICT (...) DO UPDATE`. We leave it alone here so
        # the resulting Postgres syntax error surfaces clearly.
        return _replace_placeholders(sql)

    def _handle_pragma_table_info(self, table: str) -> Cursor:
        table_clean = table.strip().strip('"').strip("'")
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT ordinal_position, column_name, data_type, "
                "is_nullable, column_default "
                "FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name=%s "
                "ORDER BY ordinal_position",
                (table_clean,),
            )
            raw_rows = cur.fetchall()
        # SQLite PRAGMA table_info returns: (cid, name, type, notnull, dflt_value, pk)
        rows = [
            Row({
                0: idx,
                1: r[1],
                2: (r[2] or "").upper(),
                3: 0 if str(r[3]).upper() == "YES" else 1,
                4: r[4],
                5: 0,
                "cid": idx,
                "name": r[1],
                "type": (r[2] or "").upper(),
                "notnull": 0 if str(r[3]).upper() == "YES" else 1,
                "dflt_value": r[4],
                "pk": 0,
            })
            for idx, r in enumerate(raw_rows)
        ]
        return Cursor(_StaticResult(rows))  # type: ignore[arg-type]

    def _handle_sqlite_master(self) -> Cursor:
        cur = self._conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            "SELECT table_name AS name FROM information_schema.tables "
            "WHERE table_schema='public'"
        )
        return Cursor(cur)


def get_conn() -> Connection:
    """Return a Connection from the pool with a sqlite3-style API."""
    raw = _get_pool().getconn()
    return Connection(raw)


def is_configured() -> bool:
    """Return True if the SUPABASE_DB_URL secret is set."""
    return bool(_DB_URL)
