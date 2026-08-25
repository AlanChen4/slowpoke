"use server";

import { z } from "zod";

import {
  analyticsRangeSchema,
  analyticsTimezoneSchema,
  type PromptAnalytics,
} from "@/lib/analytics/prompt-analytics";
import {
  buildPromptAnalyticsRpcArguments,
  composePromptAnalytics,
} from "@/lib/analytics/compose-prompt-analytics";
import { getOrganizationContext } from "@/lib/organizations/organization-context";
import { createClient } from "@/lib/supabase/server";

const analyticsRequestSchema = z.object({
  days: analyticsRangeSchema,
  timezone: analyticsTimezoneSchema,
});

type AnalyticsRequest = z.infer<typeof analyticsRequestSchema>;

export type AnalyticsLoadResult =
  | { data: PromptAnalytics; error?: never }
  | { data?: never; error: string };

export async function loadPromptAnalytics(input: AnalyticsRequest): Promise<AnalyticsLoadResult> {
  const request = analyticsRequestSchema.safeParse(input);
  if (!request.success) {
    return { error: "The selected analytics range or timezone is invalid." };
  }

  const [supabase, { selectedOrganization, error: organizationError }] = await Promise.all([
    createClient(),
    getOrganizationContext(),
  ]);
  if (organizationError || !selectedOrganization) {
    return { error: "Slowpoke could not determine the selected organization." };
  }
  if (selectedOrganization.role !== "admin") {
    return { error: "Analytics are available only to organization administrators." };
  }

  const end = new Date().toISOString();
  const rpcArguments = buildPromptAnalyticsRpcArguments({
    days: request.data.days,
    end,
    organizationId: selectedOrganization.id,
    timezone: request.data.timezone,
  });
  const [summaryResult, dailyResult, dailyUsersResult, usersResult, providersResult, modelsResult] =
    await Promise.all([
      supabase.rpc("get_prompt_analytics_summary", rpcArguments.report).single(),
      supabase.rpc("get_prompt_analytics_daily", rpcArguments.heatmap),
      supabase.rpc("get_prompt_analytics_daily_users", rpcArguments.heatmap),
      supabase.rpc("get_prompt_analytics_users", rpcArguments.report),
      supabase.rpc("get_prompt_analytics_providers", rpcArguments.report),
      supabase.rpc("get_prompt_analytics_models", rpcArguments.report),
    ]);
  const failedQuery = [
    { query: "summary", error: summaryResult.error },
    { query: "daily", error: dailyResult.error },
    { query: "daily users", error: dailyUsersResult.error },
    { query: "users", error: usersResult.error },
    { query: "providers", error: providersResult.error },
    { query: "models", error: modelsResult.error },
  ].find(({ error }) => error);
  if (failedQuery) {
    console.error(
      `[analytics] ${failedQuery.query} query failed ${JSON.stringify({ code: failedQuery.error?.code, message: failedQuery.error?.message })}`,
    );
    return { error: "Slowpoke could not load analytics. Try refreshing the page." };
  }

  if (!summaryResult.data) {
    console.error("[analytics] summary query returned no rows");
    return { error: "Slowpoke received an invalid analytics response." };
  }

  const analytics = composePromptAnalytics({
    summary: summaryResult.data,
    daily: dailyResult.data ?? [],
    dailyUsers: dailyUsersResult.data ?? [],
    users: usersResult.data ?? [],
    providers: providersResult.data ?? [],
    models: modelsResult.data ?? [],
  });
  if (!analytics.success) {
    console.error(`[analytics] invalid response ${analytics.error.message}`);
    return { error: "Slowpoke received an invalid analytics response." };
  }

  return { data: analytics.data };
}
