import { useState, useEffect, useRef } from 'react';

// Convierte ISO (YYYY-MM-DD) → display (DD/MM/AAAA)
const isoToDisplay = (iso) => {
  if (!iso) return '';
  const p = iso.split('-');
  if (p.length !== 3) return '';
  return `${p[2]}/${p[1]}/${p[0]}`;
};

// Convierte display (DD/MM/AAAA) → ISO (YYYY-MM-DD), o '' si incompleto
const displayToIso = (display) => {
  const clean = display.replace(/\D/g, '');
  if (clean.length !== 8) return '';
  const dd = clean.slice(0, 2);
  const mm = clean.slice(2, 4);
  const aaaa = clean.slice(4, 8);
  const d = parseInt(dd), m = parseInt(mm), y = parseInt(aaaa);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return '';
  return `${aaaa}-${mm}-${dd}`;
};

// Aplica la máscara DD/MM/AAAA sobre los dígitos ingresados
const applyMask = (digits) => {
  const d = digits.slice(0, 8);
  let result = '';
  if (d.length > 0) result += d.slice(0, 2);
  if (d.length > 2) result += '/' + d.slice(2, 4);
  if (d.length > 4) result += '/' + d.slice(4, 8);
  return result;
};

export default function DateInputMask({ value, onChange, style, placeholder, ...props }) {
  const [display, setDisplay] = useState(isoToDisplay(value));
  const inputRef = useRef(null);

  // Sincronizar si el value ISO cambia externamente
  useEffect(() => {
    setDisplay(isoToDisplay(value));
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value;
    // Extraer solo dígitos de lo que escribe el usuario
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const masked = applyMask(digits);
    setDisplay(masked);

    const iso = displayToIso(masked);
    // Disparar onChange con evento sintético que porta el ISO
    if (onChange) {
      onChange({ target: { value: iso } });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Backspace') {
      // Al borrar, eliminar el último dígito (no las barras)
      const digits = display.replace(/\D/g, '');
      const newDigits = digits.slice(0, -1);
      const masked = applyMask(newDigits);
      setDisplay(masked);
      const iso = displayToIso(masked);
      if (onChange) onChange({ target: { value: iso } });
      e.preventDefault();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder || 'DD/MM/AAAA'}
      maxLength={10}
      autoComplete="off"
      style={style}
      {...props}
    />
  );
}
