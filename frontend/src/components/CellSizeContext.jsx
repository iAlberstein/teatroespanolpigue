import React, { createContext, useContext } from 'react';

const CellSizeContext = createContext(28);

export const CellSizeProvider = ({ value, children }) => (
  <CellSizeContext.Provider value={value}>
    {children}
  </CellSizeContext.Provider>
);

export const useCellSize = () => useContext(CellSizeContext);
