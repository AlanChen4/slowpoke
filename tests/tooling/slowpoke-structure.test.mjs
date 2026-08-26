import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const fixtureDirectory = mkdtempSync(join(tmpdir(), "slowpoke-structure-"));

after(() => {
  rmSync(fixtureDirectory, { force: true, recursive: true });
});

function lintFixture(relativePath) {
  const fixturePath = join(fixtureDirectory, relativePath);
  mkdirSync(dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, "export const value = true;\n");

  return spawnSync("pnpm", ["exec", "oxlint", "--config", ".oxlintrc.json", fixturePath], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

test("rejects modules stored directly in a lib directory", () => {
  const result = lintFixture("src/lib/direct-module.ts");

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /slowpoke-structure\(lib-directory-structure\)/u);
});

test("allows modules grouped below a lib directory", () => {
  const result = lintFixture("src/lib/installations/setup-status.ts");

  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("rejects modules stored directly in a components directory", () => {
  const result = lintFixture("src/components/direct-component.tsx");

  assert.notEqual(result.status, 0);
  assert.match(
    result.stdout + result.stderr,
    /slowpoke-structure\(components-directory-structure\)/u,
  );
});

test("allows components grouped below a components directory", () => {
  const result = lintFixture("src/components/dashboard/app-sidebar.tsx");

  assert.equal(result.status, 0, result.stdout + result.stderr);
});
