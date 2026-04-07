from datetime import date, datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path
import json
import logging
import os
import re
import hmac
import hashlib
import secrets
import sqlite3
import csv
import io
import imaplib
import smtplib
from typing import Any, Optional, cast
from uuid import uuid4
from email.message import EmailMessage
import time

import httpx

from fastapi import FastAPI, Form, Request, HTTPException, Header, BackgroundTasks, UploadFile, File
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.sessions import SessionMiddleware
from jinja2 import TemplateNotFound, TemplateError
from authlib.integrations.starlette_client import OAuth

from analyzer import analyze_email
from analytics import get_dashboard_data, track_event
from correction_engine import (
    build_style_variants_with_guard,
    enforce_rewrite_constraints,
    extract_rewrite_intent,
    generate_mode_candidate,
    get_learning_profile,
    record_feedback,
    rewrite_email_text,
)
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
ADMIN_EMAIL = os.getenv("INBOXGUARD_ADMIN_EMAIL", os.getenv("INBOXGUARD_ADMIN_ALLOWED_EMAIL", "")).strip().lower()
SESSION_SECRET = os.getenv("INBOXGUARD_SESSION_SECRET", "change-me-in-production")
SESSION_HTTPS_ONLY = os.getenv("INBOXGUARD_SESSION_HTTPS_ONLY", "0").strip().lower() in {"1", "true", "yes"}
AUTH_DB_FILE = BASE_DIR / "data" / "auth.db"
ANON_SCAN_LIMIT = int(os.getenv("INBOXGUARD_ANON_SCAN_LIMIT", "3"))
FREE_USER_SCAN_LIMIT = int(os.getenv("INBOXGUARD_FREE_USER_SCAN_LIMIT", "50"))
GOOGLE_OAUTH_ENABLED = os.getenv("INBOXGUARD_GOOGLE_OAUTH_ENABLED", "0").strip().lower() in {"1", "true", "yes"}
GOOGLE_CLIENT_ID = os.getenv("INBOXGUARD_GOOGLE_CLIENT_ID", os.getenv("GOOGLE_CLIENT_ID", "")).strip()
GOOGLE_CLIENT_SECRET = os.getenv("INBOXGUARD_GOOGLE_CLIENT_SECRET", os.getenv("GOOGLE_CLIENT_SECRET", "")).strip()
RAZORPAY_KEY = os.getenv("INBOXGUARD_RAZORPAY_KEY", os.getenv("RAZORPAY_KEY", "")).strip()
RAZORPAY_SECRET = os.getenv("INBOXGUARD_RAZORPAY_SECRET", os.getenv("RAZORPAY_SECRET", "")).strip()
RAZORPAY_WEBHOOK_SECRET = os.getenv("INBOXGUARD_RAZORPAY_WEBHOOK_SECRET", os.getenv("RAZORPAY_WEBHOOK_SECRET", "")).strip()
RAZORPAY_AMOUNT_INR = int(os.getenv("INBOXGUARD_RAZORPAY_AMOUNT_INR", "1200"))
RAZORPAY_STARTER_AMOUNT_INR = int(os.getenv("INBOXGUARD_RAZORPAY_STARTER_AMOUNT_INR", "200"))
RAZORPAY_ANNUAL_AMOUNT_INR = int(os.getenv("INBOXGUARD_RAZORPAY_ANNUAL_AMOUNT_INR", "9900"))
RAZORPAY_USAGE_AMOUNT_INR = int(os.getenv("INBOXGUARD_RAZORPAY_USAGE_AMOUNT_INR", "2"))
RAZORPAY_DISPLAY_PRICE_USD = os.getenv("INBOXGUARD_RAZORPAY_DISPLAY_PRICE_USD", "$12").strip()
RAZORPAY_PLAN_ID = os.getenv("INBOXGUARD_RAZORPAY_PLAN_ID", os.getenv("RAZORPAY_PLAN_ID", "")).strip()
RAZORPAY_ANNUAL_PLAN_ID = os.getenv("INBOXGUARD_RAZORPAY_ANNUAL_PLAN_ID", os.getenv("RAZORPAY_ANNUAL_PLAN_ID", "")).strip()
RAZORPAY_TRIAL_PLAN_ID = os.getenv("INBOXGUARD_RAZORPAY_TRIAL_PLAN_ID", os.getenv("RAZORPAY_TRIAL_PLAN_ID", "")).strip()
RAZORPAY_PRO_PLAN_ID = os.getenv("INBOXGUARD_RAZORPAY_PRO_PLAN_ID", "").strip()
RAZORPAY_STARTER_PLAN_ID = os.getenv("INBOXGUARD_RAZORPAY_STARTER_PLAN_ID", "").strip()
TRIAL_DAYS = int(os.getenv("INBOXGUARD_TRIAL_DAYS", "7"))
PAST_DUE_GRACE_DAYS = int(os.getenv("INBOXGUARD_PAST_DUE_GRACE_DAYS", "3"))
GOOGLE_VERIFICATION_FILE = "googleab4b33a28d8dfb88.html"
AUTH_DB_READY = False
ASYNC_JOB_MAX_RETRIES = int(os.getenv("INBOXGUARD_ASYNC_MAX_RETRIES", "3"))
ASYNC_JOB_TIMEOUT_SECONDS = int(os.getenv("INBOXGUARD_ASYNC_TIMEOUT_SECONDS", "25"))
SEED_SMTP_HOST = os.getenv("INBOXGUARD_SEED_SMTP_HOST", "").strip()
SEED_SMTP_PORT = int(os.getenv("INBOXGUARD_SEED_SMTP_PORT", "587"))
SEED_SMTP_USER = os.getenv("INBOXGUARD_SEED_SMTP_USER", "").strip()
SEED_SMTP_PASS = os.getenv("INBOXGUARD_SEED_SMTP_PASS", "").strip()
SEED_SMTP_FROM = os.getenv("INBOXGUARD_SEED_SMTP_FROM", "").strip()
SEED_ACCOUNTS_JSON = os.getenv("INBOXGUARD_SEED_ACCOUNTS_JSON", "").strip()
BLACKLISTED_DOMAINS = {
    "tempmail.com",
    "mailinator.com",
    "10minutemail.com",
    "guerrillamail.com",
    "yopmail.com",
}
ASYNC_ANALYSIS_JOBS: dict[str, dict[str, Any]] = {}
ASYNC_JOB_STORE: dict[str, dict[str, Any]] = {}


@app.middleware("http")
async def redirect_www(request: Request, call_next):
    host = str(request.headers.get("host", "")).strip().lower()
    if host.startswith("www."):
        target_host = host.replace("www.", "", 1)
        target_url = request.url.replace(netloc=target_host)
        return RedirectResponse(url=str(target_url), status_code=301)
    return await call_next(request)


@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


def _admin_email_allowlist() -> set[str]:
    raw = os.getenv("INBOXGUARD_ADMIN_EMAILS", "").strip()
    emails = {ADMIN_EMAIL} if ADMIN_EMAIL else set()
    if raw:
        emails.update({item.strip().lower() for item in raw.split(",") if item.strip()})
    return {item for item in emails if item}


def _is_admin_email(email: str) -> bool:
    allowlist = _admin_email_allowlist()
    if not allowlist:
        return False
    return str(email or "").strip().lower() in allowlist
BLOG_POSTS = {
    "cold-email-spam-checklist": {
        "title": "Cold Email Spam Checklist Before You Send",
        "summary": "A short checklist to catch spam-risk patterns before launch.",
        "body": [
            "Start with one message, one CTA, and one promise.",
            "Remove pressure phrases and unnecessary urgency.",
            "Confirm SPF, DKIM, and DMARC before scaling volume.",
        ],
    },
    "improve-reply-rate-without-spam-signals": {
        "title": "Improve Reply Rate Without Triggering Spam Filters",
        "summary": "How to lift replies while staying inbox-safe.",
        "body": [
            "Lead with relevance, not hype.",
            "Use specific personalization in the first line.",
            "Keep links minimal and avoid promo-heavy structure.",
        ],
    },
}
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
SEO_ACQUISITION_PAGES = {
    "email-spam-checker": {
        "title": "Email Spam Checker - Check if your email will land in spam",
        "description": "Check if your email will land in spam before sending. Detect spam triggers and improve deliverability instantly.",
        "ai_tool_meta": "email spam checker, inbox placement test, deliverability tool",
        "h1": "Email Spam Checker (Free Tool)",
        "intro": "Check if your email will land in spam before sending. Detect spam triggers instantly.",
        "why_body": "Emails land in spam due to multiple factors like spam trigger words, missing authentication, bad formatting, and domain reputation issues.",
        "how_to_check": "Paste your email above and analyze it before sending. Tools like InboxGuard help detect spam signals and improve deliverability.",
        "spam_triggers": ["FREE, GUARANTEED, ACT NOW", "Too many links", "Broken formatting"],
        "fix_body": "Always test your email before sending to improve inbox placement and avoid spam filters.",
        "answer_points": [],
    },
    "gmail-spam-checker": {
        "title": "Gmail Spam Checker - Check Gmail deliverability before sending",
        "description": "Test if your email can pass Gmail spam filters. Detect content and structure issues before sending.",
        "ai_tool_meta": "gmail spam checker, gmail inbox placement test, deliverability tool",
        "h1": "Gmail Spam Checker",
        "intro": "Gmail uses advanced spam filters based on content, reputation, and structure. Use this tool to test your email before sending to Gmail users.",
        "why_body": "Gmail filtering is heavily behavior and reputation aware. Promotional wording, unstable sender behavior, and weak trust signals can lower inbox placement.",
        "how_to_check": "Paste your message above, run the check, and adjust before launching. Tools like InboxGuard help detect spam triggers before sending.",
        "spam_triggers": ["FREE, GUARANTEED, ACT NOW", "Link-heavy blocks with little context", "Inconsistent sender identity"],
        "fix_body": "Test each draft before sends to Gmail audiences so risky copy and structure are fixed early.",
        "answer_points": [],
    },
    "cold-email-deliverability": {
        "title": "Cold Email Deliverability Test - Improve inbox placement",
        "description": "Cold emails often fail due to poor deliverability. Test your email before sending to improve inbox placement and response rates.",
        "ai_tool_meta": "cold email deliverability, inbox placement test, spam checker tool",
        "h1": "Cold Email Deliverability Test",
        "intro": "Cold emails often fail due to poor deliverability. Test your email before sending to improve inbox placement and response rates.",
        "why_body": "Cold outbound is sensitive to language quality, sending patterns, and technical setup. If one part breaks, placement drops quickly.",
        "how_to_check": "Run your draft through the checker before campaigns. Tools like InboxGuard help detect spam triggers before sending and scaling.",
        "spam_triggers": ["Hard-sell urgency in first lines", "Multiple links in short outreach", "Generic message with weak personalization"],
        "fix_body": "Always test and adjust cold emails before launch to protect sender trust and improve reply odds.",
        "answer_points": [],
    },
    "why-emails-go-to-spam": {
        "title": "Why do emails go to spam? Causes and fixes",
        "description": "Understand why emails go to spam, see the top causes, and test your message before sending.",
        "ai_tool_meta": "why emails go to spam, email spam causes, deliverability tool",
        "h1": "Why do emails go to spam?",
        "intro": "Emails go to spam mainly because of clear risk signals in content and sender trust setup.",
        "why_body": "The most common causes are spam trigger words, low domain reputation, missing SPF and DKIM records, and bad formatting.",
        "how_to_check": "Check your draft before sending and remove high-risk patterns early. Tools like InboxGuard help detect spam triggers before sending.",
        "spam_triggers": ["Spam trigger words", "Low domain reputation", "Missing SPF, DKIM", "Bad formatting"],
        "fix_body": "To prevent spam placement, validate trust setup and clean up risky copy before each send.",
        "answer_points": [
            "Spam trigger words",
            "Low domain reputation",
            "Missing SPF, DKIM",
            "Bad formatting",
        ],
    },
    "spam-trigger-words": {
        "title": "Spam Trigger Words List - Phrases that hurt deliverability",
        "description": "See common spam trigger words and check your email before sending to reduce spam risk.",
        "ai_tool_meta": "spam trigger words list, email spam checker, deliverability tool",
        "h1": "Spam Trigger Words List",
        "intro": "Certain words increase the chance of emails landing in spam.",
        "why_body": "Spam filters analyze wording patterns in context. Repeated urgency and promotional phrasing can reduce inbox placement.",
        "how_to_check": "Use a checker before sending. Tools like InboxGuard help detect spam triggers before sending and suggest safer phrasing.",
        "spam_triggers": ["FREE", "BUY NOW", "CLICK HERE"],
        "fix_body": "Use natural language and test every draft before send so trigger terms are caught automatically.",
        "answer_points": [],
    },
}

app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, same_site="lax", https_only=SESSION_HTTPS_ONLY)

