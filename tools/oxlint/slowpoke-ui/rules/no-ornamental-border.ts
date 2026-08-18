import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const genericElementNames = new Set([
  "article",
  "aside",
  "dd",
  "div",
  "dl",
  "dt",
  "form",
  "li",
  "main",
  "ol",
  "p",
  "section",
  "span",
  "ul",
]);
const oneSidedBorderPattern = /(?:^|[\s"'`])(?:[^\s"'`]+:)*border-[tb](?:-[1-9]\d*)?(?=$|[\s"'`])/u;

function elementName(node: ESTree.JSXOpeningElement): string | null {
  return node.name.type === "JSXIdentifier" ? node.name.name : null;
}

function isClassNameAttribute(node: ESTree.JSXAttribute): boolean {
  return node.name.type === "JSXIdentifier" && node.name.name === "className";
}

/** Reject ornamental horizontal borders on generic content containers. */
export const noOrnamentalBorderRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow one-sided horizontal border utilities on generic JSX content containers.",
    },
    messages: {
      ornamentalBorder:
        "Do not add a raw top or bottom border to a generic content container. Prefer spacing and grouping, or use <Separator /> for a meaningful structural boundary.",
    },
  },
  createOnce(context) {
    return {
      JSXAttribute(node) {
        if (!isClassNameAttribute(node)) return;

        const openingElement = node.parent;
        if (
          openingElement.type !== "JSXOpeningElement" ||
          !genericElementNames.has(elementName(openingElement) ?? "")
        ) {
          return;
        }

        const attributeText = context.sourceCode.getText(node.value ?? node);
        if (oneSidedBorderPattern.test(attributeText)) {
          context.report({ node, messageId: "ornamentalBorder" });
        }
      },
    };
  },
});
