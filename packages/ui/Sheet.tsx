import type { HTMLAttributes } from 'react'

// Bottom sheet: edge-anchored, safe-area aware. The drive surface's glance
// card lives here — thumb-reach only, per the design doc's one-tap-target rule.
export function Sheet(props: HTMLAttributes<HTMLDivElement>) {
  const { className = '', style, ...rest } = props
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-20 rounded-t-3xl border-t border-ink-dim/15 bg-surface-2/95 px-4 pt-4 backdrop-blur ${className}`}
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))', ...style }}
      {...rest}
    />
  )
}
