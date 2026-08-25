import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/env";
import { type Database } from "@/lib/supabase/database.types";

export function createAdminClient() {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
