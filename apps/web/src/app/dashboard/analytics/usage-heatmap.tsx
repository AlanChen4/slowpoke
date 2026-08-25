"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { analyticsDate, buildAnalyticsCalendar } from "@/lib/analytics/analytics-calendar";
import { type PromptAnalytics } from "@/lib/analytics/prompt-analytics";
import { cn } from "@/lib/ui/utils";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const compactDateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const fullDateFormatter = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const weekdayFormatter = new Intl.DateTimeFormat("en", {
  weekday: "long",
  timeZone: "UTC",
});

function heatmapClass(prompts: number, maximum: number) {
  if (prompts === 0 || maximum === 0) return "bg-muted";
  const ratio = prompts / maximum;
  if (ratio <= 0.25) return "bg-primary/20";
  if (ratio <= 0.5) return "bg-primary/40";
  if (ratio <= 0.75) return "bg-primary/70";
  return "bg-primary";
}

export function UsageHeatmap({ analytics }: { analytics: PromptAnalytics }) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const maximum = Math.max(0, ...analytics.daily.map((day) => day.prompts));
  const weeks = buildAnalyticsCalendar(analytics.daily);
  const selectedDay = analytics.daily.find((day) => day.date === selectedDate);
  const activeDate = hoveredDate ?? selectedDay?.date ?? null;
  const selectedDateValue = selectedDay ? analyticsDate(selectedDay.date) : undefined;

  useEffect(() => {
    function dismissSelection(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-heatmap-cell], #date-leaderboard")) return;

      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && activeElement.hasAttribute("data-heatmap-cell")) {
        activeElement.blur();
      }
      setSelectedDate(null);
    }

    document.addEventListener("pointerdown", dismissSelection);
    return () => document.removeEventListener("pointerdown", dismissSelection);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage heatmap</CardTitle>
      </CardHeader>
      <CardContent
        className={cn(
          "grid gap-4",
          selectedDay && "min-[1180px]:grid-cols-[minmax(24rem,1fr)_18rem]",
        )}
      >
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1 text-xs">
            <caption className="sr-only">Prompt activity by date</caption>
            <thead>
              <tr>
                <th scope="col" className="w-10 text-left font-medium text-muted-foreground">
                  Day
                </th>
                {weeks.map((week, weekIndex) => {
                  const weekStart = week[0];
                  return (
                    <th
                      key={weekStart.date}
                      scope="col"
                      className="w-9 text-center font-normal whitespace-nowrap text-muted-foreground"
                      aria-label={`Week of ${fullDateFormatter.format(analyticsDate(weekStart.date))}`}
                    >
                      {weekIndex % 2 === 0
                        ? compactDateFormatter.format(analyticsDate(weekStart.date))
                        : ""}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {weekdays.map((weekday, weekdayIndex) => (
                <tr key={weekday}>
                  <th scope="row" className="pr-2 text-left font-normal text-muted-foreground">
                    {weekday}
                  </th>
                  {weeks.map((week) => {
                    const cell = week[weekdayIndex];
                    const { day } = cell;
                    if (!day) {
                      return (
                        <td key={cell.date} aria-hidden="true">
                          <span className="flex size-9 items-center justify-center">
                            <span className="block size-8 border border-border bg-background" />
                          </span>
                        </td>
                      );
                    }

                    const date = analyticsDate(day.date);
                    const label = `${weekdayFormatter.format(date)}, ${fullDateFormatter.format(date)}: ${day.prompts.toLocaleString()} prompts`;

                    return (
                      <td key={day.date} className="text-center">
                        <Button
                          type="button"
                          data-heatmap-cell
                          variant="ghost"
                          size="icon-lg"
                          title={label}
                          aria-label={label}
                          aria-controls="date-leaderboard"
                          aria-pressed={selectedDay?.date === day.date}
                          onMouseEnter={() => setHoveredDate(day.date)}
                          onMouseLeave={() => setHoveredDate(null)}
                          onFocus={() => setHoveredDate(day.date)}
                          onBlur={() => setHoveredDate(null)}
                          onClick={() =>
                            setSelectedDate((current) => (current === day.date ? null : day.date))
                          }
                          className={cn(
                            "rounded-none p-0 transition-[opacity,box-shadow]",
                            activeDate !== null && activeDate !== day.date && "opacity-30",
                            selectedDay?.date === day.date && "ring-2 ring-ring ring-offset-1",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "block size-8 shrink-0",
                              heatmapClass(day.prompts, maximum),
                            )}
                          />
                        </Button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedDay && selectedDateValue ? (
          <Card id="date-leaderboard" size="sm" className="self-start" aria-live="polite">
            <CardHeader>
              <CardTitle>{weekdayFormatter.format(selectedDateValue)}</CardTitle>
              {/* SURFACE-DESCRIPTION-REASON: The user requested the selected cell's date below its weekday in a secondary color. */}
              <CardDescription>{fullDateFormatter.format(selectedDateValue)}</CardDescription>
              <CardAction>
                <Badge variant="ghost">{selectedDay.prompts.toLocaleString()} prompts</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              {selectedDay.users.length === 0 ? (
                <div className="text-muted-foreground">No prompt activity</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Top users</TableHead>
                      <TableHead className="text-right">Prompts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedDay.users.map((user) => (
                      <TableRow key={user.key}>
                        <TableCell className="max-w-40 truncate font-medium">
                          {user.label}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {user.prompts.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : null}
      </CardContent>
    </Card>
  );
}
