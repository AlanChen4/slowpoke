import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

const refreshPattern = /\brefresh(?:ing)?\b/iu;

function elementName(node: ESTree.JSXElement): string | null {
  const name = node.openingElement.name;
  return name.type === "JSXIdentifier" ? name.name : null;
}

function attribute(node: ESTree.JSXOpeningElement, name: string): ESTree.JSXAttribute | undefined {
  return node.attributes.find(
    (candidate): candidate is ESTree.JSXAttribute =>
      candidate.type === "JSXAttribute" &&
      candidate.name.type === "JSXIdentifier" &&
      candidate.name.name === name,
  );
}

function literalAttributeValue(node: ESTree.JSXOpeningElement, name: string): string | null {
  const value = attribute(node, name)?.value;
  return value?.type === "Literal" && typeof value.value === "string" ? value.value : null;
}

function hasVisibleText(node: ESTree.JSXElement): boolean {
  return node.children.some((child) => {
    if (child.type === "JSXText") return child.value.trim().length > 0;
    if (child.type === "JSXElement") return hasVisibleText(child);
    if (child.type !== "JSXExpressionContainer") return false;

    return child.expression.type === "Literal" && typeof child.expression.value === "string";
  });
}

function hasRefreshText(node: ESTree.JSXElement): boolean {
  return node.children.some((child) => {
    if (child.type === "JSXText") return refreshPattern.test(child.value);
    if (child.type === "JSXElement") return hasRefreshText(child);
    if (child.type !== "JSXExpressionContainer") return false;

    return (
      child.expression.type === "Literal" &&
      typeof child.expression.value === "string" &&
      refreshPattern.test(child.expression.value)
    );
  });
}

function isRefreshButton(sourceCode: SourceCode, node: ESTree.JSXElement): boolean {
  const openingElement = node.openingElement;
  const accessibleLabel = literalAttributeValue(openingElement, "aria-label");
  const clickHandler = attribute(openingElement, "onClick");

  return (
    hasRefreshText(node) ||
    (accessibleLabel !== null && refreshPattern.test(accessibleLabel)) ||
    (clickHandler?.value !== null &&
      clickHandler?.value !== undefined &&
      refreshPattern.test(sourceCode.getText(clickHandler.value)))
  );
}

/** Keep refresh actions visually quiet, compact, and accessible throughout the product. */
export const refreshButtonStyleRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require refresh buttons to use the shared icon-only ghost treatment.",
    },
    messages: {
      invalidRefreshButton:
        'Refresh buttons must be icon-only <Button variant="ghost" size="icon"> controls with a static aria-label that names the refresh action.',
    },
  },
  createOnce(context) {
    return {
      JSXElement(node) {
        if (elementName(node) !== "Button" || !isRefreshButton(context.sourceCode, node)) return;

        const openingElement = node.openingElement;
        const accessibleLabel = literalAttributeValue(openingElement, "aria-label");
        const isValid =
          literalAttributeValue(openingElement, "variant") === "ghost" &&
          literalAttributeValue(openingElement, "size") === "icon" &&
          accessibleLabel !== null &&
          refreshPattern.test(accessibleLabel) &&
          !hasVisibleText(node);

        if (!isValid) {
          context.report({ node: openingElement, messageId: "invalidRefreshButton" });
        }
      },
    };
  },
});
