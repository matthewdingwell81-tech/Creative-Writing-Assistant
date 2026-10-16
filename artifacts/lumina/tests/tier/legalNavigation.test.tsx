import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { email: "reader@example.com", username: "reader" } }),
  getGoogleSignInErrorMessage: (error: Error) => error.message,
}));
vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({
    busy: false,
    loading: false,
    nativeAvailable: true,
    isPremium: true,
    subscription: { status: "active" },
  }),
}));
vi.mock("@/components/PricingPage", () => ({
  PurchaseActions: () => null,
  SubscriptionFeedback: () => null,
  statusCopy: () => "Premium active",
}));
vi.mock("@/lib/sessionState", () => ({ consumeSessionExpired: () => false }));
afterEach(cleanup);

const auth = {
  user: null,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  loginWithGoogle: vi.fn(),
  googleError: null,
  logout: vi.fn(),
  loginError: null,
  registerError: null,
  isLoggingIn: false,
  isRegistering: false,
};

describe("legal entry points", () => {
  it("links to both documents from Settings", async () => {
    const SettingsPage = (await import("@/pages/SettingsPage")).default;
    render(<SettingsPage />);

    expect(screen.getByTestId("settings-link-privacy").getAttribute("href")).toBe("/legal#privacy-statement");
    expect(screen.getByTestId("settings-link-agreement").getAttribute("href")).toBe("/legal#user-agreement");
  });

  it("links to both documents from the public sign-in page", async () => {
    const AuthPage = (await import("@/pages/AuthPage")).default;
    render(<AuthPage auth={auth} />);

    const nav = screen.getByRole("navigation", { name: "Legal documents" });
    expect(nav.querySelector('a[href="/legal#privacy-statement"]')?.textContent).toBe("Privacy Statement");
    expect(nav.querySelector('a[href="/legal#user-agreement"]')?.textContent).toBe("User Agreement");
  });
});
