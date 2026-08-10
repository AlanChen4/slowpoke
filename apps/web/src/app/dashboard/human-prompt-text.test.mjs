import assert from "node:assert/strict";
import test from "node:test";

import { humanPromptText } from "./human-prompt-text.mjs";

test("extracts the request after ambient browser context", () => {
  const prompt = `<in-app-browser-context source="ambient-ui-state">
Generated browser context
</in-app-browser-context>

## My request:
Add a development switch without using real credits`;

  assert.equal(humanPromptText(prompt), "Add a development switch without using real credits");
});

test("keeps browser comments and an additional request", () => {
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

  assert.equal(
    humanPromptText(prompt),
    "Still seeing this after retrying\n\nPlease debug this without using real credits",
  );
});

test("keeps multiple browser comments in order", () => {
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

  assert.equal(humanPromptText(prompt), "Fix the title\n\nRemove the button");
});

test("preserves an unwrapped prompt", () => {
  assert.equal(humanPromptText("  Explain this query.  "), "Explain this query.");
});
