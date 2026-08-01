# Repository instructions

## Git and pull request metadata

Before creating a commit, pushing a PR branch, or creating or updating a pull
request:

1. Read and follow `.agents/skills/caveman-pr/SKILL.md`.
2. Use the skill across scope review, commits, validation, push, and pull
   request creation or updates.
3. Never bypass the repository hooks with `--no-verify`.
4. Fix metadata rejected by `scripts/check-metadata.mjs`; do not weaken
   or skip the check.

Use Conventional Commits syntax for both commit subjects and PR titles. PR
descriptions must contain `Summary`, `Why`, and `Validation` sections.
