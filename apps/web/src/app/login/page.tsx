import type { Metadata } from "next";

import { MagicLinkForm } from "@/components/auth/magic-link-form";

export const metadata: Metadata = {
  title: "Continue | Slowpoke",
};

export default function LoginPage() {
  return (
    <main className="grid min-h-svh place-items-center px-6 py-12">
      <MagicLinkForm className="w-full max-w-sm" />
    </main>
  );
}
