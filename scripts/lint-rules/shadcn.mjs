const ALLOW_COMMENT = /^\s*shadcn-allow:\s*(\S[\s\S]*?)\s*$/;

function getImmediatelyPrecedingComment(sourceCode, node) {
  const comments = sourceCode.getAllComments();

  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];

    if (comment.range[1] > node.range[0]) {
      continue;
    }

    const textBetween = sourceCode.text.slice(comment.range[1], node.range[0]);

    // A JSX block comment leaves its closing `}` between the comment and tag.
    if (!/^[\s}]*$/.test(textBetween)) {
      return null;
    }

    return comment;
  }

  return null;
}

const preferShadcnComponents = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer installed shadcn components over their raw HTML equivalents.",
    },
    schema: [
      {
        type: "object",
        additionalProperties: {
          type: "object",
          properties: {
            component: { type: "string" },
            importPath: { type: "string" },
          },
          required: ["component", "importPath"],
          additionalProperties: false,
        },
      },
    ],
    messages: {
      prefer:
        'Use <{{ component }} /> from "{{ importPath }}" instead of <{{ element }}>.' +
        " If this raw element is intentional, add an immediately preceding" +
        " {/* shadcn-allow: reason */} comment.",
    },
  },
  create(context) {
    const components = context.options[0] ?? {};
    const sourceCode = context.sourceCode;

    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier") {
          return;
        }

        const element = node.name.name;
        const preferred = components[element];

        if (!preferred) {
          return;
        }

        const comment = getImmediatelyPrecedingComment(sourceCode, node);

        if (comment && ALLOW_COMMENT.test(comment.value)) {
          return;
        }

        context.report({
          node: node.name,
          messageId: "prefer",
          data: {
            component: preferred.component,
            element,
            importPath: preferred.importPath,
          },
        });
      },
    };
  },
};

export default {
  meta: {
    name: "slowpoke",
  },
  rules: {
    "prefer-shadcn-components": preferShadcnComponents,
  },
};
