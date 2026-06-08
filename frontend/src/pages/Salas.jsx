import { useState, useEffect } from 'react';
import { salasData } from '../data/salasData.js';
import { theme } from '../styles/theme.js';

const infoPillStyle = {
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  background: theme.colors.surface,
  borderRadius: theme.borderRadius.full,
  fontSize: theme.typography.tiny,
  color: theme.colors.textSecondary,
  border: `1px solid ${theme.colors.border}`
};

const SectionTitle = ({ kicker, title }) => (
  <div style={{ marginBottom: theme.spacing.lg }}>
    {kicker && (
      <p style={{
        fontSize: theme.typography.tiny,
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.xs
      }}>
        {kicker}
      </p>
    )}
    <h2 style={{
      fontSize: theme.typography.h2,
      color: theme.colors.textPrimary,
      margin: 0
    }}>
      {title}
    </h2>
  </div>
);

function SalaCard({ sala, isActive, onSelect }) {
  const isLasGemelas = sala.id === 'las_gemelas';

  return (
    <button
      type="button"
      onClick={() => onSelect(sala)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        textAlign: 'left',
        borderRadius: theme.borderRadius.xl,
        border: `1px solid ${isActive ? theme.colors.primary : theme.colors.border}`,
        overflow: 'hidden',
        background: theme.colors.surface,
        boxShadow: isActive ? theme.shadows.lg : theme.shadows.sm,
        transform: isActive ? 'translateY(-4px)' : 'none',
        transition: `${theme.transitions.normal}, transform 200ms`,
        cursor: 'pointer'
      }}
    >
      <div style={{ position: 'relative', width: '100%', paddingBottom: '62%' }}>
        <img
          src={sala.imagenes[0]}
          alt={sala.nombre}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: isLasGemelas ? 'blur(6px)' : 'none',
            transform: isLasGemelas ? 'scale(1.05)' : 'none'
          }}
        />
      </div>
      <div style={{ padding: theme.spacing.lg, flex: 1 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.sm
        }}>
          <h3 style={{
            margin: 0,
            fontSize: theme.typography.h4,
            color: theme.colors.textPrimary
          }}>
            {sala.nombre}
          </h3>
          <span style={{
            ...infoPillStyle,
            fontWeight: theme.typography.semibold,
            color: theme.colors.primaryDark
          }}>
            {sala.capacidad} personas
          </span>
        </div>
        <p style={{
          margin: 0,
          color: theme.colors.textSecondary,
          lineHeight: 1.5
        }}>
          {sala.descripcion}
        </p>
        <div style={{
          marginTop: theme.spacing.lg,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          color: theme.colors.primaryDark,
          fontWeight: theme.typography.semibold
        }}>
          Ver detalles →
        </div>
      </div>
    </button>
  );
}

