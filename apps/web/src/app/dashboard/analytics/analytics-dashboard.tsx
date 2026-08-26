"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";

import { type AnalyticsLoadResult, loadPromptAnalytics } from "@/app/dashboard/analytics/actions";
import { AnalyticsCharts, OverviewCards } from "@/app/dashboard/analytics/analytics-overview";
import { UsageHeatmap } from "@/app/dashboard/analytics/usage-heatmap";
import { UserLeaderboard } from "@/app/dashboard/analytics/user-leaderboard";
import { PromptRefreshButton, usePromptRefresh } from "@/app/dashboard/prompt-refresh";
import { ErrorToast } from "@/components/feedback/error-toast";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type AnalyticsRange, type PromptAnalytics } from "@/lib/analytics/prompt-analytics";

const rangeOptions = [7, 30, 90] as const;
const subscribeTimezone = () => () => undefined;
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const serverTimezone = () => undefined;

type AnalyticsDashboardProps = {
  days: AnalyticsRange;
};

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Loading analytics">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

function AnalyticsContent({
  analytics,
  days,
  timezone,
}: {
  analytics: PromptAnalytics;
  days: AnalyticsRange;
  timezone: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <OverviewCards analytics={analytics} />
      <UsageHeatmap analytics={analytics} />
      {analytics.summary.current.totalPrompts === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WarningCircleIcon />
            </EmptyMedia>
            <EmptyTitle>No prompt activity</EmptyTitle>
            <EmptyDescription>
              No human prompts were recorded during the selected {days}-day range.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <UserLeaderboard analytics={analytics} timezone={timezone} />
          <AnalyticsCharts analytics={analytics} />
        </>
      )}
    </div>
  );
}

export function AnalyticsDashboard({ days }: AnalyticsDashboardProps) {
  const router = useRouter();
  const { refreshVersion } = usePromptRefresh();
  const [isRangePending, startRangeTransition] = useTransition();
  const timezone = useSyncExternalStore(subscribeTimezone, browserTimezone, serverTimezone);
  const requestKey = timezone ? `${days}:${timezone}:${refreshVersion}` : undefined;
  const [resultState, setResultState] = useState<{
    key: string;
    result: AnalyticsLoadResult;
  }>();
  const result = resultState && resultState.key === requestKey ? resultState.result : undefined;

  useEffect(() => {
    if (!timezone) return;

    let ignore = false;
    void loadPromptAnalytics({ days, timezone }).then((nextResult) => {
      if (!ignore) {
        setResultState({ key: `${days}:${timezone}:${refreshVersion}`, result: nextResult });
      }
    });

    return () => {
      ignore = true;
    };
  }, [days, refreshVersion, timezone]);

  function changeRange(values: string[]) {
    const nextRange = Number(values.at(-1));
    if (!rangeOptions.some((option) => option === nextRange) || nextRange === days) return;

    startRangeTransition(() => {
      router.replace(`/dashboard/analytics?range=${nextRange}`);
    });
  }

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <ToggleGroup
            value={[String(days)]}
            onValueChange={changeRange}
            variant="outline"
            spacing={0}
            size="sm"
            aria-label="Analytics range"
            disabled={isRangePending}
          >
            {rangeOptions.map((range) => (
              <ToggleGroupItem key={range} value={String(range)}>
                {range} days
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <PromptRefreshButton />
        </div>
      </div>

      {result?.error ? (
        <>
          <ErrorToast title="Analytics could not be loaded" message={result.error} />
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WarningCircleIcon />
              </EmptyMedia>
              <EmptyTitle>Analytics unavailable</EmptyTitle>
              <EmptyDescription>{result.error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </>
      ) : result?.data && timezone ? (
        <AnalyticsContent analytics={result.data} days={days} timezone={timezone} />
      ) : (
        <AnalyticsSkeleton />
      )}
    </section>
  );
}
