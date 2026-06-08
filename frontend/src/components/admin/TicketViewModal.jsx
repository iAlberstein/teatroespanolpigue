import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiAuthFetch } from '../../lib/api';
import Button from '../ui/Button';

export default function TicketViewModal({ sale, tickets, onClose }) {
  const { token } = useAuth();
  const [email, setEmail] = useState(sale?.customer_email || '');
  const [phone, setPhone] = useState(sale?.customer_phone || '');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const isDetailsOnly = !!sale?.detailsOnly;
  const isRefund = !!(sale?.refunded || sale?.is_refund_operation);
  const refundReason = sale?.refund_reason || null;
  const refundedAt = sale?.refunded_at ? new Date(sale.refunded_at) : null;

  const handleReprintTickets = () => {
    if (!sale?.id) return;
    const printUrl = `/api/share/sale/${sale.id}?mode=print`;
    window.open(printUrl, '_blank');
  };

  const handleSendEmail = async () => {
    if (!email) {
      setError('Ingresá un email válido');
      return;
    }

    setSending(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiAuthFetch('/api/tickets/resend', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: sale.id,
          email
        })
      }, token);

      const data = await res.json();

      if (res.ok) {
        setSuccess('Entradas enviadas por email exitosamente');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Error al enviar email');
      }
    } catch (err) {
      setError('Error al enviar email');
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!phone) {
      setError('Ingresá un teléfono válido');
      return;
    }

    setSending(true);
    setError('');
    setSuccess('');

    try {
      const res = await apiAuthFetch('/api/tickets/resend', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: sale.id,
          phone
        })
      }, token);

      const data = await res.json();

      if (res.ok && data.whatsapp_url) {
        // Open WhatsApp in new window
        window.open(data.whatsapp_url, '_blank');
        setSuccess('Abriendo WhatsApp...');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Error al generar link de WhatsApp');
      }
    } catch (err) {
      setError('Error al generar link de WhatsApp');
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20
    }}>
      <div style={{
        background: 'white',
        borderRadius: 12,
        maxWidth: 600,
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{
          padding: 24,
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>
            {isDetailsOnly ? 'Detalle de Venta' : 'Entradas - Venta'} #{sale.id.slice(0, 8)}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: '#6b7280',
              padding: 0,
              width: 32,
              height: 32
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }}>
          {/* Sale info */}
          <div style={{
            background: '#f9fafb',
            padding: 16,
            borderRadius: 8,
            marginBottom: 24
          }}>
            <div style={{ marginBottom: 8 }}>
              <strong>Cliente:</strong> {sale.customer_name || 'N/A'}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Espectáculo:</strong> {sale.show_title || 'N/A'}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>Función:</strong> {sale.session_date} {sale.session_time}
            </div>
            <div>
              <strong>Total:</strong> ${Number(sale.total_amount || 0).toLocaleString('es-AR')}
            </div>
          </div>

          {/* Refund info */}
          {isRefund && (
            <div style={{
              background: '#fef2f2',
              padding: 16,
              borderRadius: 8,
              marginBottom: 24,
              border: '1px solid #fecaca'
            }}>
              <div style={{ marginBottom: 8 }}>
                <strong>Estado:</strong> Venta reintegrada
              </div>
              {refundedAt && (
                <div style={{ marginBottom: 8, fontSize: 14, color: '#4b5563' }}>
                  <strong>Fecha de devolución:</strong>{' '}
                  {refundedAt.toLocaleString('es-AR')}
                </div>
              )}
              <div style={{ fontSize: 14, color: '#4b5563' }}>
                <strong>Motivo de la devolución:</strong>{' '}
                {refundReason ? refundReason : 'No se registró un motivo'}
              </div>
            </div>
          )}

          {/* Tickets list */}
          {!isDetailsOnly && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>Entradas ({tickets.filter(t => t.type !== 'service').length})</h3>
              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                overflow: 'hidden'
              }}>
                {tickets.filter(t => t.type !== 'service').map((ticket, index) => (
                  <div
                    key={ticket.id || index}
                    style={{
                      padding: 12,
                      borderBottom: index < tickets.filter(t => t.type !== 'service').length - 1 ? '1px solid #e5e7eb' : 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{ticket.location || ticket.seat_code}</div>
                      <div style={{ fontSize: 13, color: '#6b7280' }}>
                        {ticket.used ? 'Utilizada' : 'Activa'}
                      </div>
                    </div>
                    <div style={{ fontSize: 14, color: '#6b7280' }}>
                      ${Number(ticket.price || 0).toLocaleString('es-AR')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Servicios adicionales */}
          {(() => {
            let serviceItems = sale?.service_items;
            // Forzar parseo si viene como string
            if (typeof serviceItems === 'string') {
              try {
                serviceItems = JSON.parse(serviceItems);
              } catch { serviceItems = []; }
            }
            if (Array.isArray(serviceItems) && serviceItems.length > 0) {
              return (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 12 }}>Servicios asociados</h3>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                    {serviceItems.map((svc, index) => (
                      <div
                        key={index}
                        style={{
                          padding: 12,
                          borderBottom: index < serviceItems.length - 1 ? '1px solid #e5e7eb' : 'none',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>
                          {svc.name} ×{svc.quantity} (${Number(svc.price || 0).toLocaleString('es-AR')} c/u)
                        </div>
                        <div style={{ fontSize: 14, color: '#6b7280' }}>
                          ${(Number(svc.price || 0) * Number(svc.quantity || 1)).toLocaleString('es-AR')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Resend form */}
          {!isDetailsOnly && (
            <div style={{
              background: '#eff6ff',
              padding: 20,
              borderRadius: 8,
              border: '1px solid #3b82f6'
            }}>
              <h3 style={{ fontSize: 16, marginTop: 0, marginBottom: 16 }}>Reenviar Entradas</h3>

              <div style={{ marginBottom: 16 }}>
                <Button
                  onClick={handleReprintTickets}
                  variant="secondary"
                  style={{ minWidth: 180 }}
                >
                  Reimprimir entradas
                </Button>
              </div>

              {/* Email */}
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  marginBottom: 6
                }}>
                  Email
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@ejemplo.com"
                    style={{
                      flex: 1,
                      padding: 10,
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      fontSize: 14
                    }}
                  />
                  <Button
                    onClick={handleSendEmail}
                    disabled={sending || !email}
                    variant="primary"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {sending ? 'Enviando...' : 'Enviar Email'}
                  </Button>
                </div>
              </div>

              {/* Phone */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  marginBottom: 6
                }}>
                  Teléfono (con código de área)
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="2923XXXXXX"
                    style={{
                      flex: 1,
                      padding: 10,
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      fontSize: 14
                    }}
                  />
                  <Button
                    onClick={handleSendWhatsApp}
                    disabled={sending || !phone}
                    variant="success"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {sending ? 'Generando...' : 'WhatsApp'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {success && (
            <div style={{
              marginTop: 16,
              padding: 12,
              background: '#d1fae5',
              color: '#059669',
              borderRadius: 6,
              fontSize: 14
            }}>
              {success}
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 16,
              padding: 12,
              background: '#fee2e2',
              color: '#dc2626',
              borderRadius: 6,
              fontSize: 14
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: 24,
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <Button onClick={onClose} variant="secondary">
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
