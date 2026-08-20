import { describe, expect, it } from "vitest";

import {
  claudeTeamEnrollmentSchema,
  createClaudeTeamManagedSettings,
  teamNameSchema,
} from "./claude-team-installation";

describe("Claude team installations", () => {
  it("validates and trims team names", () => {
    expect(teamNameSchema.parse("  Platform  ")).toBe("Platform");
    expect(teamNameSchema.safeParse(" ").success).toBe(false);
    expect(teamNameSchema.safeParse("x".repeat(81)).success).toBe(false);
  });

  it("accepts one Claude Code enrollment", () => {
    expect(
      claudeTeamEnrollmentSchema.parse({
        collector_url: "https://collector.example.test/",
        installations: [
          {
            installation_id: "00000000-0000-4000-8000-000000000001",
            organization_id: "10000000-0000-4000-8000-000000000001",
            tool: "claude_code",
            token: "signed-token",
          },
        ],
      }).installations[0].tool,
    ).toBe("claude_code");
  });

  it("rejects another tool or more than one installation", () => {
    const installation = {
      installation_id: "00000000-0000-4000-8000-000000000001",
      organization_id: "10000000-0000-4000-8000-000000000001",
      token: "signed-token",
    };
    expect(() =>
      claudeTeamEnrollmentSchema.parse({
        collector_url: "https://collector.example.test",
        installations: [{ ...installation, tool: "codex" }],
      }),
    ).toThrow();
    expect(() =>
      claudeTeamEnrollmentSchema.parse({
        collector_url: "https://collector.example.test",
        installations: [
          { ...installation, tool: "claude_code" },
          { ...installation, tool: "claude_code" },
        ],
      }),
    ).toThrow();
  });

  it("generates the complete managed settings payload", () => {
    expect(
      JSON.parse(
        createClaudeTeamManagedSettings("https://collector.example.test/", "signed-token"),
      ),
    ).toEqual({
      env: {
        CLAUDE_CODE_ENABLE_TELEMETRY: "1",
        CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: "1",
        OTEL_LOGS_EXPORTER: "otlp",
        OTEL_METRICS_EXPORTER: "otlp",
        OTEL_TRACES_EXPORTER: "otlp",
        OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
        OTEL_LOG_USER_PROMPTS: "1",
        OTEL_LOG_ASSISTANT_RESPONSES: "0",
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://collector.example.test",
        OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer signed-token",
      },
    });
  });
});
