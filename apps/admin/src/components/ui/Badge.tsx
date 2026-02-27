import { type ReactNode } from 'react';

const variants = {
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  neutral: 'bg-gray-100 text-gray-700',
} as const;

interface BadgeProps {
  variant?: keyof typeof variants;
  dot?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Badge({ variant = 'neutral', dot, children, className = '', onClick }: BadgeProps) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium';
  const cursor = onClick ? 'cursor-pointer hover:opacity-80' : '';
  return (
    <span className={`${base} ${variants[variant]} ${cursor} ${className}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${variant === 'success' ? 'bg-green-500' : variant === 'error' ? 'bg-red-500' : variant === 'warning' ? 'bg-yellow-500' : variant === 'info' ? 'bg-blue-500' : 'bg-gray-500'}`} />}
      {children}
    </span>
  );
}
