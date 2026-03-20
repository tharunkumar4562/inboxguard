from analyzer import analyze_email

# Test with full headers
email_full = '''From: sender@example.com
To: recipient@example.com
Subject: Test Email

Hi there, this is a test.'''

result = analyze_email(email_full, 'example.com')
print(f"Score: {result['summary']['score']}")
print(f"Risk: {result['summary']['risk_band']}")
print("\nFindings:")
for item in result['partial_findings']:
    if item.get('issue'):
        print(f"\n• {item.get('title')}")
        print(f"  {item.get('issue')}")
        if item.get('fix'):
            print(f"  → Fix: {item.get('fix')[:60]}...")
