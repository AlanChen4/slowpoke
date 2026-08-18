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

function credentialsFromAuthorization(authorization) {
  const match = authorization.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/);
  if (!match) {
    return null;
  }

  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator <= 0 || separator === decoded.length - 1) {
    return null;
  }

  const installationId = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  const passwordDigest = createHash("sha1").update(password).digest("base64");

  return new Map([
    ["SLOWPOKE_INSTALLATION_ID", installationId],
    ["SLOWPOKE_INGEST_TOKEN", password],
    ["SLOWPOKE_OTLP_HTPASSWD", `${installationId}:{SHA}${passwordDigest}`],
    ["SLOWPOKE_CODEX_AUTHORIZATION", authorization],
  ]);
}

function createCredentials() {
  const password = randomBytes(24).toString("base64url");
  const encodedCredential = Buffer.from(`${INSTALLATION_ID}:${password}`).toString("base64");

  return credentialsFromAuthorization(`Basic ${encodedCredential}`);
}

function writePrivateFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
  renameSync(temporaryPath, path);
  chmodSync(path, 0o600);
}

function serializeCredentials(values) {
  return `${[...values.entries()].map(([key, value]) => `${key}='${value}'`).join("\n")}\n`;
}

export function configuredCredentials(source, collectorUrl) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const start = lines.findIndex((line) => /^\s*\[otel\]\s*(?:#.*)?$/.test(line));
  if (start === -1) {
    return null;
  }

  const section = lines.slice(start + 1, sectionEnd(lines, start)).join("\n");
  const endpoint = section.match(/\bendpoint\s*=\s*"([^"\r\n]+)"/)?.[1];
  const authorization = section.match(/\bauthorization\s*=\s*"([^"\r\n]+)"/)?.[1];
  if (endpoint !== `${collectorUrl}/v1/logs` || !authorization) {
    return null;
  }

  return credentialsFromAuthorization(authorization);
}

export function installLocalCodex({ configPath, statePath, collectorUrl }) {
  const originalConfig = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const configured = configuredCredentials(originalConfig, collectorUrl);
  const legacyState =
    statePath && existsSync(statePath) ? stateValues(readFileSync(statePath, "utf8")) : null;
  const legacyAuthorization = legacyState?.get("SLOWPOKE_CODEX_AUTHORIZATION");
  const legacyCredentials = legacyAuthorization
    ? credentialsFromAuthorization(legacyAuthorization)
    : null;
  const credentials = configured ?? legacyCredentials ?? createCredentials();
  const updatedConfig = updateCodexConfig(
    originalConfig,
    credentials.get("SLOWPOKE_CODEX_AUTHORIZATION"),
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

  return { changed: updatedConfig !== originalConfig, configPath };
}

function localPaths() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, "..");
  // oxlint-disable-next-line node/no-process-env -- setup honors Codex's documented home override.
  const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
  // oxlint-disable-next-line node/no-process-env -- setup must match the configured local Collector port.
  const collectorPort = process.env.SLOWPOKE_COLLECTOR_PORT || "4318";
  return {
    collectorUrl: `http://127.0.0.1:${collectorPort}`,
    configPath: join(codexHome, "config.toml"),
    legacyStatePath: join(repositoryRoot, ".slowpoke", "local-dev.env"),
  };
}

function printCredentials() {
  const { collectorUrl, configPath } = localPaths();
  const source = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const credentials = configuredCredentials(source, collectorUrl);
  if (!credentials) {
    console.error(`Missing Slowpoke credentials in ${configPath}. Run: pnpm setup:codex`);
    return false;
  }

  process.stdout.write(serializeCredentials(credentials));
  return true;
}

function printHelp() {
  console.log(`Configure Codex to send local telemetry to Slowpoke.

Usage:
  pnpm setup:codex [--dry-run]

Options:
  --dry-run   Report the planned action without changing the Codex config.
  --help, -h  Show this help.

Examples:
  pnpm setup:codex
  pnpm setup:codex --dry-run`);
}

function printDryRun() {
  const { collectorUrl, configPath } = localPaths();
  const source = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const configured = configuredCredentials(source, collectorUrl) !== null;

  console.log("status: dry-run");
  console.log(`action: ${configured ? "none" : "configure"}`);
  console.log(`config: ${configPath}`);
  console.log(`collector_url: ${collectorUrl}`);
}

function configure() {
  const { collectorUrl, configPath, legacyStatePath } = localPaths();
  const result = installLocalCodex({
    configPath,
    statePath: legacyStatePath,
    collectorUrl,
  });

  console.log(
    result.changed
      ? "Configured Codex for Slowpoke local development."
      : "Codex is already configured for Slowpoke local development.",
  );
  console.log(`Config: ${result.configPath}`);
  console.log("Credentials: [otel] exporter authorization in the Codex config");
  console.log("Restart Codex after the local development stack is running.");
}

function runCli() {
  const argumentsToParse = process.argv.slice(2);
  if (argumentsToParse.length === 0) {
    configure();
    return;
  }
  if (argumentsToParse.length === 1 && argumentsToParse[0] === "credentials") {
    if (!printCredentials()) {
      process.exitCode = 1;
    }
    return;
  }
  if (
    argumentsToParse.length === 1 &&
    (argumentsToParse[0] === "--help" || argumentsToParse[0] === "-h")
  ) {
    printHelp();
    return;
  }
  if (argumentsToParse.length === 1 && argumentsToParse[0] === "--dry-run") {
    printDryRun();
    return;
  }

  console.error(`Error: Unexpected arguments: ${argumentsToParse.join(" ")}`);
  console.error("  Example: pnpm setup:codex --dry-run");
  process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
