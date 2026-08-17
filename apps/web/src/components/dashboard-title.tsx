"use client";

import Link from "next/link";
import { useSearchParams, useSelectedLayoutSegments } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export function DashboardTitle() {
  const [section] = useSelectedLayoutSegments();
  const searchParams = useSearchParams();

  if (section === "messages") {
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

  const title = section === "settings" ? "Settings" : "Prompts";

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
