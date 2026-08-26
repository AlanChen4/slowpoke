import { createHmac } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  buildPromptAnalyticsRpcArguments,
  composePromptAnalytics,
} from "./compose-prompt-analytics";
import { promptAnalyticsSchema } from "./prompt-analytics";
import { type Database } from "../supabase/database.types";

// oxlint-disable-next-line node/no-process-env -- The database suite opts into this local-only test.
const runContractTest = process.env.RUN_ANALYTICS_CONTRACT_TEST === "1";

function requiredEnvironmentValue(name: string) {
  // oxlint-disable-next-line node/no-process-env -- Credentials come from the local Supabase harness.
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the analytics contract test.`);
  return value;
}

function createAccessToken(secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      aud: "authenticated",
      exp: now + 3600,
      iat: now - 60,
      iss: "supabase-demo",
      role: "authenticated",
      sub: "00000000-0000-4000-8000-000000000002",
    }),
  ).toString("base64url");
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(unsignedToken).digest("base64url");
  return `${unsignedToken}.${signature}`;
}

describe.skipIf(!runContractTest)("prompt analytics database contract", () => {
  it("calls the real typed RPCs and validates the composed production response", async () => {
    const apiUrl = requiredEnvironmentValue("LOCAL_SUPABASE_API_URL");
    const anonKey = requiredEnvironmentValue("LOCAL_SUPABASE_ANON_KEY");
    const jwtSecret = requiredEnvironmentValue("LOCAL_SUPABASE_JWT_SECRET");
    const accessToken = createAccessToken(jwtSecret);
    const supabase = createClient<Database>(apiUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .select("id")
      .eq("name", "Slowpoke")
      .single();
    if (organizationError) throw organizationError;

    const rpcArguments = buildPromptAnalyticsRpcArguments({
      days: 7,
      end: new Date().toISOString(),
      organizationId: organization.id,
      timezone: "America/New_York",
    });
    const [summary, daily, dailyUsers, users, providers, models] = await Promise.all([
      supabase.rpc("get_prompt_analytics_summary", rpcArguments.report).single(),
      supabase.rpc("get_prompt_analytics_daily", rpcArguments.heatmap),
      supabase.rpc("get_prompt_analytics_daily_users", rpcArguments.heatmap),
      supabase.rpc("get_prompt_analytics_users", rpcArguments.report),
      supabase.rpc("get_prompt_analytics_providers", rpcArguments.report),
      supabase.rpc("get_prompt_analytics_models", rpcArguments.report),
    ]);
    for (const result of [summary, daily, dailyUsers, users, providers, models]) {
      if (result.error) throw result.error;
    }
    if (!summary.data || !daily.data || !dailyUsers.data || !users.data || !providers.data) {
      throw new Error("A required analytics RPC returned no data.");
    }
    if (!models.data) throw new Error("The model analytics RPC returned no data.");

    const analytics = composePromptAnalytics({
      summary: summary.data,
      daily: daily.data,
      dailyUsers: dailyUsers.data,
      users: users.data,
      providers: providers.data,
      models: models.data,
    });

    expect(analytics.success).toBe(true);
    if (!analytics.success) throw analytics.error;
    expect(analytics.data.daily).toHaveLength(90);
    expect(promptAnalyticsSchema.parse(analytics.data)).toEqual(analytics.data);
  });
});
