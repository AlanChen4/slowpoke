export type OrganizationRole = "admin" | "member";

export type OrganizationRecord = {
  id: string;
  name: string;
  createdByUserId: string;
  idempotencyKey: string;
};

export type InvitationRecord = {
  id: string;
  organizationId: string;
  normalizedEmail: string;
  role: OrganizationRole;
  invitedByUserId: string;
  expiresAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  canceledAt: string | null;
};

export type OrganizationActor = {
  id: string;
  email: string;
};

export type CreateOrganizationInput = {
  name: string;
  idempotencyKey: string;
};

export type CreateInvitationInput = {
  organizationId: string;
  email: string;
  role: OrganizationRole;
};

export interface OrganizationRepository {
  findOrganizationByIdempotency(
    userId: string,
    idempotencyKey: string,
  ): Promise<OrganizationRecord | null>;
  insertOrganization(input: {
    name: string;
    createdByUserId: string;
    idempotencyKey: string;
  }): Promise<OrganizationRecord>;
  ensureFounderMembership(organizationId: string, userId: string): Promise<void>;
  getMembershipRole(organizationId: string, userId: string): Promise<OrganizationRole | null>;
  findPendingInvitation(
    organizationId: string,
    normalizedEmail: string,
  ): Promise<InvitationRecord | null>;
  insertInvitation(input: {
    organizationId: string;
    normalizedEmail: string;
    role: OrganizationRole;
    invitedByUserId: string;
    expiresAt: string;
  }): Promise<InvitationRecord>;
  getInvitation(invitationId: string): Promise<InvitationRecord | null>;
  restartPendingInvitation(
    invitationId: string,
    invitedByUserId: string,
    expiresAt: string,
    updatedAt: string,
  ): Promise<InvitationRecord | null>;
  cancelPendingInvitation(
    invitationId: string,
    canceledAt: string,
  ): Promise<InvitationRecord | null>;
  acceptPendingInvitation(
    invitationId: string,
    acceptedAt: string,
  ): Promise<InvitationRecord | null>;
  declinePendingInvitation(
    invitationId: string,
    declinedAt: string,
  ): Promise<InvitationRecord | null>;
  ensureInvitationMembership(
    organizationId: string,
    userId: string,
    role: OrganizationRole,
  ): Promise<void>;
}

export class OrganizationConflictError extends Error {}

export class OrganizationFlowError extends Error {
  constructor(
    readonly code: "forbidden" | "invitation_expired" | "invitation_state" | "not_found",
    message: string,
  ) {
    super(message);
  }
}

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeInvitationEmail(email: string) {
  return email.trim().toLowerCase();
}

function invitationExpiry(now: Date) {
  return new Date(now.getTime() + INVITATION_LIFETIME_MS).toISOString();
}

function isPending(invitation: InvitationRecord) {
  return !invitation.acceptedAt && !invitation.declinedAt && !invitation.canceledAt;
}

async function requireAdministrator(
  repository: OrganizationRepository,
  organizationId: string,
  userId: string,
) {
  if ((await repository.getMembershipRole(organizationId, userId)) !== "admin") {
    throw new OrganizationFlowError(
      "forbidden",
      "Only organization administrators can manage invitations.",
    );
  }
}

