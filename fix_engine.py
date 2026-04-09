from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List
import re


@dataclass
class Issue:
    type: str
    severity: str
    span: str = ""
    meta: Dict[str, Any] | None = None

    def to_dict(self) -> Dict[str, Any]:
        payload = asdict(self)
        payload["meta"] = self.meta or {}
        return payload


FIX_STRATEGIES = {
    "weak_cta": "fix_weak_cta",
    "spam_phrase": "fix_spam_phrase",
    "long_intro": "fix_long_intro",
    "generic_personalization": "fix_personalization",
    "no_clear_value": "fix_value_prop",
}


def _severity_weight(severity: str) -> int:
    normalized = str(severity or "low").strip().lower()
    if normalized == "high":
        return 30
    if normalized == "medium":
        return 15
    return 5


def _first_nonempty(items: List[str], fallback: str = "") -> str:
    for item in items:
        value = str(item or "").strip()
        if value:
            return value
    return fallback


def _extract_subject(raw_email: str) -> str:
    match = re.search(r"^\s*Subject:\s*(.+)$", raw_email or "", flags=re.IGNORECASE | re.MULTILINE)
    return str(match.group(1)).strip() if match else ""


def _extract_first_name(raw_email: str) -> str:
    match = re.search(r"\b(?:hi|hello|hey|dear)\s+([A-Za-z][A-Za-z\-]{1,24})\b", raw_email or "", flags=re.IGNORECASE)
    if not match:
        return "there"
    token = str(match.group(1)).strip().lower()
    if token in {"team", "there", "all", "friend", "sir", "madam"}:
        return "there"
    return token.capitalize()


def _context(raw_email: str, signals: Dict[str, Any]) -> Dict[str, str]:
    return {
        "name": _extract_first_name(raw_email),
        "subject": _extract_subject(raw_email),
        "industry": _first_nonempty([
            str(signals.get("intent_type", "")).replace("_", " "),
            "your market",
        ]),
    }


def _normalized_issue_type(fix: Dict[str, Any], signals: Dict[str, Any]) -> str:
    raw_type = str(fix.get("type") or "").strip().lower()
    title = str(fix.get("title") or "").lower()

    if raw_type in {"cta_pressure", "urgency_pressure"} or "cta" in title:
        return "weak_cta"
    if raw_type in {"spam_phrases", "broadcast_marketing"} or "spam" in title or "promotional" in title:
        return "spam_phrase"
    if raw_type in {"short_generic", "repetitive_structure"}:
        return "long_intro"
    if raw_type in {"missing_personalization", "generic_salutation"} or "personal" in title:
        return "generic_personalization"
    if raw_type in {"targeting_unclear", "confidence_killers"}:
        return "no_clear_value"

    # Fallback from current scan signals.
    if bool(signals.get("cta_phrases")):
        return "weak_cta"
    if bool(signals.get("spam_terms")):
        return "spam_phrase"
    if not bool(signals.get("recipient_name_present", False)):
        return "generic_personalization"
    return "no_clear_value"


def _issue_span(issue_type: str, signals: Dict[str, Any]) -> str:
    if issue_type == "weak_cta":
        phrases = signals.get("cta_phrases") or []
        return _first_nonempty([str(phrases[0]) if phrases else "", "Let me know your thoughts"])
    if issue_type == "spam_phrase":
        phrases = signals.get("spam_terms") or []
        return _first_nonempty([str(phrases[0]) if phrases else "", "Limited time"])
    if issue_type == "generic_personalization":
        return "Hi there"
    if issue_type == "long_intro":
        return "I hope you are doing well"
    return ""


def _severity(points: int) -> str:
    if points >= 25:
        return "high"
    if points >= 12:
        return "medium"
    return "low"


def issues_from_analysis(summary: Dict[str, Any], signals: Dict[str, Any]) -> List[Issue]:
    issues: List[Issue] = []
    top_fixes = summary.get("top_fixes") or []
    for item in top_fixes[:5]:
        if not isinstance(item, dict):
            continue
        points = int(item.get("points") or 0)
        issue_type = _normalized_issue_type(item, signals)
        issues.append(
            Issue(
                type=issue_type,
                severity=_severity(points),
                span=_issue_span(issue_type, signals),
                meta={
                    "source_type": str(item.get("type") or ""),
                    "title": str(item.get("title") or ""),
                    "points": points,
                    "action": str(item.get("action") or ""),
                },
            )
        )

    if not issues:
        # Ensure downstream always has at least one issue to fix.
        issues.append(Issue(type="no_clear_value", severity="medium", span="", meta={"source": "fallback"}))

    return issues


