import type { Metadata } from "next";

import { MagicLinkForm } from "@/components/auth/magic-link-form";

export const metadata: Metadata = {
  title: "Continue | Slowpoke",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className="grid min-h-svh place-items-center px-6 py-12">
      <MagicLinkForm
        authError={error ? "We couldn't sign you in. Please try again." : undefined}
        className="w-full max-w-sm"
      />
    </main>
  );
}
