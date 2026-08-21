"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import {
  cancelInvitation,
  createOrganizationInvitation,
  resendInvitation,
  type OrganizationFlowActionState,
} from "@/app/organization-actions";
import { useErrorToast } from "@/components/error-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const initialState: OrganizationFlowActionState = {};

export type SettingsInvitation = {
  email: string;
  expiresAt: string;
  id: string;
  role: "admin" | "member";
};

function InvitationActions({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [resendState, resendAction, resending] = useActionState(resendInvitation, initialState);
  const [cancelState, cancelAction, canceling] = useActionState(cancelInvitation, initialState);
  useErrorToast(resendState.error, "Could not resend invitation", resendState);
  useErrorToast(cancelState.error, "Could not cancel invitation", cancelState);
  useEffect(() => {
    if (resendState.message || cancelState.message) {
      router.refresh();
    }
  }, [cancelState.message, resendState.message, router]);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <form action={resendAction}>
          <Input type="hidden" name="invitationId" value={invitationId} />
          <Button type="submit" variant="outline" size="sm" disabled={resending || canceling}>
            {resending ? "Resending…" : "Resend"}
          </Button>
        </form>
        <form action={cancelAction}>
          <Input type="hidden" name="invitationId" value={invitationId} />
          <Button type="submit" variant="destructive" size="sm" disabled={canceling || resending}>
            {canceling ? "Canceling…" : "Cancel"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export function InvitationSettings({
  invitations,
  organizationId,
}: {
  invitations: SettingsInvitation[];
  organizationId: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createOrganizationInvitation, initialState);
  useErrorToast(state.error, "Could not send invitation", state);
  useEffect(() => {
    if (state.message) {
      router.refresh();
    }
  }, [router, state.message]);

  return (
    <div className="flex flex-col gap-6">
      <form
        action={action}
        className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end"
      >
        <Input type="hidden" name="organizationId" value={organizationId} />
        <FieldGroup className="contents">
          <Field>
            <FieldLabel htmlFor="invitation-email">Email</FieldLabel>
            <Input id="invitation-email" name="email" type="email" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="invitation-role">Role</FieldLabel>
            <select
              id="invitation-role"
              name="role"
              defaultValue="member"
              className="h-8 border bg-background px-2 text-xs"
            >
              <option value="member">Member</option>
              <option value="admin">Administrator</option>
            </select>
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting…" : "Invite"}
        </Button>
      </form>
      {state.message ? (
        <output className="text-xs text-muted-foreground">{state.message}</output>
      ) : null}

      {invitations.length > 0 ? (
        <div className="divide-y border">
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{invitation.email}</div>
                <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                  <Badge variant="outline">
                    {invitation.role === "admin" ? "Administrator" : "Member"}
                  </Badge>
                  <span>Expires {new Date(invitation.expiresAt).toLocaleString()}</span>
                </div>
              </div>
              <InvitationActions invitationId={invitation.id} />
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-dashed p-5 text-center text-muted-foreground">
          No pending invitations.
        </div>
      )}
    </div>
  );
}
