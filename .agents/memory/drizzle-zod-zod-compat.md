---
name: drizzle-zod zod compatibility
description: drizzle-zod@0.8.3 breaks with zod@3.25.x; use manual z.object() schemas
---

# drizzle-zod + zod@3.25.x incompatibility

The rule: do NOT use `createInsertSchema` from `drizzle-zod` in `lib/db/src/schema/*`. Use manual `z.object()` schemas instead.

**Why:** drizzle-zod@0.8.3 has a TypeScript type constraint `ZodType<any, any, any>` that expects internal Zod private properties (`_type`, `_parse`, `_getType`, etc.). zod@3.25.x (the "v4 bridge" release) removed or renamed these internal TypeScript types. This causes `tsc --build` to fail for `lib/db`, blocking the entire `typecheck:libs` step and making `@workspace/db` exports invisible to downstream packages. The runtime is fine (esbuild ignores it), but typecheck completely breaks.

**How to apply:** Any time a new table is added to `lib/db/src/schema/`, write the insert schema manually:
```typescript
export const insertThingSchema = z.object({
  fieldA: z.string(),
  fieldB: z.number().int().optional(),
});
export type InsertThing = z.infer<typeof insertThingSchema>;
```
Do not import `createInsertSchema` from `drizzle-zod`.
