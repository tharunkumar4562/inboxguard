import re
from typing import List

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


def word_count(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))
