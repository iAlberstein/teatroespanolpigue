import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiAuthFetch } from '../../lib/api';
import { formatDateTimeCompact } from '../../lib/dateFormatter.js';
import Button from '../ui/Button';

export default function UserTicketsModal({ user, onClose }) {
  const { token } = useAuth();
  const [tab, setTab] = useState('active'); // 'active' | 'used'
  const [sales, setSales] = useState({ active: [], used: [] });
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState(null);
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadTickets();
  }, []);

  // Agrupar tickets por sale_id
  const groupTicketsBySale = (ticketsData) => {
    const allTickets = [...ticketsData.active, ...ticketsData.used];
    console.log('[MODAL] All tickets to group:', allTickets);
    const salesMap = new Map();

    allTickets.forEach(ticket => {
      if (!salesMap.has(ticket.sale_id)) {
        salesMap.set(ticket.sale_id, {
          sale_id: ticket.sale_id,
          show_title: ticket.show_title,
          session_date: ticket.session_date,
          session_time: ticket.session_time,
          tickets: [],
          total_price: 0,
          all_used: true,
          any_validated: false,
          validated_at: null
        });
      }

      const sale = salesMap.get(ticket.sale_id);
      sale.tickets.push(ticket);
      sale.total_price += Number(ticket.price || 0);
      
      console.log(`[MODAL] Ticket ${ticket.id}: used=${ticket.used}, validated_at=${ticket.validated_at}`);
      
      // Una venta está "usada" si TODOS sus tickets están usados
      if (!ticket.used) {
        sale.all_used = false;
      }
      
      // Registrar si algún ticket fue validado
      if (ticket.validated_at) {
        sale.any_validated = true;
        if (!sale.validated_at || new Date(ticket.validated_at) > new Date(sale.validated_at)) {
          sale.validated_at = ticket.validated_at;
        }
      }
    });

    const salesArray = Array.from(salesMap.values());
    salesArray.forEach(sale => {
      console.log(`[MODAL] Sale ${sale.sale_id}: all_used=${sale.all_used}, tickets=${sale.tickets.length}`);
    });
    
    const result = {
      active: salesArray.filter(sale => !sale.all_used),
      used: salesArray.filter(sale => sale.all_used)
    };
    
    console.log('[MODAL] Result - Active:', result.active.length, 'Used:', result.used.length);
    
    return result;
  };

  const loadTickets = async () => {
    setLoading(true);
    try {
      const res = await apiAuthFetch(`/api/users/${user.id}/tickets`, { method: 'GET' }, token);
      const data = await res.json();
      console.log('Tickets received:', data);
      const groupedSales = groupTicketsBySale(data);
      console.log('Grouped sales:', groupedSales);
      setSales(groupedSales);
    } catch (err) {
      console.error('Error loading tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (sale) => {
    setSelectedSale(sale);
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
          sale_id: selectedSale.sale_id,
          email
        })
      }, token);

      const data = await res.json();

      if (res.ok) {
        setSuccess(data.message || 'Email enviado correctamente');
        setTimeout(() => {
          setSelectedSale(null);
          setSuccess('');
        }, 2000);
      } else {
        setError(data.message || 'Error al enviar email');
      }
    } catch (err) {
      console.error('Error sending email:', err);
      setError('Error al enviar email');
    } finally {
      setSending(false);
    }
  };

  const handleSendWhatsApp = () => {
    if (!phone) {
      setError('Ingresá un número de WhatsApp válido');
      return;
    }

    const ticketList = selectedSale.tickets.map(t => t.location).join(', ');
    const message = `Hola! Te reenviamos tus entradas para ${selectedSale.show_title}.\n\n` +
      `Fecha: ${selectedSale.session_date} a las ${selectedSale.session_time}\n` +
      `Entradas: ${ticketList}\n` +
      `Total: ${selectedSale.tickets.length} entrada${selectedSale.tickets.length > 1 ? 's' : ''}\n\n` +
      `Mostrá este código QR en la entrada del teatro: ${window.location.origin}/api/tickets/qr/${selectedSale.sale_id}`;

    const whatsappUrl = `https://wa.me/549${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');

    setSuccess('Redirigiendo a WhatsApp...');
    setTimeout(() => {
      setSelectedSale(null);
      setSuccess('');
    }, 2000);
  };

  const currentSales = tab === 'active' ? sales.active : sales.used;

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
        maxWidth: 700,
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
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Entradas de {user.name}</h2>
            <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
              {user.email}
            </div>
          </div>
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

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e5e7eb',
          padding: '0 24px'
        }}>
          <button
            onClick={() => setTab('active')}
            style={{
              padding: '12px 24px',
              background: tab === 'active' ? '#3b82f6' : 'transparent',
              color: tab === 'active' ? 'white' : '#6b7280',
              border: 'none',
              borderBottom: tab === 'active' ? '2px solid #3b82f6' : 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14
            }}
          >
            Activas ({sales.active?.length || 0})
          </button>
          <button
            onClick={() => setTab('used')}
            style={{
              padding: '12px 24px',
              background: tab === 'used' ? '#3b82f6' : 'transparent',
              color: tab === 'used' ? 'white' : '#6b7280',
              border: 'none',
              borderBottom: tab === 'used' ? '2px solid #3b82f6' : 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14
            }}
          >
            Utilizadas ({sales.used?.length || 0})
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
              Cargando compras...
            </div>
          ) : !currentSales || currentSales.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
              No hay compras {tab === 'active' ? 'activas' : 'utilizadas'}
            </div>
          ) : (
            <>
              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                overflow: 'hidden'
              }}>
                {currentSales.map((sale, index) => (
                  <React.Fragment key={sale.sale_id}>
                    <div
                      style={{
                        padding: 16,
                        borderBottom: (index < currentSales.length - 1 && selectedSale?.sale_id !== sale.sale_id) ? '1px solid #e5e7eb' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 16 }}>
                            {sale.show_title}
                          </div>
                          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
                            {sale.session_date} - {sale.session_time}
                          </div>
                          
                          {/* Lista de entradas */}
                          <div style={{ 
                            background: '#f9fafb', 
                            padding: 8, 
                            borderRadius: 4,
                            marginBottom: 8
                          }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                              {sale.tickets.length} entrada{sale.tickets.length > 1 ? 's' : ''}:
                            </div>
                            {sale.tickets.map((ticket, idx) => (
                              <div key={ticket.id} style={{ fontSize: 12, color: '#6b7280' }}>
                                • {ticket.location}
                              </div>
                            ))}
                          </div>
                          
                          {sale.any_validated && sale.validated_at && (
                            <div style={{ fontSize: 12, color: '#059669', marginTop: 4 }}>
                               Validada: {formatDateTimeCompact(sale.validated_at)}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#111827' }}>
                            ${sale.total_price.toLocaleString('es-AR')}
                          </div>
                          {tab === 'active' && (
                            <Button
                              onClick={() => handleResend(sale)}
                              variant="secondary"
                              style={{ fontSize: 12, padding: '6px 16px' }}
                            >
                              Reenviar QR
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Resend form inline - shown when this sale is selected */}
                    {selectedSale?.sale_id === sale.sale_id && (
                      <div style={{
                        padding: 16,
                        background: '#eff6ff',
                        borderBottom: index < currentSales.length - 1 ? '1px solid #e5e7eb' : 'none'
                      }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 12
                        }}>
                          <h4 style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>
                            Reenviar entradas
                          </h4>
                          <button
                            onClick={() => setSelectedSale(null)}
                            style={{
                              background: 'none',
                              border: 'none',
                              fontSize: 18,
                              cursor: 'pointer',
                              color: '#6b7280',
                              padding: 0
                            }}
                          >
                            ×
                          </button>
                        </div>

                        {/* Email input */}
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
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
                                padding: 8,
                                border: '1px solid #d1d5db',
                                borderRadius: 4,
                                fontSize: 13
                              }}
                            />
                            <Button
                              onClick={handleSendEmail}
                              disabled={sending || !email}
                              style={{ fontSize: 12, padding: '8px 16px' }}
                            >
                              {sending ? 'Enviando...' : 'Enviar'}
                            </Button>
                          </div>
                        </div>

                        {/* WhatsApp input */}
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ display: 'block', fontSize: 13, marginBottom: 4, fontWeight: 500 }}>
                            WhatsApp
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              type="tel"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              placeholder="+549XXXXXXXXXX"
                              style={{
                                flex: 1,
                                padding: 8,
                                border: '1px solid #d1d5db',
                                borderRadius: 4,
                                fontSize: 13
                              }}
                            />
                            <Button
                              onClick={handleSendWhatsApp}
                              disabled={!phone}
                              variant="secondary"
                              style={{ fontSize: 12, padding: '8px 16px' }}
                            >
                              Abrir WhatsApp
                            </Button>
                          </div>
                        </div>

                        {/* Success/Error messages */}
                        {success && (
                          <div style={{ 
                            padding: 8, 
                            background: '#d1fae5', 
                            color: '#065f46',
                            borderRadius: 4,
                            fontSize: 12,
                            marginTop: 8
                          }}>
                             {success}
                          </div>
                        )}
                        {error && (
                          <div style={{ 
                            padding: 8, 
                            background: '#fee2e2', 
                            color: '#991b1b',
                            borderRadius: 4,
                            fontSize: 12,
                            marginTop: 8
                          }}>
                            ✗ {error}
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </>
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
