import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { getAuthClaims } from "@/lib/auth-context";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { data, error } = await getAuthClaims();
  if (error || !data?.claims) {
    redirect("/login");
  }
  const email = data.claims.email ?? "Signed-in account";

  return (
    <main className="flex min-h-screen flex-col bg-muted/30">
      <nav className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-5 sm:px-8">
          <Link href="/" aria-label="Slowpoke home">
            <Image
              src="/wordmark.svg"
              alt="Slowpoke"
              width={1922}
              height={470}
              className="h-7 w-auto"
              priority
            />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{email}</span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                Log out
              </Button>
            </form>
          </div>
        </div>
      </nav>
      <div className="mx-auto flex w-full max-w-3xl flex-1 items-start px-5 py-10 sm:px-8 sm:py-16">
        {children}
      </div>
    </main>
  );
}
