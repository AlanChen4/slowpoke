import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PromptRefreshProvider } from "@/app/dashboard/prompt-refresh";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardTitle } from "@/components/dashboard-title";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAuthClaims } from "@/lib/auth/auth-context";
import { getOrganizationContext } from "@/lib/organizations/organization-context";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const { data: claimsData, error: claimsError } = await getAuthClaims();

  if (claimsError || !claimsData?.claims) {
    redirect("/login");
  }

  const [{ organizations, selectedOrganization, error: membershipError }, cookieStore] =
    await Promise.all([getOrganizationContext(), cookies()]);

  if (membershipError) {
    console.error(
      `[dashboard] membership query failed ${JSON.stringify({
        code: membershipError.code,
        message: membershipError.message,
      })}`,
    );
  }

  if (!selectedOrganization?.completed) {
    redirect(
      selectedOrganization ? `/onboarding?organization=${selectedOrganization.id}` : "/onboarding",
    );
  }

  const sidebarDefaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarDefaultOpen}>
        <AppSidebar
          organizations={organizations}
          selectedOrganizationId={selectedOrganization?.id ?? null}
        />
        <SidebarInset>
          <header className="shrink-0 border-b px-6 sm:px-10 lg:px-12">
            <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-2">
              <DashboardTitle />
              <SidebarTrigger className="ml-auto md:hidden" />
            </div>
          </header>
          <PromptRefreshProvider>
            <div className="flex min-w-0 flex-1 flex-col px-6 py-8 sm:px-10 lg:px-12">
              <div className="mx-auto w-full max-w-7xl">{children}</div>
            </div>
          </PromptRefreshProvider>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
