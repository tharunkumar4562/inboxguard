# UX Rules (Do Not Break)

These rules are mandatory for InboxGuard UI changes.

1. A new user must be able to run Scan in under 3 seconds.
2. No screen may present more than one primary action at a time.
3. No locked feature may appear before the user has seen value.
4. Every paywall must follow the sequence: value -> pain -> unlock.
5. Every feature must have a clear user outcome.

## Required UX Check Before Deploy

- Can a new user run scan instantly?
- Is there only one primary CTA on the screen?
- Does the result show value before the unlock gate?
- Are locked features shown only after value is shown?
- Is there any confusion in the first 5 seconds?

If any answer is no, do not ship.

## Structure Lock

- Home: hero scan only, result after action, unlock after result.
- Tools: secondary features only.
- Subject Generator: separate page.
