---
name: caveman-commit
description: >
  Generate and review ultra-compressed commit messages, pull request titles, and pull request
  descriptions while preserving intent and reasoning. Use for staging, committing, pushing,
  publishing, yeet workflows, or creating or updating a PR, including requests for a commit
  message, PR title, or PR body.
---

Write Git metadata terse and exact. No fluff. Why over what.

## Commit rules

**Subject line:**
- `<type>(<scope>): <imperative summary>` — `<scope>` optional
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`
- Imperative mood: "add", "fix", "remove" — not "added", "adds", "adding"
- ≤50 chars when possible, hard cap 72
- No trailing period
- Match project convention for capitalization after the colon

**Body (only if needed):**
- Skip entirely when subject is self-explanatory
- Add body only for: non-obvious *why*, breaking changes, migration notes, linked issues
- Wrap at 72 chars
- Bullets `-` not `*`
- Reference issues/PRs at end: `Closes #42`, `Refs #17`

## Pull request rules

**Title:**
- Follow the commit subject rules and describe the full diff

**Description:**
- Require `## Summary`, `## Why`, and `## Validation` sections
- Limit Summary to one to three user- or operator-focused bullets
- Add `## Impact` only when rollout, compatibility, or operational consequences need attention
- Explain motivation in Why; do not repeat the Summary
- List the checks actually run in Validation

**What NEVER goes in:**
- "This commit does X", "I", "we", "now", "currently" — the diff says what
- "As requested by..." — use Co-authored-by trailer
- "Generated with Claude Code" or any AI attribution — unless the user's own rule requires an `Assisted-by`/AI-attribution trailer, then add it as a trailer
- Emoji (unless project convention requires)
- Restating the file name when scope already says it

## Examples

Diff: new endpoint for user profile with body explaining the why
- ❌ "feat: add a new endpoint to get user profile information from the database"
- ✅
  ```
  feat(api): add GET /users/:id/profile

  Mobile client needs profile data without the full user payload
  to reduce LTE bandwidth on cold-launch screens.

  Closes #128
  ```

Diff: breaking API change
- ✅
  ```
  feat(api)!: rename /v1/orders to /v1/checkout

  BREAKING CHANGE: clients on /v1/orders must migrate to /v1/checkout
  before 2026-06-01. Old route returns 410 after that date.
  ```

## Auto-Clarity

Always include body for: breaking changes, security fixes, data migrations, anything reverting a prior commit. Never compress these into subject-only — future debuggers need the context.

## Validation

When `scripts/check-caveman-metadata.mjs` exists, treat it as the executable
contract. Fix rejected metadata rather than bypassing the validator.

## Boundaries

Only generates or reviews Git metadata. Does not stage, commit, push, or mutate
pull requests. Output requested metadata ready to paste. "stop caveman-commit"
or "normal mode" reverts to verbose Git metadata.
