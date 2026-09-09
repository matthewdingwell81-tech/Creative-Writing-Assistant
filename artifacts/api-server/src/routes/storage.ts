import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objects = new ObjectStorageService();
const uploadSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(10 * 1024 * 1024),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
});

router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a JPG, PNG, WebP, or GIF image under 10 MB." });
    return;
  }
  try {
    const upload = await objects.createImageUpload();
    await storage.createResearchUpload({
      objectPath: upload.objectPath,
      userId: req.session.userId,
      originalName: parsed.data.name,
      mimeType: parsed.data.contentType,
      size: parsed.data.size,
    });
    res.json({ ...upload, metadata: parsed.data });
  } catch (error) {
    req.log.error({ err: error }, "Failed to create research image upload");
    res.status(500).json({ error: "Could not prepare the image upload." });
  }
});

router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const raw = req.params.path;
  const objectPath = `/objects/${Array.isArray(raw) ? raw.join("/") : raw}`;
  if (!(await storage.getResearchByObjectPath(objectPath, req.session.userId))) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  try {
    await objects.pipeObject(await objects.getObjectFile(objectPath), res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Image not found" });
      return;
    }
    req.log.error({ err: error }, "Failed to serve research image");
    res.status(500).json({ error: "Could not load the image." });
  }
});

export default router;