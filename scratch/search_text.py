import os

search_terms = ["sunrise", "indie developer", "teammate@company.com", "Save Seed Result", "e.g. 17", "QA missed"]
workspace = r"c:\Users\tharu\InboxGuard"

for root, dirs, files in os.walk(workspace):
    if ".git" in root or ".venv" in root or "__pycache__" in root:
        continue
    for file in files:
        filepath = os.path.join(root, file)
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                for term in search_terms:
                    if term.lower() in content.lower():
                        print(f"FOUND '{term}' in file: {filepath}")
        except Exception as e:
            pass
