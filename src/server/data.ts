import { join } from "node:path";
import { createPlanRepository } from "./plans";

/** Plans and reviews live in ./data unless DATA_DIR says otherwise. */
export const plans = createPlanRepository(process.env.DATA_DIR ?? join(process.cwd(), "data"));
