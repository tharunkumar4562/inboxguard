from html.parser import HTMLParser

class HTMLValidator(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        # List of tags we want to track nesting for
        if tag in ["div", "section", "form", "main", "aside", "header", "footer"]:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in ["div", "section", "form", "main", "aside", "header", "footer"]:
            if not self.stack:
                self.errors.append(f"Unexpected closing tag </{tag}> at line {self.getpos()[0]}, col {self.getpos()[1]}")
                return
            expected_tag, pos = self.stack.pop()
            if expected_tag != tag:
                self.errors.append(f"Mismatched tag: expected </{expected_tag}> (opened at line {pos[0]}, col {pos[1]}), but got </{tag}> at line {self.getpos()[0]}, col {self.getpos()[1]}")
                # Push expected back or try to recover
                # For simplicity, we just log and continue

with open(r"c:\Users\tharu\InboxGuard\templates\index.html", "r", encoding="utf-8") as f:
    html_content = f.read()

validator = HTMLValidator()
validator.feed(html_content)

if validator.stack:
    print("Unclosed tags remaining on stack:")
    for tag, pos in reversed(validator.stack):
        print(f"  <{tag}> opened at line {pos[0]}, col {pos[1]}")
else:
    print("All tags closed successfully.")

if validator.errors:
    print("\nErrors found:")
    for err in validator.errors:
        print(f"  {err}")
