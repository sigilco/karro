import type { ReactNode } from 'react'

export type BadgeTone = 'easy' | 'medium' | 'hard' | 'neutral' | 'accent'

const toneClasses: Record<BadgeTone, string> = {
  easy: 'bg-easy/15 text-easy border-easy/40',
  medium: 'bg-medium/15 text-medium border-medium/40',
  hard: 'bg-hard/15 text-hard border-hard/40',
  neutral: 'bg-ink-dim/15 text-ink-dim border-ink-dim/30',
  accent: 'bg-accent/15 text-accent border-accent/40',
}

export function Badge(props: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}) {
  const { tone = 'neutral', className = '', children } = props
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
