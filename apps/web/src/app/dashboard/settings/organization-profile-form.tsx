"use client";

import { UploadSimpleIcon } from "@phosphor-icons/react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { type OrganizationActionState, updateOrganization } from "@/app/dashboard/actions";
import { useErrorToast } from "@/components/feedback/error-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type OrganizationProfileFormProps = {
  organization: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
};

const initialState: OrganizationActionState = {};

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function OrganizationProfileForm({ organization }: OrganizationProfileFormProps) {
  const [state, formAction] = useActionState(updateOrganization, initialState);
  const [name, setName] = useState(organization.name);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>();
  const logoInputRef = useRef<HTMLInputElement>(null);
  useErrorToast(state.error, "Could not update organization", state);

  useEffect(
    () => () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    },
    [logoPreviewUrl],
  );

  function previewLogo(file: File | undefined) {
    setLogoPreviewUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }

      return file ? URL.createObjectURL(file) : undefined;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Input type="hidden" name="organizationId" value={organization.id} />
      <div className="flex items-end gap-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label="Change organization logo"
                className="group/logo size-14"
                onClick={() => logoInputRef.current?.click()}
              />
            }
          >
            <Avatar className="size-14 rounded-none after:hidden">
              {logoPreviewUrl || organization.logoUrl ? (
                <AvatarImage
                  className="rounded-none"
                  src={logoPreviewUrl ?? organization.logoUrl ?? undefined}
                  alt=""
                />
              ) : null}
              <AvatarFallback className="rounded-none">
                {organization.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
              <span className="absolute inset-0 flex items-center justify-center bg-foreground/70 text-sm text-background opacity-0 transition-opacity group-hover/logo:opacity-100 group-focus-visible/logo:opacity-100">
                <UploadSimpleIcon aria-hidden="true" />
                <span className="sr-only">Change logo</span>
              </span>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent side="right">
            Change logo. PNG, JPEG, WebP, or GIF, up to 2 MB.
          </TooltipContent>
        </Tooltip>
        <Input
          ref={logoInputRef}
          id="organization-logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(event) => previewLogo(event.target.files?.[0])}
        />
        <FieldGroup className="flex-1">
          <Field>
            <FieldLabel htmlFor="organization-name">Name</FieldLabel>
            <Input
              id="organization-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
            />
          </Field>
        </FieldGroup>
      </div>
      {state.message ? (
        <output className="text-xs text-muted-foreground">{state.message}</output>
      ) : null}
      <div>
        <SaveButton />
      </div>
    </form>
  );
}
