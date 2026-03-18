from typing import Dict
import re

import dns.exception
import dns.resolver

from scorer import score_risk
from utils import (
    count_links,
    email_body_without_headers,
    find_aggressive_tone_terms,
    find_spam_terms,
    has_excessive_caps,
    normalize_domain,
    word_count,
)


def _has_txt_record(domain: str, marker: str) -> bool:
    try:
        answers = dns.resolver.resolve(domain, "TXT")
        for answer in answers:
            text = "".join(part.decode("utf-8") if isinstance(part, bytes) else str(part) for part in answer.strings)
            if marker.lower() in text.lower():
                return True
        return False
    except (dns.exception.DNSException, Exception):
        return False


def _check_spf(domain: str) -> bool:
    return _has_txt_record(domain, "v=spf1")


def _check_dkim(domain: str) -> bool:
    # Common selector fallback for lightweight checks.
    return _has_txt_record(f"default._domainkey.{domain}", "v=DKIM1")


def _check_dmarc(domain: str) -> bool:
    return _has_txt_record(f"_dmarc.{domain}", "v=DMARC1")


def _extract_from_domain(raw_email: str) -> str:
    match = re.search(r"^\s*From:\s*(?:.*<)?([A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,}))>?", raw_email, flags=re.IGNORECASE | re.MULTILINE)
    if not match:
        return ""
    return normalize_domain(match.group(2))


def _check_header_mismatch(raw_email: str, expected_domain: str) -> Dict[str, str | bool]:
    from_domain = _extract_from_domain(raw_email)
    if not from_domain:
        return {
            "from_domain": "",
            "spf_aligned": False,
            "header_mismatch": True,
            "header_note": "No From header found to verify SPF alignment",
        }

    aligned = from_domain == expected_domain or from_domain.endswith(f".{expected_domain}")
    return {
        "from_domain": from_domain,
        "spf_aligned": aligned,
        "header_mismatch": not aligned,
        "header_note": "From header aligned with domain" if aligned else "From header domain mismatch with entered domain",
    }


def _is_short_generic_email(raw_email: str) -> bool:
    body = email_body_without_headers(raw_email).lower()
    body_words = word_count(body)
    generic_markers = ("quick question", "interested?", "meeting request", "can we chat", "are you open")
    has_generic_marker = any(marker in body for marker in generic_markers)
    return body_words <= 35 and has_generic_marker


def analyze_email(email: str, domain: str) -> Dict:
    clean_domain = normalize_domain(domain)
    header_alignment = _check_header_mismatch(email, clean_domain)
    aggressive_tone_terms = find_aggressive_tone_terms(email)

    too_many_links = count_links(email) > 3
    short_generic_email = _is_short_generic_email(email)
    sending_pattern_risk = too_many_links or bool(aggressive_tone_terms) or short_generic_email

    signals = {
        "spf": _check_spf(clean_domain),
        "dkim": _check_dkim(clean_domain),
        "dmarc": _check_dmarc(clean_domain),
        "from_domain": header_alignment["from_domain"],
        "spf_aligned": header_alignment["spf_aligned"],
        "header_mismatch": header_alignment["header_mismatch"],
        "header_note": header_alignment["header_note"],
        "spam_terms": find_spam_terms(email),
        "too_many_links": too_many_links,
        "excessive_caps": has_excessive_caps(email),
        "aggressive_tone_terms": aggressive_tone_terms,
        "short_generic_email": short_generic_email,
        "sending_pattern_risk": sending_pattern_risk,
    }

    scored = score_risk(signals)

    return {
        "domain": clean_domain,
        "signals": signals,
        "summary": {
            "score": scored["score"],
            "risk_band": scored["risk_band"],
            "risk_points": scored["risk_points"],
        },
        "partial_findings": scored["findings"][:3],
        "full_findings": scored["findings"],
    }
