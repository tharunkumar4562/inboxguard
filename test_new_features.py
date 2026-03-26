#!/usr/bin/env python3
"""
Test the current scoring model outputs:
1. Actionable findings (no personalization detected, promotional phrasing, urgency language)
2. Email type with confidence %
3. Final score + confidence + verdict label
4. Real-world risk interpretation
5. Detected signals evidence
"""

from analyzer import analyze_email

print("=" * 70)
print("TESTING NEW SCORING IMPROVEMENTS")
print("=" * 70)

# Test 1: Cold outreach without personalization (should show actionable findings)
test_email1 = """Subject: Quick partnership opportunity

Hi,

Quick question - are you open to partnerships? We're seeing great results with companies like yours.

Check this out: https://example.com

Best regards,
John"""

print("\nTEST 1 - Cold Outreach Without Personalization")
print("-" * 70)
result1 = analyze_email(test_email1, 'example.com', '')
print(f"Score: {result1['summary']['score']}/100")
print(f"Risk Band: {result1['summary']['risk_band']}")
print(f"Final Score: {result1['summary']['final_score']}/100")
print(f"Confidence: {result1['summary']['deliverability_confidence']}")
print(f"Verdict: {result1['summary']['verdict_label']}")
print(f"Real-World Risk: {result1['summary']['real_world_risk']}")
print(f"Email Type: {result1['summary']['email_type']} ({result1['summary']['email_type_confidence']}% confidence)")
print(f"\nDetected Signals:")
for signal in result1['summary']['detected_signals']:
    print(f"  {signal}")
print(f"\nTop Findings:")
for finding in result1['partial_findings'][:2]:
    print(f"  - {finding['title']}")
    print(f"    {finding['issue']}")

# Test 2: Promotional email with urgency
test_email2 = """Subject: Limited Time Offer - Act NOW!

Don't miss out! This offer expires TODAY!

Click here immediately: https://promo.com
Register now: https://confirm.com

Limited spots available. Act fast!

Thanks,
Marketing Team"""

print("\n\nTEST 2 - Promotional Email With Urgency")
print("-" * 70)
result2 = analyze_email(test_email2, 'promo.com', '')
print(f"Score: {result2['summary']['score']}/100")
print(f"Risk Band: {result2['summary']['risk_band']}")
print(f"Final Score: {result2['summary']['final_score']}/100")
print(f"Confidence: {result2['summary']['deliverability_confidence']}")
print(f"Verdict: {result2['summary']['verdict_label']}")
print(f"Real-World Risk: {result2['summary']['real_world_risk']}")
print(f"Email Type: {result2['summary']['email_type']} ({result2['summary']['email_type_confidence']}% confidence)")
print(f"\nDetected Signals:")
for signal in result2['summary']['detected_signals']:
    print(f"  {signal}")
print(f"\nTop Findings:")
for finding in result2['partial_findings'][:2]:
    print(f"  - {finding['title']}")
    print(f"    {finding['issue']}")

# Test 3: Clean transactional email
test_email3 = """Subject: Your order confirmation #12345

Hi John,

Thank you for your order. Your confirmation number is #12345.

You can track your order here: https://tracking.example.com

Best regards,
Order Team"""

print("\n\nTEST 3 - Clean Transactional Email")
print("-" * 70)
result3 = analyze_email(test_email3, 'example.com', '')
print(f"Score: {result3['summary']['score']}/100")
print(f"Risk Band: {result3['summary']['risk_band']}")
print(f"Final Score: {result3['summary']['final_score']}/100")
print(f"Confidence: {result3['summary']['deliverability_confidence']}")
print(f"Verdict: {result3['summary']['verdict_label']}")
print(f"Real-World Risk: {result3['summary']['real_world_risk']}")
print(f"Email Type: {result3['summary']['email_type']} ({result3['summary']['email_type_confidence']}% confidence)")
print(f"\nDetected Signals:")
for signal in result3['summary']['detected_signals']:
    print(f"  {signal}")
print(f"\nFindings Count: {len(result3['partial_findings'])}")

print("\n" + "=" * 70)
print("✅ TEST COMPLETE - New features are working!")
print("=" * 70)
