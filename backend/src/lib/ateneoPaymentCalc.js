// Stub for ateneoPaymentCalc.js to allow backend startup for pack testing
export function calcularMontoConBecas(pagos, becas) {
  return pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
}

export function recalcularPagosPendientes(inscripcionId) {
  return { ok: true };
}
