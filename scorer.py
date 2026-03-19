from typing import Dict, List


def score_risk(signals: Dict) -> Dict:
    risk_points = 0
    findings: List[Dict[str, str]] = []
    breakdown: List[Dict[str, str | int]] = []

    def add_penalty(points: int, label: str, reason: str):
        nonlocal risk_points
        risk_points += points
        breakdown.append({"label": label, "points": points, "reason": reason})

    if not signals.get("spf", False):
        add_penalty(20, "SPF policy missing", "Domain identity cannot be reliably verified by mailbox providers")
        findings.append({
            "severity": "high",
            "title": "SPF authentication gap",
            "issue": "Your domain does not publish a valid SPF policy.",
            "impact": "Mailbox providers may treat this as weak sender identity, increasing spam placement probability.",
            "fix": "Publish an SPF TXT record and include your sending provider, for example: v=spf1 include:_spf.google.com ~all",
        })

    if not signals.get("spf_aligned", False):
        add_penalty(20, "From/SPF misalignment", "From header does not align with authenticated sending domain")
        from_domain = signals.get("from_domain") or "unknown sender domain"
        findings.append({
            "severity": "high",
            "title": "From header mismatch",
            "issue": f"The From header uses {from_domain}, which is not aligned with the domain being checked.",
            "impact": "Even with SPF present, misalignment can fail policy checks and damage inbox trust for outreach traffic.",
            "fix": "Send from an address aligned to your authenticated domain, or update your sending domain and DNS to match the From header.",
        })

    if not signals.get("dkim", False):
        add_penalty(20, "DKIM not detected", "Message signing trust signal is missing")
        findings.append({
            "severity": "high",
            "title": "DKIM signing not verified",
            "issue": "A valid DKIM key was not detected for common selector checks.",
            "impact": "Unsigned or unverified messages are more likely to be treated as untrusted by Gmail and Outlook.",
            "fix": "Enable DKIM signing in your email provider and publish the selector DNS record.",
        })

    if not signals.get("dmarc", False):
        add_penalty(20, "DMARC policy missing", "Spoof and alignment policy enforcement is not configured")
        findings.append({
            "severity": "high",
            "title": "DMARC policy missing",
            "issue": "No valid DMARC policy was found for your domain.",
            "impact": "Without DMARC, spoof protection is weak and authentication consistency signals are reduced.",
            "fix": "Publish a DMARC TXT record at _dmarc.yourdomain with at least p=none and reporting enabled.",
        })

    if signals.get("spam_terms"):
        add_penalty(10, "Saturated spam-adjacent phrases", "High-frequency outreach phrases reduce credibility and filtering trust")
        findings.append({
            "severity": "medium",
            "title": "Risky phrasing detected",
            "issue": "Spam-sensitive phrases found: " + ", ".join(signals["spam_terms"][:4]),
            "impact": "Pattern-based filters can downrank outreach copy containing known promotional or bulk-intent phrases.",
            "fix": "Rewrite subject and opening lines with specific, contextual language and remove repetitive trigger wording.",
        })

    if signals.get("too_many_links", False):
        add_penalty(15, "High outbound link density", "Too many links in first-touch message looks bulk and promotional")
        findings.append({
            "severity": "medium",
            "title": "Link density risk",
            "issue": "Your copy contains too many outbound links for a first-touch email.",
            "impact": "High link density is strongly associated with bulk outreach patterns and can increase spam probability.",
            "fix": "Keep only one primary link in initial outreach and move other resources to follow-up messages.",
        })

    if signals.get("excessive_caps", False):
        add_penalty(10, "Aggressive capitalization", "Visual shouting patterns correlate with lower inbox trust")
        findings.append({
            "severity": "medium",
            "title": "Capitalization pattern risk",
            "issue": "The copy uses excessive capitalization in body or headings.",
            "impact": "Aggressive visual emphasis is a common spam signal and can lower inbox confidence.",
            "fix": "Use sentence case and reserve emphasis for one short phrase only.",
        })

    if signals.get("sending_pattern_risk", False):
        add_penalty(15, "Bulk-outreach behavior signal", "Message structure resembles automated campaign patterns")
        aggressive_terms = signals.get("aggressive_tone_terms") or []
        detail = ""
        if aggressive_terms:
            detail = " Aggressive tone markers: " + ", ".join(aggressive_terms[:3]) + "."
        findings.append({
            "severity": "high",
            "title": "Bulk-outreach behavior match",
            "issue": "Your message pattern matches bulk outreach behavior (links, tone, or short generic framing)." + detail,
            "impact": "Behavioral heuristics can trigger filtering even when DNS setup appears healthy.",
            "fix": "Use personalized context, reduce urgency language, and expand the message with specific recipient relevance.",
        })

    if signals.get("tracking_style_links", False):
        add_penalty(8, "Tracking-style links detected", "Tracking-heavy link patterns can lower trust on cold sends")
        findings.append({
            "severity": "medium",
            "title": "Tracking-link pattern risk",
            "issue": "Links include tracking-style parameters or redirect patterns.",
            "impact": "Heavily tracked links can increase filtering suspicion on first-touch outreach.",
            "fix": "Use one clean destination URL without tracking parameters in initial sends.",
        })

    opener_type = signals.get("opener_type")
    if opener_type in ("generic", "pattern-based"):
        add_penalty(10, "Low-differentiation opener", signals.get("opener_reason", "Generic opener pattern"))
        findings.append({
            "severity": "medium",
            "title": "Opener saturation risk",
            "issue": signals.get("opener_reason", "Your opener appears too generic."),
            "impact": "Saturated openers lower reply trust and increase bulk-message perception.",
            "fix": "Use a context-specific first line tied to recipient activity or company signal.",
        })

    intent_type = signals.get("intent_type")
    if intent_type in ("no-cta", "vague"):
        add_penalty(8, "Intent clarity weak", signals.get("intent_reason", "Message intent is unclear"))
        findings.append({
            "severity": "medium",
            "title": "Intent ambiguity",
            "issue": signals.get("intent_reason", "No clear ask detected."),
            "impact": "Unclear intent reduces reply probability and weakens human-message signal.",
            "fix": "Add one explicit next step with a low-friction question or scheduling ask.",
        })

    confidence_killers = signals.get("confidence_killers") or []
    if confidence_killers:
        add_penalty(10, "Confidence-killer phrases", "Overused confidence-killer openers detected")
        findings.append({
            "severity": "high",
            "title": "Confidence-killer phrase saturation",
            "issue": "Overused phrases detected: " + ", ".join(confidence_killers[:3]),
            "impact": "These phrases are heavily saturated across automation tools and often underperform.",
            "fix": "Replace saturated phrases with specific context and a clear reason for outreach.",
        })

    if signals.get("automation_level") == "high":
        add_penalty(12, "Automation fingerprint high", "Template markers and repeated outreach phrases were detected")
        findings.append({
            "severity": "high",
            "title": "Automation fingerprint detected",
            "issue": "Message structure strongly resembles automated template outreach.",
            "impact": "High automation signatures can reduce inbox trust and reply likelihood.",
            "fix": "Reduce template markers, vary sentence patterns, and add recipient-specific context.",
        })

    score = max(0, 100 - risk_points)

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
