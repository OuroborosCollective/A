import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fusionRouter from "./fusion";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fusionRouter);

export default router;
