import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEFAULT_SERVER, ENROLL_HELP, ROOT_HELP, run } from "../src/cli.js";
import { exchangeEnrollment } from "../src/client.js";
import {
  applyConfigurationPlans,
  planConfigurations,
  updateClaudeSettings,
  updateCodexConfig,
} from "../src/config.js";
import { SETUP_PACKAGE_VERSION } from "../src/version.js";

const CODE = "secret-enrollment-code";
const CODEX_TOKEN = "secret-codex-token";
const CLAUDE_TOKEN = "secret-claude-token";
const SERVER = "https://setup.example.test";
const COLLECTOR = "https://collector.example.test";
const INSTALLATIONS = [
  {
    installation_id: "00000000-0000-4000-8000-000000000001",
    organization_id: "10000000-0000-4000-8000-000000000001",
    tool: "codex",
    token: CODEX_TOKEN,
  },
  {
    installation_id: "00000000-0000-4000-8000-000000000002",
    organization_id: "10000000-0000-4000-8000-000000000001",
    tool: "claude_code",
    token: CLAUDE_TOKEN,
  },
];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("provides root and layered enrollment help with copyable examples", async () => {
  assert.equal((await run(["--help"])).help, ROOT_HELP);
  assert.equal((await run(["enroll", "--help"])).help, ENROLL_HELP);
  assert.match(ROOT_HELP, /npx @slowpokeai\/setup enroll/);
  assert.match(ROOT_HELP, /pnpm dlx @slowpokeai\/setup enroll/);
  assert.match(ROOT_HELP, /yarn dlx @slowpokeai\/setup enroll/);
  assert.match(ROOT_HELP, /bunx @slowpokeai\/setup enroll/);
  assert.match(ENROLL_HELP, /--code <code> \[options\]/);
  assert.match(ENROLL_HELP, /--server <url>\s+Override/);
  assert.match(ENROLL_HELP, /Examples:/);
});

test("dry run performs no request and does not expose the code", async () => {
  let requested = false;
  const directory = mkdtempSync(join(tmpdir(), "slowpoke-setup-dry-run-"));
  const result = await run(["enroll", "--code", CODE, "--server", SERVER, "--dry-run"], {
    home: directory,
    fetch: async () => {
      requested = true;
      throw new Error("unexpected request");
    },
  });

  assert.equal(requested, false);
  assert.equal(result.output.status, "dry-run");
  assert.equal(existsSync(join(directory, ".codex")), false);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(CODE));
});

