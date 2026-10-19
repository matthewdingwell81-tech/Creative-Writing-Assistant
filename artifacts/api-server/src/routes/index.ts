import { Router, type IRouter } from "express";
import healthRouter from "./health";
import luminaRouter from "./lumina";
import storageRouter from "./storage";
import planningRouter from "./planning";
import billingRouter from "./billing";
import moderationRouter from "./moderation";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", moderationRouter);
router.use(billingRouter);
router.use(storageRouter);
router.use(planningRouter);
router.use(luminaRouter);

export default router;
