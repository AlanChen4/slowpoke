"use client";

import { useActionState } from "react";

import { continueWithEmail, type AuthActionState } from "@/app/auth/actions";
import { AuthBrand } from "@/components/auth/auth-brand";
import { Button } from "@/components/ui/button";
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

export function MagicLinkForm({ className, ...props }: React.ComponentProps<"div">) {
  const [state, formAction, pending] = useActionState(continueWithEmail, initialState);

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form action={formAction}>
        <FieldGroup>
          <div className="flex justify-center">
            <AuthBrand />
          </div>
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
            <Button variant="outline" type="button" disabled>
              Continue with Apple
            </Button>
            <Button variant="outline" type="button" disabled>
              Continue with Google
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center">
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </FieldDescription>
    </div>
  );
}