test("Codex merge preserves unrelated settings", () => {
  const source = `model = "gpt-test"

[otel]
# Keep this comment.
custom_setting = "keep"
environment = "staging"
exporter = "none"

[features]
memories = true
`;
  const updated = updateCodexConfig(source, `Bearer ${CODEX_TOKEN}`, COLLECTOR);

  assert.match(updated, /model = "gpt-test"/);
  assert.match(updated, /# Keep this comment\./);
  assert.match(updated, /custom_setting = "keep"/);
  assert.match(updated, /authorization = "Bearer secret-codex-token"/);
  assert.match(updated, /\[features\]\nmemories = true/);
  assert.equal(updated.match(/^\s*exporter\s*=/gm)?.length, 1);
});

test("Claude Code merge preserves unrelated settings and env values", () => {
  const updated = updateClaudeSettings(
    JSON.stringify({ permissions: { allow: ["Read"] }, env: { KEEP_ME: "yes" } }),
    `Bearer ${CLAUDE_TOKEN}`,
    COLLECTOR,
  );
  const parsed = JSON.parse(updated);

  assert.deepEqual(parsed.permissions, { allow: ["Read"] });
  assert.equal(parsed.env.KEEP_ME, "yes");
  assert.equal(parsed.env.OTEL_EXPORTER_OTLP_ENDPOINT, COLLECTOR);
  assert.equal(parsed.env.OTEL_EXPORTER_OTLP_HEADERS, `Authorization=Bearer ${CLAUDE_TOKEN}`);
});

test("malformed existing files fail before any configuration is written", () => {
  const directory = mkdtempSync(join(tmpdir(), "slowpoke-setup-malformed-"));
  mkdirSync(join(directory, ".codex"));
  mkdirSync(join(directory, ".claude"));
  const codexPath = join(directory, ".codex", "config.toml");
  const claudePath = join(directory, ".claude", "settings.json");
  writeFileSync(codexPath, 'model = "keep"\n');
  writeFileSync(claudePath, "{not-json");

  assert.throws(
    () =>
      planConfigurations({
        home: directory,
        installations: INSTALLATIONS,
        collectorUrl: COLLECTOR,
      }),
    /not valid JSON/,
  );
  assert.equal(readFileSync(codexPath, "utf8"), 'model = "keep"\n');
  assert.equal(existsSync(`${codexPath}.slowpoke-backup`), false);
});

test("writes private files atomically and creates only one backup", () => {
  const directory = mkdtempSync(join(tmpdir(), "slowpoke-setup-files-"));
  mkdirSync(join(directory, ".codex"));
  mkdirSync(join(directory, ".claude"));
  const codexPath = join(directory, ".codex", "config.toml");
  const claudePath = join(directory, ".claude", "settings.json");
  writeFileSync(codexPath, 'model = "before"\n');
  writeFileSync(claudePath, '{"theme":"dark"}\n');

  const firstPlans = planConfigurations({
    home: directory,
    installations: INSTALLATIONS,
    collectorUrl: COLLECTOR,
  });
  applyConfigurationPlans(firstPlans);
  const firstCodexBackup = readFileSync(`${codexPath}.slowpoke-backup`, "utf8");
  const firstClaudeBackup = readFileSync(`${claudePath}.slowpoke-backup`, "utf8");
  const secondPlans = planConfigurations({
    home: directory,
    installations: INSTALLATIONS,
    collectorUrl: "https://new-collector.example.test",
  });
  applyConfigurationPlans(secondPlans);

  assert.equal(firstCodexBackup, 'model = "before"\n');
  assert.equal(firstClaudeBackup, '{"theme":"dark"}\n');
  assert.equal(readFileSync(`${codexPath}.slowpoke-backup`, "utf8"), firstCodexBackup);
  assert.equal(readFileSync(`${claudePath}.slowpoke-backup`, "utf8"), firstClaudeBackup);
  assert.equal(statSync(codexPath).mode & 0o777, 0o600);
  assert.equal(statSync(claudePath).mode & 0o777, 0o600);
  assert.equal(statSync(`${codexPath}.slowpoke-backup`).mode & 0o777, 0o600);
  assert.equal(statSync(`${claudePath}.slowpoke-backup`).mode & 0o777, 0o600);
  assert.equal(existsSync(`${codexPath}.tmp-${process.pid}`), false);
});

test("enrollment retries transient failures and sends one non-prompt verification per tool", async () => {
  const directory = mkdtempSync(join(tmpdir(), "slowpoke-setup-retry-"));
  const requests = [];
  let enrollmentAttempts = 0;
  const fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/api/setup/enroll")) {
      enrollmentAttempts += 1;
      return enrollmentAttempts === 1
        ? jsonResponse({ detail: "temporary" }, 503)
        : jsonResponse({ collector_url: COLLECTOR, installations: INSTALLATIONS });
    }
    return jsonResponse({});
  };

  const result = await run(["enroll", "--code", CODE, "--computer-name", "Ada's laptop"], {
    fetch,
    home: directory,
    sleep: async () => {},
  });

  assert.equal(enrollmentAttempts, 2);
  assert.equal(requests[0].url, `${DEFAULT_SERVER}/api/setup/enroll`);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    code: CODE,
    computer_name: "Ada's laptop",
    setup_package_version: SETUP_PACKAGE_VERSION,
  });
  const verifications = requests.filter(({ url }) => url === `${COLLECTOR}/v1/logs`);
  assert.equal(verifications.length, 2);
  assert.deepEqual(
    verifications.map(({ options }) => options.headers.Authorization),
    [`Bearer ${CODEX_TOKEN}`, `Bearer ${CLAUDE_TOKEN}`],
  );
  for (const { options } of verifications) {
    assert.match(options.body, /slowpoke\.setup\.verification/);
    assert.doesNotMatch(options.body, /user_prompt|prompt_text/);
  }
  const codex = readFileSync(join(directory, ".codex", "config.toml"), "utf8");
  const claude = readFileSync(join(directory, ".claude", "settings.json"), "utf8");
  assert.match(codex, new RegExp(CODEX_TOKEN));
  assert.doesNotMatch(codex, new RegExp(CLAUDE_TOKEN));
  assert.match(claude, new RegExp(CLAUDE_TOKEN));
  assert.doesNotMatch(claude, new RegExp(CODEX_TOKEN));
  assert.equal(result.output.status, "success");
  assert.doesNotMatch(JSON.stringify(result), new RegExp(`${CODE}|${CODEX_TOKEN}|${CLAUDE_TOKEN}`));
});

test("server errors are stable and redact server response secrets", async () => {
  await assert.rejects(
    exchangeEnrollment(
      { code: CODE, server: SERVER, computerName: "Test computer" },
      {
        fetch: async () => jsonResponse({ detail: `${CODE} ${CODEX_TOKEN}` }, 400),
      },
    ),
    (error) => {
      assert.equal(error.code, "invalid_code");
      assert.equal(error.message, "The setup code is invalid.");
      assert.doesNotMatch(`${error.message}${error.stack}`, new RegExp(`${CODE}|${CODEX_TOKEN}`));
      return true;
    },
  );
});
