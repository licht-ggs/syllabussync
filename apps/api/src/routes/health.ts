import { Router } from "express";
import { healthResponseSchema } from "@syllabussync/shared";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.json(healthResponseSchema.parse({ status: "ok", service: "api" }));
});
