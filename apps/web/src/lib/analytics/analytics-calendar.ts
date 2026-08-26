import { type PromptAnalytics } from "@/lib/analytics/prompt-analytics";

const calendarWeekCount = 14;
const daysPerWeek = 7;

export function analyticsDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function buildAnalyticsCalendar(daily: PromptAnalytics["daily"]) {
  const rangeEnd = daily.at(-1)?.date;
  if (!rangeEnd) return [];

  const rangeEndDate = analyticsDate(rangeEnd);
  const rangeEndIsoDay = rangeEndDate.getUTCDay() || daysPerWeek;
  const calendarEnd = new Date(rangeEndDate);
  calendarEnd.setUTCDate(calendarEnd.getUTCDate() + (daysPerWeek - rangeEndIsoDay));

  const calendarStart = new Date(calendarEnd);
  calendarStart.setUTCDate(calendarStart.getUTCDate() - (calendarWeekCount * daysPerWeek - 1));

  const daysByDate = new Map(daily.map((day) => [day.date, day]));
  return Array.from({ length: calendarWeekCount }, (_, weekIndex) =>
    Array.from({ length: daysPerWeek }, (_, weekdayIndex) => {
      const date = new Date(calendarStart);
      date.setUTCDate(date.getUTCDate() + weekIndex * daysPerWeek + weekdayIndex);
      const dateKey = date.toISOString().slice(0, 10);
      return { date: dateKey, day: daysByDate.get(dateKey) ?? null };
    }),
  );
}
