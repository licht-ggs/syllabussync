import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("API", () => {
  it("reports API process health without claiming database health", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "api" });
  });

  it("returns a JSON 404 for an unknown route", async () => {
    const response = await request(app).get("/api/unknown");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Not found" });
  });

  it("handles malformed JSON with a client error response", async () => {
    const response = await request(app)
      .post("/api/unknown")
      .set("Content-Type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Request failed" });
  });
});
