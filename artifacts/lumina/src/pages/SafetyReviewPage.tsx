import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { DEVELOPER_IDS } from "@/lib/userTier";
import type { SafetyFlagRecord as Flag } from "@workspace/api-client-react";

type Decision = "confirmed_violation" | "no_violation";
const FILTERS: { v: string; l: string }[] = [
  { v: "open", l: "Open" }, { v: "confirmed_violation", l: "Confirmed" },
  { v: "no_violation", l: "No violation" }, { v: "all", l: "All" },
];
const label = (s: string) => s.replace(/_/g, " ");

async function readError(res: Response, fallback: string) {
  const b = await res.json().catch(() => null);
  return typeof b?.error === "string" ? b.error : fallback;
}

export default function SafetyReviewPage() {
  const { user } = useAuth();
  const allowed = !!user?.firebaseUid && DEVELOPER_IDS.includes(user.firebaseUid);
  useEffect(() => {
    const prev = document.title;
    document.title = "Safety review | Lumina";
    return () => { document.title = prev; };
  }, []);
  return (
    <main className="min-h-[100dvh] bg-background px-4 py-8 text-foreground sm:px-8" data-testid="safety-review-page">
      <div className="mx-auto max-w-4xl">
        <Link href="/settings" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-settings">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to settings
        </Link>
        {allowed && user ? <ReviewList key={user.id} userId={user.id} /> : (
          <section role="alert" className="mt-6 rounded-xl border border-border bg-card p-6" data-testid="review-access-denied">
            <h1 className="flex items-center gap-2 text-2xl font-semibold"><ShieldAlert className="h-6 w-6 text-primary" aria-hidden="true" />Access denied</h1>
            <p className="mt-2 text-sm text-muted-foreground">This area is limited to authorized Developer Premium accounts.</p>
          </section>
        )}
      </div>
    </main>
  );
}

