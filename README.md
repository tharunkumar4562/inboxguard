# InboxGuard

InboxGuard is a pre-send email risk checker designed around one outcome: preventing deliverability loss before a campaign is sent.

## Stack

- Backend: FastAPI (Python)
- Frontend: HTML + TailwindCSS + vanilla JavaScript
- DNS checks: dnspython

## Project Structure

- `main.py` - FastAPI entrypoint and routes
- `analyzer.py` - domain and copy analysis logic
- `scorer.py` - risk scoring engine
- `utils.py` - helper functions
- `templates/index.html` - main UI
- `static/css/styles.css` - custom styles
- `static/js/app.js` - frontend behavior

## Local Setup (Windows PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

Open `http://127.0.0.1:8000`.

## Scoring Rules

- Penalty-first model (no positive stacking)
- Baseline starts at 100 and subtracts risk penalties
- Content penalties include CTA pressure, spam phrases, link density, targeting quality, and tracking footprint
- Full mode adds infrastructure penalties for SPF/DKIM/DMARC/auth alignment/reputation
- Non-linear interaction penalties are applied for combinations like SPF+DKIM missing or CTA+multi-link pattern

Final score:

`score = max(0, min(100, 100 - total_penalty))`

## Private Admin Dashboard

You can enable a private dashboard to track:

- Page views
- CTA clicks
- Access requests
- Analyze requests
- Mode usage (`content` vs `full`)

Set an environment variable before launch/deploy:

`INBOXGUARD_ADMIN_TOKEN=your-secret-token`

Open dashboard with:

`/admin?token=your-secret-token`

If token is missing, dashboard route returns `404`.

## Notes

The UI intentionally shows partial findings first and gates detailed recommendations behind an unlock CTA.

## Free Deployment (No Domain Needed)

Your local URL `http://127.0.0.1:8000` is only visible on your own computer.

To share InboxGuard publicly without buying a domain yet, deploy to:

- Render (recommended for quickest free public URL)
- Railway

For Railway, this repo now includes both `Procfile` and `railway.json` so the app starts with:

`uvicorn main:app --host 0.0.0.0 --port $PORT`

If Railway shows "Application not found", verify you are opening the current service domain from the active project/environment in Railway dashboard.

After deployment, share your `onrender.com` or Railway URL for outreach.

Suggested pitch:

"I am an AI student building a pre-send heuristic engine. I launched the beta and can run a free domain risk check for you."

## Programmatic SEO Setup (2026)

This app now supports long-tail, intent-driven landing pages.

### Live pSEO routes

- `/p/fix-godaddy-spam-issues`
- `/p/instantly-deliverability-audit`
- `/p/hostinger-email-deliverability-audit`

### SEO and crawl endpoints

- `/robots.txt`
- `/sitemap.xml`

### Immediate indexing steps

1. Open Google Search Console and add your Railway URL property.
2. Submit `/sitemap.xml`.
3. Request indexing for `/` and each `/p/...` page.
4. Post those exact long-tail URLs in relevant Reddit/X threads for early trust signals.
