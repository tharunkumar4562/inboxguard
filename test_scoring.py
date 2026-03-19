from analyzer import analyze_email

test_cases = [
    ('Simple test', '', 'Subject: Hello\n\nHi there'),
    ('Promotional', '', 'Subject: Free offer!\n\nDont miss this limited time offer'),
    ('Spammy', '', 'Subject: Click now!\n\nACT NOW!!! Winner!!!'),
    ('Professional', '', 'Subject: Meeting tomorrow\n\nHi John,\n\nLooking forward to speaking tomorrow at 2pm.'),
    ('Suspicious', '', 'Subject: Verify your account\n\nClick here now to verify your account immediately!'),
    ('Cold outreach with links', '', 'Subject: Quick question?\n\nHi, are you open to a quick chat? https://link1.com https://link2.com https://link3.com https://link4.com'),
    ('Transactional', '', 'Subject: Your receipt\n\nHi,\n\nThank you for your order #12345. Receipt attached. Click here to download.'),
    ('Newsletter', '', 'Subject: Weekly digest\n\nHi there,\n\nThis week on our blog: Article 1 | Article 2 | Article 3 | Article 4\n\nClick here to unsubscribe'),
]

print("=== SCORING VARIANCE TEST ===")
for name, domain, email in test_cases:
    result = analyze_email(email, domain)
    email_type = result['signals']['email_type']
    print(f'{name}: {result["summary"]["score"]} ({result["summary"]["risk_band"]}) - {email_type}')

print("\n=== END TEST ===")
