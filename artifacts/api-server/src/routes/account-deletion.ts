import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";

export interface AccountDeletionRepository {
  getAccountDeletionData(userId: string): Promise<{ firebaseUid: string | null; objectPaths: string[] } | undefined>;
  deleteAccount(userId: string): Promise<boolean>;
}

export interface AccountDeletionServices {
  deleteObject(objectPath: string): Promise<void>;
  deleteFirebaseIdentity(uid: string): Promise<void>;
}

function requireAccount(req: Request, res: Response, next: NextFunction): void {
  res.set("Cache-Control", "no-store");
  if (!req.session.userId) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  next();
}

function rejectCrossOriginWrite(req: Request, res: Response): boolean {
  const origin = req.get("origin");
  if (!origin) return false;
  try {
    if (new URL(origin).host === req.get("host")) return false;
  } catch {
    // Reject malformed origins below.
  }
  res.status(403).json({ error: "Account deletion must be requested from this app." });
  return true;
}

export function createAccountDeletionRouter(
  repository: AccountDeletionRepository,
  services: AccountDeletionServices,
): IRouter {
  const router = Router();

  router.delete("/account", requireAccount, async (req, res): Promise<void> => {
    if (rejectCrossOriginWrite(req, res)) return;
    const parsed = z.object({ confirmation: z.literal("DELETE") }).strict().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Type DELETE to confirm permanent account removal." });
      return;
    }

    const userId = req.session.userId!;
    try {
      const account = await repository.getAccountDeletionData(userId);
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      // Remove uploaded content before cascading its metadata from PostgreSQL.
      // Object deletion is idempotent, so the user can safely retry a partial failure.
      for (const objectPath of account.objectPaths) {
        await services.deleteObject(objectPath);
      }
      if (account.firebaseUid) {
        await services.deleteFirebaseIdentity(account.firebaseUid);
      }
      if (!(await repository.deleteAccount(userId))) {
        res.status(404).json({ error: "Account not found." });
        return;
      }

      await new Promise<void>((resolve, reject) => {
        req.session.destroy(error => error ? reject(error) : resolve());
      });
      res.clearCookie("connect.sid", { path: "/" });
      res.status(204).send();
    } catch (error) {
      req.log?.error({ err: error }, "Account deletion could not be completed");
      res.status(503).json({
        error: "We couldn’t finish deleting your account. Some data may still be present; please retry.",
      });
    }
  });

  return router;
}
