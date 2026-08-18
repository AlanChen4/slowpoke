import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

const headingNamePattern = /^h[1-6]$/u;
const headingReasonPattern = /\bHEADING-REASON:\s+([\s\S]+)/u;

function elementName(node: ESTree.JSXElement): string | null {
  const name = node.openingElement.name;
  return name.type === "JSXIdentifier" ? name.name : null;
}

function isIgnoredSibling(node: ESTree.JSXChild): boolean {
  return (
    (node.type === "JSXText" && node.value.trim() === "") ||
    (node.type === "JSXExpressionContainer" && node.expression.type === "JSXEmptyExpression")
  );
}

function adjacentSibling(node: ESTree.JSXElement, direction: -1 | 1): ESTree.JSXChild | null {
  const parent = node.parent;
  if (parent.type !== "JSXElement" && parent.type !== "JSXFragment") return null;

  const nodeIndex = parent.children.indexOf(node);
  for (
    let index = nodeIndex + direction;
    index >= 0 && index < parent.children.length;
    index += direction
  ) {
    const sibling = parent.children[index];
    if (!sibling || isIgnoredSibling(sibling)) continue;
    return sibling;
  }

  return null;
}

function isParagraph(node: ESTree.JSXChild | null): boolean {
  return node?.type === "JSXElement" && elementName(node) === "p";
}

function hasMeaningfulReason(commentValue: string): boolean {
  const reason = headingReasonPattern.exec(commentValue)?.[1];
  return reason !== undefined && reason.trim().length >= 12;
}

function headingReasonContainer(node: ESTree.JSXElement): ESTree.JSXExpressionContainer | null {
  const parent = node.parent;
  if (parent.type !== "JSXElement" && parent.type !== "JSXFragment") return null;

  const nodeIndex = parent.children.indexOf(node);
  for (let index = nodeIndex - 1; index >= 0; index -= 1) {
    const sibling = parent.children[index];
    if (sibling?.type === "JSXText" && sibling.value.trim() === "") continue;
    return sibling?.type === "JSXExpressionContainer" &&
      sibling.expression.type === "JSXEmptyExpression"
      ? sibling
      : null;
  }

  return null;
}

function hasHeadingReason(sourceCode: SourceCode, node: ESTree.JSXElement): boolean {
  const reasonContainer = headingReasonContainer(node);
  return (
    reasonContainer !== null &&
    sourceCode
      .getCommentsInside(reasonContainer)
      .some((comment) => hasMeaningfulReason(comment.value))
  );
}

/** Keep native headings deliberate and separate from eyebrow or description paragraphs. */
export const headingStructureRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a human heading rationale and reject paragraph siblings around native JSX headings.",
    },
    messages: {
      missingReason:
        "This heading needs an immediately preceding `{/* HEADING-REASON: <human-authored reason> */}` comment. Remove the heading unless a human has justified its semantic role.",
      paragraphAfter:
        "Do not place a paragraph immediately below a native heading. Remove the redundant description or use a more precise semantic element.",
      paragraphBefore:
        "Do not place a paragraph immediately above a native heading. Remove the eyebrow copy.",
    },
  },
  createOnce(context) {
    return {
      JSXElement(node) {
        if (!headingNamePattern.test(elementName(node) ?? "")) return;

        if (!hasHeadingReason(context.sourceCode, node)) {
          context.report({ node: node.openingElement, messageId: "missingReason" });
        }
        if (isParagraph(adjacentSibling(node, -1))) {
          context.report({ node: node.openingElement, messageId: "paragraphBefore" });
        }
        if (isParagraph(adjacentSibling(node, 1))) {
          context.report({ node: node.openingElement, messageId: "paragraphAfter" });
        }
      },
    };
  },
});
