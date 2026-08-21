import { describe, expect, it } from "vitest";

import { isInstallationSetupComplete } from "./installation-setup-status";

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
