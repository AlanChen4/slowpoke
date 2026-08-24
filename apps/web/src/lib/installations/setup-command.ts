export const DEFAULT_SETUP_SERVER = "https://avchen4--slowpoke-backend-web.modal.run";

export function createSetupCommand(code: string, server: string) {
  const normalizedServer = new URL(server).href.replace(/\/$/, "");
  const serverArgument =
    normalizedServer === DEFAULT_SETUP_SERVER ? "" : ` --server ${normalizedServer}`;
  return `npx @slowpokeai/setup enroll --code ${code}${serverArgument}`;
}
