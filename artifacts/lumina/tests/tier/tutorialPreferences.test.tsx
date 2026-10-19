import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  user: { id: "tutorial-account-a" } as { id: string } | null,
  get: vi.fn(),
  update: vi.fn(),
  saved: new Map<string, boolean>(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock("@workspace/api-client-react", () => ({
  getTutorialPreferences: mock.get,
  updateTutorialPreferences: mock.update,
}));

import { TutorialProvider, useTutorial } from "@/hooks/useTutorial";
import { resetTourProgress } from "@/lib/tutorial";

function Probe() {
  const tutorial = useTutorial();
  return (
    <>
      <div data-testid="tutorial-state">
        {tutorial.tutorialsReady ? "ready" : "loading"}:{tutorial.tutorialsEnabled ? "on" : "off"}:{tutorial.currentStep?.id ?? "closed"}
      </div>
      {tutorial.tutorialsLoadingError && <div role="alert">{tutorial.tutorialsLoadingError}</div>}
      {tutorial.tutorialsSaveError && <div role="alert">{tutorial.tutorialsSaveError}</div>}
      <button onClick={() => tutorial.start("full")}>Start</button>
      <button onClick={() => void tutorial.setTutorialsEnabled(false)}>Turn off</button>
      <button onClick={() => void tutorial.setTutorialsEnabled(true)}>Turn on</button>
      <button onClick={tutorial.retryTutorialPreferences}>Retry</button>
    </>
  );
}

function renderProvider() {
  return render(<TutorialProvider><Probe /></TutorialProvider>);
}

beforeEach(() => {
  localStorage.clear();
  mock.user = { id: "tutorial-account-a" };
  mock.saved.clear();
  mock.saved.set("tutorial-account-a", true);
  mock.saved.set("tutorial-account-b", true);
  mock.get.mockImplementation(async () => ({ enabled: mock.saved.get(mock.user?.id ?? "") ?? true }));
  mock.update.mockImplementation(async ({ enabled }: { enabled: boolean }) => {
    mock.saved.set(mock.user?.id ?? "", enabled);
    return { enabled };
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("server-saved tutorial preference", () => {
  it("waits for the account preference before launching any tour", async () => {
    let resolve!: (value: { enabled: boolean }) => void;
    mock.get.mockReturnValue(new Promise<{ enabled: boolean }>(yes => { resolve = yes; }));
    renderProvider();

    fireEvent.click(screen.getByText("Start"));
    expect(screen.getByTestId("tutorial-state").textContent).toBe("loading:off:closed");

    await act(async () => { resolve({ enabled: true }); });
    await waitFor(() => expect(screen.getByTestId("tutorial-state").textContent).toMatch(/^ready:on:/));
    fireEvent.click(screen.getByText("Start"));
    expect(screen.getByTestId("tutorial-state").textContent).toContain("ready:on:doc-list-toggle");
  });

  it("keeps tutorials off after resetting progress and requires explicit re-enabling", async () => {
    renderProvider();
    await screen.findByText(/^ready:on:closed$/);
    fireEvent.click(screen.getByText("Start"));
    expect(screen.getByTestId("tutorial-state").textContent).toContain("doc-list-toggle");

    await act(async () => { fireEvent.click(screen.getByText("Turn off")); });
    await waitFor(() => expect(screen.getByTestId("tutorial-state").textContent).toBe("ready:off:closed"));

    localStorage.setItem("lumina_tutorial_done:tutorial-account-a", JSON.stringify({ full: true }));
    localStorage.setItem("lumina_first_use:tutorial-account-a", JSON.stringify({ focusMode: true }));
    act(() => resetTourProgress("tutorial-account-a"));
    expect(localStorage.getItem("lumina_tutorial_done:tutorial-account-a")).toBeNull();
    expect(localStorage.getItem("lumina_first_use:tutorial-account-a")).toBeNull();
    expect(mock.saved.get("tutorial-account-a")).toBe(false);

    fireEvent.click(screen.getByText("Start"));
    expect(screen.getByTestId("tutorial-state").textContent).toBe("ready:off:closed");

    await act(async () => { fireEvent.click(screen.getByText("Turn on")); });
    await waitFor(() => expect(screen.getByTestId("tutorial-state").textContent).toBe("ready:on:closed"));
    fireEvent.click(screen.getByText("Start"));
    expect(screen.getByTestId("tutorial-state").textContent).toContain("doc-list-toggle");
  });

  it("does not show tours if the preference cannot be loaded, and recovers on retry", async () => {
    mock.get.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ enabled: true });
    renderProvider();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByText("Start"));
    expect(screen.getByTestId("tutorial-state").textContent).toBe("loading:off:closed");

    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => expect(screen.getByTestId("tutorial-state").textContent).toBe("ready:on:closed"));
  });

  it("does not apply a late preference response to a different account", async () => {
    let resolveFirst!: (value: { enabled: boolean }) => void;
    let resolveSecond!: (value: { enabled: boolean }) => void;
    mock.get
      .mockReturnValueOnce(new Promise<{ enabled: boolean }>(yes => { resolveFirst = yes; }))
      .mockReturnValueOnce(new Promise<{ enabled: boolean }>(yes => { resolveSecond = yes; }));
    const view = renderProvider();

    mock.user = { id: "tutorial-account-b" };
    view.rerender(<TutorialProvider><Probe /></TutorialProvider>);
    await act(async () => { resolveFirst({ enabled: true }); });
    expect(screen.getByTestId("tutorial-state").textContent).toBe("loading:off:closed");

    await act(async () => { resolveSecond({ enabled: false }); });
    await waitFor(() => expect(screen.getByTestId("tutorial-state").textContent).toBe("ready:off:closed"));
  });
});
