---
name: Neon suspend defaults
description: A Neon account restriction encountered while provisioning test projects.
---

This connected Neon account rejects requests that explicitly override `default_endpoint_settings.suspend_timeout_seconds`. Creating the isolated test project succeeded when that override was omitted and Neon defaults were used.

**Why:** The provider returned HTTP 412 for the explicit suspend interval; changing only that setting allowed project creation.

**How to apply:** If project creation fails because a suspend interval cannot be modified, verify the failed create did not leave a project behind, then omit the interval override rather than retrying blindly.
