import { createClient as createAdminClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import * as z from "zod";

import {
  humanPromptText,
  promptTextSegments,
  type PromptTextSegment,
} from "@/app/dashboard/human-prompt-text";
import { PromptSourceIdentity, ProviderIdentity } from "@/components/provider-identity";
import { env } from "@/env";
import { getAuthClaims } from "@/lib/auth-context";
import { getOrganizationContext } from "@/lib/organization-context";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { promptRecordMetadata, responseUsageForPrompt, type ResponseUsageEvent } from "./telemetry";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

const numberFormatter = new Intl.NumberFormat("en");

const rawMetadataKeys = ["app.version", "auth_mode", "prompt_length", "terminal.type"] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type PromptDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string | string[];
    q?: string | string[];
    scope?: string | string[];
  }>;
};

const promptEventSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  installation_id: z.string(),
  batch_id: z.string(),
  record_index: z.number(),
  provider: z.string(),
  event_name: z.string(),
  occurred_at: z.string(),
  prompt_id: z.string().nullable(),
  session_id: z.string().nullable(),
  actor_account_id: z.string().nullable(),
  actor_email: z.string().nullable(),
  prompt_text: z.string(),
  is_redacted: z.boolean(),
  created_at: z.string(),
  model: z.string().nullable(),
  slug: z.string().nullable(),
  originator: z.string().nullable(),
});

type PromptEvent = z.infer<typeof promptEventSchema>;

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1 pt-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{children ?? "—"}</dd>
    </div>
  );
}

function PromptBreakdown({ segments }: { segments: PromptTextSegment[] }) {
  return (
    <article className="min-w-0 border">
      <header className="flex flex-wrap items-center gap-4 border-b px-4 py-3 text-xs font-medium">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 bg-human-highlight" aria-hidden="true" />
          Human input
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 bg-harness-highlight" aria-hidden="true" />
          Added by harness
        </span>
      </header>
      <p className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-6">
        {segments.map((segment, index) => (
          <mark
            key={`${segment.source}:${index}`}
            className={cn(
              "box-decoration-clone text-foreground",
              segment.source === "human" ? "bg-human-highlight" : "bg-harness-highlight",
            )}
          >
            {segment.text}
          </mark>
        ))}
      </p>
    </article>
  );
}

function UsageItem({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="pt-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-medium">
        {value === null || value === undefined ? "—" : numberFormatter.format(value)}
      </dd>
    </div>
  );
}

