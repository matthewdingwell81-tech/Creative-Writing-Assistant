import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LegalPage from "@/pages/LegalPage";
import { privacyStatement, userAgreement } from "@/content/legalDocuments";

const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
afterEach(() => {
  cleanup();
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  } else {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  }
  vi.restoreAllMocks();
});
function normalizedText(element: HTMLElement) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("public legal documents", () => {
  it("shows both approved documents and preserves all supplied copy", () => {
    render(<LegalPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Legal" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: privacyStatement.title })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: userAgreement.title })).toBeTruthy();
    expect(screen.getAllByText("Effective Date: October 16, 2026")).toHaveLength(2);

    for (const [id, legalDocument] of [
      ["privacy-statement", privacyStatement],
      ["user-agreement", userAgreement],
    ] as const) {
      const article = globalThis.document.getElementById(id);
      expect(article).toBeTruthy();
      const renderedText = normalizedText(article!);
      for (const line of legalDocument.content.split("\n").map(value => value.trim()).filter(Boolean)) {
        expect(renderedText).toContain(line);
      }
    }
    expect(screen.getByRole("heading", { name: "6. Your Rights", level: 3 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "14. Governing Law", level: 3 })).toBeTruthy();
  });

  it("provides keyboard-accessible links to both sections", () => {
    render(<LegalPage />);
    const nav = screen.getByRole("navigation", { name: "Legal documents" });
    expect(nav.querySelector('a[href="#privacy-statement"]')?.textContent).toBe("Privacy Statement");
    expect(nav.querySelector('a[href="#user-agreement"]')?.textContent).toBe("User Agreement");
  });

  it("scrolls to the requested document when opened from a deep link", async () => {
    const previousUrl = window.location.href;
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    window.history.replaceState(null, "", "/legal#user-agreement");
    render(<LegalPage />);

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" }));
    expect(screen.getByTestId("legal-document-user-agreement").id).toBe("user-agreement");

    window.history.replaceState(null, "", new URL(previousUrl).pathname);
  });
});
