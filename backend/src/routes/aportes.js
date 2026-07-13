import express from 'express';
import { sequelize } from '../lib/sequelize.js';
import { Op } from 'sequelize';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { authenticateToken, requireRole, optionalAuth } from '../middleware/auth.js';
import { sendAporteConfirmation, sendReferidoNotification } from '../lib/aportesEmailService.js';

const router = express.Router();

// MercadoPago tokens se leen en runtime (no al importar el módulo, antes de dotenv)

// Helper: Generate unique random 8-digit numero_aporte
async function getNextNumeroAporte(excludeSet = new Set()) {
  const { aportes: Aporte } = sequelize.models;
  const MAX_ATTEMPTS = 20;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const num = 10000000 + Math.floor(Math.random() * 90000000); // 10000000–99999999
    if (excludeSet.has(num)) continue;
    const exists = await Aporte.findOne({ where: { numero_aporte: num } });
    if (!exists) return num;
  }
  throw new Error('No se pudo generar un número de aporte único');
}

// Helper: Get config value
async function getConfig(clave) {
  const { aportes_config: AporteConfig } = sequelize.models;
  const config = await AporteConfig.findOne({ where: { clave } });
  return config?.valor;
}

// ============================================================================
// GET /api/aportes/config - Obtener configuración pública del sistema
// ============================================================================
router.get('/config', async (req, res) => {
  try {
    const monto = await getConfig('monto_aporte') || '5000';
    const estado = await getConfig('estado_sistema') || 'activo';
    const fechaCierre = await getConfig('fecha_cierre_sorteo');
    
    res.json({
      monto_aporte: parseInt(monto),
      estado_sistema: estado,
      fecha_cierre_sorteo: fechaCierre,
      activo: estado === 'activo'
    });
  } catch (e) {
    console.error('[APORTES] Error getting config:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ============================================================================
// POST /api/aportes/create-intent - Crear orden de pago (MercadoPago Orders API)
// ============================================================================
router.post('/create-intent', async (req, res) => {
  try {
    const { 
      cantidad = 1, 
      dni, 
      email, 
      nombre, 
      apellido, 
      telefono, 
      provincia, 
      localidad,
      referido_dni 
    } = req.body;

    // Validaciones
    if (!dni || !email || !nombre || !apellido || !telefono || !provincia || !localidad) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    if (!/^\d{7,8}$/.test(dni)) {
      return res.status(400).json({ error: 'invalid_dni' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'invalid_email' });
    }

    // Verificar estado del sistema
    const estadoSistema = await getConfig('estado_sistema');
    if (estadoSistema === 'cerrado') {
      return res.status(403).json({ error: 'sistema_cerrado' });
    }

    const { aportes: Aporte } = sequelize.models;
    const cantidadInt = parseInt(cantidad);
    const montoAporte = parseInt(await getConfig('monto_aporte') || '5000');
    const total = montoAporte * cantidadInt;

    // Tabla de bonus por volumen (igual a la del frontend)
    const BONUS_TABLE = [
      { cantidad: 10, numeros: 14 },
      { cantidad: 6,  numeros: 8  },
      { cantidad: 4,  numeros: 5  },
      { cantidad: 2,  numeros: 2  },
      { cantidad: 1,  numeros: 1  },
    ];
    const regla = BONUS_TABLE.find(r => cantidadInt >= r.cantidad) || { numeros: cantidadInt };
    const totalNumeros = regla.numeros;

    // Crear registros de aporte en estado pending
    const aportesCreados = [];
    const numerosAporte = [];
    const usedNums = new Set();
    
    for (let i = 0; i < totalNumeros; i++) {
      const numero_aporte = await getNextNumeroAporte(usedNums);
      usedNums.add(numero_aporte);
      const aporte = await Aporte.create({
        numero_aporte,
        dni,
        email,
        nombre,
        apellido,
        telefono,
        provincia,
        localidad,
        monto: i < cantidadInt ? montoAporte : 0,
        payment_method: 'mercadopago',
        payment_status: 'pending',
        referido_dni: referido_dni || null
      });
      aportesCreados.push(aporte);
      numerosAporte.push(numero_aporte);
    }

    // Crear preferencia en MercadoPago Checkout Pro
    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'mp_not_configured' });
    }

    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
    const BACKEND_URL = process.env.BASE_URL || 'http://localhost:4000';

    // Generar unique_id para idempotencia
    const idempotencyKey = crypto.randomUUID();

    const preferenceData = {
      external_reference: aportesCreados.map(a => a.id).join(','),
      items: [{
        title: `Bono Contribución Solidaria Teatro Español Pigüé`,
        description: `Aporte solidario - ${cantidad} bono${cantidad > 1 ? 's' : ''}`,
        unit_price: montoAporte,
        quantity: cantidadInt,
        currency_id: 'ARS'
      }],
      payer: {
        email: email,
        name: nombre,
        surname: apellido,
        identification: {
          type: 'DNI',
          number: dni
        }
      },
      back_urls: {
        success: `${FRONTEND_URL}/aportes/success`,
        failure: `${FRONTEND_URL}/aportes/failure`,
        pending: `${FRONTEND_URL}/aportes/pending`
      },
      auto_return: 'approved',
      notification_url: `${BACKEND_URL}/api/aportes/webhook`
    };

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(preferenceData)
    });

    if (!mpResponse.ok) {
      // Rollback: eliminar aportes creados
      await Promise.all(aportesCreados.map(a => a.destroy()));
      const errorData = await mpResponse.json();
      console.error('[APORTES] MercadoPago Checkout Pro error:', errorData);
      return res.status(500).json({ error: 'mp_order_error', details: errorData });
    }

    const mpData = await mpResponse.json();

    // Actualizar aportes con el preference_id
    await Promise.all(aportesCreados.map(a => 
      a.update({ mp_order_id: mpData.id })
    ));

    res.json({
      checkout_url: mpData.init_point,
      order_id: mpData.id,
      aportes: aportesCreados.map(a => ({
        id: a.id,
        numero_aporte: a.numero_aporte
      })),
      total
    });

  } catch (e) {
    console.error('[APORTES] Error creating intent:', e);
    res.status(500).json({ error: 'internal_error', message: e.message });
  }
});

