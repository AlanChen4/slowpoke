import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { installLocalCodex, updateCodexConfig } from "./setup-local-codex.mjs";

const AUTHORIZATION = "Basic dGVzdDp0ZXN0";
const COLLECTOR_URL = "http://127.0.0.1:4318";

test("adds local telemetry without changing existing settings", () => {
  const source = 'model = "gpt-test"\n\n[features]\nmemories = true\n';
  const updated = updateCodexConfig(source, AUTHORIZATION, COLLECTOR_URL);

  assert.match(updated, /^model = "gpt-test"/);
  assert.match(updated, /\[features\]\nmemories = true/);
  assert.match(updated, /\[otel\]/);
  assert.match(updated, /log_user_prompt = true/);
  assert.match(updated, /authorization = "Basic dGVzdDp0ZXN0"/);
  assert.match(updated, /metrics_exporter = "none"/);
});

test("updates managed telemetry keys and preserves unrelated otel settings", () => {
  const source = `[otel]
# Keep this comment.
  environment = "staging"
custom_setting = "keep"
  exporter = "none"

[features]
memories = true
`;
  const updated = updateCodexConfig(source, AUTHORIZATION, COLLECTOR_URL);

  assert.match(updated, /# Keep this comment\./);
  assert.match(updated, /custom_setting = "keep"/);
  assert.match(updated, /environment = "dev"/);
  assert.doesNotMatch(updated, /environment = "staging"/);
  assert.equal(updated.match(/^\s*exporter\s*=/gm)?.length, 1);
  assert.equal(updated.match(/\[otel\]/g)?.length, 1);
  assert.match(updated, /\[features\]\nmemories = true/);
});

test("rejects nested otel tables instead of risking a partial edit", () => {
  assert.throws(
    () =>
      updateCodexConfig(
        '[otel.exporter."otlp-http"]\nendpoint = "example"\n',
        AUTHORIZATION,
        COLLECTOR_URL,
      ),
    /Nested \[otel\.\*\] tables/,
  );
});

test("installation is idempotent and writes private state", () => {
  const directory = mkdtempSync(join(tmpdir(), "slowpoke-codex-"));
  const configPath = join(directory, "codex", "config.toml");
  const statePath = join(directory, "project", ".slowpoke", "local-dev.env");
  mkdirSync(join(directory, "codex"));
  writeFileSync(configPath, 'model = "gpt-test"\n', { encoding: "utf8", flag: "wx" });

  const first = installLocalCodex({ configPath, statePath, collectorUrl: COLLECTOR_URL });
  const firstConfig = readFileSync(configPath, "utf8");
  const firstState = readFileSync(statePath, "utf8");
  const second = installLocalCodex({ configPath, statePath, collectorUrl: COLLECTOR_URL });

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(readFileSync(configPath, "utf8"), firstConfig);
  assert.equal(readFileSync(statePath, "utf8"), firstState);
  assert.equal(statSync(statePath).mode & 0o777, 0o600);
  assert.equal(statSync(configPath).mode & 0o777, 0o600);
  assert.equal(readFileSync(`${configPath}.slowpoke-backup`, "utf8"), 'model = "gpt-test"\n');
});

test("repairs incomplete local credential state", () => {
  const directory = mkdtempSync(join(tmpdir(), "slowpoke-codex-"));
  const configPath = join(directory, "codex", "config.toml");
  const statePath = join(directory, "project", ".slowpoke", "local-dev.env");
  mkdirSync(join(directory, "codex"), { recursive: true });
  mkdirSync(join(directory, "project", ".slowpoke"), { recursive: true });
  writeFileSync(configPath, 'model = "gpt-test"\n', { encoding: "utf8", flag: "wx" });
  writeFileSync(statePath, "SLOWPOKE_CODEX_AUTHORIZATION='Basic stale'\n", "utf8");

  installLocalCodex({ configPath, statePath, collectorUrl: COLLECTOR_URL });

  const repairedState = readFileSync(statePath, "utf8");
  assert.match(repairedState, /^SLOWPOKE_INSTALLATION_ID=/m);
  assert.match(repairedState, /^SLOWPOKE_INGEST_TOKEN=/m);
  assert.match(repairedState, /^SLOWPOKE_OTLP_HTPASSWD=/m);
  assert.match(repairedState, /^SLOWPOKE_CODEX_AUTHORIZATION=/m);
  assert.doesNotMatch(repairedState, /Basic stale/);
});
