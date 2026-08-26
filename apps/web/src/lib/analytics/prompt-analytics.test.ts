import { describe, expect, it } from "vitest";

import {
  analyticsTimezoneSchema,
  metricChange,
  parseAnalyticsRange,
  recentActivityLabel,
} from "./prompt-analytics";

describe("parseAnalyticsRange", () => {
  it("accepts supported ranges", () => {
    expect(parseAnalyticsRange("7")).toBe(7);
    expect(parseAnalyticsRange("30")).toBe(30);
    expect(parseAnalyticsRange(["90", "7"])).toBe(90);
  });

  it("defaults invalid ranges to 30 days", () => {
    expect(parseAnalyticsRange(undefined)).toBe(30);
    expect(parseAnalyticsRange("14")).toBe(30);
    expect(parseAnalyticsRange("anything")).toBe(30);
  });
});

describe("analyticsTimezoneSchema", () => {
  it("accepts IANA timezones and rejects invalid values", () => {
    expect(analyticsTimezoneSchema.safeParse("America/New_York").success).toBe(true);
    expect(analyticsTimezoneSchema.safeParse("Not/A_Timezone").success).toBe(false);
  });
});

describe("metricChange", () => {
  it("handles zero baselines", () => {
    expect(metricChange(0, 0)).toEqual({ label: "0%", value: 0 });
    expect(metricChange(3, 0)).toEqual({ label: "New", value: null });
  });

  it("formats increases and decreases", () => {
    expect(metricChange(15, 10)).toEqual({ label: "+50%", value: 50 });
    expect(metricChange(5, 10)).toEqual({ label: "-50%", value: -50 });
  });
});

describe("recentActivityLabel", () => {
  const now = Date.parse("2026-08-25T12:00:00Z");

  it("formats activity from the last day with minute precision", () => {
    expect(recentActivityLabel("2026-08-25T06:28:00Z", now)).toBe("5 hours 32 minutes ago");
    expect(recentActivityLabel("2026-08-25T11:59:00Z", now)).toBe("1 minute ago");
    expect(recentActivityLabel("2026-08-25T12:00:00Z", now)).toBe("Just now");
  });

  it("leaves older, future, and invalid timestamps to the absolute formatter", () => {
    expect(recentActivityLabel("2026-08-24T12:00:00Z", now)).toBeNull();
    expect(recentActivityLabel("2026-08-25T12:01:00Z", now)).toBeNull();
    expect(recentActivityLabel("not-a-date", now)).toBeNull();
  });
});
