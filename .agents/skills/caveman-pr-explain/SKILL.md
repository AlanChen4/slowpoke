---
name: caveman-pr-explain
description: Explain any pull request as a complete before-and-after story using concrete examples and exhaustive technical detail in caveman style. Use when the user asks what a PR does end to end, wants the practical effect instead of a file-by-file diff, requests a before/after walkthrough, or needs changes across UI, APIs, jobs, libraries, data, infrastructure, tooling, tests, or documentation connected into one understandable system narrative.
---

# Caveman PR Explain

Explain the whole change in reviewer order. Compress wording with `caveman`; never compress facts.

## Prepare

- Load and follow the available `caveman` skill at full intensity.
- Load and follow `explain-this-pr` when available for PR discovery, diff collection, review ordering, findings, and visualization rules.
- Resolve the requested PR, or the PR associated with the current branch.
- Gather PR metadata, commits, checks, comments, full base-to-head diff, and relevant source at both base and head.
- Inspect implementation, configuration, schemas, migrations, generated output, tests, docs, and deployment files needed to reconstruct behavior.
- Identify PR type: product feature, bug fix, refactor, data change, infrastructure, tooling, documentation, or mixed.
- Separate verified behavior from inference. Do not infer shipped behavior from a type, name, mock, or planned document alone.

## Build technical inventory

Capture every changed detail that affects behavior or developer operations, including:

- user-visible states, interactions, accessibility, navigation, and error handling;
- components, modules, processes, public APIs, owners, and deployment targets;
- protocols, endpoints, headers, authentication, authorization, and identity;
- inputs, outputs, types, payloads, fields, transformations, validation, limits, and errors;
- state transitions, caching, batching, queues, retries, timeouts, concurrency, and failure behavior;
- tables, columns, constraints, indexes, migrations, deduplication, grants, and access policies;
- environment variables, secrets, ports, resource limits, and operator setup;
- packages, dependencies, build steps, scripts, generated files, compatibility, and upgrade impact;
- test boundaries, real versus synthetic dependencies, fixtures, and check results;
- intentionally deferred work, unsupported cases, and performance, durability, privacy, or security limits.

Preserve exact names, numbers, units, paths, commands, and negative statements. Summarize mechanical renames and generated output unless they change behavior.

## Choose story spine

Start where change actually begins, not at predetermined technology:

- Product/UI: user action -> UI state -> client logic -> network/API -> data -> returned state.
- API/backend: caller -> boundary validation/auth -> domain logic -> dependency/data write -> response/failure.
- Async/data: producer -> queue/job -> transformation -> storage -> consumer, including retry and idempotency.
- Library/refactor: caller -> public contract -> changed internals -> dependencies -> returned result; prove observable behavior preserved or changed.
- Infrastructure/tooling: developer or deployment command -> config/build -> provisioned/runtime artifact -> operational effect -> rollback/failure.
- Documentation-only: reader goal -> old guidance -> changed guidance -> resulting workflow; state clearly that runtime code is unchanged.

Mixed PR: join relevant spines into one execution-order path. Do not force absent layers into story.

At every step, name responsible file or component, input, output, and reason boundary exists. Follow actual execution order, not directory order. State `not applicable` or `not implemented` where reader could reasonably expect a layer but PR lacks it.

## Use concrete examples

Choose smallest realistic scenario exercising main change. Use exact names and values from source or tests when available. Never invent claimed behavior.

Examples:

- UI PR: “User with empty cart clicks Checkout” before and after; show disabled state, request body, response, and rendered error/success.
- API PR: `POST /invoices` with one representative payload; show validation, permission check, write, response, retry, and duplicate behavior.
- Refactor PR: same public function call on both revisions; show moved internals, deleted dependency, unchanged output, and tests proving equivalence.
- Migration PR: one representative old row; show schema before, migration transformation, constraints after, application compatibility, and rollback limitation.
- Tooling PR: one developer command; show previous commands/config, new command path, produced artifact, CI enforcement, and failure message.

If main change has several materially different branches, add examples for each. Avoid examples that merely restate prose.

## Compare before and after

Trace same scenario twice:

- **Before:** Describe base-branch behavior, structure, or workflow. Say `no path` only when capability truly did not exist.
- **After:** Describe head-branch behavior using same scenario and stopping points.

Call out added, removed, moved, unchanged, and deferred behavior. For bug fixes, show failure then correction. For refactors, show structural change plus preserved contract. Explain any trust-boundary change explicitly: who supplies identity or input, who may mutate it, and where authorization occurs.

## Output contract

Use this order:

1. Purpose in one compact paragraph.
2. Before snapshot.
3. Architecture or dependency map only when relationships need a diagram.
4. Numbered start-to-finish walkthrough from actual entry point to observable outcome.
5. Before/after trace using concrete scenario.
6. Contracts, data, state, and security implications that apply.
7. Deployment, migration, compatibility, and operations that apply.
8. Validation coverage mapped to changed behavior.
9. Risks, deferred work, unanswered questions, and human checks.

Link important local files and exact lines when available. Avoid repeating same fact in diagram and prose. Do not omit detail to stay short; remove filler and repetition instead. Do not manufacture findings.
