import { describe, expect, it } from "vitest";
import { envSchema } from "./env.js";

describe("envSchema", () => {
  it("allows local API operation without Supabase configured", () => {
    expect(envSchema.safeParse({}).success).toBe(true);
    expect(
      envSchema.safeParse({
        SUPABASE_URL: "",
        SUPABASE_PUBLISHABLE_KEY: "",
      }).success,
    ).toBe(true);
  });

  it("requires Supabase URL and publishable key as a pair", () => {
    expect(
      envSchema.safeParse({ SUPABASE_URL: "https://example.supabase.co" }).success,
    ).toBe(false);
  });
});
