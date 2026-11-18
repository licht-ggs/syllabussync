import { profileSchema } from "@syllabussync/shared";
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { createSupabaseClient } from "../services/supabase.js";

export const profileRouter = Router();

profileRouter.get("/", requireAuth, async (request, response) => {
  const user = request.authUser;
  const accessToken = request.supabaseAccessToken;

  if (!user || !accessToken) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  const { data, error } = await createSupabaseClient(accessToken)
    .from("profiles")
    .select("id, display_name, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    response.status(500).json({ error: "Unable to load profile" });
    return;
  }

  if (!data) {
    response.status(404).json({ error: "Profile not found" });
    return;
  }

  response.json(profileSchema.parse(data));
});
