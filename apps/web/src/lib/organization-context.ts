import "server-only";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

export const ORGANIZATION_COOKIE = "slowpoke_organization_id";

export type WorkspaceOrganization = {
  id: string;
  name: string;
  logoUrl: string | null;
  createdAt: string;
  role: "admin" | "member";
};

type MembershipRow = {
  organization_id: string;
  role: "admin" | "member";
  organizations:
    | { id: string; name: string; logo_url: string | null; created_at: string }
    | { id: string; name: string; logo_url: string | null; created_at: string }[]
    | null;
};

export async function getOrganizationContext() {
  const [supabase, cookieStore] = await Promise.all([createClient(), cookies()]);
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id,role,organizations(id,name,logo_url,created_at)")
    .order("created_at", { ascending: true });

  const organizations = ((data ?? []) as unknown as MembershipRow[]).flatMap(
    (membership): WorkspaceOrganization[] => {
      const organization = Array.isArray(membership.organizations)
        ? membership.organizations[0]
        : membership.organizations;

      if (!organization) {
        return [];
      }

      return [
        {
          id: membership.organization_id,
          name: organization.name,
          logoUrl: organization.logo_url,
          createdAt: organization.created_at,
          role: membership.role,
        },
      ];
    },
  );
  const requestedOrganizationId = cookieStore.get(ORGANIZATION_COOKIE)?.value;
  const selectedOrganization =
    organizations.find((organization) => organization.id === requestedOrganizationId) ??
    organizations[0] ??
    null;

  return { organizations, selectedOrganization, error };
}
