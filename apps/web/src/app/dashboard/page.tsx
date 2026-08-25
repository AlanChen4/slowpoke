import Link from "next/link";
import { redirect } from "next/navigation";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Fragment } from "react";

import { humanPromptText } from "@/app/dashboard/human-prompt-text";
import { PromptRefreshButton } from "@/app/dashboard/prompt-refresh";
import { PromptSearch } from "@/app/dashboard/prompt-search";
import { PromptScopeFilter, type PromptScope } from "@/app/dashboard/prompt-scope-filter";
import { PromptTime } from "@/app/dashboard/prompt-time";
import { ErrorToast } from "@/components/error-toast";
import { PromptSourceIdentity } from "@/components/provider-identity";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { getOrganizationContext } from "@/lib/organizations/organization-context";
import { type Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/ui/utils";

const promptsPerPage = 25;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function pageHref(scope: PromptScope, page: number, searchQuery: string) {
  const params = new URLSearchParams();

  if (scope === "human") {
    params.set("scope", "human");
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  if (searchQuery) {
    params.set("q", searchQuery);
  }

  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

function promptHref(id: string, scope: PromptScope, page: number, searchQuery: string) {
  const params = new URLSearchParams({ scope });

  if (page > 1) {
    params.set("page", String(page));
  }

  if (searchQuery) {
    params.set("q", searchQuery);
  }

  return `/dashboard/prompts/${id}?${params.toString()}`;
}

function paginationPages(currentPage: number, totalPages: number) {
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);

  return [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
}

type DashboardPageProps = {
  searchParams: Promise<{
    page?: string | string[];
    q?: string | string[];
    scope?: string | string[];
  }>;
};

type PromptListRow = Pick<
  Tables<"prompt_events">,
  "id" | "provider" | "event_name" | "actor_email" | "prompt_text" | "is_redacted" | "occurred_at"
>;

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { page: requestedPage, q: requestedQuery, scope: requestedScope } = await searchParams;
  const scope: PromptScope =
    requestedScope === "human" || requestedScope === "first" ? "human" : "all";
  const rawSearchQuery = Array.isArray(requestedQuery) ? requestedQuery[0] : requestedQuery;
  const searchQuery = rawSearchQuery?.trim().slice(0, 200) ?? "";
  const parsedPage = Number(Array.isArray(requestedPage) ? requestedPage[0] : requestedPage);
  const currentPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const rangeStart = (currentPage - 1) * promptsPerPage;
  const promptSource = scope === "human" ? "human_prompt_events" : "prompt_events";
  const [supabase, { selectedOrganization }] = await Promise.all([
    createClient(),
    getOrganizationContext(),
  ]);
  let promptQuery = selectedOrganization
    ? scope === "human"
      ? supabase
          .from("human_prompt_events")
          .select("id,provider,event_name,actor_email,prompt_text,is_redacted,occurred_at", {
            count: "exact",
          })
          .eq("organization_id", selectedOrganization.id)
      : supabase
          .from("prompt_events")
          .select("id,provider,event_name,actor_email,prompt_text,is_redacted,occurred_at", {
            count: "exact",
          })
          .eq("organization_id", selectedOrganization.id)
    : null;

  if (promptQuery && searchQuery) {
    promptQuery = uuidPattern.test(searchQuery)
      ? promptQuery.eq("id", searchQuery)
      : promptQuery.ilike("prompt_text", `%${searchQuery.replace(/[\\%_]/gu, "\\$&")}%`);
  }

  const {
    count,
    data: prompts,
    error: promptsError,
  } = promptQuery
    ? await promptQuery
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .range(rangeStart, rangeStart + promptsPerPage - 1)
        .overrideTypes<PromptListRow[], { merge: false }>()
    : { count: 0, data: [], error: null };

  if (promptsError) {
    console.error(
      `[dashboard] prompt query failed ${JSON.stringify({
        code: promptsError.code,
        message: promptsError.message,
        source: promptSource,
      })}`,
    );
  }

  const totalPages = Math.ceil((count ?? 0) / promptsPerPage);

  if (!promptsError && totalPages > 0 && currentPage > totalPages) {
    redirect(pageHref(scope, totalPages, searchQuery));
  }

  const promptRows = prompts ?? [];
  const visiblePages = paginationPages(currentPage, totalPages);
  const promptsErrorMessage =
    promptsError?.code === "PGRST303"
      ? "The local Data API session is stale. Restart pnpm dev, then refresh this page."
      : "Slowpoke could not load prompts. Refresh the page after the local stack is ready.";

  return (
    <section className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1">
          <FieldGroup className="max-w-2xl">
            <Field>
              <FieldLabel htmlFor="prompt-search" className="sr-only">
                Search prompts
              </FieldLabel>
              <PromptSearch
                key={`${scope}:${searchQuery}`}
                initialQuery={searchQuery}
                scope={scope}
              />
            </Field>
          </FieldGroup>
        </div>
        <div className="flex shrink-0 items-end gap-2 self-end">
          <PromptScopeFilter value={scope} />
          <PromptRefreshButton />
        </div>
      </div>

      {promptsError ? (
        <ErrorToast title="Prompts could not be loaded" message={promptsErrorMessage} />
      ) : promptRows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WarningCircleIcon />
            </EmptyMedia>
            <EmptyTitle>{searchQuery ? "No matching prompts" : "No prompts yet"}</EmptyTitle>
            <EmptyDescription>
              {searchQuery
                ? "Try a different phrase or paste a complete event ID."
                : "Run Codex after completing the local setup, then refresh this page."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex min-w-0 flex-col gap-6">
          <ol className="min-w-0 divide-y border">
            {promptRows.map((prompt) => (
              <li key={prompt.id} className="min-w-0">
                <Link
                  href={promptHref(prompt.id, scope, currentPage, searchQuery)}
                  className="grid max-w-full min-w-0 gap-3 p-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:grid-cols-[9rem_minmax(0,1fr)] sm:p-5"
                >
                  <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                    <PromptSourceIdentity
                      eventName={prompt.event_name}
                      provider={prompt.provider}
                      className="font-medium text-foreground"
                    />
                    <p>{prompt.actor_email ?? "Unknown user"}</p>
                    <PromptTime occurredAt={prompt.occurred_at} />
                  </div>
                  <p className="line-clamp-4 max-w-full min-w-0 whitespace-pre-wrap break-words text-xs leading-5 [overflow-wrap:anywhere]">
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

          {totalPages > 1 ? (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={pageHref(scope, Math.max(1, currentPage - 1), searchQuery)}
                    aria-disabled={currentPage === 1}
                    tabIndex={currentPage === 1 ? -1 : undefined}
                    className={cn(currentPage === 1 && "pointer-events-none opacity-50")}
                  />
                </PaginationItem>
                {visiblePages.map((page, index) => {
                  const previousPage = visiblePages[index - 1];
                  const hasGap = previousPage !== undefined && page - previousPage > 1;

                  return (
                    <Fragment key={page}>
                      {hasGap ? (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : null}
                      <PaginationItem>
                        <PaginationLink
                          href={pageHref(scope, page, searchQuery)}
                          isActive={page === currentPage}
                          aria-label={`Go to page ${page}`}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    </Fragment>
                  );
                })}
                <PaginationItem>
                  <PaginationNext
                    href={pageHref(scope, Math.min(totalPages, currentPage + 1), searchQuery)}
                    aria-disabled={currentPage === totalPages}
                    tabIndex={currentPage === totalPages ? -1 : undefined}
                    className={cn(currentPage === totalPages && "pointer-events-none opacity-50")}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </div>
      )}
    </section>
  );
}
