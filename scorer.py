from typing import Dict, List, Optional


def score_risk(signals: Dict) -> Dict:
    risk_points = 0
    infra_penalty_points = 0
    content_penalty_points = 0
    findings: List[Dict[str, Optional[str]]] = []
    breakdown: List[Dict[str, str | int]] = []
    detected_signals: List[str] = []
    score = 64
    # Hard content downside cap to prevent over-sensitive swings.
    max_content_penalty = 12

    email_type = signals.get("email_type", "cold outreach")
    mode = signals.get("analysis_mode", "content")
    full_mode = mode == "full"
    auth_verifiable = bool(signals.get("auth_verifiable", False))

    email_type_confidence = 72
    if email_type == "cold outreach" and signals.get("automation_level") == "high":
        email_type_confidence = 85
    elif email_type == "transactional" and signals.get("is_no_reply_sender"):
        email_type_confidence = 88
    elif email_type == "marketing/newsletter" and signals.get("email_type_reason"):
        email_type_confidence = 78

    mode_label = "Full Deliverability Check" if full_mode else "Content Only"
    mode_note = (
        "Includes content + domain checks (SPF, DKIM, DMARC, alignment)."
        if full_mode
        else "Based on message content only. Domain infrastructure checks are not applied."
    )

    def add_penalty(points: int, label: str, reason: str, category: str = "content"):
        nonlocal risk_points, score, infra_penalty_points, content_penalty_points
        if points <= 0:
            return

        if category == "content":
            remaining = max_content_penalty - content_penalty_points
            if remaining <= 0:
                return
            points = min(points, remaining)
            content_penalty_points += points

        risk_points += points
        if category == "infra":
            infra_penalty_points += points
        score -= points
        breakdown.append({"label": label, "points": -points, "reason": reason})

    def add_boost(points: int, label: str, reason: str):
        nonlocal score
        score += points
        breakdown.append({"label": label, "points": points, "reason": reason})

    # Classification context
    findings.append(
        {
            "severity": "low",
            "title": f"Analysis mode: {mode_label}",
            "issue": mode_note,
            "impact": "Use the same mode across tests to compare scores fairly.",
            "fix": None,
        }
    )

    # Content signals
    spam_terms = signals.get("spam_terms") or []
    cta_phrases = signals.get("cta_phrases") or []
    aggressive_terms = signals.get("aggressive_tone_terms") or []
    link_count = int(signals.get("link_count", 0))
    confidence_killers = signals.get("confidence_killers") or []
    body_word_count = int(signals.get("body_word_count", 0))
    has_subject = bool(signals.get("has_subject", False))

    has_personalization = any(
        marker in (signals.get("email_type_reason", "").lower())
        for marker in ["noticed", "saw your", "about your", "personali"]
    )

    # Positive signals first: this improves score spread so good emails can actually score high.
    if has_personalization:
        add_boost(8, "Personalization detected", "Recipient-specific context detected")
        detected_signals.append("• Personalization detected")

    if has_subject:
        add_boost(4, "Subject present", "A clear subject improves trust signals")
        if 40 <= body_word_count <= 260:
            add_boost(4, "Readable body length", "Body length is in a healthy outreach range")

    if not spam_terms:
        add_boost(8, "Clean content", "Copy avoids common trigger phrases")

    if not aggressive_terms:
        add_boost(6, "Neutral tone", "No urgency pressure terms detected")

    if email_type in ("informational/system", "transactional"):
        add_boost(8, "Informational trust profile", "Message style looks informational over promotional")

    language_penalty = 0
    targeting_penalty = 0
    structure_penalty = 0
    friction_penalty = 0

    if email_type == "cold outreach" and not has_personalization:
        targeting_penalty += 8
        detected_signals.append("• No personalization detected (looks like bulk email)")
        findings.append(
            {
                "severity": "high",
                "title": "No personalization detected",
                "issue": "This message reads like a template, not a person-to-person email.",
                "impact": "Template-style outreach is downranked by inbox providers.",
                "fix": "Add recipient-specific context such as company detail, recent post, or role-specific pain.",
            }
        )

    if spam_terms:
        promo_penalty = min(8, len(spam_terms) * 4)
        language_penalty += promo_penalty
        detected_signals.append(f"• {len(spam_terms)} promotional phrase(s) ({', '.join(spam_terms[:2])})")

    normalized_cta = {p.strip().lower() for p in cta_phrases}
    non_overlap_urgency = [t for t in aggressive_terms if t.strip().lower() not in normalized_cta]

    cta_penalty = 0
    urgency_penalty = 0
    if cta_phrases:
        cta_penalty = min(10, 6 + max(0, len(cta_phrases) - 1) * 2)
        detected_signals.append(f"• CTA phrases detected ({', '.join(cta_phrases[:2])})")

    if non_overlap_urgency:
        urgency_penalty = min(10, len(non_overlap_urgency) * 6)
        detected_signals.append("• Uses urgency language (can trigger spam filters)")
        findings.append(
            {
                "severity": "high",
                "title": "Urgency language detected",
                "issue": "Pressure words can make this look promotional or suspicious.",
                "impact": "Urgency-heavy language increases filtering risk.",
                "fix": "Replace urgency words with clear, neutral timing and a calm CTA.",
            }
        )

    pressure_penalty = max(cta_penalty, urgency_penalty)
    pressure_reason = ""
    if pressure_penalty:
        reason_parts: List[str] = []
        if cta_phrases:
            reason_parts.append(f"CTA: {', '.join(cta_phrases[:2])}")
        if non_overlap_urgency:
            reason_parts.append(f"Urgency: {', '.join(non_overlap_urgency[:2])}")
        language_penalty += pressure_penalty
        pressure_reason = " | ".join(reason_parts)

    if signals.get("too_many_links", False):
        friction_penalty += 8
        detected_signals.append(f"• {link_count} links detected")
    elif link_count >= 2:
        friction_penalty += 5
        detected_signals.append(f"• {link_count} links detected")
    elif link_count == 1:
        add_boost(2, "Single link", "Focused call-to-action pattern")
        detected_signals.append("• 1 link detected")
    else:
        detected_signals.append("• 0 links detected")

    if signals.get("excessive_caps", False):
        structure_penalty += 4

    if signals.get("short_generic_email", False):
        structure_penalty += 5
        findings.append(
            {
                "severity": "medium",
                "title": "Generic call-to-action detected",
                "issue": "Your ask sounds broad and reusable across many recipients.",
                "impact": "Generic CTA patterns reduce trust and raise spam risk.",
                "fix": "Use one concrete ask tied to recipient context.",
            }
        )

    if confidence_killers:
        language_penalty += min(4, len(confidence_killers) * 2)

    opener_type = signals.get("opener_type")
    if email_type == "cold outreach" and opener_type in ("generic", "pattern-based"):
        targeting_penalty += 4

    intent_type = signals.get("intent_type")
    if email_type == "cold outreach" and intent_type in ("no-cta", "vague"):
        targeting_penalty += 4

    if signals.get("tracking_style_links", False):
        friction_penalty += 3

    # Group normalization to avoid overlap double counting.
    language_penalty = min(8, language_penalty)
    targeting_penalty = min(8, targeting_penalty)
    structure_penalty = min(6, structure_penalty)
    friction_penalty = min(8, friction_penalty)

    if language_penalty > 0:
        add_penalty(
            language_penalty,
            "Language pressure",
            pressure_reason or "Promotional or urgency-heavy phrasing detected",
            category="content",
        )
    if targeting_penalty > 0:
        add_penalty(
            targeting_penalty,
            "Targeting clarity risk",
            "Personalization/opener/CTA clarity signals indicate template-like outreach",
            category="content",
        )
    if structure_penalty > 0:
        add_penalty(
            structure_penalty,
            "Structure risk",
            "Formatting pattern resembles generic outreach",
            category="content",
        )
    if friction_penalty > 0:
        add_penalty(
            friction_penalty,
            "Friction risk",
            "Links/tracking footprint increases promotional profile",
            category="content",
        )

    # Profile adjustments (light-touch)
    if email_type == "transactional":
        add_boost(6, "Transactional profile", "Legitimate notification pattern")
    elif email_type == "marketing/newsletter":
        add_boost(3, "Newsletter profile", "Broadcast pattern recognized")
    elif email_type == "informational/system":
        add_boost(5, "Informational profile", "Announcement/system style recognized")

    # Infra checks only in full mode
    if full_mode:
        if auth_verifiable:
            findings.append(
                {
                    "severity": "low",
                    "title": "✅ Domain-level checks included",
                    "issue": "This score includes SPF, DKIM, DMARC, blacklist and alignment checks.",
                    "impact": "Scores can be lower than content-only mode when domain setup is weak.",
                    "fix": None,
                }
            )
        else:
            findings.append(
                {
                    "severity": "low",
                    "title": "⚠️ Full mode requested but headers/domain were incomplete",
                    "issue": "Domain checks were limited by missing verifiable header/domain data.",
                    "impact": "Paste complete headers and a valid domain for strict full-mode validation.",
                    "fix": None,
                }
            )

        blacklist_status = signals.get("blacklist_status", {})
        if blacklist_status.get("blacklisted", False):
            lists = ", ".join(blacklist_status.get("lists", []))
            add_penalty(16, "Domain blacklist status", f"Listed on {lists}", category="infra")
            detected_signals.append(f"• Domain listed on blacklist(s): {lists}")
        elif blacklist_status.get("status") == "unknown":
            detected_signals.append("• Blacklist check skipped (network-limited)")
        else:
            detected_signals.append("• Blacklist: not detected")

        spf_status = signals.get("spf_status", "missing")
        dkim_status = signals.get("dkim_status", "missing")
        dmarc_status = signals.get("dmarc_status", "missing")

        if spf_status == "missing":
            add_penalty(8, "SPF missing", f"SPF record not found on {signals.get('spf_checked_domain', 'domain')}", category="infra")
            detected_signals.append("• SPF missing")
        elif spf_status == "unknown":
            detected_signals.append("• SPF lookup unavailable")
        else:
            detected_signals.append("• SPF found")

        if dkim_status == "missing":
            add_penalty(6, "DKIM record missing", f"Selector record not found on {signals.get('dkim_checked_domain', 'domain')}", category="infra")
            detected_signals.append("• DKIM record missing")
        elif dkim_status == "not_verifiable":
            detected_signals.append("• DKIM not verifiable (requires signed headers)")
        elif dkim_status == "unknown":
            detected_signals.append("• DKIM lookup unavailable")
        else:
            detected_signals.append("• DKIM found")

        if not signals.get("spf_aligned", False):
            add_penalty(10, "From alignment mismatch", "From domain does not align with SPF domain", category="infra")
            detected_signals.append("• SPF alignment failed")

        if dmarc_status == "missing":
            add_penalty(6, "DMARC missing", f"DMARC policy not found on {signals.get('dmarc_checked_domain', 'domain')}", category="infra")
            detected_signals.append("• DMARC missing")
        elif dmarc_status == "unknown":
            detected_signals.append("• DMARC lookup unavailable")
        else:
            detected_signals.append("• DMARC found")
    else:
        detected_signals.append("• Domain-level checks skipped (Content Only mode)")

    content_score = max(35, min(95, score + infra_penalty_points))

    if content_score >= 80 and infra_penalty_points > 0:
        relief = min(6, max(1, round(infra_penalty_points * 0.25)))
        score += relief
        breakdown.append({
            "label": "High-quality content relief",
            "points": relief,
            "reason": "Strong content softens infrastructure drag in heuristic scoring",
        })

    score = max(35, min(95, score))

    if score >= 80:
        risk_band = "Likely Inbox"
        risk_pill_style = "low"
    elif score >= 60:
        risk_band = "⚠️ May hit Promotions/Spam"
        risk_pill_style = "medium"
    else:
        risk_band = "❌ Likely Spam"
        risk_pill_style = "high"

    return {
        "score": score,
        "risk_band": risk_band,
        "risk_pill_style": risk_pill_style,
        "email_type": email_type,
        "email_type_confidence": email_type_confidence,
        "analysis_mode": mode,
        "analysis_mode_label": mode_label,
        "analysis_mode_note": mode_note,
        "capability_note": "Based on content and optional domain checks only. No real inbox placement testing is performed.",
        "infra_included": full_mode,
        "content_score": content_score,
        "infra_impact": -infra_penalty_points,
        "final_score": score,
        "risk_points": risk_points,
        "breakdown": breakdown,
        "findings": findings,
        "detected_signals": detected_signals,
    }