def fix_weak_cta(issue: Issue, context: Dict[str, str]) -> Dict[str, Any]:
    return {
        "problem": "CTA is passive and easy to ignore",
        "fix": {
            "replace": issue.span,
            "with": [
                "Open to a quick 15 min this week?",
                "Worth a quick look this week?",
                "Can we test this for your team?",
            ],
        },
    }


def fix_spam_phrase(issue: Issue, context: Dict[str, str]) -> Dict[str, Any]:
    return {
        "problem": "Spam-triggering phrase detected",
        "fix": {
            "replace": issue.span,
            "with": [
                "Quick thought",
                "Saw something interesting",
                "Noticed this recently",
            ],
        },
    }


def fix_personalization(issue: Issue, context: Dict[str, str]) -> Dict[str, Any]:
    return {
        "problem": "No specific insight about recipient",
        "fix": {
            "rewrite": [
                f"I noticed your team is working on {context.get('industry', 'your market')}",
                "Saw your recent activity and had one quick thought",
                "Looked at your current setup and something stood out",
            ]
        },
    }


def fix_long_intro(issue: Issue, context: Dict[str, str]) -> Dict[str, Any]:
    return {
        "problem": "Intro delays value delivery",
        "fix": {
            "instruction": "Remove first 1-2 lines and start with insight",
            "example": "Your current outreach may be missing replies due to...",
        },
    }


def fix_value_prop(issue: Issue, context: Dict[str, str]) -> Dict[str, Any]:
    return {
        "problem": "No clear outcome for the reader",
        "fix": {
            "add": [
                "This typically increases reply rates",
                "Teams fixing this see better engagement",
                "This is usually the fastest win",
            ]
        },
    }


def generate_fixes(issues: List[Issue], context: Dict[str, str]) -> List[Dict[str, Any]]:
    fixes: List[Dict[str, Any]] = []
    for issue in issues:
        strategy_name = FIX_STRATEGIES.get(issue.type)
        if not strategy_name:
            continue
        strategy_fn = globals().get(strategy_name)
        if not callable(strategy_fn):
            continue
        data = strategy_fn(issue, context)
        fixes.append({
            "type": issue.type,
            "severity": issue.severity,
            "data": data,
        })
    return fixes


def _build_insight_version(context: Dict[str, str]) -> str:
    return (
        f"Subject: Quick thought on {context.get('subject') or 'reply rates'}\n\n"
        f"Hi {context.get('name', 'there')},\n\n"
        "I noticed your email uses patterns that often reduce reply rates.\n"
        "Fixing this usually improves engagement quickly.\n\n"
        "Worth testing a sharper version?\n"
    )


def _build_loss_version(context: Dict[str, str]) -> str:
    return (
        f"Subject: Missed replies from {context.get('subject') or 'current outreach'}\n\n"
        f"Hi {context.get('name', 'there')},\n\n"
        "This draft can lose replies due to vague intent and passive CTA.\n"
        "Even interested prospects may skip it.\n\n"
        "Want me to share the fixed version?\n"
    )


def _build_pattern_version(context: Dict[str, str]) -> str:
    return (
        "Subject: Your email pattern may be ignored\n\n"
        f"Hi {context.get('name', 'there')},\n\n"
        "The current structure matches patterns often filtered or skipped.\n"
        "A clearer insight + CTA usually performs better in 1-2 campaigns.\n\n"
        "Open to a quick look this week?\n"
    )


def generate_variants(email: str, fixes: List[Dict[str, Any]], context: Dict[str, str]) -> Dict[str, str]:
    return {
        "insight": _build_insight_version(context),
        "loss": _build_loss_version(context),
        "pattern": _build_pattern_version(context),
    }


def estimate_impact(issues: List[Issue]) -> int:
    total = sum(_severity_weight(issue.severity) for issue in issues)
    return min(100, total)


def impact_range_label(impact_score: int) -> str:
    low = max(5, int(round(impact_score * 0.7)))
    high = min(95, int(round(impact_score * 1.1)))
    if high < low:
        high = low
    return f"+{low}-{high}%"


def build_fix_engine_payload(raw_email: str, summary: Dict[str, Any], signals: Dict[str, Any]) -> Dict[str, Any]:
    issues = issues_from_analysis(summary, signals)
    ctx = _context(raw_email, signals)
    fixes = generate_fixes(issues, ctx)
    variants = generate_variants(raw_email, fixes, ctx)
    impact_score = estimate_impact(issues)

    return {
        "issues": [issue.to_dict() for issue in issues],
        "fixes": fixes,
        "variants": variants,
        "impact_score": impact_score,
        "impact_label": impact_range_label(impact_score),
    }
