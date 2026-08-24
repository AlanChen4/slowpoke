import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { getAuthClaims } from "@/lib/auth/auth-context";
import { getOrganizationContext } from "@/lib/organizations/organization-context";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { data, error } = await getAuthClaims();
  if (error || !data?.claims) {
    redirect("/login");
  }
  const { selectedOrganization } = await getOrganizationContext();
  const canReturnToDashboard = selectedOrganization?.completed === true;

  return (
    <main className="flex min-h-screen flex-col bg-muted/30">
      <nav>
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-4 px-5 sm:px-8">
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
          {canReturnToDashboard ? (
            <Link
              href="/dashboard"
              className={buttonVariants({ variant: "ghost", size: "sm", className: "ml-auto" })}
            >
              Go back
            </Link>
          ) : null}
        </div>
      </nav>
      <div className="mx-auto flex w-full max-w-3xl flex-1 items-start px-5 py-10 sm:px-8 sm:py-16">
        {children}
      </div>
    </main>
  );
}
