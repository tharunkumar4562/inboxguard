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
    detect_list_unsubscribe_marker,
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
    # Legacy fallback only; preferred path is header-based selector checks.
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
        except dns.resolver.NXDOMAIN:
            # Expected when domain is not listed.
            pass
        except dns.resolver.NoAnswer:
            # Not listed on this DNSBL.
            pass
        except dns.exception.Timeout:
            had_unknown = True
        except dns.resolver.NoNameservers:
            had_unknown = True
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


def _extract_dkim_selector_info(raw_email: str) -> Dict[str, str]:
    signature = re.search(r"^\s*DKIM-Signature:\s*(.+)$", raw_email, flags=re.IGNORECASE | re.MULTILINE)
    if not signature:
        return {"selector": "", "domain": ""}

    payload = signature.group(1)
    selector_match = re.search(r"(?:^|;)\s*s=([^;\s]+)", payload, flags=re.IGNORECASE)
    domain_match = re.search(r"(?:^|;)\s*d=([^;\s]+)", payload, flags=re.IGNORECASE)

    selector = selector_match.group(1).strip().lower() if selector_match else ""
    dkim_domain = normalize_domain(domain_match.group(1)) if domain_match else ""
    return {"selector": selector, "domain": dkim_domain}


def _check_dkim_from_headers(raw_email: str) -> Dict[str, str]:
    details = _extract_dkim_selector_info(raw_email)
    selector = details.get("selector", "")
    dkim_domain = details.get("domain", "")

    if not selector or not dkim_domain:
        return {"status": "not_verifiable", "domain": ""}

    status = _txt_record_status(f"{selector}._domainkey.{dkim_domain}", "v=DKIM1")
    return {"status": status, "domain": dkim_domain}


def _is_short_generic_email(raw_email: str) -> bool:
    body = email_body_without_headers(raw_email).lower()
    body_words = word_count(body)
    generic_markers = ("quick question", "interested?", "meeting request", "can we chat", "are you open")
    has_generic_marker = any(marker in body for marker in generic_markers)
    return body_words <= 35 and has_generic_marker


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def _recipient_name_present(text: str) -> bool:
    # Detect simple named salutations: "Hi Alex," / "Hello Priya,"
    match = re.search(r"\b(?:hi|hello|dear)\s+([A-Za-z][A-Za-z\-]{1,20})\b", text or "", flags=re.IGNORECASE)
    if not match:
        return False
    token = match.group(1).strip().lower()
    generic_tokens = {"team", "there", "all", "friend", "sir", "madam", "customer", "user"}
    return token not in generic_tokens


def _repetitive_structure(text: str) -> bool:
    normalized = str(text or "")
    sentences = [s.strip().lower() for s in re.split(r"[.!?\n]+", normalized) if s.strip()]
    if len(sentences) < 3:
        return False

    starts = []
    for sentence in sentences:
        words = [str(w) for w in sentence.split()]
        if not words:
            continue
        starts.append(" ".join(words[:2]))

    if len(starts) < 3:
        return False

    repeated = len(starts) - len(set(starts))
    return repeated >= 2


def _count_marketing_markers(text: str) -> int:
    content = (text or "").lower()
    markers = [
        "introduce",
        "major upgrade",
        "designed for",
        "game-ready",
        "production-ready",
        "optimized",
        "scalable",
        "at scale",
        "latest generation",
        "excited to",
        "delivers",
        "real-time",
        "pipelines",
    ]
    return sum(1 for marker in markers if marker in content)


def _has_generic_salutation(text: str) -> bool:
    content = (text or "").lower()
    return any(token in content for token in ["hi there", "hello there", "dear user", "dear customer"])


def _count_image_markers(text: str) -> int:
    content = text or ""
    html_images = len(re.findall(r"<img\b", content, flags=re.IGNORECASE))
    markdown_images = len(re.findall(r"!\[[^\]]*\]\([^\)]+\)", content, flags=re.IGNORECASE))
    linked_images = len(re.findall(r"https?://[^\s]+\.(?:png|jpg|jpeg|gif|webp)", content, flags=re.IGNORECASE))
    return html_images + markdown_images + linked_images


def _extract_subject_header_only(text: str) -> str:
    match = re.search(r"^\s*Subject:\s*(.+)$", text or "", flags=re.IGNORECASE | re.MULTILINE)
    return _normalize_text(match.group(1)) if match else ""


