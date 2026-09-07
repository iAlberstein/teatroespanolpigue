import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LocationSelector from '../components/LocationSelector';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dni, setDni] = useState('');
  const [location, setLocation] = useState({ provincia: '', localidad: '' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  // Refs para scroll al primer error
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const dniRef = useRef(null);
  const locationRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);

  const validateForm = () => {
    const errors = {};
    
    if (!name.trim()) {
      errors.name = 'El nombre es obligatorio';
    }
    
    if (!email.trim()) {
      errors.email = 'El email es obligatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Ingresá un email válido';
    }
    
    if (!dni || dni.length < 7) {
      errors.dni = 'El DNI es obligatorio (7-8 dígitos)';
    }

    if (!location.provincia) {
      errors.location = 'Debe seleccionar una provincia';
    } else if (!location.localidad) {
      errors.location = 'Debe seleccionar una localidad';
    }

    if (!password) {
      errors.password = 'La contraseña es obligatoria';
    } else if (password.length < 6) {
      errors.password = 'Mínimo 6 caracteres';
    }
    
    if (!confirmPassword) {
      errors.confirmPassword = 'Confirmá tu contraseña';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Las contraseñas no coinciden';
    }
    
    return errors;
  };

  const scrollToFirstError = (errors) => {
    const fieldOrder = ['name', 'email', 'dni', 'location', 'password', 'confirmPassword'];
    const refs = { name: nameRef, email: emailRef, dni: dniRef, location: locationRef, password: passwordRef, confirmPassword: confirmPasswordRef };

    for (const field of fieldOrder) {
      if (errors[field] && refs[field]?.current) {
        refs[field].current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (refs[field].current.focus) {
          refs[field].current.focus();
        }
        break;
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setServerError('');

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      scrollToFirstError(errors);
      return;
    }

    setLoading(true);
    const result = await register(name, email, password, phone, dni, location.provincia, location.localidad);

    if (result.success) {
      const returnTo = localStorage.getItem('returnTo');
      if (returnTo) {
        localStorage.removeItem('returnTo');
        navigate(returnTo);
      } else {
        navigate('/');
      }
    } else {
      if (result.error === 'email_exists') {
        setFieldErrors({ email: 'Ya existe una cuenta con este email' });
        setServerError('¿Querés iniciar sesión o recuperar tu contraseña?');
        emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (result.error === 'dni_exists') {
        setFieldErrors({ dni: 'Ya existe una cuenta con este DNI' });
        setServerError('¿Querés iniciar sesión o recuperar tu contraseña?');
        dniRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setServerError(result.error || 'Error al registrarse');
      }
    }

    setLoading(false);
  };

  const errorStyle = { color: '#dc2626', fontSize: 12, marginTop: 4 };
  const inputErrorStyle = { border: '1px solid #dc2626' };
  const requiredMark = <span style={{ color: '#dc2626' }}>*</span>;

  return (
    <div style={{ maxWidth: 400, margin: '60px auto', padding: 24 }}>
      <h1>Crear Cuenta</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {serverError && (
          <div style={{ padding: 12, background: '#fee', border: '1px solid #fcc', borderRadius: 4, color: '#c00' }}>
            <div>{serverError}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <Link to="/login" style={{ color: '#007bff', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
                Iniciar sesión
              </Link>
              <span style={{ color: '#999' }}>|</span>
              <Link to="/recuperar-contrasena" style={{ color: '#007bff', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
                Recuperar contraseña
              </Link>
            </div>
          </div>
        )}

        <div ref={nameRef}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Nombre completo {requiredMark}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setFieldErrors(prev => ({ ...prev, name: '' })); }}
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, ...(fieldErrors.name ? inputErrorStyle : {}) }}
          />
          {fieldErrors.name && <div style={errorStyle}>{fieldErrors.name}</div>}
        </div>

        <div ref={emailRef}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Email {requiredMark}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: '' })); }}
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, ...(fieldErrors.email ? inputErrorStyle : {}) }}
          />
          {fieldErrors.email && <div style={errorStyle}>{fieldErrors.email}</div>}
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Teléfono (opcional)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej: 2923456789"
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
          />
          <small style={{ color: '#666', fontSize: 12 }}>Código de área + número, sin espacios</small>
        </div>

        <div ref={dniRef}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>DNI {requiredMark}</label>
          <input
            type="text"
            value={dni}
            onChange={(e) => { setDni(e.target.value.replace(/\D/g, '')); setFieldErrors(prev => ({ ...prev, dni: '' })); }}
            placeholder="Ej: 12345678"
            maxLength={8}
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, ...(fieldErrors.dni ? inputErrorStyle : {}) }}
          />
          {fieldErrors.dni && <div style={errorStyle}>{fieldErrors.dni}</div>}
          {!fieldErrors.dni && <small style={{ color: '#666', fontSize: 12 }}>Solo números, sin puntos</small>}
        </div>

        <div ref={locationRef}>
          <LocationSelector
            value={location}
            onChange={(loc) => {
              setLocation(loc);
              setFieldErrors(prev => ({ ...prev, location: '' }));
            }}
            required={true}
            disabled={loading}
          />
          {fieldErrors.location && <div style={errorStyle}>{fieldErrors.location}</div>}
        </div>

        <div ref={passwordRef}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Contraseña {requiredMark}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: '' })); }}
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, ...(fieldErrors.password ? inputErrorStyle : {}) }}
          />
          {fieldErrors.password && <div style={errorStyle}>{fieldErrors.password}</div>}
        </div>

        <div ref={confirmPasswordRef}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Confirmar contraseña {requiredMark}</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors(prev => ({ ...prev, confirmPassword: '' })); }}
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, ...(fieldErrors.confirmPassword ? inputErrorStyle : {}) }}
          />
          {fieldErrors.confirmPassword && <div style={errorStyle}>{fieldErrors.confirmPassword}</div>}
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            background: '#000000',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Creando cuenta...' : 'Registrarse'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <span style={{ color: '#666' }}>¿Ya tenés cuenta? </span>
          <Link to="/login" style={{ color: '#007bff', textDecoration: 'none', fontWeight: 600 }}>
            Iniciá sesión
          </Link>
        </div>
      </form>
    </div>
  );
}
