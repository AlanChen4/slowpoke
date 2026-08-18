import { describe, expect, it } from "vitest";

import {
  cancelOrganizationInvitation,
  createInvitationForOrganization,
  createOrganizationForUser,
  type InvitationRecord,
  OrganizationFlowError,
  type OrganizationRecord,
  type OrganizationRepository,
  type OrganizationRole,
  resendOrganizationInvitation,
  respondToOrganizationInvitation,
} from "./service";

class MemoryOrganizationRepository implements OrganizationRepository {
  organizations: OrganizationRecord[] = [];
  invitations: InvitationRecord[] = [];
  memberships = new Map<string, OrganizationRole>();
  private nextOrganizationId = 1;
  private nextInvitationId = 1;

  private membershipKey(organizationId: string, userId: string) {
    return `${organizationId}:${userId}`;
  }

  removeMembership(organizationId: string, userId: string) {
    this.memberships.delete(this.membershipKey(organizationId, userId));
  }

  membershipRole(organizationId: string, userId: string) {
    return this.memberships.get(this.membershipKey(organizationId, userId)) ?? null;
  }

  async findOrganizationByIdempotency(userId: string, idempotencyKey: string) {
    return (
      this.organizations.find(
        (organization) =>
          organization.createdByUserId === userId && organization.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async insertOrganization(input: {
    name: string;
    createdByUserId: string;
    idempotencyKey: string;
  }) {
    const organization = {
      id: `organization-${this.nextOrganizationId++}`,
      ...input,
    };
    this.organizations.push(organization);
    return organization;
  }

  async ensureFounderMembership(organizationId: string, userId: string) {
    this.memberships.set(this.membershipKey(organizationId, userId), "admin");
  }

  async getMembershipRole(organizationId: string, userId: string) {
    return this.membershipRole(organizationId, userId);
  }

  async findPendingInvitation(organizationId: string, normalizedEmail: string) {
    return (
      this.invitations.find(
        (invitation) =>
          invitation.organizationId === organizationId &&
          invitation.normalizedEmail === normalizedEmail &&
          !invitation.acceptedAt &&
          !invitation.declinedAt &&
          !invitation.canceledAt,
      ) ?? null
    );
  }

  async insertInvitation(input: {
    organizationId: string;
    normalizedEmail: string;
    role: OrganizationRole;
    invitedByUserId: string;
    expiresAt: string;
  }) {
    const invitation: InvitationRecord = {
      id: `invitation-${this.nextInvitationId++}`,
      ...input,
      acceptedAt: null,
      declinedAt: null,
      canceledAt: null,
    };
    this.invitations.push(invitation);
    return invitation;
  }

  async getInvitation(invitationId: string) {
    return this.invitations.find((invitation) => invitation.id === invitationId) ?? null;
  }

  async restartPendingInvitation(
    invitationId: string,
    invitedByUserId: string,
    expiresAt: string,
    _updatedAt: string,
  ) {
    const invitation = await this.getInvitation(invitationId);
    if (!invitation || invitation.acceptedAt || invitation.declinedAt || invitation.canceledAt) {
      return null;
    }
    invitation.invitedByUserId = invitedByUserId;
    invitation.expiresAt = expiresAt;
    return invitation;
  }

  async cancelPendingInvitation(invitationId: string, canceledAt: string) {
    const invitation = await this.getInvitation(invitationId);
    if (!invitation || invitation.acceptedAt || invitation.declinedAt || invitation.canceledAt) {
      return null;
    }
    invitation.canceledAt = canceledAt;
    return invitation;
  }

  async acceptPendingInvitation(invitationId: string, acceptedAt: string) {
    const invitation = await this.getInvitation(invitationId);
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.declinedAt ||
      invitation.canceledAt ||
      invitation.expiresAt <= acceptedAt
    ) {
      return null;
    }
    invitation.acceptedAt = acceptedAt;
    return invitation;
  }

  async declinePendingInvitation(invitationId: string, declinedAt: string) {
    const invitation = await this.getInvitation(invitationId);
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.declinedAt ||
      invitation.canceledAt ||
      invitation.expiresAt <= declinedAt
    ) {
      return null;
    }
    invitation.declinedAt = declinedAt;
    return invitation;
  }

  async ensureInvitationMembership(organizationId: string, userId: string, role: OrganizationRole) {
    const key = this.membershipKey(organizationId, userId);
    if (!this.memberships.has(key)) {
      this.memberships.set(key, role);
    }
  }
}

const admin = { id: "admin", email: "admin@example.test" };
const invitee = { id: "invitee", email: "invitee@example.test" };
const now = new Date("2026-08-18T12:00:00.000Z");

async function organizationWithAdmin(repository: MemoryOrganizationRepository) {
  return createOrganizationForUser(repository, admin, {
    name: "Acme",
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
  });
}

async function pendingInvitation(
  repository: MemoryOrganizationRepository,
  role: OrganizationRole = "member",
) {
  const organization = await organizationWithAdmin(repository);
  const invitation = await createInvitationForOrganization(
    repository,
    admin,
    { organizationId: organization.id, email: " Invitee@Example.Test ", role },
    now,
  );
  return { invitation, organization };
}

describe("organization creation", () => {
  it("reuses the organization and repairs its founding administrator on retry", async () => {
    const repository = new MemoryOrganizationRepository();
    const first = await organizationWithAdmin(repository);

    repository.removeMembership(first.id, admin.id);
    const retried = await organizationWithAdmin(repository);

    expect(retried.id).toBe(first.id);
    expect(repository.organizations).toHaveLength(1);
    expect(repository.membershipRole(first.id, admin.id)).toBe("admin");
  });

  it("allows one user to create multiple organizations with distinct keys", async () => {
    const repository = new MemoryOrganizationRepository();
    await organizationWithAdmin(repository);
    await createOrganizationForUser(repository, admin, {
      name: "Second organization",
      idempotencyKey: "00000000-0000-4000-8000-000000000002",
    });

    expect(repository.organizations.map((organization) => organization.name)).toEqual([
      "Acme",
      "Second organization",
    ]);
  });
});

describe("organization invitations", () => {
  it("normalizes email, expires after seven days, and reuses a pending invitation", async () => {
    const repository = new MemoryOrganizationRepository();
    const { invitation, organization } = await pendingInvitation(repository, "admin");
    const duplicate = await createInvitationForOrganization(
      repository,
      admin,
      { organizationId: organization.id, email: "invitee@example.test", role: "admin" },
      new Date("2026-08-19T12:00:00.000Z"),
    );

    expect(invitation.normalizedEmail).toBe("invitee@example.test");
    expect(invitation.expiresAt).toBe("2026-08-25T12:00:00.000Z");
    expect(duplicate.id).toBe(invitation.id);
    expect(repository.invitations).toHaveLength(1);
  });

  it("rejects invitation management by non-administrators", async () => {
    const repository = new MemoryOrganizationRepository();
    const organization = await organizationWithAdmin(repository);
    repository.memberships.set(`${organization.id}:member`, "member");

    await expect(
      createInvitationForOrganization(
        repository,
        { id: "member", email: "member@example.test" },
        { organizationId: organization.id, email: invitee.email, role: "member" },
        now,
      ),
    ).rejects.toMatchObject({ code: "forbidden" } satisfies Partial<OrganizationFlowError>);

    const invitation = await createInvitationForOrganization(
      repository,
      admin,
      { organizationId: organization.id, email: invitee.email, role: "member" },
      now,
    );
    const member = { id: "member", email: "member@example.test" };
    await expect(
      resendOrganizationInvitation(repository, member, invitation.id, now),
    ).rejects.toMatchObject({ code: "forbidden" } satisfies Partial<OrganizationFlowError>);
    await expect(
      cancelOrganizationInvitation(repository, member, invitation.id, now),
    ).rejects.toMatchObject({ code: "forbidden" } satisfies Partial<OrganizationFlowError>);
  });

  it("resends for a fresh seven-day period and cancels idempotently", async () => {
    const repository = new MemoryOrganizationRepository();
    const { invitation } = await pendingInvitation(repository);
    const resentAt = new Date("2026-08-20T15:30:00.000Z");

    const resent = await resendOrganizationInvitation(repository, admin, invitation.id, resentAt);
    const canceled = await cancelOrganizationInvitation(
      repository,
      admin,
      invitation.id,
      new Date("2026-08-21T15:30:00.000Z"),
    );
    const retried = await cancelOrganizationInvitation(repository, admin, invitation.id);

    expect(resent.expiresAt).toBe("2026-08-27T15:30:00.000Z");
    expect(canceled.canceledAt).toBe("2026-08-21T15:30:00.000Z");
    expect(retried.id).toBe(invitation.id);
  });

  it("accepts with the invited role and repairs membership on retry", async () => {
    const repository = new MemoryOrganizationRepository();
    const { invitation, organization } = await pendingInvitation(repository, "admin");
    const accepted = await respondToOrganizationInvitation(
      repository,
      invitee,
      invitation.id,
      "accept",
      new Date("2026-08-19T12:00:00.000Z"),
    );

    repository.removeMembership(organization.id, invitee.id);
    const retried = await respondToOrganizationInvitation(
      repository,
      invitee,
      invitation.id,
      "accept",
      new Date("2026-08-20T12:00:00.000Z"),
    );

    expect(accepted.acceptedAt).toBe("2026-08-19T12:00:00.000Z");
    expect(retried.id).toBe(invitation.id);
    expect(repository.membershipRole(organization.id, invitee.id)).toBe("admin");
  });

  it("requires the normalized signed-in email", async () => {
    const repository = new MemoryOrganizationRepository();
    const { invitation } = await pendingInvitation(repository);

    await expect(
      respondToOrganizationInvitation(
        repository,
        { id: "wrong-user", email: "other@example.test" },
        invitation.id,
        "accept",
        new Date("2026-08-19T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "forbidden" } satisfies Partial<OrganizationFlowError>);
  });

  it("rejects expired invitations", async () => {
    const repository = new MemoryOrganizationRepository();
    const { invitation } = await pendingInvitation(repository);

    await expect(
      respondToOrganizationInvitation(
        repository,
        invitee,
        invitation.id,
        "accept",
        new Date("2026-08-25T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({
      code: "invitation_expired",
    } satisfies Partial<OrganizationFlowError>);
  });

  it("declines idempotently and cannot later accept", async () => {
    const repository = new MemoryOrganizationRepository();
    const { invitation } = await pendingInvitation(repository);
    const declinedAt = new Date("2026-08-19T12:00:00.000Z");

    const declined = await respondToOrganizationInvitation(
      repository,
      invitee,
      invitation.id,
      "decline",
      declinedAt,
    );
    const retried = await respondToOrganizationInvitation(
      repository,
      invitee,
      invitation.id,
      "decline",
      declinedAt,
    );

    expect(declined.declinedAt).toBe(declinedAt.toISOString());
    expect(retried.id).toBe(invitation.id);
    await expect(
      respondToOrganizationInvitation(repository, invitee, invitation.id, "accept", declinedAt),
    ).rejects.toMatchObject({ code: "invitation_state" } satisfies Partial<OrganizationFlowError>);
  });
});
