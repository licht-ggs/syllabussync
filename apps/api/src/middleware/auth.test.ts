import type { User } from "@supabase/supabase-js";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createAuthMiddleware } from "./auth.js";

const user: User = {
  id: "72a5f91e-ea4e-4e16-a30f-231f65b469ce",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
  email: "student@example.edu",
  email_confirmed_at: "2026-01-01T00:00:00Z",
};

function createTestApp(verifyToken: (token: string) => Promise<User | null>) {
  const app = express();

  app.get("/protected", createAuthMiddleware(verifyToken), (request, response) => {
    response.json({ userId: request.authUser?.id });
  });

  return app;
}

describe("createAuthMiddleware", () => {
  it("rejects a missing bearer token", async () => {
    const verifyToken = vi.fn(async () => user);
    const response = await request(createTestApp(verifyToken)).get("/protected");

    expect(response.status).toBe(401);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it("rejects invalid or expired tokens", async () => {
    const response = await request(createTestApp(async () => null))
      .get("/protected")
      .set("Authorization", "Bearer invalid");

    expect(response.status).toBe(401);
  });

  it("blocks unverified email-password users", async () => {
    const { email_confirmed_at: _confirmedAt, ...unverifiedUser } = user;
    const response = await request(createTestApp(async () => unverifiedUser))
      .get("/protected")
      .set("Authorization", "Bearer valid");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Email verification required" });
  });

  it("uses the verified Supabase user rather than a client-supplied ID", async () => {
    const response = await request(createTestApp(async () => user))
      .get("/protected?userId=attacker")
      .set("Authorization", "Bearer valid");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: user.id });
  });

  it("allows a verified Google user", async () => {
    const { email_confirmed_at: _confirmedAt, ...googleUserFields } = user;
    const googleUser: User = {
      ...googleUserFields,
      app_metadata: { provider: "google", providers: ["google"] },
    };
    const response = await request(createTestApp(async () => googleUser))
      .get("/protected")
      .set("Authorization", "Bearer valid");

    expect(response.status).toBe(200);
  });
});
