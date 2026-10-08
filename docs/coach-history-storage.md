# Coach history storage and migration

## Scope and privacy

Coach exchanges and unsent/interrupted prompts are private to the signed-in
account and writing document. The API checks document ownership on every read,
write, and reset; identifiers in request bodies cannot change ownership.
Responses use `Cache-Control: no-store`. Loading history does not call an AI
endpoint or alter query accounting.

Completed replies are stored as alternating, nonempty user/assistant pairs.
Partial replies are never saved as completed exchanges. Prompts remain drafts
until generation explicitly finishes. Storage retains up to 40 exchanges.

## Retention and deletion

The 30-day clock starts at the last successful change, not a read. Expired text
is cleared on access and by an hourly server cleanup (also run on startup).
Start over clears the conversation and draft on the server. A content-free
revision marker remains so stale devices cannot recreate cleared history with
an old write. Deleting the writing document or account cascades to these rows.
Other devices observe deletion on their next load; stale writes receive 409.

Pending changes have an account/document-scoped browser recovery copy. It is
removed after confirmed sync, Start over, or document deletion on that device.
Legacy or unsynced copies on other devices may persist until their original
30-day expiry or explicit discard. They are never automatically uploaded.
Signing out does not upload or expose those copies to another account.
This is persistence, not end-to-end encryption; normal database backup policies
are separate from removal of active conversation text.

## Reviewed local-history migration

1. Fetch the authoritative server snapshot using the authenticated session.
2. Look up only the current account/document's valid, unexpired local entry.
3. Explain that import replaces the server conversation and draft on all
   devices, keeps the original timestamp, and uses no AI queries.
4. Offer **Import device history** or **Keep saved history and delete device
   copy**. Until resolved, editing/sending is disabled.
5. Import uses the loaded revision. If another device changed the server,
   reject with 409; keep the local copy and require a fresh load/choice.
6. Delete the local copy only after confirmed import or explicit discard.

The additive SQL migration creates only the new Coach table and expiry index.
It does not reconcile unrelated tables or alter old browser histories.
Post-merge setup applies it idempotently. The server also bundles and applies
the same reviewed SQL before listening, including on published-server startup.

## Sync failure and concurrent devices

Draft saves are debounced; navigating away flushes the pending draft. Writes
within a browser are queued by scope. Different devices use optimistic
revisions to avoid silent last-writer-wins data loss. On a failed or conflicting
save, keep the recovery copy, show a visible error, and block further sends
until saved history is loaded again. The user can then explicitly import their
unsynced version or keep the saved version.
