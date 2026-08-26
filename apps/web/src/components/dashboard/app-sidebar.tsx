"use client";

import {
  ChartLineUpIcon,
  ChatsCircleIcon,
  GearIcon,
  PlusIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { selectOrganization } from "@/app/dashboard/actions";
import { useErrorToast } from "@/components/feedback/error-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export type SidebarOrganization = {
  completed: boolean;
  id: string;
  name: string;
  logoUrl: string | null;
  role: "admin" | "member";
};

type AppSidebarProps = {
  organizations: SidebarOrganization[];
  selectedOrganizationId: string | null;
};

type NavigationItem = {
  title: string;
  href: string;
  icon: typeof ChatsCircleIcon;
  adminOnly?: boolean;
  isActive: (pathname: string) => boolean;
};

const navigation: readonly NavigationItem[] = [
  {
    title: "Prompts",
    href: "/dashboard?scope=human",
    icon: ChatsCircleIcon,
    isActive: (pathname: string) =>
      pathname === "/dashboard" || pathname.startsWith("/dashboard/prompts/"),
  },
  {
    title: "Analytics",
    href: "/dashboard/analytics",
    icon: ChartLineUpIcon,
    adminOnly: true,
    isActive: (pathname: string) => pathname.startsWith("/dashboard/analytics"),
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: GearIcon,
    isActive: (pathname: string) => pathname.startsWith("/dashboard/settings"),
  },
];

export function AppSidebar({ organizations, selectedOrganizationId }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [switchError, setSwitchError] = useState<string>();
  const [isSwitching, startSwitchTransition] = useTransition();
  useErrorToast(switchError, "Could not switch organization");
  const selectedOrganization =
    organizations.find((organization) => organization.id === selectedOrganizationId) ?? null;

  function changeOrganization(organizationId: string | null) {
    if (!organizationId) {
      return;
    }

    setSwitchError(undefined);
    startSwitchTransition(async () => {
      const result = await selectOrganization(organizationId);

      if (result.error) {
        setSwitchError(result.error);
        return;
      }

      const organization = organizations.find((candidate) => candidate.id === organizationId);
      if (organization && !organization.completed) {
        router.push(`/onboarding?organization=${organization.id}`);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <Select
              items={organizations.map((organization) => ({
                label: organization.name,
                value: organization.id,
              }))}
              value={selectedOrganizationId ?? undefined}
              onValueChange={changeOrganization}
              disabled={organizations.length === 0 || isSwitching}
            >
              <SelectTrigger
                variant="ghost"
                className="h-12 w-full min-w-0"
                aria-label="Organization"
              >
                <Avatar className="rounded-none after:hidden" size="sm">
                  {selectedOrganization?.logoUrl ? (
                    <AvatarImage
                      className="rounded-none"
                      src={selectedOrganization.logoUrl}
                      alt=""
                    />
                  ) : null}
                  <AvatarFallback className="rounded-none">
                    <WaveformIcon />
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 text-left leading-tight">
                  <SelectValue className="truncate font-medium" placeholder="No organization" />
                </div>
              </SelectTrigger>
              <SelectContent className="min-w-72" align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectLabel>Organizations</SelectLabel>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      <Avatar className="rounded-none after:hidden" size="sm">
                        {organization.logoUrl ? (
                          <AvatarImage className="rounded-none" src={organization.logoUrl} alt="" />
                        ) : null}
                        <AvatarFallback className="rounded-none">
                          <WaveformIcon />
                        </AvatarFallback>
                      </Avatar>
                      <span>{organization.name}</span>
                      {!organization.completed ? (
                        <span className="ml-auto text-muted-foreground">Setup required</span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <div className="p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => router.push("/onboarding?create=1")}
                  >
                    <PlusIcon />
                    Create organization
                  </Button>
                </div>
              </SelectContent>
            </Select>
            <output className="sr-only">{isSwitching ? "Switching organization" : ""}</output>
          </div>
          <SidebarTrigger className="shrink-0" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="pointer-events-none">Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation
                .filter((item) => !item.adminOnly || selectedOrganization?.role === "admin")
                .map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      tooltip={{ children: item.title }}
                      isActive={item.isActive(pathname)}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
