import { cn } from '../lib/utils'

export type BadgeProps = {
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'outline'
  children: React.ReactNode
  className?: string
}

const variantStyles = {
  default: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20',
  destructive: 'bg-red-50 text-red-700 ring-1 ring-red-600/20',
  outline: 'border border-zinc-200 text-zinc-600',
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
