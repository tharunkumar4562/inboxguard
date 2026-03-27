import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
FEEDBACK_FILE = DATA_DIR / "rewrite_feedback.json"
MODEL_FILE = DATA_DIR / "rewrite_model.json"
_LOCK = threading.Lock()


def _default_model() -> Dict:
    return {
        "total_feedback": 0,
        "inbox": 0,
        "spam": 0,
        "not_sure": 0,
        "updated_at": "",
    }


def _default_feedback_payload() -> Dict:
    return {
        "events": [],
        "updated_at": "",
    }


def _ensure_file(path: Path, payload: Dict) -> None:
    if path.exists():
        return
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    to_write = dict(payload)
    to_write["updated_at"] = datetime.now(timezone.utc).isoformat()
    path.write_text(json.dumps(to_write, indent=2), encoding="utf-8")


def _read_json(path: Path, fallback: Dict) -> Dict:
    _ensure_file(path, fallback)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return dict(fallback)


def _write_json(path: Path, payload: Dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def get_learning_profile() -> Dict:
    with _LOCK:
        model = _read_json(MODEL_FILE, _default_model())

    total = int(model.get("total_feedback", 0))
    inbox = int(model.get("inbox", 0))
    spam = int(model.get("spam", 0))
    not_sure = int(model.get("not_sure", 0))

    if total <= 0:
        return {
            "sample_size": 0,
            "inbox_rate": None,
            "shorten_aggressiveness": "medium",
            "question_hook_strength": "medium",
            "personalization_priority": "high",
        }

    inbox_rate = round(inbox / total, 3)

    shorten_aggressiveness = "medium"
    question_hook_strength = "medium"

    if spam >= inbox and total >= 10:
        shorten_aggressiveness = "high"
        question_hook_strength = "high"
    elif inbox_rate >= 0.7 and total >= 10:
        shorten_aggressiveness = "low"
        question_hook_strength = "medium"

    return {
        "sample_size": total,
        "inbox_rate": inbox_rate,
        "shorten_aggressiveness": shorten_aggressiveness,
        "question_hook_strength": question_hook_strength,
        "personalization_priority": "high",
        "not_sure": not_sure,
    }


def record_feedback(event: Dict) -> Dict:
    outcome = str(event.get("outcome", "not_sure")).strip().lower()
    if outcome not in {"inbox", "spam", "not_sure"}:
        outcome = "not_sure"

    stored = {
        "time": datetime.now(timezone.utc).isoformat(),
        "outcome": outcome,
        "from_risk_band": str(event.get("from_risk_band", ""))[:60],
        "to_risk_band": str(event.get("to_risk_band", ""))[:60],
        "original_len": len(str(event.get("original_text", ""))),
        "rewritten_len": len(str(event.get("rewritten_text", ""))),
    }

    with _LOCK:
        feedback_data = _read_json(FEEDBACK_FILE, _default_feedback_payload())
        events = feedback_data.setdefault("events", [])
        events.append(stored)
        if len(events) > 2000:
            del events[:-2000]
        _write_json(FEEDBACK_FILE, feedback_data)

        model = _read_json(MODEL_FILE, _default_model())
        model["total_feedback"] = int(model.get("total_feedback", 0)) + 1
        model[outcome] = int(model.get(outcome, 0)) + 1
        _write_json(MODEL_FILE, model)

    return {
        "ok": True,
        "outcome": outcome,
        "learning_profile": get_learning_profile(),
    }


def _strip_feature_lines(lines: List[str]) -> List[str]:
    markers = [
        "introduce",
        "major upgrade",
        "game-ready",
        "lightweight",
        "scalable",
        "pipeline",
        "production-ready",
        "latest generation",
        "feature",
    ]
    cleaned = []
    for line in lines:
        low = line.lower()
        if any(marker in low for marker in markers):
            continue
        cleaned.append(line)
    # Do not over-prune. If we removed almost everything, keep original lines.
    meaningful = [line for line in cleaned if line.strip()]
    if len(meaningful) < 2:
        return lines
    return cleaned


def _replace_salutation(text: str) -> str:
    return re.sub(
        r"^(\s*)(hi there|hello there|dear user|dear customer|hi all|hello all|hi team|hello team)[,\s]*",
        r"\1Hey {{first_name}},\n",
        text,
        flags=re.IGNORECASE,
    )


def _soften_cta(text: str) -> str:
    replacements = [
        (r"\bcheck out (our )?(platform|tool|solution)\b", "Worth a quick look"),
        (r"\bbook a demo\b", "Open to a quick walkthrough"),
        (r"\bschedule a call\b", "Worth a short chat"),
        (r"\bclick here\b", "Worth a quick look"),
    ]
    output = text
    for pattern, replacement in replacements:
        output = re.sub(pattern, replacement, output, flags=re.IGNORECASE)
    return output


def _ensure_question_hook(text: str, strength: str) -> str:
    compact = text.strip()
    if not compact:
        return ""

    lines = [line.strip() for line in compact.splitlines() if line.strip()]
    if not lines:
        return compact

    top_slice = " ".join(lines[:3])
    if "?" in top_slice:
        return compact

    hook = "Are you currently handling manual cleanup after each send?"
    if strength == "high":
        hook = "Are you still losing time to manual cleanup before each send?"

    # Insert after salutation if present.
    if re.match(r"^(hey|hi|hello|dear)\b", lines[0], flags=re.IGNORECASE):
        rebuilt = [lines[0], "", hook] + lines[1:]
    else:
        rebuilt = [hook, ""] + lines
    return "\n".join(rebuilt)


def _shorten_text(text: str, aggressiveness: str) -> str:
    words = text.split()
    max_words = 120
    if aggressiveness == "high":
        max_words = 90
    elif aggressiveness == "low":
        max_words = 140

    if len(words) <= max_words:
        return text

    trimmed = " ".join(words[:max_words]).strip()
    if not trimmed.endswith((".", "?", "!")):
        trimmed += "..."
    return trimmed


def _derive_context_hint(text: str) -> str:
    low = (text or "").lower()
    if any(token in low for token in ["3d", "mesh", "asset", "pipeline"]):
        return "3D workflows"
    if any(token in low for token in ["sales", "outbound", "prospect", "lead"]):
        return "outbound workflows"
    if any(token in low for token in ["support", "ticket", "reply"]):
        return "customer support workflows"
    return "your current workflow"


def rewrite_email_text(original_text: str, detected_issues: List[str] | None = None) -> str:
    profile = get_learning_profile()
    text = (original_text or "").strip()
    if not text:
        return ""

    lines = text.splitlines()
    lines = _strip_feature_lines(lines)
    text = "\n".join(lines)

    # Force personal 1:1 salutation when generic greeting appears.
    text = _replace_salutation(text)

    # Soften hard CTA language.
    text = _soften_cta(text)

    # Ensure we open as a conversational question, especially for broadcast-like drafts.
    issue_blob = " ".join(detected_issues or []).lower()
    if "broadcast" in issue_blob or "personalization" in issue_blob or "mass" in issue_blob:
        context = _derive_context_hint(original_text)
        text = (
            f"Hey {{{{first_name}}}},\n\n"
            f"Saw you're working with {context}.\n\n"
            "Are you currently dealing with cleanup after each send?\n\n"
            "We built this to remove that step and keep outputs ready to use.\n\n"
            "Worth a quick look?"
        )
    else:
        text = _ensure_question_hook(text, "medium")

    # Normalize whitespace and shorten for readability.
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = _shorten_text(text, str(profile.get("shorten_aggressiveness", "medium")))

    if "{{first_name}}" not in text.lower():
        text = f"Hey {{{{first_name}}}},\n\n{text}" if text else "Hey {{{{first_name}}}},"

    # Keep minimum useful context so rewrite does not collapse into empty output.
    if len(text.split()) < 25:
        text = f"{text}\n\nIf useful, I can share a short example for your workflow."

    return text.strip()
