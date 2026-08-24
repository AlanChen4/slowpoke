import { describe, expect, it } from "vitest";

import { createSetupCommand, DEFAULT_SETUP_SERVER } from "./setup-command";

describe("createSetupCommand", () => {
  it("omits the bundled production server", () => {
    expect(createSetupCommand("abc123", DEFAULT_SETUP_SERVER)).toBe(
      "npx @slowpokeai/setup enroll --code abc123",
    );
  });

  it("keeps a server override for non-production environments", () => {
    expect(createSetupCommand("abc123", "http://127.0.0.1:8000/")).toBe(
      "npx @slowpokeai/setup enroll --code abc123 --server http://127.0.0.1:8000",
    );
  });
});
