import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ridesRouter from "./rides";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ridesRouter);

export default router;
