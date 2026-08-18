import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type PendingInvitation = {
  expiresAt: string;
  id: string;
  organizationId: string;
  organizationName: string;
  role: "admin" | "member";
};

type InvitationRow = {
  expires_at: string;
  id: string;
  organization_id: string;
  organizations: { name: string } | { name: string }[] | null;
  role: "admin" | "member";
};

export async function getPendingInvitations(email: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_invitations")
    .select("id,organization_id,role,expires_at,organizations(name)")
    .eq("normalized_email", email.trim().toLowerCase())
    .is("accepted_at", null)
    .is("declined_at", null)
    .is("canceled_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .overrideTypes<InvitationRow[], { merge: false }>();

  return {
    error,
    invitations: (data ?? []).flatMap((row): PendingInvitation[] => {
      const organization = Array.isArray(row.organizations)
        ? row.organizations[0]
        : row.organizations;
      return organization
        ? [
            {
              expiresAt: row.expires_at,
              id: row.id,
              organizationId: row.organization_id,
              organizationName: organization.name,
              role: row.role,
            },
          ]
        : [];
    }),
  };
}
