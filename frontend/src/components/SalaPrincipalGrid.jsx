import React, { useMemo } from 'react';
import matrix from './SalaPrincipalMatrix.js';
import stepsIcon from '../../media/images/steps.png';
import { getSeatPriceTier, getSeatColor, getSeatBorderColor } from '../lib/seatPriceColors.js';

// Price formatter for tooltips
function formatPrice(price) {
  if (!price) return '';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

// Build blocks for all tokens; for merge tokens (ESC, PULL, PA/PB) expand right then down; others are 1x1
function computeBlocks(mat) {
  const rows = mat.length;
  const cols = mat[0].length;
  const used = Array.from({ length: rows }, () => Array(cols).fill(false));
  const blocks = [];
  const isMergeToken = (val) =>
    val === 'ESC' ||
    val === 'PULL' ||
    /^PA\s+\d+$/i.test(val) ||
    /^PB\s+\d+$/i.test(val) ||
    /^STEP_/i.test(val);
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

export default function SalaPrincipalGrid({
  selectedSeatIds = new Set(),
  heldByOtherSeatIds = new Set(),
  soldSeatIds = new Set(),
  blockedSeatIds = new Set(),
  onToggleSeat,
  selectedPalcosLabels = new Set(),
  heldByOtherPalcosLabels = new Set(),
  soldPalcosLabels = new Set(),
  blockedPalcosLabels = new Set(),
  onTogglePalco,
  pullmanSelected = 0,
  pullmanAvailable = 92,
  onPullmanChange,
  showPullmanCounter = true,
  cellSize = 28,
  mode = 'spectator',
  priceTiers = []  // Array of price tier objects from API
}) {
  const isBlockingMode = mode === 'blocking';
  const rows = matrix.length;
  const cols = matrix[0].length;
  const blocks = useMemo(() => computeBlocks(matrix), []);
  const seatFontSize = Math.max(10, Math.round(cellSize * 0.45));
  const palcoFontSize = Math.max(11, Math.round(cellSize * 0.5));
  const stageFontSize = Math.max(16, Math.round(cellSize * 0.85));
  const stageLetterSpacing = Math.max(1, Math.round(cellSize * 0.18));
  const gap = Math.max(1, Math.round(cellSize / 12));
  const padding = Math.max(6, Math.round(cellSize / 2.5));

  const baseCell = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: seatFontSize,
    color: '#333',
    borderRadius: Math.max(3, Math.round(cellSize * 0.15))
  };
  const singleCellDimensions = { width: `${cellSize}px`, height: `${cellSize}px` };

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
    gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
    gap: `${gap}px`,
    background: '#f5f5dc',
    padding: `${padding}px`,
    border: '1px solid #ccc',
    width: 'fit-content'
  };

  const pullmanButtonSize = Math.max(24, Math.round(cellSize * 0.9));
  const pullmanButtonFont = Math.max(14, Math.round(cellSize * 0.55));
  const pullmanBadgePadding = Math.round(Math.max(6, cellSize * 0.34));
  const pullmanBadgeFont = Math.max(12, Math.round(cellSize * 0.48));
  const pullmanTitleFont = Math.max(16, Math.round(cellSize * 0.75));
  const pullmanInfoFont = Math.max(10, Math.round(cellSize * 0.4));

  return (
    <div style={gridStyle}>
        {blocks.map((b, i) => {
          const key = `b-${b.r}-${b.c}`;
          const style = { ...baseCell, gridColumn: `${b.c + 1} / span ${b.cs}`, gridRow: `${b.r + 1} / span ${b.rs}` };
          const token = b.token;
          if (token === 'ESC') {
            return (
              <div
                key={key}
                style={{
                  ...style,
                  background: '#000',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: `${stageFontSize}px`,
                  fontFamily: 'Helvetica, Arial, sans-serif',
                  letterSpacing: `${stageLetterSpacing}px`
                }}
              >
                ESCENARIO
              </div>
            );
          }
          if (token === 'PULL') {
            return (
              <div
                key={key}
                style={{
                  ...style,
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
                        width: Math.max(36, Math.round(cellSize * 1.3)),
                        height: Math.max(36, Math.round(cellSize * 1.3)),
                        borderRadius: Math.max(10, Math.round(cellSize * 0.4)),
                        background: pullmanSelected <= 0 ? '#fcdada' : '#f87171',
                        border: '1px solid rgba(220,38,38,0.4)',
                        color: '#fff',
                        fontSize: Math.max(18, Math.round(cellSize * 0.7)),
                        fontWeight: 700,
                        cursor: pullmanSelected <= 0 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      −
                    </button>
                    <span
                      style={{
                        background: '#ffffff',
                        width: Math.max(44, Math.round(cellSize * 1.6)),
                        height: Math.max(36, Math.round(cellSize * 1.3)),
                        borderRadius: Math.max(10, Math.round(cellSize * 0.4)),
                        fontSize: pullmanBadgeFont,
                        fontWeight: 700,
                        color: '#111827',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
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
                        width: Math.max(36, Math.round(cellSize * 1.3)),
                        height: Math.max(36, Math.round(cellSize * 1.3)),
                        borderRadius: Math.max(10, Math.round(cellSize * 0.4)),
                        background: pullmanAvailable <= 0 ? '#d1fae5' : '#34d399',
                        border: '1px solid rgba(16,185,129,0.4)',
                        color: '#065f46',
                        fontSize: Math.max(18, Math.round(cellSize * 0.7)),
                        fontWeight: 700,
                        cursor: pullmanAvailable <= 0 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
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
          }
          if (/^STEP_PA/i.test(token)) {
            return (
              <div
                key={key}
                style={{
                  ...style,
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <img
                  src={stepsIcon}
                  alt="Escalera"
                  style={{ width: Math.max(24, Math.round(cellSize * 1.2)), height: Math.max(24, Math.round(cellSize * 1.2)), objectFit: 'contain', opacity: 0.85 }}
                />
              </div>
            );
          }
          if (/^STEP_PULL/i.test(token)) {
            const align = token.endsWith('_L') ? 'flex-end' : token.endsWith('_R') ? 'flex-start' : 'center';
            return (
              <div
                key={key}
                style={{
                  ...style,
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: align
                }}
              >
                <img
                  src={stepsIcon}
                  alt="Escalera"
                  style={{ width: Math.max(26, Math.round(cellSize * 1.3)), height: Math.max(26, Math.round(cellSize * 1.3)), objectFit: 'contain', opacity: 0.85 }}
                />
              </div>
            );
          }
          if (/^PA\s+\d+$/i.test(token) || /^PB\s+\d+$/i.test(token)) {
            const isPA = /^PA/i.test(token);
            const label = token;
            const isSelectedPalco = selectedPalcosLabels.has(label);
            const isSold = soldPalcosLabels.has(label);
            const isAdminBlocked = blockedPalcosLabels.has(label);
            const isHeldByOther = !isSold && !isAdminBlocked && heldByOtherPalcosLabels.has(label) && !isSelectedPalco;
            
            // Get price tier info for this palco to determine color
            const section = isPA ? 'palcos_altos' : 'palcos_bajos';
            const tierInfo = getSeatPriceTier(label, priceTiers);
            const priceColor = tierInfo.section && !isSold && !isAdminBlocked && !isHeldByOther && !isSelectedPalco
              ? getSeatColor(section, tierInfo.tierIndex, tierInfo.totalTiers)
              : null;
            
            // Determine background color based on state (price color takes precedence for available seats)
            let bgColor = priceColor || (isPA ? '#6b8e6b' : '#8fbc8f'); // default or price-based
            if (isSold) bgColor = '#808080'; // sold - gray
            else if (isAdminBlocked && isBlockingMode) bgColor = '#dc2626'; // blocked - red for admin
            else if (isAdminBlocked && !isBlockingMode) bgColor = '#808080'; // blocked - gray for regular users
            else if (isSelectedPalco) bgColor = '#ffd700'; // selected - yellow
            else if (isHeldByOther) bgColor = '#9370db'; // held by other - purple
            
            // Determine border color
            let borderColor = isSelectedPalco ? '#e0b200' : 
              (priceColor ? getSeatBorderColor(section, tierInfo.tierIndex, tierInfo.totalTiers) : 'rgba(0,0,0,0.2)');
            
            // In blocking mode, admin can click on blocked palcos to unblock them
            const isClickable = isBlockingMode 
              ? !isSold // Can click on available or blocked (but not sold)
              : !isSold && !isAdminBlocked && !isHeldByOther; // Regular mode - only available
            
            return (
              <button key={key}
                onClick={() => onTogglePalco && onTogglePalco({ label })}
                style={{
                  ...style,
                  background: bgColor,
                  color: (isPA || (isAdminBlocked && isBlockingMode)) ? '#fff' : '#333',
                  fontWeight: 600,
                  cursor: isClickable ? 'pointer' : 'not-allowed',
                  border: `${Math.max(2, Math.round(cellSize * 0.08))}px solid ${borderColor}`,
                  opacity: isSold ? 0.9 : 1,
                  fontSize: `${palcoFontSize}px`
                }}
                aria-pressed={isSelectedPalco}
                disabled={!isClickable}
                title={`${token} (pack ${isPA ? 2 : 4})${tierInfo.price ? ` - ${formatPrice(tierInfo.price)}` : ''}${isAdminBlocked ? ' - BLOQUEADO' : ''}`}
              >{token}</button>
            );
          }
          if (/^[A-M]$/.test(token)) {
            return (
              <div
                key={key}
                style={{
                  ...style,
                  ...singleCellDimensions,
                  background: 'transparent',
                  fontWeight: 700,
                  fontSize: `${palcoFontSize}px`
                }}
              >
                {token}
              </div>
            );
          }
          if (/^\d+$/.test(token)) {
            const row = rowLetter(b.r);
            const seatId = `${row || ''}${token}`;
            const seatKey = `${b.r}:${b.c}:${row || ''}:${token}`;
            const isSold = soldSeatIds.has(seatId);
            const isAdminBlocked = blockedSeatIds.has(seatId);
            const isSelected = !isSold && selectedSeatIds.has(seatId);
            const isHeldByOther = !isSold && !isAdminBlocked && heldByOtherSeatIds.has(seatId);
            
            // Get price tier info for this seat to determine color
            const tierInfo = getSeatPriceTier(seatId, priceTiers);
            const priceColor = tierInfo.section && !isSold && !isAdminBlocked && !isHeldByOther && !isSelected
              ? getSeatColor('platea', tierInfo.tierIndex, tierInfo.totalTiers)
              : null;
            
            // Determine background color based on state (price color takes precedence for available seats)
            let bgColor = priceColor || '#a8d8a8'; // default or price-based
            if (isSold) bgColor = '#808080'; // sold - gray
            else if (isAdminBlocked && isBlockingMode) bgColor = '#dc2626'; // blocked - red for admin
            else if (isAdminBlocked && !isBlockingMode) bgColor = '#808080'; // blocked - gray for regular users
            else if (isSelected) bgColor = '#ffd700'; // selected - yellow
            else if (isHeldByOther) bgColor = '#9370db'; // held by other - purple
            
            // Determine border color
            let borderColor = isSelected ? '#e0b200' : 
              (priceColor ? getSeatBorderColor('platea', tierInfo.tierIndex, tierInfo.totalTiers) : '#7fbf7f');
            
            // In blocking mode, admin can click on blocked seats to unblock them
            const isClickable = isBlockingMode 
              ? !isSold // Can click on available or blocked (but not sold)
              : !isSold && !isAdminBlocked && !isHeldByOther; // Regular mode - only available
            
            return (
              <button key={key}
                onClick={() => onToggleSeat && onToggleSeat({ r:b.r, c:b.c, val: token, row })}
                style={{
                  ...style,
                  ...singleCellDimensions,
                  cursor: isClickable ? 'pointer' : 'not-allowed',
                  background: bgColor,
                  border: `1px solid ${borderColor}`,
                  opacity: isSold ? 0.9 : 1
                }}
                aria-pressed={isSelected}
                disabled={!isClickable}
                title={row ? `Fila ${row} - Asiento ${token}${tierInfo.price ? ` - ${formatPrice(tierInfo.price)}` : ''}${isAdminBlocked ? ' - BLOQUEADO' : ''}` : `Asiento ${token}${isAdminBlocked ? ' - BLOQUEADO' : ''}`}
              >{token}</button>
            );
          }
          // fallback
          return <div key={key} style={{ ...style, ...singleCellDimensions, background:'#eef0f2' }}>{token}</div>;
        })}
    </div>
  );
}
