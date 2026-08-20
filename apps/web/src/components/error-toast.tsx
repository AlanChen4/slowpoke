"use client";

import { useEffect } from "react";

import { toast } from "@/components/ui/toast";

export function useErrorToast<TOccurrence>(
  message: string | null | undefined,
  title = "Something went wrong",
  occurrence?: TOccurrence,
) {
  useEffect(() => {
    if (!message) return;

    toast.add({
      title,
      description: message,
      type: "error",
    });
  }, [message, occurrence, title]);
}

export function ErrorToast({
  message,
  title,
}: {
  message: string | null | undefined;
  title?: string;
}) {
  useErrorToast(message, title);
  return null;
}
