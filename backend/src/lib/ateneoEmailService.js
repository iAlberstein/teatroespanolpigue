import nodemailer from 'nodemailer';

const createTransporter = () => {
  const host = process.env.ATENEO_EMAIL_HOST || process.env.EMAIL_HOST;
  const user = process.env.ATENEO_EMAIL_USER || process.env.EMAIL_USER;
  const pass = process.env.ATENEO_EMAIL_PASS || process.env.EMAIL_PASS;
  const port = parseInt(process.env.ATENEO_EMAIL_PORT || process.env.EMAIL_PORT || '465');
  const secure = (process.env.ATENEO_EMAIL_SECURE || process.env.EMAIL_SECURE || 'true') === 'true';

  if (!host || !user) {
    console.warn('[ATENEO_EMAIL] SMTP not configured');
    return null;
  }
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
};

async function sendEmail({ to, subject, html }) {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('[ATENEO_EMAIL] Would send:', { to, subject });
    return { success: false, logged: true };
  }
  try {
    const info = await transporter.sendMail({
      from: process.env.ATENEO_EMAIL_FROM || `"Ateneo de Artes Escénicas" <${process.env.ATENEO_EMAIL_USER || process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
    console.log('[ATENEO_EMAIL] Sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[ATENEO_EMAIL] Error:', error.message);
    return { success: false, error: error.message };
  }
}

function baseTemplate(content) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
<tr><td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);padding:24px;text-align:center;">
<h1 style="color:#fff;margin:0;font-size:22px;">Ateneo de Artes Escénicas</h1>
</td></tr>
<tr><td style="padding:24px 30px;">${content}</td></tr>
<tr><td style="background:#f8f9fa;padding:16px;text-align:center;border-top:1px solid #eee;">
<p style="color:#999;margin:0;font-size:11px;">Ateneo de Artes Escénicas - Teatro Español Pigüé<br>Este es un correo automático.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// 9.1 Confirmación de inscripción
export async function enviarConfirmacionInscripcion({ email, nombre, clase, estado }) {
  const html = baseTemplate(`
    <h2 style="color:#333;margin:0 0 12px;">¡Hola ${nombre}!</h2>
    <p style="color:#555;line-height:1.6;">Tu inscripción a <strong>${clase}</strong> fue registrada correctamente.</p>
    <div style="background:#f5f3ff;border-left:4px solid #7c3aed;padding:12px 16px;border-radius:4px;margin:16px 0;">
      <strong>Estado:</strong> ${estado === 'confirmada' ? 'Confirmada' : 'Pendiente de confirmación'}
    </div>
    ${estado !== 'confirmada' ? '<p style="color:#555;">Para confirmar tu inscripción, realizá el pago de la matrícula desde tu portal de alumno.</p>' : ''}
    <p style="color:#555;">Podés ver el detalle de tus clases e inscripciones ingresando a tu portal.</p>
  `);
  return sendEmail({ to: email, subject: `Inscripción registrada - ${clase}`, html });
}

// 9.1b Notificación de inscripción confirmada por admin
export async function enviarInscripcionConfirmada({ email, nombre, clase }) {
  const frontendUrl = process.env.FRONTEND_URL || process.env.BASE_URL || 'https://www.teatropigue.com.ar';
  const html = baseTemplate(`
    <h2 style="color:#333;margin:0 0 12px;">¡Hola ${nombre}!</h2>
    <p style="color:#555;line-height:1.6;">Tu inscripción a <strong>${clase}</strong> fue <strong style="color:#059669;">confirmada</strong> por la administración del Ateneo.</p>
    <div style="background:#f0fdf4;border-left:4px solid #059669;padding:12px 16px;border-radius:4px;margin:16px 0;">
      <strong>Estado:</strong> Confirmada ✓
    </div>
    <p style="color:#555;line-height:1.6;">Ya podés continuar con tu proceso de inscripción abonando la matrícula y las cuotas correspondientes desde tu portal de alumno.</p>
    <div style="text-align:center;margin:20px 0;">
      <a href="${frontendUrl}/ateneo/alumno" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Ir a Mi Portal</a>
    </div>
  `);
  return sendEmail({ to: email, subject: `Inscripción confirmada - ${clase}`, html });
}

// 9.1c Notificación de baja de inscripción
export async function enviarNotificacionBaja({ email, nombre, clase, motivo }) {
  const html = baseTemplate(`
    <h2 style="color:#333;margin:0 0 12px;">Hola ${nombre}</h2>
    <p style="color:#555;line-height:1.6;">Te informamos que tu inscripción a <strong>${clase}</strong> fue dada de baja.</p>
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:4px;margin:16px 0;">
      <strong>Observación:</strong> ${motivo || 'Sin observaciones'}
    </div>
    <p style="color:#555;line-height:1.6;">Los pagos pendientes asociados a esta inscripción fueron eliminados. Si tenés alguna consulta, contactá a la administración del Ateneo.</p>
  `);
  return sendEmail({ to: email, subject: `Baja de inscripción - ${clase}`, html });
}

// 9.2 Recordatorio previo a vencimiento de cuota
export async function enviarRecordatorioCuota({ email, nombre, clase, periodo, monto, fechaVencimiento }) {
  const html = baseTemplate(`
    <h2 style="color:#333;margin:0 0 12px;">Hola ${nombre}</h2>
    <p style="color:#555;line-height:1.6;">Te recordamos que tenés una cuota próxima a vencer:</p>
    <div style="background:#fefce8;border-left:4px solid #d97706;padding:12px 16px;border-radius:4px;margin:16px 0;">
      <strong>Clase:</strong> ${clase}<br>
      <strong>Período:</strong> ${periodo}<br>
      <strong>Monto:</strong> $${Number(monto).toLocaleString('es-AR')}<br>
      <strong>Vencimiento:</strong> ${fechaVencimiento}
    </div>
    <p style="color:#555;">Podés realizar el pago desde tu portal de alumno para mantener tu estado académico al día.</p>
  `);
  return sendEmail({ to: email, subject: `Recordatorio de cuota - ${clase}`, html });
}

// 9.3 Aviso de cuota vencida
export async function enviarAvisoCuotaVencida({ email, nombre, clase, periodo, monto, fechaVencimiento }) {
  const html = baseTemplate(`
    <h2 style="color:#333;margin:0 0 12px;">Hola ${nombre}</h2>
    <p style="color:#555;line-height:1.6;">Te informamos que tenés una cuota vencida:</p>
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:4px;margin:16px 0;">
      <strong>Clase:</strong> ${clase}<br>
      <strong>Período:</strong> ${periodo}<br>
      <strong>Monto:</strong> $${Number(monto).toLocaleString('es-AR')}<br>
      <strong>Venció el:</strong> ${fechaVencimiento}
    </div>
    <p style="color:#555;">Por favor regularizá tu situación lo antes posible para evitar cambios en tu estado académico.</p>
  `);
  return sendEmail({ to: email, subject: `Cuota vencida - ${clase}`, html });
}

// 9.4 Aviso de suspensión
export async function enviarAvisoSuspension({ email, nombre, motivo }) {
  const html = baseTemplate(`
    <h2 style="color:#333;margin:0 0 12px;">Hola ${nombre}</h2>
    <p style="color:#555;line-height:1.6;">Te informamos que tu estado académico fue actualizado a <strong style="color:#dc2626;">suspendido</strong>.</p>
    <div style="background:#fef2f2;border-left:4px solid #991b1b;padding:12px 16px;border-radius:4px;margin:16px 0;">
      <strong>Motivo:</strong> ${motivo || 'Cuotas vencidas acumuladas'}
    </div>
    <p style="color:#555;">Para regularizar tu situación, contactá a la administración del Ateneo o realizá los pagos pendientes desde tu portal.</p>
  `);
  return sendEmail({ to: email, subject: 'Estado académico actualizado - Ateneo', html });
}

// 9.4b Notificación de seguimiento docente -> admin
export async function enviarNotificacionSeguimiento({ docenteNombre, alumnoNombre, claseNombre, seguimientoTexto }) {
  const ahora = new Date();
  const fecha = `${String(ahora.getDate()).padStart(2,'0')}/${String(ahora.getMonth()+1).padStart(2,'0')}/${ahora.getFullYear()}`;
  const hora = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
  const html = baseTemplate(`
    <h2 style="color:#333;margin:0 0 12px;">Seguimiento de alumno</h2>
    <p style="color:#555;line-height:1.6;">Se registró una observación de seguimiento:</p>
    <div style="background:#f5f3ff;border-left:4px solid #7c3aed;padding:12px 16px;border-radius:4px;margin:16px 0;">
      <strong>Fecha y hora:</strong> ${fecha} - ${hora}hs<br>
      <strong>Docente:</strong> ${docenteNombre}<br>
      <strong>Alumno:</strong> ${alumnoNombre}<br>
      <strong>Clase:</strong> ${claseNombre}
    </div>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:16px;border-radius:6px;margin:16px 0;">
      <p style="color:#333;margin:0;white-space:pre-line;line-height:1.6;">${seguimientoTexto || '(sin texto)'}</p>
    </div>
  `);
  return sendEmail({ to: 'ateneo@teatropigue.com.ar', subject: `Seguimiento: ${alumnoNombre} - ${claseNombre}`, html });
}

// 9.5 Confirmación de pago
export async function enviarConfirmacionPago({ email, nombre, clase, tipo, periodo, monto, origen }) {
  const concepto = tipo === 'matricula' ? 'Matrícula' : `Cuota ${periodo || ''}`;
  const html = baseTemplate(`
    <h2 style="color:#333;margin:0 0 12px;">¡Hola ${nombre}!</h2>
    <p style="color:#555;line-height:1.6;">Tu pago fue registrado correctamente:</p>
    <div style="background:#f0fdf4;border-left:4px solid #059669;padding:12px 16px;border-radius:4px;margin:16px 0;">
      <strong>Concepto:</strong> ${concepto}<br>
      <strong>Clase:</strong> ${clase}<br>
      <strong>Monto:</strong> $${Number(monto).toLocaleString('es-AR')}<br>
      <strong>Medio:</strong> ${origen === 'pasarela' ? 'Pago online' : origen === 'efectivo' ? 'Efectivo' : origen === 'transferencia' ? 'Transferencia' : origen || 'N/A'}
    </div>
    <p style="color:#059669;font-weight:600;">¡Gracias por tu pago!</p>
  `);
  return sendEmail({ to: email, subject: `Pago confirmado - ${concepto} ${clase}`, html });
}
