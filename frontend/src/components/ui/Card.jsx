import { theme } from '../../styles/theme.js';

export default function Card({ 
  children, 
  variant = 'default',
  padding = 'md',
  style = {},
  onClick,
  className = '',
  ...props 
}) {
  const variants = {
    default: {
      background: theme.colors.surface,
      border: `1px solid ${theme.colors.border}`,
    },
    elevated: {
      background: theme.colors.surface,
      border: 'none',
      boxShadow: theme.shadows.md,
    },
    soft: {
      background: theme.colors.surfaceAlt,
      border: 'none',
    },
  };

  const paddings = {
    none: '0',
    sm: theme.spacing.sm,
    md: theme.spacing.md,
    lg: theme.spacing.lg,
    xl: theme.spacing.xl,
  };

  return (
    <div
      className={`card ${className}`}
      onClick={onClick}
      style={{
        borderRadius: theme.borderRadius.lg,
        padding: paddings[padding],
        transition: theme.transitions.normal,
        ...variants[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
