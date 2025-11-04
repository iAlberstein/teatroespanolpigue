import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiAuthFetch } from '../lib/api';

export default function Perfil(){
  const { user, token } = useAuth();
  const [tab, setTab] = useState('tickets');
  const [tickets, setTickets] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  useEffect(() => {
    if (!user?.id || !token) return;
    
    let aborted = false;
    (async () => {
      try {
        setLoading(true);
        
        if (tab === 'tickets') {
          const r = await apiAuthFetch(`/api/users/${user.id}/tickets`, {}, token);
          const j = await r.json();
          if (!aborted) setTickets(Array.isArray(j) ? j : []);
        } else {
          const r = await apiAuthFetch(`/api/users/${user.id}/sales`, {}, token);
          const j = await r.json();
          if (!aborted) setSales(Array.isArray(j) ? j : []);
        }
      } catch (err) {
        console.error('Error loading data:', err);
      } finally { 
        if (!aborted) setLoading(false); 
      }
    })();
    return () => { aborted = true; };
  }, [tab, user?.id, token]);

  return (
    <div>
      <h1>Mi Perfil</h1>
      
      {user && (
        <div style={{ marginBottom: 16, padding: 12, background: '#f8f9fa', borderRadius: 6 }}>
          <div style={{ fontSize: 14, color:'#666', marginBottom: 4 }}>Bienvenido/a</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{user.name}</div>
          <div style={{ fontSize: 14, color: '#666' }}>{user.email}</div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
            Rol: <span style={{ fontWeight: 600 }}>{user.role}</span>
          </div>
        </div>
      )}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <button onClick={()=>setTab('tickets')} disabled={tab==='tickets'}>Mis entradas</button>
        <button onClick={()=>setTab('sales')} disabled={tab==='sales'}>Mis compras</button>
      </div>

      {tab==='tickets' && (
        <div>
          {loading && <div>Cargando entradas…</div>}
          {!loading && tickets.length===0 && <div>No tenés entradas aún.</div>}
          {!loading && tickets.length>0 && (
            <div style={{ display: 'grid', gap: 16 }}>
              {tickets.map(t => (
                <div key={t.id} style={{ 
                  padding: 16, 
                  border: '1px solid #ddd', 
                  borderRadius: 8,
                  background: t.status === 'validated' ? '#f0f9ff' : 'white'
                }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                      {t.session?.show?.title || 'Show'}
                    </div>
                    <div style={{ fontSize: 14, color: '#666' }}>
                      📅 {t.session?.show?.date} • 🕐 {t.session?.show?.time}
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: 12, fontSize: 14 }}>
                    <div>📍 Sector: <strong>{t.section}</strong></div>
                    {t.type === 'butaca' && <div>💺 Asiento: <strong>{t.seat_code}</strong></div>}
                    {t.type === 'palco' && <div>🏛️ Palco: <strong>{t.seat_code}</strong></div>}
                    {t.type === 'pullman' && <div>🪑 Pullman</div>}
                  </div>
                  
                  <div style={{ 
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    marginBottom: 12,
                    background: t.status === 'validated' ? '#10b981' : '#3b82f6',
                    color: 'white'
                  }}>
                    {t.status === 'sold' && '🎟️ Comprada'}
                    {t.status === 'validated' && '✅ Validada'}
                    {t.status === 'blocked' && '🚫 Bloqueada'}
                  </div>
                  
                  {t.validated_at && (
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                      Validada el {new Date(t.validated_at).toLocaleString()}
                    </div>
                  )}
                  
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {t.qr_code && (
                      <button 
                        onClick={() => setSelectedTicket(t)}
                        style={{
                          padding: '8px 16px',
                          background: '#6366f1',
                          color: 'white',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 600
                        }}
                      >
                        📱 Ver QR
                      </button>
                    )}
                    <button 
                      onClick={() => alert('Próximamente: enviar por email')}
                      style={{
                        padding: '8px 16px',
                        background: '#e5e7eb',
                        color: '#374151',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 14
                      }}
                    >
                      📧 Enviar por email
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QR Modal */}
      {selectedTicket && (
        <div 
          onClick={() => setSelectedTicket(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              padding: 24,
              borderRadius: 12,
              maxWidth: 400,
              width: '90%',
              textAlign: 'center'
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 16 }}>Tu Entrada</h2>
            <div style={{ marginBottom: 12 }}>
              <strong>{selectedTicket.session?.show?.title}</strong>
            </div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
              {selectedTicket.session?.show?.date} • {selectedTicket.session?.show?.time}
              <br />
              {selectedTicket.section} 
              {selectedTicket.seat_code && ` - ${selectedTicket.seat_code}`}
            </div>
            
            {selectedTicket.qr_code && (
              <div style={{ marginBottom: 16 }}>
                <img 
                  src={selectedTicket.qr_code} 
                  alt="QR Code"
                  style={{ 
                    maxWidth: '100%', 
                    height: 'auto',
                    border: '4px solid #ddd',
                    borderRadius: 8
                  }}
                />
              </div>
            )}
            
            <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
              Mostrá este código en el acceso al evento
            </div>
            
            <button
              onClick={() => setSelectedTicket(null)}
              style={{
                padding: '10px 24px',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {tab==='sales' && (
        <div>
          {loading && <div>Cargando compras…</div>}
          {!loading && sales.length===0 && <div>No tenés compras aún.</div>}
          {!loading && sales.length>0 && (
            <ul>
              {sales.map(s => (
                <li key={s.id} style={{ marginBottom:8 }}>
                  <div><strong>{s.session?.show?.title || 'Show'}</strong></div>
                  <div>Fecha: {s.session?.show?.date} {s.session?.show?.time}</div>
                  <div>Método: {s.payment_method} • Total: ${Number(s.total_amount||0)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