// ============================================================================
// POST /api/aportes/webhook - Webhook de MercadoPago Orders/Payments API
// ============================================================================
router.post('/webhook', async (req, res) => {
  try {
    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
    const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET || process.env.MERCADOPAGO_WEBHOOK_SECRET;

    // Verificar firma HMAC de MercadoPago Checkout Pro
    // MP envía: x-signature: ts=<timestamp>,v1=<hmac_sha256>
    // El mensaje a firmar es: id:<data.id>;request-id:<x-request-id>;ts:<ts>
    if (MP_WEBHOOK_SECRET) {
      const xSignature = req.headers['x-signature'];
      const xRequestId = req.headers['x-request-id'];
      const dataId = req.query?.['data.id'] || req.body?.data?.id;

      if (xSignature && dataId) {
        const parts = xSignature.split(',');
        let ts = '', v1 = '';
        for (const part of parts) {
          const [k, val] = part.split('=');
          if (k === 'ts') ts = val;
          if (k === 'v1') v1 = val;
        }
        const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts}`;
        const expected = crypto.createHmac('sha256', MP_WEBHOOK_SECRET).update(manifest).digest('hex');
        if (expected !== v1) {
          console.warn('[APORTES_WEBHOOK] Invalid HMAC signature');
          return res.status(401).json({ error: 'unauthorized' });
        }
      }
      // Si no hay x-signature (sandbox o configuración sin firma), continuar de todos modos
    }

    const { type, data, topic, resource } = req.body;
    
    console.log('[APORTES_WEBHOOK] Received:', { type, topic, data });

    // Responder inmediatamente a MP
    res.status(200).json({ received: true });

    // MercadoPago puede enviar notificaciones en diferentes formatos
    // Orders API usa 'topic' y 'resource', Payments API usa 'type' y 'data'
    
    let orderId = null;
    let paymentId = null;
    let externalRef = null;

    // Detectar tipo de notificación
    if (type === 'payment' && data?.id) {
      // Formato antiguo Payments API
      paymentId = data.id;
    } else if (topic === 'order' && resource) {
      // Formato Orders API
      orderId = resource.split('/').pop();
    } else if (data?.order_id) {
      // Notificación de orden directa
      orderId = data.order_id;
    }

    // Si tenemos order_id, consultar la orden
    if (orderId) {
      const orderResponse = await fetch(`https://api.mercadopago.com/v1/orders/${orderId}`, {
        headers: {
          'Authorization': `Bearer ${MP_ACCESS_TOKEN}`
        }
      });

      if (!orderResponse.ok) {
        console.error('[APORTES] Error fetching order from MP');
        return;
      }

      const orderData = await orderResponse.json();
      externalRef = orderData.external_reference;
      
      // Obtener el último payment de la orden
      if (orderData.payments && orderData.payments.length > 0) {
        const lastPayment = orderData.payments[orderData.payments.length - 1];
        paymentId = lastPayment.id;
      }
      
      // Procesar según estado de la orden
      if (orderData.status === 'paid' || orderData.status === 'processed') {
        await procesarAporteAprobado(externalRef, paymentId, orderId);
      } else if (orderData.status === 'canceled' || orderData.status === 'expired') {
        await procesarAporteRechazado(externalRef, paymentId);
      }
      return;
    }

    // Fallback: Si solo tenemos payment_id (formato antiguo)
    if (paymentId) {
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${MP_ACCESS_TOKEN}`
        }
      });

      if (!mpResponse.ok) {
        console.error('[APORTES] Error fetching payment from MP');
        return;
      }

      const paymentData = await mpResponse.json();
      externalRef = paymentData.external_reference;

      if (paymentData.status === 'approved') {
        await procesarAporteAprobado(externalRef, paymentId, null);
      } else if (paymentData.status === 'rejected' || paymentData.status === 'cancelled') {
        await procesarAporteRechazado(externalRef, paymentId);
      }
    }
  } catch (e) {
    console.error('[APORTES] Webhook error:', e);
  }
});

// Helper: Procesar aporte aprobado
async function procesarAporteAprobado(external_reference, paymentId, orderId) {
  if (!external_reference) return;

  const aporteIds = external_reference.split(',').map(id => parseInt(id));
  const { aportes: Aporte, aportes_referidos: AporteReferido, aportes_bonus: AporteBonus } = sequelize.models;

  for (const aporteId of aporteIds) {
    const aporte = await Aporte.findByPk(aporteId);
    if (!aporte) continue;

    // Verificar si ya está aprobado (evitar duplicados)
    if (aporte.payment_status === 'approved') continue;

    await aporte.update({
      payment_status: 'approved',
      mp_payment_id: paymentId ? String(paymentId) : null,
      mp_order_id: orderId ? String(orderId) : aporte.mp_order_id
    });

    // Procesar referido si existe
    if (aporte.referido_dni && !aporte.referido_bonus_applied) {
      await procesarReferido(aporte, AporteReferido, AporteBonus);
    }

    // Enviar email de confirmación
    await sendAporteConfirmation({
      email: aporte.email,
      nombre: `${aporte.nombre} ${aporte.apellido}`,
      numero_aporte: aporte.numero_aporte,
      monto: aporte.monto,
      payment_method: 'mercadopago'
    });

    console.log(`[APORTES] Aporte ${aporte.numero_aporte} aprobado para ${aporte.dni}`);
  }
}

// Helper: Procesar aporte rechazado
async function procesarAporteRechazado(external_reference, paymentId) {
  if (!external_reference) return;

  const aporteIds = external_reference.split(',').map(id => parseInt(id));
  const { aportes: Aporte } = sequelize.models;

  for (const aporteId of aporteIds) {
    const aporte = await Aporte.findByPk(aporteId);
    if (!aporte) continue;

    await aporte.update({
      payment_status: 'rejected',
      mp_payment_id: paymentId ? String(paymentId) : null
    });
  }
}

// Helper: Procesar referido
async function procesarReferido(aporte, AporteReferido, AporteBonus) {
  try {
    const bonusPorReferir = parseInt(await getConfig('bonus_por_referido') || '1');
    const bonusAlReferido = parseInt(await getConfig('bonus_al_referido') || '1');

    // Verificar que el referidor exista y tenga aportes aprobados
    const { aportes: AporteModel } = sequelize.models;
    const referidorExists = await AporteModel.findOne({
      where: { 
        dni: aporte.referido_dni,
        payment_status: 'approved'
      }
    });

    if (!referidorExists) {
      console.log(`[APORTES] Referidor ${aporte.referido_dni} no encontrado o sin aportes`);
      return;
    }

    // Crear registro de referido
    const referido = await AporteReferido.create({
      aportante_dni: aporte.referido_dni,
      referido_dni: aporte.dni,
      aporte_id: aporte.id,
      bonus_extra_aportes: bonusAlReferido
    });

    // Bonus para quien refiere (el referidor)
    await AporteBonus.create({
      dni: aporte.referido_dni,
      tipo: 'referido_otorga',
      aporte_id: aporte.id,
      referido_id: referido.id,
      cantidad: bonusPorReferir
    });

    // Bonus para quien usa el código (el referido)
    await AporteBonus.create({
      dni: aporte.dni,
      tipo: 'referido_recibe',
      aporte_id: aporte.id,
      referido_id: referido.id,
      cantidad: bonusAlReferido
    });

    // Marcar como procesado
    await aporte.update({ referido_bonus_applied: true });

    // Notificar al referidor
    await sendReferidoNotification({
      email: referidorExists.email,
      nombre: `${referidorExists.nombre} ${referidorExists.apellido}`,
      referido_nombre: `${aporte.nombre} ${aporte.apellido}`,
      referido_dni: aporte.dni,
      bonus_ganado: bonusPorReferir
    });

    console.log(`[APORTES] Referido procesado: ${aporte.dni} fue referido por ${aporte.referido_dni}`);
  } catch (e) {
    console.error('[APORTES] Error procesando referido:', e);
  }
}

// ============================================================================
// GET /api/aportes/confirm-payment - Confirmar pago desde back_url de MP
// Fallback cuando el webhook llega tarde (sandbox). Verifica con la API de MP.
// ============================================================================
router.get('/confirm-payment', async (req, res) => {
  try {
    const { payment_id, external_reference, collection_status } = req.query;
    if (!payment_id || collection_status !== 'approved') {
      return res.status(400).json({ error: 'invalid_params' });
    }

    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!MP_ACCESS_TOKEN) return res.status(500).json({ error: 'mp_not_configured' });

    // Verificar el pago directamente con MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` }
    });
    if (!mpRes.ok) return res.status(502).json({ error: 'mp_error' });

    const mpData = await mpRes.json();
    if (mpData.status !== 'approved') {
      return res.status(400).json({ error: 'not_approved', status: mpData.status });
    }

    const ref = external_reference || mpData.external_reference;
    if (!ref) return res.status(400).json({ error: 'no_reference' });

    await procesarAporteAprobado(ref, payment_id, null);
    res.json({ ok: true });
  } catch (e) {
    console.error('[APORTES] confirm-payment error:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ============================================================================
// GET /api/aportes/detail/:id - Detalle público de un aporte por ID
// ============================================================================
router.get('/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { aportes: Aporte } = sequelize.models;
    const aporte = await Aporte.findByPk(id, {
      attributes: ['id', 'numero_aporte', 'dni', 'nombre', 'apellido', 'monto', 'payment_status', 'payment_method', 'created_at']
    });
    if (!aporte) return res.status(404).json({ error: 'not_found' });
    res.json(aporte);
  } catch (e) {
    console.error('[APORTES] Error getting detail:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ============================================================================
// GET /api/aportes/my-aportes - Obtener mis aportes y bonus
// ============================================================================
router.get('/my-aportes', async (req, res) => {
  try {
    const { dni } = req.query;
    
    if (!dni || !/^\d{7,8}$/.test(dni)) {
      return res.status(400).json({ error: 'invalid_dni' });
    }

    const { aportes: Aporte, aportes_bonus: AporteBonus, aportes_referidos: AporteReferido } = sequelize.models;

    // Obtener aportes aprobados
    const aportes = await Aporte.findAll({
      where: { dni, payment_status: 'approved' },
      order: [['created_at', 'DESC']]
    });

    // Obtener bonus
    const bonus = await AporteBonus.findAll({
      where: { dni },
      include: [{
        model: AporteReferido,
        as: 'referido',
        attributes: ['aportante_dni', 'referido_dni'],
        required: false
      }],
      order: [['created_at', 'DESC']]
    });

    // Obtener referidos realizados
    const referidosRealizados = await AporteReferido.findAll({
      where: { aportante_dni: dni },
      include: [{
        model: Aporte,
        as: 'aporte',
        attributes: ['nombre', 'apellido', 'dni'],
        required: true
      }],
      order: [['created_at', 'DESC']]
    });

    // Calcular totales
    const totalAportes = aportes.length;
    const totalBonusOtorgados = bonus
      .filter(b => b.tipo === 'referido_otorga')
      .reduce((sum, b) => sum + b.cantidad, 0);
    const totalBonusRecibidos = bonus
      .filter(b => b.tipo === 'referido_recibe')
      .reduce((sum, b) => sum + b.cantidad, 0);

    // Calcular chances de sorteo
    const numerosSorteo = [
      ...aportes.map(a => a.numero_aporte),
      // Los bonus son "chances" adicionales - se representan como números negativos o con un prefijo especial
      // Por ahora, los bonus aumentan la probabilidad estadísticamente
    ];

    // Bonus disponibles para descuento (no utilizados)
    const bonusDisponibles = totalAportes + totalBonusRecibidos;
    const bonusUtilizados = bonus.reduce((sum, b) => sum + b.utilizados, 0);
    const bonusRestantes = bonusDisponibles - bonusUtilizados;

    res.json({
      dni,
      total_aportes: totalAportes,
      total_bonus_otorgados: totalBonusOtorgados,
      total_bonus_recibidos: totalBonusRecibidos,
      total_chances_sorteo: bonusDisponibles, // Cada aporte + bonus = una chance
      bonus_disponibles_descuento: bonusRestantes,
      aportes: aportes.map(a => ({
        id: a.id,
        numero_aporte: a.numero_aporte,
        monto: a.monto,
        payment_method: a.payment_method,
        created_at: a.created_at
      })),
      bonus: bonus.map(b => ({
        id: b.id,
        tipo: b.tipo,
        cantidad: b.cantidad,
        utilizados: b.utilizados,
        created_at: b.created_at
      })),
      referidos_realizados: referidosRealizados.map(r => ({
        id: r.id,
        referido_dni: r.referido_dni,
        referido_nombre: r.aporte ? `${r.aporte.nombre} ${r.aporte.apellido}` : null,
        bonus_extra: r.bonus_extra_aportes,
        created_at: r.created_at
      }))
    });

  } catch (e) {
    console.error('[APORTES] Error getting my aportes:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ============================================================================
// GET /api/aportes/check-descuento - Verificar descuento disponible
// ============================================================================
router.get('/check-descuento', async (req, res) => {
  try {
    const { dni, cantidad_tickets = 1 } = req.query;
    
    if (!dni || !/^\d{7,8}$/.test(dni)) {
      return res.status(400).json({ error: 'invalid_dni' });
    }

    const { aportes: Aporte, aportes_bonus: AporteBonus } = sequelize.models;

    // Contar aportes aprobados
    const totalAportes = await Aporte.count({
      where: { dni, payment_status: 'approved' }
    });

    // Contar bonus recibidos
    const bonusRecibidos = await AporteBonus.findAll({
      where: { dni, tipo: 'referido_recibe' }
    });
    const totalBonusRecibidos = bonusRecibidos.reduce((sum, b) => sum + b.cantidad, 0);

    // Bonus utilizados
    const bonusUtilizados = bonusRecibidos.reduce((sum, b) => sum + b.utilizados, 0);

    // Total disponible para descuento
    const totalDisponible = totalAportes + totalBonusRecibidos - bonusUtilizados;

    // Config de descuento
    const minAportes = parseInt(await getConfig('min_aportes_para_descuento') || '4');
    const aportesDescuentoExtra = parseInt(await getConfig('aportes_descuento_extra') || '5');

    // Calcular descuento aplicable
    // Regla: si tiene 4 o más aportes disponibles, obtiene 5 tickets por el precio de 4
    let descuentoAplicable = 0;
    let ticketsExtra = 0;
    let mensaje = null;

    if (totalDisponible >= minAportes) {
      // Cada grupo de 4 aportes da 1 ticket extra
      const gruposCompletos = Math.floor(totalDisponible / minAportes);
      ticketsExtra = gruposCompletos * (aportesDescuentoExtra - minAportes);
      
      // Aplicar al ticket actual
      if (parseInt(cantidad_tickets) >= minAportes) {
        descuentoAplicable = ticketsExtra;
        mensaje = `¡Tenés ${totalDisponible} aportes! Por cada ${minAportes} aportes, te regalamos ${aportesDescuentoExtra - minAportes} ticket extra.`;
      }
    }

    res.json({
      dni,
      total_aportes: totalAportes,
      total_bonus: totalBonusRecibidos,
      total_disponible: totalDisponible,
      min_aportes_para_descuento: minAportes,
      aportes_descuento_extra: aportesDescuentoExtra,
      descuento_aplicable: descuentoAplicable,
      tickets_extra: ticketsExtra,
      mensaje,
      puede_aplicar_descuento: totalDisponible >= minAportes
    });

  } catch (e) {
    console.error('[APORTES] Error checking descuento:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ============================================================================
// POST /api/aportes/transferencia - Registrar aporte por transferencia
// (Para uso del chatbot o admin)
// ============================================================================
router.post('/transferencia', async (req, res) => {
  try {
    const { 
      dni, 
      email, 
      nombre, 
      apellido, 
      telefono, 
      provincia, 
      localidad,
      cantidad = 1,
      comprobante_url,
      referido_dni
    } = req.body;

    if (!dni || !email || !nombre || !apellido || !telefono || !provincia || !localidad) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    const { aportes: Aporte } = sequelize.models;
    const montoAporte = parseInt(await getConfig('monto_aporte') || '5000');

    const aportesCreados = [];
    
    for (let i = 0; i < cantidad; i++) {
      const numero_aporte = await getNextNumeroAporte();
      const aporte = await Aporte.create({
        numero_aporte,
        dni,
        email,
        nombre,
        apellido,
        telefono,
        provincia,
        localidad,
        monto: montoAporte,
        payment_method: 'transferencia',
        payment_status: 'pending', // Pendiente de verificación
        transfer_receipt_url: comprobante_url || null,
        referido_dni: referido_dni || null
      });
      aportesCreados.push(aporte);
    }

    res.json({
      success: true,
      message: 'Aporte registrado pendiente de verificación',
      aportes: aportesCreados.map(a => ({
        id: a.id,
        numero_aporte: a.numero_aporte,
        status: 'pending_verification'
      })),
      total: montoAporte * cantidad
    });

  } catch (e) {
    console.error('[APORTES] Error registering transferencia:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ============================================================================
// PUT /api/aportes/verify-transfer/:id - Verificar transferencia (Admin)
// ============================================================================
router.put('/verify-transfer/:id', authenticateToken, requireRole('admin', 'boleteria'), async (req, res) => {
  try {
    const { id } = req.params;
    const { approved, verified_by } = req.body;
    const { aportes: Aporte, aportes_referidos: AporteReferido, aportes_bonus: AporteBonus } = sequelize.models;

    const aporte = await Aporte.findByPk(id);
    if (!aporte) {
      return res.status(404).json({ error: 'aporte_not_found' });
    }

    if (aporte.payment_method !== 'transferencia') {
      return res.status(400).json({ error: 'not_transferencia_payment' });
    }

    if (approved) {
      await aporte.update({
        payment_status: 'approved',
        transfer_receipt_verified: true,
        transfer_receipt_verified_at: new Date(),
        transfer_receipt_verified_by: verified_by || req.user?.name || 'admin'
      });

      // Procesar referido si existe
      if (aporte.referido_dni && !aporte.referido_bonus_applied) {
        await procesarReferido(aporte, AporteReferido, AporteBonus);
      }

      // Enviar email de confirmación
      await sendAporteConfirmation({
        email: aporte.email,
        nombre: `${aporte.nombre} ${aporte.apellido}`,
        numero_aporte: aporte.numero_aporte,
        monto: aporte.monto,
        payment_method: 'transferencia'
      });

      res.json({ 
        success: true, 
        message: 'Transferencia verificada y aporte aprobado',
        aporte: {
          id: aporte.id,
          numero_aporte: aporte.numero_aporte,
          payment_status: 'approved'
        }
      });
    } else {
      await aporte.update({
        payment_status: 'rejected',
        transfer_receipt_verified: true,
        transfer_receipt_verified_at: new Date(),
        transfer_receipt_verified_by: verified_by || req.user?.name || 'admin'
      });

      res.json({ 
        success: true, 
        message: 'Transferencia rechazada',
        aporte: {
          id: aporte.id,
          numero_aporte: aporte.numero_aporte,
          payment_status: 'rejected'
        }
      });
    }

  } catch (e) {
    console.error('[APORTES] Error verifying transfer:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ============================================================================
// GET /api/aportes/admin/pending-transfers - Listar transferencias pendientes
// ============================================================================
router.get('/admin/pending-transfers', authenticateToken, requireRole('admin', 'boleteria'), async (req, res) => {
  try {
    const { aportes: Aporte } = sequelize.models;
    
    const pending = await Aporte.findAll({
      where: { 
        payment_method: 'transferencia',
        payment_status: 'pending',
        transfer_receipt_verified: false
      },
      order: [['created_at', 'ASC']]
    });

    res.json({
      total: pending.length,
      aportes: pending.map(a => ({
        id: a.id,
        numero_aporte: a.numero_aporte,
        dni: a.dni,
        email: a.email,
        nombre: `${a.nombre} ${a.apellido}`,
        telefono: a.telefono,
        provincia: a.provincia,
        localidad: a.localidad,
        monto: a.monto,
        transfer_receipt_url: a.transfer_receipt_url,
        referido_dni: a.referido_dni,
        created_at: a.created_at
      }))
    });

  } catch (e) {
    console.error('[APORTES] Error getting pending transfers:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ============================================================================
// GET /api/aportes/admin/all - Listar todos los aportes (Admin)
// ============================================================================
router.get('/admin/all', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { status, dni, page = 1, limit = 50 } = req.query;
    const { aportes: Aporte } = sequelize.models;
    
    const where = {};
    if (status) where.payment_status = status;
    if (dni) where.dni = dni;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const { count, rows } = await Aporte.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      total_pages: Math.ceil(count / parseInt(limit)),
      aportes: rows.map(a => ({
        id: a.id,
        numero_aporte: a.numero_aporte,
        dni: a.dni,
        email: a.email,
        nombre: `${a.nombre} ${a.apellido}`,
        telefono: a.telefono,
        provincia: a.provincia,
        localidad: a.localidad,
        monto: a.monto,
        payment_method: a.payment_method,
        payment_status: a.payment_status,
        referido_dni: a.referido_dni,
        created_at: a.created_at
      }))
    });

  } catch (e) {
    console.error('[APORTES] Error getting all aportes:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ============================================================================
// GET /api/aportes/admin/resumen - Resumen del sistema (Admin)
// ============================================================================
router.get('/admin/resumen', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { aportes: Aporte, aportes_referidos: AporteReferido, aportes_bonus: AporteBonus } = sequelize.models;

    const [totalAportes, aprobados, pendientes, rechazados, totalReferidos, totalBonus] = await Promise.all([
      Aporte.count(),
      Aporte.count({ where: { payment_status: 'approved' } }),
      Aporte.count({ where: { payment_status: 'pending' } }),
      Aporte.count({ where: { payment_status: 'rejected' } }),
      AporteReferido.count(),
      AporteBonus.count()
    ]);

    const montoTotal = await Aporte.sum('monto', {
      where: { payment_status: 'approved' }
    }) || 0;

    res.json({
      total_aportes: totalAportes,
      aprobados,
      pendientes,
      rechazados,
      monto_total_recaudado: parseFloat(montoTotal),
      total_referidos: totalReferidos,
      total_bonus_otorgados: totalBonus,
      numeros_sorteo: aprobados + totalBonus // Cada aporte + bonus = un número de sorteo
    });

  } catch (e) {
    console.error('[APORTES] Error getting resumen:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ============================================================================
// POST /api/aportes/apply-to-reservation - Aplicar aportes como descuento
// ============================================================================
router.post('/apply-to-reservation', async (req, res) => {
  try {
    const { dni, reservation_id, cantidad_tickets } = req.body;
    
    if (!dni || !reservation_id) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    const { aportes: Aporte, aportes_bonus: AporteBonus, reservations: Reservation } = sequelize.models;

    // Verificar que la reserva exista
    const reservation = await Reservation.findByPk(reservation_id);
    if (!reservation) {
      return res.status(404).json({ error: 'reservation_not_found' });
    }

    // Contar aportes aprobados del usuario
    const totalAportes = await Aporte.count({
      where: { dni, payment_status: 'approved' }
    });

    // Contar bonus recibidos
    const bonusRecibidos = await AporteBonus.findAll({
      where: { dni, tipo: 'referido_recibe' }
    });
    const totalBonusRecibidos = bonusRecibidos.reduce((sum, b) => sum + b.cantidad, 0);

    // Bonus utilizados
    const bonusUtilizados = bonusRecibidos.reduce((sum, b) => sum + b.utilizados, 0);

    // Total disponible para descuento
    const totalDisponible = totalAportes + totalBonusRecibidos - bonusUtilizados;

    // Config de descuento
    const minAportes = parseInt(await getConfig('min_aportes_para_descuento') || '4');
    const aportesDescuentoExtra = parseInt(await getConfig('aportes_descuento_extra') || '5');

    // Calcular cuántos tickets gratis se pueden dar
    const gruposCompletos = Math.floor(totalDisponible / minAportes);
    const ticketsExtraDisponibles = gruposCompletos * (aportesDescuentoExtra - minAportes);

    if (ticketsExtraDisponibles <= 0) {
      return res.status(400).json({ 
        error: 'insufficient_aportes',
        message: `Necesitás al menos ${minAportes} aportes para obtener tickets extra`
      });
    }

    // Limitar tickets extra a la cantidad de tickets comprados
    const ticketsExtra = Math.min(ticketsExtraDisponibles, cantidad_tickets || minAportes);

    // Marcar aportes como utilizados
    // Primero usamos los bonus, luego los aportes base
    let aportesAUsar = ticketsExtra;
    
    // Usar bonus primero
    for (const bonus of bonusRecibidos) {
      if (aportesAUsar <= 0) break;
      const disponible = bonus.cantidad - bonus.utilizados;
      if (disponible > 0) {
        const usar = Math.min(disponible, aportesAUsar);
        await bonus.increment('utilizados', { by: usar });
        aportesAUsar -= usar;
      }
    }

    // Si quedan aportes por usar, crear registro de uso
    // Nota: Los aportes base no se "marcan" como usados, solo los bonus
    // porque los aportes base permanecen para el sorteo

    res.json({
      success: true,
      dni,
      total_aportes: totalAportes,
      total_bonus: totalBonusRecibidos,
      tickets_extra_otorgados: ticketsExtra,
      aportes_utilizados: ticketsExtra,
      aportes_restantes: totalDisponible - ticketsExtra,
      message: `¡Felicitaciones! Tenés ${totalDisponible} aportes y te regalamos ${ticketsExtra} ticket${ticketsExtra > 1 ? 's' : ''} extra.`
    });

  } catch (e) {
    console.error('[APORTES] Error applying to reservation:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// ============================================================================
// GET /api/aportes/numeros-sorteo - Obtener todos los números para sorteo
// ============================================================================
router.get('/numeros-sorteo', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { aportes: Aporte, aportes_bonus: AporteBonus } = sequelize.models;

    // Obtener aportes aprobados
    const aportes = await Aporte.findAll({
      where: { payment_status: 'approved' },
      order: [['numero_aporte', 'ASC']]
    });

    // Obtener bonus
    const bonus = await AporteBonus.findAll();

    // Construir lista de participantes
    const participantes = [];
    
    // Cada aporte es un número de sorteo
    for (const aporte of aportes) {
      participantes.push({
        numero: aporte.numero_aporte,
        tipo: 'aporte',
        dni: aporte.dni,
        email: aporte.email,
        nombre: `${aporte.nombre} ${aporte.apellido}`,
        telefono: aporte.telefono,
        provincia: aporte.provincia,
        localidad: aporte.localidad
      });
    }

    // Los bonus aumentan las chances (se agregan como números adicionales con prefijo B)
    let bonusCounter = 1;
    for (const b of bonus) {
      const aporte = await Aporte.findByPk(b.aporte_id);
      if (aporte && aporte.payment_status === 'approved') {
        for (let i = 0; i < b.cantidad; i++) {
          participantes.push({
            numero: `B${String(bonusCounter).padStart(6, '0')}`,
            tipo: `bonus_${b.tipo}`,
            dni: b.dni,
            email: aporte.email,
            nombre: `${aporte.nombre} ${aporte.apellido}`,
            telefono: aporte.telefono,
            provincia: aporte.provincia,
            localidad: aporte.localidad,
            bonus_original: aporte.numero_aporte
          });
          bonusCounter++;
        }
      }
    }

    res.json({
      total_participantes: participantes.length,
      participantes
    });

  } catch (e) {
    console.error('[APORTES] Error getting numeros sorteo:', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
