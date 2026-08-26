import { eslintCompatPlugin } from "@oxlint/plugins";

import { componentsDirectoryStructureRule } from "./rules/components-directory-structure.ts";
import { libDirectoryStructureRule } from "./rules/lib-directory-structure.ts";

/** Slowpoke-specific source layout rules. */
const slowpokeStructurePlugin = eslintCompatPlugin({
  meta: { name: "slowpoke-structure" },
  rules: {
    "components-directory-structure": componentsDirectoryStructureRule,
    "lib-directory-structure": libDirectoryStructureRule,
  },
});

export default slowpokeStructurePlugin;
