from datetime import date
from pathlib import Path
import logging

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from jinja2 import TemplateNotFound, TemplateError

from analyzer import analyze_email
from utils import build_email_from_raw, extract_domain_from_text

app = FastAPI(title="InboxGuard")

logger = logging.getLogger("inboxguard")
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
LAST_TEMPLATE_ERROR = ""

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

SITE_URL = "https://inboxguard-production-90ab.up.railway.app"
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
    global LAST_TEMPLATE_ERROR
    LAST_TEMPLATE_ERROR = ""
    payload = {"request": request, **context}
    try:
        return templates.TemplateResponse(name=template_name, context=payload, status_code=status_code)
    except Exception as exc:
        LAST_TEMPLATE_ERROR = f"attempt1: {type(exc).__name__}: {exc}"
        logger.exception("Template render attempt 1 failed for %s", template_name)

    try:
        return templates.TemplateResponse(request=request, name=template_name, context=payload, status_code=status_code)
    except Exception as exc:
        LAST_TEMPLATE_ERROR = f"attempt2: {type(exc).__name__}: {exc}"
        logger.exception("Template render attempt 2 failed for %s", template_name)

    try:
        return templates.TemplateResponse(request, template_name, payload, status_code=status_code)
    except Exception as exc:
        LAST_TEMPLATE_ERROR = f"attempt3: {type(exc).__name__}: {exc}"
        logger.exception("Template render attempt 3 failed for %s", template_name)

    try:
        return templates.TemplateResponse(template_name, payload, status_code=status_code)
    except TemplateNotFound as exc:
        LAST_TEMPLATE_ERROR = f"attempt4: {type(exc).__name__}: {exc}"
        logger.exception("Template not found: %s", template_name)
    except TemplateError as exc:
        LAST_TEMPLATE_ERROR = f"attempt4: {type(exc).__name__}: {exc}"
        logger.exception("Template render error for %s", template_name)
    except Exception as exc:
        LAST_TEMPLATE_ERROR = f"attempt4: {type(exc).__name__}: {exc}"
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
    template_files = sorted([p.name for p in TEMPLATES_DIR.glob("*.html")]) if TEMPLATES_DIR.exists() else []
    return {
        "status": "ok",
        "module_file": str(Path(__file__).resolve()),
        "base_dir": str(BASE_DIR),
        "templates_dir": str(TEMPLATES_DIR),
        "templates_exists": TEMPLATES_DIR.exists(),
        "template_files": template_files,
        "static_dir": str(STATIC_DIR),
        "static_exists": STATIC_DIR.exists(),
        "last_template_error": LAST_TEMPLATE_ERROR,
    }


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return render_template_safe(
        request,
        "index.html",
        {
            "page_title": "Email Deliverability Audit | InboxGuard",
            "meta_description": "Run a fast email deliverability audit before sending. Check SPF, DKIM, DMARC, header alignment, and outreach risk signals.",
            "canonical_url": f"{SITE_URL}/",
            "focus_query": "email deliverability audit",
        },
    )


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return RedirectResponse(url="/access", status_code=307)


@app.get("/access", response_class=HTMLResponse)
def access_page(request: Request):
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

    result = analyze_email(
        parsed_email,
        parsed_domain,
        raw_text,
        mode,
        subject_override=parsed_subject,
        body_override=parsed_body,
    )
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
