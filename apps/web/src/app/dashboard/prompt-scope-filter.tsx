"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PromptScope = "all" | "human";

type PromptScopeFilterProps = {
  value: PromptScope;
};

export function PromptScopeFilter({ value }: PromptScopeFilterProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateScope(nextScope: PromptScope | null) {
    if (!nextScope || nextScope === value) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());

    if (nextScope === "human") {
      nextParams.set("scope", "human");
    } else {
      nextParams.delete("scope");
    }
    nextParams.delete("page");

    const query = nextParams.toString();

    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="prompt-scope">Prompts</Label>
      <Select value={value} onValueChange={updateScope} disabled={isPending}>
        <SelectTrigger id="prompt-scope" className="w-44">
          <SelectValue>{value === "human" ? "Human prompts" : "All prompts"}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            <SelectItem value="all">All prompts</SelectItem>
            <SelectItem value="human">Human prompts</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
