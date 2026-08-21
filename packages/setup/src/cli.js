import { homedir, hostname } from "node:os";
import { pathToFileURL } from "node:url";

import { exchangeEnrollment, sendVerification, SetupError } from "./client.js";
import { applyConfigurationPlans, planConfigurations } from "./config.js";
import { SETUP_PACKAGE_VERSION } from "./version.js";

export const DEFAULT_SERVER = "https://avchen4--slowpoke-backend-web.modal.run";

export const ROOT_HELP = `Connect AI tools to Slowpoke.

Usage:
  npx @slowpokeai/setup enroll [options]

Other package runners:
  pnpm dlx @slowpokeai/setup enroll [options]
  yarn dlx @slowpokeai/setup enroll [options]
  bunx @slowpokeai/setup enroll [options]

Commands:
  enroll  Connect the AI tools selected in Slowpoke

Run "npx @slowpokeai/setup enroll --help" for enrollment options and examples.`;

export const ENROLL_HELP = `Connect this computer to Slowpoke.

Usage:
  npx @slowpokeai/setup enroll --code <code> [options]

Required:
  --code <code>             Short-lived setup code from Slowpoke

Options:
  --server <url>            Override the Slowpoke setup server URL
  --computer-name <name>    Override this computer's detected name
  --dry-run                 Validate arguments without enrolling or writing files
  --help, -h                Show this help

Examples:
  npx @slowpokeai/setup enroll --code abc123
  npx @slowpokeai/setup enroll --code abc123 --computer-name "Ada's laptop"
  npx @slowpokeai/setup enroll --code abc123 --server http://127.0.0.1:8000`;

function parseEnrollArguments(argumentsToParse) {
  const options = { dryRun: false, server: DEFAULT_SERVER };
  for (let index = 0; index < argumentsToParse.length; index += 1) {
    const argument = argumentsToParse[index];
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (["--code", "--server", "--computer-name"].includes(argument)) {
      const value = argumentsToParse[index + 1];
      if (!value || value.startsWith("--")) {
        throw new SetupError("invalid_arguments", `${argument} requires a value.`);
      }
      options[argument === "--computer-name" ? "computerName" : argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new SetupError("invalid_arguments", `Unknown option: ${argument}`);
  }
  if (!options.code) {
    throw new SetupError("invalid_arguments", "--code is required.");
  }
  try {
    const parsedServer = new URL(options.server);
    if (!new Set(["http:", "https:"]).has(parsedServer.protocol)) {
      throw new Error();
    }
    options.server = parsedServer.href.replace(/\/$/, "");
  } catch {
    throw new SetupError("invalid_arguments", "--server must be an HTTP or HTTPS URL.");
  }
  options.computerName = options.computerName?.trim() || hostname() || "Unknown computer";
  return options;
}

export async function run(argumentsToParse, dependencies = {}) {
  if (
    argumentsToParse.length === 0 ||
    (argumentsToParse.length === 1 && ["--help", "-h"].includes(argumentsToParse[0]))
  ) {
    return { help: ROOT_HELP };
  }
  if (argumentsToParse[0] !== "enroll") {
    throw new SetupError("invalid_arguments", `Unknown command: ${argumentsToParse[0]}`);
  }

  const options = parseEnrollArguments(argumentsToParse.slice(1));
  if (options.help) {
    return { help: ENROLL_HELP };
  }
  if (options.dryRun) {
    return {
      output: {
        status: "dry-run",
        computer_name: options.computerName,
        actions: ["enroll", "configure", "verify"],
      },
    };
  }

  const enrollment = await exchangeEnrollment(
    {
      code: options.code,
      server: options.server,
      computerName: options.computerName,
      setupPackageVersion: SETUP_PACKAGE_VERSION,
    },
    dependencies,
  );
  const plans = planConfigurations({
    home: dependencies.home ?? homedir(),
    installations: enrollment.installations,
    collectorUrl: enrollment.collector_url.replace(/\/$/, ""),
    // oxlint-disable-next-line node/no-process-env -- The CLI honors documented tool home overrides.
    environment: dependencies.environment ?? process.env,
  });
  applyConfigurationPlans(plans);
  for (const installation of enrollment.installations) {
    await sendVerification(enrollment.collector_url.replace(/\/$/, ""), installation, dependencies);
  }

  return {
    output: {
      status: "success",
      computer_name: options.computerName,
      installations: plans.map((plan) => ({
        installation_id: plan.installationId,
        tool: plan.tool,
        config: plan.path,
      })),
    },
  };
}

export async function main(argumentsToParse = process.argv.slice(2)) {
  try {
    const result = await run(argumentsToParse);
    if (result.help) {
      process.stdout.write(`${result.help}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify(result.output)}\n`);
  } catch (error) {
    const safeError =
      error instanceof SetupError
        ? error
        : new SetupError("setup_failed", "Setup could not be completed safely.");
    process.stderr.write(
      `${JSON.stringify({ status: "error", code: safeError.code, message: safeError.message })}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
