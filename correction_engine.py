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
    if any(token in low for token in ["loan", "funding", "education", "repayment", "interest"]):
        return "education funding"
    if any(token in low for token in ["student", "undergraduate", "university", "campus"]):
        return "students planning next steps"
    if any(token in low for token in ["hackathon", "internship", "placement", "career"]):
        return "career opportunities"
    if any(token in low for token in ["3d", "mesh", "asset", "pipeline"]):
        return "3D workflows"
    if any(token in low for token in ["sales", "outbound", "prospect", "lead"]):
        return "outbound workflows"
    if any(token in low for token in ["support", "ticket", "reply"]):
        return "customer support workflows"
    return "your current workflow"


def _extract_subject_and_body(original_text: str) -> Dict[str, str]:
    text = (original_text or "").strip()
    subject_match = re.search(r"^\s*Subject:\s*(.+)$", text, flags=re.IGNORECASE | re.MULTILINE)
    subject = subject_match.group(1).strip() if subject_match else ""

    body = text
    if subject_match:
        body = re.sub(r"^\s*Subject:\s*.+$", "", text, count=1, flags=re.IGNORECASE | re.MULTILINE).strip()

    body = re.sub(r"\s+", " ", body).strip()
    return {"subject": subject, "body": body}


def _extract_pain_point(body: str) -> str:
    """Extract the core problem/benefit the email is trying to communicate."""
    low = (body or "").lower()
    
    # Specific pain point detection
    pain_points = {
        "funding|loan|finance": "Are you currently exploring funding options?",
        "sales|lead|prospect": "Are you actively building your pipeline right now?",
        "automation|workflow|process": "Still spending time on manual work here?",
        "support|issue|problem": "Running into any blockers with this?",
        "marketing|campaign|reach": "Working on growing your reach?",
        "training|learn|skill": "Looking to upgrade your skills?",
        "hiring|talent|recruit": "Currently hiring for this area?",
        "data|analytics|metric": "Trying to get better visibility into this?",
        "security|compliance|risk": "Dealing with any security concerns here?",
        "cost|budget|reduce": "Looking to cut costs in this area?",
    }
    
    for keywords, question in pain_points.items():
        if any(kw in low for kw in keywords.split("|")):
            return question
    
    return "Still dealing with challenges in this area?"


def _extract_core_value(body: str) -> str:
    """Extract the 1-2 sentence core value from a longer email."""
    # Remove common preamble/closing patterns
    text = body
    text = re.sub(r"^(hi|hello|dear|hey).*?\n\n", "", text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"\n\n(best regards|sincerely|thanks|thank you).*$", "", text, flags=re.IGNORECASE | re.DOTALL)
    
    # Get first 1-2 sentences
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    core = " ".join(sentences[:2]).strip()
    
    # Truncate if still too long
    if len(core) > 150:
        core = core[:150].rsplit(" ", 1)[0] + "."
    
    return core if core else "We've built something worth checking out."


def _infer_rewrite_style(rewrite_style: str, aggressive: bool) -> str:
    style = (rewrite_style or "balanced").strip().lower()
    if style not in {"safe", "balanced", "aggressive"}:
        style = "aggressive" if aggressive else "balanced"
    return style


def _target_word_bounds(style: str) -> tuple[int, int]:
    if style == "safe":
        return (80, 100)
    if style == "aggressive":
        return (30, 60)
    return (50, 80)


def _first_meaningful_sentence(text: str) -> str:
    compact = re.sub(r"\s+", " ", (text or "").strip())
    if not compact:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", compact)
    return (parts[0] if parts else compact).strip()


def _extract_offer_line(text: str) -> str:
    candidates = [line.strip() for line in (text or "").splitlines() if line.strip()]
    if not candidates:
        return ""

    priority_tokens = [
        "help",
        "offer",
        "loan",
        "funding",
        "approval",
        "repayment",
        "internship",
        "hackathon",
        "improve",
        "reduce",
        "increase",
    ]
    for line in candidates:
        low = line.lower()
        if any(token in low for token in priority_tokens):
            return _first_meaningful_sentence(line)

    # Fall back to the first non-greeting sentence.
    for line in candidates:
        low = line.lower()
        if not any(low.startswith(prefix) for prefix in ["hi", "hello", "dear", "hey", "regards", "best"]):
            return _first_meaningful_sentence(line)
    return _first_meaningful_sentence(candidates[0])


def _extract_audience_hint(text: str) -> str:
    low = (text or "").lower()
    if any(token in low for token in ["student", "undergraduate", "campus", "university"]):
        return "students"
    if any(token in low for token in ["founder", "startup"]):
        return "founders"
    if any(token in low for token in ["sales", "sdr", "ae", "pipeline"]):
        return "sales teams"
    if any(token in low for token in ["marketer", "campaign", "brand"]):
        return "marketing teams"
    return "teams"


def _cta_for_context(style: str, context: str) -> str:
    if "funding" in context or "loan" in context:
        if style == "aggressive":
            return "Want me to share the eligibility and timeline details?"
        return "Happy to share details if this is relevant for you."
    ctas = {
        "safe": "If useful, I can share a quick breakdown.",
        "balanced": "Would it help if I shared how this works?",
        "aggressive": "Want me to send the quick version?",
    }
    return ctas.get(style, ctas["balanced"])


