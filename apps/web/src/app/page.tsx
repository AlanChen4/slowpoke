import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (!error && data?.claims) {
    redirect("/dashboard");
  }

  return (
    <main className="bg-background text-foreground relative flex min-h-screen flex-col overflow-hidden">
      <nav className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 sm:px-10 lg:px-12">
        <Link href="/" aria-label="Slowpoke home">
          <Image
            src="/wordmark.svg"
            alt="Slowpoke"
            width={1922}
            height={470}
            className="h-8 w-auto"
            priority
          />
        </Link>

        <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
          Sign in
        </Link>
      </nav>

      <section className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col items-start justify-center gap-8 px-6 pb-24 pt-12 sm:px-10 lg:px-12">
        {/* HEADING-REASON: Provides the public landing page's single top-level topic. */}
        <h1 className="max-w-5xl text-left text-5xl font-semibold leading-[0.96] tracking-[-0.06em] text-balance sm:text-7xl lg:text-[6.75rem]">
          Manage your company&apos;s AI usage
        </h1>

        <Link href="/login" className={buttonVariants({ size: "lg" })}>
          Get Started — it&apos;s free
        </Link>
      </section>
    </main>
  );
}
