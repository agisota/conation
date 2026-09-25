---
"@macro-inc/lexical-core": patch
---

Reject malformed persisted paste content before creating a PasteNode, preserving the existing Unknown Paste fallback while valid pasted and referenced text continues to round-trip.
