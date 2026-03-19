from typing import Dict, List


def score_risk(signals: Dict) -> Dict:
    risk_points = 0
    findings: List[Dict[str, str]] = []
    breakdown: List[Dict[str, str | int]] = []
    score = 65  # Baseline: above Moderate Risk threshold (60) to allow variance downward

    email_type = signals.get("email_type", "cold outreach")
    auth_verifiable = signals.get("auth_verifiable", False)
    confidence = signals.get("analysis_confidence", "medium")

    # NO AGGRESSIVE WEIGHTING - real penalties apply uniformly
    def add_penalty(points: int, label: str, reason: str, category: str = "content"):
        nonlocal risk_points, score
        # only apply infra weighting for fully verified domains
        if category == "infra" and not auth_verifiable:
            points = max(1, round(points * 0.3))  # Reduce weight if not verifiable
        
        risk_points += points
        score -= points
        breakdown.append({"label": label, "points": -points, "reason": reason})

    def add_boost(points: int, label: str, reason: str):
        nonlocal score
        score += points
        breakdown.append({"label": label, "points": points, "reason": reason})

    findings.append(
        {
            "severity": "low",
            "title": "Email type detected",
            "issue": f"Classified as {email_type}.",
            "impact": signals.get("email_type_reason", "Scoring weights adjusted by email category."),
            "fix": "Review this classification before applying any remediation plan.",
        }
    )

    findings.append(
        {
            "severity": "low",
            "title": "Analysis confidence",
            "issue": f"Confidence: {confidence.capitalize()}.",
            "impact": "Authentication-level claims are only made when enough header evidence is provided.",
            "fix": "Paste full raw headers for stronger SPF/DKIM/DMARC verification.",
        }
    )

    if email_type == "transactional":
        add_boost(25, "Transactional profile", "System/receipt emails have legitimate requirements and lower spam-risk baseline")
    elif email_type == "marketing/newsletter":
        add_boost(18, "Newsletter profile", "Legitimate broadcast emails with unsubscribe have managed-expectation licenses")
    elif email_type == "informational/system":
        add_boost(18, "Informational profile", "Announcement-style emails get neutral baseline adjustment")
    elif email_type == "cold outreach":
        # Cold outreach has high scrutiny; minimal boost
        add_boost(0, "Cold outreach profile", "First-touch outreach receives heightened filtering scrutiny")

    if signals.get("is_no_reply_sender") and email_type in ("transactional", "marketing/newsletter", "informational/system"):
        add_boost(5, "System sender pattern", "No-reply address is expected for system notifications")

    if not auth_verifiable:
        add_penalty(3, "Limited authentication evidence", "Headers are incomplete, so authentication confidence is constrained")

    # === CRITICAL CONTENT VARIANCE SIGNALS (NEW) ===
    # These create the REAL scoring variance
    
    # 1. PROMOTIONAL WORD DENSITY (major signal)
    spam_terms = signals.get("spam_terms") or []
    if spam_terms:
        penalty = min(25, len(spam_terms) * 8)  # 2+ terms = 16-24 points
        add_penalty(penalty, "Spam-adjacent phrases", f"Risky phrasing: {', '.join(spam_terms[:3])}")
        findings.append({
            "severity": "high",
            "title": "High-risk promotional language",
            "issue": f"Content includes spam-flagged phrases: {', '.join(spam_terms)}",
            "impact": "Known trigger phrasing can downrank inbox placement.",
            "fix": "Replace with specific, contextual language. Avoid trigger words like 'free', 'click now', 'urgent'.",
        })
    
    # 2. LINK DENSITY (behavioral signal)
    link_count = signals.get("link_count", 0)
    if signals.get("too_many_links", False):
        penalty = 20 if email_type == "cold outreach" else 12  # Harsher for outreach
        add_penalty(penalty, "High link density", "Too many links resembles bulk/promotional behavior")
        findings.append({
            "severity": "high",
            "title": "Link density risk",
            "issue": f"Your email contains {link_count} links - high density for first-touch communication.",
            "impact": "High link density is a known spam indicator.",
            "fix": "Keep only one primary link in initial outreach. Move additional resources to follow-up.",
        })
    elif link_count >= 2 and email_type == "cold outreach":
        add_penalty(8, "Multiple links in outreach", "Typical of automated cold email campaigns")
    elif link_count == 1:
        add_boost(3, "Single link", "Appropriate for focused outreach or transactional email")
    
    # 3. EXCESSIVE CAPS (shouting signal)
    if signals.get("excessive_caps", False):
        add_penalty(12, "Aggressive capitalization", "Excessive caps is a classic spam/shouting indicator")
        findings.append({
            "severity": "medium",
            "title": "Capitalization pattern risk",
            "issue": "The copy uses excessive capitalization.",
            "impact": "Aggressive caps is a known spam signal.",
            "fix": "Use sentence case. Reserve emphasis for one critical phrase only.",
        })
    
    # 4. AGGRESSIVE TONE (urgency + aggression = risk)
    aggressive_terms = signals.get("aggressive_tone_terms") or []
    if aggressive_terms:
        penalty = min(18, len(aggressive_terms) * 6)  # 1-3 aggressive terms = 6-18
        add_penalty(penalty, "Aggressive tone language", f"Urgent/pressure phrases: {', '.join(aggressive_terms[:2])}")
        findings.append({
            "severity": "medium",
            "title": "Urgent/aggressive tone",
            "issue": f"Message uses pressure language: {', '.join(aggressive_terms)}",
            "impact": "Urgency language reduces trust and increases filtering.",
            "fix": "Remove 'ASAP', 'urgent', 'reply today' language. Use calm, specific framing.",
        })
    
    # 5. SHORT + GENERIC (automation/bulk pattern)
    if signals.get("short_generic_email", False):
        add_penalty(15, "Generic + short pattern", "Resembles template automation")
        findings.append({
            "severity": "high",
            "title": "Template pattern detected",
            "issue": "Email is short and uses saturated generic phrases (typical of bulk outreach).",
            "impact": "Automation patterns trigger spam filtering.",
            "fix": "Expand with recipient-specific context and personalization.",
        })
    
    # 6. AUTOMATION/TEMPLATE MARKERS
    automation_level = signals.get("automation_level", "low")
    template_markers = signals.get("template_markers") or []
    if automation_level == "high" and email_type == "cold outreach":
        add_penalty(16, "High automation fingerprint", f"Strong template markers: {len(template_markers)} detected")
        findings.append({
            "severity": "high",
            "title": "Automation/template fingerprint",
            "issue": "Message structure strongly resembles automated template outreach.",
            "impact": "Template fingerprints trigger spam heuristics.",
            "fix": "Add recipient-specific context. Vary sentence structure. Remove template markers.",
        })
    elif automation_level == "medium" and email_type == "cold outreach":
        add_penalty(8, "Moderate automation markers", "Some template patterns detected")
    
    # 7. PERSONALIZATION BOOST (positive signal)
    if email_type == "cold outreach":
        # Check if email shows personalization markers
        has_personalization = any(marker in signals.get("email_type_reason", "").lower() 
                                  for marker in ["noticed", "saw your", "about your"])
        if has_personalization or signals.get("intent_type") == "question":
            add_boost(12, "Personalization detected", "Email shows recipient-specific context")
        else:
            # Penalize lack of personalization in cold outreach
            add_penalty(10, "No recipient differentiation", "Generic outreach without personalization")
    
    # 8. CONFIDENCE KILLER PHRASES (saturation)
    confidence_killers = signals.get("confidence_killers") or []
    if confidence_killers and email_type == "cold outreach":
        penalty = min(12, len(confidence_killers) * 4)
        add_penalty(penalty, "Confidence-killer phrases", f"Overused: {', '.join(confidence_killers[:2])}")
    
    # 9. TRACKING LINKS (trust violation)
    if signals.get("tracking_style_links", False):
        add_penalty(8, "Tracking parameters detected", "Tracked links reduce trust")
        findings.append({
            "severity": "low",
            "title": "Tracking-link pattern",
            "issue": "Links contain tracking parameters or redirect patterns.",
            "impact": "Tracking links increase filtering suspicion.",
            "fix": "Use direct URLs without tracking parameters in initial outreach.",
        })

    # === AUTH INFRASTRUCTURE CHECKS (when headers provided) ===
    if auth_verifiable and not signals.get("spf", False):
        add_penalty(18, "SPF policy missing", "Domain identity cannot be reliably verified", category="infra")
        findings.append({
            "severity": "high",
            "title": "SPF authentication gap",
            "issue": "Your domain does not publish a valid SPF policy.",
            "impact": "Weak sender identity signal -> higher spam risk.",
            "fix": "Publish an SPF TXT record and include your sending provider, for example: v=spf1 include:_spf.google.com ~all",
        })

    if auth_verifiable and not signals.get("spf_aligned", False):
        add_penalty(15, "From/SPF misalignment", "From header does not align with authenticated domain", category="infra")
        findings.append({
            "severity": "high",
            "title": "From header mismatch",
            "issue": "The From header domain doesn't match the sending domain.",
            "impact": "Misalignment can fail policy checks and hurt inbox trust.",
            "fix": "Send from an address aligned to your authenticated domain.",
        })

    if auth_verifiable and not signals.get("dkim", False):
        add_penalty(15, "DKIM not detected", "Message signing trust signal is missing", category="infra")
        findings.append({
            "severity": "high",
            "title": "DKIM signing not verified",
            "issue": "A valid DKIM key was not detected.",
            "impact": "Unsigned mail is more likely to be filtered by Gmail and Outlook.",
            "fix": "Enable DKIM signing in your email provider and publish the selector DNS record.",
        })

    if auth_verifiable and not signals.get("dmarc", False):
        add_penalty(10, "DMARC policy missing", "Spoof and alignment policy is not configured", category="infra")
        findings.append({
            "severity": "medium",
            "title": "DMARC policy missing",
            "issue": "No valid DMARC policy was found for your domain.",
            "impact": "Spoof protection is weak without DMARC.",
            "fix": "Publish a DMARC TXT record at _dmarc.yourdomain with at least p=none.",
        })

    # === OPENER ANALYSIS (for cold outreach)
    opener_type = signals.get("opener_type")
    if email_type == "cold outreach" and opener_type in ("generic", "pattern-based"):
        add_penalty(8, "Generic opener pattern", signals.get("opener_reason", "Saturated opener detected"))
        findings.append({
            "severity": "medium",
            "title": "Opener saturation risk",
            "issue": "Your opener uses a saturated pattern common to bulk tools.",
            "impact": "Filters recognize these patterns.",
            "fix": "Use a specific first line tied to recipient context.",
        })

    # === INTENT CLARITY (for cold outreach)
    intent_type = signals.get("intent_type")
    if email_type == "cold outreach" and intent_type in ("no-cta", "vague"):
        add_penalty(6, "Weak intent clarity", signals.get("intent_reason", "No clear ask detected"))
        findings.append({
            "severity": "low",
            "title": "Intent ambiguity",
            "issue": "No clear next step detected.",
            "impact": "Unclear intent reduces both reply rates and trust.",
            "fix": "Add one explicit question or low-friction ask.",
        })

    high_seen = 0
    for item in findings:
        if item.get("severity") == "high":
            high_seen += 1
            if high_seen > 3:
                item["severity"] = "medium"

    score = max(35, min(95, score))

    if score >= 80:
        band = "Low Risk"
    elif score >= 60:
        band = "Moderate Risk"
    else:
        band = "High Risk"

    return {
        "score": score,
        "risk_band": band,
        "risk_points": risk_points,
        "breakdown": breakdown,
        "findings": findings,
    }
