import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

// Expose the release version to the client. The app version comes from
// package.json; the commit SHA comes from Vercel's build env (falls back to
// 'dev' locally). Both are inlined at build time via `env`.
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };
const gitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
};

export default nextConfig;
