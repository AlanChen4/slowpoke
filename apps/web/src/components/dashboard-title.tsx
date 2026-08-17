"use client";

import { useSelectedLayoutSegments } from "next/navigation";

export function DashboardTitle() {
  const [section] = useSelectedLayoutSegments();
  const title = section === "settings" ? "Settings" : "Prompts";

  return <p className="text-sm font-medium">{title}</p>;
}
