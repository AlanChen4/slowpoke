import { defineRule } from "@oxlint/plugins";

const directLibModulePattern = /(?:^|[/\\])lib[/\\][^/\\]+\.[cm]?[jt]sx?$/u;

/** Keep shared modules grouped by a cohesive domain below their lib directory. */
export const libDirectoryStructureRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require JavaScript and TypeScript modules in lib directories to use a subfolder.",
    },
    messages: {
      directLibModule:
        "Move this module into a cohesive folder below lib. Consolidate it with an existing domain folder when responsibilities overlap.",
    },
  },
  createOnce(context) {
    return {
      Program(node) {
        if (directLibModulePattern.test(context.filename)) {
          context.report({ node, messageId: "directLibModule" });
        }
      },
    };
  },
});
