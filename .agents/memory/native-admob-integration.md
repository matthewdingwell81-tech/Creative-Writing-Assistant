---
name: Native AdMob integration
description: Native plugin discovery, rewarded-video lifecycle behavior, and the trust boundary for test ad entitlements.
---

Capacitor plugins used by Lumina must be available to both the web artifact and the root native project.

**Why:** Android sync runs from the repository root and discovers plugins from that project's dependencies. Installing a plugin only in the web artifact can bundle its JavaScript without registering its native implementation.

**How to apply:** Keep compatible Capacitor versions in both packages and confirm that Android sync lists each intended native plugin.

Do not rely only on the rewarded-video show promise to finish a skipped Android ad.

**Why:** The AdMob plugin's Android implementation currently resolves that promise when a reward is earned, but does not settle it on an unrewarded dismissal or failed show.

**How to apply:** Handle dismissal and failed-show events to release the app's loading state without awarding credits. Award only from a confirmed reward event or successful reward result, once per video. Recheck this behavior after plugin upgrades.

Treat local premium flags and bonus-query balances as temporary test entitlements, not trusted production account state.

**Why:** The accepted initial AdMob scope uses test ads and account-scoped localStorage; production monetization and server-owned entitlements are deliberately separate work.

**How to apply:** Before a production reward rollout, move entitlement storage and reward verification to a trusted backend rather than trusting a browser-controlled balance.

Daily free queries are used before ad bonuses. Free-account Coach requests are charged before sending, including failed, empty, or interrupted replies. Trial and Premium requests do not spend queries or ad bonuses.

**Why:** The user explicitly changed accounting to count requests before sending rather than only successful replies. Unused earned credits remain available after the daily allowance or unlimited trial has ended.

**How to apply:** Charge each allowed free request once before starting its stream, never again on completion or history restoration. Carry only unspent bonuses across local midnight.

Banner dismissals last for the currently loaded app session and are scoped to the account. Navigation must not revive a dismissed banner; a fresh app launch must restore eligibility.

**Why:** The user requested temporary dismissal with reappearance on the next app open.

**How to apply:** Keep dismissal in memory, not permanent device storage or only in a page component that resets on navigation. A reload or cold native launch starts a new session.
