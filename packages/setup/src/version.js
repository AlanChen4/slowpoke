import { createRequire } from "node:module";

const packageMetadata = createRequire(import.meta.url)("../package.json");

export const SETUP_PACKAGE_VERSION = packageMetadata.version;
