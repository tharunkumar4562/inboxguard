from typing import Dict, List
import re

import dns.exception
import dns.resolver

from scorer import score_risk
from utils import (
    automation_signal_score,
    count_links,
    detect_cta_phrases,
    detect_email_type,
    detect_confidence_killers,
    detect_tracking_style_links,
    domain_candidates,
    email_body_without_headers,
    extract_domain_from_text,
    extract_subject_from_raw,
    find_aggressive_tone_terms,
    find_spam_terms,
    has_excessive_caps,
    classify_intent_clarity,
    classify_opener,
    is_no_reply_sender,
    normalize_domain,
    word_count,
)


def _txt_record_status(domain: str, marker: str) -> str:
    """Return one of: found | missing | unknown."""
    try:
        answers = dns.resolver.resolve(domain, "TXT")
        found = False
        for answer in answers:
            text = "".join(part.decode("utf-8") if isinstance(part, bytes) else str(part) for part in answer.strings)
            if marker.lower() in text.lower():
                found = True
                break
        return "found" if found else "missing"
    except dns.resolver.NXDOMAIN:
        return "missing"
    except dns.resolver.NoAnswer:
        return "missing"
    except dns.resolver.NoNameservers:
        return "unknown"
    except dns.exception.Timeout:
        return "unknown"
    except (dns.exception.DNSException, Exception):
        return "unknown"


def _check_spf(domain: str) -> Dict[str, str]:
    for candidate in domain_candidates(domain):
        status = _txt_record_status(candidate, "v=spf1")
        if status == "found":
            return {"status": "found", "domain": candidate}
        if status == "unknown":
            return {"status": "unknown", "domain": candidate}
    return {"status": "missing", "domain": normalize_domain(domain)}


def _check_dkim(domain: str) -> Dict[str, str]:
    # Common selector fallback for lightweight checks.
    for candidate in domain_candidates(domain):
        status = _txt_record_status(f"default._domainkey.{candidate}", "v=DKIM1")
        if status == "found":
            return {"status": "found", "domain": candidate}
        if status == "unknown":
            return {"status": "unknown", "domain": candidate}
    return {"status": "missing", "domain": normalize_domain(domain)}


