import { eslintCompatPlugin } from "@oxlint/plugins";

import { headingStructureRule } from "./rules/heading-structure.ts";
import { noOrnamentalBorderRule } from "./rules/no-ornamental-border.ts";
import { surfaceDescriptionReasonRule } from "./rules/surface-description-reason.ts";

/** Slowpoke-specific UI rules that keep generated interface copy intentional. */
const slowpokeUiPlugin = eslintCompatPlugin({
  meta: { name: "slowpoke-ui" },
  rules: {
    "heading-structure": headingStructureRule,
    "no-ornamental-border": noOrnamentalBorderRule,
    "surface-description-reason": surfaceDescriptionReasonRule,
  },
});

export default slowpokeUiPlugin;
