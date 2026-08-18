import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const fixtureDirectory = mkdtempSync(join(tmpdir(), "slowpoke-ui-"));
let fixtureIndex = 0;

after(() => {
  rmSync(fixtureDirectory, { force: true, recursive: true });
});

function lintFixture(source) {
  fixtureIndex += 1;
  const fixturePath = join(fixtureDirectory, `fixture-${fixtureIndex}.tsx`);
  writeFileSync(fixturePath, source);

  return spawnSync("pnpm", ["exec", "oxlint", "--config", ".oxlintrc.json", fixturePath], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

test("rejects one-sided horizontal borders on generic content containers", () => {
  const result = lintFixture(`
    export function Example() {
      return <form className={cn("border-t pt-5", className)} />;
    }
  `);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /slowpoke-ui\(no-ornamental-border\)/u);
});

test("allows full borders and semantic page chrome", () => {
  const result = lintFixture(`
    export function Example() {
      return (
        <>
          <div className="border p-4" />
          <header className="border-b px-4" />
        </>
      );
    }
  `);

  assert.equal(result.status, 0, result.stdout + result.stderr);
});
