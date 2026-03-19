from typing import Dict, List


def score_risk(signals: Dict) -> Dict:
    risk_points = 0
    findings: List[Dict[str, str]] = []
    breakdown: List[Dict[str, str | int]] = []
    score = 70

    email_type = signals.get("email_type", "cold outreach")
    auth_verifiable = signals.get("auth_verifiable", False)
    confidence = signals.get("analysis_confidence", "medium")

    def weighted(points: int, category: str = "content") -> int:
        if category == "infra":
            return points
        if email_type == "marketing/newsletter":
            return max(1, round(points * 0.6))
        if email_type == "transactional":
            return max(1, round(points * 0.5))
        if email_type == "informational/system":
            return max(1, round(points * 0.5))
        return points

    def add_penalty(points: int, label: str, reason: str, category: str = "content"):
        nonlocal risk_points, score
        applied_points = weighted(points, category=category)
        risk_points += applied_points
        score -= applied_points
        breakdown.append({"label": label, "points": -applied_points, "reason": reason})

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
        add_boost(10, "Transactional profile", "System-style email profile lowers spam-risk weighting")
    elif email_type == "marketing/newsletter":
        add_boost(4, "Newsletter profile", "Broadcast email profile applies moderated weighting")
    elif email_type == "informational/system":
        add_boost(6, "Informational profile", "Informational notices get neutral-safe baseline treatment")

    if signals.get("is_no_reply_sender") and email_type in ("transactional", "marketing/newsletter", "informational/system"):
        add_boost(3, "System sender pattern", "No-reply sender is common for system/broadcast mail")

    if not auth_verifiable:
        add_penalty(4, "Limited authentication evidence", "Headers are incomplete, so authentication confidence is constrained")

    if auth_verifiable and not signals.get("spf", False):
        add_penalty(20, "SPF policy missing", "Domain identity cannot be reliably verified", category="infra")
        findings.append({
            "severity": "high",
            "title": "SPF authentication gap",
            "issue": "Your domain does not publish a valid SPF policy.",
            "impact": "Weak sender identity signal -> higher spam risk.",
            "fix": "Publish an SPF TXT record and include your sending provider, for example: v=spf1 include:_spf.google.com ~all",
        })

    if auth_verifiable and not signals.get("spf_aligned", False):
        add_penalty(20, "From/SPF misalignment", "From header does not align with authenticated domain", category="infra")
        from_domain = signals.get("from_domain") or "unknown sender domain"
        findings.append({
            "severity": "high",
            "title": "From header mismatch",
            "issue": f"The From header uses {from_domain}, which is not aligned with the domain being checked.",
            "impact": "Misalignment can fail policy checks and hurt inbox trust.",
            "fix": "Send from an address aligned to your authenticated domain, or update your sending domain and DNS to match the From header.",
        })

    if auth_verifiable and not signals.get("dkim", False):
        add_penalty(20, "DKIM not detected", "Message signing trust signal is missing", category="infra")
        findings.append({
            "severity": "high",
            "title": "DKIM signing not verified",
            "issue": "A valid DKIM key was not detected for common selector checks.",
            "impact": "Unsigned mail is more likely to be filtered by Gmail and Outlook.",
            "fix": "Enable DKIM signing in your email provider and publish the selector DNS record.",
        })

    if auth_verifiable and not signals.get("dmarc", False):
        add_penalty(20, "DMARC policy missing", "Spoof and alignment policy is not configured", category="infra")
        findings.append({
            "severity": "high",
            "title": "DMARC policy missing",
            "issue": "No valid DMARC policy was found for your domain.",
            "impact": "Spoof protection is weak without DMARC.",
            "fix": "Publish a DMARC TXT record at _dmarc.yourdomain with at least p=none and reporting enabled.",
        })

    if signals.get("spam_terms"):
        add_penalty(10, "Spam-adjacent phrases", "High-frequency phrases reduce trust")
        findings.append({
            "severity": "medium",
            "title": "Risky phrasing detected",
            "issue": "Spam-sensitive phrases found: " + ", ".join(signals["spam_terms"][:4]),
            "impact": "Known trigger phrasing can downrank inbox placement.",
            "fix": "Rewrite subject and opening lines with specific, contextual language and remove repetitive trigger wording.",
        })

    link_count = signals.get("link_count", 0)
    if signals.get("too_many_links", False):
        if email_type == "marketing/newsletter" and link_count <= 6:
            findings.append({
                "severity": "low",
                "title": "Expected newsletter link pattern",
                "issue": "Multiple links detected, but this can be normal for newsletter-style emails.",
                "impact": "No strong penalty applied for this email category.",
                "fix": "Keep links focused and avoid unnecessary redirects.",
            })
        else:
            add_penalty(15, "High link density", "Too many links looks bulk/promotional")
            findings.append({
                "severity": "medium",
                "title": "Link density risk",
                "issue": "Your copy contains too many outbound links for a first-touch email.",
                "impact": "High link density increases spam probability.",
                "fix": "Keep only one primary link in initial outreach and move other resources to follow-up messages.",
            })

    if signals.get("excessive_caps", False):
        add_penalty(10, "Aggressive capitalization", "Visual shouting lowers inbox trust")
        findings.append({
            "severity": "low",
            "title": "Capitalization pattern risk",
            "issue": "The copy uses excessive capitalization in body or headings.",
            "impact": "Visual shouting is a known spam signal.",
            "fix": "Use sentence case and reserve emphasis for one short phrase only.",
        })

    if signals.get("sending_pattern_risk", False) and email_type == "cold outreach":
        add_penalty(15, "Bulk behavior signal", "Message structure resembles automation patterns")
        aggressive_terms = signals.get("aggressive_tone_terms") or []
        detail = ""
        if aggressive_terms:
            detail = " Aggressive tone markers: " + ", ".join(aggressive_terms[:3]) + "."
        findings.append({
            "severity": "medium",
            "title": "Bulk-outreach behavior match",
            "issue": "Your message pattern matches bulk outreach behavior (links, tone, or short generic framing)." + detail,
            "impact": "Behavioral heuristics can trigger spam filtering.",
            "fix": "Use personalized context, reduce urgency language, and expand the message with specific recipient relevance.",
        })

    if signals.get("tracking_style_links", False):
        add_penalty(8, "Tracking links detected", "Tracking-heavy links can lower trust")
        findings.append({
            "severity": "low",
            "title": "Tracking-link pattern risk",
            "issue": "Links include tracking-style parameters or redirect patterns.",
            "impact": "Tracked links increase filtering suspicion.",
            "fix": "Use one clean destination URL without tracking parameters in initial sends.",
        })

    opener_type = signals.get("opener_type")
    if email_type == "cold outreach" and opener_type in ("generic", "pattern-based"):
        add_penalty(10, "Low-differentiation opener", signals.get("opener_reason", "Generic opener pattern"))
        findings.append({
            "severity": "medium",
            "title": "Opener saturation risk",
            "issue": signals.get("opener_reason", "Your opener appears too generic."),
            "impact": "Saturated openers lower reply trust.",
            "fix": "Use a context-specific first line tied to recipient activity or company signal.",
        })

    intent_type = signals.get("intent_type")
    if email_type == "cold outreach" and intent_type in ("no-cta", "vague"):
        add_penalty(8, "Intent clarity weak", signals.get("intent_reason", "Message intent is unclear"))
        findings.append({
            "severity": "low",
            "title": "Intent ambiguity",
            "issue": signals.get("intent_reason", "No clear ask detected."),
            "impact": "Unclear intent reduces reply probability.",
            "fix": "Add one explicit next step with a low-friction question or scheduling ask.",
        })

    confidence_killers = signals.get("confidence_killers") or []
    if confidence_killers and email_type == "cold outreach":
        add_penalty(10, "Confidence-killer phrases", "Overused openers detected")
        findings.append({
            "severity": "medium",
            "title": "Confidence-killer phrase saturation",
            "issue": "Overused phrases detected: " + ", ".join(confidence_killers[:3]),
            "impact": "These phrases often underperform and trigger filtering heuristics.",
            "fix": "Replace saturated phrases with specific context and a clear reason for outreach.",
        })

    if signals.get("automation_level") == "high" and email_type == "cold outreach":
        add_penalty(12, "Automation fingerprint high", "Template markers and repeated phrases detected")
        findings.append({
            "severity": "medium",
            "title": "Automation fingerprint detected",
            "issue": "Message structure strongly resembles automated template outreach.",
            "impact": "High automation signatures reduce inbox trust.",
            "fix": "Reduce template markers, vary sentence patterns, and add recipient-specific context.",
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
