import json
import threading
from datetime import datetime, timezone
from typing import Any, Dict
from db import get_conn

_LOCK = threading.Lock()


def _ensure_db_table() -> None:
    conn = get_conn()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS analytics_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_name TEXT NOT NULL,
                meta_json TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
    except Exception as e:
        print(f"[Analytics] Schema setup failed: {e}")
    finally:
        conn.close()


def track_event(event: str, meta: Dict[str, Any] | None = None) -> None:
    try:
        event_name = (event or "unknown").strip().lower()[:80]
        meta = meta or {}
        meta_str = json.dumps(meta)
        created_at = datetime.now(timezone.utc).isoformat()

        _ensure_db_table()

        with _LOCK:
            conn = get_conn()
            try:
                conn.execute(
                    "INSERT INTO analytics_events (event_name, meta_json, created_at) VALUES (?, ?, ?)",
                    (event_name, meta_str, created_at)
                )
                conn.commit()
            finally:
                conn.close()
    except Exception as e:
        print(f"[Analytics] track_event failed: {e}")


def get_dashboard_data() -> Dict[str, Any]:
    _ensure_db_table()

    with _LOCK:
        conn = get_conn()
        try:
            cur = conn.cursor()
            # Retrieve last 2000 events to compile dashboard aggregates
            cur.execute(
                "SELECT event_name, meta_json, created_at FROM analytics_events ORDER BY id DESC LIMIT 2000"
            )
            rows = cur.fetchall()
        except Exception as e:
            print(f"[Analytics] Query failed: {e}")
            rows = []
        finally:
            conn.close()

    counters = {
        "page_views": 0,
        "cta_clicks": 0,
        "access_requests": 0,
        "analyze_requests": 0,
        "mode_content": 0,
        "mode_full": 0,
    }
    by_page = {}
    by_event = {}
    events_list = []

    # Process events in chronological order to calculate running aggregates
    for row in reversed(rows):
        e_name = str(row[0])
        try:
            meta = json.loads(row[1]) if row[1] else {}
        except Exception:
            meta = {}
        time_str = str(row[2])

        by_event[e_name] = by_event.get(e_name, 0) + 1

        if e_name == "page_view":
            counters["page_views"] += 1
            page = str(meta.get("page", "unknown"))[:100]
            by_page[page] = by_page.get(page, 0) + 1
        elif e_name == "cta_click":
            counters["cta_clicks"] += 1
        elif e_name == "access_request":
            counters["access_requests"] += 1
        elif e_name == "analyze_request":
            counters["analyze_requests"] += 1
            mode = str(meta.get("mode", "content")).strip().lower()
            if mode == "full":
                counters["mode_full"] += 1
            else:
                counters["mode_content"] += 1

        events_list.append({
            "time": time_str,
            "event": e_name,
            "meta": meta
        })

    mode_content = counters["mode_content"]
    mode_full = counters["mode_full"]
    mode_total = mode_content + mode_full
    if mode_total > 0:
        mode_content_pct = round((mode_content / mode_total) * 100, 1)
        mode_full_pct = round((mode_full / mode_total) * 100, 1)
    else:
        mode_content_pct = 0.0
        mode_full_pct = 0.0

    return {
        "counters": counters,
        "by_page": by_page,
        "by_event": by_event,
        "events": list(reversed(events_list[-30:])),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "mode_summary": {
            "content": mode_content,
            "full": mode_full,
            "content_pct": mode_content_pct,
            "full_pct": mode_full_pct,
        },
    }
