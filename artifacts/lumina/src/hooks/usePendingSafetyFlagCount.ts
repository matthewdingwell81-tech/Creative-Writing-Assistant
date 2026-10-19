import { useQuery } from "@tanstack/react-query";
import type { PendingSafetyFlagCount } from "@workspace/api-client-react";
import { apiFetch } from "@/lib/api";

export const pendingSafetyFlagCountQueryKey = (userId: string) =>
  ["admin-safety-flag-count", userId] as const;

export function usePendingSafetyFlagCount(userId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: pendingSafetyFlagCountQueryKey(userId ?? "disabled"),
    enabled: enabled && !!userId,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await apiFetch("/api/admin/safety-flags/count", { signal });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "Could not load pending reviews.");
      }
      const result = (await response.json()) as PendingSafetyFlagCount;
      return result.count;
    },
  });
}
