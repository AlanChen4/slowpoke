"use server";

import { z } from "zod";

import {
  analyticsRangeSchema,
  analyticsTimezoneSchema,
  type PromptAnalytics,
  promptAnalyticsSchema,
} from "@/lib/analytics/prompt-analytics";
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
  const rpcArguments = {
    p_days: request.data.days,
    p_end: end,
    p_organization_id: selectedOrganization.id,
    p_timezone: request.data.timezone,
  };
  const [summaryResult, dailyResult, dailyUsersResult, usersResult, providersResult, modelsResult] =
    await Promise.all([
      supabase.rpc("get_prompt_analytics_summary", rpcArguments).single(),
      supabase.rpc("get_prompt_analytics_daily", rpcArguments),
      supabase.rpc("get_prompt_analytics_daily_users", rpcArguments),
      supabase.rpc("get_prompt_analytics_users", rpcArguments),
      supabase.rpc("get_prompt_analytics_providers", rpcArguments),
      supabase.rpc("get_prompt_analytics_models", rpcArguments),
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

  const dailyUsers = new Map<
    string,
    { rank: number; key: string; label: string; prompts: number }[]
  >();
  for (const row of dailyUsersResult.data ?? []) {
    const users = dailyUsers.get(row.day) ?? [];
    users.push({
      rank: row.rank,
      key: row.user_key,
      label: row.user_label,
      prompts: row.prompts,
    });
    dailyUsers.set(row.day, users);
  }

  const summary = summaryResult.data;
  const analytics = promptAnalyticsSchema.safeParse({
    summary: {
      current: {
        totalPrompts: summary.current_total_prompts,
        activeUsers: summary.current_active_users,
        promptsPerDay: summary.current_prompts_per_day,
        promptsPerUser: summary.current_prompts_per_user,
      },
      previous: {
        totalPrompts: summary.previous_total_prompts,
        activeUsers: summary.previous_active_users,
        promptsPerDay: summary.previous_prompts_per_day,
        promptsPerUser: summary.previous_prompts_per_user,
      },
    },
    daily: (dailyResult.data ?? []).map((row) => ({
      date: row.day,
      prompts: row.prompts,
      activeUsers: row.active_users,
      openai: row.openai,
      anthropic: row.anthropic,
      users: dailyUsers.get(row.day) ?? [],
    })),
    users: (usersResult.data ?? []).map((row) => ({
      rank: row.rank,
      key: row.user_key,
      label: row.user_label,
      prompts: row.prompts,
      share: row.share,
      lastActiveAt: row.last_active_at,
    })),
    providers: providersResult.data ?? [],
    models: modelsResult.data ?? [],
  });
  if (!analytics.success) {
    console.error(`[analytics] invalid response ${analytics.error.message}`);
    return { error: "Slowpoke received an invalid analytics response." };
  }

  return { data: analytics.data };
}
