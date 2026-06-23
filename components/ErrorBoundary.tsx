'use client'

import { Component, type ReactNode } from 'react'

// Catches render-time crashes so a single bad value doesn't blank the whole app
// ("This page couldn't load"). Shows the error + a reload button instead.
interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Surface to the console for diagnosis (visible in prod too).
    console.error('App crash caught by ErrorBoundary:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24,
          background: '#c4cfc8', fontFamily: '"Noto Sans JP", Roboto, system-ui, sans-serif',
          textAlign: 'center',
        }}>
          <span className="ms" style={{ fontSize: 40, color: '#b3261e' }}>error</span>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#1a2420' }}>
            画面の表示中に問題が発生しました
          </div>
          <div style={{ fontSize: 12, color: '#52635c', maxWidth: 360, wordBreak: 'break-word' }}>
            {this.state.error.message}
          </div>
          <button type="button" onClick={() => location.reload()} style={{
            height: 44, padding: '0 24px', border: '1px solid #c4cfc8', borderRadius: 999,
            background: '#fff', color: '#1a2420', fontSize: 14, fontWeight: 600,
            fontFamily: 'inherit', cursor: 'pointer',
          }}>
            再読み込み
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
