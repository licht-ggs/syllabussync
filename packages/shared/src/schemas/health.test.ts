import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "./health.js";

describe("healthResponseSchema", () => {
  it("accepts the API health response shape", () => {
    expect(
      healthResponseSchema.safeParse({ status: "ok", service: "api" }).success,
    ).toBe(true);
  });

  it("rejects an invalid API status", () => {
    expect(
      healthResponseSchema.safeParse({
        status: "healthy",
        service: "api",
      }).success,
    ).toBe(false);
  });
});
