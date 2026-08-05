"use client";

import Link from "next/link";
import { useActionState } from "react";

import { continueWithEmail, type AuthActionState } from "@/app/auth/actions";
import { AuthBrand } from "@/components/auth/auth-brand";
import { GitHubLogo, GoogleLogo } from "@/components/auth/provider-logos";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const initialState: AuthActionState = {};

type MagicLinkFormProps = React.ComponentProps<"div"> & {
  authError?: string;
};

export function MagicLinkForm({ authError, className, ...props }: MagicLinkFormProps) {
  const [state, formAction, pending] = useActionState(continueWithEmail, initialState);

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form action={formAction}>
        <FieldGroup>
          <div className="flex justify-center">
            <AuthBrand />
          </div>
          {authError ? <FieldError className="text-center">{authError}</FieldError> : null}
          <Field data-invalid={Boolean(state.error)}>
            <FieldLabel htmlFor="auth-email">Email</FieldLabel>
            <Input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              aria-invalid={Boolean(state.error)}
              required
            />
            <FieldError>{state.error}</FieldError>
          </Field>
          {state.message ? (
            <FieldDescription className="text-center">{state.message}</FieldDescription>
          ) : null}
          <Field>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Continuing…" : "Continue"}
            </Button>
          </Field>
          <FieldSeparator>Or</FieldSeparator>
          <Field className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/auth/oauth?provider=github"
              prefetch={false}
              className={buttonVariants({ variant: "secondary" })}
            >
              <GitHubLogo data-icon="inline-start" />
              Continue with GitHub
            </Link>
            <Link
              href="/auth/oauth?provider=google"
              prefetch={false}
              className={buttonVariants({ variant: "secondary" })}
            >
              <GoogleLogo className="size-4" data-icon="inline-start" />
              Continue with Google
            </Link>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </FieldDescription>
    </div>
  );
}
