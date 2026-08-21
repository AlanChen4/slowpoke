export function isInstallationSetupComplete(
  selectedTools: readonly string[],
  verifiedInstallations: readonly { tool: string }[],
) {
  const verifiedTools = new Set(verifiedInstallations.map((installation) => installation.tool));
  return selectedTools.every((tool) => verifiedTools.has(tool));
}
