# Slowpoke setup

Connect a Codex or Claude Code installation to Slowpoke.

Generate a setup command in Slowpoke, then run the command on the computer that
you want to connect. The setup code expires after 15 minutes.

```sh
npx @slowpokeai/setup enroll --code <code> --server <url>
```

Use another package runner if needed:

```sh
pnpm dlx @slowpokeai/setup enroll --code <code> --server <url>
yarn dlx @slowpokeai/setup enroll --code <code> --server <url>
bunx @slowpokeai/setup enroll --code <code> --server <url>
```

Run the help command to view all options:

```sh
npx @slowpokeai/setup enroll --help
```
