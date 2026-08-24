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
  const endpoint = escapeTomlString(`${normalizedCollectorUrl(collectorUrl)}/v1/logs`);
  const authorization = escapeTomlString(`Bearer ${token}`);
  return `[otel]
environment = "production"
log_user_prompt = true
exporter = { otlp-http = { endpoint = "${endpoint}", protocol = "binary", headers = { authorization = "${authorization}" } } }
metrics_exporter = "none"
trace_exporter = "none"
`;
}

export function createClaudeTeamManagedSettings(collectorUrl: string, token: string) {
  return `${JSON.stringify(
    {
      env: {
        CLAUDE_CODE_ENABLE_TELEMETRY: "1",
        CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: "1",
        OTEL_LOGS_EXPORTER: "otlp",
        OTEL_METRICS_EXPORTER: "otlp",
        OTEL_TRACES_EXPORTER: "otlp",
        OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
        OTEL_LOG_USER_PROMPTS: "1",
        OTEL_LOG_ASSISTANT_RESPONSES: "0",
        OTEL_EXPORTER_OTLP_ENDPOINT: normalizedCollectorUrl(collectorUrl),
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
