import json
import re
import os
import threading
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("INBOXGUARD_DATA_DIR", str(BASE_DIR / "data"))).expanduser()
FEEDBACK_FILE = DATA_DIR / "rewrite_feedback.json"
MODEL_FILE = DATA_DIR / "rewrite_model.json"
_LOCK = threading.Lock()

SPAM_LINE_PATTERNS = [
    r"\blast\s+chance\b",
    r"\bonly\s+\d+\s*(day|days|hour|hours|left)\b",
    r"\bregister\s+now\b",
    r"\bapply\s+now\b",
    r"\blimited\s+time\b",
    r"\burgent\b",
    r"\bact\s+now\b",
]

BLOCKED_REWRITE_PHRASES = [
    "apply now",
    "limited time",
    "click here",
]


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

    # Preserve line structure for safer intent extraction and de-duplication.
    body_lines = [line.rstrip() for line in body.splitlines()]

    # Infer subject when users paste plain text without explicit "Subject:" prefix.
    if not subject:
        non_empty = [line.strip() for line in body_lines if line.strip()]
        if len(non_empty) >= 2:
            first_line = non_empty[0]
            second_line = non_empty[1].lower()
            looks_like_subject = (
                len(first_line.split()) >= 3
                and len(first_line) <= 95
                and not bool(re.match(r"^(hi|hello|dear|hey)\b", first_line.lower()))
            )
            second_is_greeting = bool(re.match(r"^(hi|hello|dear|hey)\b", second_line))
            if looks_like_subject and second_is_greeting:
                subject = first_line
                removed = False
                filtered_lines = []
                for line in body_lines:
                    if not removed and line.strip() == first_line:
                        removed = True
                        continue
                    filtered_lines.append(line)
                body_lines = filtered_lines

    body = "\n".join(body_lines).strip()
    return {"subject": subject, "body": body}


def _sanitize_subject_line(subject: str) -> str:
    clean = _normalize_line(subject)
    if not clean:
        return ""
    clean = re.sub(r"(?i)\blast\s+chance\b", "", clean)
    clean = re.sub(r"(?i)\b(register|apply)\s+now\b", "", clean)
    clean = re.sub(r"(?i)\bonly\s+\d+\s*(day|days|hour|hours|left)\b", "", clean)
    clean = re.sub(r"\s{2,}", " ", clean).strip(" -:,")
    if len(clean) > 90:
        clean = clean[:90].rsplit(" ", 1)[0].strip()
    return clean


def _normalize_line(line: str) -> str:
    return re.sub(r"\s+", " ", (line or "").strip())


def _line_is_spammy(line: str) -> bool:
    low = _normalize_line(line).lower()
    return any(re.search(pattern, low) for pattern in SPAM_LINE_PATTERNS)


def _extract_body_lines(text: str) -> list[str]:
    cleaned: list[str] = []
    for raw in (text or "").splitlines():
        line = _normalize_line(re.sub(r"^[\-\*\u2022\u27a1\u25aa\s]+", "", raw))
        if not line:
            continue
        cleaned.append(line)
    return cleaned


