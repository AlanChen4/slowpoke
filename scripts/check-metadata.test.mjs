import assert from "node:assert/strict";
import test from "node:test";

import { validateCommitMessage, validatePullRequest } from "./check-metadata.mjs";

const VALID_PR_BODY = `## Summary

- enforce concise Git metadata

## Why

Consistent history makes changes easier to scan and review.

## Validation

- \`pnpm test:metadata\`
`;

test("accepts a terse conventional commit", () => {
  assert.deepEqual(validateCommitMessage("chore(git): enforce metadata checks\n"), []);
});

test("rejects non-conventional and non-imperative subjects", () => {
  const errors = validateCommitMessage("Added metadata validation.\n");

  assert.ok(errors.some((error) => error.includes("must match")));
  assert.ok(errors.some((error) => error.includes("imperative")));
  assert.ok(errors.some((error) => error.includes("period")));
});

test("requires context for breaking commits", () => {
  const errors = validateCommitMessage("feat(api)!: remove legacy route\n");

  assert.ok(errors.some((error) => error.includes("requires a body")));
  assert.ok(errors.some((error) => error.includes("BREAKING CHANGE")));
});

test("accepts a concise pull request", () => {
  assert.deepEqual(validatePullRequest("chore(git): enforce metadata checks", VALID_PR_BODY), []);
});

test("requires structured pull request descriptions", () => {
  const errors = validatePullRequest("chore(git): enforce metadata checks", "A short description.");

  assert.ok(errors.some((error) => error.includes("## Summary")));
  assert.ok(errors.some((error) => error.includes("## Why")));
  assert.ok(errors.some((error) => error.includes("## Validation")));
});

test("limits pull request summaries to three bullets", () => {
  const body = VALID_PR_BODY.replace(
    "- enforce concise Git metadata",
    "- one\n- two\n- three\n- four",
  );

  assert.ok(
    validatePullRequest("chore(git): enforce metadata checks", body).some((error) =>
      error.includes("one to three"),
    ),
  );
});
