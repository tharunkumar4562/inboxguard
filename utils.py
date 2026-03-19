import re
from typing import Dict, List
from urllib.parse import urlparse

SPAM_TERMS = {
    "guaranteed",
    "urgent",
    "act now",
    "winner",
    "limited time",
    "risk free",
    "buy now",
    "click now",
    "quick question",
    "interested?",
    "meeting request",
}

AGGRESSIVE_TONE_TERMS = {
    "last chance",
    "reply today",
    "asap",
    "following up again",
    "just bumping this",
    "urgent reply",
    "click here",
    "click now",
    "act now",
    "verify now",
    "immediately",
    "right now",
}

CONFIDENCE_KILLERS = {
    "just following up",
    "quick question",
    "hope you're doing well",
    "hope you are doing well",
    "checking in",
    "bumping this",
}

PERSONALIZATION_MARKERS = {
    "{{first_name}}",
    "{{company}}",
    "noticed your",
    "saw your",
    "about your",
}

TRANSACTIONAL_MARKERS = {
    "receipt",
    "invoice",
    "order",
    "verification",
    "verify",
    "otp",
    "password reset",
    "security alert",
    "login attempt",
}

MARKETING_MARKERS = {
    "unsubscribe",
    "manage preferences",
    "view in browser",
    "newsletter",
    "new feature",
    "limited time",
    "offer",
    "promotion",
    "discount",
}

COLD_OUTREACH_MARKERS = {
    "quick question",
    "are you open",
    "would you be open",
    "just following up",
    "can i share",
    "can we chat",
    "book a quick call",
}

INFORMATIONAL_MARKERS = {
    "please note",
    "deadline",
    "assessment",
    "all the best",
    "regards",
    "please ignore this message",
    "in case of any issues",
}


def normalize_domain(domain: str) -> str:
    value = domain.strip().lower()
    return value.replace("https://", "").replace("http://", "").split("/")[0]


def count_links(text: str) -> int:
    return len(re.findall(r"https?://|www\\.", text, flags=re.IGNORECASE))


def has_excessive_caps(text: str, threshold: float = 0.35) -> bool:
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return False
    caps = [ch for ch in letters if ch.isupper()]
    return (len(caps) / len(letters)) > threshold


def find_spam_terms(text: str) -> List[str]:
    content = text.lower()
    return sorted([term for term in SPAM_TERMS if term in content])


def find_aggressive_tone_terms(text: str) -> List[str]:
    content = text.lower()
    return sorted([term for term in AGGRESSIVE_TONE_TERMS if term in content])


def email_body_without_headers(text: str) -> str:
    lines = text.splitlines()
    body_lines = [line for line in lines if not re.match(r"^\s*(from|to|subject):", line, flags=re.IGNORECASE)]
    return "\n".join(body_lines).strip()