def _compose_cold_outreach_rewrite(original_text: str, style: str) -> str:
    context = _derive_context_hint(original_text)
    audience = _extract_audience_hint(original_text)
    offer_line = _extract_offer_line(original_text)
    pain_line = _extract_pain_point(original_text)

    if not offer_line:
        offer_line = f"We help {audience} handle {context} with less friction."

    if style == "safe":
        opening = f"Saw you're working on {context}."
        body_lines = [
            f"Hey {{{{first_name}}}},",
            "",
            opening,
            offer_line,
            "",
            _cta_for_context(style, context),
        ]
    elif style == "aggressive":
        body_lines = [
            f"Hey {{{{first_name}}}},",
            "",
            pain_line,
            offer_line,
            "",
            _cta_for_context(style, context),
        ]
    else:
        body_lines = [
            f"Hey {{{{first_name}}}},",
            "",
            f"Quick note for {audience} working on {context}.",
            offer_line,
            "",
            _cta_for_context(style, context),
        ]

    return "\n".join(line.strip() if line else "" for line in body_lines).strip()


def _rewrite_update_or_transactional_safe(subject: str, body: str) -> str:
    """Safe mode keeps more context with minimal risk cleanup."""
    core = body
    core = re.sub(r"^(hi there|hello there|dear user|dear customer)[,\s]*", "", core, flags=re.IGNORECASE)
    core = re.sub(r"\bwe'?re (excited|pleased|thrilled) to\b", "", core, flags=re.IGNORECASE)
    core = re.sub(r"\bmajor (update|upgrade)\b", "update", core, flags=re.IGNORECASE)
    core = re.sub(r"\s+", " ", core).strip()

    # Extract the actual value
    value = _extract_core_value(core)
    
    subject_line = subject or "important update"
    return (
        f"Hey {{{{first_name}}}},\n\n"
        f"Sharing a quick update — {subject_line.lower()}.\n\n"
        f"{value}\n\n"
        f"If helpful, I can share more details."
    )


def _rewrite_update_or_transactional_balanced(subject: str, body: str) -> str:
    """Balanced mode shifts to question-first with context preserved."""
    core = re.sub(r"\s+", " ", (body or "").strip())
    value = _extract_core_value(core)
    subject_line = (subject or "important update").strip().lower()
    return (
        f"Hey {{{{first_name}}}},\n\n"
        f"Quick question on {subject_line} — is this relevant for you right now?\n\n"
        f"{value}\n\n"
        "Happy to share details if useful."
    )


def _rewrite_update_or_transactional_aggressive(subject: str, body: str) -> str:
    """Aggressive mode is shortest and reply-oriented."""
    core = re.sub(r"\s+", " ", (body or "").strip())
    value = _first_meaningful_sentence(_extract_core_value(core))
    if len(value.split()) > 14:
        value_words = value.split()
        value = " ".join(value_words[:14]).strip()
        if not value.endswith((".", "?", "!")):
            value += "."
    return (
        f"Hey {{{{first_name}}}},\n\n"
        "Quick check: want the short version?\n\n"
        f"{value}\n\n"
        "Want me to send the details?"
    )


def rewrite_email_text(
    original_text: str,
    detected_issues: List[str] | None = None,
    intent_type: str = "cold outreach",
    rewrite_style: str = "balanced",
    aggressive: bool = False,
) -> str:
    text = (original_text or "").strip()
    if not text:
        return ""

    style = _infer_rewrite_style(rewrite_style, aggressive)
    _, max_words = _target_word_bounds(style)

    parsed = _extract_subject_and_body(text)
    subject = parsed["subject"]
    body = parsed["body"]

    # Detect if this is broadcast-style (the biggest flag for needed transformation)
    issue_blob = " ".join(detected_issues or []).lower()
    is_broadcast = "broadcast" in issue_blob or "personalization" in issue_blob or "mass" in issue_blob
    normalized_intent = (intent_type or "").strip().lower()

    # COLD OUTREACH / BROADCAST EMAILS: hard split by style.
    if is_broadcast or "cold" in normalized_intent or "outreach" in normalized_intent:
        if style == "safe":
            text = _compose_cold_outreach_rewrite(original_text, "safe")
        elif style == "aggressive":
            text = _compose_cold_outreach_rewrite(original_text, "aggressive")
        else:
            text = _compose_cold_outreach_rewrite(original_text, "balanced")

    # TRANSACTIONAL / POLICY UPDATES: hard split by style.
    elif normalized_intent in {"informational/system", "transactional", "update"}:
        if style == "safe":
            text = _rewrite_update_or_transactional_safe(subject, body)
        elif style == "aggressive":
            text = _rewrite_update_or_transactional_aggressive(subject, body)
        else:
            text = _rewrite_update_or_transactional_balanced(subject, body)

    # EVERYTHING ELSE: Add conversational question hook
    else:
        # Ensure we have a question to hook the reader
        text = _ensure_question_hook(text, "high" if style == "aggressive" else "medium")

    # Final cleanup
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()

    words = text.split()
    if len(words) > max_words:
        kept = " ".join(words[:max_words]).strip()
        if not kept.endswith((".", "?", "!")):
            last_sentence_end = max(kept.rfind("."), kept.rfind("?"), kept.rfind("!"))
            if last_sentence_end > 0:
                kept = kept[: last_sentence_end + 1]
            else:
                kept += "."
        text = kept

    # Guarantee minimum personalization
    if "{{first_name}}" not in text.lower():
        text = f"Hey {{{{first_name}}}},\n\n{text}" if text else "Hey {{{{first_name}}}},"

    return text.strip()
