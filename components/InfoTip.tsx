'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import type { C } from '@/lib/colors'

const WIDTH = 232   // bubble width
const MARGIN = 8    // min gap from viewport edge

/**
 * Tap-to-toggle info tooltip for mobile (no hover). Renders a small `?` icon;
 * tapping shows a bubble, tapping outside/again closes it. The bubble uses
 * fixed positioning (so overflow:hidden ancestors don't clip it) and is clamped
 * to stay within the viewport horizontally.
 */
export default function InfoTip({ c, text, label = '説明' }: { c: C, text: string, label?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const ref = useRef<HTMLSpanElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    // Prefer right-aligning the bubble to the icon, then clamp into the viewport.
    let left = r.right - WIDTH
    const max = window.innerWidth - WIDTH - MARGIN
    if (left > max) left = max
    if (left < MARGIN) left = MARGIN
    setPos({ left, top: r.bottom + 6 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <span ref={ref} style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{
          width: 20, height: 20, padding: 0, border: 'none', borderRadius: 999,
          background: open ? c.secondaryC : 'transparent', color: open ? c.onSecC : c.onSurfVar,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <span className="ms" style={{ fontSize: 16 }}>help</span>
      </button>
      {open && (
        <span role="tooltip" style={{
          position: 'fixed', left: pos.left, top: pos.top, zIndex: 1000,
          width: WIDTH, background: c.surfHighest, color: c.onSurf,
          fontSize: 11.5, lineHeight: '17px', fontWeight: 400,
          padding: '10px 12px', borderRadius: 12,
          boxShadow: '0 6px 22px rgba(0,0,0,.22)', whiteSpace: 'pre-wrap',
          textAlign: 'left',
        }}>
          {text}
        </span>
      )}
    </span>
  )
}
