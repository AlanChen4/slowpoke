import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@slowpoke/telemetry"],
};

export default nextConfig;
