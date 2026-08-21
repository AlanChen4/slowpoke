import { describe, expect, it } from "vitest";

import {
  createClaudeTeamManagedSettings,
  createCodexTeamManagedSettings,
  teamEnrollmentSchema,
} from "./team-installation";

describe("team installations", () => {
  it.each(["codex", "claude_code"] as const)("accepts one %s enrollment", (tool) => {
    expect(
      teamEnrollmentSchema.parse({
        collector_url: "https://collector.example.test/",
        installations: [
          {
            installation_id: "00000000-0000-4000-8000-000000000001",
            organization_id: "10000000-0000-4000-8000-000000000001",
            tool,
            token: "signed-token",
          },
        ],
      }).installations[0].tool,
    ).toBe(tool);
  });

  it("rejects more than one installation", () => {
    const installation = {
      installation_id: "00000000-0000-4000-8000-000000000001",
      organization_id: "10000000-0000-4000-8000-000000000001",
      tool: "codex",
      token: "signed-token",
    };
    expect(() =>
      teamEnrollmentSchema.parse({
        collector_url: "https://collector.example.test",
        installations: [installation, installation],
      }),
    ).toThrow();
  });

  it("generates the complete Claude managed settings payload", () => {
    expect(
      JSON.parse(
        createClaudeTeamManagedSettings("https://collector.example.test/", "signed-token"),
      ),
    ).toEqual({
      env: {
        CLAUDE_CODE_ENABLE_TELEMETRY: "1",
        CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: "1",
        ENABLE_BETA_TRACING_DETAILED: "1",
        BETA_TRACING_ENDPOINT: "https://collector.example.test",
        OTEL_LOGS_EXPORTER: "otlp",
        OTEL_METRICS_EXPORTER: "otlp",
        OTEL_TRACES_EXPORTER: "otlp",
        OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
        OTEL_LOG_USER_PROMPTS: "1",
        OTEL_LOG_ASSISTANT_RESPONSES: "1",
        OTEL_LOG_TOOL_DETAILS: "1",
        OTEL_LOG_TOOL_CONTENT: "1",
        OTEL_LOG_RAW_API_BODIES: "1",
        CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH: "262144",
        OTEL_METRICS_INCLUDE_SESSION_ID: "true",
        OTEL_METRICS_INCLUDE_VERSION: "true",
        OTEL_METRICS_INCLUDE_ACCOUNT_UUID: "true",
        OTEL_METRICS_INCLUDE_ENTRYPOINT: "true",
        OTEL_METRICS_INCLUDE_RESOURCE_ATTRIBUTES: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://collector.example.test",
        OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Bearer signed-token",
      },
    });
  });

  it("generates the complete Codex managed settings payload", () => {
    expect(createCodexTeamManagedSettings("https://collector.example.test/", 'signed-"token'))
      .toBe(`[otel]
environment = "production"
log_user_prompt = true
exporter = { otlp-http = { endpoint = "https://collector.example.test/v1/logs", protocol = "binary", headers = { authorization = "Bearer signed-\\"token" } } }
metrics_exporter = { otlp-http = { endpoint = "https://collector.example.test/v1/metrics", protocol = "binary", headers = { authorization = "Bearer signed-\\"token" } } }
trace_exporter = { otlp-http = { endpoint = "https://collector.example.test/v1/traces", protocol = "binary", headers = { authorization = "Bearer signed-\\"token" } } }
`);
  });
});
