import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function elementName(node: ESTree.JSXOpeningElement): string | null {
  return node.name.type === "JSXIdentifier" ? node.name.name : null;
}

function isDestructiveAlert(node: ESTree.JSXOpeningElement): boolean {
  if (elementName(node) !== "Alert") return false;

  return node.attributes.some(
    (attribute) =>
      attribute.type === "JSXAttribute" &&
      attribute.name.type === "JSXIdentifier" &&
      attribute.name.name === "variant" &&
      attribute.value?.type === "Literal" &&
      attribute.value.value === "destructive",
  );
}

/** Keep user-facing errors in the global toast viewport instead of page layouts. */
export const noInlineErrorsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require user-facing errors to use the shared error toast.",
    },
    messages: {
      inlineError:
        "Do not render errors inline. Use <ErrorToast /> or useErrorToast() so the message appears in the shared toast viewport.",
    },
  },
  createOnce(context) {
    return {
      JSXOpeningElement(node) {
        if (elementName(node) === "FieldError" || isDestructiveAlert(node)) {
          context.report({ node, messageId: "inlineError" });
        }
      },
    };
  },
});
