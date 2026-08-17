import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { redirect } from "next/navigation";

import { logout } from "@/app/auth/actions";
import { OrganizationProfileForm } from "@/app/dashboard/settings/organization-profile-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { createClient } from "@/lib/supabase/server";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

type Installation = {
  id: string;
  created_at: string;
  revoked_at: string | null;
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-all text-xs">
        <code>{value}</code>
      </dd>
    </div>
  );
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
        .select("id,created_at,revoked_at")
        .eq("organization_id", selectedOrganization.id)
        .order("created_at", { ascending: false })
        .overrideTypes<Installation[], { merge: false }>()
    : { data: [], error: null };
  const installations = installationsResult.data ?? [];
  const email = claimsData.claims.email ?? "Unavailable";
  const dataError = organizationError ?? installationsResult.error;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
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
            <CardDescription>
              {selectedOrganization?.role === "admin"
                ? "Update the name and logo shown throughout this workspace."
                : "Details for the organization selected in the sidebar."}
            </CardDescription>
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
                    Ask an administrator to add this account to an organization.
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

      <section id="installations" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Codex installations</CardTitle>
            <CardDescription>
              Per-device credentials sending Codex telemetry to the selected organization.
            </CardDescription>
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
                    Run the local setup command once to create an installation and configure Codex.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installations.map((installation) => (
                    <TableRow key={installation.id}>
                      <TableCell>
                        <Badge variant={installation.revoked_at ? "outline" : "secondary"}>
                          {installation.revoked_at ? "Revoked" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {dateFormatter.format(new Date(installation.created_at))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-2">
            <p className="text-xs text-muted-foreground">
              Create or repair the machine-wide Codex installation:
            </p>
            <code className="bg-muted px-2 py-1 font-mono text-xs">pnpm setup:codex</code>
          </CardFooter>
        </Card>
      </section>

      <section id="account" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>The Supabase Auth identity used for this session.</CardDescription>
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
