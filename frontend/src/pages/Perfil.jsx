import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiAuthFetch, apiFetch, API_URL } from '../lib/api';
import { io } from 'socket.io-client';
import { formatDateLong, formatTime } from '../lib/dateFormatter.js';

const DEFAULT_INSTRUCTIONS = [
  'Presentá tu QR en la entrada del teatro',
  'Recordá llegar al menos 30 minutos antes, las funciones comienzan puntual',
  'Una vez comenzada la función, la ubicación pierde validez (el personal de la sala te asignará un nuevo lugar)',
  'Podés compartir tus entradas por WhatsApp o Email',
  'Las entradas no tienen cambio ni devolución, excepto en casos de cancelación/modificación del espectáculo'
];

export default function Perfil(){
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('proximos');
  const [tickets, setTickets] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [selectedSale, setSelectedSale] = useState(null); // para QR contenedor
  const [viewEntriesSaleId, setViewEntriesSaleId] = useState(null); // para "ver entradas" de una compra
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [ticketInstructions, setTicketInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [ticketInfoLines, setTicketInfoLines] = useState([]);
  
  // Track screen size for responsive
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cargar configuración de entradas (indicaciones y líneas de info)
  useEffect(() => {
    const loadTicketSettings = async () => {
      try {
        const [instrRes, linesRes] = await Promise.all([
          apiFetch('/api/settings/ticket_instructions'),
          apiFetch('/api/settings/ticket_info_lines')
        ]);
        const instrData = await instrRes.json();
        const linesData = await linesRes.json();
        if (instrData.value) {
          try { setTicketInstructions(JSON.parse(instrData.value)); } catch { /* keep default */ }
        }
        if (linesData.value) {
          try { setTicketInfoLines(JSON.parse(linesData.value)); } catch { /* keep empty */ }
        }
      } catch (err) {
        console.error('Error loading ticket settings:', err);
      }
    };
    loadTicketSettings();
  }, []);
  
  // Estado para modal de email
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailModalData, setEmailModalData] = useState({ type: null, id: null });
  const [emailInput, setEmailInput] = useState('');

  // Función para cargar datos (memoizada para evitar loops infinitos)
  const loadData = useCallback(async () => {
    if (!user?.id || !token) return;
    try {
      setLoading(true);
      const rt = await apiAuthFetch(`/api/users/${user.id}/tickets`, {}, token)
        .then(r=>r.json())
        .catch(err => {
          console.error('Error loading tickets:', err);
          return { active: [], used: [] };
        });
      
      // El backend devuelve { active: [], used: [] }, convertir a array plano
      const allTickets = [...(rt.active || []), ...(rt.used || [])];
      setTickets(allTickets);
      setSales([]); // No se usa, dejarlo vacío
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, token]);

  // Cargar datos una vez y refrescar al cambiar usuario
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Socket.io: escuchar validaciones en tiempo real
  useEffect(() => {
    if (!user?.id) return;
    
    const socket = io(API_URL, { 
      transports: ['websocket', 'polling'],
      reconnection: true 
    });
    
    socket.on('tickets_validated', (data) => {
      // Si las entradas validadas pertenecen a este usuario, recargar
      if (data.user_id === user.id) {
        loadData();
      }
    });
    
    return () => {
      socket.disconnect();
    };
  }, [user?.id, loadData]);
  
  // Agrupar tickets por sale_id para crear las ventas
  const groupedSales = useMemo(() => {
    if (!tickets || tickets.length === 0) return [];
    
    const salesMap = new Map();
    tickets.forEach(ticket => {
      if (!ticket.sale_id) return;
      
      if (!salesMap.has(ticket.sale_id)) {
        // Crear la estructura de venta desde el primer ticket
        salesMap.set(ticket.sale_id, {
          id: ticket.sale_id,
          session: {
            show: {
              title: ticket.show_title,
              image_url: ticket.show_image_url
            },
            starts_at: ticket.session_starts_at,
            function_name: ticket.function_name || null
          },
          tickets: [],
          all_used: true, // Asumimos todos usados hasta que encontremos uno activo
          any_validated: false,
          validated_at: null
        });
      }
      
      const sale = salesMap.get(ticket.sale_id);
      sale.tickets.push(ticket);
      
      // Si encontramos un ticket NO usado, la venta está activa
      if (!ticket.used) {
        sale.all_used = false;
      }
      
      // Registrar validaciones
      if (ticket.validated_at) {
        sale.any_validated = true;
        if (!sale.validated_at || new Date(ticket.validated_at) > new Date(sale.validated_at)) {
          sale.validated_at = ticket.validated_at;
        }
      }
    });
    
    return Array.from(salesMap.values());
  }, [tickets]);

  const upcomingSales = useMemo(() => {
    // Próximos = ventas donde NO todos los tickets están usados (all_used = false)
    return groupedSales.filter(s => !s.all_used)
      .sort((a,b)=> new Date(a.session?.starts_at) - new Date(b.session?.starts_at));
  }, [groupedSales]);

  const pastSales = useMemo(() => {
    // Historial = ventas donde TODOS los tickets están usados (all_used = true)
    return groupedSales.filter(s => s.all_used)
      .sort((a,b)=> new Date(b.session?.starts_at) - new Date(a.session?.starts_at));
  }, [groupedSales]);

  const fmtDate = (iso) => formatDateLong(iso);
  const fmtTime = (iso) => formatTime(iso);

  // Compartir por Email - Abrir modal (QR CONTENEDOR desde listado general)
  const handleShareEmail = (saleId) => {
    setEmailInput(user?.email || '');
    setEmailModalData({ type: 'container', id: saleId }); // Cambiar 'sale' a 'container'
    setEmailModalOpen(true);
  };
  
  // Enviar email desde modal
  const sendEmailFromModal = async () => {
    if (!emailInput || emailInput.trim() === '') {
      alert('Por favor ingresá un email válido');
      return;
    }
    
    const { type, id } = emailModalData;
    let endpoint = '';
    let body = {};
    
    if (type === 'sale') {
      endpoint = '/api/payments/email-sale';
      body = { sale_id: id, email: emailInput.trim() };
    } else if (type === 'ticket') {
      endpoint = '/api/payments/email-ticket';
      body = { ticket_id: id, email: emailInput.trim() };
    } else if (type === 'container') {
      endpoint = '/api/payments/email-container';
      body = { sale_id: id, email: emailInput.trim() };
    }
    
    try {
      const response = await apiAuthFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      }, token);
      
      if (response.ok) {
        alert('Email enviado exitosamente a ' + emailInput);
        setEmailModalOpen(false);
      } else {
        const error = await response.json();
        alert('Error: ' + (error.message || error.error || 'Error desconocido'));
      }
    } catch (err) {
      console.error('Error al enviar email:', err);
      alert('Error al enviar email: ' + err.message);
    }
  };

  // Compartir todas las entradas por WhatsApp (link HTML)
  const handleShareWhatsApp = async (saleId, showTitle, sessionDate, sessionTime) => {
    try {
      // Usar URL actual (funciona con proxy de Vite/ngrok)
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}/api/share/sale/${saleId}`;
      
      const message = `Hola! Te comparto tus entradas para el show ${showTitle} del día ${sessionDate} a las ${sessionTime}.\n\nVer entradas: ${shareUrl}\n\nRecordá llegar al menos 30 minutos antes y mostrar el QR en el acceso. Una vez comenzada la función, la ubicación pierde validez (el personal de la sala te asignará un nuevo lugar).\n\n(Si no podés acceder al link, es porque no tenés agendado este número. Una vez que lo hagas, podrás acceder)\n\n¡Nos vemos!`;
      
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    } catch (err) {
      console.error('Error al compartir por WhatsApp:', err);
      alert('Error al generar link de compartir');
    }
  };

  // Compartir QR contenedor por WhatsApp
  const handleShareContainerWhatsApp = async (saleId, showTitle, sessionDate, sessionTime) => {
    try {
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}/api/share/sale/${saleId}`;
      
      const message = `Hola! Te comparto el QR general para el show ${showTitle} del día ${sessionDate} a las ${sessionTime}.\n\nVer QR: ${shareUrl}\n\nRecordá llegar al menos 30 minutos antes y mostrar el QR en el acceso. Una vez comenzada la función, la ubicación pierde validez (el personal de la sala te asignará un nuevo lugar).\n\n(Si no podés acceder al link, es porque no tenés agendado este número. Una vez que lo hagas, podrás acceder)\n\n¡Nos vemos!`;
      
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    } catch (err) {
      console.error('Error al compartir por WhatsApp:', err);
      alert('Error al generar link de compartir');
    }
  };

  // Compartir ticket individual por WhatsApp
  const handleShareTicketWhatsApp = async (ticketId, showTitle, sessionDate, sessionTime, location) => {
    try {
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}/api/share/ticket/${ticketId}`;
      
      const message = `Hola! Te comparto tu entrada para el show ${showTitle} del día ${sessionDate} a las ${sessionTime}.\n\nUbicación: ${location}\nVer entrada: ${shareUrl}\n\nRecordá llegar al menos 30 minutos antes y mostrar el QR en el acceso. Una vez comenzada la función, la ubicación pierde validez (el personal de la sala te asignará un nuevo lugar).\n\n(Si no podés acceder al link, es porque no tenés agendado este número. Una vez que lo hagas, podrás acceder)\n\n¡Nos vemos!`;
      
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    } catch (err) {
      console.error('Error al compartir por WhatsApp:', err);
      alert('Error al generar link de compartir');
    }
  };

  // Compartir QR contenedor por Email - Abrir modal
  const handleShareContainerEmail = (saleId) => {
    setEmailInput(user?.email || '');
    setEmailModalData({ type: 'container', id: saleId });
    setEmailModalOpen(true);
  };

  // Compartir ticket individual por Email - Abrir modal
  const handleShareTicketEmail = (ticketId) => {
    setEmailInput(user?.email || '');
    setEmailModalData({ type: 'ticket', id: ticketId });
    setEmailModalOpen(true);
  };

  // Formatear ubicación completa
  const formatFullLocation = (ticket) => {
    if (!ticket) return '';
    const { type, section, seat_code } = ticket;
    
    // Mapear secciones a nombres completos (nuevos y legacy)
    const sectionMap = {
      'platea_general': 'Platea Baja',
      'platea': 'Platea Baja', // legacy
      'palcos_bajos': 'Palco Bajo',
      'palcos_altos': 'Palco Alto',
      'pullman': 'Pullman'
    };
    
    let fullSection = sectionMap[section];
    
    // Si section es genérico 'palco', detectar de seat_code
    if (!fullSection && section === 'palco' && seat_code) {
      const isPB = /^PB/i.test(seat_code);
      fullSection = isPB ? 'Palco Bajo' : 'Palco Alto';
    }
    
    // Fallback
    if (!fullSection) fullSection = section || '';
    
    if (type === 'service') {
      return seat_code || 'Servicio';
    } else if (type === 'butaca') {
      // Platea: "Platea Baja - Fila A - Asiento 1"
      const fila = seat_code ? seat_code.charAt(0).toUpperCase() : '';
      const asiento = seat_code ? seat_code.substring(1) : '';
      return `${fullSection} - Fila ${fila} - Asiento ${asiento}`;
    } else if (type === 'palco') {
      // Palco: "Palco Bajo - Número 3"
      // Extraer solo el número del seat_code (puede ser "PB3" o "PA2")
      const numero = seat_code ? seat_code.replace(/^(PB|PA)\s*/i, '') : '';
      return `${fullSection} - Número ${numero}`;
    } else if (type === 'pullman') {
      return 'Pullman';
    } else if (type === 'general') {
      return 'Entrada General';
    }
    return '';
  };

  // Función para ordenar tickets por prioridad de sección
  const sortTicketsBySection = (ticketsArray) => {
    const sectionPriority = {
      'platea_general': 1,
      'platea': 1, // legacy
      'palcos_bajos': 2,
      'palco_bajo': 2,
      'palcos_altos': 3,
      'palco_alto': 3,
      'pullman': 4
    };

    return [...ticketsArray].sort((a, b) => {
      // Determinar prioridad de a
      let priorityA = sectionPriority[a.section] || 99;
      if (a.type === 'palco' && a.seat_code) {
        priorityA = /^PB/i.test(a.seat_code) ? 2 : 3;
      } else if (a.type === 'butaca') {
        priorityA = 1;
      } else if (a.type === 'pullman') {
        priorityA = 4;
      } else if (a.type === 'general') {
        priorityA = 5;
      } else if (a.type === 'service') {
        priorityA = 6;
      }

      // Determinar prioridad de b
      let priorityB = sectionPriority[b.section] || 99;
      if (b.type === 'palco' && b.seat_code) {
        priorityB = /^PB/i.test(b.seat_code) ? 2 : 3;
      } else if (b.type === 'butaca') {
        priorityB = 1;
      } else if (b.type === 'pullman') {
        priorityB = 4;
      } else if (b.type === 'general') {
        priorityB = 5;
      } else if (b.type === 'service') {
        priorityB = 6;
      }

      // Si tienen misma prioridad, ordenar por seat_code alfanuméricamente
      if (priorityA === priorityB) {
        const seatA = a.seat_code || '';
        const seatB = b.seat_code || '';
        return seatA.localeCompare(seatB, undefined, { numeric: true });
      }

      return priorityA - priorityB;
    });
  };

  // Formateo de ubicación detallada para vista individual
  const formatDetailedLocation = (ticket) => {
    const { type, section, seat_code } = ticket;
    
    // Mapear secciones a nombres completos (nuevos y legacy)
    const sectionMap = {
      'platea_general': 'Platea Baja',
      'platea': 'Platea Baja', // legacy
      'palcos_bajos': 'Palco Bajo',
      'palcos_altos': 'Palco Alto',
      'pullman': 'Pullman'
    };
    
    let fullSection = sectionMap[section];
    
    // Si section es genérico 'palco', detectar de seat_code
    if (!fullSection && section === 'palco' && seat_code) {
      const isPB = /^PB/i.test(seat_code);
      fullSection = isPB ? 'Palco Bajo' : 'Palco Alto';
    }
    
    // Fallback
    if (!fullSection) fullSection = section || '';
    
    if (type === 'butaca') {
      const fila = seat_code ? seat_code.charAt(0).toUpperCase() : '';
      const asiento = seat_code ? seat_code.substring(1) : '';
      return (
        <>
          <div>Sector: <strong>{fullSection}</strong></div>
          <div>Fila: <strong>{fila}</strong></div>
          <div>Butaca: <strong>{asiento}</strong></div>
        </>
      );
    } else if (type === 'palco') {
      // Detectar capacidad basándose en section o seat_code
      let capacity = 2; // Por defecto Palco Alto
      if (section === 'palcos_bajos' || (seat_code && /^PB/i.test(seat_code))) {
        capacity = 4;
      }
      // Extraer solo el número del seat_code (puede ser "PB3" o "PA2")
      const numero = seat_code ? seat_code.replace(/^(PB|PA)\s*/i, '') : '';
      return (
        <>
          <div>Sector: <strong>{fullSection}</strong></div>
          <div>Número: <strong>{numero}</strong></div>
          <div>Capacidad: <strong>{capacity}</strong></div>
        </>
      );
    } else if (type === 'pullman') {
      return <div>Sector: <strong>Pullman</strong></div>;
    } else if (type === 'service') {
      return (
        <>
          <div>Servicio: <strong>{seat_code || 'Servicio'}</strong></div>
          {ticket.capacity > 1 && <div>Personas: <strong>{ticket.capacity}</strong></div>}
        </>
      );
    } else if (type === 'general') {
      return <div>Sector: <strong>Entrada General</strong></div>;
    }
    return null;
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Saludo personalizado */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '700', color: '#111827' }}>
          ¡Hola, {user?.name || 'Usuario'}!
        </h1>
        <p style={{ color: '#6b7280', margin: '8px 0 0 0', fontSize: '1rem' }}>
          Gestioná tus entradas y tu información personal
        </p>
      </div>

      {/* Banner especial para productor */}
      {user?.role === 'productor' && (
        <div
          style={{
            background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            color: 'white',
            padding: isMobile ? '16px' : '24px',
            borderRadius: '12px',
            marginBottom: '24px',
            boxShadow: '0 8px 16px rgba(139, 92, 246, 0.3)',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onClick={() => navigate('/admin')}
          onMouseEnter={(e) => {
            if (!isMobile) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(139, 92, 246, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 8px 16px rgba(139, 92, 246, 0.3)';
          }}
        >
          {isMobile ? (
            /* Mobile Layout - Compacto */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Título principal */}
              <div style={{ fontSize: '20px', fontWeight: 700 }}>
                Reportes
              </div>
              {/* Subtítulo */}
              <div style={{ fontSize: '14px', opacity: 0.9, fontWeight: 500 }}>
                ver reportes de mis shows
              </div>
              {/* Body descriptivo */}
              <div style={{ fontSize: '13px', opacity: 0.85, lineHeight: 1.4, marginTop: '4px' }}>
                Accedé al panel de productor para ver las estadísticas de ventas, asistencia y más información de tus shows.
              </div>
              {/* Flecha indicadora */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <span style={{ fontSize: '20px' }}>→</span>
              </div>
            </div>
          ) : (
            /* Desktop Layout - Original */
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ fontSize: '56px', fontWeight: '700' }}>REPORTES</div>
              <div style={{ flex: 1 }}>
                <h2 style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 700,
                  marginBottom: '8px'
                }}>
                  Ver Reportes de Mis Shows
                </h2>
                <p style={{
                  margin: 0,
                  opacity: 0.95,
                  fontSize: '16px',
                  lineHeight: 1.5
                }}>
                  Accedé al panel de productor para ver las estadísticas de ventas, asistencia y más información de tus shows.
                </p>
              </div>
              <div style={{ fontSize: '32px' }}>→</div>
            </div>
          )}
        </div>
      )}

      {/* Navegación estilo /admin */}
      <div style={{ 
        display: 'flex', 
        gap: '16px',
        marginBottom: '24px',
        borderBottom: '2px solid #e5e7eb',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={() => { setTab('proximos'); setViewEntriesSaleId(null); }}
          style={{
            padding: '12px 24px',
            background: tab === 'proximos' ? '#0d6efd' : 'none',
            border: 'none',
            borderBottom: tab === 'proximos' ? '3px solid #0d6efd' : 'none',
            color: tab === 'proximos' ? 'white' : '#6b7280',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
            marginBottom: '-2px',
            transition: 'all 0.2s',
            borderRadius: tab === 'proximos' ? '4px 4px 0 0' : 0
          }}
        >
          Mis próximos eventos
        </button>
        
        <button
          onClick={() => { setTab('historial'); setViewEntriesSaleId(null); }}
          style={{
            padding: '12px 24px',
            background: tab === 'historial' ? '#0d6efd' : 'none',
            border: 'none',
            borderBottom: tab === 'historial' ? '3px solid #0d6efd' : 'none',
            color: tab === 'historial' ? 'white' : '#6b7280',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
            marginBottom: '-2px',
            transition: 'all 0.2s',
            borderRadius: tab === 'historial' ? '4px 4px 0 0' : 0
          }}
        >
          Eventos pasados
        </button>
        
        <button
          onClick={() => { setTab('info'); setViewEntriesSaleId(null); }}
          style={{
            padding: '12px 24px',
            background: tab === 'info' ? '#0d6efd' : 'none',
            border: 'none',
            borderBottom: tab === 'info' ? '3px solid #0d6efd' : 'none',
            color: tab === 'info' ? 'white' : '#6b7280',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
            marginBottom: '-2px',
            transition: 'all 0.2s',
            borderRadius: tab === 'info' ? '4px 4px 0 0' : 0
          }}
        >
          Mi información personal
        </button>
      </div>

      {tab==='proximos' && !viewEntriesSaleId && (
        <div>
          {loading && <div>Cargando próximos…</div>}
          {!loading && upcomingSales.length===0 && (
            <div>No tenés próximos espectáculos. Cuando compres, verás aquí tus próximas funciones.</div>
          )}
          {!loading && upcomingSales.length>0 && (
            <>
            {/* Indicaciones previas al show */}
            {ticketInfoLines.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                {ticketInfoLines.map((line, i) => (
                  <div key={line.id || i} style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '8px',
                    padding: '10px 16px',
                    marginBottom: '8px'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#166534' }}>{line.title}</div>
                    {line.description && <div style={{ fontSize: 13, color: '#166534', marginTop: 2 }}>{line.description}</div>}
                  </div>
                ))}
              </div>
            )}
            <div style={{
              background: '#fff3cd',
              borderLeft: '4px solid #ffc107',
              padding: '16px 20px',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <strong style={{ color: '#856404', display: 'block', marginBottom: '8px' }}>📋 Antes del show:</strong>
              <ul style={{ color: '#856404', margin: 0, paddingLeft: '20px' }}>
                {ticketInstructions.map((instr, i) => (
                  <li key={i} style={{ marginBottom: i < ticketInstructions.length - 1 ? '6px' : 0 }}>{instr}</li>
                ))}
              </ul>
            </div>
            <div style={{ display:'grid', gap:16 }}>
              {upcomingSales.map(s => (
                <div key={s.id} style={{ width:'100%', padding: isMobile ? 12 : 16, border:'1px solid #d1d5db', borderRadius:16, background:'#e8e7d1', boxShadow:'0 2px 4px rgba(0,0,0,0.1)' }}>
                  {isMobile ? (
                    /* Mobile Layout - Vertical */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Header: Imagen + Info */}
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ width: 80, height: 64, flexShrink: 0, overflow: 'hidden', borderRadius: 8, background: '#f3f4f6' }}>
                          {s.session?.show?.image_url ? (
                            <img src={s.session.show.image_url} alt={s.session?.show?.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 10 }}>Sin imagen</div>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.session?.show?.title || 'Espectáculo'}</div>
                          {s.session?.function_name && <div style={{ color: '#374151', fontSize: 13, fontWeight: 600, marginTop: 2 }}>{s.session.function_name}</div>}
                          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>
                            {fmtDate(s.session?.starts_at)}
                          </div>
                          <div style={{ color: '#6b7280', fontSize: 13 }}>
                            {fmtTime(s.session?.starts_at)} hs
                          </div>
                        </div>
                      </div>
                      {/* Botones en 2 filas */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button onClick={()=>setSelectedSale(s)} style={{ padding: '10px 8px', background: '#111827', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                          QR de acceso
                        </button>
                        <button onClick={()=>setViewEntriesSaleId(s.id)} style={{ padding: '10px 8px', background: '#5758a3ff', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                          Ver entradas
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <button onClick={() => handleShareWhatsApp(s.id, s.session?.show?.title, fmtDate(s.session?.starts_at), fmtTime(s.session?.starts_at))} style={{ padding: '10px 8px', background: '#26894bff', color: 'white', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 13 }}>
                          WhatsApp
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleShareEmail(s.id); }} style={{ padding: '10px 8px', background: '#374151', color: 'white', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 13 }}>
                          Email
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Desktop Layout - Horizontal */
                    <div style={{ display:'grid', gridTemplateColumns:'120px 1px 1fr 1px auto 1px auto 1px auto', gap:16, alignItems:'center' }}>
                      {/* 1) Imagen */}
                      <div style={{ width:120, minHeight:96, overflow:'hidden', borderRadius:8, background:'#f3f4f6' }}>
                        {s.session?.show?.image_url ? (
                          <img src={s.session.show.image_url} alt={s.session?.show?.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                        ) : (
                          <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#9ca3af', fontSize:12 }}>Sin imagen</div>
                        )}
                      </div>
                      {/* Separador */}
                      <div style={{ width:1, height:'100%', background:'#d1d5db' }}></div>
                      {/* 2) Título + fecha/hora + QR de acceso */}
                      <div style={{ minWidth:0, textAlign:'center', padding:'0 8px' }}>
                        <div style={{ fontSize:18, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.session?.show?.title || 'Espectáculo'}</div>
                        {s.session?.function_name && <div style={{ color:'#374151', marginTop:4, fontWeight:600 }}>{s.session.function_name}</div>}
                        <div style={{ color:'#6b7280', marginTop:4 }}>
                          {fmtDate(s.session?.starts_at)} - {fmtTime(s.session?.starts_at)}
                        </div>
                        {s.container_qr_code && (
                          <div style={{ marginTop:10 }}>
                            <button onClick={()=>setSelectedSale(s)} style={{ padding:'8px 12px', background:'#111827', color:'white', border:'none', borderRadius:8, fontWeight:600, cursor:'pointer' }}>QR de acceso</button>
                          </div>
                        )}
                      </div>
                      {/* Separador */}
                      <div style={{ width:1, height:'100%', background:'#d1d5db' }}></div>
                      {/* 3) Compartir (vertical) */}
                      <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'stretch', minWidth:160, padding:'0 8px' }}>
                        <div style={{ fontSize:12, color:'#6b7280', textAlign:'center' }}>compartí tus entradas</div>
                        <button onClick={() => handleShareWhatsApp(s.id, s.session?.show?.title, fmtDate(s.session?.starts_at), fmtTime(s.session?.starts_at))} style={{ padding:'10px 12px', background:'#26894bff', color:'white', borderRadius:8, fontWeight:600, border:'none', cursor:'pointer', textAlign:'center' }}>WhatsApp</button>
                        <button onClick={(e) => { e.stopPropagation(); handleShareEmail(s.id); }} style={{ padding:'10px 12px', background:'#111827', color:'white', borderRadius:8, fontWeight:600, border:'none', cursor:'pointer', textAlign:'center' }}>Email</button>
                      </div>
                      {/* Separador */}
                      <div style={{ width:1, height:'100%', background:'#d1d5db' }}></div>
                      {/* 4) Ver QR contenedor (botón cuadrado) */}
                      <div style={{ padding:'0 8px' }}>
                        {s.tickets && s.tickets.length > 0 && (s.tickets[0].container_qr_code || s.tickets.some(t => t.container_qr_code)) && (
                          <button onClick={()=>setSelectedSale(s)} style={{ padding:'12px 16px', background:'#111827', color:'white', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', minHeight:80, minWidth:100 }}>
                            <span style={{ textAlign:'center', lineHeight:1.3 }}>Ver<br/>QR</span>
                          </button>
                        )}
                      </div>
                      {/* Separador */}
                      <div style={{ width:1, height:'100%', background:'#d1d5db' }}></div>
                      {/* 5) Ver entradas (botón cuadrado) */}
                      <div style={{ padding:'0 8px' }}>
                        <button onClick={()=>setViewEntriesSaleId(s.id)} style={{ padding:'12px 16px', background:'#5758a3ff', color:'white', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', minHeight:80, minWidth:100 }}>
                          <span style={{ textAlign:'center', lineHeight:1.3 }}>Ver<br/>entradas</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      )}

      {/* Vista de entradas por compra - para próximos y historial */}
      {viewEntriesSaleId && (
        <div>
          <div style={{ marginBottom:12 }}>
            <button onClick={()=>setViewEntriesSaleId(null)} style={{ padding:'8px 12px', background:'#e5e7eb', border:'none', borderRadius:8, cursor:'pointer' }}>← Volver</button>
          </div>
          {(() => {
            // Buscar en upcoming o past según corresponda
            const sale = [...upcomingSales, ...pastSales].find(x => x.id === viewEntriesSaleId);
            const saleTickets = sortTicketsBySection((tickets || []).filter(t => t.sale_id === viewEntriesSaleId));
            if (!sale) return <div>No se encontró la compra.</div>;
            return (
              <div style={{ display:'grid', gap:12 }}>
                {saleTickets.length === 0 && <div>No se encontraron entradas asociadas todavía.</div>}
                {saleTickets.map(t => (
                  <div key={t.id} style={{ width:'100%', padding: isMobile ? 12 : 14, border:'1px solid #d1d5db', borderRadius:12, background:'#e8e7d1', boxShadow:'0 2px 4px rgba(0,0,0,0.1)' }}>
                    {isMobile ? (
                      /* Mobile Layout - Vertical */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Header: Imagen + Info */}
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ width: 70, height: 56, flexShrink: 0, overflow: 'hidden', borderRadius: 8, background: '#f3f4f6' }}>
                            {sale.session?.show?.image_url ? (
                              <img src={sale.session.show.image_url} alt={sale.session?.show?.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 10 }}>Sin imagen</div>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sale.session?.show?.title || 'Espectáculo'}</div>
                            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>
                              {fmtDate(sale.session?.starts_at)} - {fmtTime(sale.session?.starts_at)}
                            </div>
                          </div>
                        </div>
                        {/* Ubicación */}
                        <div style={{ padding: '8px 12px', background: '#f3f4f6', borderRadius: 8 }}>
                          {formatDetailedLocation(t)}
                          {(() => {
                            const currentValidated = t.capacity_validated || 0;
                            const totalCapacity = t.capacity || 1;
                            const isPartiallyValidated = currentValidated > 0 && currentValidated < totalCapacity;
                            const isFullyValidated = t.status === 'validated' || currentValidated >= totalCapacity || !!t.validated_at;
                            if (isPartiallyValidated) {
                              return (
                                <div style={{ marginTop: 8, padding: '4px 8px', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#92400e', textAlign: 'center' }}>
                                  PARCIAL: {currentValidated}/{totalCapacity}
                                </div>
                              );
                            }
                            if (isFullyValidated) {
                              return (
                                <div style={{ marginTop: 8, padding: '4px 8px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#166534', textAlign: 'center' }}>
                                  VALIDADA
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        {/* Botones */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <button onClick={()=>setSelectedTicket(t)} style={{ padding: '10px 6px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>
                            Ver QR
                          </button>
                          <button 
                            onClick={() => handleShareTicketWhatsApp(t.id, sale.session?.show?.title, fmtDate(sale.session?.starts_at), fmtTime(sale.session?.starts_at), formatFullLocation(t))} 
                            style={{ padding: '10px 6px', background: '#26894bff', color: 'white', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 12 }}
                          >
                            WhatsApp
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleShareTicketEmail(t.id); }} 
                            style={{ padding: '10px 6px', background: '#374151', color: 'white', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 12 }}
                          >
                            Email
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Desktop Layout - Horizontal */
                      <div style={{ display:'grid', gridTemplateColumns:'100px 1px 1fr 1px auto 1px auto 1px auto', gap:12, alignItems:'center' }}>
                        {/* 1) Imagen */}
                        <div style={{ width:120, minHeight:96, overflow:'hidden', borderRadius:8, background:'#f3f4f6' }}>
                          {sale.session?.show?.image_url ? (
                            <img src={sale.session.show.image_url} alt={sale.session?.show?.title} style={{ width:'100%', height:'auto', objectFit:'contain' }} />
                          ) : (
                            <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#9ca3af', fontSize:12 }}>Sin imagen</div>
                          )}
                        </div>
                        {/* Separador */}
                        <div style={{ width:1, height:'100%', background:'#d1d5db' }}></div>
                        {/* 2) Título + fecha/hora */}
                        <div style={{ minWidth:0, textAlign:'center', padding:'0 8px' }}>
                          <div style={{ fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{sale.session?.show?.title || 'Espectáculo'}</div>
                          <div style={{ color:'#6b7280', marginTop:2 }}>{fmtDate(sale.session?.starts_at)} - {fmtTime(sale.session?.starts_at)}</div>
                        </div>
                        {/* Separador */}
                        <div style={{ width:1, height:'100%', background:'#d1d5db' }}></div>
                        {/* 3) Ubicación */}
                        <div style={{ flex:1, padding:'0 12px', display:'flex', flexDirection:'column', justifyContent:'center', gap:4 }}>
                          {formatDetailedLocation(t)}
                          {(() => {
                            const currentValidated = t.capacity_validated || 0;
                            const totalCapacity = t.capacity || 1;
                            const isPartiallyValidated = currentValidated > 0 && currentValidated < totalCapacity;
                            const isFullyValidated = t.status === 'validated' || currentValidated >= totalCapacity || !!t.validated_at;

                            if (isPartiallyValidated) {
                              return (
                                <div style={{ 
                                  marginTop: 8, 
                                  padding: '4px 8px', 
                                  background: '#fef3c7', 
                                  border: '1px solid #fbbf24',
                                  borderRadius: 6, 
                                  fontSize: 12, 
                                  fontWeight: 700, 
                                  color: '#92400e',
                                  textAlign: 'center'
                                }}>
                                  VALIDACIÓN PARCIAL: {currentValidated}/{totalCapacity} ingresadas
                                </div>
                              );
                            }

                            if (isFullyValidated) {
                              return (
                                <div style={{ 
                                  marginTop: 8, 
                                  padding: '4px 8px', 
                                  background: '#dcfce7', 
                                  border: '1px solid #86efac',
                                  borderRadius: 6, 
                                  fontSize: 12, 
                                  fontWeight: 700, 
                                  color: '#166534',
                                  textAlign: 'center'
                                }}>
                                  VALIDADA
                                </div>
                              );
                            }

                            return null;
                          })()}
                        </div>
                        {/* Separador */}
                        <div style={{ width:1, height:'100%', background:'#d1d5db' }}></div>
                        {/* 4) Compartir entrada individual (vertical) */}
                        <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'stretch', minWidth:160, padding:'0 8px' }}>
                          <div style={{ fontSize:12, color:'#6b7280', textAlign:'center' }}>Compartir esta entrada</div>
                          <button 
                            onClick={() => handleShareTicketWhatsApp(
                              t.id,
                              sale.session?.show?.title,
                              fmtDate(sale.session?.starts_at),
                              fmtTime(sale.session?.starts_at),
                              formatFullLocation(t)
                            )} 
                            style={{ padding:'8px 10px', background:'#26894bff', color:'white', borderRadius:8, fontWeight:600, border:'none', cursor:'pointer', textAlign:'center' }}
                          >
                            WhatsApp
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleShareTicketEmail(t.id); }} 
                            style={{ padding:'8px 10px', background:'#111827', color:'white', borderRadius:8, fontWeight:600, border:'none', cursor:'pointer', textAlign:'center' }}
                          >
                            Email
                          </button>
                        </div>
                        {/* Separador */}
                        <div style={{ width:1, height:'100%', background:'#d1d5db' }}></div>
                        {/* 5) Ver QR (botón cuadrado) */}
                        <div style={{ padding:'0 8px' }}>
                          {t.qr_code && (
                            <button onClick={()=>setSelectedTicket(t)} style={{ padding:'12px 16px', background:'#6366f1', color:'white', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', minHeight:80, minWidth:80 }}>
                              <span style={{ textAlign:'center', lineHeight:1.3 }}>Ver<br/>QR</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Modal QR de ticket individual */}
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
            <h2 style={{ marginTop: 0, marginBottom: 16 }}>Entrada individual</h2>
            <div style={{ marginBottom: 12, fontSize: 16, fontWeight: 600 }}>
              {(() => {
                const ticketSale = (sales || []).find(s => s.id === selectedTicket.sale_id);
                return ticketSale?.session?.show?.title || 'Espectáculo';
              })()}
            </div>
            {(() => {
              const currentValidated = selectedTicket.capacity_validated || 0;
              const totalCapacity = selectedTicket.capacity || 1;
              const isPartiallyValidated = currentValidated > 0 && currentValidated < totalCapacity;
              const isFullyValidated = selectedTicket.status === 'validated' || currentValidated >= totalCapacity;

              if (isPartiallyValidated) {
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ 
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px', 
                      background: '#fef3c7', 
                      border: '2px solid #fbbf24',
                      borderRadius: 8, 
                      fontSize: 14, 
                      fontWeight: 700, 
                      color: '#92400e'
                    }}>
                      <span style={{ marginRight: 8 }}>
                        {formatFullLocation(selectedTicket)}
                      </span>
                      <span>
                        {currentValidated}/{totalCapacity} ingresadas
                      </span>
                    </div>
                  </div>
                );
              }

              if (isFullyValidated) {
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ 
                      padding: '8px 12px', 
                      background: '#dcfce7', 
                      border: '2px solid #86efac',
                      borderRadius: 8, 
                      fontSize: 14, 
                      fontWeight: 700, 
                      color: '#166534',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      <span> YA INGRESADO — </span>
                      <span>{formatFullLocation(selectedTicket)}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div style={{ fontSize: 15, color: '#374151', marginBottom: 16, fontWeight: 500 }}>
                  {formatFullLocation(selectedTicket)}
                </div>
              );
            })()}
            
            {selectedTicket.qr_code && (
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
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
            
            <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
              Mostrá este código en el acceso al evento
            </div>
            {ticketInfoLines.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {ticketInfoLines.map((line, i) => (
                  <div key={line.id || i} style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 8,
                    padding: '8px 12px',
                    marginBottom: 6,
                    textAlign: 'left'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#166534' }}>{line.title}</div>
                    {line.description && <div style={{ fontSize: 12, color: '#166534', marginTop: 2 }}>{line.description}</div>}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#856404', background: '#fff3cd', padding: '8px 12px', borderRadius: 6, marginBottom: 16, textAlign: 'left' }}>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {ticketInstructions.map((instr, i) => (
                  <li key={i} style={{ marginBottom: i < ticketInstructions.length - 1 ? 4 : 0 }}>{instr}</li>
                ))}
              </ul>
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

      {tab==='historial' && (
        <div>
          {loading && <div>Cargando historial…</div>}
          {!loading && pastSales.length===0 && (
            <div>No hay historial todavía.</div>
          )}
          {!loading && pastSales.length>0 && (
            <div style={{ display:'grid', gap:16 }}>
              {pastSales.map(s => (
                <div key={s.id} style={{ width:'100%', padding:16, border:'1px solid #d1d5db', borderRadius:16, background:'#f3f4f6', boxShadow:'0 2px 4px rgba(0,0,0,0.1)', opacity: 0.85 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'120px 1px 1fr 1px auto 1px auto', gap:16, alignItems:'center' }}>
                    {/* 1) Imagen */}
                    <div style={{ width:120, height:100, overflow:'hidden', borderRadius:12, background:'#e5e7eb' }}>
                      {s.session?.show?.image_url ? (
                        <img src={s.session.show.image_url} alt={s.session?.show?.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      ) : (
                        <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'#9ca3af', fontSize:14 }}>Sin imagen</div>
                      )}
                    </div>
                    {/* Separador */}
                    <div style={{ width:1, height:'100%', background:'#d1d5db' }}></div>
                    {/* 2) Info del show */}
                    <div style={{ minWidth:0, padding:'0 8px' }}>
                      <div style={{ fontWeight:700, fontSize:18, color:'#374151', marginBottom:8 }}>{s.session?.show?.title || 'Espectáculo'}</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:4, fontSize:14 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, color:'#6b7280' }}>
                          <span style={{ fontWeight:600 }}>Fecha:</span>
                          <span>{fmtDate(s.session?.starts_at)}</span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, color:'#6b7280' }}>
                          <span style={{ fontWeight:600 }}>Hora:</span>
                          <span>{fmtTime(s.session?.starts_at)}</span>
                        </div>
                      </div>
                      {/* Badge de completada */}
                      <div style={{ 
                        marginTop: 8, 
                        padding: '4px 8px', 
                        background: '#e0e7ff', 
                        border: '1px solid #818cf8',
                        borderRadius: 6, 
                        fontSize: 12, 
                        fontWeight: 700, 
                        color: '#3730a3',
                        display: 'inline-block'
                      }}>
                        FUNCIÓN COMPLETADA
                      </div>
                    </div>
                    {/* Separador */}
                    <div style={{ width:1, height:'100%', background:'#d1d5db' }}></div>
                    {/* 3) Cantidad de entradas */}
                    <div style={{ textAlign:'center', padding:'0 16px', minWidth:100 }}>
                      <div style={{ fontSize:32, fontWeight:700, color:'#374151' }}>{s.tickets?.length || 0}</div>
                      <div style={{ fontSize:14, color:'#6b7280', fontWeight:600 }}>entradas</div>
                    </div>
                    {/* Separador */}
                    <div style={{ width:1, height:'100%', background:'#d1d5db' }}></div>
                    {/* 4) Ver entradas (igual que próximos) */}
                    <div style={{ padding:'0 8px' }}>
                      <button onClick={()=>setViewEntriesSaleId(s.id)} style={{ padding:'12px 16px', background:'#6b7280', color:'white', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', minHeight:80, minWidth:100 }}>
                        <span style={{ textAlign:'center', lineHeight:1.3 }}>Ver<br/>entradas</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Mi información personal */}
      {tab==='info' && (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ 
            background: 'white', 
            padding: '32px', 
            borderRadius: '12px', 
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb'
          }}>
            <h2 style={{ margin: '0 0 24px 0', fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
              Información Personal
            </h2>
            
            <div style={{ display: 'grid', gap: '20px' }}>
              {/* Nombre */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151' }}>
                  Nombre completo
                </label>
                <input
                  type="text"
                  value={user?.name || ''}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    background: '#f9fafb',
                    fontSize: '1rem',
                    color: '#111827'
                  }}
                />
              </div>

              {/* Email */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={user?.email || ''}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    background: '#f9fafb',
                    fontSize: '1rem',
                    color: '#111827'
                  }}
                />
              </div>

              {/* Teléfono */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151' }}>
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={user?.phone || ''}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    background: '#f9fafb',
                    fontSize: '1rem',
                    color: '#111827'
                  }}
                />
              </div>

              {/* DNI */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151' }}>
                  DNI
                </label>
                <input
                  type="text"
                  value={user?.dni || ''}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    background: '#f9fafb',
                    fontSize: '1rem',
                    color: '#111827'
                  }}
                />
              </div>

              {/* Provincia */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151' }}>
                  Provincia
                </label>
                <input
                  type="text"
                  value={user?.provincia || 'No especificada'}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    background: '#f9fafb',
                    fontSize: '1rem',
                    color: '#111827'
                  }}
                />
              </div>

              {/* Localidad */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151' }}>
                  Localidad
                </label>
                <input
                  type="text"
                  value={user?.localidad || 'No especificada'}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    background: '#f9fafb',
                    fontSize: '1rem',
                    color: '#111827'
                  }}
                />
              </div>

              {/* Nota informativa */}
              <div style={{ 
                marginTop: '16px',
                padding: '16px', 
                background: '#eff6ff', 
                border: '1px solid #bfdbfe',
                borderRadius: '8px'
              }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#1e40af', lineHeight: 1.5 }}>
                  <strong>Nota:</strong> Para modificar tu información personal, por favor contactá con el administrador del teatro.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal QR contenedor (compra) */}
      {selectedSale && (
        <div 
          onClick={() => setSelectedSale(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}
        >
          <div onClick={(e)=>e.stopPropagation()} style={{ background:'white', padding:24, borderRadius:12, width:'90%', maxWidth:420, textAlign:'center' }}>
            <h2 style={{ marginTop:0, marginBottom:16 }}>{selectedSale.session?.show?.title || 'Compra'}</h2>
            <div style={{ fontSize:15, fontWeight:600, color:'#111827', marginBottom:4 }}>QR general de entradas</div>
            <div style={{ fontSize:13, color:'#6b7280', marginBottom:2 }}>Se pueden validar entradas individuales</div>
            <div style={{ fontSize:13, color:'#6b7280', marginBottom:16 }}>Compartile las entradas a quienes vengan aparte</div>
            {(() => {
              const saleTicketsForQr = (tickets || []).filter(t => t.sale_id === selectedSale.id);
              const containerQr = (saleTicketsForQr[0] && saleTicketsForQr[0].container_qr_code) || selectedSale.container_qr_code || null;
              if (!containerQr) return null;
              return (
                <div style={{ marginBottom:16, display:'flex', justifyContent:'center' }}>
                  <img src={containerQr} alt="QR Compra" style={{ maxWidth:'100%', border:'4px solid #ddd', borderRadius:8 }} />
                </div>
              );
            })()}
            <div style={{ fontSize:18, color:'#111827', marginTop:12, textAlign:'center' }}>
              {(() => {
                const saleTickets = sortTicketsBySection((tickets || []).filter(t => t.sale_id === selectedSale.id));
                return saleTickets.map((t, i) => {
                  const currentValidated = t.capacity_validated || 0;
                  const totalCapacity = t.capacity || 1;
                  const isPartiallyValidated = currentValidated > 0 && currentValidated < totalCapacity;
                  const isFullyValidated = 
                    t.status === 'validated' ||
                    currentValidated >= totalCapacity ||
                    !!t.validated_at;

                  if (isPartiallyValidated) {
                    return (
                      <div key={i} style={{ marginBottom:8 }}>
                        <div style={{ 
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 8px', 
                          background: '#fef3c7', 
                          border: '1px solid #fbbf24',
                          borderRadius: 6, 
                          fontSize: 12, 
                          fontWeight: 700, 
                          color: '#92400e'
                        }}>
                          <span style={{ marginRight: 8, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {formatFullLocation(t)}
                          </span>
                          <span>
                            {currentValidated}/{totalCapacity} ingresadas
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (isFullyValidated) {
                    return (
                      <div key={i} style={{ marginBottom:8 }}>
                        <div style={{ 
                          padding: '6px 8px', 
                          background: '#dcfce7', 
                          border: '1px solid #86efac',
                          borderRadius: 6, 
                          fontSize: 12, 
                          fontWeight: 700, 
                          color: '#166534',
                          whiteSpace:'nowrap',
                          overflow:'hidden',
                          textOverflow:'ellipsis'
                        }}>
                          <span> YA INGRESADO — </span>
                          <span>{formatFullLocation(t)}</span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={i}
                      style={{
                        marginBottom:8,
                        fontWeight:600,
                        whiteSpace:'nowrap',
                        overflow:'hidden',
                        textOverflow:'ellipsis'
                      }}
                    >
                      {formatFullLocation(t)}
                    </div>
                  );
                });
              })()}
            </div>
            
            <button onClick={()=>setSelectedSale(null)} style={{ marginTop:16, padding:'10px 20px', background:'#111827', color:'white', border:'none', borderRadius:8, fontWeight:600, cursor:'pointer' }}>Cerrar</button>
          </div>
        </div>
      )}

      {/* Modal para ingresar email */}
      {emailModalOpen && (
        <div 
          onClick={() => setEmailModalOpen(false)}
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
            zIndex: 2000
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              padding: 30,
              borderRadius: 12,
              width: '90%',
              maxWidth: 400,
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 20, color: '#111827' }}>Enviar por Email</h3>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="correo@ejemplo.com"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') sendEmailFromModal();
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 16,
                border: '2px solid #d1d5db',
                borderRadius: 8,
                marginBottom: 20,
                boxSizing: 'border-box',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setEmailModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 16
                }}
              >
                Cancelar
              </button>
              <button
                onClick={sendEmailFromModal}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#111827',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 16
                }}
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
