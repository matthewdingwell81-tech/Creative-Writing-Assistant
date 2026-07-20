import { Router, type IRouter } from "express";
import healthRouter from "./health";
import luminaRouter from "./lumina";

const router: IRouter = Router();

router.use(healthRouter);
router.use(luminaRouter);

export default router;
