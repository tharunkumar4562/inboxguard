from datetime import date
from pathlib import Path
import logging
import os

from fastapi import FastAPI, Form, Request, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from jinja2 import TemplateNotFound, TemplateError

from analyzer import analyze_email
from analytics import get_dashboard_data, track_event
from correction_engine import get_learning_profile, record_feedback, rewrite_email_text
from utils import build_email_from_raw, extract_domain_from_text

app = FastAPI(title="InboxGuard")

logger = logging.getLogger("inboxguard")
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

SITE_URL = os.getenv("INBOXGUARD_SITE_URL", "https://inboxguard.me")
ADMIN_TOKEN = os.getenv("INBOXGUARD_ADMIN_TOKEN", "")
GOOGLE_VERIFICATION_FILE = "googleab4b33a28d8dfb88.html"
LONG_TAIL_PAGES = [
    {
        "slug": "fix-godaddy-spam-issues",
        "provider": "GoDaddy",
        "problem": "spam issues",
        "query": "How to fix DMARC for GoDaddy",
    },
    {
        "slug": "instantly-deliverability-audit",
        "provider": "Instantly",
        "problem": "deliverability audit",
        "query": "Why are my Instantly emails hitting spam?",
    },
    {
        "slug": "hostinger-email-deliverability-audit",
        "provider": "Hostinger",
        "problem": "email deliverability audit",
        "query": "Hostinger email deliverability audit",
    },
]
LONG_TAIL_BY_SLUG = {item["slug"]: item for item in LONG_TAIL_PAGES}


def render_template_safe(request: Request, template_name: str, context: dict, status_code: int = 200):
    payload = {"request": request, **context}
    try:
        return templates.TemplateResponse(request=request, name=template_name, context=payload, status_code=status_code)
    except TemplateNotFound:
        logger.exception("Template not found: %s", template_name)
    except TemplateError:
        logger.exception("Template render error for %s", template_name)
    except Exception:
        logger.exception("Unexpected template error for %s", template_name)

    return HTMLResponse(
        content=(
            "<!doctype html><html><head><title>InboxGuard</title></head>"
            "<body><h1>InboxGuard is recovering</h1>"
            "<p>Please refresh in a minute. If the issue persists, use /health to verify service status.</p>"
            "</body></html>"
        ),
        status_code=503,
    )


@app.on_event("startup")
def log_template_environment() -> None:
    try:
        template_files = sorted([p.name for p in TEMPLATES_DIR.glob("*.html")]) if TEMPLATES_DIR.exists() else []
        logger.warning(
            "Startup paths base=%s templates=%s static=%s templates_exists=%s static_exists=%s template_files=%s",
            BASE_DIR,
            TEMPLATES_DIR,
            STATIC_DIR,
            TEMPLATES_DIR.exists(),
            STATIC_DIR.exists(),
            template_files,
        )
    except Exception:
        logger.exception("Failed to log template/static startup diagnostics")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/favicon.ico")
def favicon_ico():
    return FileResponse(STATIC_DIR / "favicon-48.png", media_type="image/png")


@app.get(f"/{GOOGLE_VERIFICATION_FILE}")
def google_site_verification():
    target = BASE_DIR / GOOGLE_VERIFICATION_FILE
    if not target.exists():
        raise HTTPException(status_code=404, detail="Verification file not found")
    return FileResponse(target, media_type="text/html")


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    track_event("page_view", {"page": "home"})
    return render_template_safe(
        request,
        "index.html",
        {
            "page_title": "InboxGuard | Your cold email looked fine. Gmail disagreed.",
            "meta_description": "Find out why emails that look fine still land in spam. Fix risky drafts before you hit send and protect your domain.",
            "canonical_url": f"{SITE_URL}/",
            "focus_query": "why did my email go to spam",
        },
    )


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return RedirectResponse(url="/access", status_code=307)


@app.get("/access", response_class=HTMLResponse)
def access_page(request: Request):
    track_event("page_view", {"page": "access"})
    return render_template_safe(
        request,
        "login.html",
        {
            "page_title": "Get Access | InboxGuard",
            "meta_description": "Enter your email to unlock your full InboxGuard remediation report instantly.",
            "canonical_url": f"{SITE_URL}/access",
        },
    )


@app.get("/p/{slug}", response_class=HTMLResponse)
def programmatic_page(request: Request, slug: str):
    item = LONG_TAIL_BY_SLUG.get(slug)
    if item is None:
        return render_template_safe(
            request,
            "index.html",
            {
                "page_title": "Email Deliverability Audit | InboxGuard",
                "meta_description": "Run a fast email deliverability audit before sending.",
                "canonical_url": f"{SITE_URL}/",
                "focus_query": "email deliverability audit",
            },
            status_code=404,
        )

    track_event("page_view", {"page": f"p/{slug}"})

    title = f"{item['query']} | InboxGuard"
    description = (
        f"{item['provider']} users: diagnose {item['problem']} with SPF/DKIM/DMARC checks, "
        "header-alignment analysis, and copy risk diagnostics before you send."
    )

    return render_template_safe(
        request,
        "landing.html",
        {
            "page_title": title,
            "meta_description": description,
            "canonical_url": f"{SITE_URL}/p/{item['slug']}",
            "focus_query": item["query"],
            "provider": item["provider"],
            "problem": item["problem"],
        },
    )


