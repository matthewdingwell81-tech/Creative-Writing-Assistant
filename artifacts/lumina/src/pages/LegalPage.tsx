import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Download, Printer } from "lucide-react";
import {
  privacyStatement,
  userAgreement,
  type LegalDocument,
} from "@/content/legalDocuments";

type Block =
  | { kind: "paragraph"; text: string; key: string }
  | { kind: "heading"; text: string; level: 3 | 4; key: string }
  | { kind: "list"; items: string[]; key: string };

function parseDocument(content: string): Block[] {
  const blocks: Block[] = [];
  for (const [index, rawLine] of content.split("\n").entries()) {
    const text = rawLine.trim();
    if (!text) continue;
    const heading = text.match(/^(\d+(?:\.\d+)?)[.]?\s+(.+)$/);
    if (heading) {
      blocks.push({
        kind: "heading",
        text,
        level: heading[1].includes(".") ? 4 : 3,
        key: `heading-${index}`,
      });
    } else if (text.startsWith("- ")) {
      const previous = blocks[blocks.length - 1];
      if (previous?.kind === "list") previous.items.push(text.slice(2));
      else
        blocks.push({
          kind: "list",
          items: [text.slice(2)],
          key: `list-${index}`,
        });
    } else {
      blocks.push({ kind: "paragraph", text, key: `paragraph-${index}` });
    }
  }
  return blocks;
}

function escapeHtml(text: string) {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (character) => replacements[character]);
}

function buildDocumentHtml(document: LegalDocument) {
  const content = parseDocument(document.content)
    .map((block) => {
      if (block.kind === "heading") {
        const tag = block.level === 3 ? "h2" : "h3";
        return `<${tag}>${escapeHtml(block.text)}</${tag}>`;
      }
      if (block.kind === "list") {
        const items = block.items
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${escapeHtml(block.text)}</p>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(document.title)}</title>
  <style>
    :root { color-scheme: light; }
    body { max-width: 48rem; margin: 0 auto; padding: 2rem 1.25rem; color: #171717; font: 16px/1.65 Arial, sans-serif; }
    h1 { margin: 0 0 .35rem; font-size: 2rem; line-height: 1.2; }
    .effective-date { margin: 0 0 2rem; color: #555; font-size: .95rem; }
    h2 { margin: 2rem 0 .75rem; font-size: 1.35rem; line-height: 1.3; break-after: avoid; }
    h3 { margin: 1.5rem 0 .5rem; font-size: 1.1rem; line-height: 1.35; break-after: avoid; }
    p { margin: 0 0 .85rem; }
    ul { margin: 0 0 1rem; padding-left: 1.5rem; }
    li { margin: 0 0 .4rem; }
    @media print { body { max-width: none; padding: 0; } }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(document.title)}</h1>
    <p class="effective-date">${escapeHtml(document.effectiveDate)}</p>
    ${content}
  </main>
</body>
</html>`;
}

function DocumentSection({
  document,
  id,
  printTarget,
  onPrint,
  onSave,
}: {
  document: LegalDocument;
  id: string;
  printTarget: string | null;
  onPrint: (id: string, title: string) => void;
  onSave: (document: LegalDocument, id: string) => void;
}) {
  return (
    <article
      id={id}
      className="legal-document scroll-mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8"
      aria-labelledby={`${id}-heading`}
      data-testid={`legal-document-${id}`}
      data-printable-document={printTarget === id ? "true" : "false"}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id={`${id}-heading`}
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            {document.title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {document.effectiveDate}
          </p>
        </div>
        <div className="flex flex-wrap gap-2" data-print-ui>
          <button
            type="button"
            onClick={() => onPrint(id, document.title)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={`button-print-${id}`}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print
          </button>
          <button
            type="button"
            onClick={() => onSave(document, id)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={`button-save-${id}`}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Save copy
          </button>
        </div>
      </div>
      <div className="legal-document-print-content mt-6 space-y-4 break-words text-sm leading-7 text-card-foreground sm:text-base">
        {parseDocument(document.content).map((block) => {
          if (block.kind === "heading") {
            const Heading = block.level === 3 ? "h3" : "h4";
            return (
              <Heading
                key={block.key}
                className={
                  block.level === 3
                    ? "scroll-mt-6 pt-3 text-xl font-semibold"
                    : "scroll-mt-6 pt-2 text-lg font-medium"
                }
              >
                {block.text}
              </Heading>
            );
          }
          if (block.kind === "list") {
            return (
              <ul key={block.key} className="list-disc space-y-2 pl-6">
                {block.items.map((item, index) => (
                  <li key={`${block.key}-${index}`}>{item}</li>
                ))}
              </ul>
            );
          }
          return <p key={block.key}>{block.text}</p>;
        })}
      </div>
    </article>
  );
}

export default function LegalPage() {
  const [printTarget, setPrintTarget] = useState<string | null>(null);
  const previousTitle = useRef<string | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Legal | Lumina";
    const frame = window.requestAnimationFrame(() => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    const restoreAfterPrint = () => {
      if (previousTitle.current !== null) {
        document.title = previousTitle.current;
        previousTitle.current = null;
      }
      setPrintTarget(null);
    };
    window.addEventListener("afterprint", restoreAfterPrint);
    return () => window.removeEventListener("afterprint", restoreAfterPrint);
  }, []);

  const printDocument = (id: string, title: string) => {
    previousTitle.current = document.title;
    document.title = title;
    setPrintTarget(id);
    window.requestAnimationFrame(() => window.print());
  };

  const saveDocument = async (legalDocument: LegalDocument, id: string) => {
    const html = buildDocumentHtml(legalDocument);
    const file = new File([html], `lumina-${id}.html`, {
      type: "text/html;charset=utf-8",
    });
    const shareData: ShareData = { files: [file], title: legalDocument.title };

    if (
      typeof navigator.share === "function" &&
      navigator.canShare?.(shareData)
    ) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }

    const url = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" }),
    );
    const link = window.document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.style.display = "none";
    window.document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main
      className="legal-page min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-10"
      data-testid="legal-page"
      data-print-target={printTarget ?? undefined}
    >
      <div className="mx-auto max-w-4xl">
        <Link
          href="/auth"
          className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="link-legal-back"
          data-print-ui
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Lumina
        </Link>

        <header className="mb-6 mt-6" data-print-ui>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Legal
          </h1>
          <p className="mt-2 text-muted-foreground">
            Privacy Statement and User Agreement
          </p>
          <nav
            aria-label="Legal documents"
            className="mt-5 flex flex-wrap gap-3"
          >
            <a
              href="#privacy-statement"
              className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="link-privacy-statement"
            >
              Privacy Statement
            </a>
            <a
              href="#user-agreement"
              className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="link-user-agreement"
            >
              User Agreement
            </a>
          </nav>
        </header>

        <div className="space-y-6">
          <DocumentSection
            document={privacyStatement}
            id="privacy-statement"
            printTarget={printTarget}
            onPrint={printDocument}
            onSave={saveDocument}
          />
          <DocumentSection
            document={userAgreement}
            id="user-agreement"
            printTarget={printTarget}
            onPrint={printDocument}
            onSave={saveDocument}
          />
        </div>
      </div>
    </main>
  );
}
