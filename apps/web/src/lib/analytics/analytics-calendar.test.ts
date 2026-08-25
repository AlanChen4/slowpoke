import { describe, expect, it } from "vitest";

import { buildAnalyticsCalendar } from "./analytics-calendar";
import { type PromptAnalytics } from "./prompt-analytics";

type AnalyticsDay = PromptAnalytics["daily"][number];

function analyticsDay(date: string, prompts = 1): AnalyticsDay {
  return {
    date,
    prompts,
    activeUsers: prompts > 0 ? 1 : 0,
    openai: prompts,
    anthropic: 0,
    users: [],
  };
}

describe("buildAnalyticsCalendar", () => {
  it("always returns a left-aligned 14-by-7 calendar ending on Sunday", () => {
    const weeks = buildAnalyticsCalendar([analyticsDay("2026-08-25")]);

    expect(weeks).toHaveLength(14);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]?.[0]?.date).toBe("2026-05-25");
    expect(weeks.at(-1)?.at(-1)?.date).toBe("2026-08-30");
  });

  it("maps only supplied range dates and leaves the rest empty", () => {
    const weeks = buildAnalyticsCalendar([
      analyticsDay("2026-08-23", 2),
      analyticsDay("2026-08-24", 3),
      analyticsDay("2026-08-25", 4),
    ]);
    const cells = weeks.flat();

    expect(cells.filter((cell) => cell.day)).toHaveLength(3);
    expect(cells.find((cell) => cell.date === "2026-08-24")?.day?.prompts).toBe(3);
    expect(cells.find((cell) => cell.date === "2026-08-22")?.day).toBeNull();
  });
});