function RoomModal({ sala, onClose }) {
  const [activeImage, setActiveImage] = useState(sala.imagenes?.[0] ?? null);
  const isLasGemelas = sala.id === 'las_gemelas';

  useEffect(() => {
    setActiveImage(sala.imagenes?.[0] ?? null);
  }, [sala]);

  const techSections = [
    { label: 'Sonido', data: sala.tecnica.sonido },
    { label: 'Iluminación', data: sala.tecnica.iluminacion },
    { label: 'Escenario', data: sala.tecnica.escenario },
    { label: 'Extras', data: sala.tecnica.extras }
  ];

  const metrics = [
    { label: 'Boca de escena', value: sala.medidas.bocaEscena },
    { label: 'Profundidad', value: sala.medidas.profundidad },
    { label: 'Altura / Peine', value: sala.medidas.peine || sala.medidas.altura },
  ].filter(Boolean);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.md,
        zIndex: 1000
      }}
    >
      <div
        style={{
          width: 'min(960px, 100%)',
          background: theme.colors.surface,
          borderRadius: theme.borderRadius.xl,
          padding: theme.spacing['2xl'],
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: theme.shadows.xl
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: theme.spacing.lg,
          flexWrap: 'wrap'
        }}>
          <div style={{ flex: '1 1 300px' }}>
            <p style={{ ...infoPillStyle, display: 'inline-flex' }}>Ficha técnica</p>
            <h2 style={{ marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
              {sala.nombre}
            </h2>
            <p style={{ color: theme.colors.textSecondary, lineHeight: 1.5 }}>
              {sala.descripcion}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: theme.typography.h3,
              cursor: 'pointer',
              color: theme.colors.textSecondary
            }}
            aria-label="Cerrar detalle de sala"
          >
            ×
          </button>
        </div>

        {activeImage && (
          <>
            <div style={{
              marginTop: theme.spacing['2xl'],
              borderRadius: theme.borderRadius.lg,
              overflow: 'hidden',
              border: `1px solid ${theme.colors.border}`
            }}>
              <img
                src={activeImage}
                alt={`${sala.nombre} seleccionada`}
                style={{
                  width: '100%',
                  display: 'block',
                  objectFit: 'cover',
                  filter: isLasGemelas ? 'blur(8px)' : 'none',
                  transform: isLasGemelas ? 'scale(1.03)' : 'none'
                }}
              />
            </div>
            {sala.imagenes?.length > 1 && (
              <div style={{
                display: 'flex',
                gap: theme.spacing.sm,
                marginTop: theme.spacing.md,
                overflowX: 'auto',
                paddingBottom: theme.spacing.sm
              }}>
                {sala.imagenes.map((image) => {
                  const isActive = image === activeImage;
                  return (
                    <button
                      type="button"
                      key={image}
                      onClick={() => setActiveImage(image)}
                      style={{
                        borderRadius: theme.borderRadius.md,
                        padding: 0,
                        border: `2px solid ${isActive ? theme.colors.primary : theme.colors.border}`,
                        background: 'transparent',
                        cursor: 'pointer',
                        flex: '0 0 96px',
                        height: 72,
                        overflow: 'hidden'
                      }}
                      aria-label={`Ver imagen de ${sala.nombre}`}
                    >
                      <img
                        src={image}
                        alt={`${sala.nombre} miniatura`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          filter: isLasGemelas ? 'blur(4px)' : 'none',
                          transform: isLasGemelas ? 'scale(1.05)' : 'none'
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: theme.spacing.md,
          marginTop: theme.spacing['2xl']
        }}>
          {metrics.map((metric) => (
            <div key={metric.label} style={{
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.borderRadius.lg,
              padding: theme.spacing.md,
              background: theme.colors.surface
            }}>
              <p style={{
                margin: 0,
                fontSize: theme.typography.tiny,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: theme.colors.textMuted
              }}>
                {metric.label}
              </p>
              <p style={{
                margin: 0,
                marginTop: theme.spacing.xs,
                fontSize: theme.typography.h4,
                color: theme.colors.textPrimary
              }}>
                {metric.value}
              </p>
            </div>
          ))}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: theme.spacing.lg,
          marginTop: theme.spacing['2xl']
        }}>
          {techSections.map((section) => (
            <div key={section.label} style={{
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.borderRadius.lg,
              padding: theme.spacing.lg
            }}>
              <p style={{
                margin: 0,
                marginBottom: theme.spacing.sm,
                fontSize: theme.typography.small,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: theme.colors.textMuted
              }}>
                {section.label}
              </p>
              <ul style={{
                margin: 0,
                paddingLeft: theme.spacing.lg,
                color: theme.colors.textPrimary,
                lineHeight: 1.5
              }}>
                {section.data.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: theme.spacing['2xl'],
          display: 'flex',
          flexWrap: 'wrap',
          gap: theme.spacing.md
        }}>

        </div>
      </div>
    </div>
  );
}

export default function Salas() {
  const [activeSala, setActiveSala] = useState(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: isMobile ? theme.spacing.md : theme.spacing['2xl'],
      background: '#f7f7f8'
    }}>
      <section style={{
        borderRadius: theme.borderRadius.xl,
        padding: isMobile ? theme.spacing.xl : theme.spacing['2xl'],
        marginBottom: theme.spacing['2xl'],
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`
      }}>
        <h1 style={{
          fontSize: isMobile ? theme.typography.h2 : '3rem',
          margin: 0,
          color: theme.colors.textPrimary
        }}>
          Salas del Teatro Español Pigüé
        </h1>
        <p style={{
          marginTop: theme.spacing.md,
          marginBottom: 0,
          maxWidth: 640,
          color: theme.colors.textSecondary,
          lineHeight: 1.6
        }}>
          Conocé nuestros espacios, cada uno con una personalidad única, diseñados para acompañar espectáculos, presentaciones, actividades sociales, charlas, nuevos proyectos, giras y producciones locales. Seleccioná una sala para explorar su ficha técnica.
        </p>
      </section>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: theme.spacing.lg
      }}>
        {salasData.map((sala) => (
          <SalaCard
            key={sala.id}
            sala={sala}
            isActive={activeSala?.id === sala.id}
            onSelect={setActiveSala}
          />
        ))}
      </div>

      {activeSala && (
        <RoomModal
          sala={activeSala}
          onClose={() => setActiveSala(null)}
        />
      )}
    </div>
  );
}
