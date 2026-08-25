import { z } from "zod";

export const analyticsRangeSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>;

export const analyticsTimezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Invalid timezone");

const analyticsMetricSchema = z.object({
  totalPrompts: z.number().nonnegative(),
  activeUsers: z.number().nonnegative(),
  promptsPerDay: z.number().nonnegative(),
  promptsPerUser: z.number().nonnegative(),
});

const rankedPromptUserSchema = z.object({
  rank: z.number().int().positive(),
  key: z.string(),
  label: z.string(),
  prompts: z.number().nonnegative(),
});

export const promptAnalyticsSchema = z.object({
  summary: z.object({
    current: analyticsMetricSchema,
    previous: analyticsMetricSchema,
  }),
  daily: z.array(
    z.object({
      date: z.string(),
      prompts: z.number().nonnegative(),
      activeUsers: z.number().nonnegative(),
      openai: z.number().nonnegative(),
      anthropic: z.number().nonnegative(),
      users: z.array(rankedPromptUserSchema),
    }),
  ),
  users: z.array(
    z.object({
      rank: z.number().int().positive(),
      key: z.string(),
      label: z.string(),
      prompts: z.number().nonnegative(),
      share: z.number().min(0).max(1),
      lastActiveAt: z.string(),
    }),
  ),
  providers: z.array(
    z.object({
      provider: z.enum(["openai", "anthropic"]),
      prompts: z.number().nonnegative(),
    }),
  ),
  models: z.array(
    z.object({
      model: z.string(),
      prompts: z.number().nonnegative(),
    }),
  ),
});

export type PromptAnalytics = z.infer<typeof promptAnalyticsSchema>;

export function parseAnalyticsRange(value: string | string[] | undefined): AnalyticsRange {
  const candidate = Number(Array.isArray(value) ? value[0] : value);
  const result = analyticsRangeSchema.safeParse(candidate);
  return result.success ? result.data : 30;
}

export function metricChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? { label: "0%", value: 0 } : { label: "New", value: null };
  }

  const value = ((current - previous) / previous) * 100;
  return {
    label: `${value > 0 ? "+" : ""}${Math.round(value)}%`,
    value,
  };
}

export function recentActivityLabel(value: string, now: number) {
  const occurredAt = Date.parse(value);
  const elapsed = now - occurredAt;
  const oneDay = 24 * 60 * 60 * 1000;

  if (!Number.isFinite(occurredAt) || elapsed < 0 || elapsed >= oneDay) return null;

  const totalMinutes = Math.floor(elapsed / (60 * 1000));
  if (totalMinutes === 0) return "Just now";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourLabel = `${hours.toLocaleString()} ${hours === 1 ? "hour" : "hours"}`;
  const minuteLabel = `${minutes.toLocaleString()} ${minutes === 1 ? "minute" : "minutes"}`;

  if (hours === 0) return `${minuteLabel} ago`;
  if (minutes === 0) return `${hourLabel} ago`;
  return `${hourLabel} ${minuteLabel} ago`;
}
