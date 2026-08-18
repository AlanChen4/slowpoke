import { CodeBlock } from "@/components/ui/code-block";

function EnrollmentCodeBlock({ command }: { command: string }) {
  const npxPrefix = "npx @slowpokeai/setup ";
  const enrollmentArguments = command.startsWith(npxPrefix)
    ? command.slice(npxPrefix.length)
    : command;

  return (
    <CodeBlock
      className="w-full"
      files={[
        { filename: "npx", code: command, language: "bash" },
        {
          filename: "pnpm",
          code: `pnpm dlx @slowpokeai/setup ${enrollmentArguments}`,
          language: "bash",
        },
        {
          filename: "yarn",
          code: `yarn dlx @slowpokeai/setup ${enrollmentArguments}`,
          language: "bash",
        },
        {
          filename: "bun",
          code: `bunx @slowpokeai/setup ${enrollmentArguments}`,
          language: "bash",
        },
      ]}
    />
  );
}

export default EnrollmentCodeBlock;