export async function createOrganizationForUser(
  repository: OrganizationRepository,
  actor: OrganizationActor,
  input: CreateOrganizationInput,
) {
  let organization = await repository.findOrganizationByIdempotency(actor.id, input.idempotencyKey);

  if (!organization) {
    try {
      organization = await repository.insertOrganization({
        name: input.name,
        createdByUserId: actor.id,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (error) {
      if (!(error instanceof OrganizationConflictError)) {
        throw error;
      }

      organization = await repository.findOrganizationByIdempotency(actor.id, input.idempotencyKey);
      if (!organization) {
        throw error;
      }
    }
  }

  await repository.ensureFounderMembership(organization.id, actor.id);
  return organization;
}

export async function createInvitationForOrganization(
  repository: OrganizationRepository,
  actor: OrganizationActor,
  input: CreateInvitationInput,
  now = new Date(),
) {
  await requireAdministrator(repository, input.organizationId, actor.id);
  const normalizedEmail = normalizeInvitationEmail(input.email);
  const existing = await repository.findPendingInvitation(input.organizationId, normalizedEmail);

  if (existing) {
    return existing;
  }

  try {
    return await repository.insertInvitation({
      organizationId: input.organizationId,
      normalizedEmail,
      role: input.role,
      invitedByUserId: actor.id,
      expiresAt: invitationExpiry(now),
    });
  } catch (error) {
    if (!(error instanceof OrganizationConflictError)) {
      throw error;
    }

    const invitation = await repository.findPendingInvitation(
      input.organizationId,
      normalizedEmail,
    );
    if (!invitation) {
      throw error;
    }
    return invitation;
  }
}

export async function resendOrganizationInvitation(
  repository: OrganizationRepository,
  actor: OrganizationActor,
  invitationId: string,
  now = new Date(),
) {
  const invitation = await repository.getInvitation(invitationId);
  if (!invitation) {
    throw new OrganizationFlowError("not_found", "Invitation not found.");
  }
  await requireAdministrator(repository, invitation.organizationId, actor.id);

  if (!isPending(invitation)) {
    throw new OrganizationFlowError("invitation_state", "Only pending invitations can be resent.");
  }

  const restarted = await repository.restartPendingInvitation(
    invitation.id,
    actor.id,
    invitationExpiry(now),
    now.toISOString(),
  );
  if (!restarted) {
    throw new OrganizationFlowError("invitation_state", "The invitation is no longer pending.");
  }
  return restarted;
}

export async function cancelOrganizationInvitation(
  repository: OrganizationRepository,
  actor: OrganizationActor,
  invitationId: string,
  now = new Date(),
) {
  const invitation = await repository.getInvitation(invitationId);
  if (!invitation) {
    throw new OrganizationFlowError("not_found", "Invitation not found.");
  }
  await requireAdministrator(repository, invitation.organizationId, actor.id);

  if (invitation.canceledAt) {
    return invitation;
  }
  if (invitation.acceptedAt || invitation.declinedAt) {
    throw new OrganizationFlowError(
      "invitation_state",
      "Accepted or declined invitations cannot be canceled.",
    );
  }

  const canceled = await repository.cancelPendingInvitation(invitation.id, now.toISOString());
  if (!canceled) {
    throw new OrganizationFlowError("invitation_state", "The invitation is no longer pending.");
  }
  return canceled;
}

async function recoverAcceptedInvitation(
  repository: OrganizationRepository,
  actor: OrganizationActor,
  invitation: InvitationRecord,
) {
  await repository.ensureInvitationMembership(invitation.organizationId, actor.id, invitation.role);
  return invitation;
}

export async function respondToOrganizationInvitation(
  repository: OrganizationRepository,
  actor: OrganizationActor,
  invitationId: string,
  response: "accept" | "decline",
  now = new Date(),
) {
  const invitation = await repository.getInvitation(invitationId);
  if (!invitation) {
    throw new OrganizationFlowError("not_found", "Invitation not found.");
  }
  if (invitation.normalizedEmail !== normalizeInvitationEmail(actor.email)) {
    throw new OrganizationFlowError("forbidden", "This invitation belongs to another account.");
  }

  if (invitation.acceptedAt) {
    if (response === "accept") {
      return recoverAcceptedInvitation(repository, actor, invitation);
    }
    throw new OrganizationFlowError("invitation_state", "The invitation was already accepted.");
  }
  if (invitation.declinedAt) {
    if (response === "decline") {
      return invitation;
    }
    throw new OrganizationFlowError("invitation_state", "The invitation was already declined.");
  }
  if (invitation.canceledAt) {
    throw new OrganizationFlowError("invitation_state", "The invitation was canceled.");
  }
  if (new Date(invitation.expiresAt).getTime() <= now.getTime()) {
    throw new OrganizationFlowError("invitation_expired", "The invitation has expired.");
  }

  if (response === "decline") {
    const declined = await repository.declinePendingInvitation(invitation.id, now.toISOString());
    if (!declined) {
      throw new OrganizationFlowError("invitation_state", "The invitation is no longer pending.");
    }
    return declined;
  }

  const accepted = await repository.acceptPendingInvitation(invitation.id, now.toISOString());
  if (accepted) {
    return recoverAcceptedInvitation(repository, actor, accepted);
  }

  const current = await repository.getInvitation(invitation.id);
  if (current?.acceptedAt) {
    return recoverAcceptedInvitation(repository, actor, current);
  }
  throw new OrganizationFlowError("invitation_state", "The invitation is no longer pending.");
}
