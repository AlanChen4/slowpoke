import Image from "next/image";

import { cn } from "@/lib/ui/utils";

type ProviderIdentityProps = {
  className?: string;
  provider: string;
};

type ProviderLogoProps = {
  className?: string;
  provider: "anthropic" | "openai";
  size?: number;
};

const providerIdentities = {
  anthropic: { label: "Claude", logo: "/claude-logo.png" },
  openai: { label: "OpenAI", logo: "/openai-logo.png" },
} as const;

type PromptSourceIdentityProps = ProviderIdentityProps & {
  eventName: string;
};

type InstallationToolIdentityProps = {
  className?: string;
  tool: "codex" | "claude_code";
};

type IdentitySpec = {
  label: string;
  logo: string;
};

type IdentityProps = {
  className?: string;
  fallback: string;
  identity: IdentitySpec | null;
};

function providerDetails(provider: string) {
  switch (provider.toLowerCase()) {
    case "anthropic":
      return providerIdentities.anthropic;
    case "openai":
      return providerIdentities.openai;
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

export function ProviderLogo({ className, provider, size = 14 }: ProviderLogoProps) {
  const identity = providerIdentities[provider];

  return (
    <Image
      src={identity.logo}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
    />
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
