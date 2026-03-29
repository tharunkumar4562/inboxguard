from datetime import date, datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path
import logging
import os
import re
import sqlite3
import hashlib
import smtplib
from email.message import EmailMessage
from urllib.parse import quote_plus

from fastapi import FastAPI, Form, Request, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from jinja2 import TemplateNotFound, TemplateError
from authlib.integrations.starlette_client import OAuth

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
SESSION_SECRET = os.getenv("INBOXGUARD_SESSION_SECRET", "change-this-session-secret")
AUTH_DB_FILE = BASE_DIR / "data" / "auth.db"
OTP_TTL_MINUTES = int(os.getenv("INBOXGUARD_OTP_TTL_MINUTES", "10"))
SMTP_HOST = os.getenv("INBOXGUARD_SMTP_HOST", "")
SMTP_PORT = int(os.getenv("INBOXGUARD_SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("INBOXGUARD_SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("INBOXGUARD_SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("INBOXGUARD_SMTP_FROM", "")
GOOGLE_CLIENT_ID = os.getenv("INBOXGUARD_GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("INBOXGUARD_GOOGLE_CLIENT_SECRET", "")
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

app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, same_site="lax", https_only=True)

oauth = OAuth()
if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
    oauth.register(
        name="google",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


def _auth_db_conn() -> sqlite3.Connection:
    AUTH_DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(AUTH_DB_FILE))
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_auth_db() -> None:
    conn = _auth_db_conn()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                provider TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_login_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS otp_codes (
                email TEXT PRIMARY KEY,
                code_hash TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _hash_otp(email: str, otp: str) -> str:
    material = f"{email.lower().strip()}:{otp}:{SESSION_SECRET}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _upsert_user(email: str, provider: str) -> None:
    clean_email = (email or "").strip().lower()
    if not clean_email:
        return
    now = datetime.now(timezone.utc).isoformat()
    conn = _auth_db_conn()
    try:
        existing = conn.execute("SELECT email FROM users WHERE email=?", (clean_email,)).fetchone()
        if existing:
            conn.execute("UPDATE users SET provider=?, last_login_at=? WHERE email=?", (provider, now, clean_email))
        else:
            conn.execute(
                "INSERT INTO users(email, provider, created_at, last_login_at) VALUES (?, ?, ?, ?)",
                (clean_email, provider, now, now),
            )
        conn.commit()
    finally:
        conn.close()


def _set_auth_session(request: Request, email: str, provider: str) -> None:
    request.session["auth_email"] = (email or "").strip().lower()
    request.session["auth_provider"] = provider
    request.session["auth_at"] = datetime.now(timezone.utc).isoformat()


def _send_otp_email(email: str, otp: str) -> None:
    if not (SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD and SMTP_FROM):
        raise HTTPException(status_code=503, detail="Email OTP provider is not configured")

    message = EmailMessage()
    message["Subject"] = "Your InboxGuard verification code"
    message["From"] = SMTP_FROM
    message["To"] = email
    message.set_content(
        "\n".join(
            [
                "Your InboxGuard OTP code:",
                otp,
                "",
                f"This code expires in {OTP_TTL_MINUTES} minutes.",
            ]
        )
    )

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
        smtp.starttls()
        smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
        smtp.send_message(message)


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
        _ensure_auth_db()
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
    auth_error = request.query_params.get("error", "")
    return render_template_safe(
        request,
        "login.html",
        {
            "page_title": "Get Access | InboxGuard",
            "meta_description": "Enter your email to unlock your full InboxGuard remediation report instantly.",
            "canonical_url": f"{SITE_URL}/access",
            "resume_mode": request.query_params.get("resume", "0"),
            "auth_mode": request.query_params.get("mode", "signin"),
            "auth_error": auth_error,
            "google_configured": bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET),
            "email_otp_configured": bool(SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD and SMTP_FROM),
        },
    )


@app.get("/auth/status")
def auth_status(request: Request):
    email = str(request.session.get("auth_email", "")).strip().lower()
    provider = str(request.session.get("auth_provider", "")).strip().lower()
    return {"authenticated": bool(email), "email": email, "provider": provider}


@app.get("/auth/google/login")
async def auth_google_login(request: Request, next: str = "/?resume=1"):
    google_client = oauth.create_client("google")
    if google_client is None:
        fallback = f"/access?mode=email&resume=1&error={quote_plus('google_not_configured')}"
        return RedirectResponse(url=fallback, status_code=303)

    request.session["auth_next"] = next
    redirect_uri = f"{SITE_URL}/auth/google/callback"
    return await google_client.authorize_redirect(request, redirect_uri)


@app.get("/auth/google/callback")
async def auth_google_callback(request: Request):
    google_client = oauth.create_client("google")
    if google_client is None:
        fallback = f"/access?mode=email&resume=1&error={quote_plus('google_not_configured')}"
        return RedirectResponse(url=fallback, status_code=303)

    token = await google_client.authorize_access_token(request)
    user_info = token.get("userinfo")
    if not user_info:
        user_info = await google_client.userinfo(token=token)

    email = str((user_info or {}).get("email", "")).strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Google account email not available")

    _upsert_user(email, "google")
    _set_auth_session(request, email, "google")
    next_url = str(request.session.pop("auth_next", "/?resume=1"))
    return RedirectResponse(url=next_url, status_code=303)


@app.post("/auth/email/request-otp")
def auth_email_request_otp(email: str = Form("")):
    clean_email = (email or "").strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="Valid email is required")

    otp = str(int.from_bytes(os.urandom(4), "big") % 900000 + 100000)
    code_hash = _hash_otp(clean_email, otp)
    created_at = datetime.now(timezone.utc)
    expires_at = created_at + timedelta(minutes=OTP_TTL_MINUTES)

    conn = _auth_db_conn()
    try:
        conn.execute(
            """
            INSERT INTO otp_codes(email, code_hash, expires_at, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, created_at=excluded.created_at
            """,
            (clean_email, code_hash, expires_at.isoformat(), created_at.isoformat()),
        )
        conn.commit()
    finally:
        conn.close()

    _send_otp_email(clean_email, otp)
    return {"ok": True}


@app.post("/auth/email/verify-otp")
def auth_email_verify_otp(request: Request, email: str = Form(""), otp: str = Form("")):
    clean_email = (email or "").strip().lower()
    clean_otp = re.sub(r"\D", "", otp or "")
    if not clean_email or len(clean_otp) != 6:
        raise HTTPException(status_code=400, detail="Email and 6-digit OTP are required")

    conn = _auth_db_conn()
    try:
        row = conn.execute("SELECT code_hash, expires_at FROM otp_codes WHERE email=?", (clean_email,)).fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="OTP not requested for this email")

        expires_at = datetime.fromisoformat(str(row["expires_at"]))
        if datetime.now(timezone.utc) > expires_at:
            conn.execute("DELETE FROM otp_codes WHERE email=?", (clean_email,))
            conn.commit()
            raise HTTPException(status_code=400, detail="OTP expired, request a new code")

        expected_hash = str(row["code_hash"])
        if _hash_otp(clean_email, clean_otp) != expected_hash:
            raise HTTPException(status_code=400, detail="Invalid OTP")

        conn.execute("DELETE FROM otp_codes WHERE email=?", (clean_email,))
        conn.commit()
    finally:
        conn.close()

    _upsert_user(clean_email, "email_otp")
    _set_auth_session(request, clean_email, "email_otp")
    return {"ok": True, "redirect": "/?resume=1"}


@app.post("/auth/logout")
def auth_logout(request: Request):
    request.session.clear()
    return {"ok": True}


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


def _rewrite_outcome(style: str, from_band: str, to_band: str, score_delta: int) -> str:
    if _style_acceptance(style, from_band, to_band, score_delta):
        if score_delta > 0 or _risk_rank(to_band) < _risk_rank(from_band):
            return "improved"
    return "neutral"


def _rewrite_limitations(mode: str, score_delta: int, from_band: str, to_band: str) -> list[str]:
    notes: list[str] = []
    if score_delta <= 0 and _risk_rank(to_band) >= _risk_rank(from_band):
        notes.append("Limited movement in risk score after rewrite.")
    if mode == "content":
        notes.append("Scan was content-only; infrastructure and sender signals were not included.")
    notes.append("Final placement also depends on sender reputation, list quality, and send behavior.")
    return notes[:3]


def _similarity_ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a or "", b or "").ratio()


