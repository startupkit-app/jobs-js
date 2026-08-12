---
"@startupkit-app/jobs": minor
---

Raise the minimum supported Node version from 18.17 to 20.19.0.

Node 18 reached end of life, and the test toolchain no longer runs on it — vitest 4
and vite 8 both require Node 20 or newer — so CI now tests Node 20, 22 and 24. The
previous `>=18.17` floor claimed support for a version nothing verified.

This is a declaration change rather than a code change. The client is built on `fetch`
and standard web APIs and uses no Node built-ins, so it may well continue to work on
Node 18 — but that is no longer tested and is no longer supported. Installing on Node
18 will now produce an `EBADENGINE` warning, or fail outright under `engine-strict`.
