import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg' | 'xl'

const base =
  'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold select-none transition-transform active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-surface',
  ghost: 'bg-surface-2 text-ink border border-ink-dim/25',
  danger: 'bg-hard text-surface',
}

const sizeClasses: Record<ButtonSize, string> = {
  md: 'h-11 px-4 text-sm',
  lg: 'h-14 px-6 text-base', // 56px — minimum legal glance target while driving
  xl: 'h-16 px-6 text-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', className = '', type, ...rest } = props
  return (
    <button
      type={type ?? 'button'}
      className={`${base} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    />
  )
}
