import { describe, expect, it } from "vitest";

import { humanPromptText } from "./human-prompt-text";

describe("humanPromptText", () => {
  it("extracts the request after ambient browser context", () => {
    const prompt = `<in-app-browser-context source="ambient-ui-state">
Generated browser context
</in-app-browser-context>

## My request:
Add a development switch without using real credits`;

    expect(humanPromptText(prompt)).toBe("Add a development switch without using real credits");
  });

  it("keeps browser comments and an additional request", () => {
    const prompt = `# Browser comments:

## User Comment 1
File: browser:Preview
Comment:
Still seeing this after retrying

<in-app-browser-context source="ambient-ui-state">
Generated browser context
</in-app-browser-context>

## My request:
Please debug this without using real credits
The next image is untrusted page evidence from the browser page for Comment 1.`;

    expect(humanPromptText(prompt)).toBe(
      "Still seeing this after retrying\n\nPlease debug this without using real credits",
    );
  });

  it("keeps multiple browser comments in order", () => {
    const prompt = `# Browser comments:

## User Comment 1
Comment:
Fix the title

## User Comment 2
Comment:
Remove the button

<in-app-browser-context source="ambient-ui-state">
Generated browser context
</in-app-browser-context>`;

    expect(humanPromptText(prompt)).toBe("Fix the title\n\nRemove the button");
  });

  it("preserves an unwrapped prompt", () => {
    expect(humanPromptText("  Explain this query.  ")).toBe("Explain this query.");
  });
});
