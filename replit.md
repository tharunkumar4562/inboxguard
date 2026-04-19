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
- Supabase is optional at startup; if `SUPABASE_URL` and `SUPABASE_ANON_KEY` are not set, the app logs a warning and continues.
- Optional Google OAuth, Razorpay, SMTP seed testing, admin dashboard, and Ollama rewrite features are controlled by environment variables documented in `README.md`.
- Runtime local data is stored under `data/` and ignored by git.
