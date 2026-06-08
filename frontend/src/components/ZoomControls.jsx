import React from 'react';

const ZoomControls = ({ zoomIn, zoomOut, isVisible = true }) => {
  if (!isVisible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'rgba(255,255,255,0.9)',
        borderRadius: 999,
        padding: '4px 6px',
        boxShadow: '0 2px 6px rgba(15,23,42,0.15)',
        zIndex: 2
      }}
    >
      <span style={{ fontSize: 11, color: '#6b7280' }}>Zoom</span>
      <button
        type="button"
        onClick={zoomOut}
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          border: '1px solid #d1d5db',
          background: '#ffffff',
          color: '#111827',
          fontSize: 16,
          fontWeight: 600,
          cursor: 'pointer'
        }}
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        type="button"
        onClick={zoomIn}
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          border: '1px solid #d1d5db',
          background: '#ffffff',
          color: '#111827',
          fontSize: 16,
          fontWeight: 600,
          cursor: 'pointer'
        }}
        aria-label="Zoom in"
      >
        +
      </button>
    </div>
  );
};

export default ZoomControls;