@app.get("/robots.txt", response_class=PlainTextResponse)
def robots_txt():
    return PlainTextResponse(
        "\n".join(
            [
                "User-agent: *",
                "Allow: /",
                f"Sitemap: {SITE_URL}/sitemap.xml",
            ]
        )
    )


@app.get("/sitemap.xml")
def sitemap_xml():
    today = date.today().isoformat()
    urls = [f"{SITE_URL}/"] + [f"{SITE_URL}/p/{item['slug']}" for item in LONG_TAIL_PAGES]

    body = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for url in urls:
        body.extend(["  <url>", f"    <loc>{url}</loc>", f"    <lastmod>{today}</lastmod>", "  </url>"])
    body.append("</urlset>")

    return Response(content="\n".join(body), media_type="application/xml")


@app.post("/analyze")
def analyze(
    email: str = Form(""),
    domain: str = Form(""),
    raw_email: str = Form(""),
    manual_subject: str = Form(""),
    manual_body: str = Form(""),
    analysis_mode: str = Form("content"),
):
    """
    Single Source of Truth enforcement:
    - If raw_email is provided and substantial (>20 chars), use ONLY raw_email
    - Otherwise, use manual fields (email + domain)
    - Never mix sources
    """
    raw_text = raw_email.strip()
    email_text = email.strip()
    domain_text = domain.strip()
    manual_subject_text = manual_subject.strip()
    manual_body_text = manual_body.strip()

    # Determine which source to use
    use_raw = len(raw_text) > 20

    if use_raw:
        # ONLY use raw_email, ignore manual fields
        parsed_email = build_email_from_raw(raw_text, fallback_email="")
        parsed_domain = extract_domain_from_text(raw_text) or ""
        parsed_subject = ""
        parsed_body = ""
    else:
        # ONLY use manual fields
        parsed_subject = manual_subject_text or email_text
        parsed_body = manual_body_text
        if parsed_subject and parsed_body:
            parsed_email = f"Subject: {parsed_subject}\n\n{parsed_body}"
        else:
            parsed_email = email_text or parsed_body or ""
        parsed_domain = domain_text or ""

    # Guarantee fallback: ensure we have something to analyze
    if not parsed_email:
        parsed_email = f"To: {parsed_domain}\n\nNo content provided"

    mode = (analysis_mode or "content").strip().lower()
    if mode not in ("content", "full"):
        mode = "content"

    track_event("analyze_request", {"mode": mode})

    result = analyze_email(
        parsed_email,
        parsed_domain,
        raw_text,
        mode,
        subject_override=parsed_subject,
        body_override=parsed_body,
    )
    result["learning_profile"] = get_learning_profile()
    return result


def _risk_rank(band: str) -> int:
    normalized = str(band or "").strip().lower()
    if "high" in normalized:
        return 3
    if "review" in normalized or "medium" in normalized:
        return 2
    if "safe" in normalized or "low" in normalized:
        return 1
    return 2


def _summarize_rewrite_changes(original: str, rewritten: str, issue_titles: list[str]) -> list[str]:
    original_words = len((original or "").split())
    rewritten_words = len((rewritten or "").split())
    changes: list[str] = []

    if original_words and rewritten_words:
        changes.append(f"Reduced length ({original_words} -> {rewritten_words} words).")

    issue_blob = " ".join(issue_titles).lower()
    if any(token in issue_blob for token in ["urgency", "pressure"]):
        changes.append("Removed pressure language and softened urgency phrasing.")
    if any(token in issue_blob for token in ["broadcast", "mass", "personalization"]):
        changes.append("Shifted broadcast tone into a 1:1 message format.")
    if any(token in issue_blob for token in ["cta", "call to action"]):
        changes.append("Used a lower-pressure CTA to improve trust signals.")

    if not changes:
        changes.append("Simplified structure and improved readability for mailbox filters.")

    return changes[:4]


def _style_acceptance(style: str, from_band: str, to_band: str, score_delta: int) -> bool:
    from_rank = _risk_rank(from_band)
    to_rank = _risk_rank(to_band)
    band_got_worse = to_rank > from_rank

    if style == "safe":
        return (not band_got_worse) and score_delta >= 0
    if style == "balanced":
        return (not band_got_worse) and score_delta >= -2
    return score_delta >= -6


