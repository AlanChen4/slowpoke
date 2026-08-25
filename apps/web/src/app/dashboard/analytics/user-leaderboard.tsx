"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type PromptAnalytics, recentActivityLabel } from "@/lib/analytics/prompt-analytics";

type UserLeaderboardProps = {
  analytics: PromptAnalytics;
  timezone: string;
};

export function UserLeaderboard({ analytics, timezone }: UserLeaderboardProps) {
  const [now, setNow] = useState(() => Date.now());
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }),
    [timezone],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top users</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Rank</TableHead>
              <TableHead>User</TableHead>
              <TableHead className="text-right">Prompts</TableHead>
              <TableHead className="min-w-36">Share</TableHead>
              <TableHead>Last active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analytics.users.map((user) => (
              <TableRow key={user.key}>
                <TableCell className="text-muted-foreground tabular-nums">{user.rank}</TableCell>
                <TableCell className="max-w-64 truncate font-medium">{user.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {user.prompts.toLocaleString()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={user.share * 100}
                      aria-label={`${user.label} submitted ${Math.round(user.share * 100)}% of prompts`}
                      className="min-w-20 flex-1"
                    />
                    <span className="w-10 text-right text-muted-foreground tabular-nums">
                      {Math.round(user.share * 100)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <time
                    dateTime={user.lastActiveAt}
                    title={dateFormatter.format(new Date(user.lastActiveAt))}
                  >
                    {recentActivityLabel(user.lastActiveAt, now) ??
                      dateFormatter.format(new Date(user.lastActiveAt))}
                  </time>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
