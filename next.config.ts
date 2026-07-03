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

  // Proxy Firebase Auth's redirect-handler assets through our own origin. This
  // lets NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN be set to the app's own domain
  // instead of the default <project-id>.firebaseapp.com. Sign-in (popup or
  // redirect) otherwise depends on third-party storage access between the
  // app's origin and a separate authDomain origin, which Safari (default ITP),
  // Firefox strict tracking protection, and private-browsing modes block —
  // silently failing getRedirectResult()/popup completion and bouncing the
  // user back to the sign-in screen with no error shown. See DEPLOY.md.
  async rewrites() {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) return [];
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${projectId}.firebaseapp.com/__/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
