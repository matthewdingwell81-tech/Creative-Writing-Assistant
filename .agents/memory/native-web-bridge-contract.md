---
name: Native and remote web bridge compatibility
description: Evidence required when a remote website calls native Android plugins and local sync appears successful.
---

Treat native plugin availability as a release compatibility boundary, not a web deployment property.

**Why:** A real failing APK had an empty Capacitor plugin registry and no defined Google Sign-In native class, even though the current repository's Gradle wiring and JavaScript/native plugin names were correct. Inspecting freshly synced local files had incorrectly been treated as evidence about the installed APK.

**How to apply:** Distinguish source wiring, the actual APK's registry and defined DEX classes, and a real device's JS-to-Java invocation. Never claim a Gradle build or local sync proves runtime plugin availability. A remote website can require a newer native API without adding that API to installed APKs. Rebuild only the canonical root native project; historical Android trees and old APK outputs are not interchangeable.
