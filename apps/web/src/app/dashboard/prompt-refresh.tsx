"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

type PromptRefreshContextValue = {
  isPending: boolean;
  refreshPrompts: () => void;
  refreshVersion: number;
};

const PromptRefreshContext = createContext<PromptRefreshContextValue | null>(null);

export function PromptRefreshProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isPending, startTransition] = useTransition();

  function refreshPrompts() {
    setRefreshVersion((version) => version + 1);
    startTransition(() => router.refresh());
  }

  return (
    <PromptRefreshContext.Provider value={{ isPending, refreshPrompts, refreshVersion }}>
      {children}
    </PromptRefreshContext.Provider>
  );
}

export function usePromptRefresh() {
  const context = useContext(PromptRefreshContext);

  if (!context) {
    throw new Error("usePromptRefresh must be used within PromptRefreshProvider");
  }

  return context;
}

export function PromptRefreshButton() {
  const { isPending, refreshPrompts } = usePromptRefresh();

  return (
    <Button type="button" variant="outline" disabled={isPending} onClick={refreshPrompts}>
      Refresh
    </Button>
  );
}
