import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const pluginDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(pluginDirectory, "../../..");
const oxlintPath = path.join(repositoryRoot, "node_modules", ".bin", "oxlint");
const pluginPath = path.join(pluginDirectory, "index.ts");

async function lintFixture(source) {
  const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), "slowpoke-heading-rule-"));
  const configPath = path.join(fixtureDirectory, ".oxlintrc.json");
  const fixturePath = path.join(fixtureDirectory, "fixture.tsx");
  const config = {
    jsPlugins: [{ name: "slowpoke-ui", specifier: pluginPath }],
    rules: { "slowpoke-ui/heading-structure": "error" },
  };

  try {
    await Promise.all([
      writeFile(configPath, JSON.stringify(config)),
      writeFile(fixturePath, source),
    ]);
    const result = spawnSync(oxlintPath, ["-c", configPath, fixturePath], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });

    return {
      output: `${result.stdout}${result.stderr}`,
      status: result.status,
    };
  } finally {
    await rm(fixtureDirectory, { force: true, recursive: true });
  }
}

test("accepts a justified heading without paragraph siblings", async () => {
  const result = await lintFixture(`
    export function Example() {
      return <section>
        {/* HEADING-REASON: Labels the usage definition list. */}
        <h2>Usage</h2>
        <output>42 tokens</output>
      </section>;
    }
  `);

  assert.equal(result.status, 0, result.output);
});

test("rejects a heading without a meaningful human reason", async () => {
  const result = await lintFixture(`
    export function Example() {
      return <section>
        {/* HEADING-REASON: needed */}
        <h2>Usage</h2>
      </section>;
    }
  `);

  assert.equal(result.status, 1);
  assert.match(result.output, /heading needs an immediately preceding/u);
});

test("rejects paragraph siblings above and below a justified heading", async () => {
  const result = await lintFixture(`
    export function Example() {
      return <header>
        <p>Workspace</p>
        {/* HEADING-REASON: Labels the settings page. */}
        <h1>Settings</h1>
        <p>Manage the workspace.</p>
      </header>;
    }
  `);

  assert.equal(result.status, 1);
  assert.match(result.output, /paragraph immediately above/u);
  assert.match(result.output, /paragraph immediately below/u);
});
