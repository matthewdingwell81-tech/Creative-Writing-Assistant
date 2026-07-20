---
name: express-session type augmentation in tsconfig
description: Add express-session to tsconfig types array for session.d.ts augmentation to work
---

# express-session type augmentation

**Rule:** When using `declare module "express-session" { interface SessionData { ... } }` in a custom `.d.ts` file, the api-server `tsconfig.json` must include `"express-session"` in the `types` array.

**Why:** The api-server tsconfig has `"types": ["node"]`, which is a whitelist. With only `["node"]`, TypeScript doesn't automatically include `@types/express-session` in the global scope. The module augmentation in `src/types/session.d.ts` only takes effect once `@types/express-session` is loaded. Without it in the `types` array, `req.session.userId` is reported as not existing on `Session & Partial<SessionData>`.

**How to apply:** In `artifacts/api-server/tsconfig.json`:
```json
"types": ["node", "express-session"]
```
Also ensure `session.d.ts` starts with `import "express-session";` to force the base module to load before the augmentation merges.
