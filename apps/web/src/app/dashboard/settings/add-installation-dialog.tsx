"use client";

import {
  ArrowSquareOutIcon,
  CircleNotchIcon,
  DesktopIcon,
  PlusIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import {
  checkInstallationSetupSession,
  createInstallationSetupSession,
  createTeamInstallation,
  type OrganizationFlowActionState,
} from "@/app/organization-actions";
import { useErrorToast } from "@/components/error-toast";
import { InstallationToolFields } from "@/components/installation-tool-fields";
import { InstallationToolIdentity } from "@/components/provider-identity";
import EnrollmentCodeBlock from "@/components/shadcn-studio/code-block/code-block-07";
import { Button, buttonVariants } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const initialState: OrganizationFlowActionState = {};

function PersonalInstallationSetup({
  organizationId,
  onBack,
  onCancel,
}: {
  organizationId: string;
  onBack: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createInstallationSetupSession, initialState);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string>();
  useErrorToast(state.error, "Could not create installation", state);
  useErrorToast(checkError, "Verification failed");

  useEffect(() => {
    if (!checking || !state.setupSessionId) {
      return;
    }
    const setupSessionId = state.setupSessionId;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const result = await checkInstallationSetupSession(organizationId, setupSessionId);
      if (!active) {
        return;
      }
      if (result.error) {
        setCheckError(result.error);
      }
      if (result.complete) {
        router.refresh();
        onCancel();
        return;
      }
      timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [checking, onCancel, organizationId, router, state.setupSessionId]);

  if (checking) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Waiting for the verification event</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <CircleNotchIcon className="animate-spin" />
          Checking this computer…
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCheckError(undefined);
              setChecking(false);
            }}
          >
            Back
          </Button>
        </DialogFooter>
      </>
    );
  }

  if (state.setupCommand) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Connect this computer</DialogTitle>
        </DialogHeader>
        <EnrollmentCodeBlock command={state.setupCommand} />
        <DialogFooter className="justify-between sm:justify-between">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              setCheckError(undefined);
              setChecking(true);
            }}
          >
            I&apos;ve run the command
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect a personal computer</DialogTitle>
      </DialogHeader>
      <form action={action} className="flex flex-col gap-5">
        <Input type="hidden" name="organizationId" value={organizationId} />
        <InstallationToolFields />
        <DialogFooter className="justify-between sm:justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating command…" : "Continue"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function TeamInstallationSetup({
  organizationId,
  onBack,
  onDone,
}: {
  organizationId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createTeamInstallation, initialState);
  const [teamTool, setTeamTool] = useState<"codex" | "claude_code">();
  useErrorToast(state.error, "Could not create team installation", state);

  useEffect(() => {
    if (state.teamSettings) {
      router.refresh();
    }
  }, [router, state.teamSettings]);

  if (state.teamSettings) {
    const isCodex = state.teamTool === "codex";
    return (
      <>
        <DialogHeader>
          <DialogTitle>Team installation created</DialogTitle>
          <span className="text-xs/relaxed text-muted-foreground">
            Preserve any existing managed settings and merge this{" "}
            {isCodex ? "OTel table" : "env block"} into them. This token is shown only once.
          </span>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          {isCodex ? (
            <ol className="list-decimal pl-5 text-sm leading-6">
              <li>Merge the generated OTel table into the team&apos;s managed Codex defaults.</li>
              <li>
                Deploy it as <code>/etc/codex/managed_config.toml</code> on macOS or Linux, or
                through device management on supported clients.
              </li>
              <li>Ask team members to restart Codex so the managed defaults apply.</li>
            </ol>
          ) : (
            <ol className="list-decimal pl-5 text-sm leading-6">
              <li>
                Open Claude Admin Settings → Claude Code → Managed settings as an Owner or Primary
                Owner.
              </li>
              <li>Merge the generated env block into the existing JSON, then save it.</li>
              <li>Ask team members to restart Claude Code and approve the OTLP endpoint.</li>
            </ol>
          )}
          <CodeBlock
            filename={isCodex ? "managed_config.toml" : "managed-settings.json"}
            code={state.teamSettings}
            language={isCodex ? "toml" : "json"}
            className="min-w-0 max-w-full"
          />
        </div>
        <DialogFooter className="flex-row flex-wrap items-center justify-between sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {isCodex ? null : (
              <a
                aria-label="Open Claude admin settings"
                href="https://claude.ai/admin-settings/claude-code"
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                Open Claude admin settings
                <ArrowSquareOutIcon data-icon="inline-end" />
              </a>
            )}
            <a
              aria-label={
                isCodex
                  ? "View Codex managed configuration instructions"
                  : "View Claude Code server-managed settings instructions"
              }
              href={
                isCodex
                  ? "https://learn.chatgpt.com/docs/enterprise/managed-configuration"
                  : "https://code.claude.com/docs/en/server-managed-settings"
              }
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "ghost" })}
            >
              View instructions
              <ArrowSquareOutIcon data-icon="inline-end" />
            </a>
          </div>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect a team</DialogTitle>
      </DialogHeader>
      <form action={action} className="flex flex-col gap-5">
        <Input type="hidden" name="organizationId" value={organizationId} />
        <Input type="hidden" name="tool" value={teamTool ?? ""} />
        <ToggleGroup
          value={teamTool ? [teamTool] : []}
          onValueChange={(value) => {
            const nextValue = value[0];
            setTeamTool(
              nextValue === "codex" || nextValue === "claude_code" ? nextValue : undefined,
            );
          }}
          variant="outline"
          spacing={2}
          aria-label="Team AI tool"
          className="grid w-full grid-cols-2"
        >
          <ToggleGroupItem value="codex" className="h-16 min-w-0 justify-start px-4">
            <InstallationToolIdentity tool="codex" />
          </ToggleGroupItem>
          <ToggleGroupItem value="claude_code" className="h-16 min-w-0 justify-start px-4">
            <InstallationToolIdentity tool="claude_code" />
          </ToggleGroupItem>
        </ToggleGroup>
        <DialogFooter className="justify-between sm:justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" disabled={pending || !teamTool}>
            {pending ? "Creating installation…" : "Create installation"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function InstallationTypeStep({
  onCancel,
  onContinue,
}: {
  onCancel: () => void;
  onContinue: (installationType: "personal" | "team") => void;
}) {
  const [installationType, setInstallationType] = useState<"personal" | "team">();

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add installation</DialogTitle>
      </DialogHeader>
      <ToggleGroup
        value={installationType ? [installationType] : []}
        onValueChange={(value) => {
          const nextValue = value[0];
          setInstallationType(
            nextValue === "personal" || nextValue === "team" ? nextValue : undefined,
          );
        }}
        variant="outline"
        spacing={2}
        aria-label="Installation type"
        className="grid w-full grid-cols-1 sm:grid-cols-2"
      >
        <ToggleGroupItem value="personal" className="h-16 min-w-0 justify-start px-4">
          <DesktopIcon />
          Personal
        </ToggleGroupItem>
        <ToggleGroupItem value="team" className="h-16 min-w-0 justify-start px-4">
          <UsersThreeIcon />
          Team
        </ToggleGroupItem>
      </ToggleGroup>
      <DialogFooter className="justify-between sm:justify-between">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!installationType}
          onClick={() => installationType && onContinue(installationType)}
        >
          Continue
        </Button>
      </DialogFooter>
    </>
  );
}

