import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSuggestions,
  streamIdeas,
  WritingRequestBlockedError,
  WritingSafetyUnavailableError,
  AI_FLAGGED_EVENT,
} from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("writing safety API errors", () => {
  it("returns flagged suggestions and emits a review notice without throwing", async () => {
    const notice = vi.fn();
    window.addEventListener(AI_FLAGGED_EVENT, notice);
    try {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
        suggestions: [{ title: "Writing feedback" }], flagged: true, notice: "Flagged for administrator review.",
      }))));
      const result = await fetchSuggestions("A sufficiently long document.");
      expect(result.suggestions[0].title).toBe("Writing feedback");
      expect(notice).toHaveBeenCalledOnce();
    } finally { window.removeEventListener(AI_FLAGGED_EVENT, notice); }
  });

  it("Ideas continues to completion when flagged", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      'data: {"flagged":true,"notice":"Flagged for administrator review."}\n\n' +
      'data: {"content":"Writing feedback."}\n\ndata: {"done":true}\n\n',
    )));
    const onChunk = vi.fn(), onDone = vi.fn();
    await streamIdeas("fiction text", "write a scene", "fiction", onChunk, onDone);
    expect(onChunk).toHaveBeenCalledWith("Writing feedback.");
    expect(onDone).toHaveBeenCalledOnce();
  });
  it("passes the suggestions refusal message to the caller", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Lumina can’t help with that request. Keep it within the User Agreement.",
      code: "AI_REQUEST_BLOCKED",
    }), { status: 403, headers: { "Content-Type": "application/json" } })));

    const error = await fetchSuggestions("A sufficiently long document.").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WritingRequestBlockedError);
    expect(error).toHaveProperty("message", expect.stringContaining("Keep it within the User Agreement."));
  });

  it("passes the safety outage message to the suggestions caller", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "Safety checks are temporarily unavailable. Your prompt was kept.",
      code: "AI_SAFETY_UNAVAILABLE",
    }), { status: 503, headers: { "Content-Type": "application/json" } })));

    const error = await fetchSuggestions("A sufficiently long document.").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WritingSafetyUnavailableError);
    expect(error).toHaveProperty("message", expect.stringContaining("Your prompt was kept."));
  });

  it("surfaces Ideas refusals and safety outages from the event stream", async () => {
    for (const [code, expectedError] of [
      ["AI_REQUEST_BLOCKED", WritingRequestBlockedError],
      ["AI_SAFETY_UNAVAILABLE", WritingSafetyUnavailableError],
    ] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
        `data: ${JSON.stringify({
          ...(code === "AI_REQUEST_BLOCKED"
            ? { blocked: true, message: "Lumina blocked this request." }
            : { error: "Safety service is temporarily unavailable." }),
          code,
        })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      )));

      await expect(streamIdeas("fiction text", "write a scene", "fiction", vi.fn(), vi.fn()))
        .rejects.toBeInstanceOf(expectedError);
    }
  });

  it("streams only the vetted Ideas reply and completion event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      'data: {"content":"Safe fictional idea."}\n\ndata: {"done":true}\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    )));
    const chunks: string[] = [];
    const onDone = vi.fn();

    await streamIdeas("fiction text", "write a scene", "fiction", chunk => chunks.push(chunk), onDone);

    expect(chunks).toEqual(["Safe fictional idea."]);
    expect(onDone).toHaveBeenCalledOnce();
  });
});
