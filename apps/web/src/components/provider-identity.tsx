import Image from "next/image";

import { cn } from "@/lib/utils";

type ProviderIdentityProps = {
  className?: string;
  provider: string;
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

export function ProviderIdentity({ className, provider }: ProviderIdentityProps) {
  const identity = providerDetails(provider);

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
      <span>{identity?.label ?? provider}</span>
    </span>
  );
}
