import { redirect } from "next/navigation";

import { logout } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-10 px-6 py-8 sm:px-10 lg:px-12">
      <nav className="flex items-center justify-between">
        <p className="font-semibold">Slowpoke</p>
        <form action={logout}>
          <Button type="submit" variant="outline">
            Log out
          </Button>
        </form>
      </nav>
      <section className="flex flex-1 flex-col justify-center gap-3">
        <p className="text-sm text-muted-foreground">Signed in as {data.claims.email}</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          Dashboard coming next.
        </h1>
      </section>
    </main>
  );
}
