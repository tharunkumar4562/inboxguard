import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ANALYTICS_FILE = DATA_DIR / "analytics.json"
_LOCK = threading.Lock()


def _default_payload() -> Dict[str, Any]:
    return {
        "counters": {
            "page_views": 0,
            "cta_clicks": 0,
            "access_requests": 0,
            "analyze_requests": 0,
            "mode_content": 0,
            "mode_full": 0,
        },
        "by_page": {},
        "by_event": {},
        "events": [],
        "updated_at": "",
    }


def _ensure_store() -> None:
    if ANALYTICS_FILE.exists():
        return
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = _default_payload()
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    ANALYTICS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _read_store() -> Dict[str, Any]:
    _ensure_store()
    try:
        raw = ANALYTICS_FILE.read_text(encoding="utf-8")
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return _default_payload()


def _write_store(data: Dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    ANALYTICS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def track_event(event: str, meta: Dict[str, Any] | None = None) -> None:
    try:
        event_name = (event or "unknown").strip().lower()[:80]
        meta = meta or {}

        with _LOCK:
            data = _read_store()

            counters = data.setdefault("counters", _default_payload()["counters"])
            by_event = data.setdefault("by_event", {})
            by_page = data.setdefault("by_page", {})
            events = data.setdefault("events", [])

            by_event[event_name] = int(by_event.get(event_name, 0)) + 1

            if event_name == "page_view":
                counters["page_views"] = int(counters.get("page_views", 0)) + 1
                page = str(meta.get("page", "unknown"))[:100]
                by_page[page] = int(by_page.get(page, 0)) + 1
            elif event_name == "cta_click":
                counters["cta_clicks"] = int(counters.get("cta_clicks", 0)) + 1
            elif event_name == "access_request":
                counters["access_requests"] = int(counters.get("access_requests", 0)) + 1
            elif event_name == "analyze_request":
                counters["analyze_requests"] = int(counters.get("analyze_requests", 0)) + 1
                mode = str(meta.get("mode", "content")).strip().lower()
                if mode == "full":
                    counters["mode_full"] = int(counters.get("mode_full", 0)) + 1
                else:
                    counters["mode_content"] = int(counters.get("mode_content", 0)) + 1

            events.append(
                {
                    "time": datetime.now(timezone.utc).isoformat(),
                    "event": event_name,
                    "meta": meta,
                }
            )
            if len(events) > 200:
                del events[:-200]

            _write_store(data)
    except Exception:
        pass


def get_dashboard_data() -> Dict[str, Any]:
    with _LOCK:
        data = _read_store()

    counters = data.get("counters", {})
    mode_content = int(counters.get("mode_content", 0))
    mode_full = int(counters.get("mode_full", 0))
    mode_total = mode_content + mode_full
    if mode_total > 0:
        mode_content_pct = round((mode_content / mode_total) * 100, 1)
        mode_full_pct = round((mode_full / mode_total) * 100, 1)
    else:
        mode_content_pct = 0.0
        mode_full_pct = 0.0

    return {
        "counters": counters,
        "by_page": data.get("by_page", {}),
        "by_event": data.get("by_event", {}),
        "events": list(reversed(data.get("events", [])[-30:])),
        "updated_at": data.get("updated_at", ""),
        "mode_summary": {
            "content": mode_content,
            "full": mode_full,
            "content_pct": mode_content_pct,
            "full_pct": mode_full_pct,
        },
    }
