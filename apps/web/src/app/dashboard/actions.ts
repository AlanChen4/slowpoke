"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import * as z from "zod";

import { env } from "@/env";
import { ORGANIZATION_COOKIE } from "@/lib/organization-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type OrganizationActionState = {
  error?: string;
  message?: string;
};

type OrganizationUpdates = {
  name: string;
  logo_url?: string;
};

const organizationIdSchema = z.uuid();
const organizationProfileSchema = z.object({
  organizationId: organizationIdSchema,
  name: z.string().trim().min(1, "Enter an organization name.").max(80),
});

const ORGANIZATION_LOGO_BUCKET = "organization-logos";
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function selectOrganization(organizationId: string): Promise<OrganizationActionState> {
  const parsedId = organizationIdSchema.safeParse(organizationId);

  if (!parsedId.success) {
    return { error: "Choose a valid organization." };
  }

  const supabase = await createClient();
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", parsedId.data)
    .maybeSingle();

  if (error || !membership) {
    return { error: "You do not have access to that organization." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ORGANIZATION_COOKIE, parsedId.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  });
  revalidatePath("/dashboard", "layout");

  return {};
}

export async function updateOrganization(
  _previousState: OrganizationActionState,
  formData: FormData,
): Promise<OrganizationActionState> {
  const result = organizationProfileSchema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
  });

  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Check the organization details." };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: "Sign in again to update organization settings." };
  }

  const admin = createAdminClient();
  const { data: membership, error: membershipError } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", result.data.organizationId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (membershipError || membership?.role !== "admin") {
    return { error: "Only organization administrators can update these settings." };
  }

  const logo = formData.get("logo");
  let logoUrl: string | undefined;

  if (logo instanceof File && logo.size > 0) {
    if (!ALLOWED_LOGO_TYPES.has(logo.type)) {
      return { error: "Choose a PNG, JPEG, WebP, or GIF image." };
    }

    if (logo.size > MAX_LOGO_SIZE_BYTES) {
      return { error: "Choose an image smaller than 2 MB." };
    }

    const logoPath = `${result.data.organizationId}/logo`;
    const { error: uploadError } = await supabase.storage
      .from(ORGANIZATION_LOGO_BUCKET)
      .upload(logoPath, logo, {
        cacheControl: "3600",
        contentType: logo.type,
        upsert: true,
      });

    if (uploadError) {
      return { error: uploadError.message };
    }

    const publicUrl = supabase.storage.from(ORGANIZATION_LOGO_BUCKET).getPublicUrl(logoPath)
      .data.publicUrl;
    logoUrl = `${publicUrl}?v=${Date.now()}`;
  }

  const updates: OrganizationUpdates = { name: result.data.name };
  if (logoUrl) {
    updates.logo_url = logoUrl;
  }

  const { data: organization, error } = await admin
    .from("organizations")
    .update(updates)
    .eq("id", result.data.organizationId)
    .select("id")
    .maybeSingle();

  if (error || !organization) {
    return { error: error?.message ?? "The organization could not be updated." };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings");

  return { message: "Organization updated." };
}
