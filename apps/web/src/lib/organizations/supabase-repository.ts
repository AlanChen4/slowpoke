import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type InvitationRecord,
  OrganizationConflictError,
  type OrganizationRecord,
  type OrganizationRepository,
  type OrganizationRole,
} from "@/lib/organizations/service";

type DatabaseError = {
  code?: string;
  message: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  created_by_user_id: string;
  idempotency_key: string;
};

type InvitationRow = {
  id: string;
  organization_id: string;
  normalized_email: string;
  role: OrganizationRole;
  invited_by_user_id: string;
  expires_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  canceled_at: string | null;
};

function throwDatabaseError(error: DatabaseError): never {
  if (error.code === "23505") {
    throw new OrganizationConflictError(error.message);
  }
  throw new Error(error.message);
}

function organizationRecord(row: OrganizationRow): OrganizationRecord {
  return {
    id: row.id,
    name: row.name,
    createdByUserId: row.created_by_user_id,
    idempotencyKey: row.idempotency_key,
  };
}

function invitationRecord(row: InvitationRow): InvitationRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    normalizedEmail: row.normalized_email,
    role: row.role,
    invitedByUserId: row.invited_by_user_id,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    declinedAt: row.declined_at,
    canceledAt: row.canceled_at,
  };
}

const invitationColumns =
  "id,organization_id,normalized_email,role,invited_by_user_id,expires_at,accepted_at,declined_at,canceled_at";

export class SupabaseOrganizationRepository implements OrganizationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findOrganizationByIdempotency(userId: string, idempotencyKey: string) {
    const { data, error } = await this.client
      .from("organizations")
      .select("id,name,created_by_user_id,idempotency_key")
      .eq("created_by_user_id", userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle<OrganizationRow>();
    if (error) {
      throwDatabaseError(error);
    }
    return data ? organizationRecord(data) : null;
  }

  async insertOrganization(input: {
    name: string;
    createdByUserId: string;
    idempotencyKey: string;
  }) {
    const { data, error } = await this.client
      .from("organizations")
      .insert({
        name: input.name,
        created_by_user_id: input.createdByUserId,
        idempotency_key: input.idempotencyKey,
      })
      .select("id,name,created_by_user_id,idempotency_key")
      .single<OrganizationRow>();
    if (error) {
      throwDatabaseError(error);
    }
    return organizationRecord(data);
  }

  async ensureFounderMembership(organizationId: string, userId: string) {
    const { error } = await this.client
      .from("organization_members")
      .upsert(
        { organization_id: organizationId, user_id: userId, role: "admin" },
        { onConflict: "organization_id,user_id" },
      );
    if (error) {
      throwDatabaseError(error);
    }
  }

  async getMembershipRole(organizationId: string, userId: string) {
    const { data, error } = await this.client
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle<{ role: OrganizationRole }>();
    if (error) {
      throwDatabaseError(error);
    }
    return data?.role ?? null;
  }

  async findPendingInvitation(organizationId: string, normalizedEmail: string) {
    const { data, error } = await this.client
      .from("organization_invitations")
      .select(invitationColumns)
      .eq("organization_id", organizationId)
      .eq("normalized_email", normalizedEmail)
      .is("accepted_at", null)
      .is("declined_at", null)
      .is("canceled_at", null)
      .maybeSingle<InvitationRow>();
    if (error) {
      throwDatabaseError(error);
    }
    return data ? invitationRecord(data) : null;
  }

  async insertInvitation(input: {
    organizationId: string;
    normalizedEmail: string;
    role: OrganizationRole;
    invitedByUserId: string;
    expiresAt: string;
  }) {
    const { data, error } = await this.client
      .from("organization_invitations")
      .insert({
        organization_id: input.organizationId,
        normalized_email: input.normalizedEmail,
        role: input.role,
        invited_by_user_id: input.invitedByUserId,
        expires_at: input.expiresAt,
      })
      .select(invitationColumns)
      .single<InvitationRow>();
    if (error) {
      throwDatabaseError(error);
    }
    return invitationRecord(data);
  }

  async getInvitation(invitationId: string) {
    const { data, error } = await this.client
      .from("organization_invitations")
      .select(invitationColumns)
      .eq("id", invitationId)
      .maybeSingle<InvitationRow>();
    if (error) {
      throwDatabaseError(error);
    }
    return data ? invitationRecord(data) : null;
  }

  async restartPendingInvitation(
    invitationId: string,
    invitedByUserId: string,
    expiresAt: string,
    updatedAt: string,
  ) {
    return this.updatePendingInvitation(invitationId, {
      invited_by_user_id: invitedByUserId,
      expires_at: expiresAt,
      updated_at: updatedAt,
    });
  }

  async cancelPendingInvitation(invitationId: string, canceledAt: string) {
    return this.updatePendingInvitation(invitationId, {
      canceled_at: canceledAt,
      updated_at: canceledAt,
    });
  }

  async acceptPendingInvitation(invitationId: string, acceptedAt: string) {
    const { data, error } = await this.client
      .from("organization_invitations")
      .update({ accepted_at: acceptedAt, updated_at: acceptedAt })
      .eq("id", invitationId)
      .is("accepted_at", null)
      .is("declined_at", null)
      .is("canceled_at", null)
      .gt("expires_at", acceptedAt)
      .select(invitationColumns)
      .maybeSingle<InvitationRow>();
    if (error) {
      throwDatabaseError(error);
    }
    return data ? invitationRecord(data) : null;
  }

  async declinePendingInvitation(invitationId: string, declinedAt: string) {
    const { data, error } = await this.client
      .from("organization_invitations")
      .update({ declined_at: declinedAt, updated_at: declinedAt })
      .eq("id", invitationId)
      .is("accepted_at", null)
      .is("declined_at", null)
      .is("canceled_at", null)
      .gt("expires_at", declinedAt)
      .select(invitationColumns)
      .maybeSingle<InvitationRow>();
    if (error) {
      throwDatabaseError(error);
    }
    return data ? invitationRecord(data) : null;
  }

  async ensureInvitationMembership(organizationId: string, userId: string, role: OrganizationRole) {
    const { error } = await this.client
      .from("organization_members")
      .upsert(
        { organization_id: organizationId, user_id: userId, role },
        { ignoreDuplicates: true, onConflict: "organization_id,user_id" },
      );
    if (error) {
      throwDatabaseError(error);
    }
  }

  private async updatePendingInvitation(invitationId: string, updates: Record<string, string>) {
    const { data, error } = await this.client
      .from("organization_invitations")
      .update(updates)
      .eq("id", invitationId)
      .is("accepted_at", null)
      .is("declined_at", null)
      .is("canceled_at", null)
      .select(invitationColumns)
      .maybeSingle<InvitationRow>();
    if (error) {
      throwDatabaseError(error);
    }
    return data ? invitationRecord(data) : null;
  }
}
