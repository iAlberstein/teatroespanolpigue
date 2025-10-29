import React, { useMemo } from 'react';
import matrix from './SalaPrincipalMatrix.js';

// Build blocks for all tokens; for merge tokens (ESC, PULL, PA/PB) expand right then down; others are 1x1
function computeBlocks(mat) {
  const rows = mat.length;
  const cols = mat[0].length;
  const used = Array.from({ length: rows }, () => Array(cols).fill(false));
  const blocks = [];
  const isMergeToken = (val) => val === 'ESC' || val === 'PULL' || /^PA\s+\d+$/i.test(val) || /^PB\s+\d+$/i.test(val);
  const inBounds = (r,c) => r>=0 && r<rows && c>=0 && c<cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (used[r][c]) continue;
      const token = mat[r][c];
      if (token === 'XX') { used[r][c] = true; continue; }
      let rs = 1, cs = 1;
      if (isMergeToken(token)) {
        // expand right
        while (inBounds(r, c + cs) && !used[r][c + cs] && mat[r][c + cs] === token) cs++;
        // expand down for same width
        let canGrow = true;
        while (canGrow && inBounds(r + rs, c) && mat[r + rs][c] === token) {
          for (let k = 0; k < cs; k++) {
            if (!inBounds(r + rs, c + k) || used[r + rs][c + k] || mat[r + rs][c + k] !== token) { canGrow = false; break; }
          }
          if (canGrow) rs++;
        }
      }
      // mark used and push block (1x1 for non-merge tokens)
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) used[r + dr][c + dc] = true;
      }
      blocks.push({ r, c, rs, cs, token });
    }
  }
  return blocks;
}

export default function SalaPrincipalGrid({ selectedSeatIds = new Set(), heldByOtherSeatIds = new Set(), soldSeatIds = new Set(), onToggleSeat, selectedPalcosLabels = new Set(), heldByOtherPalcosLabels = new Set(), soldPalcosLabels = new Set(), onTogglePalco, pullmanSelected = 0, pullmanAvailable = 92, onPullmanChange, showPullmanCounter = true }) {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const blocks = useMemo(() => computeBlocks(matrix), []);

  // find row letter for a given row by scanning a single-letter A-M token
  const rowLetter = (r) => {
    for (let c = 0; c < cols; c++) {
      const v = matrix[r][c];
      if (/^[A-M]$/.test(v)) return v;
    }
    return null;
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 28px)`,
    gridTemplateRows: `repeat(${rows}, 28px)`,
    gap: '2px',
    background: '#f5f5dc',
    padding: '10px',
    border: '1px solid #ccc',
    width: 'fit-content'
  };

  const baseCell = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, color: '#333', borderRadius: 4
  };
  const smallCell = { width: '28px', height: '28px' };

  return (
    <div style={gridStyle}>
        {blocks.map((b, i) => {
          const key = `b-${b.r}-${b.c}`;
          const style = { ...baseCell, gridColumn: `${b.c + 1} / span ${b.cs}`, gridRow: `${b.r + 1} / span ${b.rs}` };
          const token = b.token;
          if (token === 'ESC') {
            return <div key={key} style={{ ...style, background:'#000', color:'#fff', fontWeight:700 }}>Escenario</div>;
          }
          if (token === 'PULL') {
            return (
              <div key={key} style={{ ...style, background:'#c0c0c0', fontWeight:600 }}>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <span>Pullman</span>
                  <button aria-label="menos" onClick={() => onPullmanChange && onPullmanChange(-1)} disabled={pullmanSelected<=0} style={{ width:24, height:24, borderRadius:12, background:'#f4a6a6', border:'1px solid #c98888' }}>-</button>
                  <span style={{ background:'#fff', padding:'0 6px', borderRadius:4 }}>{pullmanSelected}</span>
                  <button aria-label="más" onClick={() => onPullmanChange && onPullmanChange(1)} disabled={pullmanAvailable<=0} style={{ width:24, height:24, borderRadius:12, background:'#a8d8a8', border:'1px solid #7fbf7f' }}>+</button>
                  <span style={{ marginLeft:8 }}>Disponibles: {pullmanAvailable}</span>
                </div>
              </div>
            );
          }
          if (/^PA\s+\d+$/i.test(token) || /^PB\s+\d+$/i.test(token)) {
            const isPA = /^PA/i.test(token);
            const label = token;
            const isSelectedPalco = selectedPalcosLabels.has(label);
            const isSold = soldPalcosLabels.has(label);
            const isBlocked = !isSold && heldByOtherPalcosLabels.has(label) && !isSelectedPalco;
            return (
              <button key={key}
                onClick={() => onTogglePalco && onTogglePalco({ label })}
                style={{ ...style, background: isSold ? '#808080' : (isSelectedPalco ? '#ffd700' : (isBlocked ? '#9370db' : (isPA ? '#6b8e6b' : '#8fbc8f'))), color: isPA ? '#fff':'#333', fontWeight:600, cursor: (isSold || isBlocked) ? 'not-allowed' : 'pointer', border: isSelectedPalco ? '2px solid #e0b200' : '1px solid rgba(0,0,0,0.2)', opacity: isSold ? 0.9 : 1 }}
                aria-pressed={isSelectedPalco}
                disabled={isSold || isBlocked}
                title={`${token} (pack ${isPA ? 2 : 4})`}
              >{token}</button>
            );
          }
          if (/^[A-M]$/.test(token)) {
            return <div key={key} style={{ ...style, ...smallCell, background:'transparent', fontWeight:700 }}>{token}</div>;
          }
          if (/^\d+$/.test(token)) {
            const row = rowLetter(b.r);
            const seatId = `${row || ''}${token}`;
            const seatKey = `${b.r}:${b.c}:${row || ''}:${token}`;
            const isSold = soldSeatIds.has(seatId);
            const isSelected = !isSold && selectedSeatIds.has(seatId);
            const isBlocked = !isSold && heldByOtherSeatIds.has(seatId);
            return (
              <button key={key}
                onClick={() => onToggleSeat && onToggleSeat({ r:b.r, c:b.c, val: token, row })}
                style={{ ...style, ...smallCell, cursor: (isSold || isBlocked) ? 'not-allowed' : 'pointer', background: isSold ? '#808080' : (isSelected ? '#ffd700' : (isBlocked ? '#9370db' : '#a8d8a8')), border:'1px solid #7fbf7f', opacity: (isSold || isBlocked) ? 0.9 : 1 }}
                aria-pressed={isSelected}
                disabled={isSold || isBlocked}
                title={row ? `Fila ${row} - Asiento ${token}` : `Asiento ${token}`}
              >{token}</button>
            );
          }
          // fallback
          return <div key={key} style={{ ...style, ...smallCell, background:'#eef0f2' }}>{token}</div>;
        })}
    </div>
  );
}
