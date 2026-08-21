const RETRYABLE_STATUS = new Set([408, 425, 429]);

/* oxlint-disable anti-slop/no-runtime-typeof -- This module validates untrusted enrollment JSON at its HTTP boundary. */

export class SetupError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "SetupError";
    this.code = code;
  }
}

function shouldRetry(status) {
  return RETRYABLE_STATUS.has(status) || status >= 500;
}

async function requestWithRetries(fetchImplementation, url, options, dependencies) {
  const attempts = dependencies.attempts ?? 3;
  const sleep =
    dependencies.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImplementation(url, options);
      if (!shouldRetry(response.status) || attempt === attempts) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
    }
    await sleep(250 * 2 ** (attempt - 1));
  }
  throw new SetupError(
    "network_unavailable",
    "Slowpoke could not be reached after three attempts.",
    {
      cause: lastError,
    },
  );
}

function validInstallation(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.installation_id === "string" &&
    typeof value.organization_id === "string" &&
    (value.tool === "codex" || value.tool === "claude_code") &&
    typeof value.token === "string" &&
    value.token.length > 0
  );
}

export async function exchangeEnrollment(
  { code, server, computerName, setupPackageVersion },
  dependencies = {},
) {
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  const response = await requestWithRetries(
    fetchImplementation,
    `${server}/api/setup/enroll`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        computer_name: computerName,
        setup_package_version: setupPackageVersion,
      }),
    },
    dependencies,
  );

  if (!response.ok) {
    const errors = {
      400: ["invalid_code", "The setup code is invalid."],
      410: ["expired_code", "The setup code has expired. Generate a new command in Slowpoke."],
    };
    const [errorCode, message] = errors[response.status] ?? [
      "enrollment_unavailable",
      "Slowpoke could not complete enrollment. Try again.",
    ];
    throw new SetupError(errorCode, message);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new SetupError("invalid_response", "Slowpoke returned an invalid enrollment response.");
  }
  if (
    payload === null ||
    typeof payload !== "object" ||
    typeof payload.collector_url !== "string" ||
    !Array.isArray(payload.installations) ||
    payload.installations.length === 0 ||
    !payload.installations.every(validInstallation)
  ) {
    throw new SetupError("invalid_response", "Slowpoke returned an invalid enrollment response.");
  }
  return payload;
}

/* oxlint-enable anti-slop/no-runtime-typeof */

function verificationPayload() {
  return {
    resourceLogs: [
      {
        resource: { attributes: [] },
        scopeLogs: [
          {
            scope: { name: "@slowpokeai/setup" },
            logRecords: [{ body: { stringValue: "slowpoke.setup.verification" } }],
          },
        ],
      },
    ],
  };
}

export async function sendVerification(collectorUrl, installation, dependencies = {}) {
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  const response = await requestWithRetries(
    fetchImplementation,
    `${collectorUrl}/v1/logs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${installation.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(verificationPayload()),
    },
    dependencies,
  );
  if (!response.ok) {
    throw new SetupError(
      "verification_failed",
      `Slowpoke could not verify the ${installation.tool === "codex" ? "Codex" : "Claude Code"} installation. Try the command again.`,
    );
  }
}
