interface Props {
  loading: boolean;
  error: string | null;
  retry: () => void;
  signOut: () => void;
}

/** Do not mount the editor or ad hooks until this account's tier is resolved. */
export function SubscriptionStartup({ loading, error, retry, signOut }: Props) {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center px-6"
      data-testid="subscription-startup">
      <div className="max-w-sm text-center space-y-4">
        {loading ? (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
              aria-hidden="true" />
            <p role="status">Preparing your account…</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">We couldn’t verify your account access</h1>
            <p role="alert" className="text-sm text-muted-foreground">{error ?? "Please reconnect and try again."}</p>
            <div className="flex justify-center gap-3">
              <button type="button" className="min-h-11 rounded-md bg-primary px-4 text-primary-foreground"
                onClick={retry} data-testid="subscription-startup-retry">Retry</button>
              <button type="button" className="min-h-11 rounded-md border border-border px-4"
                onClick={signOut}>Sign out</button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
