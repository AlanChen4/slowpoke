import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/app/onboarding/onboarding-flow";
import { getAuthClaims } from "@/lib/auth-context";
import { getPendingInvitations } from "@/lib/onboarding-data";
import { getOrganizationContext } from "@/lib/organization-context";

type OnboardingPageProps = {
  searchParams: Promise<{ create?: string; organization?: string }>;
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const [{ data: claimsData, error: claimsError }, organizationContext, params] = await Promise.all(
    [getAuthClaims(), getOrganizationContext(), searchParams],
  );
  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const requestedOrganization = organizationContext.organizations.find(
    (organization) => organization.id === params.organization,
  );
  const selectedOrganization = requestedOrganization ?? organizationContext.selectedOrganization;
  const creatingOrganization = params.create === "1";
  if (selectedOrganization?.completed && !creatingOrganization) {
    redirect("/dashboard");
  }

  const email = claimsData.claims.email;
  const { invitations, error: invitationError } = email
    ? await getPendingInvitations(email)
    : { invitations: [], error: null };

  return (
    <OnboardingFlow
      idempotencyKey={randomUUID()}
      initialOrganization={
        creatingOrganization || !selectedOrganization
          ? null
          : { id: selectedOrganization.id, name: selectedOrganization.name }
      }
      invitations={invitations}
      loadError={organizationContext.error?.message ?? invitationError?.message}
    />
  );
}
