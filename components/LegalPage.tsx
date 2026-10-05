import type { ReactNode } from 'react'

// Shared shell for the public legal pages (/privacy, /terms). Server component,
// no auth gate: Google's OAuth consent screen requires these URLs to be reachable
// without signing in.
export default function LegalPage({ title, updated, children }: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <main style={{
      minHeight: '100vh', background: '#f4f7f5', padding: '32px 16px',
      fontFamily: '"Noto Sans JP", Roboto, system-ui, sans-serif', color: '#1a2420',
    }}>
      <article style={{
        maxWidth: 720, margin: '0 auto', background: '#fff', borderRadius: 20,
        padding: '32px 28px', lineHeight: 1.8, fontSize: 14,
        boxShadow: '0 4px 24px rgba(0,0,0,.08)',
      }}>
        <a href="/" style={{ fontSize: 13, color: '#175C49', fontWeight: 600 }}>← 健康収支トラッカー</a>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '16px 0 4px' }}>{title}</h1>
        <p style={{ fontSize: 12, color: '#52635c', marginBottom: 20 }}>最終更新日: {updated}</p>
        {children}
        <nav style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #c4cfc8', fontSize: 13, display: 'flex', gap: 16 }}>
          <a href="/privacy" style={{ color: '#175C49' }}>プライバシーポリシー</a>
          <a href="/terms" style={{ color: '#175C49' }}>利用規約</a>
        </nav>
      </article>
    </main>
  )
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: 17, fontWeight: 700, margin: '24px 0 6px', color: '#175C49' }}>{children}</h2>
}

export function Contact() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL
  return email
    ? <p>お問い合わせ: <a href={`mailto:${email}`} style={{ color: '#175C49' }}>{email}</a></p>
    : <p>お問い合わせは、本アプリの運営者までご連絡ください。</p>
}
