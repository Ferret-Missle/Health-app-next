// Resolve the app's public base URL for OAuth redirects.
//
// Priority:
//   1. NEXT_PUBLIC_APP_URL — set this in production so it exactly matches the
//      redirect URIs registered with Google/FatSecret.
//   2. VERCEL_URL — Vercel injects this per-deployment (preview/prod) without a
//      scheme, so we prefix https://. Handy for preview deploys.
//   3. http://localhost:3000 — local dev fallback.
export function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
