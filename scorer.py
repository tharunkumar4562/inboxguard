from typing import Dict, List, Optional


# Penalty-first model: start at 100 and subtract risk.
# This avoids top-end saturation and makes issues materially visible.
CONTENT_PENALTIES = {
    "spam_phrases": 20,
    "cta_pressure": 20,
    "urgency_pressure": 14,
    "link_density": 15,
    "link_image_imbalance": 7,
    "tracking_links": 8,
    "short_generic": 10,
    "missing_personalization": 10,
    "targeting_unclear": 8,
    "excessive_caps": 12,
    "exclamation_abuse": 10,
    "repetitive_structure": 6,
    "confidence_killers": 6,
    "automation_high": 10,
    "missing_list_unsubscribe": 12,
    "broadcast_marketing": 16,
    "generic_salutation": 8,
}

INFRA_PENALTIES = {
    "blacklisted_domain": 45,
    "spf_missing": 35,
    "dkim_missing": 30,
    "dmarc_missing": 20,
    "dkim_not_verifiable": 15,
    "spf_misaligned": 20,
    "auth_not_verifiable": 8,
}


def _clamp_score(value: int) -> int:
    return max(0, min(100, value))


def _impact_from_points(points: int) -> float:
    return max(0.05, min(1.0, round(points / 100, 2)))


def _to_int(value: object, fallback: int = 0) -> int:
    try:
        return int(value)  # type: ignore[arg-type]
    except Exception:
        return fallback


def _severity_for_points(points: int) -> str:
    if points >= 25:
        return "high"
    if points >= 12:
        return "medium"
    return "low"


