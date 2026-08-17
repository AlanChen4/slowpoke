"use client";

import { ChatsCircleIcon, GearIcon, WaveformIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { selectOrganization } from "@/app/dashboard/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  SidebarFooter,
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
  id: string;
  name: string;
  logoUrl: string | null;
  role: "admin" | "member";
};

type AppSidebarProps = {
  email: string;
  organizations: SidebarOrganization[];
  selectedOrganizationId: string | null;
};

const navigation = [
  {
    title: "Prompts",
    href: "/dashboard?scope=human",
    icon: ChatsCircleIcon,
    isActive: (pathname: string) =>
      pathname === "/dashboard" || pathname.startsWith("/dashboard/messages/"),
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: GearIcon,
    isActive: (pathname: string) => pathname.startsWith("/dashboard/settings"),
  },
] as const;

function accountInitials(email: string) {
  const localPart = email.split("@")[0] ?? "";
  const parts = localPart.split(/[._-]/).filter(Boolean);
  const initials = parts
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

  return initials.toUpperCase() || "U";
}

export function AppSidebar({ email, organizations, selectedOrganizationId }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [switchError, setSwitchError] = useState<string>();
  const [isSwitching, startSwitchTransition] = useTransition();
  const selectedOrganization =
    organizations.find((organization) => organization.id === selectedOrganizationId) ?? null;
  const roleLabel = !selectedOrganization
    ? "No organization"
    : selectedOrganization.role === "admin"
      ? "Administrator"
      : "Member";

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
              <SelectContent align="start" alignItemWithTrigger={false}>
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
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <output className="sr-only">
              {switchError ?? (isSwitching ? "Switching organization" : "")}
            </output>
          </div>
          <SidebarTrigger className="shrink-0" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="pointer-events-none">Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
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

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={{ children: email }}
              render={<Link href="/dashboard/settings#account" />}
            >
              <Avatar size="sm">
                <AvatarFallback>{accountInitials(email)}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                <span className="truncate font-medium">{email}</span>
                <span className="truncate text-muted-foreground">{roleLabel}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
