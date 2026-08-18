import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

const cardDescriptionReasonPattern = /\bCARD-DESCRIPTION-REASON:\s+([\s\S]+)/u;

function elementName(node: ESTree.JSXElement): string | null {
  const name = node.openingElement.name;
  return name.type === "JSXIdentifier" ? name.name : null;
}

function hasMeaningfulReason(commentValue: string): boolean {
  const reason = cardDescriptionReasonPattern.exec(commentValue)?.[1];
  return reason !== undefined && reason.trim().length >= 12;
}

function reasonContainer(node: ESTree.JSXElement): ESTree.JSXExpressionContainer | null {
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

function hasCardDescriptionReason(sourceCode: SourceCode, node: ESTree.JSXElement): boolean {
  const container = reasonContainer(node);
  return (
    container !== null &&
    sourceCode.getCommentsInside(container).some((comment) => hasMeaningfulReason(comment.value))
  );
}

/** Keep card descriptions exceptional and explicitly justified. */
export const cardDescriptionReasonRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require a human-authored rationale before a JSX CardDescription.",
    },
    messages: {
      missingReason:
        "Remove this redundant card description, or add an immediately preceding `{/* CARD-DESCRIPTION-REASON: <human-authored reason> */}` comment when the supporting copy is essential.",
    },
  },
  createOnce(context) {
    return {
      JSXElement(node) {
        if (elementName(node) !== "CardDescription") return;
        if (!hasCardDescriptionReason(context.sourceCode, node)) {
          context.report({ node: node.openingElement, messageId: "missingReason" });
        }
      },
    };
  },
});
