import json
import sys
sys.path.insert(0, '.')

from analyzer import analyze_email
from correction_engine import rewrite_email_text, get_learning_profile

# Test email: classic broadcast
test_email = """Subject: Revolutionary Funding Platform - Secure Your Education Loan Today

Get funding up to Rs. 1.25 crore for overseas education.

We offer:
- Flexible repayment options
- Fast approval (24 hours)
- No collateral needed
- Competitive interest rates (8-12%)
- Direct fund transfers to university

Our platform has helped 5000+ students secure loans for top universities worldwide.

Features:
- Instant eligibility check
- Zero processing fees
- Education-focused loan products
- Expert counseling (FREE)
- Dedicated account manager

Why choose us:
- Trusted by banks and universities
- 99% approval rate for eligible candidates
- Fast turnaround (apply today, funds in 48 hours)
- Completely online process

APPLY NOW and get Rs. 10,000 cashback on your first disbursement!

[Button: Get Started]

Visit our website: www.example.com
Call us: 1-800-XXX-XXXX
Email: support@example.com"""

print("=" * 70)
print("BEFORE (Original Broadcast Email):")
print("=" * 70)
print(test_email)
print()

# Analyze
before = analyze_email(test_email, "example.com", test_email, "content")
print("=" * 70)
print(f"RISK BAND: {before['summary'].get('risk_band')}")
print(f"SCORE: {before['summary'].get('final_score')}")
print(f"TOP ISSUE: {before['summary'].get('top_fixes', [{}])[0].get('title')}")
print("=" * 70)
print()

# Generate NORMAL rewrite
rewritten_normal = rewrite_email_text(test_email, ["broadcast"], "cold outreach", aggressive=False)
print("=" * 70)
print("NORMAL REWRITE (aggressive=False):")
print("=" * 70)
print(rewritten_normal)
print(f"Word count: {len(rewritten_normal.split())} words")
print()

# Generate AGGRESSIVE rewrite
rewritten_aggressive = rewrite_email_text(test_email, ["broadcast"], "cold outreach", aggressive=True)
print("=" * 70)
print("AGGRESSIVE REWRITE (aggressive=True):")
print("=" * 70)
print(rewritten_aggressive)
print(f"Word count: {len(rewritten_aggressive.split())} words")
print()

# Analyze aggressive version
after_agg = analyze_email(rewritten_aggressive, "example.com", rewritten_aggressive, "content")
print("=" * 70)
print(f"AFTER AGGRESSIVE - RISK BAND: {after_agg['summary'].get('risk_band')}")
print(f"AFTER AGGRESSIVE - SCORE: {after_agg['summary'].get('final_score')}")
print(f"SCORE DELTA: +{after_agg['summary'].get('final_score') - before['summary'].get('final_score')}")
print("=" * 70)
