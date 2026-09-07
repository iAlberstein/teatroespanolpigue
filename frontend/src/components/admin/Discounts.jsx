import { useState, useEffect } from 'react';
import { apiAuthFetch } from '../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { theme } from '../../styles/theme.js';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';

export default function Discounts({ shows }) {
  const { token } = useAuth();
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    alias: '',
    show_id: '',
    type: 'percentage',
    value: '',
    usage_limit: '',
    min_seats: '',
    max_seats: '',
    require_even: false,
    platea_baja_only: false,
    row_start: '',
    row_end: '',
    active: true
  });

  // Filas válidas de platea baja (A-M)
  const PLATEA_BAJA_ROWS = 'ABCDEFGHIJKLM'.split('');

  useEffect(() => {
    loadDiscounts();
  }, []);

  const loadDiscounts = async () => {
    setLoading(true);
    try {
      const res = await apiAuthFetch('/api/discounts', { method: 'GET' }, token);
      if (res.ok) {
        const data = await res.json();
        setDiscounts(data);
      } else {
        setError('Error al cargar descuentos');
      }
    } catch (err) {
      console.error('Error loading discounts:', err);
      setError('Error al cargar descuentos');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      alias: '',
      show_id: '',
      type: 'percentage',
      value: '',
      usage_limit: '',
      min_seats: '',
      max_seats: '',
      require_even: false,
      platea_baja_only: false,
      row_start: '',
      row_end: '',
      active: true
    });
    setEditingDiscount(null);
    setShowForm(false);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validations
    if (!formData.code.trim()) {
      setError('El código es obligatorio');
      return;
    }

    if ((formData.type === 'percentage' || formData.type === 'fixed') && !formData.value) {
      setError('El valor es obligatorio para este tipo de descuento');
      return;
    }

    if (formData.type === 'percentage' && (formData.value <= 0 || formData.value > 100)) {
      setError('El porcentaje debe estar entre 0.01 y 100');
      return;
    }

    // Validate max_seats >= min_seats
    if (formData.min_seats && formData.max_seats && parseInt(formData.max_seats) < parseInt(formData.min_seats)) {
      setError('El máximo de localidades no puede ser menor al mínimo');
      return;
    }

    // Validar rango de filas de platea baja
    let rowStart = formData.row_start ? formData.row_start.toUpperCase() : null;
    let rowEnd = formData.row_end ? formData.row_end.toUpperCase() : null;
    if (formData.platea_baja_only) {
      if (rowStart && !PLATEA_BAJA_ROWS.includes(rowStart)) {
        setError('La fila inicial debe ser una letra entre A y M');
        return;
      }
      if (rowEnd && !PLATEA_BAJA_ROWS.includes(rowEnd)) {
        setError('La fila final debe ser una letra entre A y M');
        return;
      }
      if (rowStart && rowEnd && rowStart > rowEnd) {
        setError('La fila inicial no puede ser mayor que la fila final');
        return;
      }
    }

    const payload = {
      code: formData.code.trim(),
      alias: formData.alias ? formData.alias.trim() : null,
      show_id: formData.show_id || null,
      type: formData.type,
      value: formData.value ? parseFloat(formData.value) : null,
      usage_limit: formData.usage_limit ? parseInt(formData.usage_limit) : null,
      min_seats: formData.min_seats ? parseInt(formData.min_seats) : null,
      max_seats: formData.max_seats ? parseInt(formData.max_seats) : null,
      require_even: formData.require_even,
      platea_baja_only: formData.platea_baja_only,
      row_start: formData.platea_baja_only ? rowStart : null,
      row_end: formData.platea_baja_only ? rowEnd : null,
      active: formData.active
    };

    try {
      const url = editingDiscount 
        ? `/api/discounts/${editingDiscount.id}`
        : '/api/discounts';
      
      const method = editingDiscount ? 'PUT' : 'POST';

      const res = await apiAuthFetch(url, {
        method,
        body: JSON.stringify(payload)
      }, token);

      if (res.ok) {
        setSuccess(editingDiscount ? 'Descuento actualizado' : 'Descuento creado');
        await loadDiscounts();
        resetForm();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al guardar descuento');
      }
    } catch (err) {
      console.error('Error saving discount:', err);
      setError('Error al guardar descuento');
    }
  };

  const handleEdit = (discount) => {
    setEditingDiscount(discount);
    setFormData({
      code: discount.code,
      alias: discount.alias || '',
      show_id: discount.show_id || '',
      type: discount.type,
      value: discount.value || '',
      usage_limit: discount.usage_limit || '',
      min_seats: discount.min_seats || '',
      max_seats: discount.max_seats || '',
      require_even: !!discount.require_even,
      platea_baja_only: !!discount.platea_baja_only,
      row_start: discount.row_start || '',
      row_end: discount.row_end || '',
      active: discount.active
    });
    setShowForm(true);
    setError('');
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este descuento?')) return;

    try {
      const res = await apiAuthFetch(`/api/discounts/${id}`, {
        method: 'DELETE'
      }, token);

      if (res.ok) {
        setSuccess('Descuento eliminado');
        await loadDiscounts();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al eliminar descuento');
      }
    } catch (err) {
      console.error('Error deleting discount:', err);
      setError('Error al eliminar descuento');
    }
  };

  const handleToggleActive = async (discount) => {
    try {
      const res = await apiAuthFetch(`/api/discounts/${discount.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !discount.active })
      }, token);

      if (res.ok) {
        setSuccess(discount.active ? 'Descuento desactivado' : 'Descuento activado');
        await loadDiscounts();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al actualizar descuento');
      }
    } catch (err) {
      console.error('Error toggling discount:', err);
      setError('Error al actualizar descuento');
    }
  };

  const getDiscountDescription = (discount) => {
    if (discount.type === 'percentage') {
      return `${discount.value}% de descuento`;
    } else if (discount.type === 'fixed') {
      return `$${parseFloat(discount.value).toLocaleString('es-AR')} de descuento`;
    } else {
      return 'Descuento especial';
    }
  };

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: theme.spacing.lg 
      }}>
        <div>
          <h2 style={{ margin: 0, color: theme.colors.textPrimary }}> Cupones y Descuentos</h2>
          <p style={{ color: theme.colors.textSecondary, fontSize: theme.typography.small, marginTop: theme.spacing.xs }}>
            Gestión de códigos promocionales
          </p>
        </div>
        {!showForm && (
          <Button
            variant="primary"
            onClick={() => setShowForm(true)}
          >
             Nuevo Cupón
          </Button>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div style={{
          padding: theme.spacing.md,
          background: '#fee',
          border: `1px solid #fcc`,
          borderRadius: theme.borderRadius.md,
          color: '#c00',
          marginBottom: theme.spacing.md
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: theme.spacing.md,
          background: '#d1fae5',
          border: `1px solid #a7f3d0`,
          borderRadius: theme.borderRadius.md,
          color: '#065f46',
          marginBottom: theme.spacing.md
        }}>
          {success}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <Card variant="elevated" padding="lg" style={{ marginBottom: theme.spacing.lg }}>
          <h3 style={{ marginTop: 0, marginBottom: theme.spacing.md }}>
            {editingDiscount ? 'Editar Cupón' : 'Nuevo Cupón'}
          </h3>
          
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: theme.spacing.md }}>
              {/* Código */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: theme.spacing.xs,
                  fontWeight: theme.typography.semibold,
                  fontSize: theme.typography.small
                }}>
                  Código *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="ej: VERANO2025"
                  style={{
                    width: '100%',
                    padding: theme.spacing.sm,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.borderRadius.md,
                    fontSize: theme.typography.body
                  }}
                  required
                />
                <small style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                  Será convertido a mayúsculas
                </small>
              </div>

              {/* Alias */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: theme.spacing.xs,
                  fontWeight: theme.typography.semibold,
                  fontSize: theme.typography.small
                }}>
                  Alias (nombre visible)
                </label>
                <input
                  type="text"
                  value={formData.alias}
                  onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                  placeholder="ej: Promo 2x1 Verano"
                  style={{
                    width: '100%',
                    padding: theme.spacing.sm,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.borderRadius.md,
                    fontSize: theme.typography.body
                  }}
                />
                <small style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                  Se mostrará al usuario en lugar del código real
                </small>
              </div>

              {/* Show (opcional) */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: theme.spacing.xs,
                  fontWeight: theme.typography.semibold,
                  fontSize: theme.typography.small
                }}>
                  Show (opcional)
                </label>
                <select
                  value={formData.show_id}
                  onChange={(e) => setFormData({ ...formData, show_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: theme.spacing.sm,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.borderRadius.md,
                    fontSize: theme.typography.body
                  }}
                >
                  <option value="">Todos los shows</option>
                  {shows.map(show => (
                    <option key={show.id} value={show.id}>{show.title}</option>
                  ))}
                </select>
                <small style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                  Si no seleccionas, aplica a todos
                </small>
              </div>

              {/* Tipo */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: theme.spacing.xs,
                  fontWeight: theme.typography.semibold,
                  fontSize: theme.typography.small
                }}>
                  Tipo *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value, value: '' })}
                  style={{
                    width: '100%',
                    padding: theme.spacing.sm,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.borderRadius.md,
                    fontSize: theme.typography.body
                  }}
                >
                  <option value="percentage">Porcentaje (%)</option>
                  <option value="fixed">Monto Fijo ($)</option>
                  <option value="internal">Especial (cortesía)</option>
                </select>
              </div>

              {/* Valor */}
              {(formData.type === 'percentage' || formData.type === 'fixed') && (
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: theme.spacing.xs,
                    fontWeight: theme.typography.semibold,
                    fontSize: theme.typography.small
                  }}>
                    {formData.type === 'percentage' ? 'Porcentaje *' : 'Monto *'}
                  </label>
                  <input
                    type="number"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder={formData.type === 'percentage' ? '20' : '1000'}
                    min={formData.type === 'percentage' ? '0.01' : '0'}
                    max={formData.type === 'percentage' ? '100' : undefined}
                    step="any"
                    style={{
                      width: '100%',
                      padding: theme.spacing.sm,
                      border: `1px solid ${theme.colors.border}`,
                      borderRadius: theme.borderRadius.md,
                      fontSize: theme.typography.body
                    }}
                    required
                  />
                  <small style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                    {formData.type === 'percentage' ? 'Entre 0.01 y 100 (admite decimales)' : 'Monto en pesos'}
                  </small>
                </div>
              )}

              {/* Límite de uso */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: theme.spacing.xs,
                  fontWeight: theme.typography.semibold,
                  fontSize: theme.typography.small
                }}>
                  Límite de usos
                </label>
                <input
                  type="number"
                  value={formData.usage_limit}
                  onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                  placeholder="Ilimitado"
                  min="0"
                  style={{
                    width: '100%',
                    padding: theme.spacing.sm,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.borderRadius.md,
                    fontSize: theme.typography.body
                  }}
                />
                <small style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                  Dejar vacío para ilimitado
                </small>
              </div>

              {/* Mínimo de localidades */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: theme.spacing.xs,
                  fontWeight: theme.typography.semibold,
                  fontSize: theme.typography.small
                }}>
                  Mínimo de localidades
                </label>
                <input
                  type="number"
                  value={formData.min_seats}
                  onChange={(e) => setFormData({ ...formData, min_seats: e.target.value })}
                  placeholder="Sin mínimo"
                  min="1"
                  style={{
                    width: '100%',
                    padding: theme.spacing.sm,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.borderRadius.md,
                    fontSize: theme.typography.body
                  }}
                />
                <small style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                  Dejar vacío para no requerir mínimo. Butacas=1, Palcos Bajos=4, Palcos Altos=2, Pullman/General=1.
                  {formData.type === 'fixed' && formData.min_seats && ' En monto fijo, el descuento se multiplica por cada múltiplo del mínimo alcanzado.'}
                </small>
              </div>

              {/* Máximo de localidades */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: theme.spacing.xs,
                  fontWeight: theme.typography.semibold,
                  fontSize: theme.typography.small
                }}>
                  Máximo de localidades
                </label>
                <input
                  type="number"
                  value={formData.max_seats}
                  onChange={(e) => setFormData({ ...formData, max_seats: e.target.value })}
                  placeholder="Sin máximo"
                  min="1"
                  style={{
                    width: '100%',
                    padding: theme.spacing.sm,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: theme.borderRadius.md,
                    fontSize: theme.typography.body
                  }}
                />
                <small style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                  Dejar vacío para no limitar. Misma lógica de conteo que el mínimo.
                </small>
              </div>

              {/* Requiere selección par */}
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: theme.spacing.lg }}>
                <label style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.require_even}
                    onChange={(e) => setFormData({ ...formData, require_even: e.target.checked })}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: theme.typography.semibold }}>Requiere selección par</span>
                </label>
                <small style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted, marginLeft: theme.spacing.sm }}>
                  El comprador deberá seleccionar un número par de localidades
                </small>
              </div>

              {/* Solo Platea Baja */}
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: theme.spacing.lg }}>
                <label style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.platea_baja_only}
                    onChange={(e) => setFormData({ ...formData, platea_baja_only: e.target.checked })}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: theme.typography.semibold }}>Solo Platea Baja</span>
                </label>
                <small style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted, marginLeft: theme.spacing.sm }}>
                  No aplica a Palcos Bajos, Palcos Altos ni Pullman
                </small>
              </div>

              {/* Rango de filas (visible solo si platea_baja_only) */}
              {formData.platea_baja_only && (
                <>
                  <div>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: theme.spacing.xs,
                      fontWeight: theme.typography.semibold,
                      fontSize: theme.typography.small
                    }}>
                      Fila inicial
                    </label>
                    <select
                      value={formData.row_start}
                      onChange={(e) => setFormData({ ...formData, row_start: e.target.value })}
                      style={{
                        width: '100%',
                        padding: theme.spacing.sm,
                        border: `1px solid ${theme.colors.border}`,
                        borderRadius: theme.borderRadius.md,
                        fontSize: theme.typography.body
                      }}
                    >
                      <option value="">Desde la A</option>
                      {PLATEA_BAJA_ROWS.map(r => (
                        <option key={r} value={r}>Fila {r}</option>
                      ))}
                    </select>
                    <small style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                      Vacío = desde la fila A
                    </small>
                  </div>

                  <div>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: theme.spacing.xs,
                      fontWeight: theme.typography.semibold,
                      fontSize: theme.typography.small
                    }}>
                      Fila final
                    </label>
                    <select
                      value={formData.row_end}
                      onChange={(e) => setFormData({ ...formData, row_end: e.target.value })}
                      style={{
                        width: '100%',
                        padding: theme.spacing.sm,
                        border: `1px solid ${theme.colors.border}`,
                        borderRadius: theme.borderRadius.md,
                        fontSize: theme.typography.body
                      }}
                    >
                      <option value="">Hasta la M</option>
                      {PLATEA_BAJA_ROWS.map(r => (
                        <option key={r} value={r}>Fila {r}</option>
                      ))}
                    </select>
                    <small style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                      Vacío = hasta la fila M
                    </small>
                  </div>
                </>
              )}

              {/* Activo */}
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: theme.spacing.lg }}>
                <label style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: theme.typography.semibold }}>Activo</span>
                </label>
              </div>
            </div>

            <div style={{ 
              display: 'flex', 
              gap: theme.spacing.sm, 
              marginTop: theme.spacing.lg,
              justifyContent: 'flex-end'
            }}>
              <Button
                type="button"
                variant="secondary"
                onClick={resetForm}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
              >
                {editingDiscount ? 'Actualizar' : 'Crear'} Cupón
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Lista de descuentos */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: theme.spacing.xl }}>
          <p style={{ color: theme.colors.textSecondary }}>Cargando cupones...</p>
        </div>
      ) : discounts.length === 0 ? (
        <Card variant="elevated" padding="lg">
          <div style={{ textAlign: 'center', color: theme.colors.textMuted }}>
            <p>No hay cupones creados aún</p>
            <p style={{ fontSize: theme.typography.small }}>Creá tu primer cupón de descuento</p>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: theme.spacing.md }}>
          {discounts.map(discount => (
            <Card key={discount.id} variant="elevated" padding="md">
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                gap: theme.spacing.md 
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.xs }}>
                    <h3 style={{ 
                      margin: 0, 
                      fontSize: theme.typography.h4,
                      fontFamily: 'monospace',
                      color: theme.colors.primary 
                    }}>
                      {discount.code}
                    </h3>
                    {discount.alias && (
                      <span style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        background: '#ede9fe',
                        color: '#6d28d9',
                        borderRadius: theme.borderRadius.sm,
                        fontSize: theme.typography.tiny,
                        fontWeight: theme.typography.semibold
                      }}>
                        Alias: {discount.alias}
                      </span>
                    )}
                    <span style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      background: discount.active ? '#d1fae5' : '#fee',
                      color: discount.active ? '#065f46' : '#c00',
                      borderRadius: theme.borderRadius.sm,
                      fontSize: theme.typography.tiny,
                      fontWeight: theme.typography.semibold
                    }}>
                      {discount.active ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </div>

                  <p style={{ 
                    margin: `${theme.spacing.xs} 0`,
                    fontSize: theme.typography.body,
                    fontWeight: theme.typography.semibold
                  }}>
                    {getDiscountDescription(discount)}
                  </p>

                  <div style={{ 
                    display: 'flex', 
                    gap: theme.spacing.md,
                    fontSize: theme.typography.small,
                    color: theme.colors.textSecondary,
                    marginTop: theme.spacing.sm,
                    flexWrap: 'wrap'
                  }}>
                    <span>
                       {discount.show ? discount.show.title : 'Todos los shows'}
                    </span>
                    <span>
                       Usos: {discount.used_count}{discount.usage_limit ? ` / ${discount.usage_limit}` : ' (ilimitado)'}
                    </span>
                    {discount.min_seats && (
                      <span> Mín: {discount.min_seats}</span>
                    )}
                    {discount.max_seats && (
                      <span> Máx: {discount.max_seats}</span>
                    )}
                    {discount.require_even && (
                      <span style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        background: '#fef3c7',
                        color: '#92400e',
                        borderRadius: theme.borderRadius.sm,
                        fontSize: theme.typography.tiny,
                        fontWeight: theme.typography.semibold
                      }}>
                        Par requerido
                      </span>
                    )}
                    {discount.platea_baja_only && (
                      <span style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        background: '#e0e7ff',
                        color: '#3730a3',
                        borderRadius: theme.borderRadius.sm,
                        fontSize: theme.typography.tiny,
                        fontWeight: theme.typography.semibold
                      }}>
                        Platea Baja {discount.row_start || 'A'}-{discount.row_end || 'M'}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ 
                  display: 'flex', 
                  gap: theme.spacing.xs 
                }}>
                  <button
                    onClick={() => handleToggleActive(discount)}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      background: discount.active ? '#fef3c7' : '#d1fae5',
                      border: 'none',
                      borderRadius: theme.borderRadius.sm,
                      fontSize: theme.typography.small,
                      cursor: 'pointer',
                      fontWeight: theme.typography.medium
                    }}
                    title={discount.active ? 'Desactivar' : 'Activar'}
                  >
                    {discount.active ? '' : ''}
                  </button>
                  <button
                    onClick={() => handleEdit(discount)}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      background: theme.colors.surfaceAlt,
                      border: 'none',
                      borderRadius: theme.borderRadius.sm,
                      fontSize: theme.typography.small,
                      cursor: 'pointer'
                    }}
                    title="Editar"
                  >
                    
                  </button>
                  <button
                    onClick={() => handleDelete(discount.id)}
                    style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      background: '#fee',
                      border: 'none',
                      borderRadius: theme.borderRadius.sm,
                      fontSize: theme.typography.small,
                      cursor: 'pointer'
                    }}
                    title="Eliminar"
                    disabled={discount.used_count > 0}
                  >
                    
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
