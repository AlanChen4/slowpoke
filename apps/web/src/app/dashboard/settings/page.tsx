import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/app/auth/actions";
import {
  InvitationSettings,
  type SettingsInvitation,
} from "@/app/dashboard/settings/invitation-settings";
import { OrganizationProfileForm } from "@/app/dashboard/settings/organization-profile-form";
import { RevokeInstallationButton } from "@/app/dashboard/settings/revoke-installation-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAuthClaims } from "@/lib/auth-context";
import { getOrganizationContext } from "@/lib/organization-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

type Installation = {
  computer_name: string;
  created_at: string;
  created_by_user_id: string;
  id: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  tool: "codex" | "claude_code";
  verified_at: string | null;
};

type InvitationRow = {
  expires_at: string;
  id: string;
  normalized_email: string;
  role: "admin" | "member";
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-all text-xs">
        <code>{value}</code>
      </dd>
    </div>
  );
}

function installationState(installation: Installation) {
  if (installation.revoked_at) {
    return "Revoked";
  }
  return installation.verified_at ? "Active" : "Pending";
}

export default async function SettingsPage() {
  const [supabase, { data: claimsData, error: claimsError }] = await Promise.all([
    createClient(),
    getAuthClaims(),
  ]);
  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const { selectedOrganization, error: organizationError } = await getOrganizationContext();
  const installationsResult = selectedOrganization
    ? await supabase
        .from("installations")
        .select(
          "id,created_at,created_by_user_id,tool,computer_name,verified_at,last_seen_at,revoked_at",
        )
        .eq("organization_id", selectedOrganization.id)
        .order("created_at", { ascending: false })
        .overrideTypes<Installation[], { merge: false }>()
    : { data: [], error: null };
  const installations = installationsResult.data ?? [];
  const email = claimsData.claims.email ?? "Unavailable";
  const ownerEmails = new Map<string, string>();
  let invitations: SettingsInvitation[] = [];
  let invitationError: { message: string } | null = null;

  if (selectedOrganization?.role === "admin") {
    const admin = createAdminClient();
    const [invitationResult, usersResult] = await Promise.all([
      admin
        .from("organization_invitations")
        .select("id,normalized_email,role,expires_at")
        .eq("organization_id", selectedOrganization.id)
        .is("accepted_at", null)
        .is("declined_at", null)
        .is("canceled_at", null)
        .order("created_at", { ascending: false })
        .overrideTypes<InvitationRow[], { merge: false }>(),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    invitationError = invitationResult.error;
    invitations = (invitationResult.data ?? []).map((invitation) => ({
      email: invitation.normalized_email,
      expiresAt: invitation.expires_at,
      id: invitation.id,
      role: invitation.role,
    }));
    for (const user of usersResult.data.users) {
      if (user.email) {
        ownerEmails.set(user.id, user.email);
      }
    }
  } else {
    const userId = claimsData.claims.sub;
    if (userId) {
      ownerEmails.set(userId, email);
    }
  }

  const dataError = organizationError ?? installationsResult.error ?? invitationError;

  return (
    <div className="flex w-full flex-col gap-8">
      {dataError ? (
        <Alert variant="destructive">
          <WarningCircleIcon />
          <AlertTitle>Some settings could not be loaded</AlertTitle>
          <AlertDescription>{dataError.message}</AlertDescription>
        </Alert>
      ) : null}

      <section id="organization" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedOrganization ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <WarningCircleIcon />
                  </EmptyMedia>
                  <EmptyTitle>No organization access</EmptyTitle>
                  <EmptyDescription>
                    Create an organization or ask an administrator for an invitation.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : selectedOrganization.role === "admin" ? (
              <OrganizationProfileForm
                key={selectedOrganization.id}
                organization={selectedOrganization}
              />
            ) : (
              <dl className="flex flex-col gap-3">
                <DetailRow label="Name" value={selectedOrganization.name} />
                <DetailRow label="Logo URL" value={selectedOrganization.logoUrl ?? "Not set"} />
              </dl>
            )}
          </CardContent>
        </Card>
      </section>

      {selectedOrganization?.role === "admin" ? (
        <section id="invitations" className="scroll-mt-20">
          <Card>
            <CardHeader>
              <CardTitle>Invitations</CardTitle>
            </CardHeader>
            <CardContent>
              <InvitationSettings
                invitations={invitations}
                organizationId={selectedOrganization.id}
              />
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section id="installations" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Installations</CardTitle>
          </CardHeader>
          <CardContent>
            {installations.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <WarningCircleIcon />
                  </EmptyMedia>
                  <EmptyTitle>No installations found</EmptyTitle>
                  <EmptyDescription>
                    Open onboarding to connect Codex, Claude Code, or both.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tool</TableHead>
                      <TableHead>Computer</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last seen</TableHead>
                      <TableHead aria-label="Actions" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {installations.map((installation) => {
                      const state = installationState(installation);
                      return (
                        <TableRow key={installation.id}>
                          <TableCell>
                            {installation.tool === "codex" ? "Codex" : "Claude Code"}
                          </TableCell>
                          <TableCell>{installation.computer_name}</TableCell>
                          <TableCell>
                            {ownerEmails.get(installation.created_by_user_id) ?? "Unknown account"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={state === "Active" ? "secondary" : "outline"}>
                              {state}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {installation.last_seen_at
                              ? dateFormatter.format(new Date(installation.last_seen_at))
                              : "Never"}
                          </TableCell>
                          <TableCell className="text-right">
                            {state !== "Revoked" && selectedOrganization ? (
                              <RevokeInstallationButton
                                installationId={installation.id}
                                organizationId={selectedOrganization.id}
                              />
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href="/onboarding?create=1" />}
            >
              Create another organization
            </Button>
          </CardFooter>
        </Card>
      </section>

      <section id="account" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              <DetailRow label="Email" value={email} />
              <DetailRow label="Authentication" value="Passwordless email" />
            </dl>
          </CardContent>
          <CardFooter>
            <form action={logout}>
              <Button type="submit" variant="outline">
                Log out
              </Button>
            </form>
          </CardFooter>
        </Card>
      </section>
    </div>
  );
}
