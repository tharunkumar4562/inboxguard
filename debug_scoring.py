from analyzer import analyze_email

# Test the suspicious email
email = 'Subject: Verify your account\n\nClick here now to verify your account immediately!'

result = analyze_email(email, '')

print("=== SIGNALS DEBUG ===")
print(f"Email type: {result['signals']['email_type']}")
print(f"Spam terms: {result['signals']['spam_terms']}")
print(f"Aggressive tone terms: {result['signals']['aggressive_tone_terms']}")
print(f"Excessive caps: {result['signals']['excessive_caps']}")
print(f"Too many links: {result['signals']['too_many_links']}")
print(f"Tracking links: {result['signals']['tracking_style_links']}")
print(f"Short generic: {result['signals']['short_generic_email']}")
print(f"Automation level: {result['signals']['automation_level']}")

print(f"\nScore: {result['summary']['score']}")
print(f"Risk band: {result['summary']['risk_band']}")

print("\nFindings:")
for item in result['partial_findings']:
    print(f"  - {item.get('title')}: {item.get('issue')}")
