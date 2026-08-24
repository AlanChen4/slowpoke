import { describe, expect, it, vi } from "vitest";

import {
  getLatestSetupPackageVersion,
  getSetupPackageVersionState,
  isInstallationSetupComplete,
} from "./installation-setup-status";

describe("isInstallationSetupComplete", () => {
  it("waits for every selected tool to verify", () => {
    const selectedTools = ["codex", "claude_code"];

    expect(isInstallationSetupComplete(selectedTools, [])).toBe(false);
    expect(isInstallationSetupComplete(selectedTools, [{ tool: "codex" }])).toBe(false);
    expect(isInstallationSetupComplete(selectedTools, [{ tool: "claude_code" }])).toBe(false);
    expect(
      isInstallationSetupComplete(selectedTools, [{ tool: "codex" }, { tool: "claude_code" }]),
    ).toBe(true);
  });
});

describe("getLatestSetupPackageVersion", () => {
  it("returns the latest stable version from npm", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ version: "0.1.2" }), {
        status: 200,
      }),
    );

    await expect(getLatestSetupPackageVersion()).resolves.toBe("0.1.2");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://registry.npmjs.org/@slowpokeai%2Fsetup/latest",
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 3600 },
      },
    );

    fetchMock.mockRestore();
  });

  it.each([
    new Response(null, { status: 503 }),
    new Response(JSON.stringify({ version: "next" }), { status: 200 }),
  ])("returns null when npm has no usable latest version", async (response) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    await expect(getLatestSetupPackageVersion()).resolves.toBeNull();

    fetchMock.mockRestore();
  });

  it("returns null when npm cannot be reached", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(getLatestSetupPackageVersion()).resolves.toBeNull();

    fetchMock.mockRestore();
  });
});

describe("getSetupPackageVersionState", () => {
  it.each([
    [null, "0.1.2", "outdated"],
    ["0.1.1", "0.1.2", "outdated"],
    ["0.0.9", "0.1.0", "outdated"],
    ["1.9.9", "2.0.0", "outdated"],
    ["0.1.2", "0.1.2", "current"],
    ["0.1.10", "0.1.2", "current"],
    ["0.2.0", "0.1.2", "current"],
    ["2.0.0", "1.9.9", "current"],
    ["next", "0.1.2", "unknown"],
    ["0.1.2", null, "unknown"],
  ] as const)("classifies installed %s against latest %s as %s", (installed, latest, expected) => {
    expect(getSetupPackageVersionState(installed, latest)).toBe(expected);
  });
});
