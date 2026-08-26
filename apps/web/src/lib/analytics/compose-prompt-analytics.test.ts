import { describe, expect, it } from "vitest";

import { analyticsHeatmapDays, buildPromptAnalyticsRpcArguments } from "./compose-prompt-analytics";

describe("buildPromptAnalyticsRpcArguments", () => {
  it.each([7, 30, 90] as const)(
    "keeps the heatmap at 90 days when the report range is %i days",
    (days) => {
      const argumentsByPurpose = buildPromptAnalyticsRpcArguments({
        days,
        end: "2026-08-25T16:00:00.000Z",
        organizationId: "00000000-0000-4000-8000-000000000003",
        timezone: "America/New_York",
      });

      expect(argumentsByPurpose.report.p_days).toBe(days);
      expect(argumentsByPurpose.heatmap).toEqual({
        p_days: analyticsHeatmapDays,
        p_end: argumentsByPurpose.report.p_end,
        p_organization_id: argumentsByPurpose.report.p_organization_id,
        p_timezone: argumentsByPurpose.report.p_timezone,
      });
    },
  );
});