@app.post("/rewrite")
def rewrite_email(
    raw_email: str = Form(""),
    domain: str = Form(""),
    analysis_mode: str = Form("content"),
    rewrite_style: str = Form("balanced"),
):
    original = (raw_email or "").strip()
    clean_domain = (domain or "").strip()

    if len(original) < 20:
        raise HTTPException(status_code=400, detail="Email draft is too short to rewrite")

    mode = (analysis_mode or "content").strip().lower()
    if mode not in ("content", "full"):
        mode = "content"

    style = (rewrite_style or "balanced").strip().lower()
    if style not in ("safe", "balanced", "aggressive"):
        style = "balanced"

    if os.getenv("INBOXGUARD_REWRITE_DEBUG", "0") == "1":
        debug_safe = rewrite_email_text(original, intent_type="cold outreach", rewrite_style="safe")
        debug_balanced = rewrite_email_text(original, intent_type="cold outreach", rewrite_style="balanced")
        debug_aggressive = rewrite_email_text(original, intent_type="cold outreach", rewrite_style="aggressive")
        if debug_safe == debug_balanced or debug_balanced == debug_aggressive or debug_safe == debug_aggressive:
            logger.warning("Rewrite style collapse detected for current draft")

    before = analyze_email(original, clean_domain, original, mode)
    before_summary = before.get("summary", {})
    findings = before.get("partial_findings", [])
    issue_titles = [str(item.get("title", "")) for item in findings if isinstance(item, dict)]
    email_intent = str(before_summary.get("email_type", "cold outreach"))

    before_score = int(before_summary.get("final_score", before_summary.get("score", 0)))
    rewritten = rewrite_email_text(original, issue_titles, intent_type=email_intent, rewrite_style=style)
    if len(rewritten.strip()) < 20:
        rewritten = original

    after = analyze_email(rewritten, clean_domain, rewritten, mode)
    after_summary = after.get("summary", {})
    after_score = int(after_summary.get("final_score", after_summary.get("score", 0)))

    score_delta = after_score - before_score

    from_band = str(before_summary.get("risk_band", "Needs Review"))
    to_band = str(after_summary.get("risk_band", "Needs Review"))

    if not _style_acceptance(style, from_band, to_band, score_delta):
        rewritten = original
        after = before
        after_summary = before_summary
        after_score = before_score
        score_delta = 0
        to_band = from_band

    logger.info(
        "Rewrite mode=%s from_band=%s to_band=%s score_delta=%s",
        style,
        from_band,
        to_band,
        score_delta,
    )

    track_event(
        "rewrite_request",
        {
            "mode": mode,
            "rewrite_style": style,
            "score_delta": score_delta,
            "from_risk_band": from_band,
            "to_risk_band": to_band,
            "improved": _risk_rank(to_band) < _risk_rank(from_band),
        },
    )

    rewrite_changes = _summarize_rewrite_changes(original, rewritten, issue_titles)
    rewrite_changes.insert(0, f"Mode applied: {style.title()}.")

    return {
        "ok": True,
        "original_text": original,
        "rewritten_text": rewritten,
        "rewrite_style": style,
        "from_risk_band": from_band,
        "to_risk_band": to_band,
        "from_score": before_score,
        "to_score": after_score,
        "score_delta": score_delta,
        "rewrite_changes": rewrite_changes,
        "rewrite_trust_note": "Based on pattern shifts commonly flagged by Gmail and Outlook filters.",
        "learning_profile": get_learning_profile(),
        "before_summary": before_summary,
        "after_summary": after_summary,
    }


@app.post("/feedback")
def submit_feedback(
    outcome: str = Form("not_sure"),
    original_text: str = Form(""),
    rewritten_text: str = Form(""),
    from_risk_band: str = Form(""),
    to_risk_band: str = Form(""),
):
    result = record_feedback(
        {
            "outcome": outcome,
            "original_text": original_text,
            "rewritten_text": rewritten_text,
            "from_risk_band": from_risk_band,
            "to_risk_band": to_risk_band,
        }
    )

    track_event(
        "rewrite_feedback",
        {
            "outcome": result.get("outcome", "not_sure"),
            "from_risk_band": (from_risk_band or "")[:40],
            "to_risk_band": (to_risk_band or "")[:40],
        },
    )

    return result


@app.post("/track")
def track(
    event: str = Form(""),
    target: str = Form(""),
    mode: str = Form(""),
):
    event_name = (event or "").strip().lower()
    if event_name not in {"cta_click", "page_view", "access_request"}:
        return JSONResponse({"ok": True})

    meta = {
        "target": (target or "")[:120],
        "mode": (mode or "")[:20],
    }
    track_event(event_name, meta)
    return JSONResponse({"ok": True})


@app.post("/request-access")
def request_access(email: str = Form("")):
    clean_email = (email or "").strip()
    track_event("access_request", {"email": clean_email[:120]})
    return JSONResponse({"ok": True})


def _verify_admin_token(token: str) -> None:
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=404, detail="Not found")
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")


@app.get("/admin", response_class=HTMLResponse)
def admin_dashboard(request: Request, token: str = ""):
    _verify_admin_token(token)
    metrics = get_dashboard_data()
    return render_template_safe(
        request,
        "admin.html",
        {
            "page_title": "InboxGuard Admin Dashboard",
            "canonical_url": f"{SITE_URL}/admin",
            "meta_description": "Private InboxGuard metrics dashboard.",
            "metrics": metrics,
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
