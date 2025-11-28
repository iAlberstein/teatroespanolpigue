import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

export default function Cartelera(){
  const [shows, setShows] = useState([]);
  useEffect(() => {
    apiFetch('/api/shows')
      .then(r=>r.json())
      .then(data => {
        setShows(data);
      })
      .catch(err => {
        console.error('[CARTELERA] Error:', err);
        setShows([]);
      });
  }, []);
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1>🎭 Cartelera</h1>
      <div style={{ marginTop: 24 }}>
        {shows.length === 0 ? (
          <p style={{ color: '#666' }}>No hay funciones disponibles en este momento.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {shows.map(s => {
              const date = new Date(s.date);
              const dateStr = date.toLocaleDateString('es-AR', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              });
              
              return (
                <li key={s.id} style={{ 
                  marginBottom: 16, 
                  padding: 16, 
                  background: '#f8f9fa',
                  borderRadius: 8,
                  border: '1px solid #dee2e6'
                }}>
                  <Link 
                    to={`/cartelera/${s.id}`}
                    style={{ 
                      textDecoration: 'none', 
                      color: '#212529',
                      display: 'block'
                    }}
                  >
                    <h3 style={{ margin: '0 0 8px 0', color: '#0d6efd' }}>
                      {s.title}
                    </h3>
                    <p style={{ margin: 0, color: '#6c757d' }}>
                      📅 {dateStr}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
