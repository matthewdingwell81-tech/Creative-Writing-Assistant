import { Router, type Request, type Response, type NextFunction } from "express";
import { storage } from "../storage";
import {
  insertDocumentSchema,
  insertIdeaSchema,
  insertUserSchema,
  insertChapterSchema,
  insertResearchSchema,
} from "@workspace/db";
import { z } from "zod";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
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
const researchObjects = new ObjectStorageService();

// === Research Library ===
const researchUpdateSchema = insertResearchSchema.omit({ documentId: true }).partial();
function parseChapterIds(value: unknown): number[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map(Number))];
  return ids.every(Number.isInteger) ? ids : null;
}
async function verifyResearchUpload(objectPath: string, userId: string, existingResearchId?: number) {
  const upload = await storage.getResearchUpload(objectPath, userId);
  if (!upload || (upload.claimedResearchId !== null && upload.claimedResearchId !== existingResearchId)) return null;
  try {
    const metadata = await researchObjects.getObjectMetadata(objectPath);
    if (
      metadata.size <= 0 ||
      metadata.size > 10 * 1024 * 1024 ||
      metadata.size !== upload.size ||
      metadata.mimeType !== upload.mimeType ||
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(metadata.mimeType)
    ) return null;
    return metadata;
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return null;
    throw error;
  }
}
async function processPendingResearchObjectDeletions(userId: string, log: Request["log"]) {
  const paths = await storage.listResearchObjectDeletions(userId);
  await Promise.all(paths.map(async objectPath => {
    try {
      await researchObjects.deleteObject(objectPath);
      await storage.completeResearchObjectDeletion(objectPath, userId);
    } catch (error) {
      log.warn({ err: error, objectPath }, "Research object cleanup deferred");
    }
  }));
}
router.get("/documents/:docId/research", requireAuth, async (req, res) => {
  const docId = Number(req.params.docId);
  if (!Number.isInteger(docId) || !(await storage.getDocument(docId, req.session.userId!))) { res.status(404).json({ error: "Document not found" }); return; }
  await processPendingResearchObjectDeletions(req.session.userId!, req.log);
  const q = req.query;
  res.json(await storage.getResearch(docId, {
    keyword: typeof q.keyword === "string" ? q.keyword : undefined,
    tag: typeof q.tag === "string" ? q.tag : undefined,
    chapterId: typeof q.chapterId === "string" ? Number(q.chapterId) : undefined,
    scope: typeof q.scope === "string" ? q.scope : undefined,
  }));
});
router.post("/documents/:docId/research", requireAuth, async (req, res) => {
  const documentId = Number(req.params.docId);
  if (!(await storage.getDocument(documentId, req.session.userId!))) { res.status(404).json({ error: "Document not found" }); return; }
  const chapterIds = parseChapterIds(req.body.chapterIds);
  if (chapterIds === null) { res.status(400).json({ error: "Invalid chapter selection." }); return; }
  const { chapterIds: _chapterIds, ...body } = req.body;
  const parsed = insertResearchSchema.safeParse({ ...body, documentId });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if ((parsed.data.isGlobal && chapterIds.length > 0) || (!parsed.data.isGlobal && chapterIds.length === 0)) {
    res.status(400).json({ error: "Research must be global or attached to at least one chapter." });
    return;
  }
  if (parsed.data.type === "link" && !parsed.data.url) {
    res.status(400).json({ error: "A valid URL is required for link research." });
    return;
  }
  if (parsed.data.type === "image" && !parsed.data.objectPath?.startsWith("/objects/uploads/")) {
    res.status(400).json({ error: "An uploaded image is required for image research." });
    return;
  }
  if (parsed.data.type !== "image" && (parsed.data.objectPath || parsed.data.mimeType || parsed.data.size)) {
    res.status(400).json({ error: "Image upload fields are only valid for image research." });
    return;
  }
  if (parsed.data.type === "image") {
    const metadata = await verifyResearchUpload(parsed.data.objectPath!, req.session.userId!);
    if (!metadata) { res.status(400).json({ error: "The uploaded image is missing, invalid, or belongs to another user." }); return; }
    parsed.data.size = metadata.size;
    parsed.data.mimeType = metadata.mimeType;
  }
  try {
    const item = await storage.createResearchWithScope(parsed.data, chapterIds, req.session.userId!);
    if (!item) { res.status(400).json({ error: "One or more selected chapters are invalid." }); return; }
    res.status(201).json(item);
  } catch (error) {
    req.log.warn({ err: error }, "Research create conflict");
    res.status(409).json({ error: "That upload is no longer available." });
  }
});
router.get("/research/:id", requireAuth, async (req, res) => {
  const item = await storage.getResearchById(Number(req.params.id), req.session.userId!);
  if (!item) { res.status(404).json({ error: "Research not found" }); return; } res.json(item);
});
router.patch("/research/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await storage.getResearchById(id, req.session.userId!);
  if (!existing) { res.status(404).json({ error: "Research not found" }); return; }
  const requestedChapterIds = req.body.chapterIds === undefined ? undefined : parseChapterIds(req.body.chapterIds);
  if (requestedChapterIds === null) { res.status(400).json({ error: "Invalid chapter selection." }); return; }
  const { chapterIds: _chapterIds, ...body } = req.body;
  const parsed = researchUpdateSchema.safeParse(body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const isGlobal = parsed.data.isGlobal ?? existing.isGlobal;
  if (requestedChapterIds !== undefined && ((isGlobal && requestedChapterIds.length > 0) || (!isGlobal && requestedChapterIds.length === 0))) {
    res.status(400).json({ error: "Research must be global or attached to at least one chapter." });
    return;
  }
  if ((parsed.data.type ?? existing.type) === "link" && !(parsed.data.url ?? existing.url)) {
    res.status(400).json({ error: "A valid URL is required for link research." });
    return;
  }
  const effectiveType = parsed.data.type ?? existing.type;
  const effectiveObjectPath = parsed.data.objectPath === undefined ? existing.objectPath : parsed.data.objectPath;
  if (effectiveType === "image" && !effectiveObjectPath?.startsWith("/objects/uploads/")) {
    res.status(400).json({ error: "An uploaded image is required for image research." });
    return;
  }
  if (effectiveType === "image" && (existing.type !== "image" || effectiveObjectPath !== existing.objectPath)) {
    const metadata = await verifyResearchUpload(effectiveObjectPath!, req.session.userId!, id);
    if (!metadata) { res.status(400).json({ error: "The uploaded image is missing, invalid, or belongs to another user." }); return; }
    parsed.data.size = metadata.size;
    parsed.data.mimeType = metadata.mimeType;
  }
  if (effectiveType !== "image") {
    if (parsed.data.objectPath) {
      res.status(400).json({ error: "Image upload fields are only valid for image research." });
      return;
    }
    if (existing.objectPath) {
      parsed.data.objectPath = null;
      parsed.data.mimeType = null;
      parsed.data.size = null;
    }
  }
  const item = await storage.updateResearchWithScope(id, parsed.data, requestedChapterIds, req.session.userId!);
  if (!item) { res.status(400).json({ error: "One or more selected chapters are invalid." }); return; }
  await processPendingResearchObjectDeletions(req.session.userId!, req.log);
  res.json(item);
});
router.delete("/research/:id", requireAuth, async (req, res) => {
  const item = await storage.getResearchById(Number(req.params.id), req.session.userId!);
  if (!item) { res.status(404).json({ error: "Research not found" }); return; }
  await storage.deleteResearch(Number(req.params.id), req.session.userId!);
  await processPendingResearchObjectDeletions(req.session.userId!, req.log);
  res.status(204).send();
});
router.post("/research/:id/chapters/:chapterId", requireAuth, async (req, res) => {
  const ok = await storage.attachResearch(Number(req.params.id), Number(req.params.chapterId), req.session.userId!);
  if (!ok) { res.status(404).json({ error: "Research or chapter not found" }); return; } res.json({ ok: true });
});
router.delete("/research/:id/chapters/:chapterId", requireAuth, async (req, res) => {
  if (!(await storage.getResearchById(Number(req.params.id), req.session.userId!))) { res.status(404).json({ error: "Research not found" }); return; }
  await storage.detachResearch(Number(req.params.id), Number(req.params.chapterId), req.session.userId!); res.json({ ok: true });
});
router.post("/research/:id/attach", requireAuth, async (req, res) => {
  const chapterId = Number(req.body.chapterId);
  const ok = await storage.attachResearch(Number(req.params.id), chapterId, req.session.userId!);
  if (!ok) { res.status(404).json({ error: "Research or chapter not found" }); return; } res.json({ ok: true });
});
router.post("/research/:id/detach", requireAuth, async (req, res) => {
  const chapterId = Number(req.body.chapterId);
  if (!(await storage.getResearchById(Number(req.params.id), req.session.userId!))) { res.status(404).json({ error: "Research not found" }); return; }
  await storage.detachResearch(Number(req.params.id), chapterId, req.session.userId!); res.json({ ok: true });
});
router.get("/documents/:docId/chapters/:chapterId/research/related", requireAuth, async (req, res) => {
  const docId = Number(req.params.docId), chapterId = Number(req.params.chapterId);
  if (!(await storage.getDocument(docId, req.session.userId!))) { res.status(404).json({ error: "Document not found" }); return; }
  const chapter = await storage.getChapter(chapterId);
  if (!chapter || chapter.documentId !== docId) { res.status(404).json({ error: "Chapter not found" }); return; }
  const words = new Set(`${chapter.title} ${chapter.content}`.toLowerCase().replace(/<[^>]+>/g, " ").match(/[a-z0-9]{3,}/g) || []);
  const items = await storage.getResearch(docId);
  const ranked = items.map(item => {
    const hay = `${item.title} ${item.content} ${(item.tags || []).join(" ")}`.toLowerCase();
    const score = [...words].reduce((n, word) => n + (hay.includes(word) ? 1 : 0), 0) + (item.important ? 0.25 : 0) + (item.favorite ? 0.1 : 0);
    return { ...item, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.id - b.id);
  res.json(ranked);
});

function chapterSynopsis(content: string): string {
  const plainText = content
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

  const words = plainText.split(" ").filter(Boolean);
  if (words.length === 0) return "";
  const preview = words.slice(0, 50).join(" ");
  return words.length > 50 ? `${preview}…` : preview;
}

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

  // "Remember me" extends the session to 30 days (or SESSION_REMEMBER_ME_TTL_MS if set)
  if (req.body.rememberMe === true) {
    req.session.cookie.maxAge =
      parseInt(process.env.SESSION_REMEMBER_ME_TTL_MS || "") ||
      30 * 24 * 60 * 60 * 1000;
  }

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
  const documentId = parseInt(req.params.id as string);
  const document = await storage.getDocument(documentId, req.session.userId!);
  if (!document) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await storage.deleteDocument(documentId, req.session.userId!);
  await processPendingResearchObjectDeletions(req.session.userId!, req.log);
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
  const chaptersWithSynopses = await Promise.all(chapterList.map(async (chapter) => {
    if (chapter.synopsis || !chapter.content.trim()) return chapter;
    return await storage.updateChapter(chapter.id, {
      synopsis: chapterSynopsis(chapter.content),
    }) ?? chapter;
  }));
  res.json(chaptersWithSynopses);
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
  const parsed = insertChapterSchema.safeParse({
    ...req.body,
    documentId: docId,
    synopsis: chapterSynopsis(typeof req.body.content === "string" ? req.body.content : ""),
  });
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
  cardColor: z.enum(["lavender", "rose", "amber", "sage", "sky", "slate"]).optional(),
});

const chapterReorderSchema = z.object({
  chapterIds: z.array(z.number().int()).min(1),
});

router.patch("/documents/:docId/chapters/order", requireAuth, async (req: Request, res: Response) => {
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

  const parsed = chapterReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const currentChapters = await storage.getChapters(docId);
  const requestedIds = parsed.data.chapterIds;
  const currentIds = currentChapters.map((chapter) => chapter.id);
  const requestedIdSet = new Set(requestedIds);
  const currentIdSet = new Set(currentIds);
  const hasSameChapterIds =
    requestedIds.length === currentIds.length &&
    requestedIdSet.size === currentIdSet.size &&
    requestedIds.every((chapterId) => currentIdSet.has(chapterId));

  if (!hasSameChapterIds) {
    res.status(400).json({ error: "Chapter order must include each chapter exactly once" });
    return;
  }

  const reordered = await storage.reorderChapters(docId, requestedIds);
  res.json(reordered);
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
  const updates = parsed.data.content === undefined
    ? parsed.data
    : { ...parsed.data, synopsis: chapterSynopsis(parsed.data.content) };
  const chapter = await storage.updateChapter(id, updates);
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
  await storage.deleteChapter(id, req.session.userId!);
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
