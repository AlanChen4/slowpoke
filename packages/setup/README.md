# Slowpoke setup

Connect a Codex or Claude Code installation to Slowpoke.

Generate a setup command in Slowpoke, then run the command on the computer that
you want to connect. The setup code expires after 15 minutes.

```sh
npx @slowpokeai/setup enroll --code <code>
```

Use another package runner if needed:

```sh
pnpm dlx @slowpokeai/setup enroll --code <code>
yarn dlx @slowpokeai/setup enroll --code <code>
bunx @slowpokeai/setup enroll --code <code>
```

Use `--server <url>` to override the bundled production server for local or
non-production environments.

Run the help command to view all options:

```sh
npx @slowpokeai/setup enroll --help
```
