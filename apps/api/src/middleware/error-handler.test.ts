import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "./error-handler.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("errorHandler", () => {
  it("does not log raw error messages or attached request data", async () => {
    const privateDiagnostic = "test-only-private-provider-diagnostic";
    const app = express();
    app.get("/failure", (_request, _response, next) => {
      next(
        Object.assign(new Error(privateDiagnostic), {
          body: privateDiagnostic,
          accessToken: privateDiagnostic,
        }),
      );
    });
    app.use(errorHandler);

    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await request(app).get("/failure");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "Internal server error" });
    expect(logError).toHaveBeenCalledWith("Unhandled API error", {
      name: "Error",
    });
    expect(JSON.stringify(logError.mock.calls)).not.toContain(privateDiagnostic);
  });
});
