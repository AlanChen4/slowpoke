"use client";

/* CardTitle renders a div so onboarding can provide accessible headings without native heading elements. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import {
  CheckCircleIcon,
  CircleNotchIcon,
  ClipboardIcon,
  DesktopIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useState } from "react";

import {
  acceptInvitation,
  checkInstallationEnrollment,
  createInstallationEnrollment,
  createOrganization,
  declineInvitation,
  type OrganizationFlowActionState,
} from "@/app/organization-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PendingInvitation } from "@/lib/onboarding-data";

const initialState: OrganizationFlowActionState = {};
const stepLabels = ["Organization", "AI tools", "Connect", "Check", "Complete"];

type OrganizationChoice = { id: string; name: string };

function Progress({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Onboarding progress">
      {stepLabels.map((label, index) => (
        <li key={label} className="flex min-w-0 flex-col gap-1.5">
          <span
            className={`h-1 ${index + 1 <= current ? "bg-primary" : "bg-border"}`}
            aria-hidden="true"
          />
          <span className="truncate text-[10px] text-muted-foreground">{label}</span>
        </li>
      ))}
    </ol>
  );
}

function InvitationChoice({
  invitation,
  onAccepted,
  onDeclined,
}: {
  invitation: PendingInvitation;
  onAccepted: (organization: OrganizationChoice) => void;
  onDeclined: (invitationId: string) => void;
}) {
  const [acceptState, acceptAction, accepting] = useActionState(acceptInvitation, initialState);
  const [declineState, declineAction, declining] = useActionState(declineInvitation, initialState);

  useEffect(() => {
    if (acceptState.organizationId) {
      onAccepted({ id: acceptState.organizationId, name: invitation.organizationName });
    }
  }, [acceptState.organizationId, invitation.organizationName, onAccepted]);
  useEffect(() => {
    if (declineState.message) {
      onDeclined(invitation.id);
    }
  }, [declineState.message, invitation.id, onDeclined]);

  return (
    <div className="flex flex-col gap-3 border p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{invitation.organizationName}</div>
        <div className="mt-1 flex items-center gap-2 text-muted-foreground">
          <Badge variant="outline">
            {invitation.role === "admin" ? "Administrator" : "Member"}
          </Badge>
          <span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <form action={declineAction}>
          <Input type="hidden" name="invitationId" value={invitation.id} />
          <Button type="submit" variant="outline" disabled={declining || accepting}>
            {declining ? "Declining…" : "Decline"}
          </Button>
        </form>
        <form action={acceptAction}>
          <Input type="hidden" name="invitationId" value={invitation.id} />
          <Button type="submit" disabled={accepting || declining}>
            {accepting ? "Accepting…" : "Accept"}
          </Button>
        </form>
      </div>
      {acceptState.error || declineState.error ? (
        <FieldError className="sm:basis-full">{acceptState.error ?? declineState.error}</FieldError>
      ) : null}
    </div>
  );
}

function OrganizationStep({
  idempotencyKey,
  invitations,
  onOrganization,
  onInvitationDeclined,
}: {
  idempotencyKey: string;
  invitations: PendingInvitation[];
  onOrganization: (organization: OrganizationChoice) => void;
  onInvitationDeclined: (invitationId: string) => void;
}) {
  const [state, action, pending] = useActionState(createOrganization, initialState);
  useEffect(() => {
    if (state.organizationId) {
      onOrganization({ id: state.organizationId, name: "Your organization" });
    }
  }, [onOrganization, state.organizationId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={1} className="text-base">
          Create your organization
        </CardTitle>
        <CardDescription>
          Accept an invitation, or create a separate workspace for your team.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {invitations.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="font-medium">Pending invitations</div>
            {invitations.map((invitation) => (
              <InvitationChoice
                key={invitation.id}
                invitation={invitation}
                onAccepted={onOrganization}
                onDeclined={onInvitationDeclined}
              />
            ))}
          </div>
        ) : null}
        <form action={action} className="flex flex-col gap-4 border-t pt-5">
          <Input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-organization-name">Organization name</FieldLabel>
              <Input id="new-organization-name" name="name" maxLength={80} required />
            </Field>
          </FieldGroup>
          {state.error ? <FieldError>{state.error}</FieldError> : null}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create organization"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ToolStep({
  organization,
  onEnrollment,
}: {
  organization: OrganizationChoice;
  onEnrollment: (state: OrganizationFlowActionState) => void;
}) {
  const [state, action, pending] = useActionState(createInstallationEnrollment, initialState);
  useEffect(() => {
    if (state.setupCommand && state.enrollmentId) {
      onEnrollment(state);
    }
  }, [onEnrollment, state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={1} className="text-base">
          Choose your AI tools
        </CardTitle>
        <CardDescription>
          Each installation connects one AI tool on one computer. This computer can have both.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-5">
          <Input type="hidden" name="organizationId" value={organization.id} />
          <FieldSet className="grid gap-3 sm:grid-cols-2">
            <FieldLegend className="sr-only">AI tools</FieldLegend>
            {[
              ["codex", "Codex", "OpenAI Codex prompts and activity"],
              ["claude_code", "Claude Code", "Anthropic Claude Code prompts and activity"],
            ].map(([value, label, description]) => (
              <FieldLabel key={value} className="cursor-pointer">
                <Field orientation="horizontal">
                  <Input
                    type="checkbox"
                    name="tools"
                    value={value}
                    aria-label={label}
                    className="size-4"
                  />
                  <FieldContent>
                    <FieldTitle>{label}</FieldTitle>
                    <FieldDescription>{description}</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            ))}
          </FieldSet>
          {state.error ? <FieldError>{state.error}</FieldError> : null}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating command…" : "Continue"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ConnectionStep({
  command,
  checking,
  onCheck,
}: {
  command: string;
  checking: boolean;
  onCheck: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={1} className="text-base">
          Connect this computer
        </CardTitle>
        <CardDescription>
          Run this command in a terminal on the computer you want to connect. It expires in 15
          minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative border bg-foreground p-4 pr-12 text-background">
          <code className="block overflow-x-auto whitespace-nowrap font-mono text-xs">
            {command}
          </code>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="absolute right-2 top-2"
            aria-label="Copy setup command"
            onClick={async () => {
              await navigator.clipboard.writeText(command);
              setCopied(true);
            }}
          >
            <ClipboardIcon />
          </Button>
        </div>
        <output className="mt-2 block text-xs text-muted-foreground">
          {copied ? "Command copied." : "The code is used only to create this installation."}
        </output>
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="button" onClick={onCheck} disabled={checking}>
          {checking ? "Checking…" : "I've run the command"}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function OnboardingFlow({
  idempotencyKey,
  initialOrganization,
  invitations: initialInvitations,
  loadError,
}: {
  idempotencyKey: string;
  initialOrganization: OrganizationChoice | null;
  invitations: PendingInvitation[];
  loadError?: string;
}) {
  const router = useRouter();
  const [organization, setOrganization] = useState(initialOrganization);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [enrollment, setEnrollment] = useState<OrganizationFlowActionState>();
  const [checking, setChecking] = useState(false);
  const [complete, setComplete] = useState(false);
  const [checkError, setCheckError] = useState<string>();
  const chooseOrganization = useCallback(
    (choice: OrganizationChoice) => {
      setOrganization(choice);
      router.replace(`/onboarding?organization=${choice.id}`);
    },
    [router],
  );

  useEffect(() => {
    if (!checking || !organization || !enrollment?.enrollmentId) {
      return;
    }
    const organizationId = organization.id;
    const enrollmentId = enrollment.enrollmentId;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const result = await checkInstallationEnrollment(organizationId, enrollmentId);
      if (!active) {
        return;
      }
      if (result.error) {
        setCheckError(result.error);
      }
      if (result.complete) {
        setComplete(true);
        setChecking(false);
        return;
      }
      timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [checking, enrollment?.enrollmentId, organization]);

  const currentStep = complete
    ? 5
    : checking
      ? 4
      : enrollment?.setupCommand
        ? 3
        : organization
          ? 2
          : 1;

  return (
    <div className="flex w-full flex-col gap-6">
      <Progress current={currentStep} />
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Onboarding could not be fully loaded</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}
      {complete ? (
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-8 items-center justify-center text-primary">
              <CheckCircleIcon />
            </div>
            <CardTitle role="heading" aria-level={1} className="text-base">
              Your computer is connected
            </CardTitle>
            <CardDescription>
              Slowpoke verified every selected AI tool on this computer.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href="/dashboard?scope=human" className={buttonVariants()}>
              Go to Prompts
            </Link>
          </CardFooter>
        </Card>
      ) : checking ? (
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-8 animate-spin items-center justify-center text-primary">
              <CircleNotchIcon />
            </div>
            <CardTitle role="heading" aria-level={1} className="text-base">
              Checking the connection
            </CardTitle>
            <CardDescription>
              Keep this page open. Verification usually takes a few seconds.
            </CardDescription>
          </CardHeader>
          {checkError ? (
            <CardContent>
              <FieldError>{checkError}</FieldError>
            </CardContent>
          ) : null}
        </Card>
      ) : enrollment?.setupCommand ? (
        <ConnectionStep
          command={enrollment.setupCommand}
          checking={checking}
          onCheck={() => {
            setCheckError(undefined);
            setChecking(true);
          }}
        />
      ) : organization ? (
        <ToolStep organization={organization} onEnrollment={setEnrollment} />
      ) : (
        <OrganizationStep
          idempotencyKey={idempotencyKey}
          invitations={invitations}
          onOrganization={chooseOrganization}
          onInvitationDeclined={(invitationId) =>
            setInvitations((current) => current.filter((item) => item.id !== invitationId))
          }
        />
      )}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <DesktopIcon />
        You can connect more computers later from Settings.
      </div>
    </div>
  );
}