def _contains_risky_tokens(text: str) -> bool:
    low = (text or "").lower()
    patterns = [
        r"\blast\s+chance\b",
        r"\bregister\s+now\b",
        r"\bapply\s+now\b",
        r"\bonly\s+\d+\s*(day|days|hour|hours|left)\b",
        r"\blimited\s+time\b",
    ]
    return any(re.search(pattern, low) for pattern in patterns)


def _split_subject_body(text: str) -> tuple[str, str]:
    content = (text or "").strip()
    if not content:
        return ("", "")
    match = re.search(r"^\s*Subject:\s*(.+)$", content, flags=re.IGNORECASE | re.MULTILINE)
    if not match:
        lines = [line.strip() for line in content.splitlines() if line.strip()]
        if len(lines) >= 2:
            first_line = lines[0]
            second_line = lines[1].lower()
            looks_like_subject = (
                len(first_line.split()) >= 3
                and len(first_line) <= 95
                and not bool(re.match(r"^(hi|hello|dear|hey)\b", first_line.lower()))
            )
            second_is_greeting = bool(re.match(r"^(hi|hello|dear|hey)\b", second_line))
            if looks_like_subject and second_is_greeting:
                body_lines = []
                removed = False
                for line in content.splitlines():
                    if not removed and line.strip() == first_line:
                        removed = True
                        continue
                    body_lines.append(line)
                return (first_line, "\n".join(body_lines).strip())
        return ("", content)
    subject = match.group(1).strip()
    body = re.sub(r"^\s*Subject:\s*.+$", "", content, count=1, flags=re.IGNORECASE | re.MULTILINE).strip()
    return (subject, body)


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
    style_variants = {
        "safe": rewrite_email_text(original, issue_titles, intent_type=email_intent, rewrite_style="safe"),
        "balanced": rewrite_email_text(original, issue_titles, intent_type=email_intent, rewrite_style="balanced"),
        "aggressive": rewrite_email_text(original, issue_titles, intent_type=email_intent, rewrite_style="aggressive"),
    }

    rewritten = style_variants.get(style, "")
    if len(rewritten.strip()) < 20:
        rewritten = original

    after = analyze_email(rewritten, clean_domain, rewritten, mode)
    after_summary = after.get("summary", {})
    after_score = int(after_summary.get("final_score", after_summary.get("score", 0)))

    score_delta = after_score - before_score

    from_band = str(before_summary.get("risk_band", "Needs Review"))
    to_band = str(after_summary.get("risk_band", "Needs Review"))

    rewrite_outcome = _rewrite_outcome(style, from_band, to_band, score_delta)
    if _contains_risky_tokens(rewritten):
        rewrite_outcome = "failed_fix"

    other_styles = [name for name in ("safe", "balanced", "aggressive") if name != style]
    collapse_detected = any(
        _similarity_ratio(rewritten, style_variants.get(name, "")) > 0.82 for name in other_styles
    )
    if collapse_detected and rewrite_outcome != "failed_fix":
        rewrite_outcome = "neutral"

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
    if rewrite_outcome == "neutral":
        rewrite_changes.insert(1, "No major risk shift detected, but bulk-style patterns were still reduced.")
    elif rewrite_outcome == "failed_fix":
        rewrite_changes.insert(1, "Could not safely remove all risky pressure signals without changing message intent.")

    limitations = _rewrite_limitations(mode, score_delta, from_band, to_band)
    if collapse_detected:
        limitations.insert(0, "Rewrite styles were too similar for this draft; selected mode may need manual refinement.")
    if rewrite_outcome == "failed_fix":
        limitations.insert(0, "Risky urgency/CTA tokens still remain in the rewritten output.")

    original_subject, original_body = _split_subject_body(original)
    rewritten_subject, rewritten_body = _split_subject_body(rewritten)
    subject_changed = bool(original_subject and rewritten_subject and original_subject.strip() != rewritten_subject.strip())

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
        "rewrite_outcome": rewrite_outcome,
        "rewrite_limitations": limitations[:4],
        "rewrite_changes": rewrite_changes,
        "rewrite_trust_note": "This version removes common bulk-style patterns flagged by Gmail and Outlook filters.",
        "original_subject": original_subject,
        "original_body": original_body,
        "rewritten_subject": rewritten_subject,
        "rewritten_body": rewritten_body,
        "subject_changed": subject_changed,
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
