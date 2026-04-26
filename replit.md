# InboxGuard

## Overview
InboxGuard is a FastAPI web app for pre-send email deliverability and risk checks. It serves server-rendered HTML templates with static CSS/JavaScript assets and provides analysis, scoring, admin, SEO, and health-check routes from `main.py`.

## Project setup
- Runtime: Python 3.12 on Replit
- Web framework: FastAPI with Uvicorn
- Frontend: Jinja templates in `templates/`, static assets in `static/`
- Main entrypoint: `main.py` exposes `app`
- Local/manual start command: `python main.py`, which reads `PORT` and defaults to `3000`
- Production run command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health check: `/health`

## Notes
- `INBOXGUARD_SITE_URL` defaults to `https://inboxguard.me` in `main.py`.
- Optional Google OAuth, Razorpay, SMTP seed testing, admin dashboard, and Ollama rewrite features are controlled by environment variables documented in `README.md`.
- Runtime local data is stored under `data/` and ignored by git.

## Persistence (Phase 1 — Supabase Postgres)
The auth/user/usage layer was migrated from local SQLite (`data/auth.db`) to
Supabase Postgres so the sidebar features persist across serverless hosts
(Vercel) and across container restarts.

- `db.py` is a thin sqlite3-compatible adapter over `psycopg2` that translates
  the SQLite SQL the app already speaks (`?` placeholders, `PRAGMA table_info`,
  `INSERT OR IGNORE`, `INTEGER PRIMARY KEY AUTOINCREMENT`, `sqlite_master`,
  `excluded.col` in `ON CONFLICT DO UPDATE`) into Postgres on the fly. It also
  appends `RETURNING id` to INSERTs against tables with a serial `id` column so
  `cursor.lastrowid` keeps working.
- `_auth_db_conn()` in `main.py` now returns a `db.get_conn()` wrapper instead
  of `sqlite3.connect(...)`. All ~80 existing call sites work unmodified.
- 18 tables now live in the Supabase `public` schema: `users`, `usage`,
  `anon_usage`, `user_daily_activity`, `user_feedback`, `payments`,
  `lead_captures`, `saved_fixes`, `api_keys`, `teams`, `team_members`,
  `async_jobs`, `seed_tests`, `email_outcomes`, `promo_codes`, `promo_usage`,
  `subscriptions`, `usage_logs`.
- `supabase_client.py` now prefers `SUPABASE_SERVICE_ROLE_KEY` over the anon
  key for server-side writes.

### Required secrets
- `SUPABASE_URL` — `https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API
- `SUPABASE_DB_URL` — full Postgres connection URI from Project Settings →
  Database → Connection string → **Transaction** pooler (port 6543, host
  `aws-1-<region>.pooler.supabase.com`). The IPv6-only direct host
  (`db.<ref>.supabase.co`) does not work from Replit/Vercel free tiers.
- Optional `SUPABASE_REGION` (default `ap-south-1`) — only used when
  `SUPABASE_DB_URL` contains just a password and the rest is derived.

### Out of scope for Phase 1 (still file-backed)
- `data/analytics.json` (event log)
- `data/rewrite_feedback.json` and `data/rewrite_model.json` (rewrite ML state)

## Vercel deployment (Phase 2)
The repo ships with a Vercel adapter so the same FastAPI app that runs locally
on Replit can be served from `inboxguard.me` via Vercel serverless functions.

- `api/index.py` — small ASGI entry point that adjusts `sys.path`, `chdir`s to
  the project root, and re-exports `app` from `main.py`.
- `vercel.json` — uses the `@vercel/python` builder, bundles all `*.py`
  modules, the `*.pkl` ML models, `plans.json`, the Google site-verification
  HTML, and the `templates/` and `static/` folders into the lambda. All
  requests are routed to `api/index.py` except `/static/*`, which is served
  directly.

### Vercel project settings to configure once
- Framework preset: **Other** (do not pick FastAPI/Python preset — `vercel.json`
  drives the build).
- Build & Output: leave empty; Vercel reads `requirements.txt` automatically.
- Environment Variables (Production + Preview): copy these from Replit:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_DB_URL` (must be the Transaction pooler URI, port 6543)
  - any other secrets the app uses (Google OAuth, Razorpay, etc.)

### Caveats
- Vercel's filesystem is read-only at runtime, so anything that writes under
  `data/` (analytics, rewrite feedback) will silently fail on Vercel until
  Phase 3 moves those into Supabase too.
- Cold-start memory: scikit-learn + supabase-py + razorpay can push the
  unzipped lambda close to Vercel Hobby's 50 MB limit. If a deploy fails
  with `FUNCTION_PAYLOAD_TOO_LARGE`, slim `requirements.txt` (e.g. drop
  `scikit-learn` if the rule-based rewriter is the only one used) or move
  to a Pro plan.
