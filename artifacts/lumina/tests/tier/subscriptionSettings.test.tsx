import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cancelSubscriptionMock, useSubscriptionMock } = vi.hoisted(() => ({
  cancelSubscriptionMock: vi.fn(),
  useSubscriptionMock: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "reader-id", email: "reader@example.com", username: "reader", firebaseUid: null },
  }),
}));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: useSubscriptionMock }));
vi.mock("@/hooks/useTutorial", () => ({
  useTutorial: () => ({
    tutorialsEnabled: true, tutorialsReady: true,
    tutorialsLoadingError: null, tutorialsSaveError: null, tutorialsSaving: false,
    retryTutorialPreferences: vi.fn(), setTutorialsEnabled: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePendingSafetyFlagCount", () => ({ usePendingSafetyFlagCount: () => 0 }));

import SettingsPage from "@/pages/SettingsPage";

afterEach(cleanup);

function subscriptionState(status: "active" | "cancelled") {
  return {
    subscription: {
      accountId: "reader-id", tier: "premium", status,
      expiresAt: Date.UTC(2030, 0, 1), verifiedAt: Date.now(), firebaseSync: "synced",
    },
    isPremium: true,
    loading: false,
    busy: false,
    price: "$4.99",
    error: null,
    message: null,
    offline: false,
    nativeAvailable: true,
    pendingVerification: false,
    purchase: vi.fn(),
    restore: vi.fn(),
    retry: vi.fn(),
    refresh: vi.fn(),
    cancelSubscription: cancelSubscriptionMock,
    manage: vi.fn(),
  };
}

function renderSettings() {
  const queryClient = new QueryClient();
  render(<QueryClientProvider client={queryClient}><SettingsPage /></QueryClientProvider>);
}

describe("subscription settings cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSubscriptionMock.mockReturnValue(subscriptionState("active"));
  });

  it("opens store cancellation from the active subscription section", () => {
    renderSettings();
    const section = within(screen.getByTestId("settings-subscription"));

    fireEvent.click(section.getByRole("button", { name: "Unsubscribe" }));

    expect(cancelSubscriptionMock).toHaveBeenCalledOnce();
    expect(section.getByTestId("settings-unsubscribe-help").textContent)
      .toContain("Google Play so you can confirm cancellation");
  });

  it("keeps management available without offering cancellation twice", () => {
    useSubscriptionMock.mockReturnValue(subscriptionState("cancelled"));
    renderSettings();
    const section = within(screen.getByTestId("settings-subscription"));

    expect(section.getByRole("button", { name: "Manage Subscription" })).toBeTruthy();
    expect(section.queryByRole("button", { name: "Unsubscribe" })).toBeNull();
    expect(section.queryByTestId("settings-unsubscribe-help")).toBeNull();
  });
});
