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

test("rejects surface descriptions without an explicit rationale", () => {
  const result = lintFixture(`
    import { CardDescription } from "./card";
    import { DialogDescription } from "./dialog";
    import { DrawerDescription } from "./drawer";
    import { SheetDescription } from "./sheet";

    export function Example() {
      return (
        <>
          <CardDescription>Update the name shown throughout this workspace.</CardDescription>
          <DialogDescription>Choose the tools to connect.</DialogDescription>
          <DrawerDescription>Choose the tools to connect.</DrawerDescription>
          <SheetDescription>Choose the tools to connect.</SheetDescription>
        </>
      );
    }
  `);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /slowpoke-ui\(surface-description-reason\)/u);
});

test("allows a surface description with a meaningful rationale", () => {
  const result = lintFixture(`
    import { DialogDescription, DialogHeader, DialogTitle } from "./dialog";

    export function Example() {
      return (
        <DialogHeader>
          <DialogTitle>Delete API key</DialogTitle>
          {/* SURFACE-DESCRIPTION-REASON: Explains the irreversible effect before the user acts. */}
          <DialogDescription>Deleting this key immediately disables every connected client.</DialogDescription>
        </DialogHeader>
      );
    }
  `);

  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("allows functional descriptions outside titled surfaces", () => {
  const result = lintFixture(`
    import { AlertDescription } from "./alert";
    import { EmptyDescription } from "./empty";
    import { FieldDescription } from "./field";

    export function Example() {
      return (
        <>
          <AlertDescription>The request failed.</AlertDescription>
          <EmptyDescription>No installations found.</EmptyDescription>
          <FieldDescription>Use at least 12 characters.</FieldDescription>
        </>
      );
    }
  `);

  assert.equal(result.status, 0, result.stdout + result.stderr);
});
