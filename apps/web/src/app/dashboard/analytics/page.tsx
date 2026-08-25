import { redirect } from "next/navigation";

import { AnalyticsDashboard } from "@/app/dashboard/analytics/analytics-dashboard";
import { parseAnalyticsRange } from "@/lib/analytics/prompt-analytics";
import { getOrganizationContext } from "@/lib/organizations/organization-context";

type AnalyticsPageProps = {
  searchParams: Promise<{ range?: string | string[] }>;
};

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const [{ range }, { selectedOrganization }] = await Promise.all([
    searchParams,
    getOrganizationContext(),
  ]);

  if (selectedOrganization?.role !== "admin") {
    redirect("/dashboard?scope=human");
  }

  return <AnalyticsDashboard days={parseAnalyticsRange(range)} />;
}
