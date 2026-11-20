import express from "express";
import helmet from "helmet";
import { errorHandler } from "./middleware/error-handler.js";
import { academicRouter } from "./routes/academic.js";
import { healthRouter } from "./routes/health.js";
import { profileRouter } from "./routes/profile.js";
import { taskRouter } from "./routes/tasks.js";
import { documentRouter } from "./routes/documents.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use("/api/health", healthRouter);
app.use("/api/academic", academicRouter);
app.use("/api/profile", profileRouter);
app.use("/api/tasks", taskRouter);
app.use(
  "/api/documents",
  express.raw({ type: "application/pdf", limit: "20mb" }),
  documentRouter,
);
app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});
app.use(errorHandler);
