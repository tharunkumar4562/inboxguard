from analyzer import analyze_email

# Test basic email
email = '''Subject: Hello
Hi there'''

result = analyze_email(email, '')
print(f"Score: {result['summary']['score']}")
print(f"Risk: {result['summary']['risk_band']}")
print("\nFindings:")
for item in result['partial_findings']:
    if item.get('issue'):
        print(f"• {item.get('title')}")
        print(f"  {item.get('issue')[:80]}...")
