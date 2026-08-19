#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TYPES = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "docs",
  "test",
  "chore",
  "build",
  "ci",
  "style",
  "revert",
];

const SUBJECT_PATTERN = new RegExp(
  `^(?:${TYPES.join("|")})(?:\\([a-z0-9][a-z0-9._/-]*\\))?!?: [a-z0-9].+$`,
);
const NON_IMPERATIVE_OPENERS =
  /^(?:added|adds|adding|created|creates|creating|fixed|fixes|fixing|removed|removes|removing|updated|updates|updating|refactored|refactors|refactoring)\b/i;
const FORBIDDEN_PHRASES = [
  [/\bthis (?:commit|pr|pull request)\b/i, '"this commit/PR"'],
  [/\bas requested by\b/i, '"as requested by"'],
  [/\b(?:i|we|now|currently)\b/i, '"I", "we", "now", or "currently"'],
  [/\bgenerated (?:with|by) (?:claude|codex|chatgpt|ai)\b/i, "AI attribution"],
];
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const REQUIRED_PR_SECTIONS = ["Summary", "Why", "Validation"];

function addForbiddenPhraseErrors(value, label, errors) {
  for (const [pattern, description] of FORBIDDEN_PHRASES) {
    if (pattern.test(value)) {
      errors.push(`${label} contains forbidden wording: ${description}`);
    }
  }

  if (EMOJI_PATTERN.test(value)) {
    errors.push(`${label} contains emoji`);
  }
}

function validateSubject(subject, label) {
  const errors = [];

  if (!subject) {
    return [`${label} is empty`];
  }

  if (subject.length > 72) {
    errors.push(`${label} exceeds the 72-character hard cap (${subject.length})`);
  }

  if (!SUBJECT_PATTERN.test(subject)) {
    errors.push(
      `${label} must match "<type>(<scope>): <imperative summary>" with a lowercase summary`,
    );
  }

  if (subject.endsWith(".")) {
    errors.push(`${label} must not end with a period`);
  }

  const summary = subject.includes(": ") ? subject.split(": ", 2)[1] : subject;
  if (NON_IMPERATIVE_OPENERS.test(summary)) {
    errors.push(`${label} must use imperative mood`);
  }

  addForbiddenPhraseErrors(subject, label, errors);

  return errors;
}

function withoutGitComments(message) {
  return message
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n")
    .trimEnd();
}

export function validateCommitMessage(rawMessage) {
  const message = withoutGitComments(rawMessage);
  const lines = message.split("\n");
  const subject = lines[0] ?? "";
  const body = lines.slice(2).join("\n").trim();
  const errors = validateSubject(subject, "Commit subject");

  if (lines.length > 1 && lines[1] !== "") {
    errors.push("Commit subject and body must be separated by a blank line");
  }

  for (const [index, line] of lines.entries()) {
    const isTrailer = /^[A-Za-z][A-Za-z-]+: /.test(line);
    if (index > 0 && line.length > 72 && !isTrailer) {
      errors.push(`Commit body line ${index + 1} exceeds 72 characters`);
    }
  }

  const type = subject.match(/^([a-z]+)/)?.[1];
  const needsBody =
    subject.includes("!:") ||
    type === "revert" ||
    /\b(?:security|migration|migrate|revert)\b/i.test(subject);

  if (needsBody && !body) {
    errors.push("Commit requires a body explaining the risk or migration");
  }

  if (subject.includes("!:") && !/^BREAKING CHANGE: /m.test(body)) {
    errors.push('Breaking commit body must include a "BREAKING CHANGE:" trailer');
  }

  addForbiddenPhraseErrors(body, "Commit body", errors);

  return errors;
}

function sectionBody(body, heading) {
  const marker = `## ${heading}`;
  const markerIndex = body.indexOf(marker);
  if (markerIndex === -1) {
    return "";
  }

  const contentStart = body.indexOf("\n", markerIndex + marker.length);
  if (contentStart === -1) {
    return "";
  }

  const nextHeading = body.indexOf("\n## ", contentStart + 1);
  const contentEnd = nextHeading === -1 ? body.length : nextHeading;

  return body.slice(contentStart + 1, contentEnd).trim();
}

export function validatePullRequest(title, body) {
  const errors = validateSubject(title.trim(), "PR title");
  const description = body.trim();

  if (!description) {
    return [...errors, "PR description is empty"];
  }

  let previousIndex = -1;
  for (const heading of REQUIRED_PR_SECTIONS) {
    const headingIndex = description.indexOf(`## ${heading}`);
    if (headingIndex === -1) {
      errors.push(`PR description is missing "## ${heading}"`);
    } else if (headingIndex < previousIndex) {
      errors.push(`PR section "## ${heading}" is out of order`);
    }
    previousIndex = Math.max(previousIndex, headingIndex);
  }

  const summary = sectionBody(description, "Summary");
  const why = sectionBody(description, "Why");
  const validation = sectionBody(description, "Validation");
  const summaryBullets = summary.split("\n").filter((line) => /^- \S/.test(line)).length;

  if (summaryBullets < 1 || summaryBullets > 3) {
    errors.push("PR Summary must contain one to three bullets");
  }
  if (!why) {
    errors.push("PR Why section must explain the motivation");
  }
  if (!validation) {
    errors.push("PR Validation section must list checks");
  }

  addForbiddenPhraseErrors(description, "PR description", errors);

  return errors;
}

function commitMessagesInRange(base, head) {
  const output = execFileSync(
    "git",
    ["log", "--no-merges", "--format=%H%x00%B%x00", `${base}..${head}`],
    {
      encoding: "utf8",
    },
  );
  const fields = output.split("\0");
  const commits = [];

  for (let index = 0; index + 1 < fields.length; index += 2) {
    const sha = fields[index].trim();
    const message = fields[index + 1];
    if (sha) {
      commits.push({ sha, message });
    }
  }

  return commits;
}

function validateRange(base, head) {
  const commits = commitMessagesInRange(base, head);
  const errors = [];

  if (commits.length === 0) {
    return [`Commit range ${base}..${head} is empty`];
  }

  for (const { sha, message } of commits) {
    for (const error of validateCommitMessage(message)) {
      errors.push(`${sha.slice(0, 12)}: ${error}`);
    }
  }

  return errors;
}

function report(errors) {
  if (errors.length === 0) {
    console.log("Metadata valid");
    return;
  }

  console.error("Metadata rejected:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}

function usage() {
  console.error(`Usage:
  check-metadata.mjs commit <message-file>
  check-metadata.mjs pr <title> <body-file>
  check-metadata.mjs range <base-sha> <head-sha>
  check-metadata.mjs event <github-event-file>`);
  process.exitCode = 2;
}

function main([mode, ...args]) {
  if (mode === "commit" && args.length === 1) {
    report(validateCommitMessage(readFileSync(args[0], "utf8")));
    return;
  }

  if (mode === "pr" && args.length === 2) {
    report(validatePullRequest(args[0], readFileSync(args[1], "utf8")));
    return;
  }

  if (mode === "range" && args.length === 2) {
    report(validateRange(args[0], args[1]));
    return;
  }

  if (mode === "event" && args.length === 1) {
    const event = JSON.parse(readFileSync(args[0], "utf8"));
    const pullRequest = event.pull_request;
    if (!pullRequest) {
      report(["GitHub event does not contain a pull request"]);
      return;
    }

    report([
      ...validatePullRequest(pullRequest.title ?? "", pullRequest.body ?? ""),
      ...validateRange(pullRequest.base.sha, pullRequest.head.sha),
    ]);
    return;
  }

  usage();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
