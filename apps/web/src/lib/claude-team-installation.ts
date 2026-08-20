import * as z from "zod";

const enrolledInstallationSchema = z.object({
  installation_id: z.uuid(),
  organization_id: z.uuid(),
  tool: z.literal("claude_code"),
  token: z.string().min(1),
});

export const claudeTeamEnrollmentSchema = z.object({
  collector_url: z.url(),
  installations: z.array(enrolledInstallationSchema).length(1),
});

export const teamNameSchema = z.string().trim().min(1, "Enter a team name.").max(80);

export function createClaudeTeamManagedSettings(collectorUrl: string, token: string) {
  const normalizedCollectorUrl = new URL(collectorUrl).href.replace(/\/$/, "");
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
        OTEL_EXPORTER_OTLP_ENDPOINT: normalizedCollectorUrl,
        OTEL_EXPORTER_OTLP_HEADERS: `Authorization=Bearer ${token}`,
      },
    },
    null,
    2,
  )}\n`;
}
