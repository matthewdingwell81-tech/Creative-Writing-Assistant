import { Router, type IRouter } from "express";
import healthRouter from "./health";
import luminaRouter from "./lumina";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(luminaRouter);

export default router;
