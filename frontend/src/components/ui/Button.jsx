import { theme } from '../../styles/theme.js';

export default function Button({ 
  children, 
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  onClick,
  type = 'button',
  style = {},
  ...props 
}) {
  const variants = {
    primary: {
      background: '#000000',
      color: '#ffffff',
      border: 'none',
      hover: '#1F2937',
    },
    secondary: {
      background: theme.colors.surfaceAlt,
      color: theme.colors.textPrimary,
      border: `1px solid ${theme.colors.border}`,
      hover: theme.colors.border,
    },
    accent: {
      background: '#000000',
      color: '#ffffff',
      border: 'none',
      hover: '#1F2937',
    },
    danger: {
      background: '#dc3545',
      color: '#ffffff',
      border: 'none',
      hover: '#c0392b',
    },
    success: {
      background: '#000000',
      color: '#ffffff',
      border: 'none',
      hover: '#1F2937',
    },
    outline: {
      background: 'transparent',
      color: '#000000',
      border: '2px solid #000000',
      hover: '#1F2937',
    },
    ghost: {
      background: 'transparent',
      color: theme.colors.textSecondary,
      border: 'none',
      hover: theme.colors.surfaceAlt,
    },
  };

  const sizes = {
    sm: {
      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      fontSize: theme.typography.small,
    },
    md: {
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      fontSize: theme.typography.body,
    },
    lg: {
      padding: `${theme.spacing.md} ${theme.spacing.lg}`,
      fontSize: theme.typography.h5,
    },
  };

  const variantStyle = variants[variant];
  const sizeStyle = sizes[size];

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...sizeStyle,
        background: variantStyle.background,
        color: variantStyle.color,
        border: variantStyle.border,
        borderRadius: theme.borderRadius.md,
        fontWeight: theme.typography.medium,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: theme.transitions.fast,
        width: fullWidth ? '100%' : 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        ...style,
      }}
      onMouseOver={(e) => {
        if (!disabled) {
          e.target.style.background = variantStyle.hover;
        }
      }}
      onMouseOut={(e) => {
        if (!disabled) {
          e.target.style.background = variantStyle.background;
        }
      }}
      {...props}
    >
      {children}
    </button>
  );
}
