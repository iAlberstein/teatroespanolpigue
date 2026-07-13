import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiAuthFetch } from '../../lib/api';
import { resolveMediaUrl } from '../../lib/media';

/**
 * Form to create or edit a show with pricing
 */
export default function ShowForm({ show, onSave, onCancel }) {
  const { token } = useAuth();
  const isEditing = !!show?.id;
  const fileInputsRef = useRef({});

  const IMAGE_SLOT_CONFIG = [
    {
      key: 'image_principal_web',
      slot: 'principal_web',
      label: 'Imagen principal - Web',
      size: '1080 x 375 px',
      hint: 'Hero del home en desktop (panorámica).'
    },
    {
      key: 'image_secundaria_web',
      slot: 'secundaria_web',
      label: 'Imagen secundaria (Web + Mobile)',
      size: '144 x 70 px',
      hint: 'Miniaturas del carrusel (se reutiliza en mobile).'
    },
    {
      key: 'image_principal_mobile',
      slot: 'principal_mobile',
      label: 'Imagen principal - Mobile',
      size: '1350 x 1080 px',
      hint: 'Hero en dispositivos móviles (vertical).'
    }
  ];

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration_minutes: 120,
    venue_type: 'sala_principal',
    general_capacity: '',
    general_price: '',
    platea_general: '',
    palcos_bajos: '',
    palcos_altos: '',
    pullman: '',
    image_url: '',
    image_principal_web: '',
    image_secundaria_web: '',
    image_principal_mobile: '',
    producer_ids: [],
    is_visible: true,
    external_sale: false,
    external_sale_link: '',
    palcos_individual_seats: false,
    pack_enabled: false,
    pack_max_sessions: 3,
    pack_pricing_json: {}
  });

  const [errors, setErrors] = useState({});
  const [producers, setProducers] = useState([]);
  const [producerSearch, setProducerSearch] = useState('');
  const [services, setServices] = useState([]);
  const [newService, setNewService] = useState({ name: '', description: '', price: '', include_in_bordereaux: false });
  const [editingService, setEditingService] = useState(null);
  const [savingService, setSavingService] = useState(false);
  const [serviceError, setServiceError] = useState('');
  const [imagePreviews, setImagePreviews] = useState({
    image_principal_web: '',
    image_secundaria_web: '',
    image_principal_mobile: ''
  });
  const [uploadingSlots, setUploadingSlots] = useState({});

  useEffect(() => {
    loadProducers();
  }, []);

  useEffect(() => {
    if (show?.id) {
      loadServices(show.id);
    }
  }, [show?.id]);

  const loadServices = async (showId) => {
    try {
      const res = await apiAuthFetch(`/api/shows/${showId}/services`, { method: 'GET' }, token);
      if (res.ok) {
        const data = await res.json();
        setServices(data);
      }
    } catch (err) {
      console.error('Error loading services:', err);
    }
  };

  const handleAddService = async () => {
    if (!show?.id) return;
    if (!newService.name.trim()) { setServiceError('El nombre es requerido'); return; }
    if (!newService.price || isNaN(Number(newService.price))) { setServiceError('El precio es requerido'); return; }
    setSavingService(true);
    setServiceError('');
    try {
      const res = await apiAuthFetch(`/api/shows/${show.id}/services`, {
        method: 'POST',
        body: JSON.stringify({ name: newService.name.trim(), description: newService.description.trim(), price: Number(newService.price), include_in_bordereaux: newService.include_in_bordereaux })
      }, token);
      if (res.ok) {
        const created = await res.json();
        setServices(prev => [...prev, created]);
        setNewService({ name: '', description: '', price: '', include_in_bordereaux: false });
      } else {
        const err = await res.json();
        setServiceError(err.message || 'Error al crear servicio');
      }
    } catch (err) {
      setServiceError('Error al crear servicio');
    } finally {
      setSavingService(false);
    }
  };

  const handleDeleteService = async (serviceId) => {
    if (!show?.id) return;
    try {
      const res = await apiAuthFetch(`/api/shows/${show.id}/services/${serviceId}`, { method: 'DELETE' }, token);
      if (res.ok) {
        setServices(prev => prev.filter(s => s.id !== serviceId));
      }
    } catch (err) {
      console.error('Error deleting service:', err);
    }
  };

  const handleEditService = (service) => {
    setEditingService(service);
    setNewService({
      name: service.name,
      description: service.description || '',
      price: service.price,
      include_in_bordereaux: service.include_in_bordereaux || false
    });
  };

  const handleUpdateService = async () => {
    if (!show?.id || !editingService) return;
    if (!newService.name.trim()) { setServiceError('El nombre es requerido'); return; }
    if (!newService.price || isNaN(Number(newService.price))) { setServiceError('El precio es requerido'); return; }
    setSavingService(true);
    setServiceError('');
    try {
      const res = await apiAuthFetch(`/api/shows/${show.id}/services/${editingService.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newService.name.trim(), description: newService.description.trim(), price: Number(newService.price), include_in_bordereaux: newService.include_in_bordereaux })
      }, token);
      if (res.ok) {
        const updated = await res.json();
        setServices(prev => prev.map(s => s.id === updated.id ? updated : s));
        setNewService({ name: '', description: '', price: '', include_in_bordereaux: false });
        setEditingService(null);
      } else {
        const err = await res.json();
        setServiceError(err.message || 'Error al actualizar servicio');
      }
    } catch (err) {
      setServiceError('Error al actualizar servicio');
    } finally {
      setSavingService(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingService(null);
    setNewService({ name: '', description: '', price: '', include_in_bordereaux: false });
    setServiceError('');
  };

  useEffect(() => {
    if (show) {
      const pricing =
        typeof show.pricing_json === 'string'
          ? (() => {
              try {
                return JSON.parse(show.pricing_json);
              } catch {
                return {};
              }
            })()
          : show.pricing_json || {};

      const principalWeb = show.image_principal_web || show.image_url || '';
      const secundariaWeb = show.image_secundaria_web || '';
      const principalMobile = show.image_principal_mobile || principalWeb || '';

      const packPricing = typeof show.pack_pricing_json === 'string'
        ? (() => { try { return JSON.parse(show.pack_pricing_json); } catch { return {}; } })()
        : show.pack_pricing_json || {};

      setFormData({
        title: show.title || '',
        description: show.description || '',
        duration_minutes: show.duration_minutes || 120,
        venue_type: show.venue_type || 'sala_principal',
        general_capacity: show.general_capacity || '',
        general_price: pricing?.general || '',
        platea_general: pricing?.platea_general || '',
        palcos_bajos: pricing?.palcos_bajos || '',
        palcos_altos: pricing?.palcos_altos || '',
        pullman: pricing?.pullman || '',
        image_url: show.image_url || '',
        image_principal_web: principalWeb,
        image_secundaria_web: secundariaWeb,
        image_principal_mobile: principalMobile,
        producer_ids: show.producers?.map((p) => p.id) || [],
        is_visible: show.is_visible !== undefined ? show.is_visible : true,
        external_sale: show.external_sale || false,
        external_sale_link: show.external_sale_link || '',
        palcos_individual_seats: show.palcos_individual_seats || false,
        pack_enabled: show.pack_enabled || false,
        pack_max_sessions: show.pack_max_sessions || 3,
        pack_pricing_json: packPricing
      });

      setImagePreviews({
        image_principal_web: principalWeb,
        image_secundaria_web: secundariaWeb,
        image_principal_mobile: principalMobile
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        image_url: '',
        image_principal_web: '',
        image_secundaria_web: '',
        image_principal_mobile: '',
        producer_ids: []
      }));
      setImagePreviews({
        image_principal_web: '',
        image_secundaria_web: '',
        image_principal_mobile: ''
      });
    }
  }, [show]);

  const loadProducers = async () => {
    try {
      const res = await apiAuthFetch('/api/producers', { method: 'GET' }, token);
      if (res.ok) {
        const data = await res.json();
        console.log('Producers loaded:', data.producers);
        setProducers(data.producers || []);
      } else {
        console.error('Error response:', await res.text());
      }
    } catch (err) {
      console.error('Error loading producers:', err);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const getPackSections = () => {
    if (formData.venue_type === 'sala_principal') {
      return ['platea_general', 'palcos_bajos', 'palcos_altos', 'pullman'];
    }
    return ['general'];
  };

  const getSectionLabel = (section) => {
    const labels = {
      platea_general: 'Platea General',
      palcos_bajos: 'Palcos Bajos',
      palcos_altos: 'Palcos Altos',
      pullman: 'Pullman',
      general: 'Entrada General'
    };
    return labels[section] || section;
  };

  const buildDefaultPackPricing = () => {
    const sections = getPackSections();
    const pricing = {};
    const basePrices = {
      platea_general: Number(formData.platea_general) || 0,
      palcos_bajos: Number(formData.palcos_bajos) || 0,
      palcos_altos: Number(formData.palcos_altos) || 0,
      pullman: Number(formData.pullman) || 0,
      general: Number(formData.general_price) || 0
    };
    for (let depth = 1; depth <= Number(formData.pack_max_sessions); depth++) {
      const tier = {};
      for (const section of sections) {
        // Default: same as base price (no discount); admin can adjust
        tier[section] = basePrices[section];
      }
      pricing[depth] = tier;
    }
    return pricing;
  };

  const handlePackToggle = (enabled) => {
    setFormData(prev => {
      const next = { ...prev, pack_enabled: enabled };
      if (enabled && Object.keys(prev.pack_pricing_json || {}).length === 0) {
        next.pack_pricing_json = buildDefaultPackPricing();
      }
      return next;
    });
  };

  const handlePackMaxSessionsChange = (value) => {
    const max = Math.max(2, Math.min(10, Number(value) || 2));
    setFormData(prev => {
      const current = prev.pack_pricing_json || {};
      const nextPricing = {};
      const sections = getPackSections();
      const basePrices = {
        platea_general: Number(formData.platea_general) || 0,
        palcos_bajos: Number(formData.palcos_bajos) || 0,
        palcos_altos: Number(formData.palcos_altos) || 0,
        pullman: Number(formData.pullman) || 0,
        general: Number(formData.general_price) || 0
      };
      for (let depth = 1; depth <= max; depth++) {
        nextPricing[depth] = current[depth] || current[String(depth)] || {};
        for (const section of sections) {
          if (nextPricing[depth][section] === undefined || nextPricing[depth][section] === '') {
            nextPricing[depth][section] = basePrices[section];
          }
        }
      }
      return { ...prev, pack_max_sessions: max, pack_pricing_json: nextPricing };
    });
  };

  const handlePackPriceChange = (depth, section, value) => {
    setFormData(prev => {
      const pricing = { ...prev.pack_pricing_json };
      if (!pricing[depth]) pricing[depth] = {};
      pricing[depth] = { ...pricing[depth], [section]: value === '' ? '' : Number(value) };
      return { ...prev, pack_pricing_json: pricing };
    });
  };

  const getPreviewUrl = (value) => resolveMediaUrl(value) || '';

  const uploadImageForSlot = async (slotConfig, file) => {
    if (!file) return;
    setUploadingSlots((prev) => ({ ...prev, [slotConfig.key]: true }));
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('image', file);
      formDataUpload.append('slot', slotConfig.slot);

      const res = await apiAuthFetch(
        '/api/shows/upload-image',
        {
          method: 'POST',
          body: formDataUpload
        },
        token
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Error desconocido' }));
        throw new Error(errorData.message || 'No se pudo subir la imagen');
      }

      const data = await res.json();
      setFormData((prev) => ({
        ...prev,
        [slotConfig.key]: data.image_url
      }));
      setImagePreviews((prev) => ({
        ...prev,
        [slotConfig.key]: data.image_url
      }));
    } catch (err) {
      console.error('[UPLOAD] Error uploading image:', err);
      alert(`Error al subir ${slotConfig.label}: ${err.message}`);
    } finally {
      setUploadingSlots((prev) => ({ ...prev, [slotConfig.key]: false }));
    }
  };

  const handleSlotFileChange = (slotConfig, event) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadImageForSlot(slotConfig, file);
    }
  };

  const handleSlotDrop = (slotConfig, event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      uploadImageForSlot(slotConfig, file);
    }
  };

  const triggerFileDialog = (slotKey) => {
    const input = fileInputsRef.current[slotKey];
    if (input) {
      input.value = '';
      input.click();
    }
  };

  const renderImageSlot = (slotConfig) => {
    const preview = imagePreviews[slotConfig.key];
    const isUploading = uploadingSlots[slotConfig.key];
    return (
      <div
        key={slotConfig.key}
        style={{
          border: '1px solid #ddd',
          borderRadius: 12,
          padding: 16,
          background: '#fafafa',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>{slotConfig.label}</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#555' }}>
              Tamaño recomendado: {slotConfig.size}. {slotConfig.hint}
            </p>
          </div>
          <button
            type="button"
            onClick={() => triggerFileDialog(slotConfig.key)}
            style={{
              padding: '8px 16px',
              background: '#0d6efd',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            {preview ? 'Reemplazar' : 'Subir'}
          </button>
        </div>

        <div
          onDrop={(e) => handleSlotDrop(slotConfig, e)}
          onDragOver={(e) => e.preventDefault()}
          style={{
            border: errors[slotConfig.key] ? '2px dashed #dc3545' : '2px dashed #ccc',
            borderRadius: 10,
            padding: 16,
            minHeight: 140,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fff',
            position: 'relative'
          }}
        >
          {preview ? (
            <img
              src={getPreviewUrl(preview)}
              alt={slotConfig.label}
              style={{
                maxWidth: '100%',
                maxHeight: 160,
                objectFit: 'cover',
                borderRadius: 8
              }}
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#777', fontSize: 14 }}>
              Arrastrá una imagen aquí o hacé click en “Subir”
            </div>
          )}
          {isUploading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255,255,255,0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                color: '#0d6efd'
              }}
            >
              Subiendo...
            </div>
          )}
        </div>
        {errors[slotConfig.key] && (
          <span style={{ color: '#dc3545', fontSize: 12 }}>{errors[slotConfig.key]}</span>
        )}
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          ref={(el) => {
            fileInputsRef.current[slotConfig.key] = el;
          }}
          onChange={(e) => handleSlotFileChange(slotConfig, e)}
        />
      </div>
    );
  };

  const validate = () => {
    const newErrors = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'El título es obligatorio';
    }
    
    if (formData.duration_minutes <= 0) {
      newErrors.duration_minutes = 'La duración debe ser mayor a 0';
    }

    if (!formData.image_principal_web) {
      newErrors.image_principal_web = 'Subí la imagen principal para web.';
    }

    if (!formData.image_secundaria_web) {
      newErrors.image_secundaria_web = 'Subí la imagen secundaria (miniatura).';
    }

    if (!formData.image_principal_mobile) {
      newErrors.image_principal_mobile = 'Subí la imagen principal para mobile.';
    }
    
    // Validaciones para venta externa
    if (formData.external_sale) {
      if (!formData.external_sale_link || !formData.external_sale_link.trim()) {
        newErrors.external_sale_link = 'El link de venta es obligatorio cuando se usa venta por terceros';
      } else {
        // Validar que sea una URL válida
        try {
          new URL(formData.external_sale_link);
        } catch {
          newErrors.external_sale_link = 'Ingresá una URL válida (ej: https://ejemplo.com/entradas)';
        }
      }
    } else {
      // Validaciones según tipo de sala (solo si no es venta externa)
      if (formData.venue_type === 'sala_principal') {
        if (!formData.platea_general || formData.platea_general <= 0) {
          newErrors.platea_general = 'El precio de platea es obligatorio y debe ser mayor a 0';
        }
        
        if (!formData.palcos_bajos || formData.palcos_bajos <= 0) {
          newErrors.palcos_bajos = 'El precio de palcos bajos es obligatorio y debe ser mayor a 0';
        }
        
        if (!formData.palcos_altos || formData.palcos_altos <= 0) {
          newErrors.palcos_altos = 'El precio de palcos altos es obligatorio y debe ser mayor a 0';
        }
        
        if (!formData.pullman || formData.pullman <= 0) {
          newErrors.pullman = 'El precio de pullman es obligatorio y debe ser mayor a 0';
        }
      } else {
        // Salas con entradas generales
        if (!formData.general_capacity || formData.general_capacity <= 0) {
          newErrors.general_capacity = 'La capacidad es obligatoria y debe ser mayor a 0';
        }
        
        if (!formData.general_price || formData.general_price <= 0) {
          newErrors.general_price = 'El precio de entrada es obligatorio y debe ser mayor a 0';
        }
      }
    }

    // Validaciones para pack multi-función
    if (!formData.external_sale && formData.pack_enabled) {
      const maxSessions = Number(formData.pack_max_sessions) || 3;
      if (maxSessions < 2) {
        newErrors.pack_max_sessions = 'El pack debe permitir al menos 2 funciones';
      }
      const sections = formData.venue_type === 'sala_principal'
        ? ['platea_general', 'palcos_bajos', 'palcos_altos', 'pullman']
        : ['general'];
      const pricing = formData.pack_pricing_json || {};
      for (let depth = 1; depth <= maxSessions; depth++) {
        const tier = pricing[depth] || pricing[String(depth)];
        if (!tier) {
          newErrors[`pack_pricing_${depth}`] = `Faltan precios para el nivel ${depth}`;
          continue;
        }
        for (const section of sections) {
          const price = tier[section];
          if (price === undefined || price === '' || Number(price) <= 0) {
            newErrors[`pack_pricing_${depth}_${section}`] = `Precio inválido para ${getSectionLabel(section)} en nivel ${depth}`;
          }
        }
      }
      // Monotonía: comprar más funciones no debe aumentar el precio por entrada
      for (const section of sections) {
        let previous = null;
        for (let depth = 1; depth <= maxSessions; depth++) {
          const tier = pricing[depth] || pricing[String(depth)];
          if (!tier) continue;
          const price = Number(tier[section]);
          if (previous !== null && price > previous) {
            newErrors[`pack_pricing_monotonic_${section}`] = `El precio de ${getSectionLabel(section)} no puede aumentar al comprar más funciones`;
          }
          previous = price;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      duration_minutes: Number(formData.duration_minutes),
      venue_type: formData.venue_type,
      general_capacity: formData.venue_type !== 'sala_principal' && !formData.external_sale ? Number(formData.general_capacity) : null,
      pricing_json: formData.external_sale ? {} : (formData.venue_type === 'sala_principal' ? {
        platea_general: Number(formData.platea_general),
        palcos_bajos: Number(formData.palcos_bajos),
        palcos_altos: Number(formData.palcos_altos),
        pullman: Number(formData.pullman)
      } : {
        general: Number(formData.general_price)
      }),
      image_url: formData.image_principal_web || formData.image_url || null,
      image_principal_web: formData.image_principal_web || formData.image_url || null,
      image_secundaria_web: formData.image_secundaria_web || null,
      image_principal_mobile: formData.image_principal_mobile || formData.image_principal_web || null,
      producer_ids: formData.external_sale ? [] : formData.producer_ids,
      is_visible: formData.is_visible,
      external_sale: formData.external_sale,
      external_sale_link: formData.external_sale ? formData.external_sale_link.trim() : null,
      palcos_individual_seats: formData.palcos_individual_seats,
      pack_enabled: formData.pack_enabled,
      pack_max_sessions: formData.pack_enabled ? Number(formData.pack_max_sessions) : 3,
      pack_pricing_json: formData.pack_enabled ? formData.pack_pricing_json : null
    };

    console.log('Saving show with producers:', payload.producer_ids);
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

          {/* Toggle de Visibilidad */}
          <div style={{ 
            marginBottom: 16, 
            padding: 16, 
            background: formData.is_visible ? '#d1fae5' : '#fef3c7',
            borderRadius: 8,
            border: `1px solid ${formData.is_visible ? '#a7f3d0' : '#fde68a'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: 15, color: formData.is_visible ? '#065f46' : '#92400e' }}>
                  {formData.is_visible ? '👁️ Visible para todos' : '🔒 Solo visible para admins'}
                </label>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: formData.is_visible ? '#059669' : '#b45309' }}>
                  {formData.is_visible 
                    ? 'Este espectáculo aparece en el Home y la Agenda para todos los usuarios' 
                    : 'Este espectáculo solo es visible desde el panel de administración'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleChange('is_visible', !formData.is_visible)}
                style={{
                  width: 56,
                  height: 28,
                  borderRadius: 14,
                  border: 'none',
                  background: formData.is_visible ? '#10b981' : '#d1d5db',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.3s ease'
                }}
              >
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: 3,
                  left: formData.is_visible ? 31 : 3,
                  transition: 'left 0.3s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                }} />
              </button>
            </div>
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
              Tipo de Sala *
            </label>
            <select
              value={formData.venue_type}
              onChange={(e) => handleChange('venue_type', e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 4,
                border: '1px solid #ccc',
                fontSize: 14
              }}
            >
              <option value="sala_principal">Sala Principal (asientos numerados)</option>
              <option value="el_tablado">Sala El Tablado (entradas generales)</option>
              <option value="las_gemelas">Nueva sala (entradas generales)</option>
            </select>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#666' }}>
              {formData.venue_type === 'sala_principal' 
                ? 'Los espectadores seleccionarán sus asientos en el mapa de la sala'
                : 'Las entradas no tienen asientos asignados, solo capacidad total'}
            </p>
          </div>

          {formData.venue_type !== 'sala_principal' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Capacidad Total *
              </label>
              <input
                type="number"
                value={formData.general_capacity}
                onChange={(e) => handleChange('general_capacity', e.target.value)}
                placeholder="Ej: 100"
                style={{
                  width: '200px',
                  padding: 8,
                  borderRadius: 4,
                  border: errors.general_capacity ? '1px solid #dc3545' : '1px solid #ccc'
                }}
              />
              {errors.general_capacity && <span style={{ color: '#dc3545', fontSize: 12, display: 'block' }}>{errors.general_capacity}</span>}
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#666' }}>
                Número máximo de entradas disponibles para esta sala
              </p>
            </div>
          )}

          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 18, marginBottom: 12 }}>Imágenes</h3>
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              {IMAGE_SLOT_CONFIG.map(renderImageSlot)}
            </div>
          </div>
        </div>

        {/* Precios */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, marginBottom: 16 }}>
            {formData.venue_type === 'sala_principal' ? 'Precios por Sección' : 'Precio de Entrada'}
          </h3>
          
          {/* Checkbox de Venta Externa */}
          <div style={{ 
            marginBottom: 20, 
            padding: 16, 
            background: formData.external_sale ? '#eff6ff' : '#f8fafc',
            borderRadius: 8,
            border: `1px solid ${formData.external_sale ? '#bfdbfe' : '#e2e8f0'}`
          }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: 12,
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={formData.external_sale}
                onChange={(e) => handleChange('external_sale', e.target.checked)}
                style={{
                  width: 20,
                  height: 20,
                  marginTop: 2,
                  cursor: 'pointer',
                  accentColor: '#3b82f6'
                }}
              />
              <div>
                <span style={{ fontWeight: 600, fontSize: 15, color: '#1e40af' }}>
                  🔗 Venta por plataforma de terceros
                </span>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
                  Marcar si las entradas se venden en otra plataforma (ej: Passline, Eventbrite, etc.)
                </p>
              </div>
            </label>
            
            {formData.external_sale && (
              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 14 }}>
                  Link de venta *
                </label>
                <input
                  type="url"
                  value={formData.external_sale_link}
                  onChange={(e) => handleChange('external_sale_link', e.target.value)}
                  placeholder="https://ejemplo.com/comprar-entradas"
                  style={{
                    width: '100%',
                    padding: 10,
                    borderRadius: 6,
                    border: errors.external_sale_link ? '1px solid #dc3545' : '1px solid #cbd5e1',
                    fontSize: 14
                  }}
                />
                {errors.external_sale_link && (
                  <span style={{ color: '#dc3545', fontSize: 12, display: 'block', marginTop: 4 }}>
                    {errors.external_sale_link}
                  </span>
                )}
                <p style={{ margin: '8px 0 0 0', fontSize: 12, color: '#64748b' }}>
                  Al presionar "Comprar Entradas" el usuario será redirigido a este link
                </p>
              </div>
            )}
          </div>
          
          {!formData.external_sale && formData.venue_type === 'sala_principal' ? (
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
          ) : null}

          {/* Checkbox para palcos con butacas individuales - solo para sala_principal */}
          {formData.venue_type === 'sala_principal' && (
            <div style={{ 
              marginTop: 16,
              padding: 12, 
              background: formData.palcos_individual_seats ? '#fef3c7' : '#f8fafc',
              borderRadius: 8,
              border: `1px solid ${formData.palcos_individual_seats ? '#fcd34d' : '#e2e8f0'}`
            }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: 12,
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={formData.palcos_individual_seats}
                  onChange={(e) => handleChange('palcos_individual_seats', e.target.checked)}
                  style={{
                    width: 18,
                    height: 18,
                    marginTop: 2,
                    cursor: 'pointer',
                    accentColor: '#f59e0b'
                  }}
                />
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#92400e' }}>
                    🪑 Palcos con butacas individuales
                  </span>
                  <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748b' }}>
                    Marcar si los palcos se venden por butaca individual (no muestra "x4 localidades" ni "x2 localidades" en la info del show)
                  </p>
                </div>
              </label>
            </div>
          )}

          {!formData.external_sale && formData.venue_type !== 'sala_principal' ? (
            <div style={{ maxWidth: 300 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Precio por Entrada ($) *
              </label>
              <input
                type="number"
                value={formData.general_price}
                onChange={(e) => handleChange('general_price', e.target.value)}
                placeholder="Ej: 5000"
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 4,
                  border: errors.general_price ? '1px solid #dc3545' : '1px solid #ccc'
                }}
              />
              {errors.general_price && <span style={{ color: '#dc3545', fontSize: 12, display: 'block' }}>{errors.general_price}</span>}
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#666' }}>
                Precio único para todas las entradas de esta sala
              </p>
            </div>
          ) : null}

        </div>

        {/* Pack Multi-Función */}
        {!formData.external_sale && (
          <div style={{ marginBottom: 24, padding: 16, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 18, margin: 0 }}>Pack Multi-Función</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#166534' }}>
                  Permití que los espectadores compren entradas para varias funciones del mismo show con descuentos por volumen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handlePackToggle(!formData.pack_enabled)}
                style={{
                  width: 56,
                  height: 28,
                  borderRadius: 14,
                  border: 'none',
                  background: formData.pack_enabled ? '#16a34a' : '#d1d5db',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.3s ease'
                }}
              >
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: 3,
                  left: formData.pack_enabled ? 31 : 3,
                  transition: 'left 0.3s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                }} />
              </button>
            </div>

            {formData.pack_enabled && (
              <div style={{ marginTop: 16 }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
                    Máximo de funciones por pack *
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={formData.pack_max_sessions}
                    onChange={(e) => handlePackMaxSessionsChange(e.target.value)}
                    style={{
                      width: '120px',
                      padding: 8,
                      borderRadius: 4,
                      border: errors.pack_max_sessions ? '1px solid #dc3545' : '1px solid #ccc'
                    }}
                  />
                  {errors.pack_max_sessions && <span style={{ color: '#dc3545', fontSize: 12, display: 'block' }}>{errors.pack_max_sessions}</span>}
                  <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#166534' }}>
                    Cantidad máxima de funciones que se pueden comprar juntas como pack.
                  </p>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#dcfce7' }}>
                        <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #86efac' }}>Funciones</th>
                        {getPackSections().map(section => (
                          <th key={section} style={{ padding: 10, textAlign: 'right', borderBottom: '2px solid #86efac' }}>
                            {getSectionLabel(section)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: Number(formData.pack_max_sessions) }, (_, i) => i + 1).map(depth => (
                        <tr key={depth} style={{ backgroundColor: depth % 2 === 0 ? '#f0fdf4' : '#fff' }}>
                          <td style={{ padding: 10, fontWeight: 600 }}>{depth} función{depth > 1 ? 'es' : ''}</td>
                          {getPackSections().map(section => (
                            <td key={section} style={{ padding: 10, textAlign: 'right' }}>
                              <input
                                type="number"
                                min={0}
                                value={formData.pack_pricing_json?.[depth]?.[section] ?? ''}
                                onChange={(e) => handlePackPriceChange(depth, section, e.target.value)}
                                style={{
                                  width: '90px',
                                  padding: 6,
                                  borderRadius: 4,
                                  border: errors[`pack_pricing_${depth}_${section}`] || errors[`pack_pricing_monotonic_${section}`] ? '1px solid #dc3545' : '1px solid #ccc',
                                  textAlign: 'right'
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {Object.keys(errors).some(k => k.startsWith('pack_pricing')) && (
                  <p style={{ color: '#dc3545', fontSize: 13, marginTop: 8 }}>
                    Revisá los precios: todos deben ser mayores a 0 y no pueden aumentar al comprar más funciones.
                  </p>
                )}

                <p style={{ margin: '12px 0 0 0', fontSize: 12, color: '#166534' }}>
                  Los precios se aplican <strong>por entrada</strong> cuando el espectador compra exactamente esa cantidad de funciones.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Productores - solo si no es venta externa */}
        {!formData.external_sale && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 16 }}>
            Productores
          </label>
          {/* Input de búsqueda */}
          <input
            type="text"
            placeholder="Buscar productor por nombre o email..."
            value={producerSearch}
            onChange={(e) => setProducerSearch(e.target.value)}
            style={{
              width: '100%',
              padding: 10,
              border: '1px solid #ccc',
              borderRadius: 6,
              fontSize: 14,
              marginBottom: 8
            }}
          />
          <div style={{ 
            border: '1px solid #ccc',
            borderRadius: 6,
            padding: 12,
            minHeight: 100,
            maxHeight: 200,
            overflowY: 'auto'
          }}>
            {producers.length === 0 ? (
              <div style={{ color: '#6c757d', fontSize: 14 }}>
                No hay productores disponibles. Asigná el rol "Productor" a usuarios en la sección Usuarios.
              </div>
            ) : (() => {
              const filtered = producers.filter(p => 
                producerSearch === '' || 
                p.name.toLowerCase().includes(producerSearch.toLowerCase()) ||
                (p.email && p.email.toLowerCase().includes(producerSearch.toLowerCase()))
              );
              
              if (filtered.length === 0) {
                return (
                  <div style={{ color: '#6c757d', fontSize: 14, padding: '8px 0' }}>
                    No se encontraron productores con "{producerSearch}"
                  </div>
                );
              }
              
              return filtered.map(producer => (
                <label
                  key={producer.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 0',
                    cursor: 'pointer',
                    fontSize: 14
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.producer_ids.includes(producer.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleChange('producer_ids', [...formData.producer_ids, producer.id]);
                      } else {
                        handleChange('producer_ids', formData.producer_ids.filter(id => id !== producer.id));
                      }
                    }}
                    style={{ marginRight: 8 }}
                  />
                  <span>{producer.name}</span>
                  {producer.email && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#6c757d' }}>
                      ({producer.email})
                    </span>
                  )}
                </label>
              ));
            })()}
          </div>
          <div style={{ fontSize: 12, color: '#6c757d', marginTop: 4 }}>
            Seleccioná los productores asociados a este show
          </div>
        </div>
        )}

        {/* Servicios asociados */}
        {(
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, borderBottom: '2px solid #e0e0e0', paddingBottom: 8 }}>
              Servicios Asociados
            </h3>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
              Los espectadores podrán agregar estos servicios al comprar sus entradas (ej: cena, estacionamiento, merchandising).
            </p>

            {/* Lista de servicios existentes */}
            {services.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {services.map(svc => (
                  <div key={svc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8f9fa', borderRadius: 6, marginBottom: 6, border: '1px solid #e0e0e0' }}>
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: 14 }}>{svc.name}</strong>
                      {svc.description && <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>{svc.description}</span>}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, minWidth: 80, textAlign: 'right' }}>
                      ${Number(svc.price).toLocaleString('es-AR')}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleEditService(svc)}
                      style={{ background: '#ffc107', color: '#000', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteService(svc.id)}
                      style={{ background: '#dc3545', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Agregar nuevo servicio */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 2, minWidth: 160 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Nombre *</label>
                <input
                  type="text"
                  value={newService.name}
                  onChange={e => setNewService(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej: Cena show"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }}
                />
              </div>
              <div style={{ flex: 3, minWidth: 180 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Descripción (opcional)</label>
                <input
                  type="text"
                  value={newService.description}
                  onChange={e => setNewService(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descripción breve"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Precio * ($)</label>
                <input
                  type="number"
                  min="0"
                  value={newService.price}
                  onChange={e => setNewService(prev => ({ ...prev, price: e.target.value }))}
                  placeholder="0"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Incluir en bordereaux</label>
                <select
                  value={newService.include_in_bordereaux ? 'bordereaux' : 'teatro'}
                  onChange={e => setNewService(prev => ({ ...prev, include_in_bordereaux: e.target.value === 'bordereaux' }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }}
                >
                  <option value="teatro">Del teatro</option>
                  <option value="bordereaux">A bordereaux</option>
                </select>
              </div>
              <button
                type="button"
                onClick={editingService ? handleUpdateService : handleAddService}
                disabled={savingService || !show?.id}
                style={{ padding: '8px 16px', background: (savingService || !show?.id) ? '#adb5bd' : (editingService ? '#ffc107' : '#28a745'), color: editingService ? '#000' : '#fff', border: 'none', borderRadius: 6, cursor: (savingService || !show?.id) ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                {savingService ? 'Guardando...' : (editingService ? 'Actualizar' : '+ Agregar')}
              </button>
              {editingService && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  style={{ padding: '8px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  Cancelar
                </button>
              )}
            </div>
            {!show?.id && (
              <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>Guardá el espectáculo primero para poder agregar servicios.</p>
            )}
            {serviceError && <p style={{ color: '#dc3545', fontSize: 13, marginTop: 8 }}>{serviceError}</p>}
          </div>
        )}

        {/* Info sobre sesiones */}
        <div style={{ 
          marginBottom: 24,
          padding: 16,
          background: '#e7f3ff',
          borderRadius: 6,
          border: '1px solid #2196f3'
        }}>
          <p style={{ margin: 0, fontSize: 14, color: '#0d47a1' }}>
             <strong>Los precios aquí definidos son valores por defecto.</strong> Después de crear el espectáculo, podés gestionar las sesiones (funciones) individuales y configurar precios específicos para cada función si es necesario.
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
