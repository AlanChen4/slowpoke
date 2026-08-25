#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const suites = new Map([
  [
    "database",
    {
      description: "pgTAP, database contract tests, and generated database types",
      steps: [
        {
          command: "bash",
          args: ["scripts/run-local-supabase.sh", "start"],
          quiet: true,
        },
        { command: "pnpm", args: ["exec", "supabase", "test", "db"] },
        { command: "bash", args: ["scripts/check-python-db-types.sh"] },
        { command: "bash", args: ["scripts/check-web-db-types.sh"] },
        { command: "bash", args: ["scripts/run-database-contract-tests.sh"] },
      ],
    },
  ],
  [
    "backend",
    {
      description: "backend tests that do not require the database",
      steps: [
        {
          command: "uv",
          args: ["run", "pytest", "-m", "not database"],
          workingDirectory: "apps/backend",
        },
      ],
    },
  ],
  [
    "collector",
    {
      description: "Collector unit tests",
      steps: [
        {
          command: "uv",
          args: ["run", "pytest"],
          workingDirectory: "apps/collector",
        },
      ],
    },
  ],
  [
    "setup",
    {
      description: "public setup package tests",
      steps: [{ command: "pnpm", args: ["--filter", "@slowpokeai/setup", "test"] }],
    },
  ],
  [
    "tooling",
    {
      description: "repository metadata and local Codex setup tests",
      steps: [{ command: "node", args: ["--test", "tests/tooling/*.test.mjs"] }],
    },
  ],
  [
    "web",
    {
      description: "web application unit tests",
      steps: [{ command: "pnpm", args: ["--filter", "@slowpoke/web", "test"] }],
    },
  ],
  [
    "e2e",
    {
      description: "real local Codex and Claude ingestion flow",
      steps: [{ command: "bash", args: ["scripts/run-local-ingestion-e2e.sh"] }],
    },
  ],
]);

const defaultSuites = ["database", "backend", "collector", "setup", "tooling", "web"];

function printHelp() {
  console.log(`Run Slowpoke tests without interactive prompts.

Usage:
  pnpm test
  pnpm test --suite <name> [--suite <name> ...]

Options:
  --suite <name>  Run a named suite. May be repeated.
  --list          List suite names for scripts and pipelines.
  --dry-run       Print the commands without running them.
  --help, -h      Show this help.

Examples:
  pnpm test
  pnpm test --suite backend
  pnpm test --suite tooling --suite web
  pnpm test --suite e2e --dry-run`);
}

function printSuiteList() {
  for (const [name, suite] of suites) {
    console.log(`${name}\t${suite.description}`);
  }
}

function fail(message) {
  console.error(`Error: ${message}`);
  console.error("  Example: pnpm test --suite backend");
  console.error(`  Available suites: ${[...suites.keys()].join(", ")}`);
  process.exitCode = 2;
}

function parseArguments(argumentsToParse) {
  const selectedSuites = [];
  let dryRun = false;
  let list = false;
  let help = false;

  for (let index = 0; index < argumentsToParse.length; index += 1) {
    const argument = argumentsToParse[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--list") {
      list = true;
      continue;
    }
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--suite") {
      const suiteName = argumentsToParse[index + 1];
      if (!suiteName || suiteName.startsWith("-")) {
        return { error: "--suite requires a suite name." };
      }
      selectedSuites.push(suiteName);
      index += 1;
      continue;
    }
    return { error: `Unexpected argument: ${argument}` };
  }

  return { dryRun, help, list, selectedSuites };
}

function displayCommand(step) {
  const invocation = [step.command, ...step.args]
    .map((part) => (part.includes(" ") ? JSON.stringify(part) : part))
    .join(" ");
  return step.workingDirectory ? `(cd ${step.workingDirectory} && ${invocation})` : invocation;
}

function runStep(step) {
  const cwd = step.workingDirectory
    ? resolve(repositoryRoot, step.workingDirectory)
    : repositoryRoot;
  const stdio = step.quiet ? ["inherit", "ignore", "inherit"] : "inherit";

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(step.command, step.args, { cwd, stdio });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (signal) {
        rejectRun(new Error(`${step.command} stopped after signal ${signal}`));
        return;
      }
      resolveRun(code ?? 1);
    });
  });
}

async function run() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.error) {
    fail(parsed.error);
    return;
  }
  if (parsed.help) {
    printHelp();
    return;
  }
  if (parsed.list) {
    printSuiteList();
    return;
  }

  const requestedSuites = [
    ...new Set(parsed.selectedSuites.length > 0 ? parsed.selectedSuites : defaultSuites),
  ];
  for (const suiteName of requestedSuites) {
    if (!suites.has(suiteName)) {
      fail(`Unknown suite: ${suiteName}`);
      return;
    }
  }

  const startedAt = Date.now();
  for (const suiteName of requestedSuites) {
    const suite = suites.get(suiteName);
    console.log(`suite: ${suiteName}`);
    for (const step of suite.steps) {
      if (parsed.dryRun) {
        console.log(`command: ${displayCommand(step)}`);
        continue;
      }

      let exitCode;
      try {
        exitCode = await runStep(step);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: Unable to run suite "${suiteName}": ${message}`);
        console.error(`  Retry: pnpm test --suite ${suiteName}`);
        process.exitCode = 1;
        return;
      }
      if (exitCode !== 0) {
        console.error("status: failed");
        console.error(`suite: ${suiteName}`);
        console.error(`retry: pnpm test --suite ${suiteName}`);
        process.exitCode = exitCode;
        return;
      }
    }
  }

  console.log(`status: ${parsed.dryRun ? "dry-run" : "passed"}`);
  console.log(`suites: ${requestedSuites.join(",")}`);
  console.log(`duration_ms: ${Date.now() - startedAt}`);
}

await run();
