import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { privacyStatement, userAgreement, type LegalDocument } from "@/content/legalDocuments";

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
      else blocks.push({ kind: "list", items: [text.slice(2)], key: `list-${index}` });
    } else {
      blocks.push({ kind: "paragraph", text, key: `paragraph-${index}` });
    }
  }
  return blocks;
}

function DocumentSection({
  document,
  id,
}: {
  document: LegalDocument;
  id: string;
}) {
  return (
    <article
      id={id}
      className="scroll-mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8"
      aria-labelledby={`${id}-heading`}
      data-testid={`legal-document-${id}`}
    >
      <h2 id={`${id}-heading`} className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {document.title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{document.effectiveDate}</p>
      <div className="mt-6 space-y-4 break-words text-sm leading-7 text-card-foreground sm:text-base">
        {parseDocument(document.content).map((block) => {
          if (block.kind === "heading") {
            const Heading = block.level === 3 ? "h3" : "h4";
            return (
              <Heading
                key={block.key}
                className={block.level === 3
                  ? "scroll-mt-6 pt-3 text-xl font-semibold"
                  : "scroll-mt-6 pt-2 text-lg font-medium"}
              >
                {block.text}
              </Heading>
            );
          }
          if (block.kind === "list") {
            return (
              <ul key={block.key} className="list-disc space-y-2 pl-6">
                {block.items.map((item, index) => <li key={`${block.key}-${index}`}>{item}</li>)}
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

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-10" data-testid="legal-page">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/auth"
          className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="link-legal-back"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Lumina
        </Link>

        <header className="mb-6 mt-6">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Legal</h1>
          <p className="mt-2 text-muted-foreground">Privacy Statement and User Agreement</p>
          <nav aria-label="Legal documents" className="mt-5 flex flex-wrap gap-3">
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
          <DocumentSection document={privacyStatement} id="privacy-statement" />
          <DocumentSection document={userAgreement} id="user-agreement" />
        </div>
      </div>
    </main>
  );
}
