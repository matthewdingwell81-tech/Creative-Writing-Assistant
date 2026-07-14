import { queryClient } from "./queryClient";

export async function fetchDocuments() {
  const res = await fetch("/api/documents", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch documents");
  return res.json();
}

export async function fetchDocument(id: number) {
  const res = await fetch(`/api/documents/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch document");
  return res.json();
}

export async function createDocument(data: { title?: string; content?: string; documentType?: string }) {
  const res = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to create document");
  return res.json();
}

export async function updateDocument(id: number, data: { title?: string; content?: string; documentType?: string }) {
  const res = await fetch(`/api/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to update document");
  return res.json();
}

export async function deleteDocument(id: number) {
  const res = await fetch(`/api/documents/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete document");
}

export async function fetchSuggestions(text: string, documentType: string = "fiction", signal?: AbortSignal) {
  const res = await fetch("/api/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, documentType }),
    signal,
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch suggestions");
  return res.json();
}

export async function fetchIdeas(documentId: number) {
  const res = await fetch(`/api/documents/${documentId}/ideas`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch ideas");
  return res.json();
}

export async function createIdea(documentId: number, content: string) {
  const res = await fetch(`/api/documents/${documentId}/ideas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to create idea");
  return res.json();
}

export async function deleteIdea(id: number) {
  const res = await fetch(`/api/ideas/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete idea");
}

export async function fetchChapters(documentId: number) {
  const res = await fetch(`/api/documents/${documentId}/chapters`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch chapters");
  return res.json();
}

export async function createChapter(documentId: number, data: { title: string; content?: string; position?: number }) {
  const res = await fetch(`/api/documents/${documentId}/chapters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to create chapter");
  return res.json();
}

export async function updateChapter(id: number, data: { title?: string; content?: string; position?: number }) {
  const res = await fetch(`/api/chapters/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to update chapter");
  return res.json();
}

export async function deleteChapter(id: number) {
  const res = await fetch(`/api/chapters/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete chapter");
}

export async function streamCoach(
  messages: { role: string; content: string }[],
  documentContent: string,
  documentType: string,
  onChunk: (content: string) => void,
  onDone: () => void,
  signal?: AbortSignal
) {
  const res = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, documentContent, documentType }),
    signal,
    credentials: "include",
  });

  if (!res.ok) throw new Error("Failed to connect to coach");

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.content) onChunk(event.content);
          if (event.done) onDone();
        } catch {}
      }
    }
  } finally {
    reader.cancel();
  }
}

export async function streamIdeas(
  text: string,
  prompt: string,
  documentType: string,
  onChunk: (content: string) => void,
  onDone: () => void
) {
  const res = await fetch("/api/ideas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, prompt, documentType }),
    credentials: "include",
  });

  if (!res.ok) throw new Error("Failed to generate ideas");

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.content) onChunk(event.content);
        if (event.done) onDone();
      } catch {}
    }
  }
}
