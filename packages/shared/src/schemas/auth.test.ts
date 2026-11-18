import { describe, expect, it } from "vitest";
import { profileSchema, resetPasswordSchema, signUpSchema } from "./auth.js";

describe("authentication schemas", () => {
  it("trims display names and email addresses", () => {
    const result = signUpSchema.safeParse({
      displayName: "  Alex Student  ",
      email: "  alex@example.edu  ",
      password: "correct-horse",
      confirmPassword: "correct-horse",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe("Alex Student");
      expect(result.data.email).toBe("alex@example.edu");
    }
  });

  it("rejects mismatched registration passwords", () => {
    expect(
      signUpSchema.safeParse({
        displayName: "Alex",
        email: "alex@example.edu",
        password: "correct-horse",
        confirmPassword: "different-horse",
      }).success,
    ).toBe(false);
  });

  it("rejects mismatched recovery passwords", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "correct-horse",
        confirmPassword: "different-horse",
      }).success,
    ).toBe(false);
  });

  it.each([
    ["UTC Z suffix", "2026-11-18T12:30:45Z"],
    ["UTC offset", "2026-11-18T12:30:45+00:00"],
    ["non-UTC offset", "2026-11-18T12:30:45-05:30"],
  ])("accepts profile timestamps with %s", (_description, timestamp) => {
    const result = profileSchema.safeParse({
      id: "72a5f91e-ea4e-4e16-a30f-231f65b469ce",
      display_name: "Alex Student",
      created_at: timestamp,
      updated_at: timestamp,
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid profile timestamps", () => {
    const result = profileSchema.safeParse({
      id: "72a5f91e-ea4e-4e16-a30f-231f65b469ce",
      display_name: "Alex Student",
      created_at: "2026-11-18T12:30:45",
      updated_at: "not-a-timestamp",
    });

    expect(result.success).toBe(false);
  });
});
