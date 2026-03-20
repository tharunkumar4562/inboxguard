from typing import Dict, List
import re

import dns.exception
import dns.resolver

from scorer import score_risk
from utils import (
    automation_signal_score,
    count_links,
    detect_email_type,
    detect_confidence_killers,
    detect_tracking_style_links,
    email_body_without_headers,
    find_aggressive_tone_terms,
    find_spam_terms,
    has_excessive_caps,
    classify_intent_clarity,
    classify_opener,
    is_no_reply_sender,
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


def _check_blacklist_status(domain: str) -> Dict:
    """Check if domain is on major blacklists (DNSBL)."""
    if not domain:
        return {"blacklisted": False, "lists": [], "status": "unknown"}
    
    # Public DNSBL providers - these are free and reliable
    dnsbl_providers = [
        "zen.spamhaus.org",      # Spamhaus (most reliable)
        "dnsbl.sorbs.net",        # SORBS
    ]
    
    blacklist_hits = []
    domain_parts = domain.split(".")
    
    # Query each DNSBL
    for dnsbl in dnsbl_providers:
        try:
            # Reverse domain octets for DNSBL query
            reversed_domain = ".".join(reversed(domain_parts))
            query_domain = f"{reversed_domain}.{dnsbl}"
            
            answers = dns.resolver.resolve(query_domain, "A", lifetime=2.0)
            if answers:
                blacklist_hits.append(dnsbl.split(".")[0].upper())  # Extract provider name
        except (dns.exception.DNSException, Exception):
            # Not listed on this DNSBL
            pass
    
    return {
        "blacklisted": len(blacklist_hits) > 0,
        "lists": blacklist_hits,
        "status": "on_blacklist" if blacklist_hits else "clean"
    }


def _has_header_evidence(raw_email: str) -> bool:
    if not raw_email:
        return False
    return bool(
        re.search(
            r"^\s*(from|to|subject|date|return-path|authentication-results|dkim-signature|received):",
            raw_email,
            flags=re.IGNORECASE | re.MULTILINE,
        )
    )


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


def analyze_email(email: str, domain: str, raw_email: str = "") -> Dict:
    clean_domain = normalize_domain(domain)
    source_text = raw_email.strip() or email
    has_header_evidence = _has_header_evidence(source_text)
    auth_verifiable = bool(clean_domain and has_header_evidence)

    if auth_verifiable:
        header_alignment = _check_header_mismatch(source_text, clean_domain)
        spf = _check_spf(clean_domain)
        dkim = _check_dkim(clean_domain)
        dmarc = _check_dmarc(clean_domain)
        blacklist_status = _check_blacklist_status(clean_domain)
    else:
        header_alignment = {
            "from_domain": "",
            "spf_aligned": False,
            "header_mismatch": False,
            "header_note": "Authentication checks not verified because full headers were not provided",
        }
        spf = False
        dkim = False
        dmarc = False
        blacklist_status = {"blacklisted": False, "lists": [], "status": "unknown"}

    aggressive_tone_terms = find_aggressive_tone_terms(email)

    link_count = count_links(email)
    too_many_links = link_count > 3
    tracking_style_links = detect_tracking_style_links(email)
    short_generic_email = _is_short_generic_email(email)
    opener_profile = classify_opener(email)
    intent_profile = classify_intent_clarity(email)
    confidence_killers = detect_confidence_killers(email)
    automation_profile = automation_signal_score(email)
    email_type_profile = detect_email_type(email)

    sending_pattern_risk = too_many_links or bool(aggressive_tone_terms) or short_generic_email

    signals = {
        "auth_verifiable": auth_verifiable,
        "analysis_confidence": "high" if auth_verifiable else "medium",
        "spf": spf,
        "dkim": dkim,
        "dmarc": dmarc,
        "blacklist_status": blacklist_status,
        "from_domain": header_alignment["from_domain"],
        "spf_aligned": header_alignment["spf_aligned"],
        "header_mismatch": header_alignment["header_mismatch"],
        "header_note": header_alignment["header_note"],
        "spam_terms": find_spam_terms(email),
        "link_count": link_count,
        "too_many_links": too_many_links,
        "tracking_style_links": tracking_style_links,
        "excessive_caps": has_excessive_caps(email),
        "aggressive_tone_terms": aggressive_tone_terms,
        "short_generic_email": short_generic_email,
        "sending_pattern_risk": sending_pattern_risk,
        "opener_type": opener_profile["type"],
        "opener_reason": opener_profile["reason"],
        "intent_type": intent_profile["type"],
        "intent_reason": intent_profile["reason"],
        "confidence_killers": confidence_killers,
        "automation_level": automation_profile["level"],
        "automation_score": automation_profile["score"],
        "template_markers": automation_profile["template_markers"],
        "email_type": email_type_profile["type"],
        "email_type_reason": email_type_profile["reason"],
        "is_no_reply_sender": is_no_reply_sender(email),
    }

    scored = score_risk(signals)

    return {
        "domain": clean_domain,
        "signals": signals,
        "summary": {
            "score": scored["score"],
            "risk_band": scored["risk_band"],
            "risk_points": scored["risk_points"],
            "breakdown": scored["breakdown"],
        },
        "partial_findings": scored["findings"][:3],
        "full_findings": scored["findings"],
    }
