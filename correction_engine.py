import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

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


def _extract_subject_and_body(text: str) -> Tuple[str, str]:
    source = (text or "").strip()
    if not source:
        return "", ""

    subject_match = re.search(r"^\s*Subject:\s*(.+)$", source, flags=re.IGNORECASE | re.MULTILINE)
    subject = subject_match.group(1).strip() if subject_match else ""

    body = re.sub(r"^\s*Subject:\s*.+$", "", source, flags=re.IGNORECASE | re.MULTILINE).strip()
    body = re.sub(r"\n{3,}", "\n\n", body)
    return subject, body


def _clean_body_lines(body: str) -> List[str]:
    lines = [line.strip() for line in (body or "").splitlines() if line.strip()]
    cleaned = _strip_feature_lines(lines)
    normalized: List[str] = []
    for line in cleaned:
        if not line:
            continue
        if re.match(r"^(to|from|cc|bcc):", line, flags=re.IGNORECASE):
            continue
        if re.match(r"^(hi there|hello there|dear user|dear customer|hi team|hello team)[,\s]*$", line, flags=re.IGNORECASE):
            continue
        normalized.append(line)
    return normalized


def _single_sentence_summary(lines: List[str], max_words: int = 24) -> str:
    if not lines:
        return ""
    text = " ".join(lines)
    text = _soften_cta(text)
    text = re.sub(r"^(hi there|hello there|dear user|dear customer|hi team|hello team)[,\s]+", "", text, flags=re.IGNORECASE)
    words = text.split()
    short = " ".join(words[:max_words]).strip()
    short = re.sub(r"\s+", " ", short)
    if not short:
        return ""
    if short.endswith((".", "?", "!")):
        return short
    return f"{short}."


def _rewrite_for_outreach(original_text: str, issue_blob: str, aggressiveness: str) -> Tuple[str, List[str]]:
    _, body = _extract_subject_and_body(original_text)
    lines = _clean_body_lines(body)
    context = _derive_context_hint(original_text)

    outcome_line = "We can remove that step so output is ready to use."
    if "personalization" in issue_blob:
        outcome_line = "This version is written as 1:1 outreach with a clear recipient hook."

    cta = "Worth a quick look?"
    if aggressiveness == "high":
        cta = "Open to a quick look?"

    summary_line = _single_sentence_summary(lines, 16 if aggressiveness == "high" else 20)
    message = (
        f"Hey {{{{first_name}}}},\n\n"
        f"Saw you're working with {context}.\n\n"
        "Are you currently dealing with manual cleanup after each run?\n\n"
        f"{outcome_line}\n\n"
        f"{cta}"
    )

    if summary_line and len(summary_line.split()) <= 18 and "manual cleanup" not in summary_line.lower():
        message = f"{message}\n\nContext: {summary_line}"

    reasons = [
        "Shorter copy reduces bulk-email pattern signals.",
        "Recipient placeholder adds a 1:1 personalization cue.",
        "Feature list replaced with one clear outcome.",
        "CTA softened to reduce promotional pressure.",
    ]
    return message.strip(), reasons


def _rewrite_for_update(original_text: str, aggressiveness: str) -> Tuple[str, List[str]]:
    subject, body = _extract_subject_and_body(original_text)
    lines = _clean_body_lines(body)
    summary = _single_sentence_summary(lines, 26 if aggressiveness == "low" else 20)

    headline = "Quick heads up"
    if subject:
        headline = f"Quick heads up on {subject.lower()}"

    cta = "If useful, I can send a shorter summary."
    if aggressiveness == "high":
        cta = "If useful, I can send a 2-line summary."

    main_line = summary or "Sharing this update so there is no surprise later."
    message = (
        f"Hey {{{{first_name}}}},\n\n"
        f"{headline}.\n\n"
        f"{main_line}\n\n"
        f"{cta}"
    )

    reasons = [
        "Condensed announcement into a short human update.",
        "Removed corporate broadcast phrasing.",
        "Kept one clear message to reduce bulk-like structure.",
    ]
    return message.strip(), reasons


def rewrite_email_text(original_text: str, detected_issues: List[str] | None = None, intent: str = "cold outreach") -> str:
    payload = rewrite_email_with_metadata(original_text, detected_issues, intent)
    return payload["rewritten_text"]


def rewrite_email_with_metadata(original_text: str, detected_issues: List[str] | None = None, intent: str = "cold outreach") -> Dict:
    profile = get_learning_profile()
    original = (original_text or "").strip()
    if not original:
        return {"rewritten_text": "", "rewrite_reasons": [], "intent_used": intent}

    issue_blob = " ".join(detected_issues or []).lower()
    resolved_intent = (intent or "cold outreach").strip().lower()
    aggressiveness = str(profile.get("shorten_aggressiveness", "medium"))

    if any(token in issue_blob for token in [
        "broadcast",
        "promotional",
        "cta pressure",
        "no personalization",
        "generic salutation",
        "automation footprint",
    ]):
        resolved_intent = "cold outreach"

    if resolved_intent in ("cold outreach", "marketing/newsletter"):
        text, reasons = _rewrite_for_outreach(original, issue_blob, aggressiveness)
    else:
        text, reasons = _rewrite_for_update(original, aggressiveness)

    # Normalize whitespace and shorten for readability.
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = _shorten_text(text, aggressiveness)

    if "{{first_name}}" not in text.lower():
        text = f"Hey {{{{first_name}}}},\n\n{text}" if text else "Hey {{{{first_name}}}},"

    # Keep minimum useful context so rewrite does not collapse into empty output.
    if len(text.split()) < 25:
        text = f"{text}\n\nIf useful, I can share a short example for your workflow."

    return {
        "rewritten_text": text.strip(),
        "rewrite_reasons": reasons,
        "intent_used": resolved_intent,
    }
