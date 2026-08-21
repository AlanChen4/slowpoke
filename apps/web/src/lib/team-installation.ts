import * as z from "zod";

export const teamToolSchema = z.enum(["codex", "claude_code"]);

const enrolledInstallationSchema = z.object({
  installation_id: z.uuid(),
  organization_id: z.uuid(),
  tool: teamToolSchema,
  token: z.string().min(1),
});

export const teamEnrollmentSchema = z.object({
  collector_url: z.url(),
  installations: z.array(enrolledInstallationSchema).length(1),
});

function normalizedCollectorUrl(collectorUrl: string) {
  return new URL(collectorUrl).href.replace(/\/$/, "");
}

function escapeTomlString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function createCodexTeamManagedSettings(collectorUrl: string, token: string) {
  const endpoint = normalizedCollectorUrl(collectorUrl);
  const logsEndpoint = escapeTomlString(`${endpoint}/v1/logs`);
  const metricsEndpoint = escapeTomlString(`${endpoint}/v1/metrics`);
  const tracesEndpoint = escapeTomlString(`${endpoint}/v1/traces`);
  const authorization = escapeTomlString(`Bearer ${token}`);
  return `[otel]
environment = "production"
log_user_prompt = true
exporter = { otlp-http = { endpoint = "${logsEndpoint}", protocol = "binary", headers = { authorization = "${authorization}" } } }
metrics_exporter = { otlp-http = { endpoint = "${metricsEndpoint}", protocol = "binary", headers = { authorization = "${authorization}" } } }
trace_exporter = { otlp-http = { endpoint = "${tracesEndpoint}", protocol = "binary", headers = { authorization = "${authorization}" } } }
`;
}

export function createClaudeTeamManagedSettings(collectorUrl: string, token: string) {
  const endpoint = normalizedCollectorUrl(collectorUrl);
  return `${JSON.stringify(
    {
      env: {
        CLAUDE_CODE_ENABLE_TELEMETRY: "1",
        CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: "1",
        ENABLE_BETA_TRACING_DETAILED: "1",
        BETA_TRACING_ENDPOINT: endpoint,
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
        OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
        OTEL_EXPORTER_OTLP_HEADERS: `Authorization=Bearer ${token}`,
      },
    },
    null,
    2,
  )}\n`;
}

export function createTeamManagedSettings(
  tool: z.infer<typeof teamToolSchema>,
  collectorUrl: string,
  token: string,
) {
  return tool === "codex"
    ? createCodexTeamManagedSettings(collectorUrl, token)
    : createClaudeTeamManagedSettings(collectorUrl, token);
}
