import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateCommitMessage, validatePullRequest } from "../../scripts/check-metadata.mjs";

const CHECK_SCRIPT = fileURLToPath(new URL("../../scripts/check-metadata.mjs", import.meta.url));

const VALID_PR_BODY = `## Summary

- enforce concise Git metadata

## Why

Consistent history makes changes easier to scan and review.

## Validation

- \`pnpm test --suite tooling\`
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

test("ignores merge commits in a pull request range", () => {
  const repository = mkdtempSync(join(tmpdir(), "slowpoke-metadata-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: "pipe" }).trim();

  try {
    git("init", "--initial-branch=main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Metadata Test");
    writeFileSync(join(repository, "base.txt"), "base\n");
    git("add", "base.txt");
    git("commit", "-m", "chore: add baseline");
    const base = git("rev-parse", "HEAD");

    git("checkout", "-b", "feature");
    writeFileSync(join(repository, "feature.txt"), "feature\n");
    git("add", "feature.txt");
    git("commit", "-m", "docs: add guide");

    git("checkout", "-b", "side", base);
    writeFileSync(join(repository, "side.txt"), "side\n");
    git("add", "side.txt");
    git("commit", "-m", "fix: add side note");

    git("checkout", "feature");
    git("merge", "--no-ff", "side", "-m", "Merge branch 'side'");

    const output = execFileSync(process.execPath, [CHECK_SCRIPT, "range", base, "HEAD"], {
      cwd: repository,
      encoding: "utf8",
    });

    assert.match(output, /Metadata valid/);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
