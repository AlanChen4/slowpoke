---
name: explain-this-pr
description: Explain a GitHub pull request as an interactive Codex review organized by reviewer importance, with core logic first, condensed integration changes, summarized boilerplate, and focused risk callouts. Use when the user asks to explain the current PR, review a PR, walk through a diff, show a visual change-set overview, or create an interactive PR review.
---

# Explain This PR

Present a pull request in the order a reviewer should understand it, not file-tree order.

## Prepare

- If the user provides a pull request URL or number, use it.
- Otherwise, resolve the open pull request associated with the current Git branch. Ask for a URL or number only when the current branch has no associated pull request.
- Read the full `visualize` skill before producing an inline visualization.
- Gather PR metadata, every changed file and patch, and existing review comments. Prefer an available GitHub connector; otherwise use `gh pr view` and `gh pr diff`.
- Analyze all data before rendering. The visualization itself must not fetch data.

## Organize the review

Order sections by reviewer value:

1. **Core logic:** behavior, algorithms, state transitions, data models, security boundaries, and public APIs. Show the relevant diff with enough context.
2. **Wiring and integration:** routes, configuration, dependency injection, migrations, and call sites. Condense these while preserving the connections to core logic.
3. **Mechanical changes:** generated code, imports, formatting, renames, and type re-exports. Summarize filenames and change counts unless a mechanical edit creates risk.

Lead with the change's purpose and execution path. Explain interactions across files rather than repeating the diff.

## Explain difficult changes

- Add short pseudocode only when the implementation is genuinely hard to scan.
- For behavior whose outcome is not obvious, trace one small realistic input through the old and new paths and identify the divergence.
- Mark surprising hunks with restrained labels such as `Subtle`, `Breaking`, `Race`, `Security`, or `Performance`, followed by one sentence explaining the risk.
- Keep ordinary commentary to one or two sentences. Do not manufacture findings to populate the canvas.

## Render in Codex

When inline Visualizations are supported, follow the `visualize` skill's current output contract exactly. Build a focused interactive review with:

- expandable diffs for core and integration changes;
- a compact change map showing important cross-file relationships;
- optional pseudocode or before/after traces beside the relevant hunk;
- keyboard-accessible filters or navigation only when they reduce review effort;
- embedded, escaped PR data and no network requests.

Use `window.openai.sendFollowUpMessage(...)` only for clearly labeled actions that ask Codex to investigate or explain a selected hunk.

When inline Visualizations are unavailable, return the same organization as concise Markdown. Do not claim that Codex CLI or the IDE extension rendered an interactive review.

## Report findings natively

Keep the canvas explanatory. Emit actionable line-specific findings separately using Codex `::code-comment{...}` directives when that surface is available. Each finding must identify a concrete defect or risk, use the tightest useful line range, and explain the consequence.

Finish with the highest-risk areas, important unanswered questions, and the validation a human reviewer should perform. If no actionable findings exist, say so plainly.
