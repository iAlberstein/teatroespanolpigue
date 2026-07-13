import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getAPIUrl } from '../lib/api';
import { formatDate } from '../lib/dateFormatter.js';

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
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '32px', fontSize: '2rem', fontWeight: 'bold' }}>🎭 Cartelera</h1>
      
      {shows.length === 0 ? (
        <p style={{ color: '#666' }}>No hay funciones disponibles en este momento.</p>
      ) : (
        <div className="cartelera-grid">
          {shows.map(s => {
            // Usar fecha de primera sesión o fecha legacy
            const dateSource = s.first_session?.starts_at || s.date;
            const dateStr = dateSource ? formatDate(dateSource) : 'Fecha a confirmar';
            
            // URL de imagen - construir URL completa si es ruta relativa
            let imageUrl = '/placeholder-show.jpg';
            if (s.image_url) {
              // Si la URL empieza con /media, agregar el API URL
              if (s.image_url.startsWith('/media')) {
                imageUrl = `${getAPIUrl()}${s.image_url}`;
              } else {
                imageUrl = s.image_url;
              }
            }
            
            return (
              <Link 
                key={s.id}
                to={`/cartelera/${s.id}`}
                className="show-card"
              >
                {/* Imagen */}
                <div className="show-card-image">
                  <img 
                    src={imageUrl}
                    alt={s.title}
                    onError={(e) => {
                      console.error('[CARTELERA] Error loading image:', imageUrl);
                      e.target.src = '/placeholder-show.jpg';
                    }}
                  />
                </div>
                
                {/* Contenido */}
                <div className="show-card-content">
                  <h3>{s.title}</h3>
                  <p>📅 {dateStr}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      
      {/* CSS */}
      <style>{`
        .cartelera-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 24px;
        }
        
        .show-card {
          text-decoration: none;
          color: inherit;
          display: block;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          transition: transform 0.2s, box-shadow 0.2s;
          background: #fff;
        }
        
        .show-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }
        
        .show-card-image {
          width: 100%;
          padding-top: 150%; /* Ratio 2:3 (vertical) */
          position: relative;
          background: #f0f0f0;
        }
        
        .show-card-image img {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .show-card-content {
          padding: 16px;
        }
        
        .show-card-content h3 {
          margin: 0 0 8px 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #212529;
        }
        
        .show-card-content p {
          margin: 0;
          color: #6c757d;
          font-size: 0.9rem;
        }
        
        /* Mobile: Cards horizontales */
        @media (max-width: 768px) {
          .cartelera-grid {
            grid-template-columns: 1fr;
          }
          
          .show-card {
            display: flex;
            flex-direction: row;
          }
          
          .show-card-image {
            width: 120px;
            padding-top: 0;
            height: 160px;
            flex-shrink: 0;
          }
          
          .show-card-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
