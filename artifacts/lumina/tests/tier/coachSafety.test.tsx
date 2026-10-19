import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SuggestionsSidebar from "@/components/SuggestionsSidebar";
import { CoachRequestBlockedError, CoachSafetyUnavailableError, streamCoach } from "@/lib/api";
import { setCurrentTierUser } from "@/lib/tierAccount";

const complete = vi.hoisted(() => vi.fn());
const tier = vi.hoisted(() => ({ premium: true, trial: true }));
const queryCharge = vi.hoisted(() => ({ increment: vi.fn(), refund: vi.fn() }));
vi.mock("@/lib/queryTracker", () => ({
  getLocalDateKey: () => "2026-10-16",
  incrementQuery: queryCharge.increment,
  refundQueryForAccount: queryCharge.refund,
}));
vi.mock("@/hooks/useCoachHistory", () => ({
  useCoachHistory: () => {
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState("");
    const completedMessages = useRef({ messages: [] });
    return {
      messages, setMessages, draft, setDraft, completedMessages, complete,
      updateDraft: setDraft, reset: vi.fn(), canEdit: true,
      loading: false, syncing: false, storageError: "", deviceHistory: null,
    };
  },
}));
vi.mock("@/hooks/useAdRewards", () => ({ useAdRewards: () => ({ isPremium: tier.premium, bonusAIQueries: 0 }) }));
vi.mock("@/lib/userTier", () => ({ isPremium: () => tier.premium, TIER_SYNC_ERROR_EVENT: "tier-error" }));
vi.mock("@/services/userTierService", () => ({
  AI_QUERY_STATE_CHANGED_EVENT: "queries-changed", dailyAiQueryStorageKey: () => "queries",
  getAIQueriesRemaining: () => 5, getDailyAIQueriesRemaining: () => 5,
  getFreeTrialDaysRemaining: () => 7, getNextTierRefreshDelay: () => 60_000,
  isFreeTrialActive: () => tier.trial, isCurrentTierUser: () => true,
}));
vi.mock("@/components/UpgradeModal", () => ({ default: () => null }));
vi.mock("@/components/AdRewardButton", () => ({ default: () => null }));

function respond(event: object) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(`data: ${JSON.stringify(event)}\n\n`)));
}
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); complete.mockClear();
  queryCharge.increment.mockClear(); queryCharge.refund.mockClear();
  tier.premium = true; tier.trial = true;
  setCurrentTierUser(null);
});

function mountCoach() {
  render(<SuggestionsSidebar
    userId="safety-user" documentId={1} suggestions={[]} savedSuggestions={[]}
    savedCount={0} changeHistory={[]} loading={false} documentContent="" documentType="fiction"
    analysisMode="manual" hasSuggestionUpdate={false} pendingSuggestionCount={0}
    onShowLatestSuggestions={() => {}} onDismiss={() => {}} onSave={() => {}}
    onRemoveSaved={() => {}} onClearHistory={() => {}} onAnalysisModeChange={() => {}}
    onAnalyzeWriting={() => {}} onUpgrade={async () => {}}
  />);
  fireEvent.mouseDown(screen.getByRole("tab", { name: /coach/i }), { button: 0, ctrlKey: false });
}

describe("Coach safety feedback", () => {
  it("flagging does not reject, refund, or lose the completed reply", async () => {
    tier.premium = false; tier.trial = false;
    setCurrentTierUser({ id: "safety-user", createdAt: "2026-10-16T00:00:00Z" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      'data: {"flagged":true,"notice":"Flagged for administrator review."}\n\n' +
      'data: {"content":"Helpful writing response."}\n\n' +
      'data: {"done":true}\n\n',
    )));
    mountCoach();
    fireEvent.change(screen.getByTestId("textarea-coach-input"), { target: { value: "My draft request" } });
    fireEvent.click(screen.getByTestId("btn-coach-send"));
    await screen.findByText("Helpful writing response.");
    await screen.findByText("Flagged for administrator review.");
    expect(complete).toHaveBeenCalledWith([
      { role: "user", content: "My draft request" },
      { role: "assistant", content: "Helpful writing response." },
    ]);
    expect(queryCharge.increment).toHaveBeenCalledOnce();
    expect(queryCharge.refund).not.toHaveBeenCalled();
  });
  it.each([
    [{ blocked: true }, CoachRequestBlockedError],
    [{ error: "Unavailable", code: "COACH_SAFETY_UNAVAILABLE" }, CoachSafetyUnavailableError],
  ])("does not swallow a safety event in the stream parser", async (event, ErrorClass) => {
    respond(event);
    const onChunk = vi.fn(), onDone = vi.fn();
    await expect(streamCoach([{ role: "user", content: "A request" }], "", "fiction", onChunk, onDone))
      .rejects.toBeInstanceOf(ErrorClass);
    expect(onChunk).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it.each([
    [{ blocked: true }, new CoachRequestBlockedError().message],
    [{ error: "Unavailable", code: "COACH_SAFETY_UNAVAILABLE" }, new CoachSafetyUnavailableError().message],
  ])("shows the explanation, restores the draft, and never saves a completed reply", async (event, explanation) => {
    respond(event);
    mountCoach();
    fireEvent.change(screen.getByTestId("textarea-coach-input"), { target: { value: "My draft request" } });
    fireEvent.click(screen.getByTestId("btn-coach-send"));
    await screen.findByText(explanation);
    await waitFor(() => expect((screen.getByTestId("textarea-coach-input") as HTMLTextAreaElement).value).toBe("My draft request"));
    expect(complete).not.toHaveBeenCalled();
    expect(screen.queryByTestId("coach-message-1")).toBeNull();
  });

  it.each([{ blocked: true }, { error: "Unavailable", code: "COACH_SAFETY_UNAVAILABLE" }])(
    "restores the free user's reserved credit after a safety response",
    async (event) => {
      tier.premium = false; tier.trial = false;
      respond(event); mountCoach();
      fireEvent.change(screen.getByTestId("textarea-coach-input"), { target: { value: "My request" } });
      fireEvent.click(screen.getByTestId("btn-coach-send"));
      await waitFor(() => expect(queryCharge.refund).toHaveBeenCalledWith("safety-user", "2026-10-16"));
      expect(queryCharge.increment).toHaveBeenCalledOnce();
      expect(complete).not.toHaveBeenCalled();
    },
  );
});
