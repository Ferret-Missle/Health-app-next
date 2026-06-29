// Release version, injected at build time by next.config.ts.
// APP_VERSION is package.json's version; GIT_SHA is the short Vercel commit SHA
// ('dev' for local builds).

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'
export const GIT_SHA = process.env.NEXT_PUBLIC_GIT_SHA ?? 'dev'

/** Display label, e.g. "v0.1.0 (abc1234)" — the SHA is omitted for local builds. */
export const VERSION_LABEL =
  `v${APP_VERSION}${GIT_SHA && GIT_SHA !== 'dev' ? ` (${GIT_SHA})` : ''}`
