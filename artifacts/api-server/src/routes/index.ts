import { Router, type IRouter } from "express";
import healthRouter from "./health";
import luminaRouter from "./lumina";
import storageRouter from "./storage";
import planningRouter from "./planning";
import billingRouter from "./billing";
import { createModerationRouter } from "./moderation";
import { moderationRepository } from "../moderationStorage";
import { storage } from "../storage";
import { createTutorialPreferencesRouter } from "./tutorial-preferences";
import { createAccountDeletionRouter } from "./account-deletion";
import { deleteFirebaseIdentity } from "../lib/subscriptionFirebase";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const accountObjects = new ObjectStorageService();

router.use(healthRouter);
router.use("/admin", createModerationRouter(moderationRepository));
router.use(createTutorialPreferencesRouter(storage));
router.use(createAccountDeletionRouter(storage, {
  deleteObject: path => accountObjects.deleteObject(path),
  deleteFirebaseIdentity,
}));
router.use(billingRouter);
router.use(storageRouter);
router.use(planningRouter);
router.use(luminaRouter);

export default router;
