import type { Metadata, Viewport } from 'next'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import './globals.css'

export const metadata: Metadata = {
  title: '健康管理',
  description: '個人カロリー収支・体重管理アプリ',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lock zoom so the layout always matches the physical screen width on phones.
  maximumScale: 1,
  viewportFit: 'cover',
  // Brand-green mobile browser chrome, matching the app icon.
  themeColor: '#175C49',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Roboto:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppRouterCacheProvider>
          {children}
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
