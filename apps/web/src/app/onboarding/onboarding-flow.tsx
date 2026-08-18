"use client";

/* CardTitle renders a div so onboarding can provide accessible headings without native heading elements. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { CheckCircleIcon, CircleNotchIcon } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useActionState, useCallback, useEffect, useState } from "react";

import {
  acceptInvitation,
  checkInstallationEnrollment,
  createInstallationEnrollment,
  createOrganization,
  declineInvitation,
  type OrganizationFlowActionState,
} from "@/app/organization-actions";
import EnrollmentCodeBlock from "@/components/shadcn-studio/code-block/code-block-07";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PendingInvitation } from "@/lib/onboarding-data";

const initialState: OrganizationFlowActionState = {};
const stepLabels = ["Organization", "AI tools", "Connect", "Check", "Complete"];

type OrganizationChoice = { id: string; name: string };

function OrganizationChoiceRow({
  actions,
  children,
  name,
}: {
  actions: ReactNode;
  children?: ReactNode;
  name: string;
}) {
  return (
    <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="font-medium">{name}</div>
        {children ? (
          <div className="flex items-center gap-2 text-muted-foreground">{children}</div>
        ) : null}
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}

function Progress({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Onboarding progress">
      {stepLabels.map((label, index) => (
        <li key={label} className="flex min-w-0 flex-col gap-1.5">
          <span
            className={`h-1 ${index + 1 <= current ? "bg-primary" : "bg-border"}`}
            aria-hidden="true"
          />
          <span className="truncate text-center text-[10px] text-muted-foreground">{label}</span>
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
    <div className="flex flex-col gap-2">
      <OrganizationChoiceRow
        name={invitation.organizationName}
        actions={
          <>
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
          </>
        }
      >
        <Badge variant="outline">{invitation.role === "admin" ? "Administrator" : "Member"}</Badge>
        <span>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>
      </OrganizationChoiceRow>
      {acceptState.error || declineState.error ? (
        <FieldError>{acceptState.error ?? declineState.error}</FieldError>
      ) : null}
    </div>
  );
}

function UnfinishedOrganizationChoice({
  organization,
  onContinue,
}: {
  organization: OrganizationChoice;
  onContinue: (organization: OrganizationChoice) => void;
}) {
  return (
    <OrganizationChoiceRow
      name={organization.name}
      actions={
        <Button type="button" variant="secondary" onClick={() => onContinue(organization)}>
          Continue setup
        </Button>
      }
    />
  );
}

function OrganizationStep({
  idempotencyKey,
  invitations,
  unfinishedOrganizations,
  onOrganization,
  onInvitationDeclined,
}: {
  idempotencyKey: string;
  invitations: PendingInvitation[];
  unfinishedOrganizations: OrganizationChoice[];
  onOrganization: (organization: OrganizationChoice) => void;
  onInvitationDeclined: (invitationId: string) => void;
}) {
  const [state, action, pending] = useActionState(createOrganization, initialState);
  useEffect(() => {
    if (state.organizationId && state.organizationName) {
      onOrganization({ id: state.organizationId, name: state.organizationName });
    }
  }, [onOrganization, state.organizationId, state.organizationName]);

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={1} className="text-base">
          Create your organization
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form action={action} className="flex flex-col gap-4">
          <Input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-organization-name">Organization name</FieldLabel>
              <div className="flex items-end gap-2">
                <Input id="new-organization-name" name="name" maxLength={80} required />
                <Button type="submit" disabled={pending}>
                  {pending ? "Creating…" : "Create organization"}
                </Button>
              </div>
            </Field>
          </FieldGroup>
          {state.error ? <FieldError>{state.error}</FieldError> : null}
        </form>
        {unfinishedOrganizations.length > 0 || invitations.length > 0 ? (
          <FieldSeparator>or</FieldSeparator>
        ) : null}
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
        {unfinishedOrganizations.length > 0 ? (
          <div className="flex flex-col gap-1">
            {unfinishedOrganizations.map((organization) => (
              <UnfinishedOrganizationChoice
                key={organization.id}
                organization={organization}
                onContinue={onOrganization}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ToolStep({
  organization,
  onBack,
  onEnrollment,
}: {
  organization: OrganizationChoice;
  onBack: () => void;
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
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-5">
          <Input type="hidden" name="organizationId" value={organization.id} />
          <FieldSet className="grid gap-3 sm:grid-cols-2">
            <FieldLegend className="sr-only">AI tools</FieldLegend>
            {[
              ["codex", "Codex", "/openai-logo.png"],
              ["claude_code", "Claude Code", "/claude-logo.png"],
            ].map(([value, label, logo]) => (
              <FieldLabel key={value} className="cursor-pointer">
                <Field orientation="horizontal">
                  <Input
                    type="checkbox"
                    name="tools"
                    value={value}
                    aria-label={label}
                    className="size-4"
                  />
                  <FieldTitle>
                    <Image
                      src={logo}
                      alt=""
                      aria-hidden="true"
                      width={18}
                      height={18}
                      className="shrink-0 object-contain"
                    />
                    {label}
                  </FieldTitle>
                </Field>
              </FieldLabel>
            ))}
          </FieldSet>
          {state.error ? <FieldError>{state.error}</FieldError> : null}
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" onClick={onBack}>
              Back
            </Button>
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
  onBack,
  onCheck,
}: {
  command: string;
  checking: boolean;
  onBack: () => void;
  onCheck: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={1} className="text-base">
          Connect this computer
        </CardTitle>
      </CardHeader>
      <CardContent>
        <EnrollmentCodeBlock command={command} />
      </CardContent>
      <CardFooter className="justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
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
  unfinishedOrganizations: initialUnfinishedOrganizations,
  invitations: initialInvitations,
  loadError,
}: {
  idempotencyKey: string;
  initialOrganization: OrganizationChoice | null;
  unfinishedOrganizations: OrganizationChoice[];
  invitations: PendingInvitation[];
  loadError?: string;
}) {
  const router = useRouter();
  const [organization, setOrganization] = useState(initialOrganization);
  const [unfinishedOrganizations, setUnfinishedOrganizations] = useState(
    initialUnfinishedOrganizations,
  );
  const [invitations, setInvitations] = useState(initialInvitations);
  const [enrollment, setEnrollment] = useState<OrganizationFlowActionState>();
  const [checking, setChecking] = useState(false);
  const [complete, setComplete] = useState(false);
  const [checkError, setCheckError] = useState<string>();
  const chooseOrganization = useCallback(
    (choice: OrganizationChoice) => {
      setOrganization(choice);
      setUnfinishedOrganizations((current) =>
        current.some((organization) => organization.id === choice.id)
          ? current
          : [...current, choice],
      );
      setInvitations((current) =>
        current.filter((invitation) => invitation.organizationId !== choice.id),
      );
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
            <div className="flex items-center gap-2">
              <div className="flex size-4 animate-spin items-center justify-center text-primary">
                <CircleNotchIcon />
              </div>
              <CardTitle role="heading" aria-level={1} className="text-base">
                Waiting for the verification event
              </CardTitle>
            </div>
          </CardHeader>
          {checkError ? (
            <CardContent>
              <FieldError>{checkError}</FieldError>
            </CardContent>
          ) : null}
          <CardFooter>
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
          </CardFooter>
        </Card>
      ) : enrollment?.setupCommand ? (
        <ConnectionStep
          command={enrollment.setupCommand}
          checking={checking}
          onBack={() => {
            setCheckError(undefined);
            setEnrollment(undefined);
          }}
          onCheck={() => {
            setCheckError(undefined);
            setChecking(true);
          }}
        />
      ) : organization ? (
        <ToolStep
          organization={organization}
          onBack={() => {
            setOrganization(null);
            router.replace("/onboarding?create=1");
          }}
          onEnrollment={setEnrollment}
        />
      ) : (
        <OrganizationStep
          idempotencyKey={idempotencyKey}
          invitations={invitations}
          unfinishedOrganizations={unfinishedOrganizations}
          onOrganization={chooseOrganization}
          onInvitationDeclined={(invitationId) =>
            setInvitations((current) => current.filter((item) => item.id !== invitationId))
          }
        />
      )}
    </div>
  );
}
