import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertDocumentSchema, insertIdeaSchema } from "@shared/schema";
import OpenAI from "openai";
import {
  getUncachableGoogleDocsClient,
  googleDocsToHtml,
  htmlToGoogleDocsRequests,
} from "./googleDocs";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === Document CRUD ===

  app.get("/api/documents", async (_req, res) => {
    const docs = await storage.getDocuments();
    res.json(docs);
  });

  app.get("/api/documents/:id", async (req, res) => {
    const doc = await storage.getDocument(parseInt(req.params.id));
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  });

  app.post("/api/documents", async (req, res) => {
    const parsed = insertDocumentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const doc = await storage.createDocument(parsed.data);
    res.status(201).json(doc);
  });

  app.patch("/api/documents/:id", async (req, res) => {
    const parsed = insertDocumentSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const doc = await storage.updateDocument(parseInt(req.params.id), parsed.data);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  });

  app.delete("/api/documents/:id", async (req, res) => {
    await storage.deleteDocument(parseInt(req.params.id));
    res.status(204).send();
  });

  // === AI Suggestions (streaming) ===

  app.post("/api/suggestions", async (req, res) => {
    const { text, documentType = "fiction" } = req.body;
    if (!text || text.trim().length < 10) {
      return res.json({ suggestions: [] });
    }

    const systemPrompt = `You are a writing assistant analyzing text in real-time. The user is writing a ${documentType} document.

Analyze the provided text and return a JSON array of suggestions. Each suggestion should have:
- "type": one of "grammar", "vocabulary", "style", "pacing", "story", "tone"
- "severity": one of "info", "warning", "error"
- "title": a short title (3-6 words)
- "description": a 1-2 sentence explanation of the issue or opportunity
- "original": the exact text fragment being referenced (if applicable, otherwise null)
- "alternatives": an array of replacement strings (1-3 options, if applicable, otherwise empty array)

CRITICAL RULES for the "original" field:
- Each suggestion MUST target exactly ONE contiguous word or short phrase (1-6 words) from the text.
- The "original" field MUST be an EXACT copy of the text as it appears in the document — do NOT combine multiple errors with semicolons, ellipses, or any separator.
- If there are multiple spelling errors, return a SEPARATE suggestion object for EACH individual misspelled word.
- Never use null for "original" when there is a specific word or phrase to reference.

Focus on:
1. Grammar and spelling corrections (one suggestion per individual misspelled word)
2. Vocabulary enhancements (thesaurus-style suggestions for overused or weak words)
3. Style improvements (sentence structure, flow, readability)
4. For fiction: pacing alerts, tone consistency, story arc suggestions, chapter structure advice
5. Positive reinforcement for things done well

Return 4-8 suggestions maximum. Be specific and actionable. Return ONLY valid JSON array, no markdown.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        max_completion_tokens: 8192,
      });

      const content = response.choices[0]?.message?.content || "[]";
      let suggestions;
      try {
        suggestions = JSON.parse(content);
      } catch {
        const match = content.match(/\[[\s\S]*\]/);
        suggestions = match ? JSON.parse(match[0]) : [];
      }

      res.json({ suggestions });
    } catch (error: any) {
      console.error("AI suggestion error:", error?.message);
      res.status(500).json({ error: "Failed to generate suggestions" });
    }
  });

  // === AI Ideas (streaming) ===

  app.post("/api/ideas", async (req, res) => {
    const { text, prompt: userPrompt, documentType = "fiction" } = req.body;

    const systemPrompt = `You are a creative writing assistant helping with a ${documentType} document. The user will provide their current text and a specific request. Respond helpfully and creatively. Keep responses concise (2-4 paragraphs max).`;

    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Here is my current text:\n\n${text || "(empty document)"}\n\nMy request: ${userPrompt}` },
        ],
        stream: true,
        max_completion_tokens: 8192,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("AI ideas error:", error?.message);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to generate ideas" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to generate ideas" });
      }
    }
  });

  // === Ideas Scratchpad CRUD ===

  app.get("/api/documents/:docId/ideas", async (req, res) => {
    const docId = parseInt(req.params.docId);
    if (isNaN(docId)) return res.status(400).json({ error: "Invalid document ID" });
    const ideasList = await storage.getIdeasByDocument(docId);
    res.json(ideasList);
  });

  app.post("/api/documents/:docId/ideas", async (req, res) => {
    const docId = parseInt(req.params.docId);
    if (isNaN(docId)) return res.status(400).json({ error: "Invalid document ID" });
    const doc = await storage.getDocument(docId);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    const parsed = insertIdeaSchema.safeParse({ ...req.body, documentId: docId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const idea = await storage.createIdea(parsed.data);
    res.status(201).json(idea);
  });

  app.delete("/api/ideas/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid idea ID" });
    await storage.deleteIdea(id);
    res.status(204).send();
  });

  // === Google Docs Integration ===

  app.post("/api/gdocs/import", async (req, res) => {
    const { documentId } = req.body;
    if (!documentId) return res.status(400).json({ error: "documentId is required" });

    try {
      const docs = await getUncachableGoogleDocsClient();
      const doc = await docs.documents.get({ documentId });

      const title = doc.data.title || "Imported Document";
      const content = googleDocsToHtml(doc.data);

      const created = await storage.createDocument({
        title,
        content,
        documentType: "fiction",
      });

      res.status(201).json(created);
    } catch (error: any) {
      console.error("Google Docs import error:", error?.message);
      res.status(500).json({ error: "Failed to import Google Doc" });
    }
  });

  app.post("/api/gdocs/export", async (req, res) => {
    const { documentId: luminaDocId, googleDocTitle } = req.body;
    if (!luminaDocId) return res.status(400).json({ error: "documentId is required" });

    try {
      const luminaDoc = await storage.getDocument(parseInt(luminaDocId));
      if (!luminaDoc) return res.status(404).json({ error: "Document not found" });

      const docs = await getUncachableGoogleDocsClient();
      const title = googleDocTitle || luminaDoc.title || "Exported from Lumina";

      const created = await docs.documents.create({
        requestBody: { title },
      });

      const newDocId = created.data.documentId;
      if (!newDocId) throw new Error("Failed to create Google Doc");

      const requests = htmlToGoogleDocsRequests(luminaDoc.content);
      if (requests.length > 0) {
        await docs.documents.batchUpdate({
          documentId: newDocId,
          requestBody: { requests },
        });
      }

      res.json({
        googleDocId: newDocId,
        url: `https://docs.google.com/document/d/${newDocId}/edit`,
      });
    } catch (error: any) {
      console.error("Google Docs export error:", error?.message);
      res.status(500).json({ error: "Failed to export to Google Docs" });
    }
  });

  return httpServer;
}
