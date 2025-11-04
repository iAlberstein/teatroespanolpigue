import { useState, useEffect } from 'react';

/**
 * Form to create or edit a show with pricing
 */
export default function ShowForm({ show, onSave, onCancel }) {
  const isEditing = !!show?.id;

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration_minutes: 120,
    platea_general: 5000,
    palcos_bajos: 10000,
    palcos_altos: 8000,
    pullman: 3000,
    image_url: ''
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (show) {
      setFormData({
        title: show.title || '',
        description: show.description || '',
        duration_minutes: show.duration_minutes || 120,
        platea_general: show.pricing_json?.platea_general || 5000,
        palcos_bajos: show.pricing_json?.palcos_bajos || 10000,
        palcos_altos: show.pricing_json?.palcos_altos || 8000,
        pullman: show.pricing_json?.pullman || 3000,
        image_url: show.image_url || ''
      });
    }
  }, [show]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'El título es obligatorio';
    }
    
    if (formData.duration_minutes <= 0) {
      newErrors.duration_minutes = 'La duración debe ser mayor a 0';
    }
    
    if (formData.platea_general < 0) {
      newErrors.platea_general = 'El precio no puede ser negativo';
    }
    
    if (formData.palcos_bajos < 0) {
      newErrors.palcos_bajos = 'El precio no puede ser negativo';
    }
    
    if (formData.palcos_altos < 0) {
      newErrors.palcos_altos = 'El precio no puede ser negativo';
    }
    
    if (formData.pullman < 0) {
      newErrors.pullman = 'El precio no puede ser negativo';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      duration_minutes: Number(formData.duration_minutes),
      pricing_json: {
        platea_general: Number(formData.platea_general),
        palcos_bajos: Number(formData.palcos_bajos),
        palcos_altos: Number(formData.palcos_altos),
        pullman: Number(formData.pullman)
      },
      image_url: formData.image_url.trim() || null
    };

    onSave(payload);
  };

  return (
    <div style={{
      padding: 24,
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: 8
    }}>
      <h2 style={{ marginTop: 0 }}>
        {isEditing ? 'Editar Espectáculo' : 'Crear Espectáculo'}
      </h2>

      <form onSubmit={handleSubmit}>
        {/* Información básica */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, marginBottom: 16 }}>Información Básica</h3>
          
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
              Título *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 4,
                border: errors.title ? '1px solid #dc3545' : '1px solid #ccc'
              }}
            />
            {errors.title && <span style={{ color: '#dc3545', fontSize: 12 }}>{errors.title}</span>}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
              Descripción
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={4}
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 4,
                border: '1px solid #ccc',
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
              Duración (minutos) *
            </label>
            <input
              type="number"
              value={formData.duration_minutes}
              onChange={(e) => handleChange('duration_minutes', e.target.value)}
              style={{
                width: '200px',
                padding: 8,
                borderRadius: 4,
                border: errors.duration_minutes ? '1px solid #dc3545' : '1px solid #ccc'
              }}
            />
            {errors.duration_minutes && <span style={{ color: '#dc3545', fontSize: 12 }}>{errors.duration_minutes}</span>}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
              URL de imagen
            </label>
            <input
              type="url"
              value={formData.image_url}
              onChange={(e) => handleChange('image_url', e.target.value)}
              placeholder="https://ejemplo.com/imagen.jpg"
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 4,
                border: '1px solid #ccc'
              }}
            />
          </div>
        </div>

        {/* Precios */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, marginBottom: 16 }}>Precios por Sección</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Platea General ($)
              </label>
              <input
                type="number"
                value={formData.platea_general}
                onChange={(e) => handleChange('platea_general', e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 4,
                  border: errors.platea_general ? '1px solid #dc3545' : '1px solid #ccc'
                }}
              />
              {errors.platea_general && <span style={{ color: '#dc3545', fontSize: 12 }}>{errors.platea_general}</span>}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Palcos Bajos ($)
              </label>
              <input
                type="number"
                value={formData.palcos_bajos}
                onChange={(e) => handleChange('palcos_bajos', e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 4,
                  border: errors.palcos_bajos ? '1px solid #dc3545' : '1px solid #ccc'
                }}
              />
              {errors.palcos_bajos && <span style={{ color: '#dc3545', fontSize: 12 }}>{errors.palcos_bajos}</span>}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Palcos Altos ($)
              </label>
              <input
                type="number"
                value={formData.palcos_altos}
                onChange={(e) => handleChange('palcos_altos', e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 4,
                  border: errors.palcos_altos ? '1px solid #dc3545' : '1px solid #ccc'
                }}
              />
              {errors.palcos_altos && <span style={{ color: '#dc3545', fontSize: 12 }}>{errors.palcos_altos}</span>}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Pullman ($)
              </label>
              <input
                type="number"
                value={formData.pullman}
                onChange={(e) => handleChange('pullman', e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 4,
                  border: errors.pullman ? '1px solid #dc3545' : '1px solid #ccc'
                }}
              />
              {errors.pullman && <span style={{ color: '#dc3545', fontSize: 12 }}>{errors.pullman}</span>}
            </div>
          </div>
        </div>

        {/* Info sobre sesiones */}
        <div style={{ 
          marginBottom: 24,
          padding: 16,
          background: '#e7f3ff',
          borderRadius: 6,
          border: '1px solid #2196f3'
        }}>
          <p style={{ margin: 0, fontSize: 14, color: '#0d47a1' }}>
            💡 <strong>Los precios aquí definidos son valores por defecto.</strong> Después de crear el espectáculo, podés gestionar las sesiones (funciones) individuales y configurar precios específicos para cada función si es necesario.
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '10px 24px',
              background: '#6c757d',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 16,
              cursor: 'pointer'
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            style={{
              padding: '10px 24px',
              background: '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {isEditing ? 'Guardar Cambios' : 'Crear Espectáculo'}
          </button>
        </div>
      </form>
    </div>
  );
}
