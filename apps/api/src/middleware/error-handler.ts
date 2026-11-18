import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 600
      ? error.status
      : 500;

  if (status === 500) {
    console.error(error);
  }

  response.status(status).json({
    error: status === 500 ? "Internal server error" : "Request failed",
  });
};