def _check_dmarc(domain: str) -> Dict[str, str]:
    for candidate in domain_candidates(domain):
        status = _txt_record_status(f"_dmarc.{candidate}", "v=DMARC1")
        if status == "found":
            return {"status": "found", "domain": candidate}
        if status == "unknown":
            return {"status": "unknown", "domain": candidate}
    return {"status": "missing", "domain": normalize_domain(domain)}


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
    had_unknown = False
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
            had_unknown = True
    
    return {
        "blacklisted": len(blacklist_hits) > 0,
        "lists": blacklist_hits,
        "status": "on_blacklist" if blacklist_hits else ("unknown" if had_unknown else "clean")
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
            "spf_aligned": True,
            "header_mismatch": False,
            "header_note": "No From header found, so SPF alignment was not evaluated",
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


def _normalized_input(email: str, domain: str, raw_email: str) -> Dict[str, str]:
    source_text = raw_email.strip() or email
    subject = extract_subject_from_raw(source_text)
    body = email_body_without_headers(source_text) or source_text

    parsed_domain = normalize_domain(domain)
    if not parsed_domain:
        parsed_domain = normalize_domain(_extract_from_domain(source_text) or "")
    if not parsed_domain:
        parsed_domain = normalize_domain(extract_domain_from_text(source_text) or "")
    if not parsed_domain:
        parsed_domain = normalize_domain(domain)

    normalized_email = f"Subject: {subject}\n\n{body}" if subject else body
    return {
        "subject": subject,
        "body": body,
        "domain": parsed_domain,
        "email": normalized_email,
        "source": source_text,
    }


def analyze_email(email: str, domain: str, raw_email: str = "", analysis_mode: str = "content") -> Dict:
    normalized = _normalized_input(email, domain, raw_email)
    clean_domain = normalized["domain"]
    source_text = normalized["source"]
    normalized_email = normalized["email"]
    mode = (analysis_mode or "content").strip().lower()
    if mode not in ("content", "full"):
        mode = "content"

    full_mode = mode == "full"
    has_header_evidence = _has_header_evidence(source_text)
    auth_verifiable = bool(full_mode and clean_domain)

    if full_mode and clean_domain:
        if has_header_evidence:
            header_alignment = _check_header_mismatch(source_text, clean_domain)
        else:
            header_alignment = {
                "from_domain": "",
                "spf_aligned": True,
                "header_mismatch": False,
                "header_note": "From/SPF alignment not checked because full headers were not provided",
            }
        spf_result = _check_spf(clean_domain)
        dkim_result = _check_dkim(clean_domain)
        dmarc_result = _check_dmarc(clean_domain)
        blacklist_status = _check_blacklist_status(clean_domain)
    else:
        header_alignment = {
            "from_domain": "",
            "spf_aligned": False,
            "header_mismatch": False,
            "header_note": "Authentication checks not verified because full headers were not provided",
        }
        spf_result = {"status": "not_checked", "domain": ""}
        dkim_result = {"status": "not_checked", "domain": ""}
        dmarc_result = {"status": "not_checked", "domain": ""}
        blacklist_status = {"blacklisted": False, "lists": [], "status": "unknown"}

    aggressive_tone_terms = find_aggressive_tone_terms(normalized_email)

    link_count = count_links(normalized_email)
    too_many_links = link_count > 3
    tracking_style_links = detect_tracking_style_links(normalized_email)
    short_generic_email = _is_short_generic_email(normalized_email)
    opener_profile = classify_opener(normalized_email)
    intent_profile = classify_intent_clarity(normalized_email)
    confidence_killers = detect_confidence_killers(normalized_email)
    automation_profile = automation_signal_score(normalized_email)
    email_type_profile = detect_email_type(normalized_email)
    cta_phrases = detect_cta_phrases(normalized_email)

    sending_pattern_risk = too_many_links or bool(aggressive_tone_terms) or short_generic_email

    signals = {
        "analysis_mode": mode,
        "auth_verifiable": auth_verifiable,
        "analysis_confidence": "high" if full_mode and clean_domain else "medium",
        "spf": spf_result.get("status") == "found",
        "dkim": dkim_result.get("status") == "found",
        "dmarc": dmarc_result.get("status") == "found",
        "spf_status": spf_result.get("status", "unknown"),
        "dkim_status": dkim_result.get("status", "unknown"),
        "dmarc_status": dmarc_result.get("status", "unknown"),
        "spf_checked_domain": spf_result.get("domain", clean_domain),
        "dkim_checked_domain": dkim_result.get("domain", clean_domain),
        "dmarc_checked_domain": dmarc_result.get("domain", clean_domain),
        "blacklist_status": blacklist_status,
        "from_domain": header_alignment["from_domain"],
        "spf_aligned": header_alignment["spf_aligned"],
        "header_mismatch": header_alignment["header_mismatch"],
        "header_note": header_alignment["header_note"],
        "spam_terms": find_spam_terms(normalized_email),
        "link_count": link_count,
        "too_many_links": too_many_links,
        "cta_phrases": cta_phrases,
        "tracking_style_links": tracking_style_links,
        "excessive_caps": has_excessive_caps(normalized_email),
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
        "is_no_reply_sender": is_no_reply_sender(normalized_email),
    }

    scored = score_risk(signals)

    return {
        "domain": clean_domain,
        "signals": signals,
        "summary": {
            "score": scored["score"],
            "risk_band": scored["risk_band"],
            "risk_pill_style": scored.get("risk_pill_style", "high"),
            "analysis_mode": scored.get("analysis_mode", mode),
            "analysis_mode_label": scored.get("analysis_mode_label", "Content Only"),
            "analysis_mode_note": scored.get("analysis_mode_note", "Based on content signals only."),
            "capability_note": scored.get(
                "capability_note",
                "Based on content and optional domain checks only. No real inbox placement testing is performed.",
            ),
            "inbox_chance": scored.get("inbox_chance", 50),
            "spam_risk": scored.get("spam_risk", 50),
            "email_type": scored.get("email_type", "email"),
            "email_type_confidence": scored.get("email_type_confidence", 72),
            "content_score": scored.get("content_score", scored["score"]),
            "infra_impact": scored.get("infra_impact", 0),
            "final_score": scored.get("final_score", scored["score"]),
            "detected_signals": scored.get("detected_signals", []),
            "risk_points": scored["risk_points"],
            "breakdown": scored["breakdown"],
        },
        "partial_findings": scored["findings"][:3],
        "full_findings": scored["findings"],
    }
