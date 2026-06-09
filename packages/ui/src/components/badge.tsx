import { cn } from '../lib/utils'

export type BadgeProps = {
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'outline'
  children: React.ReactNode
  className?: string
}

const variantStyles = {
  default: 'bg-zinc-100 text-zinc-800',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  destructive: 'bg-red-100 text-red-800',
  outline: 'border border-zinc-300 text-zinc-800',
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
