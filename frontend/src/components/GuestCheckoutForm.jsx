import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import LocationSelector from './LocationSelector';

export default function GuestCheckoutForm({ onSubmit, onCancel, loading = false, submitLabel = 'Continuar al pago' }) {
  const [formData, setFormData] = useState({
    name: '',
    dni: '',
    phone: '',
    email: '',
    provincia: '',
    localidad: ''
  });
  const [errors, setErrors] = useState({});
  const [userExists, setUserExists] = useState(null);
  const [checkingUser, setCheckingUser] = useState(false);

  // Check if user exists when email or DNI changes
  useEffect(() => {
    const checkUser = async () => {
      // Only check if both email and DNI are filled
      if (!formData.email || !formData.dni) {
        setUserExists(null);
        return;
      }

      // Validate email format first
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        return;
      }

      // Validate DNI format first
      if (formData.dni.length < 7 || formData.dni.length > 8) {
        return;
      }

      setCheckingUser(true);
      try {
        const res = await apiFetch('/api/auth/check-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email: formData.email,
            dni: formData.dni
          })
        });
        const data = await res.json();
        
        if (data.exists) {
          setUserExists(data.user);
          // Autocompletar campos
          setFormData(prev => ({
            ...prev,
            name: data.user.name || prev.name,
            phone: data.user.phone || prev.phone,
            provincia: data.user.provincia || prev.provincia,
            localidad: data.user.localidad || prev.localidad
          }));
        } else {
          setUserExists(null);
        }
      } catch (err) {
        console.error('[GUEST_FORM] Error checking user:', err);
        setUserExists(null);
      } finally {
        setCheckingUser(false);
      }
    };

    // Debounce the check
    const timer = setTimeout(checkUser, 500);
    return () => clearTimeout(timer);
  }, [formData.email, formData.dni]);

  const validateForm = () => {
    const newErrors = {};

    // Nombre
    if (!formData.name || formData.name.trim().length < 3) {
      newErrors.name = 'El nombre debe tener al menos 3 caracteres';
    }

    // DNI
    if (!formData.dni) {
      newErrors.dni = 'El DNI es requerido';
    } else if (formData.dni.length < 7 || formData.dni.length > 8) {
      newErrors.dni = 'El DNI debe tener 7 u 8 dígitos';
    }

    // Teléfono
    if (!formData.phone) {
      newErrors.phone = 'El teléfono es requerido';
    } else if (formData.phone.length < 10) {
      newErrors.phone = 'El teléfono debe tener al menos 10 dígitos';
    }

    // Email
    if (!formData.email) {
      newErrors.email = 'El email es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'El email no es válido';
    }

    // Provincia y Localidad
    if (!formData.provincia) {
      newErrors.location = 'Debe seleccionar una provincia';
    } else if (!formData.localidad) {
      newErrors.location = 'Debe seleccionar una localidad';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const handleLocationChange = (location) => {
    setFormData({
      ...formData,
      provincia: location.provincia,
      localidad: location.localidad
    });
    // Clear location error when user selects
    if (errors.location) {
      setErrors({ ...errors, location: undefined });
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px',
      overflowY: 'auto'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        maxWidth: '600px',
        width: '100%',
        padding: '32px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '24px',
            fontWeight: '700',
            color: '#111827',
            marginBottom: '8px'
          }}>
            Completá tus datos
          </h2>
          <p style={{
            margin: 0,
            fontSize: '14px',
            color: '#6b7280'
          }}>
            Necesitamos esta información para enviarte tus entradas
          </p>
        </div>

        {/* User exists notification */}
        {userExists && (
          <div style={{
            padding: '16px',
            background: '#dbeafe',
            border: '2px solid #3b82f6',
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px'
            }}>
              <span style={{ fontSize: '20px' }}>ℹ️</span>
              <strong style={{ color: '#1e40af', fontSize: '15px' }}>
                Usuario registrado detectado
              </strong>
            </div>
            <p style={{
              margin: 0,
              fontSize: '14px',
              color: '#1e3a8a',
              lineHeight: '1.5'
            }}>
              Encontramos una cuenta con este email y DNI ({userExists.name}). 
              Tu compra se guardará automáticamente en tu perfil.
            </p>
          </div>
        )}

        {checkingUser && (
          <div style={{
            padding: '12px',
            background: '#f3f4f6',
            borderRadius: '8px',
            textAlign: 'center',
            fontSize: '14px',
            color: '#6b7280',
            marginBottom: '16px'
          }}>
            Verificando datos...
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '20px' }}>
          {/* Email - PRIMERO */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '600',
              color: '#374151',
              fontSize: '14px'
            }}>
              Email <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                if (errors.email) setErrors({ ...errors, email: undefined });
              }}
              disabled={loading}
              placeholder="Ej: juan@ejemplo.com"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `1px solid ${errors.email ? '#dc2626' : '#d1d5db'}`,
                background: loading ? '#f9fafb' : 'white',
                fontSize: '15px',
                color: '#111827'
              }}
            />
            {errors.email && (
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#dc2626' }}>
                {errors.email}
              </p>
            )}
          </div>

          {/* DNI - SEGUNDO */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '600',
              color: '#374151',
              fontSize: '14px'
            }}>
              DNI <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.dni}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '');
                setFormData({ ...formData, dni: value });
                if (errors.dni) setErrors({ ...errors, dni: undefined });
              }}
              disabled={loading}
              placeholder="Ej: 12345678"
              maxLength={8}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `1px solid ${errors.dni ? '#dc2626' : '#d1d5db'}`,
                background: loading ? '#f9fafb' : 'white',
                fontSize: '15px',
                color: '#111827'
              }}
            />
            {errors.dni && (
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#dc2626' }}>
                {errors.dni}
              </p>
            )}
          </div>

          {/* Nombre - TERCERO */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '600',
              color: '#374151',
              fontSize: '14px'
            }}>
              Nombre y apellido <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (errors.name) setErrors({ ...errors, name: undefined });
              }}
              disabled={loading || userExists}
              placeholder="Ej: Juan Pérez"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `1px solid ${errors.name ? '#dc2626' : '#d1d5db'}`,
                background: (loading || userExists) ? '#f9fafb' : 'white',
                fontSize: '15px',
                color: '#111827'
              }}
            />
            {errors.name && (
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#dc2626' }}>
                {errors.name}
              </p>
            )}
          </div>

          {/* Teléfono - CUARTO */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontWeight: '600',
              color: '#374151',
              fontSize: '14px'
            }}>
              Teléfono <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '');
                setFormData({ ...formData, phone: value });
                if (errors.phone) setErrors({ ...errors, phone: undefined });
              }}
              disabled={loading || userExists}
              placeholder="Ej: 2923456789"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `1px solid ${errors.phone ? '#dc2626' : '#d1d5db'}`,
                background: loading ? '#f9fafb' : 'white',
                fontSize: '15px',
                color: '#111827'
              }}
            />
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
              Código de área + número, sin espacios
            </p>
            {errors.phone && (
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#dc2626' }}>
                {errors.phone}
              </p>
            )}
          </div>

          {/* Location Selector - QUINTO */}
          <div>
            <LocationSelector
              value={{ provincia: formData.provincia, localidad: formData.localidad }}
              onChange={handleLocationChange}
              required={true}
              disabled={loading || userExists}
            />
            {errors.location && (
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#dc2626' }}>
                {errors.location}
              </p>
            )}
          </div>

          {/* Buttons */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            marginTop: '8px'
          }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px 24px',
                background: loading ? '#9ca3af' : 'linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                boxShadow: loading ? 'none' : '0 4px 12px rgba(13, 110, 253, 0.3)'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(13, 110, 253, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(13, 110, 253, 0.3)';
                }
              }}
            >
              {loading ? 'Procesando...' : submitLabel}
            </button>

            {!loading && (
              <button
                type="button"
                onClick={onCancel}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: 'white',
                  color: '#374151',
                  border: '2px solid #e5e7eb',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#9ca3af';
                  e.currentTarget.style.background = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.background = 'white';
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
