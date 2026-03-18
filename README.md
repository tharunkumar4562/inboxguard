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

- Missing SPF: -20
- Missing DKIM: -20
- Missing DMARC: -20
- Spam phrases: -10
- Too many links: -15
- Excessive caps: -10

Final score:

`score = max(0, 100 - risk_points)`

## Notes

The UI intentionally shows partial findings first and gates detailed recommendations behind an unlock CTA.

## Free Deployment (No Domain Needed)

Your local URL `http://127.0.0.1:8000` is only visible on your own computer.

To share InboxGuard publicly without buying a domain yet, deploy to:

- Render (recommended for quickest free public URL)
- Railway

After deployment, share your `onrender.com` or Railway URL for outreach.

Suggested pitch:

"I am an AI student building a pre-send heuristic engine. I launched the beta and can run a free domain risk check for you."
