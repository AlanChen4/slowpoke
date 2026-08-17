"use client";

import { useEffect, useState } from "react";

import { usePromptRefresh } from "@/app/dashboard/prompt-refresh";

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

function promptDate(occurredAt: string, now: number) {
  const occurredAtTimestamp = new Date(occurredAt).getTime();
  const differenceInSeconds = Math.round((occurredAtTimestamp - now) / 1_000);

  if (Math.abs(differenceInSeconds) > 24 * 60 * 60) {
    return dateFormatter.format(occurredAtTimestamp);
  }

  if (Math.abs(differenceInSeconds) < 60) {
    return relativeTimeFormatter.format(differenceInSeconds, "second");
  }

  const differenceInMinutes = Math.round(differenceInSeconds / 60);
  if (Math.abs(differenceInMinutes) < 60) {
    return relativeTimeFormatter.format(differenceInMinutes, "minute");
  }

  return relativeTimeFormatter.format(Math.round(differenceInMinutes / 60), "hour");
}

export function PromptTime({ occurredAt }: { occurredAt: string }) {
  const { refreshVersion } = usePromptRefresh();
  const absoluteDate = dateFormatter.format(new Date(occurredAt));
  const [label, setLabel] = useState(absoluteDate);

  useEffect(() => {
    function updateLabel() {
      setLabel(promptDate(occurredAt, Date.now()));
    }

    updateLabel();
    const interval = window.setInterval(updateLabel, 60_000);

    return () => window.clearInterval(interval);
  }, [occurredAt, refreshVersion]);

  return (
    <time dateTime={occurredAt} title={absoluteDate}>
      {label}
    </time>
  );
}
