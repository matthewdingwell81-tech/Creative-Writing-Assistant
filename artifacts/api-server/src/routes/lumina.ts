import { Router, type Request, type Response, type NextFunction } from "express";
import { storage } from "../storage";
import {
  insertDocumentSchema,
  insertIdeaSchema,
  insertUserSchema,
  insertChapterSchema,
} from "@workspace/db";
import { z } from "zod";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import {
  getUncachableGoogleDocsClient,
  googleDocsToHtml,
  htmlToGoogleDocsRequests,
} from "../googleDocs";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

const router = Router();

// === Auth Routes ===

router.post("/auth/register", async (req: Request, res: Response) => {
  const parsed = insertUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { username, password } = parsed.data;
  const existing = await storage.getUserByUsername(username);
  if (existing) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await storage.createUser({ username, password: hashedPassword });

  req.session.userId = user.id;
  res.status(201).json({ id: user.id, username: user.username });
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const parsed = insertUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { username, password } = parsed.data;
  const user = await storage.getUserByUsername(username);
  if (!user) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  req.session.userId = user.id;
  res.json({ id: user.id, username: user.username });
});

router.post("/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/auth/me", async (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = await storage.getUserById(req.session.userId);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ id: user.id, username: user.username });
});

// === Document CRUD ===

router.get("/documents", requireAuth, async (req: Request, res: Response) => {
  const docs = await storage.getDocuments(req.session.userId!);
  res.json(docs);
});

router.get("/documents/:id", requireAuth, async (req: Request, res: Response) => {
  const doc = await storage.getDocument(parseInt(req.params.id as string), req.session.userId!);
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(doc);
});

router.post("/documents", requireAuth, async (req: Request, res: Response) => {
  const parsed = insertDocumentSchema.safeParse({ ...req.body, userId: req.session.userId });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const doc = await storage.createDocument(parsed.data);
  res.status(201).json(doc);
});

router.patch("/documents/:id", requireAuth, async (req: Request, res: Response) => {
  const parsed = insertDocumentSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const doc = await storage.updateDocument(parseInt(req.params.id as string), req.session.userId!, parsed.data);
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(doc);
});

router.delete("/documents/:id", requireAuth, async (req: Request, res: Response) => {
  await storage.deleteDocument(parseInt(req.params.id as string), req.session.userId!);
  res.status(204).send();
});

// === AI Suggestions ===

router.post("/suggestions", requireAuth, async (req: Request, res: Response) => {
  const { text, documentType = "fiction" } = req.body;
  if (!text || text.trim().length < 10) {
    res.json({ suggestions: [] });
    return;
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
- The "original" field MUST be an EXACT copy of the text as it appears in the document.
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
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      max_tokens: 2048,
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
    req.log.error({ err: error }, "AI suggestion error");
    res.status(500).json({ error: "Failed to generate suggestions" });
  }
});

// === AI Ideas (streaming) ===

