"use server";

import { createHash, randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import * as z from "zod";

import { env } from "@/env";
import {
  createTeamManagedSettings,
  teamEnrollmentSchema,
  teamToolSchema,
} from "@/lib/team-installation";
import {
  cancelOrganizationInvitation,
  createInvitationForOrganization,
  createOrganizationForUser,
  OrganizationFlowError,
  resendOrganizationInvitation,
  respondToOrganizationInvitation,
  type OrganizationActor,
} from "@/lib/organizations/service";
import { SupabaseOrganizationRepository } from "@/lib/organizations/supabase-repository";
import { ORGANIZATION_COOKIE } from "@/lib/organization-context";
import { isInstallationSetupComplete } from "@/lib/installation-setup-status";
import { createSetupCommand } from "@/lib/setup-command";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type OrganizationFlowActionState = {
  setupSessionId?: string;
  error?: string;
  invitationId?: string;
  message?: string;
  organizationId?: string;
  organizationName?: string;
  setupCommand?: string;
  teamSettings?: string;
  teamTool?: "codex" | "claude_code";
};

const organizationIdSchema = z.uuid();
const invitationIdSchema = z.uuid();
const createOrganizationSchema = z.object({
  idempotencyKey: z.uuid(),
  name: z.string().trim().min(1, "Enter an organization name.").max(80),
});
const createInvitationSchema = z.object({
  organizationId: organizationIdSchema,
  email: z.string().trim().pipe(z.email("Enter a valid email address.")),
  role: z.enum(["admin", "member"]),
});
const createSetupSessionSchema = z.object({
  organizationId: organizationIdSchema,
  tools: z
    .array(z.enum(["codex", "claude_code"]))
    .min(1, "Choose at least one AI tool.")
    .transform((tools) => [...new Set(tools)].sort((left) => (left === "codex" ? -1 : 1))),
});
const createTeamInstallationSchema = z.object({
  organizationId: organizationIdSchema,
  tool: teamToolSchema,
});

async function getActor(): Promise<OrganizationActor | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user?.email) {
    return null;
  }
  return { id: data.user.id, email: data.user.email };
}

function repository() {
  return new SupabaseOrganizationRepository(createAdminClient());
}

async function selectOrganization(organizationId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  });
}

function refreshOrganizationViews() {
  revalidatePath("/onboarding");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings");
}

function actionError(error: Error): OrganizationFlowActionState {
  if (error instanceof OrganizationFlowError) {
    return { error: error.message };
  }
  console.error("[organization-action] operation failed");
  return { error: "The request could not be completed. Try again." };
}

