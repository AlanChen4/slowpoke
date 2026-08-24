import * as z from "zod";

const latestSetupPackageUrl = "https://registry.npmjs.org/@slowpokeai%2Fsetup/latest";
const stableVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
const packageMetadataSchema = z.object({ version: stableVersionSchema });

export type SetupPackageVersionState = "current" | "outdated" | "unknown";

export async function getLatestSetupPackageVersion() {
  try {
    const response = await fetch(latestSetupPackageUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 },
    });
    if (!response.ok) {
      return null;
    }

    const result = packageMetadataSchema.safeParse(await response.json());
    return result.success ? result.data.version : null;
  } catch {
    return null;
  }
}

function parseStableVersion(version: string) {
  const result = stableVersionSchema.safeParse(version);
  return result.success ? result.data.split(".").map(Number) : null;
}

export function getSetupPackageVersionState(
  installedVersion: string | null,
  latestVersion: string | null,
): SetupPackageVersionState {
  if (!latestVersion) {
    return "unknown";
  }
  if (!installedVersion) {
    return "outdated";
  }

  const installedParts = parseStableVersion(installedVersion);
  const latestParts = parseStableVersion(latestVersion);
  if (!installedParts || !latestParts) {
    return "unknown";
  }

  for (let index = 0; index < latestParts.length; index += 1) {
    const difference = installedParts[index] - latestParts[index];
    if (difference < 0) {
      return "outdated";
    }
    if (difference > 0) {
      return "current";
    }
  }

  return "current";
}
