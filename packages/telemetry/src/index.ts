export const telemetrySignals = ["logs", "metrics", "traces"] as const;

export type TelemetrySignal = (typeof telemetrySignals)[number];

export const aiHarnesses = ["claude-code", "codex", "cursor", "gemini-cli", "other"] as const;

export type AiHarness = (typeof aiHarnesses)[number];

export interface TelemetrySource {
  harness: AiHarness;
  installationId: string;
  organizationId: string;
}

export interface CanonicalTelemetryEvent {
  id: string;
  schemaVersion: 1;
  signal: TelemetrySignal;
  source: TelemetrySource;
  occurredAt: string;
  receivedAt: string;
  name: string;
  attributes: Record<string, boolean | number | string>;
}
