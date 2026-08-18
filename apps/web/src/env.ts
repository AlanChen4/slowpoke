import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    SLOWPOKE_SETUP_SERVER: z.url(),
    SUPABASE_SECRET_KEY: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  },
  runtimeEnv: {
    NODE_ENV:
      // oxlint-disable-next-line node/no-process-env -- T3 Env reads raw values at the validation boundary.
      process.env.NODE_ENV,
    SUPABASE_SECRET_KEY:
      // oxlint-disable-next-line node/no-process-env -- T3 Env reads raw values at the validation boundary.
      process.env.SUPABASE_SECRET_KEY,
    SLOWPOKE_SETUP_SERVER:
      // oxlint-disable-next-line node/no-process-env -- T3 Env reads raw values at the validation boundary.
      process.env.SLOWPOKE_SETUP_SERVER,
    NEXT_PUBLIC_SUPABASE_URL:
      // oxlint-disable-next-line node/no-process-env -- T3 Env reads raw values at the validation boundary.
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      // oxlint-disable-next-line node/no-process-env -- T3 Env reads raw values at the validation boundary.
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
  emptyStringAsUndefined: true,
});
