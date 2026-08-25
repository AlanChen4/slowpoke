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

  const { data, error } = await supabase.rpc("get_prompt_analytics", {
    p_days: request.data.days,
    p_organization_id: selectedOrganization.id,
    p_timezone: request.data.timezone,
  });
  if (error) {
    console.error(
      `[analytics] query failed ${JSON.stringify({ code: error.code, message: error.message })}`,
    );
    return { error: "Slowpoke could not load analytics. Try refreshing the page." };
  }

  const analytics = promptAnalyticsSchema.safeParse(data);
  if (!analytics.success) {
    console.error(`[analytics] invalid response ${analytics.error.message}`);
    return { error: "Slowpoke received an invalid analytics response." };
  }

  return { data: analytics.data };
}
