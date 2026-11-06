---
name: Generator consumer compatibility
description: Why generator security upgrades must preserve the application's validation and query-library contracts.
---

Treat API-generator upgrades separately from runtime-library migrations. Explicitly
target the consumer's Zod and React Query major versions when using workspace
catalogs; do not upgrade the application's Zod merely to accommodate new
generator defaults. Zod 4 is now required: the collection-exhaustion advisory
GHSA-mrhx-c7xc-m3w5 has no patched Zod 3 release.

**Why:** Catalog-backed dependencies are not reliably detected by Orval. A
security upgrade silently defaulted to Zod 4 and React Query 4 output despite
the application using Zod 3 and React Query 5. Migrating runtime validation is
a separate compatibility decision, especially given this project's prior
Drizzle/Zod integration problems. The subsequent move to Zod 4 was necessary
for the security fix, not to satisfy the generator.

**How to apply:** After changing generator dependencies, regenerate the API
client and schemas and typecheck their consumers, not only the existing
checked-in generated code. Preserve the OpenAPI contract and the runtime
validation major unless a separate migration is requested.
