import { Router, type Request } from "express";
import { GetAuthMeResponse, CreateFirebaseSessionResponse } from "@workspace/api-zod";
import { verifyFirebaseIdToken } from "../lib/firebaseAuth";
import { authUserData, resolveFirebaseAccount, FirebaseAccountConflictError, type AuthRepository } from "../lib/firebaseSession";

async function bindSession(req: Request, id: string) {
  if (req.session.userId !== id) {
    await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  }
  req.session.userId = id;
  await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
}

/** Dependency injection is for isolated tests; production uses Google's Firebase keys. */
export function createFirebaseSessionRouter(repository: AuthRepository, verifyToken = verifyFirebaseIdToken) {
  const router = Router();
  router.post("/auth/firebase-session", async (req, res) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get("authorization") ?? "");
    if (!match) { res.status(401).json({ error: "Firebase ID token required" }); return; }
    let identity;
    try { identity = await verifyToken(match[1]); }
    catch { res.status(401).json({ error: "Invalid or expired Firebase sign-in" }); return; }
    try {
      const user = await resolveFirebaseAccount(identity, repository);
      await bindSession(req, user.id);
      res.set("Cache-Control", "no-store").json(CreateFirebaseSessionResponse.parse(authUserData(user, identity)));
    } catch (error) {
      if (error instanceof FirebaseAccountConflictError) {
        res.status(403).json({ error: "This account is linked to a different Firebase identity. Sign in with the original account." });
        return;
      }
      res.status(503).json({ error: "Could not restore your account. Please retry." });
    }
  });
  router.get("/auth/me", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const authorization = req.get("authorization");
    if (authorization !== undefined) {
      const match = /^Bearer ([^\s]+)$/i.exec(authorization);
      if (!match) { res.status(401).json({ error: "Firebase ID token required" }); return; }
      let identity;
      try { identity = await verifyToken(match[1]); }
      catch { res.status(401).json({ error: "Invalid or expired Firebase sign-in" }); return; }
      try {
        const existing = req.session.userId ? await repository.getUserById(req.session.userId) : undefined;
        // Reloading a password session must not attach an unrelated Google
        // identity left in Firebase's browser storage. Explicit redirect sign-in
        // uses /firebase-session instead and intentionally changes identity.
        if (req.get("x-lumina-preserve-password-session") === "true" && existing &&
            !existing.firebaseUid && existing.username.toLowerCase() !== identity.email.toLowerCase()) {
          res.json(GetAuthMeResponse.parse(authUserData(existing)));
          return;
        }
        const user = await resolveFirebaseAccount(identity, repository);
        await bindSession(req, user.id);
        res.json(GetAuthMeResponse.parse(authUserData(user, identity)));
      } catch (error) {
        if (error instanceof FirebaseAccountConflictError) {
          res.status(403).json({ error: "This account is linked to a different Firebase identity. Sign in with the original account." });
          return;
        }
        res.status(503).json({ error: "Could not restore your account. Please retry." });
      }
      return;
    }
    const user = req.session.userId ? await repository.getUserById(req.session.userId) : undefined;
    if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
    res.json(GetAuthMeResponse.parse(authUserData(user)));
  });
  return router;
}