function InstallationSetup({
  isAdmin,
  organizationId,
  onCancel,
}: {
  isAdmin: boolean;
  organizationId: string;
  onCancel: () => void;
}) {
  const [installationType, setInstallationType] = useState<"personal" | "team" | null>(
    isAdmin ? null : "personal",
  );

  if (installationType === "personal") {
    return (
      <PersonalInstallationSetup
        organizationId={organizationId}
        onBack={() => setInstallationType(isAdmin ? null : "personal")}
        onCancel={onCancel}
      />
    );
  }
  if (installationType === "team") {
    return (
      <TeamInstallationSetup
        organizationId={organizationId}
        onBack={() => setInstallationType(null)}
        onDone={onCancel}
      />
    );
  }
  return <InstallationTypeStep onCancel={onCancel} onContinue={setInstallationType} />;
}

export function AddInstallationDialog({
  isAdmin,
  organizationId,
}: {
  isAdmin: boolean;
  organizationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [flowKey, setFlowKey] = useState(0);

  function setDialogOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setFlowKey((current) => current + 1);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon data-icon="inline-start" />
        Add installation
      </DialogTrigger>
      <DialogContent className="min-w-0 overflow-hidden sm:max-w-2xl">
        <InstallationSetup
          key={flowKey}
          isAdmin={isAdmin}
          organizationId={organizationId}
          onCancel={() => setDialogOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
