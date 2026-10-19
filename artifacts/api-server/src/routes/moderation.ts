import { Router, type Request, type Response, type NextFunction } from "express";
import { isDeveloperUid } from "../lib/developerAccess";
import { ReviewSafetyFlagBody, ListSafetyFlagsQueryParams } from "@workspace/api-zod";

export interface ModerationRepository {
  getUserById(id: string): Promise<{ firebaseUid: string | null } | undefined>;
  listFlags(status: string): Promise<unknown[]>;
  reviewFlag(id: number, decision: string, note: string | null, reviewerId: string): Promise<unknown | undefined>;
}

export function createModerationRouter(repository: ModerationRepository) {
const router = Router();

async function requireDeveloper(req: Request, res: Response, next: NextFunction) {
  res.set("Cache-Control", "no-store");
  // The rest of the app permits cross-origin requests. Administrative writing
  // must not be readable or mutable from an unrelated website with cookies.
  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) {
        res.status(403).json({ error: "Administrator requests must come from this app." });
        return;
      }
    } catch {
      res.status(403).json({ error: "Invalid request origin." });
      return;
    }
  }
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const user = await repository.getUserById(userId);
    if (!user || !isDeveloperUid(user.firebaseUid)) {
      res.status(403).json({ error: "Administrator access required." });
      return;
    }
    next();
  } catch {
    res.status(503).json({ error: "Could not verify administrator access." });
  }
}

router.get("/safety-flags", requireDeveloper, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "open";
  if (!ListSafetyFlagsQueryParams.safeParse({ status }).success) {
    res.status(400).json({ error: "Invalid flag status." });
    return;
  }
  try {
    res.json({ flags: await repository.listFlags(status) });
  } catch {
    res.status(503).json({ error: "Safety flags could not be loaded. Please retry." });
  }
});

router.post("/safety-flags/:id/review", requireDeveloper, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = ReviewSafetyFlagBody.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || !parsed.success) {
    res.status(400).json({ error: "Invalid review decision." });
    return;
  }
  const { decision, note } = parsed.data;
  let updated;
  try {
    updated = await repository.reviewFlag(id, decision,
      typeof note === "string" && note.trim() ? note.trim() : null, req.session.userId!);
  } catch {
    res.status(503).json({ error: "The review could not be saved. Please retry." });
    return;
  }
  if (!updated) {
    res.status(409).json({ error: "This flag has already been reviewed or no longer exists." });
    return;
  }
  res.json(updated);
});

return router;
}
