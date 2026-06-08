import React from 'react';

const PullmanCounter = ({
  pullmanSelected,
  pullmanAvailable,
  onPullmanChange,
  cellSize
}) => {
  const pullmanButtonSize = Math.max(24, Math.round(cellSize * 0.9));
  const pullmanButtonFont = Math.max(14, Math.round(cellSize * 0.55));
  const pullmanBadgePadding = Math.round(Math.max(6, cellSize * 0.34));
  const pullmanBadgeFont = Math.max(12, Math.round(cellSize * 0.48));
  const pullmanTitleFont = Math.max(16, Math.round(cellSize * 0.75));
  const pullmanInfoFont = Math.max(10, Math.round(cellSize * 0.4));

  return (
    <div
      style={{
        background: '#c0c0c0',
        fontWeight: 600,
        border: '1px solid #9ca3af',
        borderRadius: Math.max(8, Math.round(cellSize * 0.45)),
        padding: `${Math.max(8, Math.round(cellSize * 0.35))}px ${Math.max(12, Math.round(cellSize * 0.6))}px`
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: Math.max(8, Math.round(cellSize * 0.45))
        }}
      >
        <div style={{ fontSize: `${pullmanTitleFont}px`, letterSpacing: '1px', color: '#1f2937' }}>PULLMAN</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: Math.max(6, Math.round(cellSize * 0.35)) }}>
          <button
            aria-label="menos"
            onClick={() => onPullmanChange && onPullmanChange(-1)}
            disabled={pullmanSelected <= 0}
            style={{
              width: pullmanButtonSize,
              height: pullmanButtonSize,
              borderRadius: Math.round(pullmanButtonSize / 2),
              background: pullmanSelected <= 0 ? '#fcdada' : '#f87171',
              border: '1px solid rgba(220,38,38,0.4)',
              color: '#fff',
              fontSize: pullmanButtonFont,
              fontWeight: 700,
              cursor: pullmanSelected <= 0 ? 'not-allowed' : 'pointer'
            }}
          >
            −
          </button>
          <span
            style={{
              background: '#ffffff',
              padding: `${pullmanBadgePadding}px ${pullmanBadgePadding + 6}px`,
              borderRadius: Math.max(10, Math.round(cellSize * 0.4)),
              fontSize: pullmanBadgeFont,
              fontWeight: 700,
              color: '#111827',
              minWidth: Math.max(44, Math.round(cellSize * 1.6)),
              textAlign: 'center',
              border: '1px solid #9ca3af'
            }}
          >
            {pullmanSelected}
          </span>
          <button
            aria-label="más"
            onClick={() => onPullmanChange && onPullmanChange(1)}
            disabled={pullmanAvailable <= 0}
            style={{
              width: pullmanButtonSize,
              height: pullmanButtonSize,
              borderRadius: Math.round(pullmanButtonSize / 2),
              background: pullmanAvailable <= 0 ? '#d1fae5' : '#34d399',
              border: '1px solid rgba(16,185,129,0.4)',
              color: '#065f46',
              fontSize: pullmanButtonFont,
              fontWeight: 700,
              cursor: pullmanAvailable <= 0 ? 'not-allowed' : 'pointer'
            }}
          >
            +
          </button>
        </div>
        <div style={{ textAlign: 'right', fontSize: `${pullmanInfoFont}px`, color: '#1f2937', lineHeight: 1.2 }}>
          <div>Disponibles</div>
          <div style={{ fontSize: `${Math.max(14, Math.round(cellSize * 0.6))}px`, fontWeight: 700 }}>{pullmanAvailable}</div>
        </div>
      </div>
    </div>
  );
};

export default PullmanCounter;