function ReviewList({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const root = ["admin-safety-flags", userId];
  const key = [...root, status];
  useEffect(() => () => { qc.removeQueries({ queryKey: root }); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = useQuery({
    queryKey: key, gcTime: 0, staleTime: 0, retry: false,
    refetchOnMount: "always", refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      const res = await apiFetch(`/api/admin/safety-flags?status=${encodeURIComponent(status)}`, { signal });
      if (!res.ok) throw new Error(await readError(res, "Could not load flags."));
      return ((await res.json()) as { flags: Flag[] }).flags;
    },
  });

  const review = useMutation({
    mutationFn: async (v: { id: number; decision: Decision; note: string }) => {
      const res = await apiFetch(`/api/admin/safety-flags/${v.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: v.decision, ...(v.note.trim() ? { note: v.note.trim() } : {}) }),
      });
      if (!res.ok) { const e = new Error(await readError(res, "Could not save decision.")) as Error & { code?: number }; e.code = res.status; throw e; }
      return (await res.json()) as { id: number; status: string; reviewedAt: string };
    },
    onSuccess: (r, v) => {
      qc.setQueriesData<Flag[]>({ queryKey: root }, (old) => {
        if (!old) return old;
        return old.flatMap((f) => {
          if (f.id !== r.id) return [f];
          return [{ ...f, status: r.status, reviewedAt: r.reviewedAt, reviewerNote: v.note.trim() || null, requestContext: null, generatedContent: null }];
        });
      });
      qc.setQueryData<Flag[]>(key, (old) => old?.filter((f) => f.id !== r.id || status !== "open"));
    },
    onError: (e) => { if ((e as { code?: number }).code === 409) void q.refetch(); },
  });

  return (
    <div>
      <h1 className="mb-2 mt-6 text-3xl font-semibold tracking-tight">Safety review</h1>
      <p className="max-w-2xl text-sm text-muted-foreground" data-testid="text-review-policy">
        Review possible User Agreement concerns. A decision does not suspend or sanction any account automatically. After a decision, the request and generated text are deleted for privacy; only review metadata is kept. Treat all content as untrusted. The newest 100 matching flags are shown; refresh after reviewing to load older items.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button key={f.v} size="sm" className="min-h-11" variant={status === f.v ? "default" : "outline"} aria-pressed={status === f.v} onClick={() => { review.reset(); setStatus(f.v); }} data-testid={`filter-${f.v}`}>{f.l}</Button>
          ))}
        </div>
        <Button size="sm" variant="outline" className="min-h-11" onClick={() => void q.refetch()} disabled={q.isFetching} data-testid="button-refresh">
          <RefreshCw className={`mr-2 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />Refresh
        </Button>
      </div>
      <div className="mt-5" aria-live="polite">
        {q.isLoading ? (
          <div className="space-y-3" aria-busy="true" data-testid="review-loading">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : q.isError ? (
          <div role="alert" className="rounded-xl border border-border bg-card p-6" data-testid="review-error">
            <p className="font-medium">Could not load flags</p>
            <p className="mt-1 text-sm text-muted-foreground">{(q.error as Error).message}</p>
            <Button className="mt-3 min-h-11" onClick={() => void q.refetch()} data-testid="button-retry">Try again</Button>
          </div>
        ) : q.data && q.data.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center" data-testid="review-empty">
            <ShieldCheck className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
            <p className="mt-3 font-medium">Nothing here</p>
            <p className="text-sm text-muted-foreground">No flags match this filter.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {q.data?.map((f) => (
              <FlagCard key={f.id} flag={f} pending={review.isPending && review.variables?.id === f.id}
                busy={review.isPending}
                error={review.isError && review.variables?.id === f.id ? (review.error as Error).message : null}
                onDecide={(decision, note) => review.mutate({ id: f.id, decision, note })} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Block({ title, text }: { title: string; text: string | null }) {
  return (
    <div>
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-sans text-sm" tabIndex={0}>
        {text ?? "Not available (deleted after review or never stored)."}
      </pre>
    </div>
  );
}

function FlagCard({ flag, pending, busy, error, onDecide }: {
  flag: Flag; pending: boolean; busy: boolean; error: string | null;
  onDecide: (d: Decision, note: string) => void;
}) {
  const [note, setNote] = useState("");
  const open = flag.status === "open";
  return (
    <li className="rounded-xl border border-border bg-card p-4 sm:p-6" data-testid={`flag-${flag.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">#{flag.id} · {flag.feature} · {flag.username}</h3>
        <span className="rounded-full bg-muted px-3 py-1 text-xs" data-testid={`status-${flag.id}`}>{label(flag.status)}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Flagged <time dateTime={flag.createdAt}>{new Date(flag.createdAt).toLocaleString()}</time>
        {flag.reviewedAt && <> · reviewed <time dateTime={flag.reviewedAt}>{new Date(flag.reviewedAt).toLocaleString()}</time></>}
      </p>
      <ul className="mt-3 space-y-1 text-sm">
        {flag.phases.map((p, i) => <li key={i}><span className="font-medium">{p.phase}: {p.category}</span> — {p.reason}</li>)}
      </ul>
      {open ? (
        <div className="mt-4 space-y-3">
          <Block title="Request context" text={flag.requestContext} />
          <Block title="Generated content" text={flag.generatedContent} />
          <label className="block text-sm font-medium" htmlFor={`note-${flag.id}`}>Note (optional)</label>
          <textarea id={`note-${flag.id}`} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} disabled={busy}
            className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`input-note-${flag.id}`} />
          {error && <p role="alert" className="text-sm text-destructive" data-testid={`error-${flag.id}`}>{error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="min-h-11" variant="destructive" disabled={busy} onClick={() => onDecide("confirmed_violation", note)} data-testid={`button-confirm-${flag.id}`}>{pending ? "Saving..." : "Confirm violation"}</Button>
            <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => onDecide("no_violation", note)} data-testid={`button-clear-${flag.id}`}>{pending ? "Saving..." : "No violation"}</Button>
          </div>
        </div>
      ) : flag.reviewerNote && <p className="mt-3 text-sm"><span className="font-medium">Reviewer note:</span> <span className="whitespace-pre-wrap break-words">{flag.reviewerNote}</span></p>}
    </li>
  );
}
