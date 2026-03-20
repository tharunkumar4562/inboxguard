from typing import Dict, List, Optional


def score_risk(signals: Dict) -> Dict:
    risk_points = 0
    infra_penalty_points = 0
    findings: List[Dict[str, Optional[str]]] = []
    breakdown: List[Dict[str, str | int]] = []
    detected_signals: List[str] = []
    score = 72

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
        nonlocal risk_points, score, infra_penalty_points
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

    has_personalization = any(
        marker in (signals.get("email_type_reason", "").lower())
        for marker in ["noticed", "saw your", "about your", "personali"]
    )

    if email_type == "cold outreach" and not has_personalization:
        add_penalty(12, "No personalization", "Looks like bulk email instead of 1:1 outreach")
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
        promo_penalty = min(20, len(spam_terms) * 8)
        add_penalty(promo_penalty, "Promotional phrasing", f"Found: {', '.join(spam_terms[:3])}", category="content")
        detected_signals.append(f"• {len(spam_terms)} promotional phrase(s) ({', '.join(spam_terms[:2])})")

    if cta_phrases:
        cta_penalty = min(12, 8 + max(0, len(cta_phrases) - 1) * 2)
        add_penalty(cta_penalty, "CTA intent phrases", f"Found: {', '.join(cta_phrases[:3])}", category="content")
        detected_signals.append(f"• CTA phrases detected ({', '.join(cta_phrases[:2])})")

    if aggressive_terms:
        urgency_penalty = min(20, len(aggressive_terms) * 10)
        add_penalty(urgency_penalty, "Urgency language", f"Found: {', '.join(aggressive_terms[:2])}", category="content")
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

    if signals.get("too_many_links", False):
        add_penalty(14, "Too many links", "Link-heavy copy resembles bulk campaigns", category="content")
        detected_signals.append(f"• {link_count} links detected")
    elif link_count >= 2:
        add_penalty(8, "Multiple links", "Multiple links increase promotional footprint", category="content")
        detected_signals.append(f"• {link_count} links detected")
    elif link_count == 1:
        add_boost(2, "Single link", "Focused call-to-action pattern")
        detected_signals.append("• 1 link detected")
    else:
        detected_signals.append("• 0 links detected")

    if signals.get("excessive_caps", False):
        add_penalty(8, "Excessive capitalization", "Shouting style is a spam indicator", category="content")

    if signals.get("short_generic_email", False):
        add_penalty(10, "Generic CTA structure", "Short + generic outreach is high-risk", category="content")
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
        add_penalty(min(10, len(confidence_killers) * 5), "Saturated phrasing", "Overused opener language detected", category="content")

    opener_type = signals.get("opener_type")
    if email_type == "cold outreach" and opener_type in ("generic", "pattern-based"):
        add_penalty(8, "Generic opener pattern", signals.get("opener_reason", "Overused opener"), category="content")

    intent_type = signals.get("intent_type")
    if email_type == "cold outreach" and intent_type in ("no-cta", "vague"):
        add_penalty(10, "Generic/unclear CTA", "No clear low-friction ask detected", category="content")

    if signals.get("tracking_style_links", False):
        add_penalty(6, "Tracking links", "Tracking parameters can reduce trust", category="content")

    # Profile adjustments (light-touch)
    if email_type == "transactional":
        add_boost(8, "Transactional profile", "Legitimate notification pattern")
    elif email_type == "marketing/newsletter":
        add_boost(3, "Newsletter profile", "Broadcast pattern recognized")
    elif email_type == "informational/system":
        add_boost(4, "Informational profile", "Announcement/system style recognized")

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
            detected_signals.append("• Blacklist lookup unavailable")
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
            add_penalty(8, "DKIM missing", f"Default selector not found on {signals.get('dkim_checked_domain', 'domain')}", category="infra")
            detected_signals.append("• DKIM missing")
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
    score = max(35, min(95, score))

    inbox_chance = max(5, min(95, round(score * 0.9)))
    spam_risk = 100 - inbox_chance

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
        "inbox_chance": inbox_chance,
        "spam_risk": spam_risk,
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