def _dedupe_lines(lines: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for line in lines:
        key = re.sub(r"[^a-z0-9]+", "", line.lower())
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(line)
    return out


def _strip_spam_lines(lines: list[str]) -> list[str]:
    kept = [line for line in lines if not _line_is_spammy(line)]
    return kept if kept else lines


def _extract_offer_anchor(subject: str, body_lines: list[str], fallback_context: str) -> str:
    source = " ".join([subject] + body_lines)
    iim_match = re.search(r"\b(IIM\s+[A-Za-z]+)\b", source, flags=re.IGNORECASE)
    if iim_match:
        return f"the {iim_match.group(1)} program"

    if any(token in source.lower() for token in ["loan", "funding", "education"]):
        return "education funding options"
    if any(token in source.lower() for token in ["internship", "hackathon", "students"]):
        return "student opportunities"
    return fallback_context


def _extract_required_entities(subject: str, body: str) -> list[str]:
    source = f"{subject}\n{body}".strip()
    if not source:
        return []

    required: list[str] = []

    iim_phrase = re.search(r"\bIIM\s+[A-Za-z]+\b", source, flags=re.IGNORECASE)
    if iim_phrase:
        required.append(iim_phrase.group(0))

    for acronym in re.findall(r"\b[A-Z]{2,6}\b", source):
        if acronym.lower() in {"hi", "hey", "dear"}:
            continue
        required.append(acronym)

    lower = source.lower()
    intent_terms = ["summer", "program", "ai", "funding", "loan", "internship", "hackathon", "student"]
    for term in intent_terms:
        if re.search(rf"\b{re.escape(term)}\b", lower):
            required.append(term)

    deduped: list[str] = []
    seen: set[str] = set()
    for item in required:
        key = item.lower().strip()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped[:6]


def _entity_coverage(required_entities: list[str], rewritten_text: str) -> tuple[int, int]:
    if not required_entities:
        return (0, 0)
    low = (rewritten_text or "").lower()
    matched = 0
    for entity in required_entities:
        token = entity.lower().strip()
        if not token:
            continue
        if " " in token:
            if token in low:
                matched += 1
            continue
        if re.search(rf"\b{re.escape(token)}\b", low):
            matched += 1
    return (matched, len(required_entities))


def _value_lines_for_rewrite(lines: list[str], max_lines: int = 2) -> list[str]:
    picked: list[str] = []
    for line in lines:
        low = line.lower()
        if any(token in low for token in ["regards", "team", "thanks", "thank you"]):
            continue
        if any(token in low for token in ["http", "www", "@", "link"]):
            continue
        if len(line.split()) < 5:
            continue
        picked.append(line)
        if len(picked) >= max_lines:
            break
    return picked


def _abstract_value_line(line: str) -> str:
    low = (line or "").lower()
    if any(token in low for token in ["ai", "project", "build", "hands-on"]):
        return "It includes practical AI-focused work and guided learning."
    if any(token in low for token in ["summer", "program", "residential", "certification"]):
        return "It is a short, focused program with practical learning outcomes."
    if any(token in low for token in ["sponsored", "covered", "fund", "expense", "cost"]):
        return "It is structured to reduce cost barriers for relevant students."
    if any(token in low for token in ["student", "internship", "hackathon", "opportunit"]):
        return "It may be relevant for students exploring near-term opportunities."
    return "It offers a focused opportunity that may be relevant."


def _ngram_overlap_ratio(a: str, b: str, n: int = 3) -> float:
    def grams(text: str) -> set[str]:
        words = re.findall(r"[a-z0-9]+", (text or "").lower())
        if len(words) < n:
            return set(words)
        return {" ".join(words[i : i + n]) for i in range(0, len(words) - n + 1)}

    a_grams = grams(a)
    b_grams = grams(b)
    if not a_grams or not b_grams:
        return 0.0
    return len(a_grams.intersection(b_grams)) / max(len(b_grams), 1)


def _sanitize_rewrite_text(text: str) -> str:
    output = (text or "").replace("—", ", ")
    output = re.sub(r"\s+,", ",", output)
    output = re.sub(r"\n{3,}", "\n\n", output)
    output = "\n".join(_dedupe_lines([line for line in output.splitlines()]))
    return output.strip()


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

    core_low = core.lower()
    is_list_like = core.count(",") >= 3 or "&" in core or core.count("|") >= 2
    if is_list_like or any(token in core_low for token in ["cash prize", "apply now", "limited time", "live right now"]):
        if any(token in core_low for token in ["student", "internship", "hackathon", "education", "funding"]):
            return "We found a few student-focused opportunities that may be relevant."
        return "We found a few relevant opportunities worth sharing."
    
    return core if core else "We've built something worth checking out."


def _infer_rewrite_style(rewrite_style: str, aggressive: bool) -> str:
    style = (rewrite_style or "balanced").strip().lower()
    if style not in {"safe", "balanced", "aggressive"}:
        style = "aggressive" if aggressive else "balanced"
    return style


def _target_word_bounds(style: str) -> tuple[int, int]:
    if style == "safe":
        return (80, 120)
    if style == "aggressive":
        return (25, 50)
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
            selected = _first_meaningful_sentence(line)
            break
    else:
        selected = ""

    # Fall back to the first non-greeting sentence.
    if not selected:
        for line in candidates:
            low = line.lower()
            if not any(low.startswith(prefix) for prefix in ["hi", "hello", "dear", "hey", "regards", "best"]):
                selected = _first_meaningful_sentence(line)
                break
    if not selected:
        selected = _first_meaningful_sentence(candidates[0])

    # Condense list-like/promotional statements to avoid repeating broadcast dumps.
    selected_low = selected.lower()
    is_list_like = selected.count(",") >= 3 or "&" in selected or selected.count("|") >= 2
    if is_list_like or any(token in selected_low for token in ["cash prize", "apply now", "limited", "live right now"]):
        if any(token in selected_low for token in ["student", "internship", "hackathon", "education", "funding"]):
            return "We found a few student-focused opportunities that look relevant."
        return "We identified a few relevant opportunities worth sharing."

    return selected


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
    parsed = _extract_subject_and_body(original_text)
    raw_body_lines = _extract_body_lines(parsed["body"])
    body_lines = _dedupe_lines(_strip_spam_lines(raw_body_lines))
    context = _derive_context_hint(original_text)
    anchor = _extract_offer_anchor(parsed["subject"], raw_body_lines, context)
    value_lines = _value_lines_for_rewrite(body_lines, max_lines=2)

    if style == "safe":
        payload = value_lines[:2] or [f"We found a few updates around {anchor} that may be relevant."]
        lines = [
            "Hey {{first_name}},",
            "",
            f"Sharing a quick update on {anchor}.",
            *payload,
            "",
            "If helpful, I can share more details.",
        ]
    elif style == "aggressive":
        lines = [
            "Hey {{first_name}},",
            "",
            f"Are you currently exploring {anchor}?",
            f"If yes, I can share 1-2 options that may fit.",
        ]
    else:
        summary = value_lines[0] if value_lines else f"We found a few options around {anchor} that may be relevant."
        lines = [
            "Hey {{first_name}},",
            "",
            f"Sharing this because {anchor} may be relevant for you.",
            summary,
            "",
            "Happy to share details if useful.",
        ]

    return _sanitize_rewrite_text("\n".join(lines))


def _rewrite_update_or_transactional_safe(subject: str, body: str) -> str:
    raw_lines = _extract_body_lines(body)
    lines = _dedupe_lines(_strip_spam_lines(raw_lines))
    anchor = _extract_offer_anchor(subject, raw_lines, "this update")
    payload = _value_lines_for_rewrite(lines, max_lines=2)
    if not payload:
        payload = [f"We found a few updates around {anchor} that may be relevant."]
    out = [
        "Hey {{first_name}},",
        "",
        f"Sharing a quick update on {anchor}.",
        *payload,
        "",
        "If helpful, I can share more details.",
    ]
    return _sanitize_rewrite_text("\n".join(out))


def _rewrite_update_or_transactional_balanced(subject: str, body: str) -> str:
    raw_lines = _extract_body_lines(body)
    lines = _dedupe_lines(_strip_spam_lines(raw_lines))
    anchor = _extract_offer_anchor(subject, raw_lines, "this opportunity")
    summary = _value_lines_for_rewrite(lines, max_lines=1)
    summary_line = _abstract_value_line(summary[0]) if summary else f"We found a few options around {anchor} that may be relevant."
    out = [
        "Hey {{first_name}},",
        "",
        f"Sharing this in case {anchor} is relevant for you.",
        summary_line,
        "",
        "Happy to share details if useful.",
    ]
    return _sanitize_rewrite_text("\n".join(out))


def _rewrite_update_or_transactional_aggressive(subject: str, body: str) -> str:
    raw_lines = _extract_body_lines(body)
    anchor = _extract_offer_anchor(subject, raw_lines, _derive_context_hint(body))
    out = [
        "Hey {{first_name}},",
        "",
        f"Are you currently exploring {anchor}?",
        "If yes, I can share one short option that may fit.",
    ]
    return _sanitize_rewrite_text("\n".join(out))


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
    required_entities = _extract_required_entities(subject, body)

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
        parsed_anchor = _extract_offer_anchor(subject, _extract_body_lines(body), _derive_context_hint(text))
        if style == "aggressive":
            text = _sanitize_rewrite_text(
                "\n".join(
                    [
                        "Hey {{first_name}},",
                        "",
                        f"Are you currently exploring {parsed_anchor}?",
                        "If yes, I can share one short option that may fit.",
                    ]
                )
            )
        elif style == "safe":
            text = _sanitize_rewrite_text(
                "\n".join(
                    [
                        "Hey {{first_name}},",
                        "",
                        f"Sharing a quick update on {parsed_anchor}.",
                        _extract_core_value(body),
                        "",
                        "If helpful, I can share more details.",
                    ]
                )
            )
        else:
            text = _sanitize_rewrite_text(
                "\n".join(
                    [
                        "Hey {{first_name}},",
                        "",
                        f"Sharing this in case {parsed_anchor} is relevant for you.",
                        _extract_core_value(body),
                        "",
                        "Happy to share details if useful.",
                    ]
                )
            )

    # Final cleanup
    text = _sanitize_rewrite_text(text)

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

    # Enforce hard constraints: no direct spam lines in rewritten output.
    cleaned_lines = _strip_spam_lines(_extract_body_lines(text))
    text = _sanitize_rewrite_text("\n".join(cleaned_lines))

    # Balanced/aggressive must not be near-copy paraphrases.
    if style in {"balanced", "aggressive"} and _ngram_overlap_ratio(original_text, text) > 0.4:
        anchor = _extract_offer_anchor(subject, _extract_body_lines(body), _derive_context_hint(text))
        if style == "aggressive":
            text = _sanitize_rewrite_text(
                f"Hey {{{{first_name}}}},\n\nAre you currently exploring {anchor}?\nIf yes, I can share one short option that may fit."
            )
        else:
            text = _sanitize_rewrite_text(
                f"Hey {{{{first_name}}}},\n\nSharing this because {anchor} may be relevant for you.\nWe found a cleaner version of this message that removes urgency and bulk signals.\n\nHappy to share details if useful."
            )

    matched_entities, total_entities = _entity_coverage(required_entities, text)
    required_floor = max(1, total_entities // 2)
    if total_entities > 0 and matched_entities < required_floor:
        anchor = _extract_offer_anchor(subject, _extract_body_lines(body), _derive_context_hint(text))
        entity_hint = required_entities[0]
        if style == "aggressive":
            text = _sanitize_rewrite_text(
                f"Hey {{{{first_name}}}},\n\nAre you currently exploring {anchor}?\nIf yes, I can share one short option that may fit {entity_hint}."
            )
        elif style == "safe":
            text = _sanitize_rewrite_text(
                f"Hey {{{{first_name}}}},\n\nSharing a quick update on {anchor}.\nThis keeps the core context around {entity_hint} while removing urgency.\n\nIf helpful, I can share more details."
            )
        else:
            text = _sanitize_rewrite_text(
                f"Hey {{{{first_name}}}},\n\nSharing this because {anchor} may be relevant for you.\nThis keeps the core context around {entity_hint} while reducing bulk-style signals.\n\nHappy to share details if useful."
            )

    final_text = text.strip()
    sanitized_subject = _sanitize_subject_line(subject)
    if sanitized_subject:
        final_text = f"Subject: {sanitized_subject}\n\n{final_text}"

    return final_text


def extract_rewrite_intent(original_text: str, intent_type: str = "") -> Dict[str, str]:
    parsed = _extract_subject_and_body(original_text or "")
    subject = parsed.get("subject", "")
    body = parsed.get("body", "")
    low = f"{subject}\n{body}".lower()

    normalized_type = (intent_type or "").strip().lower()
    if any(token in low for token in ["loan", "funding", "repayment", "study abroad"]):
        intent_label = "education loan"
    elif any(token in low for token in ["hackathon", "internship", "student"]):
        intent_label = "student outreach"
    elif any(token in low for token in ["saas", "product", "platform", "workflow"]):
        intent_label = "saas outreach"
    elif normalized_type:
        intent_label = normalized_type
    else:
        intent_label = "outreach"

    goal = "get reply"
    if re.search(r"\b(apply|register|enroll)\b", low):
        goal = "get user to apply"
    elif re.search(r"\b(book|schedule|chat|call|reply)\b", low):
        goal = "get user to reply"
    elif re.search(r"\b(click|visit|view|check out)\b", low):
        goal = "get user to click"

    value_line = _extract_core_value(body)
    value_line = _normalize_line(value_line)
    if not value_line:
        value_line = f"A relevant update related to {_derive_context_hint(original_text)}."

    return {
        "type": intent_label,
        "goal": goal,
        "value": value_line,
        "audience": _extract_audience_hint(original_text),
        "anchor": _extract_offer_anchor(subject, _extract_body_lines(body), _derive_context_hint(original_text)),
    }


def _contains_bullets(text: str) -> bool:
    return bool(re.search(r"(?m)^\s*[-*•]\s+", text or ""))


def _remove_all_bullets(text: str) -> str:
    lines = (text or "").splitlines()
    cleaned = [re.sub(r"^\s*[-*•]\s+", "", line).strip() for line in lines]
    return "\n".join([line for line in cleaned if line]).strip()


def _contains_blocked_phrase(text: str) -> bool:
    low = (text or "").lower()
    return any(phrase in low for phrase in BLOCKED_REWRITE_PHRASES)


def _strip_blocked_phrases(text: str) -> str:
    out = text or ""
    for phrase in BLOCKED_REWRITE_PHRASES:
        out = re.sub(rf"(?i)\b{re.escape(phrase)}\b", "", out)
    return _sanitize_rewrite_text(out)


def _ensure_conversational_question(text: str) -> str:
    compact = (text or "").strip()
    if not compact:
        return compact
    if "?" in compact:
        return compact

    lines = [line.strip() for line in compact.splitlines() if line.strip()]
    question = "Open to a quick chat?"
    if lines and re.match(r"^(hey|hi|hello|dear)\b", lines[0], flags=re.IGNORECASE):
        lines.append(question)
        return "\n\n".join(lines)
    return f"{compact}\n\n{question}"


def enforce_rewrite_constraints(text: str, style: str) -> Dict[str, Any]:
    cleaned = _sanitize_rewrite_text(text or "")
    if _contains_bullets(cleaned):
        cleaned = _remove_all_bullets(cleaned)

    cleaned = _strip_blocked_phrases(cleaned)
    cleaned = _ensure_conversational_question(cleaned)

    max_words = 140
    if style == "aggressive":
        max_words = 60
    elif style == "balanced":
        max_words = 90

    words = cleaned.split()
    if len(words) > max_words:
        cleaned = " ".join(words[:max_words]).strip()
        if not cleaned.endswith((".", "?", "!")):
            cleaned += "?" if style == "aggressive" else "."

    valid = True
    reasons: List[str] = []
    if _contains_blocked_phrase(cleaned):
        valid = False
        reasons.append("blocked_phrase")
    if style == "aggressive" and len(cleaned.split()) > 60:
        valid = False
        reasons.append("aggressive_word_limit")
    if "?" not in cleaned:
        valid = False
        reasons.append("missing_question")

    return {"text": cleaned, "valid": valid, "reasons": reasons}


def generate_mode_candidate(intent: Dict[str, str], style: str, original_text: str, detected_issues: List[str] | None = None, attempt: int = 1) -> str:
    # Safe mode keeps more source structure; balanced/aggressive are intent-first templates.
    if style == "safe":
        return rewrite_email_text(
            original_text,
            detected_issues=detected_issues,
            intent_type=intent.get("type", "outreach"),
            rewrite_style="safe",
        )

    if style == "balanced":
        value = intent.get("value", "Thought this might be relevant.")
        audience = intent.get("audience", "teams")
        soft_tail = "Open to a quick chat?" if attempt <= 1 else "Would it help if I shared a quick version?"
        return _sanitize_rewrite_text(
            "\n".join(
                [
                    "Hey {{first_name}},",
                    "",
                    f"Quick note for {audience}.",
                    value,
                    "Thought this might be relevant.",
                    soft_tail,
                ]
            )
        )

    question = _extract_pain_point(original_text)
    audience = intent.get("audience", "teams")
    anchor = intent.get("anchor", intent.get("type", "this area"))
    tail = "Worth a quick look?" if attempt <= 1 else "Want me to send the quick version?"
    return _sanitize_rewrite_text(
        "\n".join(
            [
                "Hey {{first_name}},",
                "",
                f"Quick question - {question}",
                f"We've been helping {audience} with {anchor} recently.",
                tail,
            ]
        )
    )


def style_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a or "", b or "").ratio()


def build_style_variants_with_guard(original_text: str, detected_issues: List[str] | None, intent_type: str) -> Dict[str, str]:
    intent = extract_rewrite_intent(original_text, intent_type=intent_type)
    variants = {
        "safe": enforce_rewrite_constraints(generate_mode_candidate(intent, "safe", original_text, detected_issues, attempt=1), "safe")["text"],
        "balanced": enforce_rewrite_constraints(generate_mode_candidate(intent, "balanced", original_text, detected_issues, attempt=1), "balanced")["text"],
        "aggressive": enforce_rewrite_constraints(generate_mode_candidate(intent, "aggressive", original_text, detected_issues, attempt=1), "aggressive")["text"],
    }

    if style_similarity(variants["safe"], variants["balanced"]) > 0.8:
        variants["balanced"] = enforce_rewrite_constraints(
            generate_mode_candidate(intent, "balanced", original_text, detected_issues, attempt=2),
            "balanced",
        )["text"]

    if style_similarity(variants["balanced"], variants["aggressive"]) > 0.6:
        variants["aggressive"] = enforce_rewrite_constraints(
            generate_mode_candidate(intent, "aggressive", original_text, detected_issues, attempt=2),
            "aggressive",
        )["text"]

    return variants
