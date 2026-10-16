import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LegalPage from "@/pages/LegalPage";
import { privacyStatement, userAgreement } from "@/content/legalDocuments";

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
const originalPrint = Object.getOwnPropertyDescriptor(window, "print");
const originalCreateObjectURL = Object.getOwnPropertyDescriptor(
  URL,
  "createObjectURL",
);
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(
  URL,
  "revokeObjectURL",
);
afterEach(() => {
  cleanup();
  document.title = "Legal | Lumina";
  if (originalScrollIntoView) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  } else {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown })
      .scrollIntoView;
  }
  if (originalPrint) Object.defineProperty(window, "print", originalPrint);
  else delete (window as { print?: unknown }).print;
  if (originalCreateObjectURL)
    Object.defineProperty(URL, "createObjectURL", originalCreateObjectURL);
  else delete (URL as { createObjectURL?: unknown }).createObjectURL;
  if (originalRevokeObjectURL)
    Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURL);
  else delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
  vi.restoreAllMocks();
});
function normalizedText(element: HTMLElement) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("public legal documents", () => {
  it("shows both approved documents and preserves all supplied copy", () => {
    render(<LegalPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Legal" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: privacyStatement.title }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: userAgreement.title }),
    ).toBeTruthy();
    expect(
      screen.getAllByText("Effective Date: October 16, 2026"),
    ).toHaveLength(2);

    for (const [id, legalDocument] of [
      ["privacy-statement", privacyStatement],
      ["user-agreement", userAgreement],
    ] as const) {
      const article = globalThis.document.getElementById(id);
      expect(article).toBeTruthy();
      const renderedText = normalizedText(article!);
      for (const line of legalDocument.content
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean)) {
        expect(renderedText).toContain(line);
      }
    }
    expect(
      screen.getByRole("heading", { name: "6. Your Rights", level: 3 }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "14. Governing Law", level: 3 }),
    ).toBeTruthy();
  });

  it("provides keyboard-accessible links to both sections", () => {
    render(<LegalPage />);
    const nav = screen.getByRole("navigation", { name: "Legal documents" });
    expect(nav.querySelector('a[href="#privacy-statement"]')?.textContent).toBe(
      "Privacy Statement",
    );
    expect(nav.querySelector('a[href="#user-agreement"]')?.textContent).toBe(
      "User Agreement",
    );
  });

  it("prints only the selected document and restores the page after printing", async () => {
    const print = vi.fn();
    Object.defineProperty(window, "print", {
      configurable: true,
      value: print,
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(<LegalPage />);

    fireEvent.click(screen.getByTestId("button-print-user-agreement"));

    expect(print).toHaveBeenCalledOnce();
    expect(document.title).toBe(userAgreement.title);
    expect(
      screen.getByTestId("legal-page").getAttribute("data-print-target"),
    ).toBe("user-agreement");
    expect(
      screen
        .getByTestId("legal-document-user-agreement")
        .getAttribute("data-printable-document"),
    ).toBe("true");
    expect(
      screen
        .getByTestId("legal-document-privacy-statement")
        .getAttribute("data-printable-document"),
    ).toBe("false");

    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe("Legal | Lumina");
    await waitFor(() =>
      expect(
        screen.getByTestId("legal-page").hasAttribute("data-print-target"),
      ).toBe(false),
    );
  });

  it("saves a standalone copy with the full title, effective date, headings, and approved text", async () => {
    let savedBlob: Blob | undefined;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        savedBlob = blob;
        return "blob:legal-copy";
      }),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(<LegalPage />);

    fireEvent.click(screen.getByTestId("button-save-privacy-statement"));

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(click.mock.instances[0]?.getAttribute("download")).toBe(
      "lumina-privacy-statement.html",
    );
    expect(savedBlob).toBeTruthy();

    const html = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(savedBlob!);
    });
    const exportedDocument = new DOMParser().parseFromString(html, "text/html");
    expect(exportedDocument.title).toBe(privacyStatement.title);
    expect(normalizedText(exportedDocument.body)).toContain(
      privacyStatement.effectiveDate,
    );
    for (const line of privacyStatement.content
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean)) {
      expect(normalizedText(exportedDocument.body)).toContain(line);
    }
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

    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" }),
    );
    expect(screen.getByTestId("legal-document-user-agreement").id).toBe(
      "user-agreement",
    );

    window.history.replaceState(null, "", new URL(previousUrl).pathname);
  });
});
