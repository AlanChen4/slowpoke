import { redirect } from "next/navigation";
import Link from "next/link";

import { logout } from "@/app/auth/actions";
import { humanPromptText } from "@/app/dashboard/human-prompt-text";
import { PromptScopeFilter, type PromptScope } from "@/app/dashboard/prompt-scope-filter";
import { Button, buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

function providerName(provider: string) {
  return provider === "openai" ? "OpenAI" : provider;
}

type DashboardPageProps = {
  searchParams: Promise<{ scope?: string | string[] }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { scope: requestedScope } = await searchParams;
  const scope: PromptScope =
    requestedScope === "human" || requestedScope === "first" ? "human" : "all";
  const promptSource = scope === "human" ? "human_prompt_events" : "prompt_events";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const { data: prompts, error: promptsError } = await supabase
    .from(promptSource)
    .select("id,provider,prompt_text,is_redacted,occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (promptsError) {
    console.error(
      `[dashboard] prompt query failed ${JSON.stringify({
        code: promptsError.code,
        message: promptsError.message,
        source: promptSource,
      })}`,
    );
  }

  const promptRows = prompts ?? [];
  const refreshHref = scope === "human" ? "/dashboard?scope=human" : "/dashboard";
  const promptsErrorMessage =
    promptsError?.code === "PGRST303"
      ? "The local Data API session is stale. Restart pnpm dev, then refresh this page."
      : "Slowpoke could not load prompts. Refresh the page after the local stack is ready.";

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-10 px-6 py-8 sm:px-10 lg:px-12">
      <nav className="flex justify-end">
        <form action={logout}>
          <Button type="submit" variant="outline">
            Log out
          </Button>
        </form>
      </nav>
      <section className="flex flex-col gap-6">
        <div className="flex items-end justify-end gap-2">
          <PromptScopeFilter value={scope} />
          <Link href={refreshHref} className={cn(buttonVariants({ variant: "outline" }))}>
            Refresh
          </Link>
        </div>

        {promptsError ? (
          <div className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {promptsErrorMessage}
          </div>
        ) : promptRows.length === 0 ? (
          <div className="border border-dashed p-8 text-center">
            <h2 className="font-medium">No prompts yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Run Codex after completing the local setup, then refresh this page.
            </p>
          </div>
        ) : (
          <ol className="divide-y border">
            {promptRows.map((prompt) => (
              <li key={prompt.id}>
                <Link
                  href={`/dashboard/messages/${prompt.id}?scope=${scope}`}
                  className="grid gap-3 p-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:grid-cols-[9rem_1fr] sm:p-5"
                >
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">{providerName(prompt.provider)}</p>
                    <time dateTime={prompt.occurred_at}>
                      {dateFormatter.format(new Date(prompt.occurred_at))}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {prompt.is_redacted
                      ? "Prompt content was redacted."
                      : scope === "human"
                        ? humanPromptText(prompt.prompt_text)
                        : prompt.prompt_text}
                  </p>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
