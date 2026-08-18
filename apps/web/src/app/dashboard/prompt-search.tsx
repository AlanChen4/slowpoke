"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";

import type { PromptScope } from "@/app/dashboard/prompt-scope-filter";

const searchDebounceMilliseconds = 300;

type PromptSearchProps = {
  initialQuery: string;
  scope: PromptScope;
};

function searchHref(scope: PromptScope, query: string) {
  const params = new URLSearchParams();

  if (scope === "human") {
    params.set("scope", "human");
  }

  if (query) {
    params.set("q", query);
  }

  const search = params.toString();
  return search ? `/dashboard?${search}` : "/dashboard";
}

export function PromptSearch({ initialQuery, scope }: PromptSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    const normalizedQuery = query.trim().slice(0, 200);

    if (normalizedQuery === initialQuery) {
      return;
    }

    const timeout = window.setTimeout(() => {
      router.replace(searchHref(scope, normalizedQuery), { scroll: false });
    }, searchDebounceMilliseconds);

    return () => window.clearTimeout(timeout);
  }, [initialQuery, query, router, scope]);

  return (
    <Input
      id="prompt-search"
      name="q"
      type="search"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      maxLength={200}
      placeholder="Search prompt text or event ID"
    />
  );
}
