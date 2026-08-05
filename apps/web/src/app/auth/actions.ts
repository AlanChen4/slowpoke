"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import * as z from "zod";

import { env } from "@/env";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error?: string;
  message?: string;
};

const emailSchema = z.string().trim().pipe(z.email("Enter a valid email address."));
const loopbackHostnames = new Set(["127.0.0.1", "::1", "localhost"]);

function usesLocalSupabase() {
  const hostname = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;

  return env.NODE_ENV === "development" && loopbackHostnames.has(hostname);
}

async function signInLocally(email: string): Promise<AuthActionState | null> {
  const admin = createAdminClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error) {
    return { error: error.message };
  }

  const supabase = await createClient();
  const { error: verificationError } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: data.properties.verification_type,
  });

  if (verificationError) {
    return { error: verificationError.message };
  }

  return null;
}

export async function continueWithEmail(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = emailSchema.safeParse(formData.get("email"));

  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Enter a valid email address." };
  }

  if (usesLocalSupabase()) {
    const errorState = await signInLocally(result.data);

    if (errorState) {
      return errorState;
    }

    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: result.data,
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { message: "Check your email for a sign-in link." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
