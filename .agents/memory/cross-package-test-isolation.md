---
name: Cross-package test isolation
description: Prevent fixture tests from bypassing SDK mocks across workspace dependency boundaries
---

Inject provider/database boundaries when tests in one workspace package exercise service modules from another. Do not assume a bare-package SDK mock intercepts the other package's resolved dependency.

**Why:** Separate dependency resolution allowed RevenueCat and Firebase Admin imports to bypass web-test mocks. A synthetic read-only billing test reached the real provider rather than its fixture.

**How to apply:** Unit tests should pass explicit fake adapters into the exercised service. Reserve real integrations for deliberate, separately configured verification, and distinguish source/rules fixtures from live deployment checks.
