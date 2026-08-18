import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export const getAuthClaims = cache(async function getAuthClaims() {
  const supabase = await createClient();
  return supabase.auth.getClaims();
});
