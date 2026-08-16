#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const INSTALLATION_ID = "00000000-0000-4000-8000-000000000001";
const REQUIRED_STATE_KEYS = [
  "SLOWPOKE_INSTALLATION_ID",
  "SLOWPOKE_INGEST_TOKEN",
  "SLOWPOKE_OTLP_HTPASSWD",
  "SLOWPOKE_CODEX_AUTHORIZATION",
];
const MANAGED_KEYS = new Set([
  "environment",
  "exporter",
  "log_user_prompt",
  "metrics_exporter",
  "trace_exporter",
]);

function escapeTomlString(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function otelLines(authorization, collectorUrl) {
  const endpoint = escapeTomlString(`${collectorUrl}/v1/logs`);
  const header = escapeTomlString(authorization);

  return [
    'environment = "dev"',
    "log_user_prompt = true",
    `exporter = { otlp-http = { endpoint = "${endpoint}", protocol = "binary", headers = { authorization = "${header}" } } }`,
    'metrics_exporter = "none"',
    'trace_exporter = "none"',
  ];
}

function sectionEnd(lines, start) {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[\[?.+\]?\]\s*(?:#.*)?$/.test(lines[index])) {
      return index;
    }
  }
  return lines.length;
}

function withoutManagedAssignments(lines) {
  const output = [];

  for (let index = 0; index < lines.length;) {
    const match = lines[index].match(/^\s*([A-Za-z0-9_-]+)\s*=/);
    if (!match) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    let next = index + 1;
    while (next < lines.length && !/^\s*[A-Za-z0-9_-]+\s*=/.test(lines[next])) {
      next += 1;
    }

    if (!MANAGED_KEYS.has(match[1])) {
      output.push(...lines.slice(index, next));
    }
    index = next;
  }

  while (output.at(-1) === "") {
    output.pop();
  }
  return output;
}

export function updateCodexConfig(source, authorization, collectorUrl) {
  const normalized = source.replaceAll("\r\n", "\n");
  const hadTrailingNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (hadTrailingNewline) {
    lines.pop();
  }

  if (lines.some((line) => /^\s*\[\[?otel\./.test(line))) {
    throw new Error(
      "Nested [otel.*] tables are present. Move them into one [otel] table before running setup.",
    );
  }
  if (lines.some((line) => /^\s*otel\.[A-Za-z0-9_-]+\s*=/.test(line))) {
    throw new Error(
      "Dotted otel.* settings are present. Move them into one [otel] table before running setup.",
    );
  }

  const start = lines.findIndex((line) => /^\s*\[otel\]\s*(?:#.*)?$/.test(line));
  const settings = otelLines(authorization, collectorUrl);

  if (start === -1) {
    const prefix = lines.length > 0 && lines.at(-1) !== "" ? [...lines, ""] : lines;
    return [...prefix, "[otel]", ...settings, ""].join("\n");
  }

  const end = sectionEnd(lines, start);
  const preserved = withoutManagedAssignments(lines.slice(start + 1, end));
  const replacement = [lines[start], ...preserved];
  if (preserved.length > 0) {
    replacement.push("");
  }
  replacement.push(...settings);

  const result = [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join("\n");
  return `${result}\n`;
}

function stateValues(source) {
  const values = new Map();
  for (const line of source.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)='([^']*)'$/);
    if (match) {
      values.set(match[1], match[2]);
    }
  }
  return values;
}

function createState() {
  const password = randomBytes(24).toString("base64url");
  const passwordDigest = createHash("sha1").update(password).digest("base64");
  const encodedCredential = Buffer.from(`${INSTALLATION_ID}:${password}`).toString("base64");

  return new Map([
    ["SLOWPOKE_INSTALLATION_ID", INSTALLATION_ID],
    ["SLOWPOKE_INGEST_TOKEN", randomBytes(32).toString("base64url")],
    ["SLOWPOKE_OTLP_HTPASSWD", `${INSTALLATION_ID}:{SHA}${passwordDigest}`],
    ["SLOWPOKE_CODEX_AUTHORIZATION", `Basic ${encodedCredential}`],
  ]);
}

function writePrivateFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
  renameSync(temporaryPath, path);
  chmodSync(path, 0o600);
}

function serializeState(values) {
  return `${[...values.entries()].map(([key, value]) => `${key}='${value}'`).join("\n")}\n`;
}

export function installLocalCodex({ configPath, statePath, collectorUrl }) {
  const existingState = existsSync(statePath) ? stateValues(readFileSync(statePath, "utf8")) : null;
  const hasCompleteState =
    existingState !== null && REQUIRED_STATE_KEYS.every((key) => existingState.get(key));
  const state = hasCompleteState ? existingState : createState();
  writePrivateFile(statePath, serializeState(state));

  const originalConfig = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const updatedConfig = updateCodexConfig(
    originalConfig,
    state.get("SLOWPOKE_CODEX_AUTHORIZATION"),
    collectorUrl,
  );

  if (updatedConfig !== originalConfig) {
    mkdirSync(dirname(configPath), { recursive: true });
    const backupPath = `${configPath}.slowpoke-backup`;
    if (existsSync(configPath) && !existsSync(backupPath)) {
      copyFileSync(configPath, backupPath);
      chmodSync(backupPath, 0o600);
    }
    writePrivateFile(configPath, updatedConfig);
  }

  return { changed: updatedConfig !== originalConfig, configPath, statePath };
}

function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, "..");
  // oxlint-disable-next-line node/no-process-env -- setup honors Codex's documented home override.
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  // oxlint-disable-next-line node/no-process-env -- setup must match the configured local Collector port.
  const collectorPort = process.env.SLOWPOKE_COLLECTOR_PORT || "4318";
  const result = installLocalCodex({
    configPath: join(codexHome, "config.toml"),
    statePath: join(repositoryRoot, ".slowpoke", "local-dev.env"),
    collectorUrl: `http://127.0.0.1:${collectorPort}`,
  });

  console.log(
    result.changed
      ? "Configured Codex for Slowpoke local development."
      : "Codex is already configured for Slowpoke local development.",
  );
  console.log(`Config: ${result.configPath}`);
  console.log(`Local credential state: ${result.statePath}`);
  console.log("Restart Codex after the local development stack is running.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
