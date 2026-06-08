import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function generateBordereauxPDF(doc, data) {
  const {
    show,
    bordereaux,
    onlineSales,
    boleteriaSales,
    onlineServices = [],
    boleteriaServices = [],
    sectorTotals = [],
    totalOnline,
    totalBoleteria,
    totalBruto,
    deductionsACalculated,
    totalDeductionsA,
    neto1,
    totalServices,
    neto2,
    theaterPercentage,
    userPercentage,
    theaterAmount,
    userAmount,
    deductionsB,
    totalDeductionsB,
    userCash,
    userTransfer,
    sessionDate,
    isClosed
  } = data;
  
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2
    }).format(value);
  };
  
  const pageWidth = doc.page.width - 80;
  const startX = 40;
  const importeWidth = 90;
  const importeX = startX + pageWidth - importeWidth; // Posición fija para todos los importes
  const colWidths = { location: 200, price: 80, quantity: 60, total: importeWidth };
  
  // ========== LOGO ==========
  const logoPath = path.join(__dirname, '../assets/NUEVO_ISOLOGO_bdx.png');
  try {
    doc.image(logoPath, doc.page.width / 2 - 60, 25, { width: 120 }); // 50% más grande
    doc.y = 95; // Menos espacio después del logo
  } catch (e) {
    console.log('Logo not found, continuing without it');
    doc.y = 40;
  }
  
  // ========== HEADER ==========
  if (!isClosed) {
    doc.fontSize(10).font('Helvetica').fillColor('#666666').text('PROVISORIO', { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(0.5);
  }
  doc.fontSize(10).font('Helvetica-Bold').text('OBRA: ', startX, doc.y, { continued: true }).font('Helvetica').text(show.title);
  doc.fontSize(10).font('Helvetica-Bold').text('AUTOR: ', startX, doc.y, { continued: true }).font('Helvetica').text(bordereaux.author_name || '-');
  doc.fontSize(10).font('Helvetica-Bold').text('FECHA: ', startX, doc.y, { continued: true }).font('Helvetica')
    .text(sessionDate ? new Date(sessionDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha');
  doc.moveDown(1);
  
  // ========== CONSOLIDADO POR SECTOR ==========
  if (sectorTotals && sectorTotals.length > 0) {
    doc.fontSize(11).font('Helvetica-Bold').text('CONSOLIDADO POR SECTOR', startX);
    doc.moveDown(0.3);
    
    const sectorHeaderY = doc.y;
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('SECTOR', startX, sectorHeaderY, { width: colWidths.location });
    doc.text('CANTIDAD', startX + colWidths.location, sectorHeaderY, { width: colWidths.price + colWidths.quantity, align: 'right' });
    doc.text('TOTAL', importeX, sectorHeaderY, { width: importeWidth, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).stroke();
    doc.moveDown(0.3);
    
    doc.font('Helvetica').fontSize(8);
    let sectorGrandTotal = 0;
    for (const sector of sectorTotals) {
      const y = doc.y;
      doc.text(sector.location, startX, y, { width: colWidths.location });
      doc.text(sector.quantity.toString(), startX + colWidths.location, y, { width: colWidths.price + colWidths.quantity, align: 'right' });
      doc.text(formatCurrency(parseFloat(sector.total)), importeX, y, { width: importeWidth, align: 'right' });
      doc.moveDown(0.5);
      sectorGrandTotal += parseFloat(sector.total);
    }
    
    doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).lineWidth(1.5).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(8);
    const sectorTotY = doc.y;
    doc.text('TOTAL', startX, sectorTotY);
    doc.text(formatCurrency(sectorGrandTotal), importeX, sectorTotY, { width: importeWidth, align: 'right' });
    doc.moveDown(1);
  }

  // ========== ENTRADAS TABLE ==========
  doc.fontSize(11).font('Helvetica-Bold').text('ENTRADAS', startX);
  doc.moveDown(0.3);
  
  // Table header
  const tableHeaderY = doc.y;
  doc.fontSize(8).font('Helvetica-Bold');
  doc.text('UBICACIÓN', startX, tableHeaderY, { width: colWidths.location });
  doc.text('VALOR', startX + colWidths.location, tableHeaderY, { width: colWidths.price, align: 'right' });
  doc.text('CANTIDAD', startX + colWidths.location + colWidths.price, tableHeaderY, { width: colWidths.quantity, align: 'right' });
  doc.text('TOTAL', importeX, tableHeaderY, { width: importeWidth, align: 'right' });
  doc.moveDown(0.3);
  doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).stroke();
  doc.moveDown(0.3);
  
  // VENTA ONLINE section
  doc.rect(startX, doc.y - 2, pageWidth, 14).fill('#f0f0f0');
  doc.fillColor('#000000').fontSize(9).font('Helvetica-Bold');
  doc.text('VENTA ONLINE', startX + 4, doc.y);
  doc.moveDown(0.5);
  
  doc.font('Helvetica').fontSize(8);
  let onlineTickets = 0;
  let onlineAmount = 0;
  
  let onlinePeople = 0;
  
  for (const item of onlineSales) {
    const y = doc.y;
    doc.text(item.location, startX, y, { width: colWidths.location });
    doc.text(formatCurrency(item.price), startX + colWidths.location, y, { width: colWidths.price, align: 'right' });
    const itemPeople = item.people || item.quantity;
    const qtyText = itemPeople !== item.quantity
      ? `${item.quantity} (${itemPeople} ent.)`
      : item.quantity.toString();
    doc.text(qtyText, startX + colWidths.location + colWidths.price, y, { width: colWidths.quantity + 30, align: 'right' });
    doc.text(formatCurrency(item.total), importeX, y, { width: importeWidth, align: 'right' });
    doc.moveDown(0.5);
    onlineTickets += item.quantity;
    onlinePeople += itemPeople;
    onlineAmount += item.total;
  }
  
  if (onlineSales.length === 0) {
    doc.fillColor('#666666').text('Sin ventas online', startX, doc.y);
    doc.fillColor('#000000');
    doc.moveDown(0.5);
  }
  
  // Online subtotal
  doc.rect(startX, doc.y - 2, pageWidth, 14).fill('#e8e8e8');
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
  const onlineSubY = doc.y;
  doc.text('SUBTOTAL ONLINE', startX + 4, onlineSubY);
  doc.text(onlinePeople.toString(), startX + colWidths.location + colWidths.price, onlineSubY, { width: colWidths.quantity + 30, align: 'right' });
  doc.text(formatCurrency(onlineAmount), importeX, onlineSubY, { width: importeWidth, align: 'right' });
  doc.moveDown(0.8);
  
  // BOLETERÍA section
  doc.rect(startX, doc.y - 2, pageWidth, 14).fill('#f0f0f0');
  doc.fillColor('#000000').fontSize(9).font('Helvetica-Bold');
  doc.text('BOLETERÍA', startX + 4, doc.y);
  doc.moveDown(0.5);
  
  doc.font('Helvetica').fontSize(8);
  let boleteriaTickets = 0;
  let boleteriaAmount = 0;
  
  let boleteriaPeople = 0;
  
  for (const item of boleteriaSales) {
    const y = doc.y;
    doc.text(item.location, startX, y, { width: colWidths.location });
    doc.text(formatCurrency(item.price), startX + colWidths.location, y, { width: colWidths.price, align: 'right' });
    const itemPeople = item.people || item.quantity;
    const qtyText = itemPeople !== item.quantity
      ? `${item.quantity} (${itemPeople} ent.)`
      : item.quantity.toString();
    doc.text(qtyText, startX + colWidths.location + colWidths.price, y, { width: colWidths.quantity + 30, align: 'right' });
    doc.text(formatCurrency(item.total), importeX, y, { width: importeWidth, align: 'right' });
    doc.moveDown(0.5);
    boleteriaTickets += item.quantity;
    boleteriaPeople += itemPeople;
    boleteriaAmount += item.total;
  }
  
  if (boleteriaSales.length === 0) {
    doc.fillColor('#666666').text('Sin ventas en boletería', startX, doc.y);
    doc.fillColor('#000000');
    doc.moveDown(0.5);
  }
  
  // Boletería subtotal
  doc.rect(startX, doc.y - 2, pageWidth, 14).fill('#e8e8e8');
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
  const bolSubY = doc.y;
  doc.text('SUBTOTAL BOLETERÍA', startX + 4, bolSubY);
  doc.text(boleteriaPeople.toString(), startX + colWidths.location + colWidths.price, bolSubY, { width: colWidths.quantity + 30, align: 'right' });
  doc.text(formatCurrency(boleteriaAmount), importeX, bolSubY, { width: importeWidth, align: 'right' });
  doc.moveDown(0.8);

  // Totals row
  doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).lineWidth(1.5).stroke();
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(9);
  const totY = doc.y;
  doc.text('TOTALES', startX, totY);
  doc.text((onlinePeople + boleteriaPeople).toString(), startX + colWidths.location + colWidths.price, totY, { width: colWidths.quantity + 30, align: 'right' });
  doc.text(formatCurrency(totalBruto), importeX, totY, { width: importeWidth, align: 'right' });
  doc.moveDown(1);
  
  // ========== RECAUDACIÓN ==========
  doc.rect(startX, doc.y, pageWidth, 60).fill('#f5f5f5').stroke('#cccccc');
  const recY = doc.y + 8;
  doc.fillColor('#000000').font('Helvetica').fontSize(9);
  doc.text('RECAUDADO EN EFECTIVO (BOLETERÍA):', startX + 10, recY);
  doc.font('Helvetica-Bold').text(formatCurrency(totalBoleteria), importeX, recY, { width: importeWidth, align: 'right' });
  
  doc.font('Helvetica').text('RECAUDADO EN VENTA ONLINE:', startX + 10, recY + 16);
  doc.font('Helvetica-Bold').text(formatCurrency(totalOnline), importeX, recY + 16, { width: importeWidth, align: 'right' });
  
  doc.moveTo(startX + 10, recY + 34).lineTo(startX + pageWidth - 10, recY + 34).lineWidth(1).stroke();
  doc.font('Helvetica-Bold').fontSize(10).text('TOTAL BRUTO:', startX + 10, recY + 40);
  doc.text(formatCurrency(totalBruto), importeX, recY + 40, { width: importeWidth, align: 'right' });
  
  doc.y = recY + 68;
  doc.moveDown(0.5);
  
  // ========== DEDUCCIONES A ==========
  doc.fontSize(11).font('Helvetica-Bold').text('DEDUCCIONES (A)', startX);
  doc.moveDown(0.3);
  
  doc.fontSize(8).font('Helvetica-Bold');
  const dedAHeaderY = doc.y;
  doc.text('CONCEPTO', startX, dedAHeaderY, { width: 150 });
  doc.text('PORCENTAJE', startX + 150, dedAHeaderY, { width: 80, align: 'center' });
  doc.text('DESCRIPCIÓN', startX + 230, dedAHeaderY, { width: 120 });
  doc.text('IMPORTE', importeX, dedAHeaderY, { width: importeWidth, align: 'right' });
  doc.moveDown(0.3);
  doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).stroke();
  doc.moveDown(0.3);
  
  doc.font('Helvetica').fontSize(8);
  for (const ded of deductionsACalculated) {
    const y = doc.y;
    doc.text(ded.name || '-', startX, y, { width: 150 });
    doc.text(ded.type === 'fixed' ? 'Fijo' : `${Math.round(ded.percentage)}%`, startX + 150, y, { width: 80, align: 'center' });
    doc.text(ded.description || '-', startX + 230, y, { width: 120 });
    doc.text(formatCurrency(ded.amount), importeX, y, { width: importeWidth, align: 'right' });
    doc.moveDown(0.5);
  }
  
  if (deductionsACalculated.length === 0) {
    doc.fillColor('#666666').text('Sin deducciones', startX, doc.y);
    doc.fillColor('#000000');
    doc.moveDown(0.5);
  }
  
  doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).stroke();
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(8);
  const dedATotY = doc.y;
  doc.text('TOTAL DEDUCCIONES (A)', startX, dedATotY);
  doc.text(formatCurrency(totalDeductionsA), importeX, dedATotY, { width: importeWidth, align: 'right' });
  doc.moveDown(0.5);
  
  doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).lineWidth(1.5).stroke();
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica-Bold');
  const neto1Y = doc.y;
  doc.text('NETO 1', startX, neto1Y);
  doc.text(formatCurrency(neto1), importeX, neto1Y, { width: importeWidth, align: 'right' });
  doc.moveDown(0.8);

  // ========== SERVICIOS ASOCIADOS ==========
  const allServices = [...(onlineServices || []), ...(boleteriaServices || [])];
  if (allServices.length > 0) {
    doc.rect(startX, doc.y - 2, pageWidth, 14).fill('#f0f0f0');
    doc.fillColor('#000000').fontSize(9).font('Helvetica-Bold');
    doc.text('SERVICIOS ASOCIADOS', startX + 4, doc.y);
    doc.moveDown(0.5);

    // Online services
    if (onlineServices && onlineServices.length > 0) {
      doc.rect(startX, doc.y - 2, pageWidth, 12).fill('#f8f8f8');
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
      doc.text('  Online', startX + 4, doc.y);
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(8);
      for (const svc of onlineServices) {
        const y = doc.y;
        doc.text(`  ${svc.name}`, startX, y, { width: colWidths.location });
        doc.text(formatCurrency(svc.price), startX + colWidths.location, y, { width: colWidths.price, align: 'right' });
        doc.text(svc.quantity.toString(), startX + colWidths.location + colWidths.price, y, { width: colWidths.quantity + 30, align: 'right' });
        doc.text(formatCurrency(svc.total), importeX, y, { width: importeWidth, align: 'right' });
        doc.moveDown(0.5);
      }
    }

    // Boletería services
    if (boleteriaServices && boleteriaServices.length > 0) {
      doc.rect(startX, doc.y - 2, pageWidth, 12).fill('#f8f8f8');
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8);
      doc.text('  Boletería', startX + 4, doc.y);
      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(8);
      for (const svc of boleteriaServices) {
        const y = doc.y;
        doc.text(`  ${svc.name}`, startX, y, { width: colWidths.location });
        doc.text(formatCurrency(svc.price), startX + colWidths.location, y, { width: colWidths.price, align: 'right' });
        doc.text(svc.quantity.toString(), startX + colWidths.location + colWidths.price, y, { width: colWidths.quantity + 30, align: 'right' });
        doc.text(formatCurrency(svc.total), importeX, y, { width: importeWidth, align: 'right' });
        doc.moveDown(0.5);
      }
    }
    doc.moveDown(0.3);
  }

  // NETO 2
  if (neto2) {
    doc.rect(startX, doc.y - 2, pageWidth, 14).fill('#f3f4f6');
    doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold');
    const neto2Y = doc.y;
    doc.text('NETO 2 (NETO 1 + Servicios)', startX + 4, neto2Y);
    doc.text(formatCurrency(neto2), importeX, neto2Y, { width: importeWidth, align: 'right' });
    doc.moveDown(1);
  }

  // ========== CONTRATO ==========
  doc.fontSize(11).font('Helvetica-Bold').text('CONTRATO', startX);
  doc.moveDown(0.3);
  
  doc.fontSize(8).font('Helvetica-Bold');
  const contHeaderY = doc.y;
  doc.text('PARTE', startX, contHeaderY, { width: 100 });
  doc.text('PORCENTAJE', startX + 100, contHeaderY, { width: 80, align: 'center' });
  doc.text('DESCRIPCIÓN', startX + 180, contHeaderY, { width: 150 });
  doc.text('IMPORTE', importeX, contHeaderY, { width: importeWidth, align: 'right' });
  doc.moveDown(0.3);
  doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).stroke();
  doc.moveDown(0.3);
  
  doc.font('Helvetica').fontSize(8);
  const teatroY = doc.y;
  doc.text('TEATRO', startX, teatroY, { width: 100 });
  doc.text(`${Math.round(theaterPercentage)}%`, startX + 100, teatroY, { width: 80, align: 'center' });
  doc.text('del NETO 2', startX + 180, teatroY, { width: 150 });
  doc.text(formatCurrency(theaterAmount), importeX, teatroY, { width: importeWidth, align: 'right' });
  doc.moveDown(0.5);

  const usuarioY = doc.y;
  doc.text('USUARIO', startX, usuarioY, { width: 100 });
  doc.text(`${Math.round(userPercentage)}%`, startX + 100, usuarioY, { width: 80, align: 'center' });
  doc.text('del NETO 2', startX + 180, usuarioY, { width: 150 });
  doc.text(formatCurrency(userAmount), importeX, usuarioY, { width: importeWidth, align: 'right' });
  doc.moveDown(1);
  
  // ========== DEDUCCIONES B ==========
  doc.fontSize(11).font('Helvetica-Bold').text('DEDUCCIONES (B)', startX);
  doc.moveDown(0.3);
  
  doc.fontSize(8).font('Helvetica-Bold');
  const dedBHeaderY = doc.y;
  doc.text('DESCRIPCIÓN', startX, dedBHeaderY, { width: 300 });
  doc.text('IMPORTE', importeX, dedBHeaderY, { width: importeWidth, align: 'right' });
  doc.moveDown(0.3);
  doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).stroke();
  doc.moveDown(0.3);
  
  doc.font('Helvetica').fontSize(8);
  for (const ded of deductionsB) {
    const y = doc.y;
    doc.text(ded.description || '-', startX, y, { width: 300 });
    doc.text(formatCurrency(parseFloat(ded.amount || 0)), importeX, y, { width: importeWidth, align: 'right' });
    doc.moveDown(0.5);
  }
  
  if (deductionsB.length === 0) {
    doc.fillColor('#666666').text('Sin deducciones', startX, doc.y);
    doc.fillColor('#000000');
    doc.moveDown(0.5);
  }
  
  doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).lineWidth(1.5).stroke();
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(8);
  const dedBTotY = doc.y;
  doc.text('TOTAL', startX, dedBTotY);
  doc.text(formatCurrency(totalDeductionsB), importeX, dedBTotY, { width: importeWidth, align: 'right' });
  doc.moveDown(1);
  
  // ========== LIQUIDACIÓN FINAL ==========
  const userTotal = Math.max(0, userAmount - totalDeductionsB);
  doc.rect(startX, doc.y, pageWidth, 40).fill('#e8e8e8').stroke('#999999');
  const liqY = doc.y + 12;
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(12);
  doc.text('TOTAL A LIQUIDAR AL USUARIO:', startX + 10, liqY);
  doc.text(formatCurrency(userTotal), importeX, liqY, { width: importeWidth, align: 'right' });
  
  doc.fillColor('#000000');
  doc.y = liqY + 40;
  
  // ========== FIRMAS ==========
  if (isClosed) {
    doc.moveDown(1);
    
    const sigY = doc.y;
    const sigWidth = (pageWidth - 40) / 2;
    
    // Firma Usuario
    doc.moveTo(startX, sigY + 40).lineTo(startX + sigWidth, sigY + 40).stroke();
    doc.fontSize(9).font('Helvetica-Bold').text('Firma USUARIO', startX, sigY + 45, { width: sigWidth, align: 'center' });
    doc.moveTo(startX, sigY + 80).lineTo(startX + sigWidth, sigY + 80).stroke();
    doc.font('Helvetica').fontSize(8).text('Aclaración', startX, sigY + 85, { width: sigWidth, align: 'center' });
    
    // Firma Teatro
    doc.moveTo(startX + sigWidth + 40, sigY + 40).lineTo(startX + pageWidth, sigY + 40).stroke();
    doc.fontSize(9).font('Helvetica-Bold').text('Firma TEATRO', startX + sigWidth + 40, sigY + 45, { width: sigWidth, align: 'center' });
    doc.moveTo(startX + sigWidth + 40, sigY + 80).lineTo(startX + pageWidth, sigY + 80).stroke();
    doc.font('Helvetica').fontSize(8).text('Aclaración', startX + sigWidth + 40, sigY + 85, { width: sigWidth, align: 'center' });
    
    doc.y = sigY + 110;
  }
  
}