oauth = OAuth()
GOOGLE_AUTH_CONFIGURED = bool(GOOGLE_OAUTH_ENABLED and GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
if GOOGLE_AUTH_CONFIGURED:
    oauth.register(
        name="google",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


class CampaignDebuggerInput(BaseModel):
    open_rate: float
    reply_rate: float
    bounce_rate: float
    sent: int


class SeedTestInput(BaseModel):
    subject: str
    body: str
    campaign_name: str = "Seed Campaign"
    wait_seconds: int = 6


class SubjectLineInput(BaseModel):
    product_name: str = "InboxGuard"
    target_role: str = ""
    industry: str = ""
    goal: str = ""
    email_type: str = "cold"
    tone: str = "internal"
    context: str = ""
    body: str = ""


def _tokenize_subject_text(value: str) -> set[str]:
    tokens = re.findall(r"[a-z0-9]+", str(value or "").lower())
    stop_words = {
        "the", "and", "for", "with", "from", "that", "this", "your", "you", "are", "our", "can",
        "will", "have", "has", "was", "were", "into", "about", "what", "when", "where", "how", "why",
        "who", "want", "need", "need", "get", "make", "more", "less", "best", "new", "now", "out",
        "email", "subject", "line", "lines", "check", "send", "sending",
    }
    return {token for token in tokens if token not in stop_words and len(token) > 1}


def _subject_seed_data(payload: dict[str, str]) -> dict[str, str]:
    product_name = str(payload.get("product_name") or "InboxGuard").strip() or "InboxGuard"
    target_role = str(payload.get("target_role") or "").strip()
    industry = str(payload.get("industry") or "").strip()
    goal = str(payload.get("goal") or "").strip()
    email_type = str(payload.get("email_type") or "cold").strip().lower()
    tone = str(payload.get("tone") or "internal").strip().lower()
    context = str(payload.get("context") or "").strip()
    body = str(payload.get("body") or "").strip()
    return {
        "product_name": product_name,
        "target_role": target_role,
        "industry": industry,
        "goal": goal,
        "email_type": email_type,
        "tone": tone,
        "context": context,
        "body": body,
    }


def _clean_phrase(value: str) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    return text[:80]


def _generate_subject_candidates(seed: dict[str, str]) -> list[dict[str, Any]]:
    product_name = seed["product_name"]
    target_role = seed["target_role"]
    industry = seed["industry"]
    goal = seed["goal"]
    email_type = seed["email_type"]
    tone = seed["tone"]
    context = seed["context"]

    role_hint = target_role.lower() if target_role else ""
    industry_hint = industry.lower() if industry else ""
    goal_hint = goal.lower() if goal else ""
    context_hint = context.lower() if context else ""

    product_map = {
        "deliverability": ["inbox rate", "reply rates", "deliverability", "spam risk", "send health"],
        "sales": ["pipeline", "reply rates", "follow-up", "booked calls", "outreach"],
        "recruit": ["candidates", "pipeline", "responses", "screening", "shortlist"],
        "ops": ["status", "audit", "checks", "review", "sync"],
        "marketing": ["campaign", "response rate", "inbox rate", "launch", "results"],
    }

    base_internal = [
        "reply rates",
        "inbox rate",
        "pipeline check",
        "quick check",
        "campaign note",
    ]
    base_curiosity = [
        "worth a look?",
        "quick question",
        "check this",
        "small fix",
        "one thing",
    ]
    base_pain = [
        "low replies?",
        "spam risk",
        "drop in replies",
        "missing inboxes",
        "deliverability issue",
    ]
    base_outcome = [
        "+ inbox",
        "better delivery",
        "more replies",
        "cleaner sends",
        "fewer misses",
    ]

    role_bucket = "deliverability"
    if any(word in role_hint for word in ["sales", "sales head", "ae", "account"]):
        role_bucket = "sales"
    elif any(word in role_hint for word in ["recruit", "talent", "hiring"]):
        role_bucket = "recruit"
    elif any(word in role_hint for word in ["marketing", "growth", "demand"]):
        role_bucket = "marketing"
    elif any(word in role_hint for word in ["ops", "operations", "revops", "founder", "ceo"]):
        role_bucket = "ops"

    bucket_words = product_map.get(role_bucket, product_map["deliverability"])
    modifiers = []
    if industry_hint:
        modifiers.append(industry_hint.split()[0])
    if goal_hint:
        modifiers.append(goal_hint.split()[0])
    if context_hint:
        modifiers.append(context_hint.split()[0])

    candidates: list[tuple[str, str]] = []
    for subject in base_internal[:3]:
        candidates.append(("internal", subject))
    for subject in base_curiosity[:3]:
        candidates.append(("curiosity", subject))
    for subject in base_pain[:3]:
        candidates.append(("pain", subject))
    for subject in base_outcome[:3]:
        candidates.append(("outcome", subject))

    if email_type == "followup":
        candidates.extend([
            ("followup", "quick follow-up"),
            ("followup", "worth revisiting?"),
        ])

    built: list[dict[str, Any]] = []
    seen: set[str] = set()
    for strategy, root in candidates:
        parts = [root]
        if tone in {"internal", "casual"} and strategy in {"internal", "curiosity"}:
            if target_role:
                parts = [f"{target_role}: {root}"]
            elif industry:
                parts = [f"{industry} {root}"]
        elif strategy == "outcome" and goal:
            parts = [f"{goal} - {root}"]
        elif strategy == "pain" and modifiers:
            parts = [f"{modifiers[0]} {root}"]

        if product_name and strategy == "internal" and "InboxGuard" not in root:
            parts.append(product_name)

        subject = _clean_phrase(" ".join(parts))
        if subject in seen:
            continue
        seen.add(subject)
        built.append({"strategy": strategy, "subject": subject})

    # ensure a few product-specific options exist
    if product_name:
        built.extend([
            {"strategy": "product", "subject": _clean_phrase(f"{product_name} inbox rate")},
            {"strategy": "product", "subject": _clean_phrase(f"{product_name} quick check")},
            {"strategy": "product", "subject": _clean_phrase(f"{product_name} reply rates")},
        ])

    # Add role-aware / context-aware variants without going spammy.
    for word in bucket_words[:3]:
        variant = _clean_phrase(f"{word} {target_role}" if target_role else word)
        if variant not in seen:
            seen.add(variant)
            built.append({"strategy": "role-fit", "subject": variant})

    return built


def _score_subject_line(subject: str, seed: dict[str, str], body_text: str) -> dict[str, Any]:
    text = _clean_phrase(subject)
    lowered = text.lower()
    tokens = _tokenize_subject_text(text)
    body_tokens = _tokenize_subject_text(body_text)
    seed_tokens = _tokenize_subject_text(" ".join([seed.get("target_role", ""), seed.get("industry", ""), seed.get("goal", ""), seed.get("context", ""), seed.get("product_name", "")]))

    length = len(text.split())
    length_score = 10 if 1 <= length <= 3 else 8 if length == 4 else 6 if length == 5 else 4
    if length > 6:
        length_score -= min(3, length - 6)

    spam_words = {
        "free": 2.0,
        "guaranteed": 2.5,
        "act now": 2.5,
        "urgent": 2.0,
        "buy": 2.0,
        "click here": 3.0,
        "limited time": 2.0,
        "risk-free": 2.5,
        "money": 1.0,
        "cheap": 1.5,
    }
    spam_penalty = 0.0
    for phrase, penalty in spam_words.items():
        if phrase in lowered:
            spam_penalty += penalty

    internal_words = {"reply", "pipeline", "inbox", "check", "review", "quick", "sync", "update", "status", "note"}
    internal_bonus = 0.0
    if any(word in lowered for word in internal_words):
        internal_bonus += 1.8
    if any(char.isdigit() for char in text):
        internal_bonus += 0.4
    if "?" in text:
        internal_bonus += 0.4
    if ":" in text:
        internal_bonus += 0.3

    body_overlap = len(tokens & body_tokens)
    seed_overlap = len(tokens & seed_tokens)
    match_score = min(2.5, body_overlap * 0.8 + seed_overlap * 0.6)

    curiosity_bonus = 1.0 if text.endswith("?") or any(word in lowered for word in {"quick", "check", "look", "worth", "maybe"}) else 0.0
    clarity_bonus = 1.0 if 1 <= length <= 4 else 0.5 if length <= 5 else 0.0
    generic_penalty = 0.0
    if lowered in {"hi", "hello", "quick question", "check this"}:
        generic_penalty = 1.2

    goal_text = str(seed.get("goal", "")).lower()
    goal_bonus = 0.0
    if goal_text:
        for word in goal_text.split():
            if len(word) > 3 and word in lowered:
                goal_bonus += 0.4

    raw_score = 4.5 + length_score + internal_bonus + match_score + curiosity_bonus + clarity_bonus + goal_bonus - spam_penalty - generic_penalty
    score = round(max(0.0, min(10.0, raw_score)), 1)
    tags = []
    if any(word in lowered for word in {"reply", "inbox", "pipeline", "check", "quick"}):
        tags.append("internal")
    if "?" in text:
        tags.append("curiosity")
    if any(word in lowered for word in {"low", "risk", "issue", "fix", "spam"}):
        tags.append("pain")
    if any(word in lowered for word in {"more", "better", "+", "growth", "result"}):
        tags.append("outcome")
    if not tags:
        tags.append("clean")

    alignment = "strong" if match_score >= 1.8 else "moderate" if match_score >= 1.0 else "weak"
    return {
        "subject": text,
        "score": score,
        "tags": tags,
        "length_words": length,
        "alignment": alignment,
        "notes": {
            "spam_risk": "high" if spam_penalty >= 3.0 else "medium" if spam_penalty >= 1.5 else "low",
            "body_match": alignment,
            "internal_feel": "yes" if internal_bonus > 0 else "no",
        },
    }


def _build_subject_line_intelligence(payload: dict[str, str]) -> dict[str, Any]:
    seed = _subject_seed_data(payload)
    generated = _generate_subject_candidates(seed)
    scored = [_score_subject_line(item["subject"], seed, seed["body"] or seed.get("context", "")) | {"strategy": item["strategy"]} for item in generated]
    scored.sort(key=lambda item: (float(item.get("score", 0.0)), -int(item.get("length_words", 99))), reverse=True)

    top_picks = scored[:5]
    warnings = []
    if seed["body"]:
        body_tokens = _tokenize_subject_text(seed["body"])
        if body_tokens and all(len(_tokenize_subject_text(item["subject"]) & body_tokens) == 0 for item in top_picks[:3]):
            warnings.append("Top subjects may not match the body closely enough.")
    if any(item["notes"]["spam_risk"] == "high" for item in top_picks[:3]):
        warnings.append("Avoid aggressive wording that looks promotional.")

    return {
        "input": seed,
        "top_picks": top_picks,
        "strategies": scored[:12],
        "warnings": warnings,
        "product_fit": {
            "product_name": seed["product_name"],
            "target_role": seed["target_role"],
            "industry": seed["industry"],
            "goal": seed["goal"],
        },
        "summary": {
            "best_subject": top_picks[0]["subject"] if top_picks else "",
            "best_score": top_picks[0]["score"] if top_picks else 0,
            "best_reason": "Looks internal and stays close to the body" if top_picks else "No subject generated",
        },
    }


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
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_active TEXT NOT NULL,
                pro INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS usage (
                user_id INTEGER PRIMARY KEY,
                scans_used INTEGER NOT NULL DEFAULT 0,
                emails_scanned_count INTEGER NOT NULL DEFAULT 0,
                rewrite_clicked INTEGER NOT NULL DEFAULT 0,
                last_scan TEXT,
                last_active TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS anon_usage (
                anon_id TEXT NOT NULL,
                period_key TEXT NOT NULL,
                scans_used INTEGER NOT NULL DEFAULT 0,
                last_scan TEXT,
                PRIMARY KEY (anon_id, period_key)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_daily_activity (
                user_id INTEGER NOT NULL,
                activity_date TEXT NOT NULL,
                scans_count INTEGER NOT NULL DEFAULT 0,
                last_activity_at TEXT NOT NULL,
                PRIMARY KEY (user_id, activity_date),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                outcome TEXT NOT NULL,
                from_risk_band TEXT,
                to_risk_band TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                subscription_id TEXT,
                payment_id TEXT,
                invoice_id TEXT,
                amount INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS lead_captures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                anon_id TEXT,
                email TEXT NOT NULL,
                source TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS saved_fixes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                original_subject TEXT,
                original_body TEXT,
                rewritten_subject TEXT,
                rewritten_body TEXT,
                score_delta INTEGER NOT NULL DEFAULT 0,
                from_risk_band TEXT,
                to_risk_band TEXT,
                rewrite_style TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                key_hash TEXT NOT NULL,
                key_hint TEXT NOT NULL,
                name TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL,
                last_used_at TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(owner_user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS team_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                joined_at TEXT NOT NULL,
                UNIQUE(team_id, user_id),
                FOREIGN KEY(team_id) REFERENCES teams(id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS async_jobs (
                id TEXT PRIMARY KEY,
                user_id INTEGER,
                status TEXT NOT NULL,
                result_json TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS seed_tests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                campaign_name TEXT NOT NULL,
                provider TEXT NOT NULL,
                inbox_count INTEGER NOT NULL DEFAULT 0,
                spam_count INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS email_outcomes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                score INTEGER NOT NULL,
                outcome TEXT NOT NULL,
                risk_band TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _ensure_auth_db_ready() -> None:
    global AUTH_DB_READY
    if AUTH_DB_READY:
        return
    _ensure_auth_db()
    _ensure_user_pro_column()
    _ensure_user_subscription_columns()
    _ensure_token_system_tables()
    _ensure_token_columns()
    AUTH_DB_READY = True


def _ensure_user_pro_column(conn: Optional[sqlite3.Connection] = None) -> None:
    close_conn = False
    if conn is None:
        conn = _auth_db_conn()
        close_conn = True
    try:
        columns = conn.execute("PRAGMA table_info(users)").fetchall()
        column_names = {str(column[1]) for column in columns}
        if "pro" not in column_names:
            conn.execute("ALTER TABLE users ADD COLUMN pro INTEGER NOT NULL DEFAULT 0")
            conn.commit()
    finally:
        if close_conn:
            conn.close()


def _ensure_user_subscription_columns(conn: Optional[sqlite3.Connection] = None) -> None:
    close_conn = False
    if conn is None:
        conn = _auth_db_conn()
        close_conn = True
    try:
        columns = conn.execute("PRAGMA table_info(users)").fetchall()
        column_names = {str(column[1]) for column in columns}
        if "subscription_id" not in column_names:
            conn.execute("ALTER TABLE users ADD COLUMN subscription_id TEXT")
        if "status" not in column_names:
            conn.execute("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'inactive'")
        if "status_updated_at" not in column_names:
            conn.execute("ALTER TABLE users ADD COLUMN status_updated_at TEXT")
        if "past_due_since" not in column_names:
            conn.execute("ALTER TABLE users ADD COLUMN past_due_since TEXT")
        conn.commit()
    finally:
        if close_conn:
            conn.close()


def _ensure_token_system_tables() -> None:
    """Create tables for token system, promo codes, and subscriptions."""
    conn = _auth_db_conn()
    try:
        _ensure_promo_code_tables(conn)
        # Promo usage tracking (legacy table kept for compatibility with older installs)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS promo_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                promo_id INTEGER NOT NULL,
                used_at TEXT NOT NULL,
                UNIQUE(user_id, promo_id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(promo_id) REFERENCES promo_codes(id)
            )
            """
        )
        # Subscriptions table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                plan TEXT NOT NULL DEFAULT 'free',
                status TEXT NOT NULL DEFAULT 'inactive',
                provider TEXT,
                current_period_end TEXT,
                trial_ends TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        # Usage logs
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS usage_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                feature TEXT NOT NULL,
                tokens_used INTEGER NOT NULL DEFAULT 1,
                timestamp TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _ensure_promo_code_tables(conn: sqlite3.Connection) -> None:
    existing_tables = {
        str(row[0])
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }
    if "promo_codes" in existing_tables:
        columns = {str(column[1]) for column in conn.execute("PRAGMA table_info(promo_codes)").fetchall()}
        required = {"id", "code", "type", "value", "max_uses", "used_count", "expires_at", "plan_scope", "active", "created_at"}
        if not required.issubset(columns):
            if "promo_codes_legacy" in existing_tables:
                conn.execute("DROP TABLE IF EXISTS promo_codes")
            else:
                conn.execute("ALTER TABLE promo_codes RENAME TO promo_codes_legacy")
            existing_tables.add("promo_codes_legacy")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS promo_codes (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL,
            value INTEGER NOT NULL DEFAULT 0,
            max_uses INTEGER NOT NULL DEFAULT 0,
            used_count INTEGER NOT NULL DEFAULT 0,
            expires_at TEXT,
            plan_scope TEXT NOT NULL DEFAULT 'all',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )
        """
    )


def _ensure_token_columns() -> None:
    """Add token-related columns to users table if missing."""
    conn = _auth_db_conn()
    try:
        columns = conn.execute("PRAGMA table_info(users)").fetchall()
        column_names = {str(column[1]) for column in columns}
        
        if "tokens" not in column_names:
            conn.execute("ALTER TABLE users ADD COLUMN tokens INTEGER NOT NULL DEFAULT 10")
        if "plan" not in column_names:
            conn.execute("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'")
        if "token_reset_at" not in column_names:
            conn.execute("ALTER TABLE users ADD COLUMN token_reset_at TEXT")
        if "trial_ends" not in column_names:
            conn.execute("ALTER TABLE users ADD COLUMN trial_ends TEXT")
        
        conn.commit()
    finally:
        conn.close()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _period_key() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.year:04d}-{now.month:02d}"


def _hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return digest.hex()


def _new_password_credentials(password: str) -> tuple[str, str]:
    salt = secrets.token_hex(16)
    return salt, _hash_password(password, salt)


def _verify_password(password: str, salt: str, expected_hash: str) -> bool:
    return hmac.compare_digest(_hash_password(password, salt), expected_hash)


def _get_or_create_anon_id(request: Request) -> str:
    anon_id = str(request.session.get("anon_id", "")).strip()
    if anon_id:
        return anon_id
    anon_id = secrets.token_urlsafe(18)
    request.session["anon_id"] = anon_id
    return anon_id


def _get_anon_scans_used(request: Request) -> int:
    _ensure_auth_db_ready()
    anon_id = _get_or_create_anon_id(request)
    conn = _auth_db_conn()
    try:
        row = conn.execute(
            "SELECT scans_used FROM anon_usage WHERE anon_id=? AND period_key=?",
            (anon_id, _period_key()),
        ).fetchone()
        return int(row["scans_used"]) if row else 0
    finally:
        conn.close()


def _increment_anon_scan(request: Request) -> int:
    _ensure_auth_db_ready()
    anon_id = _get_or_create_anon_id(request)
    now = _now_iso()
    period = _period_key()
    conn = _auth_db_conn()
    try:
        conn.execute(
            """
            INSERT INTO anon_usage(anon_id, period_key, scans_used, last_scan)
            VALUES (?, ?, 1, ?)
            ON CONFLICT(anon_id, period_key) DO UPDATE SET
                scans_used = scans_used + 1,
                last_scan = excluded.last_scan
            """,
            (anon_id, period, now),
        )
        conn.commit()
        row = conn.execute(
            "SELECT scans_used FROM anon_usage WHERE anon_id=? AND period_key=?",
            (anon_id, period),
        ).fetchone()
        return int(row["scans_used"]) if row else 0
    finally:
        conn.close()


def _get_user_by_email(email: str):
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        return conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    finally:
        conn.close()


def _get_user_by_id(user_id: int):
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        return conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    finally:
        conn.close()


def _get_user_id_by_subscription_id(subscription_id: str) -> int:
    if not subscription_id:
        return 0
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        row = conn.execute("SELECT id FROM users WHERE subscription_id=?", (subscription_id,)).fetchone()
        return int(row["id"]) if row else 0
    finally:
        conn.close()


@app.post("/subject-lines")
def subject_lines(payload: SubjectLineInput):
    data = _build_subject_line_intelligence(payload.model_dump())
    track_event(
        "subject_lines_generated",
        {
            "product": str(data.get("product_fit", {}).get("product_name", "InboxGuard")),
            "role": str(data.get("product_fit", {}).get("target_role", "")),
            "industry": str(data.get("product_fit", {}).get("industry", "")),
        },
    )
    return {"ok": True, **data}


def _safe_parse_iso(iso_value: str) -> Optional[datetime]:
    if not iso_value:
        return None
    value = str(iso_value).strip()
    if not value:
        return None
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _enforce_past_due_grace_period(user_id: int) -> None:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        row = conn.execute("SELECT status, past_due_since, pro FROM users WHERE id=?", (user_id,)).fetchone()
        if not row:
            return
        status = str(row["status"] or "inactive").strip().lower()
        if status != "past_due":
            return
        past_due_since = _safe_parse_iso(str(row["past_due_since"] or ""))
        if not past_due_since:
            return
        elapsed = datetime.now(timezone.utc) - past_due_since
        if elapsed >= timedelta(days=PAST_DUE_GRACE_DAYS):
            now = _now_iso()
            conn.execute(
                "UPDATE users SET pro=0, status='cancelled', status_updated_at=? WHERE id=?",
                (now, user_id),
            )
            conn.commit()
    finally:
        conn.close()


def _set_user_subscription_state(
    user_id: int,
    *,
    pro: Optional[bool] = None,
    status: Optional[str] = None,
    subscription_id: Optional[str] = None,
    past_due_since: Optional[str] = None,
) -> None:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        _ensure_user_pro_column(conn)
        _ensure_user_subscription_columns(conn)

        updates: list[str] = []
        params: list[Any] = []

        if pro is not None:
            updates.append("pro=?")
            params.append(1 if pro else 0)
        if status is not None:
            updates.append("status=?")
            params.append(status)
            updates.append("status_updated_at=?")
            params.append(_now_iso())
        if subscription_id is not None:
            updates.append("subscription_id=?")
            params.append(subscription_id)
        if past_due_since is not None:
            updates.append("past_due_since=?")
            params.append(past_due_since)

        if not updates:
            return

        params.append(user_id)
        conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id=?", tuple(params))
        conn.commit()
    finally:
        conn.close()


def _ensure_payment_columns(conn: Optional[sqlite3.Connection] = None) -> None:
    close_conn = False
    if conn is None:
        conn = _auth_db_conn()
        close_conn = True
    try:
        columns = conn.execute("PRAGMA table_info(payments)").fetchall()
        column_names = {str(column[1]) for column in columns}
        additions = [
            ("order_id", "TEXT"),
            ("promo_code", "TEXT"),
            ("plan", "TEXT"),
            ("checkout_type", "TEXT NOT NULL DEFAULT 'subscription'"),
            ("discount_amount", "INTEGER NOT NULL DEFAULT 0"),
        ]
        for column_name, ddl in additions:
            if column_name not in column_names:
                conn.execute(f"ALTER TABLE payments ADD COLUMN {column_name} {ddl}")
        conn.commit()
    finally:
        if close_conn:
            conn.close()


def _record_payment(
    *,
    user_id: int,
    amount: int,
    status: str,
    subscription_id: str = "",
    payment_id: str = "",
    invoice_id: str = "",
    order_id: str = "",
    promo_code: str = "",
    plan: str = "",
    checkout_type: str = "subscription",
    discount_amount: int = 0,
) -> None:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        _ensure_payment_columns(conn)
        conn.execute(
            """
            INSERT INTO payments(user_id, subscription_id, payment_id, invoice_id, amount, status, created_at, order_id, promo_code, plan, checkout_type, discount_amount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                subscription_id,
                payment_id,
                invoice_id,
                int(amount),
                status,
                _now_iso(),
                order_id,
                promo_code,
                plan,
                checkout_type,
                int(discount_amount or 0),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def _subscription_period_end_from_event(subscription: dict[str, Any]) -> str:
    raw_value = (
        subscription.get("current_end")
        or subscription.get("current_end_at")
        or subscription.get("current_period_end")
        or subscription.get("end_at")
        or ""
    )
    if isinstance(raw_value, (int, float)) and raw_value > 0:
        try:
            return datetime.fromtimestamp(float(raw_value), tz=timezone.utc).isoformat()
        except Exception:
            return ""
    text = str(raw_value or "").strip()
    if not text:
        return ""
    parsed = _safe_parse_iso(text)
    if parsed:
        return parsed.isoformat()
    try:
        return datetime.fromtimestamp(float(text), tz=timezone.utc).isoformat()
    except Exception:
        return text


def _extract_user_id(notes: dict[str, Any]) -> int:
    try:
        return int((notes or {}).get("user_id", 0) or 0)
    except (TypeError, ValueError):
        return 0


def _apply_razorpay_subscription_state(subscription: dict[str, Any], *, pro: bool, status: str) -> int:
    notes = subscription.get("notes", {}) or {}
    sub_id = str(subscription.get("id", "") or "")
    user_id = _extract_user_id(notes) or _get_user_id_by_subscription_id(sub_id)
    if user_id <= 0:
        return 0

    period_end = _subscription_period_end_from_event(subscription)
    _set_user_subscription_state(
        user_id,
        pro=pro,
        status=status,
        subscription_id=sub_id,
        past_due_since="",
    )
    if period_end:
        conn = _auth_db_conn()
        try:
            conn.execute("UPDATE users SET current_period_end=? WHERE id=?", (period_end, user_id))
            conn.commit()
        finally:
            conn.close()
    return user_id


def _create_user(email: str, password: str) -> int:
    _ensure_auth_db_ready()
    now = _now_iso()
    salt, password_hash = _new_password_credentials(password)
    conn = _auth_db_conn()
    try:
        cursor = conn.execute(
            "INSERT INTO users(email, password_hash, password_salt, created_at, last_active, tokens, plan) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (email, password_hash, salt, now, now, 10, "free"),
        )
        if cursor.lastrowid is None:
            raise HTTPException(status_code=500, detail="Could not create user account")
        user_id = int(cursor.lastrowid)
        conn.execute(
            "INSERT INTO usage(user_id, scans_used, emails_scanned_count, rewrite_clicked, last_active) VALUES (?, 0, 0, 0, ?)",
            (user_id, now),
        )
        # Create subscription record
        conn.execute(
            "INSERT INTO subscriptions(user_id, plan, status, created_at) VALUES (?, 'free', 'inactive', ?)",
            (user_id, now),
        )
        conn.commit()
        return user_id
    finally:
        conn.close()


def _get_or_create_google_user(email: str) -> int:
    existing = _get_user_by_email(email)
    if existing:
        return int(existing["id"])

    random_password = secrets.token_urlsafe(32)
    return _create_user(email, random_password)


def _google_client() -> Optional[Any]:
    try:
        return oauth.create_client("google")
    except Exception:
        return None


# ============================================================================
# TOKEN & PROMO SYSTEM
# ============================================================================

PLAN_TOKENS = {
    "free": 10,
    "starter": 30,
    "monthly": 500,
    "annual": 500,
    "pro": 500,
    "team": 2000,
}

FEATURE_COSTS = {
    "scan_email": 1,
    "campaign_debugger": 2,
    "seed_testing": 5,
    "domain_check": 1,
    "bulk_scan": 3,
}


def _get_user_tokens(user_id: int) -> int:
    """Get remaining tokens for user."""
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        row = conn.execute("SELECT tokens FROM users WHERE id=?", (user_id,)).fetchone()
        return int(row["tokens"]) if row else 0
    finally:
        conn.close()


def _deduct_tokens(user_id: int, amount: int = 1) -> bool:
    """Deduct tokens from user. Returns True if successful, False if insufficient."""
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        current = _get_user_tokens(user_id)
        if current < amount:
            return False
        
        conn.execute(
            "UPDATE users SET tokens = tokens - ? WHERE id=?",
            (amount, user_id),
        )
        conn.execute(
            "INSERT INTO usage_logs(user_id, feature, tokens_used, timestamp) VALUES (?, ?, ?, ?)",
            (user_id, "feature_use", amount, _now_iso()),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def _add_tokens(user_id: int, amount: int, reason: str = "manual") -> None:
    """Add tokens to user account."""
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        conn.execute(
            "UPDATE users SET tokens = tokens + ? WHERE id=?",
            (amount, user_id),
        )
        conn.execute(
            "INSERT INTO usage_logs(user_id, feature, tokens_used, timestamp) VALUES (?, ?, ?, ?)",
            (user_id, f"added_{reason}", amount, _now_iso()),
        )
        conn.commit()
    finally:
        conn.close()


def _set_user_plan(user_id: int, plan: str, tokens: Optional[int] = None, trial_days: int = 0) -> None:
    """Set user plan and allocate tokens."""
    _ensure_auth_db_ready()
    normalized_plan = _normalize_plan_key(plan)
    conn = _auth_db_conn()
    try:
        if tokens is None:
            tokens = PLAN_TOKENS.get(normalized_plan, PLAN_TOKENS.get("free", 10))
        
        token_reset_at = None
        trial_ends = None
        
        if _is_pro_plan(normalized_plan) and trial_days > 0:
            trial_ends = (datetime.now(timezone.utc) + timedelta(days=trial_days)).isoformat()
        else:
            # Set token reset to 30 days from now
            token_reset_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        
        conn.execute(
            """
            UPDATE users 
            SET plan=?, tokens=?, token_reset_at=?, trial_ends=?
            WHERE id=?
            """,
            (normalized_plan, tokens, token_reset_at, trial_ends, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def _promo_plan_scope(plan: str) -> str:
    normalized_plan = _normalize_plan_key(plan)
    if normalized_plan in {"monthly", "annual"}:
        return "growth"
    return normalized_plan


def _plan_checkout_amount_inr(plan: str) -> int:
    normalized_plan = _normalize_plan_key(plan)
    if normalized_plan == "free":
        return 0
    if normalized_plan == "starter":
        return max(0, int(RAZORPAY_STARTER_AMOUNT_INR))
    if normalized_plan == "annual":
        return max(0, int(RAZORPAY_ANNUAL_AMOUNT_INR))
    if normalized_plan == "usage":
        return max(0, int(RAZORPAY_USAGE_AMOUNT_INR))
    return max(0, int(RAZORPAY_AMOUNT_INR))


def _format_inr(amount: int) -> str:
    safe_amount = max(0, int(amount or 0))
    return f"₹{safe_amount:,.0f}"


def _get_promo_code(code: str) -> Optional[dict[str, Any]]:
    _ensure_auth_db_ready()
    cleaned_code = str(code or "").strip().upper()
    if not cleaned_code:
        return None
    conn = _auth_db_conn()
    try:
        row = conn.execute(
            "SELECT id, code, type, value, max_uses, used_count, expires_at, plan_scope, active, created_at FROM promo_codes WHERE code=?",
            (cleaned_code,),
        ).fetchone()
        if not row:
            return None
        return {
            "id": str(row["id"] or ""),
            "code": str(row["code"] or cleaned_code).upper(),
            "type": str(row["type"] or "percentage").strip().lower(),
            "value": int(row["value"] or 0),
            "max_uses": int(row["max_uses"] or 0),
            "used_count": int(row["used_count"] or 0),
            "expires_at": str(row["expires_at"] or ""),
            "plan_scope": str(row["plan_scope"] or "all").strip().lower(),
            "active": bool(int(row["active"] or 0)),
            "created_at": str(row["created_at"] or ""),
        }
    finally:
        conn.close()


def _create_promo_code(
    code: str,
    *,
    promo_type: str = "percentage",
    value: int = 0,
    max_uses: int = 0,
    expires_at: Optional[str] = None,
    plan_scope: str = "all",
    active: bool = True,
) -> str:
    _ensure_auth_db_ready()
    promo_id = uuid4().hex
    conn = _auth_db_conn()
    try:
        conn.execute(
            """
            INSERT INTO promo_codes(id, code, type, value, max_uses, used_count, expires_at, plan_scope, active, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
            """,
            (
                promo_id,
                str(code or "").strip().upper(),
                str(promo_type or "percentage").strip().lower(),
                max(0, int(value or 0)),
                max(0, int(max_uses or 0)),
                expires_at,
                str(plan_scope or "all").strip().lower(),
                1 if active else 0,
                _now_iso(),
            ),
        )
        conn.commit()
        return promo_id
    finally:
        conn.close()


def _promo_applies_to_plan(promo: dict[str, Any], plan: str) -> bool:
    scope = str(promo.get("plan_scope") or "all").strip().lower()
    if scope == "all":
        return True
    return scope == _promo_plan_scope(plan)


def _build_promo_quote(code: str, plan: str) -> dict[str, Any]:
    promo = _get_promo_code(code)
    if not promo:
        return {"valid": False, "reason": "Invalid code"}

    if not promo.get("active", False):
        return {"valid": False, "reason": "Invalid code"}

    expires_at = _safe_parse_iso(str(promo.get("expires_at") or ""))
    if expires_at and expires_at < datetime.now(timezone.utc):
        return {"valid": False, "reason": "Expired"}

    max_uses = int(promo.get("max_uses") or 0)
    used_count = int(promo.get("used_count") or 0)
    if max_uses > 0 and used_count >= max_uses:
        return {"valid": False, "reason": "Limit reached"}

    if not _promo_applies_to_plan(promo, plan):
        return {"valid": False, "reason": "Not applicable"}

    base_amount = _plan_checkout_amount_inr(plan)
    promo_type = str(promo.get("type") or "percentage").strip().lower()
    promo_value = max(0, int(promo.get("value") or 0))
    discount_amount = 0
    trial_extension_days = 0

    if promo_type == "percentage" and base_amount > 0:
        discount_amount = int(round(base_amount * min(100, promo_value) / 100.0))
    elif promo_type == "fixed" and base_amount > 0:
        discount_amount = min(base_amount, promo_value)
    elif promo_type == "trial_extension":
        trial_extension_days = promo_value

    final_amount = max(0, base_amount - discount_amount)
    checkout_mode = "free" if final_amount <= 0 and promo_type != "trial_extension" else ("subscription" if promo_type == "trial_extension" else "order")

    promo_payload = {
        **promo,
        "base_amount_inr": base_amount,
        "discount_amount_inr": discount_amount,
        "final_amount_inr": final_amount,
        "trial_extension_days": trial_extension_days,
        "checkout_mode": checkout_mode,
        "summary": (
            f"{promo_value}% off applied. Checkout total { _format_inr(final_amount) }"
            if promo_type == "percentage"
            else (
                f"{_format_inr(discount_amount)} off applied. Checkout total { _format_inr(final_amount) }"
                if promo_type == "fixed"
                else f"Trial extended by {trial_extension_days} day{'s' if trial_extension_days != 1 else ''}."
            )
        ),
        "applicable_plan": _normalize_plan_key(plan),
    }
    return {"valid": True, "promo": promo_payload}


def _increment_promo_usage(promo_id: str) -> None:
    if not promo_id:
        return
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        conn.execute("UPDATE promo_codes SET used_count = used_count + 1 WHERE id=?", (promo_id,))
        conn.commit()
    finally:
        conn.close()


def _consume_promo_usage(user_id: int, promo: dict[str, Any]) -> None:
    promo_id = str(promo.get("id") or "").strip()
    if not promo_id:
        return
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        existing = conn.execute(
            "SELECT id FROM promo_usage WHERE user_id=? AND promo_id=?",
            (user_id, promo_id),
        ).fetchone()
        if existing:
            return
        conn.execute(
            "INSERT INTO promo_usage(user_id, promo_id, used_at) VALUES (?, ?, ?)",
            (user_id, promo_id, _now_iso()),
        )
        conn.commit()
    finally:
        conn.close()


def _apply_promo_code(user_id: int, code: str) -> tuple[bool, str]:
    quote = _build_promo_quote(code, "monthly")
    if not quote.get("valid"):
        return False, str(quote.get("reason") or "Invalid code")
    promo = dict(quote.get("promo") or {})
    promo_type = str(promo.get("type") or "percentage")
    if promo_type == "trial_extension":
        _set_user_plan(user_id, "monthly", tokens=PLAN_TOKENS.get("monthly", 500), trial_days=int(promo.get("trial_extension_days") or 0))
    else:
        _set_user_plan(user_id, "monthly", tokens=PLAN_TOKENS.get("monthly", 500))
    _consume_promo_usage(user_id, promo)
    _increment_promo_usage(str(promo.get("id") or ""))
    return True, f"Promo applied: {promo.get('summary', 'Discount applied')}"



def _get_usage(user_id: int) -> dict:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        row = conn.execute(
            "SELECT scans_used, emails_scanned_count, rewrite_clicked, last_scan, last_active FROM usage WHERE user_id=?",
            (user_id,),
        ).fetchone()
        if not row:
            return {
                "scans_used": 0,
                "emails_scanned_count": 0,
                "rewrite_clicked": 0,
                "last_scan": "",
                "last_active": "",
            }
        return {
            "scans_used": int(row["scans_used"]),
            "emails_scanned_count": int(row["emails_scanned_count"]),
            "rewrite_clicked": int(row["rewrite_clicked"]),
            "last_scan": str(row["last_scan"] or ""),
            "last_active": str(row["last_active"] or ""),
        }
    finally:
        conn.close()


def _increment_user_scan(user_id: int) -> int:
    _ensure_auth_db_ready()
    now = _now_iso()
    conn = _auth_db_conn()
    try:
        conn.execute(
            """
            INSERT INTO usage(user_id, scans_used, emails_scanned_count, rewrite_clicked, last_scan, last_active)
            VALUES (?, 1, 1, 0, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                scans_used = scans_used + 1,
                emails_scanned_count = emails_scanned_count + 1,
                last_scan = excluded.last_scan,
                last_active = excluded.last_active
            """,
            (user_id, now, now),
        )
        conn.execute("UPDATE users SET last_active=? WHERE id=?", (now, user_id))
        activity_date = datetime.now(timezone.utc).date().isoformat()
        conn.execute(
            """
            INSERT INTO user_daily_activity(user_id, activity_date, scans_count, last_activity_at)
            VALUES (?, ?, 1, ?)
            ON CONFLICT(user_id, activity_date) DO UPDATE SET
                scans_count = scans_count + 1,
                last_activity_at = excluded.last_activity_at
            """,
            (user_id, activity_date, now),
        )
        conn.commit()
        row = conn.execute("SELECT scans_used FROM usage WHERE user_id=?", (user_id,)).fetchone()
        return int(row["scans_used"]) if row else 0
    finally:
        conn.close()


def _record_user_feedback(user_id: int, outcome: str, from_risk_band: str, to_risk_band: str) -> None:
    _ensure_auth_db_ready()
    now = _now_iso()
    conn = _auth_db_conn()
    try:
        conn.execute(
            "INSERT INTO user_feedback(user_id, outcome, from_risk_band, to_risk_band, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, (outcome or "not_sure")[:24], (from_risk_band or "")[:80], (to_risk_band or "")[:80], now),
        )
        conn.execute("UPDATE users SET last_active=? WHERE id=?", (now, user_id))
        conn.commit()
    finally:
        conn.close()


def _recent_user_feedback(user_id: int, limit: int = 5) -> list[dict]:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        rows = conn.execute(
            "SELECT outcome, from_risk_band, to_risk_band, created_at FROM user_feedback WHERE user_id=? ORDER BY id DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        result: list[dict] = []
        for row in rows:
            result.append(
                {
                    "outcome": str(row["outcome"] or "not_sure"),
                    "from_risk_band": str(row["from_risk_band"] or ""),
                    "to_risk_band": str(row["to_risk_band"] or ""),
                    "created_at": str(row["created_at"] or ""),
                }
            )
        return result
    finally:
        conn.close()


def _store_lead_capture(email: str, source: str, anon_id: str = "") -> None:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        conn.execute(
            "INSERT INTO lead_captures(anon_id, email, source, created_at) VALUES (?, ?, ?, ?)",
            ((anon_id or "")[:120], (email or "")[:120], (source or "capture_gate")[:40], _now_iso()),
        )
        conn.commit()
    finally:
        conn.close()


def _store_saved_fix(
    user_id: int,
    *,
    original_subject: str,
    original_body: str,
    rewritten_subject: str,
    rewritten_body: str,
    score_delta: int,
    from_risk_band: str,
    to_risk_band: str,
    rewrite_style: str,
) -> None:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        conn.execute(
            """
            INSERT INTO saved_fixes(
                user_id,
                original_subject,
                original_body,
                rewritten_subject,
                rewritten_body,
                score_delta,
                from_risk_band,
                to_risk_band,
                rewrite_style,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                (original_subject or "")[:240],
                (original_body or "")[:4000],
                (rewritten_subject or "")[:240],
                (rewritten_body or "")[:4000],
                int(score_delta or 0),
                (from_risk_band or "")[:80],
                (to_risk_band or "")[:80],
                (rewrite_style or "balanced")[:32],
                _now_iso(),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def _recent_saved_fixes(user_id: int, limit: int = 8) -> list[dict]:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        rows = conn.execute(
            """
            SELECT original_subject, original_body, rewritten_subject, rewritten_body, score_delta,
                   from_risk_band, to_risk_band, rewrite_style, created_at
            FROM saved_fixes
            WHERE user_id=?
            ORDER BY id DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
        result: list[dict] = []
        for row in rows:
            result.append(
                {
                    "original_subject": str(row["original_subject"] or ""),
                    "original_body": str(row["original_body"] or ""),
                    "rewritten_subject": str(row["rewritten_subject"] or ""),
                    "rewritten_body": str(row["rewritten_body"] or ""),
                    "score_delta": int(row["score_delta"] or 0),
                    "from_risk_band": str(row["from_risk_band"] or ""),
                    "to_risk_band": str(row["to_risk_band"] or ""),
                    "rewrite_style": str(row["rewrite_style"] or "balanced"),
                    "created_at": str(row["created_at"] or ""),
                }
            )
        return result
    finally:
        conn.close()


def _is_email_like(value: str) -> bool:
    text = (value or "").strip()
    return bool(text and "@" in text and "." in text.split("@", 1)[-1])


def _normalize_plan_key(value: str) -> str:
    plan = str(value or "").strip().lower()
    aliases = {
        "growth": "monthly",
        "pro": "monthly",
        "starter_trial": "starter",
        "trial": "starter",
        "free_trial": "free",
    }
    plan = aliases.get(plan, plan)
    if plan in {"free", "starter", "monthly", "annual", "usage"}:
        return plan
    return "monthly"


def _is_pro_plan(plan: str) -> bool:
    return _normalize_plan_key(plan) in {"monthly", "annual"}


def _plan_catalog() -> dict[str, dict[str, Any]]:
    pro_plan_id = RAZORPAY_PRO_PLAN_ID or RAZORPAY_PLAN_ID
    starter_plan_id = RAZORPAY_STARTER_PLAN_ID or RAZORPAY_TRIAL_PLAN_ID or RAZORPAY_PLAN_ID
    return {
        "free": {
            "label": "Free",
            "display_price": "$0",
            "plan_id": "",
            "trial_days": 0,
        },
        "starter": {
            "label": "Starter",
            "display_price": "$2",
            "plan_id": starter_plan_id,
            "trial_days": 0,
        },
        "monthly": {
            "label": "Growth Monthly",
            "display_price": RAZORPAY_DISPLAY_PRICE_USD,
            "plan_id": pro_plan_id,
            "trial_days": 0,
        },
        "pro": {
            "label": "Growth",
            "display_price": RAZORPAY_DISPLAY_PRICE_USD,
            "plan_id": pro_plan_id,
            "trial_days": 0,
        },
        "annual": {
            "label": "Growth Annual",
            "display_price": "$99",
            "plan_id": RAZORPAY_ANNUAL_PLAN_ID,
            "trial_days": 0,
        },
        "trial": {
            "label": "Starter Trial",
            "display_price": "$0 now",
            "plan_id": starter_plan_id,
            "trial_days": max(0, TRIAL_DAYS),
        },
        "usage": {
            "label": "Usage-Based",
            "display_price": "$0.02 / scan",
            "plan_id": "",
            "trial_days": 0,
        },
    }


def _create_api_key(user_id: int, key_name: str) -> str:
    _ensure_auth_db_ready()
    raw = f"ig_{secrets.token_urlsafe(32)}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    hint = f"...{raw[-6:]}"
    conn = _auth_db_conn()
    try:
        conn.execute(
            "INSERT INTO api_keys(user_id, key_hash, key_hint, name, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)",
            (user_id, digest, hint, (key_name or "Primary key")[:80], _now_iso()),
        )
        conn.commit()
    finally:
        conn.close()
    return raw


def _list_api_keys(user_id: int) -> list[dict[str, Any]]:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        rows = conn.execute(
            "SELECT id, key_hint, name, status, created_at, last_used_at FROM api_keys WHERE user_id=? ORDER BY id DESC",
            (user_id,),
        ).fetchall()
    finally:
        conn.close()

    return [
        {
            "id": int(row["id"]),
            "key_hint": str(row["key_hint"] or ""),
            "name": str(row["name"] or "Primary key"),
            "status": str(row["status"] or "active"),
            "created_at": str(row["created_at"] or ""),
            "last_used_at": str(row["last_used_at"] or ""),
        }
        for row in rows
    ]


def _revoke_api_key(user_id: int, key_id: int) -> bool:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        result = conn.execute(
            "UPDATE api_keys SET status='revoked' WHERE user_id=? AND id=?",
            (user_id, key_id),
        )
        conn.commit()
        return int(result.rowcount or 0) > 0
    finally:
        conn.close()


def _authenticate_api_key(x_api_key: str) -> Optional[dict[str, Any]]:
    if not x_api_key:
        return None
    digest = hashlib.sha256(x_api_key.encode("utf-8")).hexdigest()
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        row = conn.execute(
            "SELECT id, user_id, status FROM api_keys WHERE key_hash=? LIMIT 1",
            (digest,),
        ).fetchone()
        if not row or str(row["status"] or "") != "active":
            return None
        conn.execute("UPDATE api_keys SET last_used_at=? WHERE id=?", (_now_iso(), int(row["id"])))
        conn.commit()
        return {"api_key_id": int(row["id"]), "user_id": int(row["user_id"])}
    finally:
        conn.close()


def _create_team(owner_user_id: int, name: str) -> int:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    now = _now_iso()
    try:
        cur = conn.execute(
            "INSERT INTO teams(owner_user_id, name, created_at) VALUES (?, ?, ?)",
            (owner_user_id, (name or "My Team")[:120], now),
        )
        team_id = int(cur.lastrowid or 0)
        conn.execute(
            "INSERT OR IGNORE INTO team_members(team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
            (team_id, owner_user_id, "owner", now),
        )
        conn.commit()
        return team_id
    finally:
        conn.close()


def _add_team_member(team_id: int, user_id: int, role: str) -> None:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO team_members(team_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
            (team_id, user_id, (role or "member")[:24], _now_iso()),
        )
        conn.commit()
    finally:
        conn.close()


def _teams_for_user(user_id: int) -> list[dict[str, Any]]:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        rows = conn.execute(
            """
            SELECT t.id, t.name, tm.role, t.created_at
            FROM teams t
            JOIN team_members tm ON tm.team_id=t.id
            WHERE tm.user_id=?
            ORDER BY t.id DESC
            """,
            (user_id,),
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            "team_id": int(row["id"]),
            "name": str(row["name"] or "Team"),
            "role": str(row["role"] or "member"),
            "created_at": str(row["created_at"] or ""),
        }
        for row in rows
    ]


def _record_async_job(
    job_id: str,
    user_id: Optional[int],
    status: str,
    *,
    queue_name: str = "analysis",
    retries: int = 0,
    max_retries: int = ASYNC_JOB_MAX_RETRIES,
    timeout_seconds: int = ASYNC_JOB_TIMEOUT_SECONDS,
    result_json: str = "",
    error_message: str = "",
) -> None:
    _ensure_auth_db_ready()
    now = _now_iso()
    wrapped = {
        "queue_name": queue_name,
        "retries": int(retries),
        "max_retries": int(max_retries),
        "timeout_seconds": int(timeout_seconds),
        "result": {},
    }
    if result_json:
        try:
            wrapped["result"] = json.loads(result_json)
        except json.JSONDecodeError:
            wrapped["result"] = {}
    conn = _auth_db_conn()
    try:
        conn.execute(
            """
            INSERT INTO async_jobs(id, user_id, status, result_json, error_message, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status=excluded.status,
                result_json=excluded.result_json,
                error_message=excluded.error_message,
                updated_at=excluded.updated_at
            """,
            (job_id, user_id, status, json.dumps(wrapped), error_message, now, now),
        )
        conn.commit()
    finally:
        conn.close()


def _get_async_job(job_id: str) -> Optional[dict[str, Any]]:
    if not job_id:
        return None
    if job_id in ASYNC_JOB_STORE:
        return ASYNC_JOB_STORE[job_id]
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        row = conn.execute(
            "SELECT id, user_id, status, result_json, error_message, created_at, updated_at FROM async_jobs WHERE id=?",
            (job_id,),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    result_json = str(row["result_json"] or "")
    payload: dict[str, Any] = {"result": {}}
    if result_json:
        try:
            payload = json.loads(result_json)
        except json.JSONDecodeError:
            payload = {"result": {}}
    return {
        "id": str(row["id"]),
        "user_id": int(row["user_id"]) if row["user_id"] is not None else None,
        "status": str(row["status"] or "queued"),
        "queue_name": str(payload.get("queue_name", "analysis")),
        "retries": int(payload.get("retries", 0)),
        "max_retries": int(payload.get("max_retries", ASYNC_JOB_MAX_RETRIES)),
        "timeout_seconds": int(payload.get("timeout_seconds", ASYNC_JOB_TIMEOUT_SECONDS)),
        "result": payload.get("result", {}),
        "error": str(row["error_message"] or ""),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
    }


def _save_seed_test(user_id: Optional[int], campaign_name: str, provider: str, inbox_count: int, spam_count: int, notes: str) -> None:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        conn.execute(
            "INSERT INTO seed_tests(user_id, campaign_name, provider, inbox_count, spam_count, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, (campaign_name or "Campaign")[:120], (provider or "gmail")[:40], max(0, inbox_count), max(0, spam_count), (notes or "")[:500], _now_iso()),
        )
        conn.commit()
    finally:
        conn.close()


def _recent_seed_tests(user_id: Optional[int], limit: int = 10) -> list[dict[str, Any]]:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        if user_id is None:
            rows = conn.execute(
                "SELECT campaign_name, provider, inbox_count, spam_count, notes, created_at FROM seed_tests ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT campaign_name, provider, inbox_count, spam_count, notes, created_at FROM seed_tests WHERE user_id=? ORDER BY id DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
    finally:
        conn.close()

    return [
        {
            "campaign_name": str(row["campaign_name"] or "Campaign"),
            "provider": str(row["provider"] or "gmail"),
            "inbox_count": int(row["inbox_count"] or 0),
            "spam_count": int(row["spam_count"] or 0),
            "notes": str(row["notes"] or ""),
            "created_at": str(row["created_at"] or ""),
        }
        for row in rows
    ]


def _blacklist_check(domain: str) -> dict[str, Any]:
    clean = (domain or "").strip().lower()
    if not clean:
        return {"domain": "", "listed": False, "risk": "unknown", "details": "No domain provided."}
    listed = clean in BLACKLISTED_DOMAINS
    return {
        "domain": clean,
        "listed": listed,
        "risk": "high" if listed else "low",
        "details": "Domain matched known risky disposable/abuse sender patterns." if listed else "No direct match found in the internal risk list.",
    }


def _seed_accounts() -> list[dict[str, Any]]:
    if not SEED_ACCOUNTS_JSON:
        return []
    try:
        rows = json.loads(SEED_ACCOUNTS_JSON)
        if not isinstance(rows, list):
            return []
        out: list[dict[str, Any]] = []
        for item in rows:
            if not isinstance(item, dict):
                continue
            out.append(
                {
                    "provider": str(item.get("provider", "unknown")).lower(),
                    "email": str(item.get("email", "")).strip(),
                    "password": str(item.get("password", "")).strip(),
                    "imap_host": str(item.get("imap_host", "")).strip(),
                    "imap_port": int(item.get("imap_port", 993) or 993),
                }
            )
        return out
    except Exception:
        logger.exception("Could not parse INBOXGUARD_SEED_ACCOUNTS_JSON")
        return []


def _imap_box_for_provider(provider: str) -> str:
    low = str(provider or "").lower()
    if "gmail" in low:
        return '"[Gmail]/Spam"'
    if "outlook" in low:
        return "Junk"
    if "yahoo" in low:
        return "Bulk"
    return "INBOX"


def _classify_seed_result(in_inbox: bool, in_spam: bool, provider: str) -> str:
    if in_inbox and not in_spam:
        return "inbox"
    if in_spam:
        return "spam"
    if "gmail" in str(provider).lower() and not in_inbox:
        return "promotions"
    return "unknown"


def _search_mailbox(mail: imaplib.IMAP4_SSL, box: str, subject_token: str) -> bool:
    try:
        status, _ = mail.select(box)
        if status != "OK":
            return False
        status, data = mail.search(None, '(SUBJECT "' + subject_token.replace('"', "")[:60] + '")')
        if status != "OK" or not data:
            return False
        ids = data[0].split()
        return bool(ids)
    except Exception:
        return False


def _send_seed_probe(subject_token: str, body_text: str, recipients: list[str]) -> bool:
    if not (SEED_SMTP_HOST and SEED_SMTP_USER and SEED_SMTP_PASS and SEED_SMTP_FROM):
        return False
    if not recipients:
        return False
    msg = EmailMessage()
    msg["From"] = SEED_SMTP_FROM
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = f"[IG-SEED] {subject_token}"
    msg.set_content(body_text[:3000] or "InboxGuard seed test probe")
    try:
        with smtplib.SMTP(SEED_SMTP_HOST, SEED_SMTP_PORT, timeout=20) as server:
            server.starttls()
            server.login(SEED_SMTP_USER, SEED_SMTP_PASS)
            server.send_message(msg)
        return True
    except Exception:
        logger.exception("Seed probe SMTP send failed")
        return False


def _run_seed_test(subject_token: str, body_text: str, wait_seconds: int = 5) -> dict[str, str]:
    accounts = _seed_accounts()
    if not accounts:
        raise HTTPException(status_code=503, detail="Seed accounts are not configured")

    _send_seed_probe(subject_token, body_text, [a["email"] for a in accounts if a.get("email")])

    # Allow mailbox indexing and provider categorization to settle before IMAP checks.
    delay = max(0, min(20, int(wait_seconds or 0)))
    if delay:
        time.sleep(delay)

    results: dict[str, str] = {}
    for account in accounts:
        provider = str(account.get("provider", "unknown")).lower()
        email = str(account.get("email", "")).strip()
        password = str(account.get("password", "")).strip()
        host = str(account.get("imap_host", "")).strip()
        port = int(account.get("imap_port", 993) or 993)
        if not (email and password and host):
            results[provider] = "unknown"
            continue
        try:
            with imaplib.IMAP4_SSL(host, port) as mail:
                mail.login(email, password)
                in_inbox = _search_mailbox(mail, "INBOX", subject_token)
                in_spam = _search_mailbox(mail, _imap_box_for_provider(provider), subject_token)
                results[provider] = _classify_seed_result(in_inbox, in_spam, provider)
        except Exception:
            logger.exception("Seed IMAP check failed for provider=%s", provider)
            results[provider] = "unknown"
    return results


def _campaign_debugger_logic(open_rate: float, reply_rate: float, bounce_rate: float, sent_count: int) -> dict[str, Any]:
    o = max(0.0, min(100.0, float(open_rate or 0.0)))
    r = max(0.0, min(100.0, float(reply_rate or 0.0)))
    b = max(0.0, min(100.0, float(bounce_rate or 0.0)))
    sent = max(0, int(sent_count or 0))

    severity_score = 0
    diagnosis = "Mixed issue"
    confidence = "medium"
    why = "Signals are mixed. Start with highest-impact fixes below and re-test on a smaller batch."
    actions: list[str] = [
        "Run a 50-email controlled test after each fix to isolate impact.",
        "Reduce links and heavy CTA pressure in first-touch emails.",
        "Validate SPF, DKIM, and DMARC alignment for sending domain.",
    ]
    issue = "No Major Issues"
    reason = "Your campaign metrics look healthy."
    action = "Scale this campaign."

    if b >= 5.0:
        diagnosis = "List quality / deliverability issue"
        confidence = "high"
        severity_score = 90
        why = "Bounce rate is elevated, which usually indicates invalid contacts or sender trust issues."
        actions = [
            "Clean the list immediately: remove invalid and risky addresses.",
            "Pause high-volume sends until bounce rate drops below 3%.",
            "Verify domain authentication and sending reputation before next batch.",
        ]
        issue = "High Bounce Rate"
        reason = "Your email list quality is poor or domains are invalid."
        action = "Clean your list and verify emails before sending."
    elif o < 20.0:
        diagnosis = "Deliverability issue"
        confidence = "high"
        severity_score = 86
        why = "Very low open rate strongly suggests spam-folder placement or weak sender trust."
        actions = [
            "Check SPF, DKIM, and DMARC alignment first.",
            "Reduce suspicious patterns: urgency phrases, too many links, promotional tone.",
            "Warm domain gradually and test with smaller sends before scaling.",
        ]
        issue = "Low Open Rate"
        reason = "Your emails are likely going to spam or subject line trust is weak."
        action = "Improve subject line and deliverability baseline."
    elif o < 30.0:
        diagnosis = "Deliverability issue"
        confidence = "high"
        severity_score = 82
        why = "Low open rate usually indicates inbox placement problems rather than copy quality."
        actions = [
            "Check SPF, DKIM, and DMARC alignment first.",
            "Reduce suspicious patterns: urgency phrases, too many links, promotional tone.",
            "Warm domain gradually and test with smaller sends before scaling.",
        ]
        issue = "Low Open Rate"
        reason = "Inbox placement looks weak for this campaign."
        action = "Fix deliverability posture before scaling."
    elif o >= 40.0 and r < 2.0:
        diagnosis = "Copy / targeting issue"
        confidence = "high"
        severity_score = 68
        why = "Healthy opens but weak replies suggest the message or audience fit is off."
        actions = [
            "Rewrite first two lines for relevance to recipient context.",
            "Use one low-pressure CTA with a clear, specific ask.",
            "Tighten ICP targeting and segment by persona before next send.",
        ]
        issue = "Low Reply Rate"
        reason = "Your email content is being opened but not engaging enough to reply."
        action = "Improve personalization and CTA clarity."
    elif o >= 30.0 and o < 40.0 and r < 2.0:
        diagnosis = "Mixed deliverability + copy issue"
        confidence = "medium"
        severity_score = 74
        why = "Both opens and replies are under target, suggesting placement and message friction together."
        actions = [
            "Fix technical/authentication baseline first.",
            "Then test a safer subject line and simpler body copy.",
            "Compare control vs rewritten variant on equal audience slices.",
        ]
        issue = "Mixed Performance Issue"
        reason = "Both deliverability and message effectiveness need correction."
        action = "Fix technical trust first, then iterate copy variant tests."

    if sent > 0 and sent < 100:
        actions.append("Sample size is small; validate with a larger controlled batch before major changes.")
    if sent >= 1000 and o < 35:
        actions.append("High volume with weak opens: pause scale-up until placement stabilizes.")

    if severity_score == 0:
        severity_score = 50 if r < 2 else 35

    return {
        "ok": True,
        "issue": issue,
        "reason": reason,
        "action": action,
        "diagnosis": diagnosis,
        "confidence": confidence,
        "why": why,
        "actions": actions,
        "severity_score": severity_score,
        "benchmarks": {
            "open_rate_target_min": 35.0,
            "reply_rate_target_min": 2.0,
            "bounce_rate_target_max": 3.0,
        },
        "inputs": {
            "open_rate": o,
            "reply_rate": r,
            "bounce_rate": b,
            "sent_count": sent,
        },
    }


def _record_email_outcome(user_id: int, score: int, outcome: str, risk_band: str = "") -> None:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        conn.execute(
            "INSERT INTO email_outcomes(user_id, score, outcome, risk_band, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, int(score), (outcome or "not_sure")[:24], (risk_band or "")[:80], _now_iso()),
        )
        conn.commit()
    finally:
        conn.close()


def _benchmark_top_inbox_score(rows: list[sqlite3.Row]) -> tuple[Optional[int], int]:
    inbox_scores = sorted(
        [int(row["score"] or 0) for row in rows if str(row["outcome"] or "") == "inbox"],
        reverse=True,
    )
    inbox_sample_count = len(inbox_scores)
    if inbox_sample_count < 10:
        return None, inbox_sample_count
    top_ten = inbox_scores[:10]
    return int(round(sum(top_ten) / len(top_ten))), inbox_sample_count


def _score_outcome_stats(user_id: int) -> dict[str, Any]:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        rows = conn.execute(
            "SELECT score, outcome FROM email_outcomes WHERE user_id=? ORDER BY id DESC LIMIT 300",
            (user_id,),
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        return {
            "samples": 0,
            "inbox_rate": 0.0,
            "score_bands": [],
            "benchmark_top_10_score": None,
            "benchmark_inbox_samples": 0,
        }

    total = len(rows)
    inbox_hits = sum(1 for r in rows if str(r["outcome"] or "") == "inbox")
    bands: dict[str, dict[str, int]] = {
        "0-49": {"total": 0, "inbox": 0},
        "50-69": {"total": 0, "inbox": 0},
        "70-84": {"total": 0, "inbox": 0},
        "85-100": {"total": 0, "inbox": 0},
    }
    for row in rows:
        score = int(row["score"] or 0)
        outcome = str(row["outcome"] or "")
        if score < 50:
            key = "0-49"
        elif score < 70:
            key = "50-69"
        elif score < 85:
            key = "70-84"
        else:
            key = "85-100"
        bands[key]["total"] += 1
        if outcome == "inbox":
            bands[key]["inbox"] += 1

    band_rows = []
    for key, item in bands.items():
        rate = (item["inbox"] / item["total"] * 100.0) if item["total"] else 0.0
        band_rows.append({"band": key, "samples": item["total"], "inbox_rate": round(rate, 1)})

    benchmark_score, benchmark_inbox_samples = _benchmark_top_inbox_score(rows)

    return {
        "samples": total,
        "inbox_rate": round(inbox_hits / total * 100.0, 1),
        "score_bands": band_rows,
        "benchmark_top_10_score": benchmark_score,
        "benchmark_inbox_samples": benchmark_inbox_samples,
    }


def _predict_inbox_probability(score: int, stats: Optional[dict[str, Any]] = None) -> float:
    s = max(0, min(100, int(score or 0)))
    base = max(5.0, min(95.0, 4 + s * 0.95))
    if not stats or int(stats.get("samples", 0)) < 10:
        return round(base, 1)
    for row in stats.get("score_bands", []):
        band = str(row.get("band", ""))
        if band == "0-49" and s < 50:
            return float(row.get("inbox_rate", base))
        if band == "50-69" and 50 <= s < 70:
            return float(row.get("inbox_rate", base))
        if band == "70-84" and 70 <= s < 85:
            return float(row.get("inbox_rate", base))
        if band == "85-100" and s >= 85:
            return float(row.get("inbox_rate", base))
    return round(base, 1)


def _decision_from_inbox_probability(probability: float) -> str:
    p = float(probability or 0.0)
    if p < 45.0:
        return "DO NOT SEND"
    if p < 75.0:
        return "TEST FIRST"
    return "SAFE TO SEND"


def _user_streak_days(user_id: int) -> int:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        rows = conn.execute(
            "SELECT activity_date FROM user_daily_activity WHERE user_id=? ORDER BY activity_date DESC LIMIT 30",
            (user_id,),
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        return 0

    days = [date.fromisoformat(str(row["activity_date"])) for row in rows if row["activity_date"]]
    if not days:
        return 0

    today = datetime.now(timezone.utc).date()
    expected = today
    if days[0] == today - timedelta(days=1):
        expected = today - timedelta(days=1)
    elif days[0] != today:
        return 0

    streak = 0
    for day in days:
        if day == expected:
            streak += 1
            expected = expected - timedelta(days=1)
        elif day < expected:
            break
    return streak


def _health_score(usage: dict, recent_results: list[dict]) -> int:
    scans = int(usage.get("scans_used", 0))
    rewrites = int(usage.get("rewrite_clicked", 0))
    inbox = sum(1 for item in recent_results if item.get("outcome") == "inbox")
    spam = sum(1 for item in recent_results if item.get("outcome") == "spam")

    score = 45
    score += min(scans * 2, 22)
    score += min(rewrites * 1, 12)
    score += inbox * 8
    score -= spam * 10
    return max(0, min(100, int(score)))


def _increment_rewrite_clicked(user_id: int) -> None:
    _ensure_auth_db_ready()
    now = _now_iso()
    conn = _auth_db_conn()
    try:
        conn.execute(
            """
            INSERT INTO usage(user_id, scans_used, emails_scanned_count, rewrite_clicked, last_active)
            VALUES (?, 0, 0, 1, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                rewrite_clicked = rewrite_clicked + 1,
                last_active = excluded.last_active
            """,
            (user_id, now),
        )
        conn.execute("UPDATE users SET last_active=? WHERE id=?", (now, user_id))
        conn.commit()
    finally:
        conn.close()


def _get_session_user(request: Request):
    user_id = int(request.session.get("user_id", 0) or 0)
    email = str(request.session.get("user_email", "")).strip().lower()
    if user_id <= 0 or not email:
        return None
    _enforce_past_due_grace_period(user_id)
    db_user = _get_user_by_id(user_id)
    if not db_user:
        return None
    return {
        "id": user_id,
        "email": email,
        "name": str(request.session.get("user_name", "")).strip(),
        "picture": str(request.session.get("user_picture", "")).strip(),
        "pro": bool(db_user["pro"] if "pro" in db_user.keys() else 0),
        "plan": _normalize_plan_key(str(db_user["plan"] if "plan" in db_user.keys() else "free")),
        "status": str(db_user["status"] if "status" in db_user.keys() and db_user["status"] else "inactive"),
        "subscription_id": str(db_user["subscription_id"] if "subscription_id" in db_user.keys() and db_user["subscription_id"] else ""),
    }


def _display_name_from_email(email: str) -> str:
    local = (email or "").split("@", 1)[0].replace(".", " ").replace("_", " ").strip()
    if not local:
        return "InboxGuard User"
    return " ".join(word.capitalize() for word in local.split() if word)


def _is_crawler_request(request: Request) -> bool:
    user_agent = str(request.headers.get("user-agent", "")).lower()
    crawler_markers = (
        "bot",
        "spider",
        "crawler",
        "googlebot",
        "bingbot",
        "duckduckbot",
        "slurp",
        "baiduspider",
        "yandex",
        "facebookexternalhit",
        "twitterbot",
        "linkedinbot",
        "whatsapp",
        "telegrambot",
    )
    return any(marker in user_agent for marker in crawler_markers)


def _avatar_url_for_email(email: str) -> str:
    digest = hashlib.md5((email or "").strip().lower().encode("utf-8")).hexdigest()
    return f"https://www.gravatar.com/avatar/{digest}?d=identicon&s=120"


def _set_session_user(request: Request, user_id: int, email: str, name: str = "", picture: str = "") -> None:
    request.session["user_id"] = user_id
    request.session["user_email"] = email
    request.session["user_name"] = name.strip() or _display_name_from_email(email)
    request.session["user_picture"] = picture.strip() or _avatar_url_for_email(email)


def _auth_status_payload(request: Request) -> dict:
    user = _get_session_user(request)
    anon_used = _get_anon_scans_used(request)
    lead_email = str(request.session.get("lead_email", "")).strip()
    payload = {
        "authenticated": bool(user),
        "email": user["email"] if user else "",
        "name": user["name"] if user else "",
        "avatar_url": user["picture"] if user else "",
        "anonymous_scans_used": anon_used,
        "anonymous_scans_limit": ANON_SCAN_LIMIT,
        "lead_email_captured": bool(user) or bool(lead_email),
        "lead_email": lead_email,
        "user_scans_used": 0,
        "user_scans_limit": FREE_USER_SCAN_LIMIT,
        "google_enabled": GOOGLE_AUTH_CONFIGURED,
        "pro": False,
        "plan": "free",
        "is_admin": False,
        "status": "inactive",
        "subscription_id": "",
    }
    if user:
        usage = _get_usage(user["id"])
        current_plan = _normalize_plan_key(str(user.get("plan", "free")))
        is_pro = _is_pro_plan(current_plan) or bool(user.get("pro", False))
        payload.update(
            {
                "user_scans_used": usage["scans_used"],
                "emails_scanned_count": usage["emails_scanned_count"],
                "rewrite_clicked": usage["rewrite_clicked"],
                "last_active": usage["last_active"],
                "pro": is_pro,
                "plan": current_plan,
                "is_admin": _is_admin_email(user["email"]),
                "status": str(user.get("status", "inactive")),
                "subscription_id": str(user.get("subscription_id", "")),
            }
        )
    return payload


def _set_user_pro(user_id: int) -> None:
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        _ensure_user_pro_column(conn)
        conn.execute("UPDATE users SET pro=1 WHERE id=?", (user_id,))
        conn.commit()
    finally:
        conn.close()


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


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code != 404:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    path = request.url.path or "/"
    accept = str(request.headers.get("accept", "")).lower()
    wants_html = request.method.upper() == "GET" and "text/html" in accept
    is_static_or_asset = path.startswith("/static/") or "." in path.rsplit("/", 1)[-1]
    api_like_prefixes = (
        "/auth",
        "/api",
        "/plans",
        "/tokens",
        "/create-",
        "/seed",
        "/bulk",
        "/blacklist",
        "/track",
        "/webhook",
        "/razorpay",
        "/health",
    )
    is_api_like = path.startswith(api_like_prefixes)

    if wants_html and not is_static_or_asset and not is_api_like:
        return RedirectResponse(url="/", status_code=307)

    detail = exc.detail if exc.detail is not None else "Not Found"
    return JSONResponse(status_code=404, content={"detail": detail})


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
    return FileResponse(STATIC_DIR / "branding" / "logo.png", media_type="image/png")


@app.get(f"/{GOOGLE_VERIFICATION_FILE}")
def google_site_verification():
    target = BASE_DIR / GOOGLE_VERIFICATION_FILE
    if not target.exists():
        raise HTTPException(status_code=404, detail="Verification file not found")
    return FileResponse(target, media_type="text/html")


@app.get("/", response_class=HTMLResponse)
def landing(request: Request):
    track_event("page_view", {"page": "landing"})
    return render_template_safe(
        request,
        "landing.html",
        {
            "page_title": "InboxGuard - Check if your email will land in inbox before sending",
            "meta_description": "InboxGuard predicts whether your email will land in inbox or spam before you send it. Fix issues and protect your domain.",
            "canonical_url": f"{SITE_URL}/",
        },
    )


@app.get("/app", response_class=HTMLResponse)
def app_dashboard(request: Request):
    track_event("page_view", {"page": "app"})
    response = render_template_safe(
        request,
        "index.html",
        {
            "page_title": "InboxGuard App | Last check before you hit send.",
            "meta_description": "Know if your email will land in inbox before sending. Fix risky drafts before you hit send and protect your domain.",
            "canonical_url": f"{SITE_URL}/app",
            "focus_query": "why did my email go to spam",
        },
    )
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


@app.get("/subject-generator", response_class=HTMLResponse)
def subject_generator_page(request: Request):
    track_event("page_view", {"page": "subject-generator"})
    response = render_template_safe(
        request,
        "subject_generator.html",
        {
            "page_title": "InboxGuard Subject Generator | Write safer subject lines",
            "meta_description": "Generate product-aware subject lines with spam risk checks and body-fit scoring.",
            "canonical_url": f"{SITE_URL}/subject-generator",
        },
    )
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return RedirectResponse(url="/app?auth=1", status_code=303)


@app.get("/access", response_class=HTMLResponse)
def access_page(request: Request):
    return RedirectResponse(url="/pricing", status_code=303)


@app.get("/pricing", response_class=HTMLResponse)
def pricing_page(request: Request):
    user = _get_session_user(request)
    authenticated = bool(user)
    plans = _plan_catalog()
    return render_template_safe(
        request,
        "pricing.html",
        {
            "page_title": "InboxGuard Pricing | Stop guessing. Know before you send.",
            "meta_description": "Upgrade to InboxGuard Pro for unlimited scans, saved history, batch testing, and domain tracking.",
            "canonical_url": f"{SITE_URL}/pricing",
            "authenticated": authenticated,
            "user_email": user["email"] if user else "",
            "user_status": str(user.get("status", "inactive")) if user else "inactive",
            "google_enabled": GOOGLE_AUTH_CONFIGURED,
            "payment_status": request.query_params.get("payment", request.query_params.get("checkout", "")),
            "payment_ready": bool(RAZORPAY_KEY and RAZORPAY_SECRET),
            "display_price_usd": RAZORPAY_DISPLAY_PRICE_USD,
            "charge_currency": "INR",
            "charge_amount_inr": RAZORPAY_AMOUNT_INR,
            "subscription_ready": bool(RAZORPAY_KEY and RAZORPAY_SECRET and RAZORPAY_PLAN_ID),
            "plans": plans,
            "trial_days": TRIAL_DAYS,
        },
    )


@app.post("/create-subscription")
async def create_subscription(request: Request, plan: str = Form("monthly")):
    user = _get_session_user(request)
    if not user:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "Not authenticated"})

    payload: dict[str, Any] = {}
    if "application/json" in str(request.headers.get("content-type", "")).lower():
        payload = await request.json()

    plans = _plan_catalog()
    selected_plan = _normalize_plan_key(str(payload.get("plan") or plan or "monthly"))
    if selected_plan not in plans:
        selected_plan = "monthly"
    plan_data = plans[selected_plan]
    plan_id = str(plan_data.get("plan_id") or "").strip()
    promo_code = str(payload.get("promo_code") or payload.get("promoCode") or "").strip().upper()
    promo_quote = _build_promo_quote(promo_code, selected_plan) if promo_code else {"valid": False}
    promo = cast(dict[str, Any], promo_quote.get("promo") or {}) if promo_quote.get("valid") else cast(dict[str, Any], {})

    if selected_plan == "free":
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "free_mode": True,
                "message": "Free plan selected. No payment required.",
            },
        )

    if selected_plan == "usage":
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "usage_mode": True,
                "message": "Usage-based plan enabled. API usage billing will apply per scan.",
            },
        )

    if promo_code and not promo:
        return JSONResponse(status_code=400, content={"success": False, "detail": str(promo_quote.get("reason") or "Invalid promo code")})

    if promo.get("type") == "trial_extension":
        if not plan_id:
            return JSONResponse(
                status_code=503,
                content={
                    "success": False,
                    "detail": "Subscription not configured",
                    "missing": [f"plan_id_for_{selected_plan}"],
                    "plan": selected_plan,
                },
            )

        subscription_payload = {
            "plan_id": plan_id,
            "customer_notify": 1,
            "total_count": 12,
            "notes": {
                "user_id": str(user["id"]),
                "email": user["email"],
                "plan": selected_plan,
                "promo_code": str(promo.get("code") or ""),
                "promo_type": str(promo.get("type") or ""),
                "promo_value": str(promo.get("value") or 0),
            },
        }
        trial_days = int(plan_data.get("trial_days") or 0) + int(promo.get("trial_extension_days") or 0)
        if trial_days > 0:
            subscription_payload["start_at"] = int((datetime.now(timezone.utc) + timedelta(days=trial_days)).timestamp())

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    "https://api.razorpay.com/v1/subscriptions",
                    auth=(RAZORPAY_KEY, RAZORPAY_SECRET),
                    json=subscription_payload,
                )
        except httpx.HTTPError as error:
            logger.exception("Razorpay subscription creation failed: %s", error)
            return JSONResponse(status_code=502, content={"success": False, "detail": "Could not create subscription"})

        if response.status_code >= 400:
            logger.warning("Razorpay subscription creation failed: status=%s body=%s", response.status_code, response.text)
            return JSONResponse(status_code=502, content={"success": False, "detail": "Could not create subscription"})

        data = response.json()
        subscription_id = str(data.get("id", "")).strip()
        if not subscription_id:
            return JSONResponse(status_code=502, content={"success": False, "detail": "Could not create subscription"})

        _increment_promo_usage(str(promo.get("id") or ""))
        _consume_promo_usage(user["id"], promo)
        _set_user_subscription_state(
            user["id"],
            pro=_is_pro_plan(selected_plan),
            status="pending",
            subscription_id=subscription_id,
        )

        track_event(
            "checkout_started",
            {
                "user_id": str(user["id"]),
                "email": user["email"],
                "provider": "razorpay",
                "type": "subscription",
                "plan": selected_plan,
                "promo_code": str(promo.get("code") or ""),
            },
        )
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "subscription_id": subscription_id,
                "short_url": str(data.get("short_url", "") or ""),
                "key": RAZORPAY_KEY,
                "amount": int(RAZORPAY_AMOUNT_INR) * 100,
                "currency": "INR",
                "display_price": str(plan_data.get("display_price") or RAZORPAY_DISPLAY_PRICE_USD),
                "charge_currency": "INR",
                "plan": selected_plan,
                "promo_code": str(promo.get("code") or ""),
                "promo_applied": True,
            },
        )

    if promo:
        base_amount = int(promo.get("base_amount_inr") or _plan_checkout_amount_inr(selected_plan))
        discount_amount = int(promo.get("discount_amount_inr") or 0)
        final_amount = int(promo.get("final_amount_inr") or max(0, base_amount - discount_amount))
        if final_amount <= 0:
            _increment_promo_usage(str(promo.get("id") or ""))
            _consume_promo_usage(user["id"], promo)
            _set_user_subscription_state(
                user["id"],
                pro=_is_pro_plan(selected_plan),
                status="active",
            )
            _set_user_plan(user["id"], selected_plan, tokens=PLAN_TOKENS.get(selected_plan, PLAN_TOKENS.get("monthly", 500)))
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "free_mode": True,
                    "promo_applied": True,
                    "plan": selected_plan,
                    "display_price": _format_inr(final_amount),
                    "final_amount": final_amount,
                    "discount_amount": discount_amount,
                    "message": "Promo covered the full checkout amount. Access unlocked without payment.",
                },
            )

        order_payload = {
            "amount": final_amount * 100,
            "currency": "INR",
            "receipt": f"ig-{user['id']}-{selected_plan}-{secrets.token_hex(4)}",
            "notes": {
                "user_id": str(user["id"]),
                "email": user["email"],
                "plan": selected_plan,
                "promo_code": str(promo.get("code") or ""),
                "promo_type": str(promo.get("type") or ""),
                "promo_value": str(promo.get("value") or 0),
                "base_amount_inr": str(base_amount),
                "discount_amount_inr": str(discount_amount),
                "final_amount_inr": str(final_amount),
            },
        }
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    "https://api.razorpay.com/v1/orders",
                    auth=(RAZORPAY_KEY, RAZORPAY_SECRET),
                    json=order_payload,
                )
        except httpx.HTTPError as error:
            logger.exception("Razorpay order creation failed: %s", error)
            return JSONResponse(status_code=502, content={"success": False, "detail": "Could not create checkout order"})

        if response.status_code >= 400:
            logger.warning("Razorpay order creation failed: status=%s body=%s", response.status_code, response.text)
            return JSONResponse(status_code=502, content={"success": False, "detail": "Could not create checkout order"})

        order_data = response.json()
        order_id = str(order_data.get("id", "")).strip()
        if not order_id:
            return JSONResponse(status_code=502, content={"success": False, "detail": "Could not create checkout order"})

        _increment_promo_usage(str(promo.get("id") or ""))
        _consume_promo_usage(user["id"], promo)
        track_event(
            "checkout_started",
            {
                "user_id": str(user["id"]),
                "email": user["email"],
                "provider": "razorpay",
                "type": "order",
                "plan": selected_plan,
                "promo_code": str(promo.get("code") or ""),
                "discount_amount": str(discount_amount),
            },
        )
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "checkout_type": "order",
                "order_id": order_id,
                "key": RAZORPAY_KEY,
                "amount": final_amount * 100,
                "currency": "INR",
                "display_price": _format_inr(final_amount),
                "base_amount": base_amount,
                "discount_amount": discount_amount,
                "promo_code": str(promo.get("code") or ""),
                "plan": selected_plan,
                "promo_applied": True,
            },
        )

    missing_config = []
    if not RAZORPAY_KEY:
        missing_config.append("RAZORPAY_KEY")
    if not RAZORPAY_SECRET:
        missing_config.append("RAZORPAY_SECRET")
    if not plan_id:
        missing_config.append(f"plan_id_for_{selected_plan}")
    if missing_config:
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "detail": "Subscription not configured",
                "missing": missing_config,
                "plan": selected_plan,
            },
        )

    subscription_payload = {
        "plan_id": plan_id,
        "customer_notify": 1,
        "total_count": 12,
        "notes": {
            "user_id": str(user["id"]),
            "email": user["email"],
            "plan": selected_plan,
            "promo_code": promo_code,
        },
    }
    trial_days = int(plan_data.get("trial_days") or 0)
    if trial_days > 0:
        subscription_payload["start_at"] = int((datetime.now(timezone.utc) + timedelta(days=trial_days)).timestamp())

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                "https://api.razorpay.com/v1/subscriptions",
                auth=(RAZORPAY_KEY, RAZORPAY_SECRET),
                json=subscription_payload,
            )
    except httpx.HTTPError as error:
        logger.exception("Razorpay subscription creation failed: %s", error)
        return JSONResponse(status_code=502, content={"success": False, "detail": "Could not create subscription"})

    if response.status_code >= 400:
        logger.warning("Razorpay subscription creation failed: status=%s body=%s", response.status_code, response.text)
        return JSONResponse(status_code=502, content={"success": False, "detail": "Could not create subscription"})

    data = response.json()
    subscription_id = str(data.get("id", "")).strip()
    if not subscription_id:
        return JSONResponse(status_code=502, content={"success": False, "detail": "Could not create subscription"})

    _set_user_subscription_state(
        user["id"],
        pro=False,
        status="pending",
        subscription_id=subscription_id,
    )

    track_event(
        "checkout_started",
        {
            "user_id": str(user["id"]),
            "email": user["email"],
            "provider": "razorpay",
            "type": "subscription",
            "plan": selected_plan,
        },
    )
    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "subscription_id": subscription_id,
            "short_url": str(data.get("short_url", "") or ""),
            "key": RAZORPAY_KEY,
            "amount": int(RAZORPAY_AMOUNT_INR) * 100,
            "currency": "INR",
            "display_price": str(plan_data.get("display_price") or RAZORPAY_DISPLAY_PRICE_USD),
            "charge_currency": "INR",
            "plan": selected_plan,
        },
    )


@app.post("/create-order")
async def create_order_backcompat(request: Request):
    return await create_subscription(request)


@app.post("/webhook/razorpay")
@app.post("/razorpay-webhook")
async def razorpay_webhook(request: Request, x_razorpay_signature: str | None = Header(default=None, alias="X-Razorpay-Signature")):
    if not RAZORPAY_WEBHOOK_SECRET:
        return JSONResponse(status_code=503, content={"status": "not_configured"})

    body = await request.body()
    expected_signature = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not x_razorpay_signature or not hmac.compare_digest(expected_signature, x_razorpay_signature):
        return JSONResponse(status_code=400, content={"status": "invalid_signature"})

    try:
        payload = json.loads(body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"status": "invalid_json"})

    event = str(payload.get("event", "")).strip().lower()
    logger.info("Razorpay webhook received: event=%s payload=%s", event, json.dumps(payload, indent=2, sort_keys=True))

    def _extract_user_id(notes: dict) -> int:
        return int((notes or {}).get("user_id", 0) or 0)

    if event == "subscription.activated":
        sub = (payload.get("payload", {}) or {}).get("subscription", {}).get("entity", {}) or {}
        notes = sub.get("notes", {}) or {}
        selected_plan = _normalize_plan_key(str(notes.get("plan", "monthly")))
        user_id = _apply_razorpay_subscription_state(sub, pro=_is_pro_plan(selected_plan), status="active")
        if user_id > 0:
            _set_user_plan(user_id, selected_plan, tokens=PLAN_TOKENS.get(selected_plan, PLAN_TOKENS.get("monthly", 500)))
            track_event("pro_activated", {"user_id": str(user_id), "provider": "razorpay", "subscription_id": str(sub.get("id", "") or "")})

    elif event in {"payment.captured", "subscription.charged", "invoice.paid", "order.paid"}:
        payment_entity = (payload.get("payload", {}) or {}).get("payment", {}).get("entity", {}) or {}
        invoice_entity = (payload.get("payload", {}) or {}).get("invoice", {}).get("entity", {}) or {}
        subscription_entity = (payload.get("payload", {}) or {}).get("subscription", {}).get("entity", {}) or {}
        order_entity = (payload.get("payload", {}) or {}).get("order", {}).get("entity", {}) or {}
        entity = payment_entity or invoice_entity or subscription_entity or order_entity
        notes: dict[str, Any] = {}
        for source in (order_entity, subscription_entity, invoice_entity, payment_entity):
            source_notes = source.get("notes", {}) if isinstance(source, dict) else {}
            if isinstance(source_notes, dict):
                notes.update(source_notes)
        subscription_id = str(entity.get("subscription_id", "") or subscription_entity.get("id", "") or "")
        order_id = str(payment_entity.get("order_id", "") or order_entity.get("id", "") or notes.get("order_id", "") or "")
        selected_plan = _normalize_plan_key(str(notes.get("plan", "monthly")))
        user_id = _extract_user_id(notes) or _get_user_id_by_subscription_id(subscription_id)
        if user_id > 0:
            _set_user_subscription_state(
                user_id,
                pro=_is_pro_plan(selected_plan),
                status="active",
                past_due_since="",
                subscription_id=subscription_id or str(subscription_entity.get("id", "") or ""),
            )
            if subscription_entity:
                _apply_razorpay_subscription_state(subscription_entity, pro=_is_pro_plan(selected_plan), status="active")
            _set_user_plan(user_id, selected_plan, tokens=PLAN_TOKENS.get(selected_plan, PLAN_TOKENS.get("monthly", 500)))
            _record_payment(
                user_id=user_id,
                amount=int(entity.get("amount", 0) or 0),
                status="paid",
                subscription_id=subscription_id,
                payment_id=str(entity.get("id", "") or payment_entity.get("id", "") or ""),
                invoice_id=str(invoice_entity.get("id", "") or ""),
                order_id=order_id,
                promo_code=str(notes.get("promo_code", "") or ""),
                plan=selected_plan,
                checkout_type="subscription" if subscription_id else "order",
                discount_amount=int(notes.get("discount_amount_inr", 0) or 0),
            )
            track_event(
                "payment_captured",
                {
                    "user_id": str(user_id),
                    "provider": "razorpay",
                    "subscription_id": subscription_id,
                    "order_id": order_id,
                    "promo_code": str(notes.get("promo_code", "") or ""),
                },
            )

    elif event == "invoice.payment_failed":
        invoice = (payload.get("payload", {}) or {}).get("invoice", {}).get("entity", {}) or {}
        notes = invoice.get("notes", {}) or {}
        subscription_id = str(invoice.get("subscription_id", "") or "")
        user_id = _extract_user_id(notes) or _get_user_id_by_subscription_id(subscription_id)
        if user_id > 0:
            _set_user_subscription_state(
                user_id,
                status="past_due",
                past_due_since=_now_iso(),
                subscription_id=subscription_id,
            )
            _record_payment(
                user_id=user_id,
                amount=int(invoice.get("amount", 0) or 0),
                status="failed",
                subscription_id=subscription_id,
                payment_id=str(invoice.get("payment_id", "") or ""),
                invoice_id=str(invoice.get("id", "") or ""),
            )

    elif event == "subscription.cancelled":
        sub = (payload.get("payload", {}) or {}).get("subscription", {}).get("entity", {}) or {}
        user_id = _apply_razorpay_subscription_state(sub, pro=False, status="cancelled")
        if user_id > 0:
            _set_user_plan(user_id, "free", tokens=PLAN_TOKENS.get("free", 10))

    else:
        return JSONResponse(status_code=200, content={"status": "ignored"})

    return JSONResponse(status_code=200, content={"status": "ok"})


@app.get("/auth/status")
def auth_status(request: Request):
    return _auth_status_payload(request)


@app.get("/config")
def get_config():
    """Return public client-side configuration."""
    return {
        "razorpay_key": RAZORPAY_KEY,
        "google_enabled": GOOGLE_AUTH_CONFIGURED,
    }


@app.get("/auth/me")
def auth_me(request: Request):
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    stats = _score_outcome_stats(int(user["id"]))
    return {
        "authenticated": True,
        "profile": _build_user_profile(user, include_saved_fixes=True),
        "outcome_stats": stats,
    }


@app.get("/tokens/info")
def get_tokens_info(request: Request):
    """Get user's token balance and plan info."""
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    tokens = _get_user_tokens(int(user["id"]))
    plan = _normalize_plan_key(str(user.get("plan") or "free"))
    
    return {
        "tokens": tokens,
        "plan": plan,
        "feature_costs": FEATURE_COSTS,
    }


async def _read_promo_request_payload(request: Request) -> dict[str, Any]:
    content_type = str(request.headers.get("content-type", "")).lower()
    if "application/json" in content_type:
        try:
            data = await request.json()
            return dict(data) if isinstance(data, dict) else {}
        except Exception:
            return {}
    try:
        form_data = await request.form()
        return dict(form_data)
    except Exception:
        return {}


async def _promo_quote_response(request: Request, *, mark_applied: bool = False) -> JSONResponse:
    payload = await _read_promo_request_payload(request)
    code = str(payload.get("code") or payload.get("promo_code") or "").strip().upper()
    plan = str(payload.get("plan") or payload.get("selectedPlan") or "monthly").strip().lower()
    quote = _build_promo_quote(code, plan)
    if not quote.get("valid"):
        return JSONResponse(status_code=400, content={"valid": False, "reason": str(quote.get("reason") or "Invalid code")})
    promo = dict(quote.get("promo") or {})
    return JSONResponse(
        status_code=200,
        content={
            "valid": True,
            "applied": mark_applied,
            "promo": promo,
            "message": str(promo.get("summary") or "Promo applied"),
        },
    )


@app.post("/promo/validate")
async def promo_validate(request: Request):
    return await _promo_quote_response(request, mark_applied=False)


@app.post("/promo/apply")
async def promo_apply(request: Request):
    return await _promo_quote_response(request, mark_applied=True)


@app.post("/apply-promo")
async def apply_promo(request: Request):
    return await promo_apply(request)


@app.post("/upgrade-test")
def upgrade_test(request: Request):
    """Development endpoint to test upgrade flow without payment."""
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_id = int(user["id"])
    _set_user_plan(user_id, "pro", tokens=500, trial_days=7)
    
    # Update session
    updated_user = _get_user_by_id(user_id)
    if updated_user:
        _set_session_user(request, int(updated_user["id"]), str(updated_user["email"]))
    
    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "Upgraded to Pro for testing",
            "tokens": 500,
            "plan": "pro",
        },
    )


def _saved_fix_metrics(user_id: int) -> dict[str, Any]:
    fixes = _recent_saved_fixes(user_id, limit=50)
    if not fixes:
        return {"count": 0, "avg_delta": 0.0, "best_delta": 0}
    deltas = [int(item.get("score_delta", 0)) for item in fixes]
    return {
        "count": len(deltas),
        "avg_delta": round(sum(deltas) / len(deltas), 1),
        "best_delta": max(deltas),
    }


def _build_user_profile(user: dict, include_saved_fixes: bool = False) -> dict:
    usage = _get_usage(user["id"])
    recent_results = _recent_user_feedback(user["id"], limit=5)
    streak_days = _user_streak_days(user["id"])
    health_score = _health_score(usage, recent_results)
    tokens = _get_user_tokens(user["id"])
    plan = str(user.get("plan") or "free").lower()
    
    profile = {
        "name": user["name"] or _display_name_from_email(user["email"]),
        "email": user["email"],
        "avatar_url": user["picture"] or _avatar_url_for_email(user["email"]),
        "scans_used": usage["scans_used"],
        "emails_scanned_count": usage["emails_scanned_count"],
        "rewrite_clicked": usage["rewrite_clicked"],
        "last_active": usage["last_active"],
        "health_score": health_score,
        "streak_days": streak_days,
        "recent_results": recent_results,
        "tokens": tokens,
        "plan": plan,
        "is_admin": _is_admin_email(user["email"]),
    }
    if include_saved_fixes:
        profile["saved_fixes"] = _recent_saved_fixes(user["id"], limit=8)
        profile["saved_fix_metrics"] = _saved_fix_metrics(user["id"])
        profile["outcome_stats"] = _score_outcome_stats(user["id"])
    return profile


@app.get("/profile", response_class=HTMLResponse)
def profile_page(request: Request):
    user = _get_session_user(request)
    profile = _build_user_profile(user) if user else {
        "name": "InboxGuard User",
        "email": "",
        "avatar_url": "/static/branding/logo.png",
        "scans_used": 0,
        "emails_scanned_count": 0,
        "rewrite_clicked": 0,
        "last_active": "—",
        "health_score": 0,
        "streak_days": 0,
        "recent_results": [],
        "is_admin": False,
    }

    return render_template_safe(
        request,
        "profile.html",
        {
            "page_title": "Your Profile | InboxGuard",
            "meta_description": "View your InboxGuard account profile and usage.",
            "canonical_url": f"{SITE_URL}/profile",
            "profile": profile,
            "authenticated": bool(user),
        },
    )

@app.get("/dashboard")
async def dashboard_redirect() -> RedirectResponse:
    return RedirectResponse(url="/profile", status_code=307)


def _page_section(title: str, body: str, bullets: list[str] | None = None) -> dict:
    return {
        "title": title,
        "body": body,
        "bullets": bullets or [],
    }


def _render_info_page(
    request: Request,
    *,
    page_title: str,
    meta_description: str,
    canonical_path: str,
    headline: str,
    intro: str,
    sections: list[dict],
    cta_label: str = "Back to scan",
    ai_tool_meta: str = "",
):
    return render_template_safe(
        request,
        "simple_page.html",
        {
            "page_title": page_title,
            "meta_description": meta_description,
            "canonical_url": f"{SITE_URL}{canonical_path}",
            "headline": headline,
            "intro": intro,
            "sections": sections,
            "cta_label": cta_label,
            "ai_tool_meta": ai_tool_meta,
        },
    )


def _render_seo_acquisition_page(request: Request, slug: str):
    page = SEO_ACQUISITION_PAGES.get(slug)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    track_event("page_view", {"page": slug})
    return render_template_safe(
        request,
        "seo_page.html",
        {
            "page": page,
            "page_title": page["title"],
            "meta_description": page["description"],
            "canonical_url": f"{SITE_URL}/{slug}",
        },
    )


@app.get("/email-spam-checker", response_class=HTMLResponse)
def seo_email_spam_checker_page(request: Request):
    return _render_seo_acquisition_page(request, "email-spam-checker")


@app.get("/gmail-spam-checker", response_class=HTMLResponse)
def seo_gmail_spam_checker_page(request: Request):
    return _render_seo_acquisition_page(request, "gmail-spam-checker")


@app.get("/cold-email-deliverability", response_class=HTMLResponse)
def seo_cold_email_deliverability_page(request: Request):
    return _render_seo_acquisition_page(request, "cold-email-deliverability")


@app.get("/why-emails-go-to-spam", response_class=HTMLResponse)
def seo_why_emails_go_to_spam_page(request: Request):
    return _render_seo_acquisition_page(request, "why-emails-go-to-spam")


@app.get("/spam-trigger-words", response_class=HTMLResponse)
def seo_spam_trigger_words_page(request: Request):
    return _render_seo_acquisition_page(request, "spam-trigger-words")


@app.get("/why-do-emails-go-to-spam", include_in_schema=False)
def geo_legacy_redirect():
    return RedirectResponse(url="/why-emails-go-to-spam", status_code=308)


@app.get("/about", response_class=HTMLResponse)
def about_page(request: Request):
    return _render_info_page(
        request,
        page_title="About InboxGuard",
        meta_description="Why InboxGuard exists and how it helps you fix emails before they fail.",
        canonical_path="/about",
        headline="Built to stop bad sends before they cost you trust",
        intro="InboxGuard is designed as a pre-send protection layer for people who want a fast, deterministic risk check before a campaign goes out.",
        sections=[
            _page_section("What it does", "It scores the draft, explains the risky signals, and gives you a safer rewrite path before you send.", ["Risk-first output", "Content versus infra separation", "Fast feedback before campaigns"]),
            _page_section("Why it exists", "Most deliverability tools are too late or too opaque. This product is built to make the failure mode obvious while you still can fix it.", ["Less guessing", "Fewer damaged sends", "Clear next actions"]),
        ],
    )


@app.get("/privacy", response_class=HTMLResponse)
def privacy_page(request: Request):
    return _render_info_page(
        request,
        page_title="InboxGuard Privacy Policy",
        meta_description="Privacy details for InboxGuard.",
        canonical_path="/privacy",
        headline="Privacy policy",
        intro="We only collect the minimum data needed to run scans, improve results, and manage access.",
        sections=[
            _page_section("What we store", "Email drafts, scan metadata, feedback, and account details when you sign in or buy a plan.", ["Account info", "Usage data", "Feedback and saved fixes"]),
            _page_section("What we do not do", "We do not sell your data. We use it to provide the scan, maintain your account, and improve the product.", ["No data brokerage", "No hidden resale", "No unnecessary tracking"]),
        ],
    )


@app.get("/terms", response_class=HTMLResponse)
def terms_page(request: Request):
    return _render_info_page(
        request,
        page_title="InboxGuard Terms",
        meta_description="Terms and use conditions for InboxGuard.",
        canonical_path="/terms",
        headline="Terms of use",
        intro="Use InboxGuard as a decision aid, not as a guarantee of inbox placement.",
        sections=[
            _page_section("Service limits", "Scan limits, feature access, and billing terms may change as the product evolves.", ["Free-tier limits apply", "Paid access follows subscription status", "Service is provided as-is"]),
            _page_section("Your responsibility", "You remain responsible for the content you send and for compliance with the policies that govern your messages.", ["Review drafts before sending", "Follow provider policies", "Use the score as guidance"]),
        ],
    )


@app.get("/inbox-tips", response_class=HTMLResponse)
def inbox_tips_page(request: Request):
    tips = [
        _page_section("Fix the first three things", "Remove pressure language, reduce link clutter, and make the request specific before you tune anything else.", ["Lower urgency", "Use one clear CTA", "Avoid generic blast language"]),
        _page_section("Check the sender setup", "If infra is weak, content edits alone will not save the send.", ["SPF", "DKIM", "DMARC"]),
        _page_section("Use the rewrite as a base", "The suggested draft is meant to reduce filter triggers quickly, then you can refine it for tone.", ["Preserve intent", "Trim repetition", "Keep the ask concrete"]),
    ]
    return _render_info_page(
        request,
        page_title="InboxGuard Inbox Tips",
        meta_description="Practical deliverability tips and scan guidance.",
        canonical_path="/inbox-tips",
        headline="Small changes that usually move inbox placement",
        intro="These are the fast checks most likely to improve deliverability before you spend time on deeper tuning.",
        sections=tips,
    )


@app.get("/results", response_class=HTMLResponse)
def results_page(request: Request):
    user = _get_session_user(request)
    if user:
        profile = _build_user_profile(user, include_saved_fixes=True)
        sections = [
            _page_section("Your scan history", "Recent results and outcomes from your account.", [
                f"Scans used: {profile['scans_used']}",
                f"Emails scanned: {profile['emails_scanned_count']}",
                f"Health score: {profile['health_score']}",
            ]),
            _page_section("Recent outcomes", "Feedback you have given after sending.", [
                f"{item['outcome'].capitalize()} • {item['to_risk_band'] or item['from_risk_band'] or 'No band'}" for item in profile["recent_results"][:4]
            ] or ["No feedback yet."]),
        ]
    else:
        profile = None
        sections = [
            _page_section("What results will show", "Sign in to see your scan history, recent outcomes, and saved fixes.", ["Health score", "Recent outcomes", "Saved rewrites"]),
            _page_section("Why it matters", "The Results page is meant to replace guesswork with a concrete history of what you fixed and how it performed.", ["Track improvements", "Review patterns", "Compare runs"]),
        ]

    return _render_info_page(
        request,
        page_title="InboxGuard Results",
        meta_description="Review scan results, health score, and recent outcomes.",
        canonical_path="/results",
        headline="Results that show what changed, not just the score",
        intro="Use this page to review your recent scans and the fixes that made the biggest difference.",
        sections=sections,
    )


@app.get("/reports", response_class=HTMLResponse)
def reports_page(request: Request):
    user = _get_session_user(request)
    if not user:
        return _render_info_page(
            request,
            page_title="InboxGuard Reports",
            meta_description="InboxGuard report export and summary page.",
            canonical_path="/reports",
            headline="Reports and exports",
            intro="Sign in to export your scan history and feedback as a simple report.",
            sections=[
                _page_section("What you can export", "A signed-in report can include your saved fixes, recent feedback, and scan activity.", ["CSV export", "Summary view", "Recent outcomes"]),
            ],
        )

    profile = _build_user_profile(user, include_saved_fixes=True)
    sections = [
        _page_section("Account summary", "A quick view of your recent account activity.", [
            f"Scans used: {profile['scans_used']}",
            f"Rewrite clicks: {profile['rewrite_clicked']}",
            f"Last active: {profile['last_active'] or '—'}",
        ]),
        _page_section("Saved fixes", "Your most recent rewritten drafts.", [
            item["rewritten_subject"] or item["rewritten_body"][:80] or "Untitled fix"
            for item in profile.get("saved_fixes", [])[:4]
        ] or ["No saved fixes yet."]),
    ]
    return _render_info_page(
        request,
        page_title="InboxGuard Reports",
        meta_description="InboxGuard report export and summary page.",
        canonical_path="/reports",
        headline="Reports and exports",
        intro="See a compact summary of your history and download it as a CSV if needed.",
        sections=sections,
    )


@app.get("/saved-fixes", response_class=HTMLResponse)
def saved_fixes_page(request: Request):
    user = _get_session_user(request)
    if not user:
        return _render_info_page(
            request,
            page_title="InboxGuard Saved Fixes",
            meta_description="Saved rewritten drafts in InboxGuard.",
            canonical_path="/saved-fixes",
            headline="Saved fixes",
            intro="Sign in to store rewritten drafts and revisit them later.",
            sections=[_page_section("Why it helps", "Saving fixes lets you compare versions, reuse stronger copy, and keep the best draft for the next send.", ["Reuse good rewrites", "Compare revisions", "Track deltas"])],
        )

    profile = _build_user_profile(user, include_saved_fixes=True)
    saved_fixes = profile.get("saved_fixes", [])
    sections = [
        _page_section("Recent saved fixes", "The last drafts you stored.", [
            (item["original_subject"] or item["original_body"][:80] or "Untitled draft") + " -> " + (item["rewritten_subject"] or item["rewritten_body"][:80] or "Untitled rewrite")
            for item in saved_fixes[:6]
        ] or ["No saved fixes yet."]),
    ]
    return _render_info_page(
        request,
        page_title="InboxGuard Saved Fixes",
        meta_description="Saved rewritten drafts in InboxGuard.",
        canonical_path="/saved-fixes",
        headline="Saved fixes",
        intro="Keep the best rewritten versions so you can reuse them across campaigns.",
        sections=sections,
    )


@app.get("/results.csv")
def results_csv(request: Request):
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")

    profile = _build_user_profile(user, include_saved_fixes=True)
    rows = ["type,label,detail"]
    rows.append(f"summary,scans_used,{profile['scans_used']}")
    rows.append(f"summary,emails_scanned,{profile['emails_scanned_count']}")
    rows.append(f"summary,health_score,{profile['health_score']}")
    for item in profile.get("recent_results", []):
        rows.append(f"feedback,{item['outcome']},{item['to_risk_band'] or item['from_risk_band']}")
    for item in profile.get("saved_fixes", []):
        rows.append(f"saved_fix,{item['rewrite_style']},{item['score_delta']}")
    content = "\n".join(rows) + "\n"
    return Response(content=content, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=inboxguard-results.csv"})


@app.get("/reports.csv")
def reports_csv(request: Request):
    return results_csv(request)


@app.get("/plans")
def billing_plans():
    return {"ok": True, "plans": _plan_catalog(), "trial_days": TRIAL_DAYS}


@app.post("/blacklist-check")
def blacklist_check(domain: str = Form("")):
    return {"ok": True, **_blacklist_check(domain)}


@app.post("/seed-run")
def seed_run(
    request: Request,
    campaign_name: str = Form("Seed Campaign"),
    subject_token: str = Form(""),
    body_text: str = Form("InboxGuard seed probe"),
    wait_seconds: int = Form(5),
):
    token = (subject_token or "").strip() or f"IG-{secrets.token_hex(4)}"
    results = _run_seed_test(token, body_text, wait_seconds=wait_seconds)
    inbox_count = sum(1 for value in results.values() if value == "inbox")
    spam_count = sum(1 for value in results.values() if value == "spam")
    user = _get_session_user(request)
    _save_seed_test(
        int(user["id"]) if user else None,
        campaign_name,
        "multi",
        inbox_count,
        spam_count,
        json.dumps(results),
    )
    return {
        "ok": True,
        "campaign_name": campaign_name,
        "subject_token": token,
        "results": results,
        "inbox_count": inbox_count,
        "spam_count": spam_count,
    }


@app.post("/seed-tests")
def create_seed_test(
    request: Request,
    campaign_name: str = Form(""),
    provider: str = Form("gmail"),
    inbox_count: int = Form(0),
    spam_count: int = Form(0),
    notes: str = Form(""),
):
    user = _get_session_user(request)
    _save_seed_test(int(user["id"]) if user else None, campaign_name, provider, inbox_count, spam_count, notes)
    return {"ok": True}


@app.get("/seed-tests")
def list_seed_tests(request: Request):
    user = _get_session_user(request)
    items = _recent_seed_tests(int(user["id"]) if user else None, limit=12)
    return {"ok": True, "items": items}


@app.get("/outcome-stats")
def outcome_stats(request: Request):
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")
    return {"ok": True, **_score_outcome_stats(int(user["id"]))}


@app.post("/bulk-analyze")
async def bulk_analyze(
    request: Request,
    file: UploadFile = File(...),
    analysis_mode: str = Form("content"),
):
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")

    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV has no rows")

    results: list[dict[str, Any]] = []
    max_rows = 100
    for idx, row in enumerate(rows[:max_rows]):
        raw_email = str(row.get("raw_email", "") or "")
        email_text = str(row.get("email", "") or "")
        domain = str(row.get("domain", "") or "")
        manual_subject = str(row.get("subject", "") or "")
        manual_body = str(row.get("body", "") or "")
        try:
            payload = _run_analysis_request(
                request,
                email=email_text,
                domain=domain,
                raw_email=raw_email,
                manual_subject=manual_subject,
                manual_body=manual_body,
                analysis_mode=analysis_mode,
            )
            summary = payload.get("summary", {})
            results.append(
                {
                    "row": idx + 1,
                    "score": int(summary.get("final_score", summary.get("score", 0)) or 0),
                    "risk_band": str(summary.get("risk_band", "Needs Review")),
                    "primary_issue": str(summary.get("primary_issue", "")),
                }
            )
        except Exception as error:
            results.append({"row": idx + 1, "error": str(error)})

    return {"ok": True, "processed": len(results), "max_rows": max_rows, "items": results}


@app.post("/cancel-subscription")
def cancel_subscription(request: Request):
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")
    _set_user_subscription_state(
        int(user["id"]),
        pro=False,
        status="cancelled",
        past_due_since="",
    )
    track_event("subscription_cancelled", {"user_id": str(user["id"])})
    return {"ok": True, "status": "cancelled"}


@app.get("/seed-inbox", response_class=HTMLResponse)
def seed_inbox_page(request: Request):
    return _render_info_page(
        request,
        page_title="Seed Inbox Testing | InboxGuard",
        meta_description="Track manual seed inbox test outcomes across providers.",
        canonical_path="/seed-inbox",
        headline="Seed inbox testing workflow",
        intro="Run a seed probe and classify inbox/spam placement across configured Gmail, Outlook, and Yahoo accounts.",
        sections=[
            _page_section("How to use", "Trigger a seed run with a unique subject token; InboxGuard sends and checks configured seed inboxes.", ["Configure seed accounts in env", "Run seed probe", "Review provider-by-provider placement"]),
            _page_section("Current status", "Automated seed checks are available when SMTP + IMAP credentials are configured.", ["Manual logging still supported", "History available via API", "Built for pre-launch checks"]),
        ],
    )


@app.post("/api-keys")
def create_api_key(request: Request, name: str = Form("Primary key")):
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")
    key = _create_api_key(int(user["id"]), name)
    return {"ok": True, "api_key": key, "warning": "Store this key now. It will not be shown again."}


@app.get("/api-keys")
def list_api_keys(request: Request):
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")
    return {"ok": True, "items": _list_api_keys(int(user["id"]))}


@app.post("/api-keys/revoke")
def revoke_api_key(request: Request, key_id: int = Form(0)):
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")
    if not _revoke_api_key(int(user["id"]), int(key_id)):
        raise HTTPException(status_code=404, detail="API key not found")
    return {"ok": True}


@app.post("/api/analyze")
def analyze_via_api(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    email: str = Form(""),
    domain: str = Form(""),
    raw_email: str = Form(""),
    manual_subject: str = Form(""),
    manual_body: str = Form(""),
    analysis_mode: str = Form("content"),
):
    auth = _authenticate_api_key(str(x_api_key or ""))
    if not auth:
        raise HTTPException(status_code=401, detail="INVALID_API_KEY")
    return _run_analysis_request(
        request,
        email=email,
        domain=domain,
        raw_email=raw_email,
        manual_subject=manual_subject,
        manual_body=manual_body,
        analysis_mode=analysis_mode,
        api_user_id=int(auth["user_id"]),
    )


@app.post("/teams")
def create_team(request: Request, name: str = Form("My Team")):
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")
    team_id = _create_team(int(user["id"]), name)
    return {"ok": True, "team_id": team_id}


@app.post("/teams/member")
def add_team_member(request: Request, team_id: int = Form(0), email: str = Form(""), role: str = Form("member")):
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")
    row = _get_user_by_email((email or "").strip().lower())
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    safe_role = str(role or "member").strip().lower()
    if safe_role not in {"owner", "admin", "member", "viewer"}:
        safe_role = "member"
    _add_team_member(int(team_id), int(row["id"]), safe_role)
    return {"ok": True}


@app.get("/teams")
def list_teams(request: Request):
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")
    return {"ok": True, "items": _teams_for_user(int(user["id"]))}


@app.get("/blog", response_class=HTMLResponse)
def blog_page(request: Request):
    sections = []
    for slug, post in BLOG_POSTS.items():
        sections.append(
            _page_section(
                post["title"],
                post["summary"],
                [f"Read: {SITE_URL}/blog/{slug}"],
            )
        )
    return _render_info_page(
        request,
        page_title="InboxGuard Blog",
        meta_description="Deliverability guides and spam-prevention playbooks.",
        canonical_path="/blog",
        headline="InboxGuard deliverability blog",
        intro="Practical guides for safer email sends and stronger reply outcomes.",
        sections=sections,
    )


@app.get("/blog/{slug}", response_class=HTMLResponse)
def blog_post_page(request: Request, slug: str):
    post = BLOG_POSTS.get(slug)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return _render_info_page(
        request,
        page_title=f"{post['title']} | InboxGuard",
        meta_description=post["summary"],
        canonical_path=f"/blog/{slug}",
        headline=post["title"],
        intro=post["summary"],
        sections=[_page_section("Key points", "Use this checklist before your next send.", list(post["body"]))],
    )


@app.post("/lead-capture")
def lead_capture(request: Request, email: str = Form(""), source: str = Form("capture_gate")):
    clean_email = (email or "").strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="Valid email is required")

    anon_id = _get_or_create_anon_id(request)
    request.session["lead_email"] = clean_email
    _store_lead_capture(clean_email, source, anon_id)
    track_event("lead_capture", {"source": (source or "capture_gate")[:40]})
    return JSONResponse({"ok": True, "email": clean_email})


@app.post("/save-fix")
def save_fix(
    request: Request,
    original_subject: str = Form(""),
    original_body: str = Form(""),
    rewritten_subject: str = Form(""),
    rewritten_body: str = Form(""),
    score_delta: int = Form(0),
    from_risk_band: str = Form(""),
    to_risk_band: str = Form(""),
    rewrite_style: str = Form("balanced"),
):
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")

    _store_saved_fix(
        user["id"],
        original_subject=original_subject,
        original_body=original_body,
        rewritten_subject=rewritten_subject,
        rewritten_body=rewritten_body,
        score_delta=score_delta,
        from_risk_band=from_risk_band,
        to_risk_band=to_risk_band,
        rewrite_style=rewrite_style,
    )
    track_event("save_fix", {"rewrite_style": (rewrite_style or "balanced")[:20]})
    return JSONResponse({"ok": True})


@app.post("/signup")
def signup(request: Request, email: str = Form(""), password: str = Form("")):
    clean_email = (email or "").strip().lower()
    clean_password = password or ""
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if len(clean_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    if _get_user_by_email(clean_email):
        raise HTTPException(status_code=409, detail="Account already exists, please sign in")

    user_id = _create_user(clean_email, clean_password)
    _set_session_user(request, user_id, clean_email)
    track_event("access_request", {"target": "signup", "mode": "email_password"})
    return {"ok": True, "authenticated": True, "email": clean_email}


@app.post("/login")
def login(request: Request, email: str = Form(""), password: str = Form("")):
    clean_email = (email or "").strip().lower()
    clean_password = password or ""
    if not clean_email or not clean_password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    row = _get_user_by_email(clean_email)
    if not row:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not _verify_password(clean_password, str(row["password_salt"]), str(row["password_hash"])):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    _set_session_user(request, int(row["id"]), clean_email)
    track_event("access_request", {"target": "login", "mode": "email_password"})
    return {"ok": True, "authenticated": True, "email": clean_email}


@app.post("/auth/email/continue")
def auth_email_continue(request: Request, email: str = Form("")):
    clean_email = (email or "").strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="Valid email is required")

    user_id = _get_or_create_google_user(clean_email)
    _set_session_user(request, user_id, clean_email)
    track_event("access_request", {"target": "continue", "mode": "email_only"})
    return {"ok": True, "authenticated": True, "email": clean_email}


@app.get("/auth/google/login")
async def auth_google_login(request: Request, next: str = "/?resume=1"):
    client = _google_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")

    request.session["auth_next"] = next
    redirect_uri = f"{SITE_URL}/auth/google/callback"
    return await client.authorize_redirect(request, redirect_uri)


@app.get("/auth/google/callback")
async def auth_google_callback(request: Request):
    client = _google_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured")

    token = await client.authorize_access_token(request)
    user_info = token.get("userinfo") if isinstance(token, dict) else None
    if not user_info:
        user_info = await client.userinfo(token=token)

    email = str((user_info or {}).get("email", "")).strip().lower()
    full_name = str((user_info or {}).get("name", "")).strip()
    picture = str((user_info or {}).get("picture", "")).strip()
    if not email:
        raise HTTPException(status_code=400, detail="Google account email not available")

    user_id = _get_or_create_google_user(email)
    _set_session_user(request, user_id, email, name=full_name, picture=picture)
    track_event("access_request", {"target": "login", "mode": "google_oauth"})
    next_url = str(request.session.pop("auth_next", "/"))
    return RedirectResponse(url=next_url, status_code=303)


@app.post("/auth/logout")
def auth_logout(request: Request):
    request.session.pop("user_id", None)
    request.session.pop("user_email", None)
    request.session.pop("user_name", None)
    request.session.pop("user_picture", None)
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
            "ai_tool_meta": "email spam checker, inbox placement tool, deliverability tester",
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
    urls = [
        f"{SITE_URL}/",
        f"{SITE_URL}/pricing",
        f"{SITE_URL}/email-spam-checker",
        f"{SITE_URL}/gmail-spam-checker",
        f"{SITE_URL}/why-emails-go-to-spam",
        f"{SITE_URL}/cold-email-deliverability",
        f"{SITE_URL}/spam-trigger-words",
        f"{SITE_URL}/about",
        f"{SITE_URL}/privacy",
        f"{SITE_URL}/terms",
        f"{SITE_URL}/inbox-tips",
        f"{SITE_URL}/results",
        f"{SITE_URL}/reports",
        f"{SITE_URL}/saved-fixes",
        f"{SITE_URL}/seed-inbox",
        f"{SITE_URL}/blog",
    ]
    urls.extend([f"{SITE_URL}/blog/{slug}" for slug in BLOG_POSTS.keys()])
    urls.extend([f"{SITE_URL}/p/{item['slug']}" for item in LONG_TAIL_PAGES])

    body = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for url in urls:
        body.extend(["  <url>", f"    <loc>{url}</loc>", f"    <lastmod>{today}</lastmod>", "  </url>"])
    body.append("</urlset>")

    return Response(content="\n".join(body), media_type="application/xml")


def _run_analysis_request(
    request: Request,
    *,
    email: str,
    domain: str,
    raw_email: str,
    manual_subject: str,
    manual_body: str,
    analysis_mode: str,
    api_user_id: Optional[int] = None,
) -> dict[str, Any]:
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

    use_raw = len(raw_text) > 20

    if use_raw:
        parsed_email = build_email_from_raw(raw_text, fallback_email="")
        parsed_domain = extract_domain_from_text(raw_text) or ""
        parsed_subject = ""
        parsed_body = ""
    else:
        parsed_subject = manual_subject_text or email_text
        parsed_body = manual_body_text
        if parsed_subject and parsed_body:
            parsed_email = f"Subject: {parsed_subject}\n\n{parsed_body}"
        else:
            parsed_email = email_text or parsed_body or ""
        parsed_domain = domain_text or ""

    if not parsed_email:
        parsed_email = f"To: {parsed_domain}\n\nNo content provided"

    mode = (analysis_mode or "content").strip().lower()
    if mode not in ("content", "full"):
        mode = "content"

    user = _get_session_user(request)
    if api_user_id is not None:
        user = {"id": api_user_id, "pro": True, "status": "active"}

    # TOKEN SYSTEM: Check and deduct tokens
    token_cost = FEATURE_COSTS.get("scan_email", 1)
    
    if user:
        user_id = int(user["id"])
        current_tokens = _get_user_tokens(user_id)
        
        # Check if user has enough tokens
        if current_tokens < token_cost:
            raise HTTPException(status_code=402, detail="NO_TOKENS")
        
        # Deduct tokens
        if not _deduct_tokens(user_id, token_cost):
            raise HTTPException(status_code=402, detail="NO_TOKENS")
    else:
        # Non-authenticated users: check anonymous scan limit
        anon_used = _get_anon_scans_used(request)
        if anon_used >= ANON_SCAN_LIMIT:
            raise HTTPException(status_code=401, detail="AUTH_REQUIRED")

    track_event("analyze_request", {"mode": mode, "auth": "user" if user else "anon"})

    result = analyze_email(
        parsed_email,
        parsed_domain,
        raw_text,
        mode,
        subject_override=parsed_subject,
        body_override=parsed_body,
    )
    result["learning_profile"] = get_learning_profile()
    summary = result.get("summary", {}) if isinstance(result, dict) else {}
    final_score = int(summary.get("final_score", summary.get("score", 0)) or 0)
    if user:
        stats = _score_outcome_stats(int(user["id"]))
        prediction = _predict_inbox_probability(final_score, stats)
        decision = _decision_from_inbox_probability(prediction)
        benchmark_score = stats.get("benchmark_top_10_score")
        benchmark_inbox_samples = int(stats.get("benchmark_inbox_samples", 0) or 0)
        remaining_tokens = _get_user_tokens(int(user["id"]))
        result["prediction"] = {
            "inbox_probability": prediction,
            "likely_outcome": "inbox" if prediction >= 70 else "promotions" if prediction >= 45 else "spam",
            "decision": decision,
            "benchmark_top_10_score": benchmark_score,
            "benchmark": {
                "available": benchmark_score is not None,
                "top_10_score": benchmark_score,
                "inbox_samples": benchmark_inbox_samples,
                "sample_count": int(stats.get("samples", 0)),
            },
            "samples": int(stats.get("samples", 0)),
        }
        user_scans = _increment_user_scan(int(user["id"]))
        result["usage"] = {
            "authenticated": True,
            "user_scans_used": user_scans,
            "tokens_remaining": remaining_tokens,
            "tokens_used": token_cost,
        }
    else:
        prediction = _predict_inbox_probability(final_score, None)
        decision = _decision_from_inbox_probability(prediction)
        result["prediction"] = {
            "inbox_probability": prediction,
            "likely_outcome": "inbox" if prediction >= 70 else "promotions" if prediction >= 45 else "spam",
            "decision": decision,
            "benchmark_top_10_score": None,
            "benchmark": {
                "available": False,
                "top_10_score": None,
                "inbox_samples": 0,
                "sample_count": 0,
            },
            "samples": 0,
        }
        anon_scans = _increment_anon_scan(request)
        result["usage"] = {
            "authenticated": False,
            "anonymous_scans_used": anon_scans,
            "anonymous_scans_limit": ANON_SCAN_LIMIT,
        }
    return result


def _set_job_runtime_state(
    job_id: str,
    *,
    queue_name: str,
    status: str,
    retries: int,
    max_retries: int,
    timeout_seconds: int,
    result: Optional[dict[str, Any]] = None,
    error: str = "",
) -> None:
    ASYNC_JOB_STORE[job_id] = {
        "id": job_id,
        "queue_name": queue_name,
        "status": status,
        "retries": retries,
        "max_retries": max_retries,
        "timeout_seconds": timeout_seconds,
        "result": result or {},
        "error": error,
        "updated_at": _now_iso(),
    }


def _execute_async_analysis(
    job_id: str,
    request: Request,
    payload: dict[str, str],
    *,
    queue_name: str = "analysis",
    api_user_id: Optional[int] = None,
    max_retries: int = ASYNC_JOB_MAX_RETRIES,
    timeout_seconds: int = ASYNC_JOB_TIMEOUT_SECONDS,
) -> None:
    retries = 0
    while retries <= max_retries:
        started = datetime.now(timezone.utc)
        try:
            result = _run_analysis_request(
                request,
                email=payload.get("email", ""),
                domain=payload.get("domain", ""),
                raw_email=payload.get("raw_email", ""),
                manual_subject=payload.get("manual_subject", ""),
                manual_body=payload.get("manual_body", ""),
                analysis_mode=payload.get("analysis_mode", "content"),
                api_user_id=api_user_id,
            )
            elapsed = (datetime.now(timezone.utc) - started).total_seconds()
            if elapsed > timeout_seconds:
                raise TimeoutError(f"Job timed out after {elapsed:.1f}s")
            _set_job_runtime_state(
                job_id,
                queue_name=queue_name,
                status="completed",
                retries=retries,
                max_retries=max_retries,
                timeout_seconds=timeout_seconds,
                result=result,
            )
            _record_async_job(
                job_id,
                api_user_id,
                "completed",
                queue_name=queue_name,
                retries=retries,
                max_retries=max_retries,
                timeout_seconds=timeout_seconds,
                result_json=json.dumps(result),
                error_message="",
            )
            return
        except HTTPException as error:
            _set_job_runtime_state(
                job_id,
                queue_name=queue_name,
                status="failed",
                retries=retries,
                max_retries=max_retries,
                timeout_seconds=timeout_seconds,
                error=str(error.detail),
            )
            _record_async_job(
                job_id,
                api_user_id,
                "failed",
                queue_name=queue_name,
                retries=retries,
                max_retries=max_retries,
                timeout_seconds=timeout_seconds,
                result_json="",
                error_message=str(error.detail),
            )
            return
        except Exception as error:
            logger.exception("Async job failed queue=%s job=%s retry=%s", queue_name, job_id, retries)
            if retries >= max_retries:
                _set_job_runtime_state(
                    job_id,
                    queue_name=queue_name,
                    status="failed",
                    retries=retries,
                    max_retries=max_retries,
                    timeout_seconds=timeout_seconds,
                    error=str(error),
                )
                _record_async_job(
                    job_id,
                    api_user_id,
                    "failed",
                    queue_name=queue_name,
                    retries=retries,
                    max_retries=max_retries,
                    timeout_seconds=timeout_seconds,
                    result_json="",
                    error_message=str(error),
                )
                return
            retries += 1
            _set_job_runtime_state(
                job_id,
                queue_name=queue_name,
                status="retrying",
                retries=retries,
                max_retries=max_retries,
                timeout_seconds=timeout_seconds,
                error=str(error),
            )


@app.post("/analyze")
def analyze(
    request: Request,
    email: str = Form(""),
    domain: str = Form(""),
    raw_email: str = Form(""),
    manual_subject: str = Form(""),
    manual_body: str = Form(""),
    analysis_mode: str = Form("content"),
):
    return _run_analysis_request(
        request,
        email=email,
        domain=domain,
        raw_email=raw_email,
        manual_subject=manual_subject,
        manual_body=manual_body,
        analysis_mode=analysis_mode,
    )


@app.post("/analyze-async")
def analyze_async(
    request: Request,
    background_tasks: BackgroundTasks,
    email: str = Form(""),
    domain: str = Form(""),
    raw_email: str = Form(""),
    manual_subject: str = Form(""),
    manual_body: str = Form(""),
    analysis_mode: str = Form("content"),
):
    user = _get_session_user(request)
    job_id = str(uuid4())
    _set_job_runtime_state(
        job_id,
        queue_name="analysis",
        status="queued",
        retries=0,
        max_retries=ASYNC_JOB_MAX_RETRIES,
        timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
    )
    _record_async_job(
        job_id,
        int(user["id"]) if user else None,
        "queued",
        queue_name="analysis",
        retries=0,
        max_retries=ASYNC_JOB_MAX_RETRIES,
        timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
    )
    payload = {
        "email": email,
        "domain": domain,
        "raw_email": raw_email,
        "manual_subject": manual_subject,
        "manual_body": manual_body,
        "analysis_mode": analysis_mode,
    }
    background_tasks.add_task(
        _execute_async_analysis,
        job_id,
        request,
        payload,
        queue_name="analysis",
        api_user_id=int(user["id"]) if user else None,
        max_retries=ASYNC_JOB_MAX_RETRIES,
        timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
    )
    return {"ok": True, "job_id": job_id, "status": "queued", "queue_name": "analysis"}


@app.get("/analyze-jobs/{job_id}")
def analyze_job_status(job_id: str):
    payload = _get_async_job(job_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True, **payload}


@app.get("/jobs")
def list_jobs(limit: int = 20):
    rows = list(ASYNC_JOB_STORE.values())
    rows.sort(key=lambda r: str(r.get("updated_at", "")), reverse=True)
    return {"ok": True, "items": rows[: max(1, min(100, int(limit or 20)))]}


@app.post("/rewrite-async")
def rewrite_async(
    request: Request,
    background_tasks: BackgroundTasks,
    raw_email: str = Form(""),
    domain: str = Form(""),
    analysis_mode: str = Form("content"),
    rewrite_style: str = Form("balanced"),
):
    user = _get_session_user(request)
    job_id = str(uuid4())
    _set_job_runtime_state(
        job_id,
        queue_name="rewrite",
        status="queued",
        retries=0,
        max_retries=ASYNC_JOB_MAX_RETRIES,
        timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
    )
    _record_async_job(
        job_id,
        int(user["id"]) if user else None,
        "queued",
        queue_name="rewrite",
        retries=0,
        max_retries=ASYNC_JOB_MAX_RETRIES,
        timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
    )

    def _run_rewrite_job() -> None:
        retries = 0
        while retries <= ASYNC_JOB_MAX_RETRIES:
            try:
                data = rewrite_email(raw_email=raw_email, domain=domain, analysis_mode=analysis_mode, rewrite_style=rewrite_style)
                _set_job_runtime_state(
                    job_id,
                    queue_name="rewrite",
                    status="completed",
                    retries=retries,
                    max_retries=ASYNC_JOB_MAX_RETRIES,
                    timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
                    result=data,
                )
                _record_async_job(
                    job_id,
                    int(user["id"]) if user else None,
                    "completed",
                    queue_name="rewrite",
                    retries=retries,
                    max_retries=ASYNC_JOB_MAX_RETRIES,
                    timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
                    result_json=json.dumps(data),
                )
                return
            except Exception as error:
                if retries >= ASYNC_JOB_MAX_RETRIES:
                    _set_job_runtime_state(
                        job_id,
                        queue_name="rewrite",
                        status="failed",
                        retries=retries,
                        max_retries=ASYNC_JOB_MAX_RETRIES,
                        timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
                        error=str(error),
                    )
                    _record_async_job(
                        job_id,
                        int(user["id"]) if user else None,
                        "failed",
                        queue_name="rewrite",
                        retries=retries,
                        max_retries=ASYNC_JOB_MAX_RETRIES,
                        timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
                        error_message=str(error),
                    )
                    return
                retries += 1

    background_tasks.add_task(_run_rewrite_job)
    return {"ok": True, "job_id": job_id, "queue_name": "rewrite"}


@app.post("/seed-run-async")
def seed_run_async(
    request: Request,
    background_tasks: BackgroundTasks,
    campaign_name: str = Form("Seed Campaign"),
    subject_token: str = Form(""),
    body_text: str = Form("InboxGuard seed probe"),
):
    user = _get_session_user(request)
    job_id = str(uuid4())
    token = (subject_token or "").strip() or f"IG-{job_id[:8]}"
    _set_job_runtime_state(
        job_id,
        queue_name="seed",
        status="queued",
        retries=0,
        max_retries=ASYNC_JOB_MAX_RETRIES,
        timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
    )
    _record_async_job(
        job_id,
        int(user["id"]) if user else None,
        "queued",
        queue_name="seed",
        retries=0,
        max_retries=ASYNC_JOB_MAX_RETRIES,
        timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
    )

    def _run_seed_job() -> None:
        retries = 0
        while retries <= ASYNC_JOB_MAX_RETRIES:
            try:
                results = _run_seed_test(token, body_text, wait_seconds=5)
                inbox_count = sum(1 for value in results.values() if value == "inbox")
                spam_count = sum(1 for value in results.values() if value == "spam")
                _save_seed_test(int(user["id"]) if user else None, campaign_name, "multi", inbox_count, spam_count, json.dumps(results))
                payload = {"campaign_name": campaign_name, "subject_token": token, "results": results}
                _set_job_runtime_state(
                    job_id,
                    queue_name="seed",
                    status="completed",
                    retries=retries,
                    max_retries=ASYNC_JOB_MAX_RETRIES,
                    timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
                    result=payload,
                )
                _record_async_job(
                    job_id,
                    int(user["id"]) if user else None,
                    "completed",
                    queue_name="seed",
                    retries=retries,
                    max_retries=ASYNC_JOB_MAX_RETRIES,
                    timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
                    result_json=json.dumps(payload),
                )
                return
            except Exception as error:
                if retries >= ASYNC_JOB_MAX_RETRIES:
                    _set_job_runtime_state(
                        job_id,
                        queue_name="seed",
                        status="failed",
                        retries=retries,
                        max_retries=ASYNC_JOB_MAX_RETRIES,
                        timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
                        error=str(error),
                    )
                    _record_async_job(
                        job_id,
                        int(user["id"]) if user else None,
                        "failed",
                        queue_name="seed",
                        retries=retries,
                        max_retries=ASYNC_JOB_MAX_RETRIES,
                        timeout_seconds=ASYNC_JOB_TIMEOUT_SECONDS,
                        error_message=str(error),
                    )
                    return
                retries += 1

    background_tasks.add_task(_run_seed_job)
    return {"ok": True, "job_id": job_id, "queue_name": "seed", "subject_token": token}


@app.post("/diagnose-campaign")
def diagnose_campaign(
    open_rate: float = Form(0.0),
    reply_rate: float = Form(0.0),
    bounce_rate: float = Form(0.0),
    sent_count: int = Form(0),
):
    return _campaign_debugger_logic(open_rate, reply_rate, bounce_rate, sent_count)


@app.post("/campaign-debugger")
def campaign_debugger(data: CampaignDebuggerInput):
    return _campaign_debugger_logic(data.open_rate, data.reply_rate, data.bounce_rate, data.sent)


@app.post("/seed-test")
def seed_test(request: Request, data: SeedTestInput):
    campaign_name = str(data.campaign_name or "Seed Campaign").strip() or "Seed Campaign"
    subject = str(data.subject or "InboxGuard Seed Test").strip() or "InboxGuard Seed Test"
    body = str(data.body or "InboxGuard seed probe").strip() or "InboxGuard seed probe"
    wait_seconds = max(0, min(20, int(data.wait_seconds or 6)))
    test_id = f"IG-{uuid4().hex[:10]}"
    subject_token = f"{test_id}:{subject[:80]}"

    results = _run_seed_test(subject_token, body, wait_seconds=wait_seconds)
    placements = [{"provider": provider, "placement": placement} for provider, placement in results.items()]
    summary = {
        "inbox": sum(1 for value in results.values() if value == "inbox"),
        "spam": sum(1 for value in results.values() if value == "spam"),
        "promotions": sum(1 for value in results.values() if value == "promotions"),
        "unknown": sum(1 for value in results.values() if value == "unknown"),
    }

    user = _get_session_user(request)
    _save_seed_test(
        int(user["id"]) if user else None,
        campaign_name,
        "multi",
        int(summary["inbox"]),
        int(summary["spam"]),
        json.dumps({"test_id": test_id, "subject_token": subject_token, "results": results}),
    )

    return {
        "ok": True,
        "test_id": test_id,
        "subject_token": subject_token,
        "placements": placements,
        "summary": summary,
    }


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
    from_band = str(before_summary.get("risk_band", "Needs Review"))

    intent_profile = extract_rewrite_intent(original, intent_type=email_intent)
    style_variants = build_style_variants_with_guard(original, issue_titles, email_intent)

    selected_style = style
    rewritten = ""
    after_summary: dict[str, Any] = {}
    after_score = before_score
    score_delta = 0
    to_band = from_band
    rewrite_outcome = "neutral"
    collapse_detected = False
    validation_attempts: list[dict[str, Any]] = []

    strategy_order = [style]
    if style != "aggressive":
        strategy_order.append("aggressive")

    best_candidate: dict[str, Any] | None = None

    for strategy in strategy_order:
        for attempt in range(1, 4):
            candidate = (
                style_variants.get(strategy, "")
                if attempt == 1
                else generate_mode_candidate(intent_profile, strategy, original, issue_titles, attempt=attempt)
            )

            constraint_eval = enforce_rewrite_constraints(candidate, strategy)
            constrained_text = str(constraint_eval.get("text", "")).strip()
            constraint_valid = bool(constraint_eval.get("valid", False))
            constraint_reasons = constraint_eval.get("reasons", [])

            if len(constrained_text) < 20:
                validation_attempts.append(
                    {
                        "style": strategy,
                        "attempt": attempt,
                        "accepted": False,
                        "reason": "too_short",
                    }
                )
                continue

            analyzed = analyze_email(constrained_text, clean_domain, constrained_text, mode)
            summary = analyzed.get("summary", {})
            candidate_score = int(summary.get("final_score", summary.get("score", 0)) or 0)
            candidate_band = str(summary.get("risk_band", "Needs Review"))
            candidate_delta = candidate_score - before_score

            hard_fail = _contains_risky_tokens(constrained_text) or not constraint_valid
            accepted = (not hard_fail) and _style_acceptance(strategy, from_band, candidate_band, candidate_delta)

            attempt_row = {
                "style": strategy,
                "attempt": attempt,
                "accepted": accepted,
                "score": candidate_score,
                "risk_band": candidate_band,
                "score_delta": candidate_delta,
                "constraint_valid": constraint_valid,
                "constraint_reasons": constraint_reasons,
            }
            validation_attempts.append(attempt_row)

            if not hard_fail:
                if best_candidate is None:
                    best_candidate = {
                        "style": strategy,
                        "text": constrained_text,
                        "summary": summary,
                        "score": candidate_score,
                        "band": candidate_band,
                        "delta": candidate_delta,
                    }
                else:
                    current_rank = _risk_rank(candidate_band)
                    best_rank = _risk_rank(str(best_candidate.get("band", from_band)))
                    if current_rank < best_rank or (current_rank == best_rank and candidate_score > int(best_candidate.get("score", 0))):
                        best_candidate = {
                            "style": strategy,
                            "text": constrained_text,
                            "summary": summary,
                            "score": candidate_score,
                            "band": candidate_band,
                            "delta": candidate_delta,
                        }

            if accepted:
                selected_style = strategy
                rewritten = constrained_text
                after_summary = summary
                after_score = candidate_score
                score_delta = candidate_delta
                to_band = candidate_band
                rewrite_outcome = _rewrite_outcome(strategy, from_band, candidate_band, candidate_delta)
                break

        if rewritten:
            break

    if not rewritten:
        if best_candidate:
            selected_style = str(best_candidate.get("style", style))
            rewritten = str(best_candidate.get("text", original))
            after_summary = dict(best_candidate.get("summary", {}))
            after_score = int(best_candidate.get("score", before_score))
            score_delta = int(best_candidate.get("delta", 0))
            to_band = str(best_candidate.get("band", from_band))
            rewrite_outcome = "neutral"
        else:
            rewritten = original
            after_summary = before_summary
            after_score = before_score
            score_delta = 0
            to_band = from_band
            rewrite_outcome = "failed_fix"

    other_styles = [name for name in ("safe", "balanced", "aggressive") if name != selected_style]
    collapse_detected = any(
        _similarity_ratio(rewritten, style_variants.get(name, "")) > 0.82 for name in other_styles
    )
    if collapse_detected and rewrite_outcome not in {"failed_fix", "improved"}:
        rewrite_outcome = "neutral"

    if _contains_risky_tokens(rewritten):
        rewrite_outcome = "failed_fix"

    logger.info(
        "Rewrite mode=%s from_band=%s to_band=%s score_delta=%s",
        selected_style,
        from_band,
        to_band,
        score_delta,
    )

    track_event(
        "rewrite_request",
        {
            "mode": mode,
            "rewrite_style": selected_style,
            "score_delta": score_delta,
            "from_risk_band": from_band,
            "to_risk_band": to_band,
            "improved": _risk_rank(to_band) < _risk_rank(from_band),
        },
    )

    rewrite_changes = _summarize_rewrite_changes(original, rewritten, issue_titles)
    rewrite_changes.insert(0, f"Mode applied: {selected_style.title()}.")
    if rewrite_outcome == "neutral":
        rewrite_changes.insert(1, "No major risk shift detected, but bulk-style patterns were still reduced.")
    elif rewrite_outcome == "failed_fix":
        rewrite_changes.insert(1, "Could not safely remove all risky pressure signals without changing message intent.")

    limitations = _rewrite_limitations(mode, score_delta, from_band, to_band)
    limitations.insert(0, "Rewrite engine uses intent extraction + constraints + up to 3 validation retries per strategy.")
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
        "rewrite_style": selected_style,
        "requested_rewrite_style": style,
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
        "intent": intent_profile,
        "validation_attempts": validation_attempts,
        "learning_profile": get_learning_profile(),
        "before_summary": before_summary,
        "after_summary": after_summary,
    }


@app.post("/feedback")
def submit_feedback(
    request: Request,
    outcome: str = Form("not_sure"),
    original_text: str = Form(""),
    rewritten_text: str = Form(""),
    from_risk_band: str = Form(""),
    to_risk_band: str = Form(""),
    from_score: int = Form(0),
    to_score: int = Form(0),
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

    user = _get_session_user(request)
    if user:
        _record_user_feedback(user["id"], outcome, from_risk_band, to_risk_band)
        reference_score = int(to_score or from_score or 0)
        reference_band = to_risk_band or from_risk_band
        _record_email_outcome(int(user["id"]), reference_score, outcome, reference_band)

    return result


@app.post("/track")
def track(
    request: Request,
    event: str = Form(""),
    target: str = Form(""),
    mode: str = Form(""),
):
    event_name = (event or "").strip().lower()
    if event_name not in {"cta_click", "page_view", "access_request", "rewrite_clicked"}:
        return JSONResponse({"ok": True})

    meta = {
        "target": (target or "")[:120],
        "mode": (mode or "")[:20],
    }
    track_event(event_name, meta)
    if event_name == "rewrite_clicked":
        user = _get_session_user(request)
        if user:
            _increment_rewrite_clicked(user["id"])
    return JSONResponse({"ok": True})


@app.post("/request-access")
async def request_access(request: Request, email: str = Form("")):
    clean_email = (email or "").strip()
    if not clean_email:
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        if isinstance(payload, dict):
            clean_email = str(payload.get("email", "")).strip()
    track_event("access_request", {"email": clean_email[:120]})
    return JSONResponse({"ok": True})


def _verify_admin_access(request: Request, token: str = "") -> dict[str, Any]:
    user = _get_session_user(request)
    allowlist = _admin_email_allowlist()
    if allowlist:
        if not user or not _is_admin_email(user["email"]):
            raise HTTPException(status_code=404, detail="Not found")
        return user

    if not ADMIN_TOKEN:
        raise HTTPException(status_code=404, detail="Not found")
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not user:
        raise HTTPException(status_code=401, detail="AUTH_REQUIRED")
    return user


@app.get("/admin", response_class=HTMLResponse)
def admin_dashboard(request: Request, token: str = ""):
    user = _verify_admin_access(request, token)
    metrics = get_dashboard_data()
    return render_template_safe(
        request,
        "admin.html",
        {
            "page_title": "InboxGuard Admin Dashboard",
            "canonical_url": f"{SITE_URL}/admin",
            "meta_description": "Private InboxGuard metrics dashboard.",
            "metrics": metrics,
            "admin_email": user["email"],
        },
    )


@app.get("/admin/revenue")
def admin_revenue(request: Request, token: str = ""):
    _verify_admin_access(request, token)
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        rows = conn.execute("SELECT amount, status FROM payments").fetchall()
    finally:
        conn.close()

    paid_rows = [row for row in rows if str(row["status"] or "").lower() == "paid"]
    total_revenue_paise = sum(int(row["amount"] or 0) for row in paid_rows)
    total_revenue_inr = total_revenue_paise / 100.0
    return JSONResponse(
        {
            "total_revenue_paise": total_revenue_paise,
            "total_revenue_inr": total_revenue_inr,
            "total_payments": len(paid_rows),
        }
    )


@app.get("/admin/churn")
def admin_churn(request: Request, token: str = ""):
    _verify_admin_access(request, token)
    _ensure_auth_db_ready()
    conn = _auth_db_conn()
    try:
        rows = conn.execute("SELECT status FROM users").fetchall()
    finally:
        conn.close()

    total_users = len(rows)
    cancelled = sum(1 for row in rows if str(row["status"] or "inactive").lower() == "cancelled")
    churn_rate = (cancelled / total_users) if total_users else 0.0
    return JSONResponse(
        {
            "total_users": total_users,
            "cancelled_users": cancelled,
            "churn_rate": churn_rate,
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
