import Image from "next/image";

import { Field, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const tools = [
  { label: "Codex", logo: "/openai-logo.png", value: "codex" },
  { label: "Claude Code", logo: "/claude-logo.png", value: "claude_code" },
] as const;

export function InstallationToolFields() {
  return (
    <FieldSet className="grid gap-3 sm:grid-cols-2">
      <FieldLegend className="sr-only">AI tools</FieldLegend>
      {tools.map((tool) => (
        <FieldLabel key={tool.value} variant="secondary" className="cursor-pointer">
          <Field orientation="horizontal">
            <Input
              type="checkbox"
              name="tools"
              value={tool.value}
              aria-label={tool.label}
              className="size-4"
            />
            <FieldTitle>
              <Image
                src={tool.logo}
                alt=""
                aria-hidden="true"
                width={18}
                height={18}
                className="shrink-0 object-contain"
              />
              {tool.label}
            </FieldTitle>
          </Field>
        </FieldLabel>
      ))}
    </FieldSet>
  );
}
