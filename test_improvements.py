from analyzer import analyze_email

test_cases = [
    ('Simple test', '', 'Subject: Hello\n\nHi there'),
    ('Promotional', '', 'Subject: Free offer!\n\nDont miss this limited time offer'),
    ('Spammy', '', 'Subject: Click now!\n\nACT NOW!!! Winner!!!'),
]

print("=== SCORING WITH RANDOMNESS ===")
print("(Run multiple times to see ±2 variation)")
for name, domain, email in test_cases:
    result = analyze_email(email, domain)
    print(f'{name}: {result["summary"]["score"]} ({result["summary"]["risk_band"]})')

print("\n=== DATA-DRIVEN FINDINGS SAMPLE ===")
result = analyze_email('Subject: Click now!\n\nACT NOW!!! Winner!!!', '')
print(f"Score: {result['summary']['score']}")
for item in result['partial_findings'][:3]:
    print(f"\n• {item.get('title')}")
    print(f"  Issue: {item.get('issue')}")
