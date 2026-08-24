import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export const ORGANIZATION_COOKIE = "slowpoke_organization_id";

export type WorkspaceOrganization = {
  completed: boolean;
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

export const getOrganizationContext = cache(async function getOrganizationContext() {
  const [supabase, cookieStore] = await Promise.all([createClient(), cookies()]);
  const [{ data, error }, { data: userData }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("organization_id,role,organizations(id,name,logo_url,created_at)")
      .order("created_at", { ascending: true })
      .overrideTypes<MembershipRow[], { merge: false }>(),
    supabase.auth.getUser(),
  ]);
  const { data: completedRows, error: completionError } = userData.user
    ? await supabase
        .from("installations")
        .select("organization_id")
        .eq("created_by_user_id", userData.user.id)
        .is("revoked_at", null)
        .not("verified_at", "is", null)
        .overrideTypes<{ organization_id: string }[], { merge: false }>()
    : { data: [], error: null };
  const completedOrganizationIds = new Set(
    (completedRows ?? []).map((installation) => installation.organization_id),
  );

  const organizations = (data ?? []).flatMap((membership): WorkspaceOrganization[] => {
    const organization = Array.isArray(membership.organizations)
      ? membership.organizations[0]
      : membership.organizations;

    if (!organization) {
      return [];
    }

    return [
      {
        completed: completedOrganizationIds.has(membership.organization_id),
        id: membership.organization_id,
        name: organization.name,
        logoUrl: organization.logo_url,
        createdAt: organization.created_at,
        role: membership.role,
      },
    ];
  });
  const requestedOrganizationId = cookieStore.get(ORGANIZATION_COOKIE)?.value;
  const selectedOrganization =
    organizations.find((organization) => organization.id === requestedOrganizationId) ??
    organizations.find((organization) => organization.completed) ??
    organizations[0] ??
    null;

  return { organizations, selectedOrganization, error: error ?? completionError };
});
