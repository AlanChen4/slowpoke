import { defineRule } from "@oxlint/plugins";

const directComponentsModulePattern = /(?:^|[/\\])components[/\\][^/\\]+\.[cm]?[jt]sx?$/u;

/** Keep shared components grouped by a cohesive domain below their components directory. */
export const componentsDirectoryStructureRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require JavaScript and TypeScript modules in components directories to use a subfolder.",
    },
    messages: {
      directComponentsModule:
        "Move this module into a cohesive folder below components. Consolidate it with an existing domain folder when responsibilities overlap.",
    },
  },
  createOnce(context) {
    return {
      Program(node) {
        if (directComponentsModulePattern.test(context.filename)) {
          context.report({ node, messageId: "directComponentsModule" });
        }
      },
    };
  },
});