function createTelemetryAdminClient() {
  return createAdminClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export default async function PromptDetailPage({ params, searchParams }: PromptDetailPageProps) {
  const [{ id }, { page: requestedPage, q: requestedQuery, scope: requestedScope }] =
    await Promise.all([params, searchParams]);

  if (!uuidPattern.test(id)) {
    notFound();
  }

  const scope = requestedScope === "human" ? "human" : "all";
  const rawSearchQuery = Array.isArray(requestedQuery) ? requestedQuery[0] : requestedQuery;
  const searchQuery = rawSearchQuery?.trim().slice(0, 200) ?? "";
  const parsedPage = Number(Array.isArray(requestedPage) ? requestedPage[0] : requestedPage);
  const currentPage = Number.isInteger(parsedPage) && parsedPage > 1 ? parsedPage : 1;
  const backParams = new URLSearchParams();
  if (scope === "human") {
    backParams.set("scope", "human");
  }
  if (currentPage > 1) {
    backParams.set("page", String(currentPage));
  }
  if (searchQuery) {
    backParams.set("q", searchQuery);
  }
  const backQuery = backParams.toString();
  const [supabase, { data: claims, error: claimsError }] = await Promise.all([
    createClient(),
    getAuthClaims(),
  ]);

  if (claimsError || !claims?.claims) {
    redirect("/login");
  }

  const { selectedOrganization } = await getOrganizationContext();

  if (!selectedOrganization) {
    notFound();
  }

  const { data: promptData, error: promptError } = await supabase
    .from("prompt_events")
    .select("*")
    .eq("id", id)
    .eq("organization_id", selectedOrganization.id)
    .maybeSingle();

  if (promptError) {
    throw new Error(`Unable to load prompt details: ${promptError.message}`);
  }

  if (!promptData) {
    notFound();
  }

  const parsedPrompt = promptEventSchema.safeParse(promptData);
  if (!parsedPrompt.success) {
    throw new Error("The prompt detail response did not match the expected database contract.");
  }
  const prompt = parsedPrompt.data;
  const conversationBeforeQuery = prompt.session_id
    ? supabase
        .from("prompt_events")
        .select("*")
        .eq("session_id", prompt.session_id)
        .eq("organization_id", prompt.organization_id)
        .eq("installation_id", prompt.installation_id)
        .lt("occurred_at", prompt.occurred_at)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(49)
        .overrideTypes<PromptEvent[], { merge: false }>()
    : Promise.resolve({ data: [], error: null });
  const conversationAfterQuery = prompt.session_id
    ? supabase
        .from("prompt_events")
        .select("*")
        .eq("session_id", prompt.session_id)
        .eq("organization_id", prompt.organization_id)
        .eq("installation_id", prompt.installation_id)
        .gt("occurred_at", prompt.occurred_at)
        .order("occurred_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(50)
        .overrideTypes<PromptEvent[], { merge: false }>()
    : Promise.resolve({ data: [], error: null });
  const admin = createTelemetryAdminClient();
  const responseUsageQuery = prompt.session_id
    ? admin
        .from("response_usage_events")
        .select(
          "prompt_id,model,event_timestamp,time_unix_nano,observed_time_unix_nano,input_token_count,cached_token_count,cache_creation_token_count,output_token_count,reasoning_token_count,tool_token_count,cost_usd,estimated_cost_usd,total_cost_usd",
        )
        .eq("organization_id", prompt.organization_id)
        .eq("installation_id", prompt.installation_id)
        .eq("conversation_id", prompt.session_id)
        .gte("received_at", prompt.occurred_at)
        .order("received_at", { ascending: true })
        .limit(100)
        .overrideTypes<ResponseUsageEvent[], { merge: false }>()
    : Promise.resolve({ data: [], error: null });

  const [conversationBeforeResult, conversationAfterResult, selectedBatchResult, usageResult] =
    await Promise.all([
      conversationBeforeQuery,
      conversationAfterQuery,
      admin
        .from("telemetry_batches")
        .select("raw_payload")
        .eq("id", prompt.batch_id)
        .eq("organization_id", prompt.organization_id)
        .maybeSingle(),
      responseUsageQuery,
    ]);

  const conversationError = conversationBeforeResult.error ?? conversationAfterResult.error;
  if (conversationError) {
    throw new Error(`Unable to load conversation: ${conversationError.message}`);
  }

  if (selectedBatchResult.error || usageResult.error) {
    console.error(
      `[dashboard] telemetry detail query failed ${JSON.stringify({
        promptId: prompt.id,
        selectedBatchError: selectedBatchResult.error?.message,
        responseUsageError: usageResult.error?.message,
      })}`,
    );
  }

  const conversationBefore = conversationBeforeResult.data ?? [];
  const conversationAfter = conversationAfterResult.data ?? [];
  const conversation = [...conversationBefore.reverse(), prompt, ...conversationAfter];
  const nextPromptOccurredAt = conversationAfter[0]?.occurred_at ?? null;
  const usage = prompt.session_id
    ? responseUsageForPrompt(
        usageResult.data ?? [],
        prompt.occurred_at,
        nextPromptOccurredAt,
        prompt.prompt_id,
      )
    : null;
  const rawMetadata = promptRecordMetadata(
    selectedBatchResult.data?.raw_payload,
    prompt.record_index,
  );
  const sentText = prompt.is_redacted ? "Prompt content was redacted." : prompt.prompt_text.trim();
  const promptSegments = prompt.is_redacted
    ? [{ source: "human" as const, text: sentText }]
    : promptTextSegments(sentText);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <PromptBreakdown segments={promptSegments} />

      <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-4 border p-5">
          <div>
            {/* HEADING-REASON: Labels the token and cost definition list as one section. */}
            <h2 className="text-lg font-semibold">Usage and cost</h2>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <UsageItem label="Input tokens" value={usage?.inputTokens} />
            <UsageItem label="Cache read tokens" value={usage?.cachedTokens} />
            <UsageItem label="Cache creation tokens" value={usage?.cacheCreationTokens} />
            <UsageItem label="Output tokens" value={usage?.outputTokens} />
            <UsageItem label="Reasoning tokens" value={usage?.reasoningTokens} />
            <UsageItem label="Total tokens" value={usage?.totalTokens} />
            <div className="pt-3">
              <dt className="text-xs text-muted-foreground">Cost</dt>
              <dd className="mt-1 text-lg font-medium">
                {usage?.costUsd === null || usage?.costUsd === undefined
                  ? "Not reported"
                  : `$${usage.costUsd.toFixed(4)}`}
              </dd>
            </div>
          </dl>
          {!usage ? (
            <p className="pt-3 text-xs text-muted-foreground">
              No completed response usage was found before the next human prompt.
            </p>
          ) : usage.costUsd === null ? (
            <p className="pt-3 text-xs text-muted-foreground">
              Token counts were reported for this response, but not a billable dollar amount.
            </p>
          ) : null}
        </div>

        <div className="space-y-4 border p-5">
          <div>
            {/* HEADING-REASON: Labels the normalized telemetry definition list as one section. */}
            <h2 className="text-lg font-semibold">Metadata</h2>
          </div>
          <dl className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem label="Occurred at">
              <time dateTime={prompt.occurred_at}>
                {dateFormatter.format(new Date(prompt.occurred_at))}
              </time>
            </DetailItem>
            <DetailItem label="Tool">
              <PromptSourceIdentity eventName={prompt.event_name} provider={prompt.provider} />
            </DetailItem>
            <DetailItem label="Provider">
              <ProviderIdentity provider={prompt.provider} />
            </DetailItem>
            <DetailItem label="Event">{prompt.event_name}</DetailItem>
            <DetailItem label="Model">{prompt.model ?? usage?.model}</DetailItem>
            <DetailItem label="Originator">{prompt.originator}</DetailItem>
            <DetailItem label="Actor">{prompt.actor_email ?? prompt.actor_account_id}</DetailItem>
            <DetailItem label="Conversation ID">{prompt.session_id}</DetailItem>
            <DetailItem label="Prompt ID">{prompt.prompt_id}</DetailItem>
            <DetailItem label="Installation ID">{prompt.installation_id}</DetailItem>
            <DetailItem label="Batch ID">{prompt.batch_id}</DetailItem>
            <DetailItem label="Record index">{prompt.record_index}</DetailItem>
            {rawMetadataKeys.map((key) => (
              <DetailItem key={key} label={key}>
                {rawMetadata[key] === undefined ? null : String(rawMetadata[key])}
              </DetailItem>
            ))}
          </dl>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="conversation-heading">
        <div>
          {/* HEADING-REASON: Identifies the labelled ordered list of surrounding messages. */}
          <h2 id="conversation-heading" className="text-lg font-semibold">
            Conversation
          </h2>
          <output className="text-xs text-muted-foreground">
            Showing {conversation.length} captured{" "}
            {conversation.length === 1 ? "prompt" : "prompts"} around the selected prompt.
          </output>
        </div>
        <ol className="divide-y border">
          {conversation.map((event, index) => {
            const displayText = event.is_redacted
              ? "Prompt content was redacted."
              : humanPromptText(event.prompt_text);
            const isSelected = event.id === prompt.id;

            return (
              <li
                key={event.id}
                className={cn(
                  "grid gap-3 p-4 sm:grid-cols-[9rem_1fr] sm:p-5",
                  isSelected && "bg-muted/50",
                )}
              >
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Prompt {index + 1}</p>
                  <time dateTime={event.occurred_at}>
                    {dateFormatter.format(new Date(event.occurred_at))}
                  </time>
                  {isSelected ? <p className="font-medium text-foreground">Selected</p> : null}
                </div>
                <div className="min-w-0 space-y-3">
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">{displayText}</p>
                  {!isSelected ? (
                    <Link
                      href={`/dashboard/prompts/${event.id}${backQuery ? `?${backQuery}` : ""}`}
                      className="inline-block text-xs font-medium underline underline-offset-4"
                    >
                      View details
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
