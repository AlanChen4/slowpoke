import { createServer } from "node:net";
import { pathToFileURL } from "node:url";

function isAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
        return;
      }

      reject(error);
    });
    server.once("listening", () => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(true);
      });
    });
    server.listen(port);
  });
}

export async function findOpenPort(startPort) {
  if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65_535) {
    throw new RangeError("Start port must be an integer from 1 through 65535.");
  }

  for (let port = startPort; port <= 65_535; port += 1) {
    if (await isAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No open port found at or above ${startPort}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const startPort = Number(process.argv[2] ?? 3000);

  try {
    process.stdout.write(`${await findOpenPort(startPort)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