export async function createOrganization(
  _previousState: OrganizationFlowActionState,
  formData: FormData,
): Promise<OrganizationFlowActionState> {
  const parsed = createOrganizationSchema.safeParse({
    idempotencyKey: formData.get("idempotencyKey"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the organization details." };
  }

  const actor = await getActor();
  if (!actor) {
    return { error: "Sign in again to create an organization." };
  }

  try {
    const organization = await createOrganizationForUser(repository(), actor, parsed.data);
    await selectOrganization(organization.id);
    refreshOrganizationViews();
    return {
      message: "Organization created.",
      organizationId: organization.id,
      organizationName: organization.name,
    };
  } catch (error) {
    return actionError(error instanceof Error ? error : new Error("Unknown organization error"));
  }
}

export async function createOrganizationInvitation(
  _previousState: OrganizationFlowActionState,
  formData: FormData,
): Promise<OrganizationFlowActionState> {
  const parsed = createInvitationSchema.safeParse({
    organizationId: formData.get("organizationId"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the invitation details." };
  }

  const actor = await getActor();
  if (!actor) {
    return { error: "Sign in again to invite someone." };
  }

  try {
    const invitation = await createInvitationForOrganization(repository(), actor, parsed.data);
    refreshOrganizationViews();
    return { invitationId: invitation.id, message: "Invitation created." };
  } catch (error) {
    return actionError(error instanceof Error ? error : new Error("Unknown invitation error"));
  }
}

async function manageInvitation(
  formData: FormData,
  operation: "cancel" | "resend",
): Promise<OrganizationFlowActionState> {
  const parsedId = invitationIdSchema.safeParse(formData.get("invitationId"));
  if (!parsedId.success) {
    return { error: "Choose a valid invitation." };
  }
  const actor = await getActor();
  if (!actor) {
    return { error: "Sign in again to manage invitations." };
  }

  try {
    const invitation =
      operation === "cancel"
        ? await cancelOrganizationInvitation(repository(), actor, parsedId.data)
        : await resendOrganizationInvitation(repository(), actor, parsedId.data);
    refreshOrganizationViews();
    return {
      invitationId: invitation.id,
      message: operation === "cancel" ? "Invitation canceled." : "Invitation resent.",
    };
  } catch (error) {
    return actionError(error instanceof Error ? error : new Error("Unknown invitation error"));
  }
}

export async function resendInvitation(
  _previousState: OrganizationFlowActionState,
  formData: FormData,
) {
  return manageInvitation(formData, "resend");
}

export async function cancelInvitation(
  _previousState: OrganizationFlowActionState,
  formData: FormData,
) {
  return manageInvitation(formData, "cancel");
}

async function respondToInvitation(
  formData: FormData,
  response: "accept" | "decline",
): Promise<OrganizationFlowActionState> {
  const parsedId = invitationIdSchema.safeParse(formData.get("invitationId"));
  if (!parsedId.success) {
    return { error: "Choose a valid invitation." };
  }
  const actor = await getActor();
  if (!actor) {
    return { error: "Sign in again to respond to invitations." };
  }

  try {
    const invitation = await respondToOrganizationInvitation(
      repository(),
      actor,
      parsedId.data,
      response,
    );
    if (response === "accept") {
      await selectOrganization(invitation.organizationId);
    }
    refreshOrganizationViews();
    return {
      invitationId: invitation.id,
      message: response === "accept" ? "Invitation accepted." : "Invitation declined.",
      organizationId: response === "accept" ? invitation.organizationId : undefined,
    };
  } catch (error) {
    return actionError(error instanceof Error ? error : new Error("Unknown invitation error"));
  }
}

export async function acceptInvitation(
  _previousState: OrganizationFlowActionState,
  formData: FormData,
) {
  return respondToInvitation(formData, "accept");
}

export async function declineInvitation(
  _previousState: OrganizationFlowActionState,
  formData: FormData,
) {
  return respondToInvitation(formData, "decline");
}

export async function createInstallationSetupSession(
  _previousState: OrganizationFlowActionState,
  formData: FormData,
): Promise<OrganizationFlowActionState> {
  const parsed = createSetupSessionSchema.safeParse({
    organizationId: formData.get("organizationId"),
    tools: formData.getAll("tools"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the selected AI tools." };
  }
  const actor = await getActor();
  if (!actor) {
    return { error: "Sign in again to connect this computer." };
  }

  const admin = createAdminClient();
  const organizationRepository = new SupabaseOrganizationRepository(admin);
  try {
    const role = await organizationRepository.getMembershipRole(
      parsed.data.organizationId,
      actor.id,
    );
    if (!role) {
      return { error: "You do not have access to that organization." };
    }

    const code = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: setupSession, error } = await admin
      .from("installation_setup_sessions")
      .insert({
        organization_id: parsed.data.organizationId,
        created_by_user_id: actor.id,
        code_digest: createHash("sha256").update(code).digest("hex"),
        selected_tools: parsed.data.tools,
        expires_at: expiresAt,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !setupSession) {
      throw new Error(error?.message ?? "Setup session was not created");
    }

    return {
      message: "Setup command created.",
      setupSessionId: setupSession.id,
      organizationId: parsed.data.organizationId,
      setupCommand: createSetupCommand(code, env.SLOWPOKE_SETUP_SERVER),
    };
  } catch (error) {
    return actionError(error instanceof Error ? error : new Error("Unknown setup session error"));
  }
}

export async function createTeamInstallation(
  _previousState: OrganizationFlowActionState,
  formData: FormData,
): Promise<OrganizationFlowActionState> {
  const parsed = createTeamInstallationSchema.safeParse({
    organizationId: formData.get("organizationId"),
    tool: formData.get("tool"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the team details." };
  }
  const actor = await getActor();
  if (!actor) {
    return { error: "Sign in again to connect a team." };
  }

  const admin = createAdminClient();
  const organizationRepository = new SupabaseOrganizationRepository(admin);
  let setupSessionId: string | undefined;
  try {
    const role = await organizationRepository.getMembershipRole(
      parsed.data.organizationId,
      actor.id,
    );
    if (role !== "admin") {
      return { error: "Only organization administrators can connect a team." };
    }

    const code = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: setupSession, error } = await admin
      .from("installation_setup_sessions")
      .insert({
        organization_id: parsed.data.organizationId,
        created_by_user_id: actor.id,
        code_digest: createHash("sha256").update(code).digest("hex"),
        selected_tools: [parsed.data.tool],
        expires_at: expiresAt,
        installation_type: "team",
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !setupSession) {
      throw new Error(error?.message ?? "Team setup session was not created");
    }
    setupSessionId = setupSession.id;

    const response = await fetch(
      `${env.SLOWPOKE_SETUP_SERVER.replace(/\/$/, "")}/api/setup/enroll`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, computer_name: "Team" }),
        cache: "no-store",
      },
    );
    if (response.status === 409) {
      await admin.from("installation_setup_sessions").delete().eq("id", setupSessionId);
      return {
        error:
          "This organization already has a team installation. Revoke it before creating another.",
      };
    }
    if (!response.ok) {
      throw new Error(`Team enrollment failed with status ${response.status}`);
    }
    const enrollment = teamEnrollmentSchema.parse(await response.json());
    const installation = enrollment.installations[0];
    if (installation.tool !== parsed.data.tool) {
      throw new Error("Team enrollment returned the wrong tool");
    }
    refreshOrganizationViews();
    return {
      message: "Team installation created.",
      organizationId: parsed.data.organizationId,
      setupSessionId,
      teamSettings: createTeamManagedSettings(
        parsed.data.tool,
        enrollment.collector_url,
        installation.token,
      ),
      teamTool: parsed.data.tool,
    };
  } catch (error) {
    if (setupSessionId) {
      await admin.from("installation_setup_sessions").delete().eq("id", setupSessionId);
    }
    return actionError(error instanceof Error ? error : new Error("Unknown team setup error"));
  }
}

export async function checkInstallationSetupSession(
  organizationId: string,
  setupSessionId: string,
): Promise<{ complete: boolean; error?: string }> {
  const parsed = z
    .object({ organizationId: organizationIdSchema, setupSessionId: z.uuid() })
    .safeParse({ organizationId, setupSessionId });
  if (!parsed.success) {
    return { complete: false, error: "The setup session is invalid." };
  }
  const actor = await getActor();
  if (!actor) {
    return { complete: false, error: "Sign in again to check this computer." };
  }
  const admin = createAdminClient();
  const { data: setupSession, error: setupSessionError } = await admin
    .from("installation_setup_sessions")
    .select("selected_tools")
    .eq("id", parsed.data.setupSessionId)
    .eq("organization_id", parsed.data.organizationId)
    .eq("created_by_user_id", actor.id)
    .maybeSingle<{ selected_tools: string[] }>();
  if (setupSessionError || !setupSession) {
    return { complete: false, error: "The setup session could not be checked." };
  }
  const { data: installations, error } = await admin
    .from("installations")
    .select("tool")
    .eq("setup_session_id", parsed.data.setupSessionId)
    .eq("created_by_user_id", actor.id)
    .is("revoked_at", null)
    .not("verified_at", "is", null)
    .overrideTypes<{ tool: string }[], { merge: false }>();
  if (error) {
    return { complete: false, error: "The connection could not be checked." };
  }
  return {
    complete: isInstallationSetupComplete(setupSession.selected_tools, installations ?? []),
  };
}

export async function revokeInstallation(
  _previousState: OrganizationFlowActionState,
  formData: FormData,
): Promise<OrganizationFlowActionState> {
  const parsed = z
    .object({ installationId: z.uuid(), organizationId: organizationIdSchema })
    .safeParse({
      installationId: formData.get("installationId"),
      organizationId: formData.get("organizationId"),
    });
  if (!parsed.success) {
    return { error: "Choose a valid installation." };
  }
  const actor = await getActor();
  if (!actor) {
    return { error: "Sign in again to revoke an installation." };
  }
  const admin = createAdminClient();
  const installationRepository = new SupabaseOrganizationRepository(admin);
  const role = await installationRepository.getMembershipRole(parsed.data.organizationId, actor.id);
  if (!role) {
    return { error: "You do not have access to that organization." };
  }
  let query = admin
    .from("installations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.installationId)
    .eq("organization_id", parsed.data.organizationId)
    .is("revoked_at", null);
  if (role !== "admin") {
    query = query.eq("created_by_user_id", actor.id);
  }
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) {
    return { error: "The installation could not be revoked." };
  }
  refreshOrganizationViews();
  return { message: "Installation revoked." };
}
