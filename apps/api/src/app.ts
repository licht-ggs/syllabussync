import express from "express";
import helmet from "helmet";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use("/api/health", healthRouter);
app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});
app.use(errorHandler);
