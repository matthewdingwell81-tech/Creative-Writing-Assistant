---
name: Drizzle error causes
description: Detecting PostgreSQL SQLSTATEs when Drizzle wraps driver errors.
---

When classifying PostgreSQL errors caught from Drizzle, the SQLSTATE may be on a nested `cause` rather than the outer error. This matters for expected unique-constraint races such as SQLSTATE `23505`.

**Why:** The isolated Firebase identity race produced a Drizzle-wrapped duplicate-key error; checking only the outer error left the race unhandled.

**How to apply:** Traverse the error `cause` chain with cycle protection before deciding whether a PostgreSQL conflict is expected.
