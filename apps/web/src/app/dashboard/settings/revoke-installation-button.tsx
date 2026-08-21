"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { revokeInstallation, type OrganizationFlowActionState } from "@/app/organization-actions";
import { useErrorToast } from "@/components/error-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: OrganizationFlowActionState = {};

export function RevokeInstallationButton({
  installationId,
  organizationId,
}: {
  installationId: string;
  organizationId: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(revokeInstallation, initialState);
  useErrorToast(state.error, "Could not revoke installation", state);
  useEffect(() => {
    if (state.message) {
      router.refresh();
    }
  }, [router, state.message]);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Input type="hidden" name="installationId" value={installationId} />
      <Input type="hidden" name="organizationId" value={organizationId} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? "Revoking…" : "Revoke"}
      </Button>
    </form>
  );
}
