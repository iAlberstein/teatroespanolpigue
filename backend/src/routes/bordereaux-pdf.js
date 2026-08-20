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
    // Contrato: en la vista de UNA fecha (individual) viene ya resuelto/calculado en
    // `contractItems` + `contractTotal`. En la vista GENERAL (consolidada, multi-fecha)
    // viene el desglose por fecha en `contractBySession` + `contractGrandTotal`, y
    // `contractItems` trae la lista "default" del show (solo informativa en ese caso).
    contractItems = [],
    contractTotal,
    contractBySession,
    contractGrandTotal,
    deductionsB,
    totalDeductionsB,
    userCash,
    userTransfer,
    sessionDate,
    sessionDates,
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
  // FECHA: list all sessions if consolidated, or single date if session view
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDateTime = (raw) => {
    const d = new Date(raw);
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}hs`;
  };
  const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fmtDateLong = (raw) => {
    const d = new Date(raw);
    return `${d.getUTCDate()} de ${monthNames[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  };

  if (sessionDates && sessionDates.length > 1) {
    doc.fontSize(10).font('Helvetica-Bold').text('FUNCIONES:', startX, doc.y);
    for (const sd of sessionDates) {
      doc.fontSize(9).font('Helvetica').text(`  ${fmtDateTime(sd)}`, startX, doc.y);
    }
  } else {
    const singleDate = sessionDate || (sessionDates && sessionDates[0]);
    doc.fontSize(10).font('Helvetica-Bold').text('FECHA: ', startX, doc.y, { continued: true }).font('Helvetica')
      .text(singleDate ? fmtDateLong(singleDate) : 'Sin fecha');
  }
  doc.moveDown(1);
  
  // ========== DETALLE DE VENTAS ==========
  if (sectorTotals && sectorTotals.length > 0) {
    doc.fontSize(11).font('Helvetica-Bold').text('DETALLE DE VENTAS', startX);
    doc.moveDown(0.3);
    
    const sectorHeaderY = doc.y;
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('SECTOR', startX, sectorHeaderY, { width: colWidths.location });
    doc.text('CANTIDAD', startX + colWidths.location, sectorHeaderY, { width: colWidths.price + colWidths.quantity, align: 'right' });
    doc.text('VALOR', importeX - 60, sectorHeaderY, { width: 60, align: 'right' });
    doc.text('TOTAL', importeX, sectorHeaderY, { width: importeWidth, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).stroke();
    doc.moveDown(0.3);
    
    let sectorGrandTotal = 0;
    let sectorGrandPeople = 0;
    for (const sector of sectorTotals) {
      const y = doc.y;
      const hasMultipleItems = sector.items && sector.items.length > 0;
      
      // Fila principal del sector (negrita, fondo gris claro simulado con rect)
      doc.font('Helvetica-Bold').fontSize(8);
      doc.rect(startX, y - 2, pageWidth, 14).fill('#f5f5f5');
      doc.fillColor('#000000');
      doc.text(sector.location, startX + 4, y, { width: colWidths.location - 8 });
      // Para palcos: calcular cantidad de palcos a partir de localidades
      const isPalco = sector.location?.toLowerCase().includes('palco');
      const localidades = sector.people || sector.quantity;
      const isBajo = sector.location?.toLowerCase().includes('bajo');
      const palcos = isPalco ? (isBajo ? Math.round(localidades / 4) : Math.round(localidades / 2)) : localidades;
      const quantityText = isPalco ? `${palcos} (${localidades} localidades)` : localidades.toString();
      doc.text(quantityText, startX + colWidths.location, y, { width: colWidths.price + colWidths.quantity, align: 'right' });
      doc.text('', importeX - 60, y, { width: 60, align: 'right' }); // Empty value for total row
      doc.text(formatCurrency(parseFloat(sector.total)), importeX, y, { width: importeWidth, align: 'right' });
      doc.moveDown(0.6);
      sectorGrandTotal += parseFloat(sector.total);
      sectorGrandPeople += parseInt(localidades) || 0;
      
      // Subtítulos para precios (siempre mostrar el detalle)
      if (hasMultipleItems) {
        for (const item of sector.items) {
          const itemY = doc.y;
          const isSpecial = item.specialPricing?.isSpecial;
          // Construir label: sector + regla especial + cupón
          const labelParts = [];
          if (isSpecial && item.specialPricing?.label) labelParts.push(item.specialPricing.label);
          if (item.discountCode) labelParts.push(`(${item.discountCode})`);
          const label = labelParts.join(' ') || sector.location;
          
          // Draw color indicator if exists
          if (item.color) {
            try {
              doc.rect(startX + 4, itemY + 2, 8, 8).fill(item.color);
            } catch (e) {
              // Ignore color errors
            }
          }
          
          // Set text color based on whether it's special pricing
          doc.font('Helvetica').fontSize(7);
          doc.fillColor(isSpecial ? '#0369a1' : '#666666');
          doc.text(label, startX + (item.color ? 16 : 8), itemY, { width: colWidths.location - 80 });
          
          doc.fillColor('#666666');
          // Para palcos: calcular cantidad de palcos a partir de localidades
          const itemLocalidades = item.people || item.quantity;
          const itemPalcos = isPalco ? (isBajo ? Math.round(itemLocalidades / 4) : Math.round(itemLocalidades / 2)) : itemLocalidades;
          const itemQuantityText = isPalco ? `${itemPalcos} (${itemLocalidades} localidades)` : itemLocalidades.toString();
          doc.text(itemQuantityText, startX + colWidths.location, itemY, { width: colWidths.price + colWidths.quantity, align: 'right' });
          // Precio en columna aparte
          doc.text(formatCurrency(parseFloat(item.price)), importeX - 60, itemY, { width: 60, align: 'right' });
          doc.text(formatCurrency(parseFloat(item.total)), importeX, itemY, { width: importeWidth, align: 'right' });
          doc.moveDown(0.4);
        }
        doc.fillColor('#000000');
        doc.moveDown(0.2);
      } else {
        doc.moveDown(0.3);
      }
    }
    
    doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).lineWidth(1.5).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(8);
    const sectorTotY = doc.y;
    doc.text('TOTAL BRUTO', startX, sectorTotY);
    doc.text(`${sectorGrandPeople} localidades`, startX + colWidths.location, sectorTotY, { width: colWidths.price + colWidths.quantity, align: 'right' });
    doc.text('', importeX - 60, sectorTotY, { width: 60, align: 'right' });
    doc.text(formatCurrency(sectorGrandTotal), importeX, sectorTotY, { width: importeWidth, align: 'right' });
    doc.moveDown(1);
  }

  /*
  // ========== ENTRADAS TABLE ==========
  // OCULTADO: Detalle de ventas online vs boletería
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
  */
  
  // ========== DEDUCCIONES A ==========
  // Only show if there are deductions A items
  const hasDeductionsA = deductionsACalculated && deductionsACalculated.length > 0;
  if (hasDeductionsA) {
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
    
    doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(8);
    const dedATotY = doc.y;
    doc.text('TOTAL DEDUCCIONES (A)', startX, dedATotY);
    doc.text(formatCurrency(totalDeductionsA), importeX, dedATotY, { width: importeWidth, align: 'right' });
    doc.moveDown(0.5);
    
    doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).lineWidth(1.5).stroke();
    doc.moveDown(0.3);
  }
  
  // NETO 1 - only show if there are Deductions A (otherwise it's same as Total Bruto)
  if (hasDeductionsA) {
    doc.fontSize(10).font('Helvetica-Bold');
    const neto1Y = doc.y;
    doc.text('NETO 1', startX, neto1Y);
    doc.text(formatCurrency(neto1), importeX, neto1Y, { width: importeWidth, align: 'right' });
    doc.moveDown(0.8);
  }

  // ========== SERVICIOS ASOCIADOS ==========
  const allServices = [...(onlineServices || []), ...(boleteriaServices || [])];
  if (allServices.length > 0) {
    // Consolidate online + boleteria rows by service name
    const consolidatedServices = Object.values(
      allServices.reduce((acc, svc) => {
        if (!acc[svc.name]) {
          acc[svc.name] = { name: svc.name, price: svc.price, quantity: 0, total: 0 };
        }
        acc[svc.name].quantity += svc.quantity;
        acc[svc.name].total += svc.total;
        return acc;
      }, {})
    );
    const totalSvcQty = consolidatedServices.reduce((sum, s) => sum + s.quantity, 0);
    const totalSvcAmt = consolidatedServices.reduce((sum, s) => sum + s.total, 0);

    doc.fontSize(11).font('Helvetica-Bold').text('SERVICIOS ASOCIADOS', startX);
    doc.moveDown(0.3);

    // Table header
    const svcHeaderY = doc.y;
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('SERVICIO', startX, svcHeaderY, { width: colWidths.location });
    doc.text('VALOR', startX + colWidths.location, svcHeaderY, { width: colWidths.price, align: 'right' });
    doc.text('CANTIDAD', startX + colWidths.location + colWidths.price, svcHeaderY, { width: colWidths.quantity + 30, align: 'right' });
    doc.text('TOTAL', importeX, svcHeaderY, { width: importeWidth, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(8);
    for (const svc of consolidatedServices) {
      const y = doc.y;
      doc.text(svc.name, startX, y, { width: colWidths.location });
      doc.text(formatCurrency(svc.price), startX + colWidths.location, y, { width: colWidths.price, align: 'right' });
      doc.text(svc.quantity.toString(), startX + colWidths.location + colWidths.price, y, { width: colWidths.quantity + 30, align: 'right' });
      doc.text(formatCurrency(svc.total), importeX, y, { width: importeWidth, align: 'right' });
      doc.moveDown(0.5);
    }

    doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).lineWidth(1.5).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(8);
    const svcTotY = doc.y;
    doc.text('TOTAL SERVICIOS ASOCIADOS', startX, svcTotY, { width: colWidths.location + colWidths.price });
    doc.text(totalSvcQty.toString(), startX + colWidths.location + colWidths.price, svcTotY, { width: colWidths.quantity + 30, align: 'right' });
    doc.text(formatCurrency(totalSvcAmt), importeX, svcTotY, { width: importeWidth, align: 'right' });
    doc.moveDown(0.8);
  }

  // NETO 2 - Only show if there are Deductions A OR Services
  const hasServices = allServices.length > 0;
  const showNeto2 = hasDeductionsA || hasServices;
  if (showNeto2 && neto2) {
    doc.rect(startX, doc.y - 2, pageWidth, 14).fill('#f3f4f6');
    doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold');
    const neto2Y = doc.y;
    doc.text('NETO 2 (NETO 1 + Servicios)', startX + 4, neto2Y);
    doc.text(formatCurrency(neto2), importeX, neto2Y, { width: importeWidth, align: 'right' });
    doc.moveDown(1);
  }

  // ========== CONTRATO ==========
  const contractRowLabel = (item) => item.mode === 'fixed' ? 'Fijo' : `${Math.round(parseFloat(item.percentage || 0))}%`;

  const drawContractTable = (items) => {
    doc.fontSize(8).font('Helvetica-Bold');
    const hY = doc.y;
    doc.text('PARTE', startX, hY, { width: 100 });
    doc.text('TIPO', startX + 100, hY, { width: 80, align: 'center' });
    doc.text('DESCRIPCIÓN', startX + 180, hY, { width: 150 });
    doc.text('IMPORTE', importeX, hY, { width: importeWidth, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(8);
    for (const item of items) {
      const y = doc.y;
      doc.text((item.title || '-').toUpperCase(), startX, y, { width: 100 });
      doc.text(contractRowLabel(item), startX + 100, y, { width: 80, align: 'center' });
      doc.text(item.description || '-', startX + 180, y, { width: 150 });
      doc.text(formatCurrency(parseFloat(item.amount || 0)), importeX, y, { width: importeWidth, align: 'right' });
      doc.moveDown(0.5);
    }
  };

  doc.fontSize(11).font('Helvetica-Bold').text('CONTRATO', startX);
  doc.moveDown(0.3);

  if (Array.isArray(contractBySession) && contractBySession.length > 1) {
    // Vista consolidada (pack / múltiples fechas): un bloque por función, con su propia
    // distribución de contrato, y un total general al final.
    for (const slot of contractBySession) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#1f2937');
      doc.text(`${fmtDateTime(slot.starts_at)}${slot.function_name ? ' — ' + slot.function_name : ''}${slot.is_override ? ' (distribución propia)' : ''}`, startX, doc.y);
      doc.fillColor('#000000');
      doc.moveDown(0.2);
      drawContractTable(slot.items);
      doc.font('Helvetica-Bold').fontSize(8);
      const subTotY = doc.y;
      doc.text('SUBTOTAL FECHA', startX, subTotY, { width: 330 });
      doc.text(formatCurrency(parseFloat(slot.total || 0)), importeX, subTotY, { width: importeWidth, align: 'right' });
      doc.moveDown(0.7);
    }
    doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).lineWidth(1.5).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(9);
    const grandTotY = doc.y;
    doc.text('TOTAL CONTRATO (TODAS LAS FECHAS)', startX, grandTotY, { width: 330 });
    doc.text(formatCurrency(parseFloat(contractGrandTotal || 0)), importeX, grandTotY, { width: importeWidth, align: 'right' });
    doc.moveDown(1);
  } else {
    // Vista de una sola fecha (individual, o show con una sola función)
    drawContractTable(contractItems);
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(8);
    const totY = doc.y;
    doc.text('TOTAL CONTRATO', startX, totY, { width: 330 });
    doc.text(formatCurrency(parseFloat((contractTotal ?? contractGrandTotal) || 0)), importeX, totY, { width: importeWidth, align: 'right' });
    doc.moveDown(1);
  }
  
  // ========== DEDUCCIONES B ==========
  // Only show if there are deductions B items
  const hasDeductionsB = deductionsB && deductionsB.length > 0;
  if (hasDeductionsB) {
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
    
    doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).lineWidth(1.5).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(8);
    const dedBTotY = doc.y;
    doc.text('TOTAL', startX, dedBTotY);
    doc.text(formatCurrency(totalDeductionsB), importeX, dedBTotY, { width: importeWidth, align: 'right' });
    doc.moveDown(1);
  }
  
  // ========== LIQUIDACIÓN FINAL ==========
  // Suma de lo que corresponde en efectivo (boletería, ya neto de Deducciones B) + lo que
  // corresponde por transferencia (online), de las partes de contrato marcadas "a liquidar".
  const userTotal = Math.max(0, (userCash || 0) + (userTransfer || 0));
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
  const { onlineSales, boleteriaSales, onlineServices, boleteriaServices, deductionsACalculated, deductionsB, isClosed, neto2, sessionDates, contractItems, contractBySession } = data;

  const baseHeight = 120;
  const extraSessionLines = sessionDates && sessionDates.length > 1 ? (sessionDates.length - 1) * 14 : 0;
  const headerInfoHeight = 80 + extraSessionLines;
  const entradasHeaderHeight = 40;
  const onlineSectionHeight = 20 + Math.max(1, onlineSales.length) * 14 + 20;
  const boleteriaSectionHeight = 20 + Math.max(1, boleteriaSales.length) * 14 + 20;
  
  // Services height (conditional)
  const hasServices = ((onlineServices?.length || 0) + (boleteriaServices?.length || 0)) > 0;
  const servicesHeight = hasServices ? 40 + Math.max(1, (onlineServices?.length || 0) + (boleteriaServices?.length || 0)) * 14 : 0;
  
  const totalsHeight = 30;
  const recaudacionHeight = 80;
  
  // Deducciones A height (conditional - only if there are items)
  const hasDeductionsA = deductionsACalculated && deductionsACalculated.length > 0;
  const deduccionesAHeight = hasDeductionsA ? 60 + deductionsACalculated.length * 14 + 50 : 0;
  
  // NETO 1 height (conditional - only if there are Deductions A)
  const neto1Height = hasDeductionsA ? 30 : 0;
  
  // NETO 2 height (conditional - only if there are Deductions A OR Services)
  const showNeto2 = hasDeductionsA || hasServices;
  const neto2Height = (showNeto2 && neto2) ? 30 : 0;
  
  // Contrato height: variable según cantidad de items (y de fechas, en la vista consolidada)
  const contratoHeight = (Array.isArray(contractBySession) && contractBySession.length > 1)
    ? 40 + contractBySession.reduce((sum, slot) => sum + 30 + (slot.items?.length || 0) * 14, 0) + 30
    : 60 + ((contractItems?.length || 2) * 14);
  
  // Deducciones B height (conditional - only if there are items)
  const hasDeductionsB = deductionsB && deductionsB.length > 0;
  const deduccionesBHeight = hasDeductionsB ? 60 + deductionsB.length * 14 + 40 : 0;
  
  const liquidacionHeight = 90;
  const firmasHeight = isClosed ? 120 : 0;
  const footerHeight = 40;

  return baseHeight + headerInfoHeight + entradasHeaderHeight +
    onlineSectionHeight + boleteriaSectionHeight + servicesHeight + totalsHeight + recaudacionHeight +
    deduccionesAHeight + neto1Height + neto2Height + contratoHeight + deduccionesBHeight + liquidacionHeight +
    firmasHeight + footerHeight + 100;
}
