import { type AnalyticsRange, promptAnalyticsSchema } from "./prompt-analytics";
import { type Database } from "../supabase/database.types";

type AnalyticsFunctions = Database["public"]["Functions"];
type AnalyticsRpcArguments = AnalyticsFunctions["get_prompt_analytics_summary"]["Args"];

export const analyticsHeatmapDays = 90;

export type PromptAnalyticsRpcRows = {
  summary: AnalyticsFunctions["get_prompt_analytics_summary"]["Returns"][number];
  daily: AnalyticsFunctions["get_prompt_analytics_daily"]["Returns"];
  dailyUsers: AnalyticsFunctions["get_prompt_analytics_daily_users"]["Returns"];
  users: AnalyticsFunctions["get_prompt_analytics_users"]["Returns"];
  providers: AnalyticsFunctions["get_prompt_analytics_providers"]["Returns"];
  models: AnalyticsFunctions["get_prompt_analytics_models"]["Returns"];
};

export function buildPromptAnalyticsRpcArguments({
  days,
  end,
  organizationId,
  timezone,
}: {
  days: AnalyticsRange;
  end: string;
  organizationId: string;
  timezone: string;
}) {
  const commonArguments = {
    p_end: end,
    p_organization_id: organizationId,
    p_timezone: timezone,
  };

  return {
    report: {
      ...commonArguments,
      p_days: days,
    } satisfies AnalyticsRpcArguments,
    heatmap: {
      ...commonArguments,
      p_days: analyticsHeatmapDays,
    } satisfies AnalyticsRpcArguments,
  };
}

export function composePromptAnalytics({
  summary,
  daily,
  dailyUsers: dailyUserRows,
  users,
  providers,
  models,
}: PromptAnalyticsRpcRows) {
  const dailyUsers = new Map<
    string,
    { rank: number; key: string; label: string; prompts: number }[]
  >();
  for (const row of dailyUserRows) {
    const usersForDay = dailyUsers.get(row.day) ?? [];
    usersForDay.push({
      rank: row.rank,
      key: row.user_key,
      label: row.user_label,
      prompts: row.prompts,
    });
    dailyUsers.set(row.day, usersForDay);
  }

  return promptAnalyticsSchema.safeParse({
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
    daily: daily.map((row) => ({
      date: row.day,
      prompts: row.prompts,
      activeUsers: row.active_users,
      openai: row.openai,
      anthropic: row.anthropic,
      users: dailyUsers.get(row.day) ?? [],
    })),
    users: users.map((row) => ({
      rank: row.rank,
      key: row.user_key,
      label: row.user_label,
      prompts: row.prompts,
      share: row.share,
      lastActiveAt: row.last_active_at,
    })),
    providers,
    models,
  });
}
