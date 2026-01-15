# Example 03 — Bugfix

Bug: duplicate `Content-Type` headers cause inconsistent parsing between Node and Java adapters.

## Fix approach
1. Define normalization rule: if duplicate content-type values differ -> BLOCK with `header.duplicate.content_type`.
2. Implement same logic in both adapters.
3. Add regression fixture where headers differ.
4. Confirm behavior in monitor and enforce modes.
