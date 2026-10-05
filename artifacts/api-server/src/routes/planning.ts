import { Router, type Request, type Response, type NextFunction } from "express";
import { planningInputSchema, planningKindSchema } from "@workspace/db";
import { z } from "zod";
import { PlanningError, listPlanning, savePlanning, removePlanning, orderPlanning } from "../planningStorage";

const router = Router();
const base = "/documents/:documentId/planning";
const idSchema = z.coerce.number().int().positive().max(2147483647);

router.use(base, (req: Request, res: Response, next: NextFunction) => {
  if (!req.session.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!idSchema.safeParse(req.params.documentId).success) { res.status(400).json({ error: "Invalid story ID." }); return; }
  next();
});

async function respond(res: Response, work: () => Promise<unknown>, status = 200) {
  try {
    const result = await work();
    if (status === 204) res.status(204).send();
    else res.status(status).json(result);
  } catch (error) {
    if (error instanceof PlanningError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
}

router.get(base, async (req, res): Promise<void> => {
  await respond(res, () => listPlanning(Number(req.params.documentId), req.session.userId!));
});
router.post(base, async (req, res): Promise<void> => {
  const parsed = planningInputSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid planning entry." }); return; }
  await respond(res, () => savePlanning(Number(req.params.documentId), req.session.userId!, parsed.data), 201);
});
router.patch(`${base}/order`, async (req, res): Promise<void> => {
  const parsed = z.object({
    kind: planningKindSchema, ids: z.array(z.number().int().positive()).max(10000),
  }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid planning order." }); return; }
  await respond(res, () => orderPlanning(Number(req.params.documentId), req.session.userId!, parsed.data.kind, parsed.data.ids));
});
router.patch(`${base}/:id`, async (req, res): Promise<void> => {
  const id = idSchema.safeParse(req.params.id);
  const parsed = planningInputSchema.partial().safeParse(req.body);
  if (!id.success || !parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Invalid planning entry." }); return;
  }
  await respond(res, () => savePlanning(Number(req.params.documentId), req.session.userId!, parsed.data, id.data));
});
router.delete(`${base}/:id`, async (req, res): Promise<void> => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid planning ID." }); return; }
  await respond(res, () => removePlanning(Number(req.params.documentId), req.session.userId!, id.data), 204);
});

export default router;
