---
name: bcrypt in Replit
description: Use bcryptjs (pure JS) not native bcrypt in api-server
---

# bcryptjs vs bcrypt in Replit

**Rule:** Use `bcryptjs` (pure JS implementation), not `bcrypt` (native C++ bindings).

**Why:** Replit's environment doesn't support native Node.js addon builds. `bcrypt` requires `node-gyp` and native compilation, which fails in this environment. `bcryptjs` is a drop-in replacement with identical API, no build step required.

**How to apply:** In `artifacts/api-server/package.json`, use `"bcryptjs": "^2.4.3"` and `"@types/bcryptjs": "^2.4.6"`. Import as `import bcrypt from "bcryptjs"`.
