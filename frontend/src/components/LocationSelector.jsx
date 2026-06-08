import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

export default function LocationSelector({ value, onChange, required = false, disabled = false }) {
  const [provinces, setProvinces] = useState([]);
  const [localities, setLocalities] = useState([]);
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingLocalities, setLoadingLocalities] = useState(false);
  const [error, setError] = useState('');

  // Load provinces on mount
  useEffect(() => {
    loadProvinces();
  }, []);

  // Load localities when province changes
  useEffect(() => {
    if (value?.provincia) {
      loadLocalities(value.provincia);
    } else {
      setLocalities([]);
    }
  }, [value?.provincia]);

  const loadProvinces = async () => {
    try {
      setLoadingProvinces(true);
      setError('');
      const response = await apiFetch('/api/locations/provinces');
      const data = await response.json();
      setProvinces(data.provinces || []);
    } catch (err) {
      console.error('Error loading provinces:', err);
      setError('Error al cargar provincias');
    } finally {
      setLoadingProvinces(false);
    }
  };

  const loadLocalities = async (provincia) => {
    try {
      setLoadingLocalities(true);
      setError('');
      const response = await apiFetch(`/api/locations/localities/${encodeURIComponent(provincia)}`);
      const data = await response.json();
      setLocalities(data.localidades || []);
    } catch (err) {
      console.error('Error loading localities:', err);
      setError('Error al cargar localidades');
      setLocalities([]);
    } finally {
      setLoadingLocalities(false);
    }
  };

  const handleProvinciaChange = (e) => {
    const newProvincia = e.target.value;
    onChange({
      provincia: newProvincia,
      localidad: '' // Reset localidad when provincia changes
    });
  };

  const handleLocalidadChange = (e) => {
    onChange({
      ...value,
      localidad: e.target.value
    });
  };

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* Provincia Select */}
      <div>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontWeight: '600',
          color: '#374151',
          fontSize: '14px'
        }}>
          Provincia {required && <span style={{ color: '#dc2626' }}>*</span>}
        </label>
        <select
          value={value?.provincia || ''}
          onChange={handleProvinciaChange}
          disabled={disabled || loadingProvinces}
          required={required}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            background: disabled ? '#f9fafb' : 'white',
            fontSize: '15px',
            color: '#111827',
            cursor: disabled ? 'not-allowed' : 'pointer',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23374151' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            paddingRight: '36px'
          }}
        >
          <option value="">
            {loadingProvinces ? 'Cargando...' : 'Seleccionar provincia'}
          </option>
          {provinces.map(provincia => (
            <option key={provincia} value={provincia}>
              {provincia}
            </option>
          ))}
        </select>
      </div>

      {/* Localidad Select */}
      <div>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontWeight: '600',
          color: '#374151',
          fontSize: '14px'
        }}>
          Localidad {required && <span style={{ color: '#dc2626' }}>*</span>}
        </label>
        <select
          value={value?.localidad || ''}
          onChange={handleLocalidadChange}
          disabled={disabled || !value?.provincia || loadingLocalities}
          required={required}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            background: (disabled || !value?.provincia) ? '#f9fafb' : 'white',
            fontSize: '15px',
            color: '#111827',
            cursor: (disabled || !value?.provincia) ? 'not-allowed' : 'pointer',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23374151' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            paddingRight: '36px'
          }}
        >
          <option value="">
            {!value?.provincia 
              ? 'Primero seleccionar provincia' 
              : loadingLocalities 
                ? 'Cargando...' 
                : 'Seleccionar localidad'}
          </option>
          {localities.map(localidad => (
            <option key={localidad} value={localidad}>
              {localidad}
            </option>
          ))}
        </select>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '12px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#dc2626',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