def extract_from_email_address(text: str) -> str:
    match = re.search(
        r"^\s*From:\s*(?:.*<)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?",
        text,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    if not match:
        return ""
    return match.group(1).strip().lower()


def is_no_reply_sender(text: str) -> bool:
    from_address = extract_from_email_address(text)
    if not from_address:
        return False
    local_part = from_address.split("@", 1)[0]
    return local_part in {"noreply", "no-reply", "do-not-reply", "donotreply"}


def detect_email_type(text: str) -> Dict[str, str]:
    content = text.lower()
    transactional_hits = sum(1 for marker in TRANSACTIONAL_MARKERS if marker in content)
    marketing_hits = sum(1 for marker in MARKETING_MARKERS if marker in content)
    cold_hits = sum(1 for marker in COLD_OUTREACH_MARKERS if marker in content)
    informational_hits = sum(1 for marker in INFORMATIONAL_MARKERS if marker in content)
    no_reply = is_no_reply_sender(text)

    if transactional_hits >= 2 or (transactional_hits >= 1 and no_reply):
        return {
            "type": "transactional",
            "reason": "Transactional delivery pattern detected from system-notification markers.",
        }

    if marketing_hits >= 2 or (marketing_hits >= 1 and no_reply):
        return {
            "type": "marketing/newsletter",
            "reason": "Marketing/newsletter pattern detected from broadcast markers.",
        }

    if cold_hits >= 1:
        return {
            "type": "cold outreach",
            "reason": "Cold outreach pattern detected from opener and CTA language.",
        }

    if informational_hits >= 1:
        return {
            "type": "informational/system",
            "reason": "Informational notice pattern detected with announcement-style language.",
        }

    return {
        "type": "informational/system",
        "reason": "Pattern is mixed or unclear; using neutral informational profile to avoid false spam penalties.",
    }


def word_count(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


def first_non_empty_line(text: str) -> str:
    for line in text.splitlines():
        clean = line.strip()
        if clean:
            return clean
    return ""


def classify_opener(text: str) -> Dict[str, str]:
    opener = first_non_empty_line(email_body_without_headers(text)).lower()
    if not opener:
        return {"type": "missing", "reason": "No opener detected"}

    if any(token in opener for token in ("quick question", "following up", "hope you're doing well", "meeting request")):
        return {"type": "pattern-based", "reason": "Saturated opener pattern used across outreach tools"}

    if any(marker in opener for marker in PERSONALIZATION_MARKERS):
        return {"type": "personalized", "reason": "Opener references recipient context"}

    if word_count(opener) <= 8:
        return {"type": "generic", "reason": "Short generic opener with low specificity"}

    return {"type": "neutral", "reason": "Opener is present but not strongly personalized"}


def classify_intent_clarity(text: str) -> Dict[str, str]:
    body = email_body_without_headers(text).lower()
    cta_markers = ("are you open", "would you be open", "can we", "let me know", "reply", "book", "schedule")
    has_cta = any(marker in body for marker in cta_markers) or "?" in body

    if not has_cta:
        return {"type": "no-cta", "reason": "Message has no clear next-step ask"}

    vague_markers = ("thought i would reach out", "wanted to connect", "just checking", "touching base")
    if any(marker in body for marker in vague_markers):
        return {"type": "vague", "reason": "Intent is present but phrased vaguely"}

    return {"type": "clear", "reason": "Message includes a direct and actionable ask"}


def detect_tracking_style_links(text: str) -> bool:
    tracking_patterns = (
        r"utm_",
        r"[?&](trk|tracking|ref|source)=",
        r"click\.",
        r"redirect",
    )
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in tracking_patterns)


def detect_confidence_killers(text: str) -> List[str]:
    content = text.lower()
    return sorted([term for term in CONFIDENCE_KILLERS if term in content])


def automation_signal_score(text: str) -> Dict[str, object]:
    body = email_body_without_headers(text).lower()
    repeated_phrase_hits = 0
    for phrase in ("quick question", "just following up", "checking in", "can i share"):
        if body.count(phrase) >= 1:
            repeated_phrase_hits += 1

    template_markers = re.findall(r"\{\{[^}]+\}\}", text)
    score = repeated_phrase_hits + (1 if len(template_markers) >= 1 else 0)

    if score >= 3:
        level = "high"
    elif score >= 1:
        level = "medium"
    else:
        level = "low"

    return {
        "level": level,
        "score": score,
        "template_markers": template_markers,
        "repeated_phrase_hits": repeated_phrase_hits,
    }


def extract_subject_from_raw(text: str) -> str:
    match = re.search(r"^\s*Subject:\s*(.+)$", text, flags=re.IGNORECASE | re.MULTILINE)
    if match:
        return match.group(1).strip()

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return ""

    if len(lines) > 1 and re.match(r"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$", lines[0], flags=re.IGNORECASE):
        return lines[1][:120].strip()

    for line in lines:
        if re.match(r"^(from|to|cc|bcc|date):", line, flags=re.IGNORECASE):
            continue
        if re.match(r"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$", line, flags=re.IGNORECASE):
            continue
        if line.lower().startswith(("http://", "https://")):
            continue
        return line[:120].strip()

    return ""


def extract_domain_from_text(text: str) -> str:
    from_match = re.search(r"^\s*From:\s*(?:.*<)?[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})>?", text, flags=re.IGNORECASE | re.MULTILINE)
    if from_match:
        return normalize_domain(from_match.group(1))

    link_match = re.search(r"https?://[^\s)>'\"]+", text, flags=re.IGNORECASE)
    if link_match:
        host = urlparse(link_match.group(0)).hostname or ""
        if host:
            return normalize_domain(host)

    return ""


def build_email_from_raw(raw_text: str, fallback_email: str = "") -> str:
    raw = raw_text.strip()
    if not raw:
        return fallback_email.strip()

    subject = extract_subject_from_raw(raw)
    body = email_body_without_headers(raw)
    if not body:
        body = raw

    if subject:
        return f"Subject: {subject}\n\n{body}".strip()
    return body.strip()
