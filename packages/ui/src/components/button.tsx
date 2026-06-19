import { cn } from '../lib/utils'

export type ButtonProps = {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
}

const variantStyles = {
  default: 'bg-brand-600 text-white hover:bg-brand-500 shadow-sm',
  destructive: 'bg-red-600 text-white hover:bg-red-500 shadow-sm',
  outline: 'border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700',
  ghost: 'text-zinc-600 hover:bg-zinc-100',
}

const sizeStyles = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-6 text-base',
}

export function Button({ variant = 'default', size = 'md', children, className, onClick, disabled }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
        'disabled:pointer-events-none disabled:opacity-50',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