router.post("/ideas", requireAuth, async (req: Request, res: Response) => {
  const { text, prompt: userPrompt, documentType = "fiction" } = req.body;

  const systemPrompt = `You are a creative writing assistant helping with a ${documentType} document. The user will provide their current text and a specific request. Respond helpfully and creatively. Keep responses concise (2-4 paragraphs max).`;

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Here is my current text:\n\n${text || "(empty document)"}\n\nMy request: ${userPrompt}` },
      ],
      stream: true,
      max_tokens: 1024,
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
    req.log.error({ err: error }, "AI ideas error");
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: "Failed to generate ideas" })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: "Failed to generate ideas" });
    }
  }
});

// === Ideas Scratchpad CRUD ===

router.get("/documents/:docId/ideas", requireAuth, async (req: Request, res: Response) => {
  const docId = parseInt(req.params.docId as string);
  if (isNaN(docId)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }
  const ideasList = await storage.getIdeasByDocument(docId);
  res.json(ideasList);
});

router.post("/documents/:docId/ideas", requireAuth, async (req: Request, res: Response) => {
  const docId = parseInt(req.params.docId as string);
  if (isNaN(docId)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }
  const doc = await storage.getDocument(docId, req.session.userId!);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const parsed = insertIdeaSchema.safeParse({ ...req.body, documentId: docId });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const idea = await storage.createIdea(parsed.data);
  res.status(201).json(idea);
});

router.delete("/ideas/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid idea ID" });
    return;
  }
  await storage.deleteIdea(id);
  res.status(204).send();
});

// === Chapters CRUD ===

router.get("/documents/:docId/chapters", requireAuth, async (req: Request, res: Response) => {
  const docId = parseInt(req.params.docId as string);
  if (isNaN(docId)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }
  const doc = await storage.getDocument(docId, req.session.userId!);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const chapterList = await storage.getChapters(docId);
  res.json(chapterList);
});

router.post("/documents/:docId/chapters", requireAuth, async (req: Request, res: Response) => {
  const docId = parseInt(req.params.docId as string);
  if (isNaN(docId)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }
  const doc = await storage.getDocument(docId, req.session.userId!);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const parsed = insertChapterSchema.safeParse({ ...req.body, documentId: docId });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const chapter = await storage.createChapter(parsed.data);
  res.status(201).json(chapter);
});

const chapterUpdateSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  position: z.number().int().optional(),
});

router.patch("/chapters/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid chapter ID" });
    return;
  }
  const existing = await storage.getChapter(id);
  if (!existing) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }
  const doc = await storage.getDocument(existing.documentId, req.session.userId!);
  if (!doc) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = chapterUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const chapter = await storage.updateChapter(id, parsed.data);
  if (!chapter) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }
  res.json(chapter);
});

router.delete("/chapters/:id", requireAuth, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid chapter ID" });
    return;
  }
  const existing = await storage.getChapter(id);
  if (!existing) {
    res.status(404).json({ error: "Chapter not found" });
    return;
  }
  const doc = await storage.getDocument(existing.documentId, req.session.userId!);
  if (!doc) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await storage.deleteChapter(id);
  res.status(204).send();
});

// === AI Writing Coach (streaming) ===

router.post("/coach", requireAuth, async (req: Request, res: Response) => {
  const { messages, documentContent = "", documentType = "fiction" } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const docSnippet = documentContent
    ? `\n\nThe writer's current document (for context):\n\n${documentContent.slice(0, 2000)}${documentContent.length > 2000 ? "\n...(truncated)" : ""}`
    : "";

  const systemPrompt = `You are a Socratic writing coach helping a writer develop and organize their ideas for a ${documentType} piece.

Your role:
- Ask probing follow-up questions when ideas are vague — help the writer dig deeper rather than jumping straight to answers
- Give honest, constructive feedback when the writer shares plans, passages, or plot points
- Help spot gaps, inconsistencies, or underdeveloped areas in story concepts or arguments
- Suggest structure and organization when the writer is trying to sort out their thinking
- Be encouraging but direct — real growth comes from honest reflection
- Keep responses conversational and focused (2–3 paragraphs max unless a detailed outline is explicitly requested)
- Always end your response with a question that pushes the writer to think one step further${docSnippet}`;

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
      max_tokens: 1024,
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
    req.log.error({ err: error }, "AI coach error");
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: "Failed to connect to coach" })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: "Failed to connect to coach" });
    }
  }
});

// === Google Docs Integration ===

router.post("/gdocs/import", requireAuth, async (req: Request, res: Response) => {
  const { documentId } = req.body;
  if (!documentId) {
    res.status(400).json({ error: "documentId is required" });
    return;
  }

  try {
    const docs = await getUncachableGoogleDocsClient();
    const doc = await docs.documents.get({ documentId });

    const title = doc.data.title || "Imported Document";
    const content = googleDocsToHtml(doc.data);

    const created = await storage.createDocument({
      userId: req.session.userId!,
      title,
      content,
      documentType: "fiction",
    });

    res.status(201).json(created);
  } catch (error: any) {
    req.log.error({ err: error }, "Google Docs import error");
    res.status(500).json({ error: "Failed to import Google Doc" });
  }
});

router.post("/gdocs/export", requireAuth, async (req: Request, res: Response) => {
  const { documentId: luminaDocId, googleDocTitle } = req.body;
  if (!luminaDocId) {
    res.status(400).json({ error: "documentId is required" });
    return;
  }

  try {
    const luminaDoc = await storage.getDocument(parseInt(luminaDocId), req.session.userId!);
    if (!luminaDoc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const docs = await getUncachableGoogleDocsClient();
    const title = googleDocTitle || luminaDoc.title || "Exported from Lumina";

    const created = await docs.documents.create({ requestBody: { title } });
    const newDocId = created.data.documentId;
    if (!newDocId) throw new Error("Failed to create Google Doc");

    const requests = htmlToGoogleDocsRequests(luminaDoc.content);
    if (requests.length > 0) {
      await docs.documents.batchUpdate({ documentId: newDocId, requestBody: { requests } });
    }

    res.json({
      googleDocId: newDocId,
      url: `https://docs.google.com/document/d/${newDocId}/edit`,
    });
  } catch (error: any) {
    req.log.error({ err: error }, "Google Docs export error");
    res.status(500).json({ error: "Failed to export to Google Docs" });
  }
});

export default router;
