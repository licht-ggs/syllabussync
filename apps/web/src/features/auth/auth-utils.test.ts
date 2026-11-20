// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://172.18.131.69:5173/sign-in"}

import { describe, expect, it } from "vitest";
import { getAuthCallbackUrl } from "./auth-utils.js";

describe("getAuthCallbackUrl", () => {
  it("uses the current browser origin for OAuth callbacks", () => {
    expect(getAuthCallbackUrl()).toBe(
      "http://172.18.131.69:5173/auth/callback",
    );
  });

  it("preserves signup and recovery flow parameters on the current origin", () => {
    expect(getAuthCallbackUrl("signup")).toBe(
      "http://172.18.131.69:5173/auth/callback?flow=signup",
    );
    expect(getAuthCallbackUrl("recovery")).toBe(
      "http://172.18.131.69:5173/auth/callback?flow=recovery",
    );
  });
});