export function calculatePDFHeight(data) {
  const { onlineSales, boleteriaSales, onlineServices, boleteriaServices, deductionsACalculated, deductionsB, isClosed, neto2 } = data;

  const baseHeight = 120;
  const headerInfoHeight = 80;
  const entradasHeaderHeight = 40;
  const onlineSectionHeight = 20 + Math.max(1, onlineSales.length) * 14 + 20;
  const boleteriaSectionHeight = 20 + Math.max(1, boleteriaSales.length) * 14 + 20;
  const servicesHeight = (onlineServices?.length || 0) + (boleteriaServices?.length || 0) > 0 ? 40 + Math.max(1, (onlineServices?.length || 0) + (boleteriaServices?.length || 0)) * 14 : 0;
  const totalsHeight = 30;
  const recaudacionHeight = 80;
  const deduccionesAHeight = 60 + Math.max(1, deductionsACalculated.length) * 14 + 50;
  const neto1Height = 30;
  const neto2Height = neto2 ? 30 : 0;
  const contratoHeight = 80;
  const deduccionesBHeight = 60 + Math.max(1, deductionsB.length) * 14 + 40;
  const liquidacionHeight = 90;
  const firmasHeight = isClosed ? 120 : 0;
  const footerHeight = 40;

  return baseHeight + headerInfoHeight + entradasHeaderHeight +
    onlineSectionHeight + boleteriaSectionHeight + servicesHeight + totalsHeight + recaudacionHeight +
    deduccionesAHeight + neto1Height + neto2Height + contratoHeight + deduccionesBHeight + liquidacionHeight +
    firmasHeight + footerHeight + 100;
}
