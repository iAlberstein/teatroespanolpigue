// Sistema de diseño minimalista con colores pasteles suaves

export const theme = {
  colors: {
    // Colores principales
    primary: '#A78BFA',      // Lavanda suave
    primaryLight: '#C4B5FD',  // Púrpura pastel claro
    primaryDark: '#8B5CF6',   // Lavanda más intenso
    
    // Colores de acento
    accent: '#FCA5A5',        // Rosa coral suave
    accentLight: '#FECACA',   // Rosa más claro
    
    // Backgrounds
    background: '#FAFAFA',    // Casi blanco
    surface: '#FFFFFF',       // Blanco puro
    surfaceAlt: '#F3F4F6',    // Gris muy claro
    
    // Textos
    textPrimary: '#1F2937',   // Gris oscuro suave
    textSecondary: '#6B7280', // Gris medio
    textMuted: '#9CA3AF',     // Gris claro
    
    // Bordes y líneas
    border: '#E5E7EB',        // Gris muy claro
    borderLight: '#F3F4F6',   // Casi invisible
    
    // Estados
    success: '#86EFAC',       // Verde menta suave
    warning: '#FDE68A',       // Amarillo suave
    error: '#FCA5A5',         // Rosa coral suave
    info: '#A5B4FC',          // Azul lavanda suave
    
    // Overlays
    overlay: 'rgba(0, 0, 0, 0.5)',
    overlayLight: 'rgba(0, 0, 0, 0.2)',
  },
  
  // Tipografía
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    
    // Tamaños
    h1: '2.5rem',      // 40px
    h2: '2rem',        // 32px
    h3: '1.5rem',      // 24px
    h4: '1.25rem',     // 20px
    h5: '1.125rem',    // 18px
    body: '1rem',      // 16px
    small: '0.875rem', // 14px
    tiny: '0.75rem',   // 12px
    
    // Pesos
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  
  // Espaciado (múltiplos de 4px)
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
  },
  
  // Border radius
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },
  
  // Sombras suaves
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },
  
  // Breakpoints para responsive
  breakpoints: {
    mobile: '640px',
    tablet: '768px',
    desktop: '1024px',
    wide: '1280px',
  },
  
  // Transiciones suaves
  transitions: {
    fast: '150ms ease-in-out',
    normal: '250ms ease-in-out',
    slow: '350ms ease-in-out',
  },
};

// Helper para media queries
export const media = {
  mobile: `@media (max-width: ${theme.breakpoints.mobile})`,
  tablet: `@media (max-width: ${theme.breakpoints.tablet})`,
  desktop: `@media (min-width: ${theme.breakpoints.desktop})`,
};

export default theme;
