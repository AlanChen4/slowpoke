import type { Metadata } from "next";

import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { env } from "@/env";

export const metadata: Metadata = {
  title: "Continue | Slowpoke",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const supabaseHostname = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  const showOAuth = !["127.0.0.1", "::1", "localhost"].includes(supabaseHostname);

  return (
    <main className="grid min-h-svh place-items-center px-6 py-12">
      <MagicLinkForm
        authError={error ? "We couldn't sign you in. Please try again." : undefined}
        showOAuth={showOAuth}
        className="w-full max-w-sm"
      />
    </main>
  );
}
