import assert from "node:assert/strict";
import { createServer } from "node:net";
import { after, test } from "node:test";

import { findOpenPort } from "./find-open-port.mjs";

const servers = [];

after(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

async function occupyAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, resolve);
  });
  servers.push(server);

  const address = server.address();
  assert.notEqual(address, null);
  return address.port;
}

test("returns an available starting port", async () => {
  const occupiedPort = await occupyAvailablePort();
  const openPort = await findOpenPort(occupiedPort + 1);

  assert.equal(openPort, occupiedPort + 1);
});

test("skips an occupied starting port", async () => {
  const occupiedPort = await occupyAvailablePort();
  const openPort = await findOpenPort(occupiedPort);

  assert.ok(openPort > occupiedPort);
});

test("rejects invalid starting ports", async () => {
  await assert.rejects(findOpenPort(0), /integer from 1 through 65535/);
  await assert.rejects(findOpenPort(65_536), /integer from 1 through 65535/);
});
