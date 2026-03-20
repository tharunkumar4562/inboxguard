from typing import Dict, List
import random


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
            "issue": f"This looks like a {email_type.replace('/', ' / ')}.",
            "impact": signals.get("email_type_reason", "").replace("Scoring weights adjusted by email category", "This affects how spam filters treat your email"),
            "fix": None,
        }
    )

    findings.append(
        {
            "severity": "low",
            "title": "Sender verification status",
            "issue": f"{'✅ Full headers provided - sender identity can be verified' if auth_verifiable else '⚠️ Partial email pasted - some authentication checks not available'}" ,
            "impact": "Full headers let us verify you're really the sender. Partial email limits our checks.",
            "fix": "Paste complete email including headers for full verification." if not auth_verifiable else None,
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
        spam_list = ', '.join([f"'{t}'" for t in spam_terms[:4]])
        findings.append({
            "severity": "high",
            "title": "High-risk promotional language detected",
            "issue": f"Your email contains {len(spam_terms)} promotional trigger phrases: {spam_list}",
            "impact": "Trigger words like these cause ISPs to downrank inbox placement.",
            "fix": "Replace with specific, contextual language. Avoid urgency markers.",
        })
    
    # 2. LINK DENSITY (behavioral signal)
    link_count = signals.get("link_count", 0)
    if signals.get("too_many_links", False):
        penalty = 20 if email_type == "cold outreach" else 12  # Harsher for outreach
        add_penalty(penalty, "High link density", "Too many links resembles bulk/promotional behavior")
        findings.append({
            "severity": "high",
            "title": f"High link density ({link_count} links)",
            "issue": f"Your email contains {link_count} hyperlinks. For first-touch communication, this looks like bulk marketing.",
            "impact": "Multiple links trigger bulk-mail heuristics in spam filters.",
            "fix": "Include only 1 primary link in initial outreach. Move secondary resources to follow-ups.",
        })
    elif link_count >= 2 and email_type == "cold outreach":
        add_penalty(8, "Multiple links in outreach", "Typical of automated cold email campaigns")
    elif link_count == 1:
        add_boost(3, "Single link pattern", "Appropriate for focused outreach")
    
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
        agg_list = ', '.join([f"'{t}'" for t in aggressive_terms[:3]])
        findings.append({
            "severity": "medium",
            "title": "Urgent/pressure tone detected",
            "issue": f"Your copy uses pressure language: {agg_list}. This reduces trust.",
            "impact": "Urgency and pressure language are associated with phishing and spam.",
            "fix": "Use calm language. Replace 'immediately', 'ASAP', 'urgent' with specific time frames or questions.",
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
        ck_list = ', '.join([f"'{t}'" for t in confidence_killers[:2]])
        findings.append({
            "severity": "medium",
            "title": "Saturated opener phrases detected",
            "issue": f"Your email opens with overused phrases: {ck_list}. These are so common they reduce credibility.",
            "impact": "Saturated phrases trigger filtering and reduce reply rates.",
            "fix": "Replace with context-specific openers tied to their company, activity, or situation.",
        })
    
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
    blacklist_status = signals.get("blacklist_status", {})
    if blacklist_status.get("blacklisted", False):
        add_penalty(30, "Domain on blacklist", "Your domain is currently listed on spam blacklists", category="infra")
        lists = ", ".join(blacklist_status.get("lists", []))
        findings.append({
            "severity": "high",
            "title": "⚠️ Domain is on spam blacklists",
            "issue": f"Your domain is listed on: {lists}. ISPs automatically block messages from blacklisted domains.",
            "impact": "Your emails will go straight to spam until the blacklist issue is resolved.",
            "fix": "If this is a mistake, request delisting from the blacklist provider. If you just started using this domain, wait 24-48 hours for lists to refresh.",
        })
    elif auth_verifiable:
        findings.append({
            "severity": "low",
            "title": "✅ Domain reputation is clean",
            "issue": "Your domain is not on major spam blacklists.",
            "impact": None,
            "fix": None,
        })

    if auth_verifiable and not signals.get("spf", False):
        add_penalty(18, "SPF policy missing", "Domain identity cannot be reliably verified", category="infra")
        findings.append({
            "severity": "high",
            "title": "SPF authentication record missing",
            "issue": f"The domain {signals.get('from_domain', 'your sending domain')} does not publish an SPF policy. ISPs cannot verify your sender identity.",
            "impact": "Unverified senders are more likely to be filtered as spam.",
            "fix": "Publish an SPF TXT record. Example: v=spf1 include:_spf.google.com include:sendgrid.net ~all",
        })

    if auth_verifiable and not signals.get("spf_aligned", False):
        add_penalty(15, "From/SPF misalignment", "From header does not align with authenticated domain", category="infra")
        findings.append({
            "severity": "high",
            "title": f"From header mismatch (SPF alignment failed)",
            "issue": f"Your From header uses {signals.get('from_domain', 'a domain')} but this doesn't match your SPF record domain.",
            "impact": "Alignment failures cause ISPs to question sender legitimacy.",
            "fix": "Send from an address that matches your authenticated domain, or publish SPF for the domain you're using.",
        })

    if auth_verifiable and not signals.get("dkim", False):
        add_penalty(15, "DKIM not detected", "Message signing trust signal is missing", category="infra")
        findings.append({
            "severity": "high",
            "title": "DKIM signing not detected",
            "issue": f"Common DKIM selector for {signals.get('from_domain', 'your domain')} was not found. Messages are unsigned.",
            "impact": "Unsigned messages are filtered more aggressively by Gmail and Outlook.",
            "fix": "Enable DKIM signing in your email provider (Gmail, Outlook, SendGrid, etc.) and publish the DNS record.",
        })

    if auth_verifiable and not signals.get("dmarc", False):
        add_penalty(10, "DMARC policy missing", "Spoof and alignment policy is not configured", category="infra")
        findings.append({
            "severity": "medium",
            "title": "DMARC policy not configured",
            "issue": f"No DMARC record found for {signals.get('from_domain', 'your domain')}. You have no anti-spoofing policy.",
            "impact": "Without DMARC, competitors can spoof your domain and your reputation suffers.",
            "fix": "Publish a DMARC TXT record at _dmarc.yourdomain.com with at least: v=DMARC1; p=none; rua=mailto:admin@yourdomain.com",
        })

    # === OPENER ANALYSIS (for cold outreach)
    opener_type = signals.get("opener_type")
    if email_type == "cold outreach" and opener_type in ("generic", "pattern-based"):
        add_penalty(8, "Generic opener pattern", signals.get("opener_reason", "Saturated opener detected"))
        findings.append({
            "severity": "medium",
            "title": "Overused opener pattern",
            "issue": signals.get("opener_reason", "Your opener uses a generic, commonly-automated pattern."),
            "impact": "Mail servers recognize these patterns as automation signatures.",
            "fix": "Start with something specific to them: a question about their work, a relevant company detail, or timely context.",
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
    
    # Add micro-randomness to prevent pattern detection
    # ±2 variation makes score feel less obviously rule-based
    score += random.randint(-2, 2)
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
