import React, { useState, useEffect, useRef } from 'react';

const ResponsiveGridContainer = ({
  children,
  gridCols,
  baseCellSize = 28,
  minCellSize = 8,
  maxCellSize = 32,
  gapRatio = 12,
  padding = 16
}) => {
  const containerRef = useRef(null);
  const [cellSize, setCellSize] = useState(baseCellSize);

  useEffect(() => {
    const updateCellSize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth - padding * 2;
      const minGap = 1;
      const totalGapsWidth = (gridCols - 1) * minGap;
      const availableWidth = containerWidth - totalGapsWidth;
      const calculatedCellSize = Math.max(minCellSize, Math.min(maxCellSize, availableWidth / gridCols));
      setCellSize(calculatedCellSize);
    };

    updateCellSize();
    window.addEventListener('resize', updateCellSize);
    return () => window.removeEventListener('resize', updateCellSize);
  }, [gridCols, minCellSize, maxCellSize, padding]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      {React.cloneElement(children, { cellSize })}
    </div>
  );
};

export default ResponsiveGridContainer;
