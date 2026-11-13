import { z } from "zod";

export const diffLineSchema = z.number().int().positive().optional();
