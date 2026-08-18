import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const MANAGED_CODEX_KEYS = new Set([
  "environment",
  "exporter",
  "log_user_prompt",
  "metrics_exporter",
  "trace_exporter",
]);
const MANAGED_CLAUDE_ENV = {
  CLAUDE_CODE_ENABLE_TELEMETRY: "1",
  CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: "1",
  OTEL_LOGS_EXPORTER: "otlp",
  OTEL_METRICS_EXPORTER: "otlp",
  OTEL_TRACES_EXPORTER: "otlp",
  OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
  OTEL_LOG_USER_PROMPTS: "1",
  OTEL_LOG_ASSISTANT_RESPONSES: "0",
};

function escapeTomlString(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function codexOtelLines(authorization, collectorUrl) {
  const endpoint = escapeTomlString(`${collectorUrl}/v1/logs`);
  const header = escapeTomlString(authorization);

  return [
    'environment = "production"',
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

    if (!MANAGED_CODEX_KEYS.has(match[1])) {
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
  const settings = codexOtelLines(authorization, collectorUrl);

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

export function updateClaudeSettings(source, authorization, collectorUrl) {
  let settings;
  try {
    settings = source.trim() === "" ? {} : JSON.parse(source);
  } catch {
    throw new Error("Claude Code settings.json is not valid JSON.");
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate parsed user configuration before editing it.
  if (settings === null || Array.isArray(settings) || typeof settings !== "object") {
    throw new Error("Claude Code settings.json must contain a JSON object.");
  }
  if (
    settings.env !== undefined &&
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate parsed user configuration before editing it.
    (settings.env === null || Array.isArray(settings.env) || typeof settings.env !== "object")
  ) {
    throw new Error("Claude Code settings.json env must contain a JSON object.");
  }

  settings.env = {
    ...settings.env,
    ...MANAGED_CLAUDE_ENV,
    OTEL_EXPORTER_OTLP_ENDPOINT: collectorUrl,
    OTEL_EXPORTER_OTLP_HEADERS: `Authorization=${authorization}`,
  };
  return `${JSON.stringify(settings, null, 2)}\n`;
}

function readExisting(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function planConfigurations({ home, installations, collectorUrl, environment = {} }) {
  const plans = [];
  for (const installation of installations) {
    const authorization = `Bearer ${installation.token}`;
    if (installation.tool === "codex") {
      const path = join(environment.CODEX_HOME || join(home, ".codex"), "config.toml");
      const original = readExisting(path);
      plans.push({
        tool: installation.tool,
        installationId: installation.installation_id,
        path,
        original,
        updated: updateCodexConfig(original, authorization, collectorUrl),
      });
      continue;
    }
    if (installation.tool === "claude_code") {
      const path = join(environment.CLAUDE_CONFIG_DIR || join(home, ".claude"), "settings.json");
      const original = readExisting(path);
      plans.push({
        tool: installation.tool,
        installationId: installation.installation_id,
        path,
        original,
        updated: updateClaudeSettings(original, authorization, collectorUrl),
      });
      continue;
    }
    throw new Error("The enrollment response included an unsupported AI tool.");
  }
  return plans;
}

function writePrivateFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, path);
    chmodSync(path, 0o600);
  } catch (error) {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }
    throw error;
  }
}

export function applyConfigurationPlans(plans) {
  for (const plan of plans) {
    if (plan.updated === plan.original) {
      continue;
    }
    const backupPath = `${plan.path}.slowpoke-backup`;
    if (existsSync(plan.path) && !existsSync(backupPath)) {
      copyFileSync(plan.path, backupPath);
      chmodSync(backupPath, 0o600);
    }
    writePrivateFile(plan.path, plan.updated);
  }
}
