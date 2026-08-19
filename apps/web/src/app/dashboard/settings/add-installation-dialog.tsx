"use client";

import { CircleNotchIcon, PlusIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import {
  checkInstallationSetupSession,
  createInstallationSetupSession,
  type OrganizationFlowActionState,
} from "@/app/organization-actions";
import { InstallationToolFields } from "@/components/installation-tool-fields";
import EnrollmentCodeBlock from "@/components/shadcn-studio/code-block/code-block-07";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const initialState: OrganizationFlowActionState = {};

function InstallationSetup({
  organizationId,
  onCancel,
}: {
  organizationId: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createInstallationSetupSession, initialState);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string>();

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
        {checkError ? <FieldError>{checkError}</FieldError> : null}
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
        <DialogTitle>Add installation</DialogTitle>
      </DialogHeader>
      <form action={action} className="flex flex-col gap-5">
        <Input type="hidden" name="organizationId" value={organizationId} />
        <InstallationToolFields />
        {state.error ? <FieldError>{state.error}</FieldError> : null}
        <DialogFooter className="justify-between sm:justify-between">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating command…" : "Continue"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function AddInstallationDialog({ organizationId }: { organizationId: string }) {
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
      <DialogContent className="sm:max-w-lg">
        <InstallationSetup
          key={flowKey}
          organizationId={organizationId}
          onCancel={() => setDialogOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
