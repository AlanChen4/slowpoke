---
name: caveman-pr
description: >
  Prepare and publish terse, exact Git metadata across an entire pull request. Use when staging,
  committing, pushing, publishing, running a yeet workflow, creating or updating a PR, or writing
  or reviewing commit messages, PR titles, and PR descriptions. Covers scope review, every commit,
  the full-diff PR story, validation, and safe publication.
---

Make the pull request small, reviewable, and exact. No fluff. Why over what.

## Workflow

1. Read repository-local Git and PR instructions.
2. Inspect the branch, status, full diff, and existing commits before staging.
3. Separate unrelated user changes. Stage only the intended PR scope.
4. Write and validate every commit message with the rules below.
5. Run the relevant checks before pushing.
6. Derive the PR title and description from the full base-to-head diff, not only the latest commit.
7. Validate the complete commit range plus PR metadata before creating or updating the PR.
8. Push or mutate a PR only when the user has requested publication. Default new PRs to draft.

Never bypass hooks or validators. Fix rejected metadata at the source.

## Commit rules

**Subject:**

- Use `<type>(<scope>): <imperative summary>`; scope is optional.
- Use `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, or `revert`.
- Start with an imperative verb: `add`, `fix`, `remove`; not `added`, `adds`, or `adding`.
- Prefer 50 characters or fewer; never exceed 72.
- Omit the trailing period.
- Match the repository convention for capitalization after the colon.

**Body:**

- Omit it when the subject explains the change.
- Include it for non-obvious motivation, breaking changes, security fixes, migrations, reverts, or issue links.
- Wrap prose at 72 characters and use `-` for bullets.
- Put issue references last: `Closes #42`, `Refs #17`.
- Include `BREAKING CHANGE:` for breaking commits.

## Pull request rules

**Title:**

- Follow the commit subject rules.
- Summarize the full PR diff rather than copying the latest commit subject.

**Description:**

- Require `## Summary`, `## Why`, and `## Validation`, in that order.
- Limit Summary to one to three user- or operator-focused bullets.
- Explain motivation in Why without repeating Summary.
- List only checks actually run in Validation.
- Add `## Impact` only for rollout, compatibility, migration, or operational consequences.
- Update the existing description instead of appending a progress diary.

## Prohibited metadata

- `This commit`, `This PR`, `I`, `we`, `now`, or `currently`.
- `As requested by`; use a `Co-authored-by` trailer when appropriate.
- AI attribution unless repository rules require an attribution trailer.
- Emoji unless repository convention requires it.
- File-name restatement when the scope already communicates it.

## Repository validator

When `scripts/check-metadata.mjs` exists, treat it as the executable contract:

```sh
node scripts/check-metadata.mjs commit <message-file>
node scripts/check-metadata.mjs pr <title> <body-file>
node scripts/check-metadata.mjs range <base-sha> <head-sha>
```

Use repository hooks normally. Never pass `--no-verify`, weaken the validator, or omit a failed check.

## Publication boundaries

- Do not stage unrelated changes.
- Do not push, create or update a PR, mark it ready, merge it, or change its base without user authority.
- If the user requests metadata only, return metadata ready to paste and stop.
- If publication is requested, report the branch, commit, PR URL, validation, and remaining risks.
- `stop caveman-pr` or `normal mode` reverts to normal Git metadata style.
