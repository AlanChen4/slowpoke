import { eslintCompatPlugin } from "@oxlint/plugins";

import { libDirectoryStructureRule } from "./rules/lib-directory-structure.ts";

/** Slowpoke-specific source layout rules. */
const slowpokeStructurePlugin = eslintCompatPlugin({
  meta: { name: "slowpoke-structure" },
  rules: {
    "lib-directory-structure": libDirectoryStructureRule,
  },
});

export default slowpokeStructurePlugin;
