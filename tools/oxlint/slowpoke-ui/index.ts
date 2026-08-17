import { eslintCompatPlugin } from "@oxlint/plugins";

import { headingStructureRule } from "./rules/heading-structure.ts";

/** Slowpoke-specific UI rules that keep generated interface copy intentional. */
const slowpokeUiPlugin = eslintCompatPlugin({
  meta: { name: "slowpoke-ui" },
  rules: {
    "heading-structure": headingStructureRule,
  },
});

export default slowpokeUiPlugin;
