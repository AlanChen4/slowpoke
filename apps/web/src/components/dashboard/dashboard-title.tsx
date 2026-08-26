"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export function DashboardTitle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname.startsWith("/dashboard/prompts/")) {
    const query = searchParams.toString();
    const promptsHref = query ? `/dashboard?${query}` : "/dashboard";

    return (
      <Breadcrumb>
        <BreadcrumbList className="text-sm font-medium">
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={promptsHref} />}>Prompts</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Prompt details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  const title = pathname.startsWith("/dashboard/settings")
    ? "Settings"
    : pathname.startsWith("/dashboard/analytics")
      ? "Analytics"
      : "Prompts";

  return (
    <Breadcrumb>
      <BreadcrumbList className="text-sm font-medium">
        <BreadcrumbItem>
          <BreadcrumbPage>{title}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