def score_risk(signals: Dict) -> Dict:
    findings: List[Dict[str, Optional[str]]] = []
    breakdown: List[Dict[str, str | int]] = []
    detected_signals: List[str] = []
    issues: List[Dict[str, object]] = []

    email_type = signals.get("email_type", "cold outreach")
    mode = signals.get("analysis_mode", "content")
    full_mode = mode == "full"
    auth_verifiable = bool(signals.get("auth_verifiable", False))

    mode_label = "Full Deliverability Check" if full_mode else "Content Only"
    mode_note = (
        "Includes content + domain checks (SPF, DKIM, DMARC, alignment)."
        if full_mode
        else "Based on message content only. Domain infrastructure checks are not applied."
    )

    findings.append(
        {
            "severity": "low",
            "title": f"Analysis mode: {mode_label}",
            "issue": mode_note,
            "impact": "Use the same mode across tests to compare scores fairly.",
            "fix": None,
        }
    )

    # Extract commonly used signals.
    spam_terms = signals.get("spam_terms") or []
    cta_phrases = signals.get("cta_phrases") or []
    aggressive_terms = signals.get("aggressive_tone_terms") or []
    link_count = int(signals.get("link_count", 0))
    too_many_links = bool(signals.get("too_many_links", False))
    tracking_style_links = bool(signals.get("tracking_style_links", False))
    link_image_imbalance = bool(signals.get("link_image_imbalance", False))
    image_count = _to_int(signals.get("image_count", 0))
    short_generic_email = bool(signals.get("short_generic_email", False))
    exclamation_count = _to_int(signals.get("exclamation_count", 0))
    repetitive_structure = bool(signals.get("repetitive_structure", False))
    recipient_name_present = bool(signals.get("recipient_name_present", False))
    marketing_marker_count = _to_int(signals.get("marketing_marker_count", 0))
    generic_salutation = bool(signals.get("generic_salutation", False))
    confidence_killers = signals.get("confidence_killers") or []
    opener_type = str(signals.get("opener_type", ""))
    intent_type = str(signals.get("intent_type", ""))
    has_list_unsubscribe_marker = bool(signals.get("has_list_unsubscribe_marker", False))

    content_penalty_points = 0
    infra_penalty_points = 0

    def add_breakdown(label: str, points: int, reason: str, category: str = "content") -> None:
        nonlocal content_penalty_points, infra_penalty_points
        points = int(max(0, points))
        if points == 0:
            return
        if category == "infra":
            infra_penalty_points += points
        else:
            content_penalty_points += points
        breakdown.append({"label": label, "points": -points, "reason": reason})

    def add_issue(
        issue_type: str,
        title: str,
        points: int,
        action: str,
        why: str,
        providers: List[str] | None = None,
    ) -> None:
        severity = _severity_for_points(points)
        findings.append(
            {
                "severity": severity,
                "title": title,
                "issue": why,
                "impact": f"Estimated impact: {points} points.",
                "fix": action,
            }
        )
        issues.append(
            {
                "type": issue_type,
                "title": title,
                "impact": _impact_from_points(points),
                "points": points,
                "action": action,
                "why": why,
                "providers": providers or ["all"],
            }
        )

    # Content penalties.
    if spam_terms:
        points = min(30, CONTENT_PENALTIES["spam_phrases"] + max(0, len(spam_terms) - 1) * 4)
        add_breakdown("Spam phrase risk", points, f"Found trigger terms: {', '.join(spam_terms[:3])}")
        add_issue(
            "spam_phrases",
            "Promotional phrasing detected",
            points,
            "Replace promotional terms with neutral wording and concrete value.",
            "Trigger phrases often map to promotions/spam buckets.",
            ["gmail", "yahoo"],
        )
        detected_signals.append(f"• Spam terms: {', '.join(spam_terms[:2])}")

    normalized_cta = {p.strip().lower() for p in cta_phrases}
    non_overlap_urgency = [t for t in aggressive_terms if t.strip().lower() not in normalized_cta]

    if cta_phrases:
        cta_count = len(cta_phrases)
        points = min(25, 12 + cta_count * 5)

        # Single CTA in informational/system content with no links is lower risk than campaign copy.
        if (
            email_type in ("informational/system", "transactional")
            and cta_count == 1
            and link_count == 0
            and not spam_terms
        ):
            points = max(10, points - 4)

        if non_overlap_urgency:
            points = min(28, points + 4)

        add_breakdown("CTA pressure", points, f"CTA terms: {', '.join(cta_phrases[:2])}")
        add_issue(
            "cta_pressure",
            "CTA pressure is high",
            points,
            "Use one low-pressure CTA and remove urgency wording.",
            "Urgency-heavy CTAs are commonly treated as campaign-style behavior.",
            ["gmail", "yahoo", "outlook"],
        )
        detected_signals.append(f"• CTA phrases detected ({', '.join(cta_phrases[:2])})")

    if non_overlap_urgency:
        points = min(20, CONTENT_PENALTIES["urgency_pressure"] + max(0, len(non_overlap_urgency) - 1) * 3)
        add_breakdown("Urgency language", points, f"Urgency terms: {', '.join(non_overlap_urgency[:2])}")
        add_issue(
            "urgency_pressure",
            "Urgency language detected",
            points,
            "Replace urgency terms with calm, specific timing.",
            "Pressure language can reduce trust and increase filtering probability.",
            ["gmail", "outlook", "yahoo"],
        )
        detected_signals.append("• Uses urgency language")

    if too_many_links:
        points = CONTENT_PENALTIES["link_density"]
        add_breakdown("High link density", points, f"Detected {link_count} links")
        add_issue(
            "link_density",
            "Link footprint is high",
            points,
            "Reduce links to one direct destination URL.",
            "Many links increase promotional classification risk.",
            ["gmail", "outlook", "yahoo"],
        )
        detected_signals.append(f"• {link_count} links detected")
    elif link_count >= 2:
        points = max(8, CONTENT_PENALTIES["link_density"] - 5)
        add_breakdown("Multiple links", points, f"Detected {link_count} links")
        add_issue(
            "link_density",
            "Multiple links detected",
            points,
            "Prefer one clear link instead of multiple destinations.",
            "Multiple links increase campaign-like footprint.",
            ["gmail", "outlook", "yahoo"],
        )
        detected_signals.append(f"• {link_count} links detected")
    elif link_count == 1:
        detected_signals.append("• 1 link detected")
    else:
        detected_signals.append("• 0 links detected")

    if tracking_style_links:
        points = CONTENT_PENALTIES["tracking_links"]
        add_breakdown("Tracking-style links", points, "Tracking/redirect-like URL pattern detected")
        add_issue(
            "tracking_link_reputation",
            "Tracking-style URL pattern",
            points,
            "Use direct destination URLs without redirect-style tracking params.",
            "Tracking URL patterns lower trust with mailbox filters.",
            ["gmail", "outlook"],
        )

    if link_image_imbalance:
        points = CONTENT_PENALTIES["link_image_imbalance"]
        add_breakdown("Link/image imbalance", points, f"Detected {link_count} links with only {image_count} image marker(s)")
        add_issue(
            "link_image_imbalance",
            "Link/image balance looks unnatural",
            points,
            "Reduce link count or add a balanced visual/text structure before sending.",
            "Filters often downrank drafts that look like dense link payloads.",
            ["gmail", "outlook", "yahoo"],
        )

    if short_generic_email:
        points = CONTENT_PENALTIES["short_generic"]
        add_breakdown("Generic short copy", points, "Message appears short and template-like")
        add_issue(
            "short_generic_email",
            "Generic call-to-action detected",
            points,
            "Use recipient-specific context and one concrete ask.",
            "Generic short requests resemble bulk outreach patterns.",
            ["gmail", "outlook", "yahoo"],
        )

    if signals.get("excessive_caps", False):
        points = CONTENT_PENALTIES["excessive_caps"]
        add_breakdown("Excessive capitalization", points, "All-caps usage detected")

    if exclamation_count > 3:
        points = min(16, CONTENT_PENALTIES["exclamation_abuse"] + max(0, exclamation_count - 3))
        add_breakdown("Exclamation abuse", points, f"Detected {exclamation_count} exclamation marks")

    if repetitive_structure:
        points = CONTENT_PENALTIES["repetitive_structure"]
        add_breakdown("Repetitive sentence pattern", points, "Low sentence variation suggests template-like copy")

    if confidence_killers:
        points = min(12, CONTENT_PENALTIES["confidence_killers"] + len(confidence_killers))
        add_breakdown("Low-trust language", points, "Uncertain or hedging language detected")

    if marketing_marker_count >= 4:
        points = min(24, CONTENT_PENALTIES["broadcast_marketing"] + (marketing_marker_count - 4) * 2)
        add_breakdown("Broadcast marketing tone", points, f"Detected {marketing_marker_count} promotional/broadcast markers")
        add_issue(
            "broadcast_marketing_tone",
            "Broadcast-style promotional tone",
            points,
            "Reduce feature-broadcast copy and anchor message to one recipient-specific outcome.",
            "Feature-heavy broadcast phrasing is often treated as campaign mail.",
            ["gmail", "outlook", "yahoo"],
        )

    if generic_salutation:
        points = CONTENT_PENALTIES["generic_salutation"]
        add_breakdown("Generic salutation", points, "Detected non-specific greeting (e.g., 'Hi there')")

    # Targeting/persona penalties.
    has_personalization = any(
        marker in (signals.get("email_type_reason", "").lower())
        for marker in ["noticed", "saw your", "about your", "personali"]
    )

    if (
        email_type in ("cold outreach", "marketing/newsletter")
        or (email_type == "informational/system" and marketing_marker_count >= 4)
    ) and not recipient_name_present and not has_personalization:
        points = CONTENT_PENALTIES["missing_personalization"]
        add_breakdown("No personalization", points, "Missing recipient-specific naming/context signal")
        add_issue(
            "no_personalization",
            "No personalization detected",
            points,
            "Add one recipient-specific reference in your opener.",
            "Template-style outreach is downranked by providers.",
            ["gmail", "outlook", "yahoo"],
        )
        detected_signals.append("• No personalization detected")

    if email_type in ("cold outreach", "marketing/newsletter") and opener_type in ("generic", "pattern-based"):
        points = CONTENT_PENALTIES["targeting_unclear"]
        add_breakdown("Generic opener", points, "Opening line appears reusable across many recipients")

    if email_type in ("cold outreach", "marketing/newsletter") and intent_type in ("no-cta", "vague"):
        points = CONTENT_PENALTIES["targeting_unclear"]
        add_breakdown("Vague intent", points, "Call-to-action is vague or missing")

    if email_type in ("cold outreach", "marketing/newsletter") and signals.get("automation_level") == "high":
        points = CONTENT_PENALTIES["automation_high"]
        add_breakdown("Automation footprint", points, "High template/automation markers detected")

    if email_type in ("marketing/newsletter", "cold outreach") and link_count >= 1 and not has_list_unsubscribe_marker:
        points = CONTENT_PENALTIES["missing_list_unsubscribe"]
        add_breakdown("List-Unsubscribe missing", points, "Campaign-style mail without unsubscribe marker")
        add_issue(
            "missing_list_unsubscribe",
            "List-Unsubscribe signal missing",
            points,
            "Add unsubscribe/manage-preferences controls for campaign-style sends.",
            "Outlook is stricter on list-unsubscribe expectations.",
            ["outlook"],
        )

    # Infrastructure penalties (full mode only).
    spf_status = signals.get("spf_status", "not_checked")
    dkim_status = signals.get("dkim_status", "not_checked")
    dmarc_status = signals.get("dmarc_status", "not_checked")
    spf_aligned = bool(signals.get("spf_aligned", False))
    blacklist_status = signals.get("blacklist_status", {})
    blacklisted = bool(blacklist_status.get("blacklisted", False))

    if full_mode:
        if not auth_verifiable:
            points = INFRA_PENALTIES["auth_not_verifiable"]
            add_breakdown("Authentication not fully verifiable", points, "Headers/domain evidence is partial", category="infra")

        if blacklisted:
            points = INFRA_PENALTIES["blacklisted_domain"]
            lists = ", ".join(blacklist_status.get("lists", []))
            add_breakdown("Domain blacklist risk", points, f"Domain listed on: {lists}", category="infra")
            add_issue(
                "blacklisted_domain",
                "Domain appears on blacklist",
                points,
                "Resolve blacklist listings and warm sender reputation before campaigns.",
                "Blacklisted domains are strongly penalized by providers.",
                ["gmail", "outlook", "yahoo"],
            )
            detected_signals.append(f"• Domain listed on blacklist(s): {lists}")
        elif blacklist_status.get("status") == "unknown":
            detected_signals.append("• Blacklist check skipped (network-limited)")
        else:
            detected_signals.append("• Blacklist: not detected")

        if spf_status == "missing":
            points = INFRA_PENALTIES["spf_missing"]
            add_breakdown("SPF missing", points, "SPF record not found", category="infra")
            add_issue(
                "spf_missing",
                "SPF is missing",
                points,
                "Publish SPF including all approved sending hosts.",
                "Without SPF, providers cannot validate sender authorization.",
                ["gmail", "outlook", "yahoo"],
            )
            detected_signals.append("• SPF missing")
        elif spf_status == "unknown":
            detected_signals.append("• SPF lookup unavailable")
        else:
            detected_signals.append("• SPF found")

        if dkim_status == "missing":
            points = INFRA_PENALTIES["dkim_missing"]
            add_breakdown("DKIM missing", points, "DKIM selector record not found", category="infra")
            add_issue(
                "dkim_missing",
                "DKIM signing missing",
                points,
                "Enable DKIM signing at your ESP and validate selector DNS records.",
                "Missing DKIM weakens sender authenticity checks.",
                ["gmail", "outlook", "yahoo"],
            )
            detected_signals.append("• DKIM record missing")
        elif dkim_status == "not_verifiable":
            points = INFRA_PENALTIES["dkim_not_verifiable"]
            add_breakdown("DKIM not fully verifiable", points, "Signed headers/selector evidence is partial", category="infra")
            add_issue(
                "dkim_not_verifiable",
                "DKIM cannot be fully verified",
                points,
                "Send full signed headers or verify selector configuration in your ESP.",
                "Providers cannot fully confirm DKIM authenticity from this input.",
                ["gmail", "outlook", "yahoo"],
            )
            detected_signals.append("• DKIM not verifiable (requires signed headers)")
        elif dkim_status == "unknown":
            detected_signals.append("• DKIM lookup unavailable")
        else:
            detected_signals.append("• DKIM found")

        if spf_status == "found" and not spf_aligned:
            points = INFRA_PENALTIES["spf_misaligned"]
            add_breakdown("SPF alignment mismatch", points, "From domain does not align with SPF domain", category="infra")
            add_issue(
                "spf_misaligned",
                "SPF found but not aligned",
                points,
                "Align From domain with SPF-authenticated envelope domain.",
                "Alignment failure reduces domain trust.",
                ["gmail", "outlook", "yahoo"],
            )
            detected_signals.append("• SPF alignment failed")

        if dmarc_status == "missing":
            points = INFRA_PENALTIES["dmarc_missing"]
            add_breakdown("DMARC missing", points, "DMARC policy record not found", category="infra")
            add_issue(
                "dmarc_missing",
                "DMARC policy missing",
                points,
                "Publish DMARC policy (p=none first, then enforce gradually).",
                "DMARC adds policy-level trust and spoofing control.",
                ["yahoo", "outlook", "gmail"],
            )
            detected_signals.append("• DMARC missing")
        elif dmarc_status == "unknown":
            detected_signals.append("• DMARC lookup unavailable")
        else:
            detected_signals.append("• DMARC found")
    else:
        detected_signals.append("• Domain-level checks skipped (Content Only mode)")

    # Non-linear interactions: combined issues are risk multipliers.
    combo_points = 0
    if full_mode and spf_status == "missing" and dkim_status == "missing":
        combo_points += 15
        add_breakdown(
            "Auth stack collapse",
            15,
            "SPF and DKIM are both missing; providers apply stronger trust penalties.",
            category="infra",
        )

    if full_mode and spf_status == "missing" and dmarc_status == "missing":
        combo_points += 10
        add_breakdown(
            "Policy + auth gap",
            10,
            "SPF and DMARC both missing compounds sender authenticity risk.",
            category="infra",
        )

    if cta_phrases and (too_many_links or link_count >= 2):
        combo_points += 10
        add_breakdown(
            "Campaign-style spike",
            10,
            "CTA pressure combined with multi-link footprint increases promotional risk.",
        )

    if cta_phrases and link_count >= 1:
        combo_points += 10
        add_breakdown(
            "CTA + link interaction",
            10,
            "A direct CTA combined with links raises campaign-style filtering risk.",
        )

    if len(spam_terms) >= 2:
        combo_points += 15
        add_breakdown(
            "Multi-trigger phrase stack",
            15,
            "Multiple spam-like phrases strongly increase promotional classification risk.",
        )

    if cta_phrases and (bool(spam_terms) or bool(non_overlap_urgency)):
        combo_points += 10
        add_breakdown(
            "CTA + promotional tone",
            10,
            "CTA pressure combined with promotional/urgent language creates risk amplification.",
        )

    if spam_terms and signals.get("excessive_caps", False):
        combo_points += 8
        add_breakdown(
            "Spam-style language spike",
            8,
            "Spam terms combined with all-caps style amplifies filtering risk.",
        )

    if tracking_style_links and too_many_links:
        combo_points += 7
        add_breakdown(
            "Tracking footprint spike",
            7,
            "Tracking-style URLs combined with many links reduces trust sharply.",
        )

    # Score computation (no artificial 95 ceiling).
    # Content-only is intentionally conservative because sender reputation is unknown.
    baseline_score = 100 if full_mode else 92
    total_penalty = content_penalty_points + infra_penalty_points
    content_score = _clamp_score(baseline_score - content_penalty_points)
    final_score = _clamp_score(baseline_score - total_penalty)

    # Risk band (diagnostic, not inbox prediction).
    if final_score >= 80:
        risk_band = "Content Safe"
        risk_pill_style = "low"
    elif final_score >= 60:
        risk_band = "Needs Review"
        risk_pill_style = "medium"
    else:
        risk_band = "High Spam-Risk Signals"
        risk_pill_style = "high"

    major_content_flags = content_penalty_points >= 25
    major_infra_flags = infra_penalty_points >= 30
    if final_score >= 80 and not major_content_flags and not major_infra_flags:
        verdict_label = "Content Safe but Reputation Dependent"
    elif final_score >= 60:
        verdict_label = "Mixed Signals - Reputation Dependent"
    else:
        verdict_label = "Strong Risk Signals Detected"

    real_world_risk = (
        "UNKNOWN (sender reputation and engagement history are not analyzed)"
        if final_score >= 70
        else "ELEVATED from content/technical signals (reputation still unknown)"
    )

    missing_factors = [
        "Sender reputation history",
        "Spam complaint/report rates",
        "Recipient engagement history",
        "Sending frequency/volume spikes",
        "Mailbox-provider similarity clustering",
    ]

    # Confidence model.
    if not full_mode:
        deliverability_confidence = "medium"
        confidence_note = "Content-only mode: sender authentication confidence is not fully verified."
    else:
        if blacklisted or spf_status == "missing" or not spf_aligned:
            deliverability_confidence = "low"
            confidence_note = "Authentication or sender reputation has high uncertainty/risk."
        elif dkim_status in ("missing", "not_verifiable") or dmarc_status in ("missing", "unknown"):
            deliverability_confidence = "medium"
            confidence_note = "Content may be strong, but authentication verification is partial."
        elif spf_status == "found" and dkim_status == "found" and dmarc_status == "found":
            deliverability_confidence = "high"
            confidence_note = "Authentication checks are complete and aligned."
        else:
            deliverability_confidence = "medium"
            confidence_note = "Some infrastructure checks are inconclusive."

    # Top fixes.
    unique_fixes: Dict[str, Dict[str, object]] = {}
    issues_sorted = sorted(issues, key=lambda item: _to_int(item.get("points", 0)), reverse=True)
    for item in issues_sorted:
        key = str(item.get("type", "unknown"))
        if key not in unique_fixes:
            unique_fixes[key] = item
    top_fixes = list(unique_fixes.values())[:3]

    if not top_fixes:
        top_fixes = [
            {
                "type": "no_critical_issues",
                "title": "No critical issues detected",
                "impact": 0.05,
                "points": 5,
                "action": "Keep authentication and message style consistent across sends.",
                "why": "Current input does not show major penalty drivers.",
                "providers": ["all"],
            }
        ]

    # Provider view with differentiated sensitivity.
    provider_rules = {
        "gmail": {"spam_phrases": 1.3, "cta_pressure": 1.2, "tracking_link_reputation": 1.2, "dkim_missing": 1.0, "spf_missing": 1.0},
        "outlook": {"missing_list_unsubscribe": 1.35, "dkim_missing": 1.1, "spf_misaligned": 1.2, "cta_pressure": 1.0},
        "yahoo": {"dmarc_missing": 1.25, "spf_missing": 1.1, "spam_phrases": 1.15, "dkim_missing": 1.05},
    }

    provider_results: Dict[str, Dict[str, object]] = {}
    for provider in ["gmail", "outlook", "yahoo"]:
        issue_points = 0
        provider_issues: List[Dict[str, object]] = []
        for issue in issues_sorted:
            providers = issue.get("providers", ["all"])
            if isinstance(providers, list) and ("all" in providers or provider in providers):
                base_points = _to_int(issue.get("points", 0))
                multiplier = provider_rules.get(provider, {}).get(str(issue.get("type", "")), 1.0)
                adjusted = int(round(base_points * multiplier))
                issue_points += adjusted
                provider_issues.append({**issue, "points": adjusted})

        provider_score = _clamp_score(baseline_score - issue_points)
        if provider_score >= 80:
            provider_status = "content_safe"
        elif provider_score >= 60:
            provider_status = "needs_review"
        else:
            provider_status = "high_risk_signals"

        provider_top_issue = "No major provider-specific issue"
        if provider_issues:
            provider_top_issue = str(max(provider_issues, key=lambda item: _to_int(item.get("points", 0))).get("title", provider_top_issue))

        provider_results[provider] = {
            "score": provider_score,
            "status": provider_status,
            "top_issue": provider_top_issue,
        }

    # A stable confidence score for the existing UI's email type confidence field.
    email_type_confidence = 72
    if email_type == "cold outreach" and signals.get("automation_level") == "high":
        email_type_confidence = 85
    elif email_type == "transactional" and signals.get("is_no_reply_sender"):
        email_type_confidence = 88
    elif email_type == "marketing/newsletter" and signals.get("email_type_reason"):
        email_type_confidence = 78

    return {
        "score": final_score,
        "risk_band": risk_band,
        "risk_pill_style": risk_pill_style,
        "email_type": email_type,
        "email_type_confidence": email_type_confidence,
        "analysis_mode": mode,
        "analysis_mode_label": mode_label,
        "analysis_mode_note": mode_note,
        "capability_note": "This is a content + technical risk analyzer, not an inbox placement predictor.",
        "verdict_label": verdict_label,
        "real_world_risk": real_world_risk,
        "missing_factors": missing_factors,
        "infra_included": full_mode,
        "content_score": content_score,
        "infra_impact": -infra_penalty_points,
        "final_score": final_score,
        "deliverability_confidence": deliverability_confidence,
        "confidence_note": confidence_note,
        "top_fixes": top_fixes,
        "provider_results": provider_results,
        "risk_points": total_penalty,
        "breakdown": breakdown,
        "findings": findings,
        "detected_signals": detected_signals,
    }
