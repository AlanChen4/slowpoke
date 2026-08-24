import Image from "next/image";

import { cn } from "@/lib/ui/utils";

type ProviderIdentityProps = {
  className?: string;
  provider: string;
};

type PromptSourceIdentityProps = ProviderIdentityProps & {
  eventName: string;
};

type InstallationToolIdentityProps = {
  className?: string;
  tool: "codex" | "claude_code";
};

type IdentityProps = {
  className?: string;
  fallback: string;
  identity: ReturnType<typeof providerDetails>;
};

function providerDetails(provider: string) {
  switch (provider.toLowerCase()) {
    case "anthropic":
      return { label: "Claude", logo: "/claude-logo.png" };
    case "openai":
      return { label: "OpenAI", logo: "/openai-logo.png" };
    default:
      return null;
  }
}

function promptSourceDetails(eventName: string, provider: string) {
  switch (eventName.toLowerCase()) {
    case "claude_code.user_prompt":
      return { label: "Claude Code", logo: "/claude-logo.png" };
    case "codex.user_prompt":
      return { label: "Codex", logo: "/openai-logo.png" };
    default:
      return providerDetails(provider);
  }
}

function installationToolDetails(tool: InstallationToolIdentityProps["tool"]) {
  return tool === "codex"
    ? { label: "Codex", logo: "/openai-logo.png" }
    : { label: "Claude Code", logo: "/claude-logo.png" };
}

function Identity({ className, identity, fallback }: IdentityProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {identity ? (
        <Image
          src={identity.logo}
          alt=""
          aria-hidden="true"
          width={14}
          height={14}
          className="shrink-0 object-contain"
        />
      ) : null}
      <span>{identity?.label ?? fallback}</span>
    </span>
  );
}

export function InstallationToolIdentity({ className, tool }: InstallationToolIdentityProps) {
  return (
    <Identity className={className} identity={installationToolDetails(tool)} fallback={tool} />
  );
}

export function PromptSourceIdentity({
  className,
  eventName,
  provider,
}: PromptSourceIdentityProps) {
  return (
    <Identity
      className={className}
      identity={promptSourceDetails(eventName, provider)}
      fallback={eventName}
    />
  );
}
