# 🎨 Sistema de Diseño - Teatro Español Pigüé

## Filosofía de Diseño

**Minimalista · Elegante · Profesional**

- Colores pasteles suaves y no estridentes
- Espaciado generoso y consistente
- Tipografía clara y legible
- Sombras sutiles
- Transiciones suaves

---

## 🎨 Paleta de Colores

### Colores Principales
- **Primary**: `#A78BFA` - Lavanda suave
- **Primary Light**: `#C4B5FD` - Púrpura pastel claro
- **Primary Dark**: `#8B5CF6` - Lavanda intenso

### Acentos
- **Accent**: `#FCA5A5` - Rosa coral suave
- **Accent Light**: `#FECACA` - Rosa más claro

### Backgrounds
- **Background**: `#FAFAFA` - Casi blanco
- **Surface**: `#FFFFFF` - Blanco puro
- **Surface Alt**: `#F3F4F6` - Gris muy claro

### Textos
- **Text Primary**: `#1F2937` - Gris oscuro suave
- **Text Secondary**: `#6B7280` - Gris medio
- **Text Muted**: `#9CA3AF` - Gris claro

### Bordes
- **Border**: `#E5E7EB` - Gris muy claro
- **Border Light**: `#F3F4F6` - Casi invisible

---

## 📐 Espaciado

Sistema basado en múltiplos de 4px:

- **xs**: 4px
- **sm**: 8px
- **md**: 16px (base)
- **lg**: 24px
- **xl**: 32px
- **2xl**: 48px
- **3xl**: 64px

---

## ✍️ Tipografía

**Font Family**: Sistema nativo
```
-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif
```

### Tamaños
- **h1**: 2.5rem (40px)
- **h2**: 2rem (32px)
- **h3**: 1.5rem (24px)
- **h4**: 1.25rem (20px)
- **h5**: 1.125rem (18px)
- **body**: 1rem (16px)
- **small**: 0.875rem (14px)
- **tiny**: 0.75rem (12px)

### Pesos
- **Light**: 300
- **Regular**: 400
- **Medium**: 500
- **Semibold**: 600
- **Bold**: 700

---

## 🔘 Border Radius

- **sm**: 4px
- **md**: 8px (recomendado para botones)
- **lg**: 12px (recomendado para cards)
- **xl**: 16px
- **full**: 9999px (circular)

---

## ☁️ Sombras

Sombras muy sutiles para no romper el minimalismo:

- **sm**: Sutil - Para elementos ligeros
- **md**: Media - Para cards
- **lg**: Grande - Para modales
- **xl**: Extra grande - Para elementos destacados

---

## 📱 Responsive Breakpoints

- **Mobile**: < 640px
- **Tablet**: < 768px
- **Desktop**: ≥ 1024px
- **Wide**: ≥ 1280px

---

## 🧩 Componentes Disponibles

### Card
```jsx
import Card from './components/ui/Card';

// Variantes: default, elevated, soft
// Padding: none, sm, md, lg, xl

<Card variant="elevated" padding="lg">
  Contenido
</Card>
```

### Button
```jsx
import Button from './components/ui/Button';

// Variantes: primary, secondary, accent, outline, ghost
// Tamaños: sm, md, lg

<Button variant="primary" size="md">
  Acción
</Button>
```

---

## 🎯 Uso del Tema

```jsx
import { theme } from './styles/theme';

const styles = {
  container: {
    background: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
  }
};
```

---

## ✨ Mejores Prácticas

1. **Consistencia**: Usar siempre los valores del tema
2. **Espaciado**: Respetar el sistema de espaciado (múltiplos de 4px)
3. **Colores**: No inventar colores fuera de la paleta
4. **Sombras**: Usar con moderación
5. **Animaciones**: Suaves y rápidas (150-350ms)
6. **Mobile First**: Pensar primero en móvil
7. **Accesibilidad**: Contraste mínimo 4.5:1 para textos

---

## 🚀 Próximos Pasos

1. Aplicar diseño a página Home
2. Rediseñar Cartelera
3. Mejorar página de Detalle
4. Actualizar formularios de Login/Register
5. Pulir página de Perfil
6. Mejorar experiencia móvil en toda la app
