import { eslintCompatPlugin } from "@oxlint/plugins";

import { cardDescriptionReasonRule } from "./rules/card-description-reason.ts";
import { headingStructureRule } from "./rules/heading-structure.ts";
import { noOrnamentalBorderRule } from "./rules/no-ornamental-border.ts";

/** Slowpoke-specific UI rules that keep generated interface copy intentional. */
const slowpokeUiPlugin = eslintCompatPlugin({
  meta: { name: "slowpoke-ui" },
  rules: {
    "card-description-reason": cardDescriptionReasonRule,
    "heading-structure": headingStructureRule,
    "no-ornamental-border": noOrnamentalBorderRule,
  },
});

export default slowpokeUiPlugin;