def _normalized_input(email: str, domain: str, raw_email: str, subject_override: str = "", body_override: str = "") -> Dict[str, str]:
    source_text = raw_email.strip() or email
    explicit_subject = _normalize_text(subject_override)
    explicit_body = _normalize_text(body_override)

    if explicit_subject:
        subject = explicit_subject
    elif raw_email.strip():
        # For raw emails, trust only explicit Subject header to avoid parser drift.
        subject = _extract_subject_header_only(source_text)
    else:
        subject = _normalize_text(extract_subject_from_raw(source_text))

    body = explicit_body or _normalize_text(email_body_without_headers(source_text) or source_text)

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


def analyze_email(
    email: str,
    domain: str,
    raw_email: str = "",
    analysis_mode: str = "content",
    subject_override: str = "",
    body_override: str = "",
) -> Dict:
    normalized = _normalized_input(email, domain, raw_email, subject_override, body_override)
    clean_domain = normalized["domain"]
    source_text = normalized["source"]
    normalized_email = normalized["email"]
    normalized_subject = normalized["subject"]
    normalized_body = normalized["body"]
    mode = (analysis_mode or "content").strip().lower()
    if mode not in ("content", "full"):
        mode = "content"

    full_mode = mode == "full"
    has_header_evidence = _has_header_evidence(source_text)
    auth_verifiable = bool(full_mode and clean_domain)

    if full_mode and clean_domain:
        if has_header_evidence:
            header_alignment = _check_header_mismatch(source_text, clean_domain)
            dkim_result = _check_dkim_from_headers(source_text)
        else:
            header_alignment = {
                "from_domain": "",
                "spf_aligned": True,
                "header_mismatch": False,
                "header_note": "From/SPF alignment not checked because full headers were not provided",
            }
            dkim_result = {"status": "not_verifiable", "domain": clean_domain}
        spf_result = _check_spf(clean_domain)
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
    has_list_unsubscribe_marker = detect_list_unsubscribe_marker(normalized_email)

    sending_pattern_risk = too_many_links or bool(aggressive_tone_terms) or short_generic_email
    exclamation_count = normalized_email.count("!")
    recipient_name_present = _recipient_name_present(normalized_email)
    repetitive_structure = _repetitive_structure(normalized_body)
    marketing_marker_count = _count_marketing_markers(normalized_body)
    generic_salutation = _has_generic_salutation(normalized_body)
    image_count = _count_image_markers(source_text)
    link_image_imbalance = link_count >= 3 and image_count == 0

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
        "has_subject": bool(normalized_subject),
        "subject_length": len((normalized_subject or "").strip()),
        "body_word_count": word_count(normalized_body),
        "link_count": link_count,
        "too_many_links": too_many_links,
        "cta_phrases": cta_phrases,
        "has_list_unsubscribe_marker": has_list_unsubscribe_marker,
        "tracking_style_links": tracking_style_links,
        "excessive_caps": has_excessive_caps(normalized_email),
        "aggressive_tone_terms": aggressive_tone_terms,
        "short_generic_email": short_generic_email,
        "sending_pattern_risk": sending_pattern_risk,
        "exclamation_count": exclamation_count,
        "recipient_name_present": recipient_name_present,
        "repetitive_structure": repetitive_structure,
        "marketing_marker_count": marketing_marker_count,
        "generic_salutation": generic_salutation,
        "image_count": image_count,
        "link_image_imbalance": link_image_imbalance,
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
            "email_type": scored.get("email_type", "email"),
            "email_type_confidence": scored.get("email_type_confidence", 72),
            "content_score": scored.get("content_score", scored["score"]),
            "infra_impact": scored.get("infra_impact", 0),
            "final_score": scored.get("final_score", scored["score"]),
            "deliverability_confidence": scored.get("deliverability_confidence", "medium"),
            "confidence_note": scored.get("confidence_note", ""),
            "verdict_label": scored.get("verdict_label", "Content/technical diagnostic only"),
            "real_world_risk": scored.get("real_world_risk", "UNKNOWN (reputation and engagement history not analyzed)"),
            "missing_factors": scored.get("missing_factors", []),
            "top_fixes": scored.get("top_fixes", []),
            "provider_results": scored.get("provider_results", {}),
            "detected_signals": scored.get("detected_signals", []),
            "risk_points": scored["risk_points"],
            "breakdown": scored["breakdown"],
        },
        "partial_findings": scored["findings"][:3],
        "full_findings": scored["findings"],
    }
