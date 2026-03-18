from typing import Dict, List


def score_risk(signals: Dict) -> Dict:
    risk_points = 0
    findings: List[Dict[str, str]] = []

    if not signals.get("spf", False):
        risk_points += 20
        findings.append({
            "severity": "high",
            "title": "SPF authentication gap",
            "issue": "Your domain does not publish a valid SPF policy.",
            "impact": "Mailbox providers may treat this as weak sender identity, increasing spam placement probability.",
            "fix": "Publish an SPF TXT record and include your sending provider, for example: v=spf1 include:_spf.google.com ~all",
        })

    if not signals.get("spf_aligned", False):
        risk_points += 20
        from_domain = signals.get("from_domain") or "unknown sender domain"
        findings.append({
            "severity": "high",
            "title": "From header mismatch",
            "issue": f"The From header uses {from_domain}, which is not aligned with the domain being checked.",
            "impact": "Even with SPF present, misalignment can fail policy checks and damage inbox trust for outreach traffic.",
            "fix": "Send from an address aligned to your authenticated domain, or update your sending domain and DNS to match the From header.",
        })

    if not signals.get("dkim", False):
        risk_points += 20
        findings.append({
            "severity": "high",
            "title": "DKIM signing not verified",
            "issue": "A valid DKIM key was not detected for common selector checks.",
            "impact": "Unsigned or unverified messages are more likely to be treated as untrusted by Gmail and Outlook.",
            "fix": "Enable DKIM signing in your email provider and publish the selector DNS record.",
        })

    if not signals.get("dmarc", False):
        risk_points += 20
        findings.append({
            "severity": "high",
            "title": "DMARC policy missing",
            "issue": "No valid DMARC policy was found for your domain.",
            "impact": "Without DMARC, spoof protection is weak and authentication consistency signals are reduced.",
            "fix": "Publish a DMARC TXT record at _dmarc.yourdomain with at least p=none and reporting enabled.",
        })

    if signals.get("spam_terms"):
        risk_points += 10
        findings.append({
            "severity": "medium",
            "title": "Risky phrasing detected",
            "issue": "Spam-sensitive phrases found: " + ", ".join(signals["spam_terms"][:4]),
            "impact": "Pattern-based filters can downrank outreach copy containing known promotional or bulk-intent phrases.",
            "fix": "Rewrite subject and opening lines with specific, contextual language and remove repetitive trigger wording.",
        })

    if signals.get("too_many_links", False):
        risk_points += 15
        findings.append({
            "severity": "medium",
            "title": "Link density risk",
            "issue": "Your copy contains too many outbound links for a first-touch email.",
            "impact": "High link density is strongly associated with bulk outreach patterns and can increase spam probability.",
            "fix": "Keep only one primary link in initial outreach and move other resources to follow-up messages.",
        })

    if signals.get("excessive_caps", False):
        risk_points += 10
        findings.append({
            "severity": "medium",
            "title": "Capitalization pattern risk",
            "issue": "The copy uses excessive capitalization in body or headings.",
            "impact": "Aggressive visual emphasis is a common spam signal and can lower inbox confidence.",
            "fix": "Use sentence case and reserve emphasis for one short phrase only.",
        })

    if signals.get("sending_pattern_risk", False):
        risk_points += 15
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
        "findings": findings,
    }
