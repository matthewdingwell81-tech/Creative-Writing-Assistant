import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  GetTutorialPreferencesResponse,
  UpdateTutorialPreferencesBody,
  UpdateTutorialPreferencesResponse,
} from "@workspace/api-zod";

export interface TutorialPreferenceRepository {
  getTutorialsEnabled(userId: string): Promise<boolean | undefined>;
  updateTutorialsEnabled(userId: string, enabled: boolean): Promise<boolean | undefined>;
}

function rejectCrossOriginWrite(req: Request, res: Response): boolean {
  const origin = req.get("origin");
  if (!origin) return false;
  try {
    if (new URL(origin).host === req.get("host")) return false;
  } catch {
    // Reject malformed origins below.
  }
  res.status(403).json({ error: "Tutorial preferences must be changed from this app." });
  return true;
}

export function createTutorialPreferencesRouter(repository: TutorialPreferenceRepository): IRouter {
  const router = Router();
  const requireAccount = (req: Request, res: Response, next: NextFunction): void => {
    res.set("Cache-Control", "no-store");
    if (!req.session.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };

  router.get("/tutorial-preferences", requireAccount, async (req, res): Promise<void> => {
    try {
      const enabled = await repository.getTutorialsEnabled(req.session.userId!);
      if (enabled === undefined) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      res.json(GetTutorialPreferencesResponse.parse({ enabled }));
    } catch {
      res.status(503).json({ error: "Tutorial preferences could not be loaded. Please retry." });
    }
  });

  router.patch("/tutorial-preferences", requireAccount, async (req, res): Promise<void> => {
    if (rejectCrossOriginWrite(req, res)) return;
    const parsed = UpdateTutorialPreferencesBody.strict().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid tutorial preference." });
      return;
    }
    try {
      const enabled = await repository.updateTutorialsEnabled(req.session.userId!, parsed.data.enabled);
      if (enabled === undefined) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      res.json(UpdateTutorialPreferencesResponse.parse({ enabled }));
    } catch {
      res.status(503).json({ error: "Tutorial preferences could not be saved. Please retry." });
    }
  });

  return router;
}
