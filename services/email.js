/**
 * Servicio de Email con Nodemailer (SMTP)
 * Envía códigos OTP y notificaciones con diseño profesional
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const nodemailer = require('nodemailer');

// Crear transporter SMTP
let transporter = null;

if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  const smtpPort = parseInt(process.env.SMTP_PORT || '465');
  const smtpSecure = process.env.SMTP_SECURE !== 'false';

  console.log(`[EMAIL] Configurando SMTP: ${process.env.SMTP_HOST}:${smtpPort} (secure: ${smtpSecure})`);

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    socketTimeout: 10000,
  });

  transporter.verify()
    .then(() => console.log('[EMAIL] SMTP conectado correctamente'))
    .catch((err) => console.error('[EMAIL] Error conectando SMTP:', err.code, err.message));
} else {
  console.log('[EMAIL] Variables SMTP no encontradas, modo console activado');
}

const FROM_NAME = 'TRESESENTA';
const FROM_EMAIL = process.env.SMTP_USER || 'mapa@tenis360.com';

/**
 * Enviar email usando SMTP
 */
async function sendEmail({ to, subject, html }) {
  const EMAIL_MODE = process.env.EMAIL_MODE || 'console';

  if (EMAIL_MODE === 'console' || !transporter) {
    console.log(`[EMAIL] Modo console - no se envía email real a ${to}`);
    return { success: true, mode: 'console' };
  }

  try {
    const info = await transporter.sendMail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });

    console.log(`[EMAIL] Email enviado a ${to} (ID: ${info.messageId})`);
    return { success: true, mode: 'smtp', id: info.messageId };
  } catch (error) {
    console.error('[EMAIL] Error al enviar:', error.message);
    return { success: false, mode: 'smtp', error: error.message };
  }
}

/**
 * Plantilla HTML para el email de OTP
 */
function getOTPEmailHTML(code, email) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #ffffff;">
  <table width="100%" cellspacing="0" cellpadding="0" style="padding: 60px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellspacing="0" cellpadding="0" style="max-width: 400px;">

          <tr>
            <td style="text-align: center; padding-bottom: 40px;">
              <h1 style="margin: 0; font-size: 36px; font-weight: 900; color: #1a1a1a; letter-spacing: -1px;">
                TRESESENTA
              </h1>
            </td>
          </tr>

          <tr>
            <td style="text-align: center; padding-bottom: 16px;">
              <p style="margin: 0; color: #666666; font-size: 16px;">
                Tu codigo de verificacion:
              </p>
            </td>
          </tr>

          <tr>
            <td style="text-align: center; padding-bottom: 24px;">
              <div style="font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #1a1a1a;">
                ${code}
              </div>
            </td>
          </tr>

          <tr>
            <td style="text-align: center; padding-bottom: 40px;">
              <p style="margin: 0; color: #999999; font-size: 14px;">
                Este codigo solo se puede usar una vez. Vencera en 10 minutos.
              </p>
            </td>
          </tr>

          <tr>
            <td style="text-align: center; border-top: 1px solid #eeeeee; padding-top: 24px;">
              <p style="margin: 0 0 8px 0; color: #999999; font-size: 12px;">
                &copy; Tenis 360
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Enviar código OTP por email
 */
async function sendOTPEmail(email, code) {
  // Siempre mostrar en consola para debugging
  console.log('\n' + '='.repeat(50));
  console.log('[OTP] CÓDIGO DE VERIFICACIÓN');
  console.log('='.repeat(50));
  console.log(`Para: ${email}`);
  console.log(`CÓDIGO: ${code}`);
  console.log('='.repeat(50) + '\n');

  return sendEmail({
    to: email,
    subject: `${code} - Tu código de acceso | TRESESENTA`,
    html: getOTPEmailHTML(code, email),
  });
}

/**
 * Enviar email de bienvenida
 */
async function sendWelcomeEmail(email, firstName) {
  const name = firstName || 'Cliente';
  console.log(`[EMAIL] Bienvenida para: ${email}`);

  return sendEmail({
    to: email,
    subject: `¡Bienvenido a TRESESENTA, ${name}!`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; background-color: #f5f0eb;">
  <table width="100%" cellspacing="0" cellpadding="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background: linear-gradient(135deg, #3d2c1f 0%, #c67b5c 100%); padding: 40px; text-align: center;">
              <h1 style="margin: 0; color: #fff; font-size: 32px; font-weight: 800;">TRESESENTA</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px 0; color: #3d2c1f; font-size: 24px;">Hola ${name}!</h2>
              <p style="color: #6b6b6b; font-size: 15px; line-height: 1.6;">
                Tu cuenta ha sido creada exitosamente. Ya puedes acceder a tu perfil, ver tu colección y mucho más.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://tresesenta.com" style="display: inline-block; padding: 14px 32px; background: #c67b5c; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
                  Ir a la tienda
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background: #f8f5f2; padding: 20px; text-align: center;">
              <p style="margin: 0; color: #999; font-size: 12px;">© ${new Date().getFullYear()} TRESESENTA</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });
}

/**
 * Enviar notificación de verificación aprobada
 */
async function sendVerificationApprovedEmail(email, username, pinTitle, bonusPoints) {
  console.log(`[EMAIL] Verificación aprobada para: ${email} - Pin: ${pinTitle}`);

  return sendEmail({
    to: email,
    subject: 'Tu pin fue aprobado | TRESESENTA',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:#f5f0eb;">
  <table width="100%" cellspacing="0" cellpadding="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#3d2c1f 0%,#c67b5c 100%);padding:40px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:32px;font-weight:800;">TRESESENTA</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <div style="text-align:center;margin-bottom:24px;">
              <h2 style="margin:12px 0 0;color:#2e7d32;font-size:22px;">Tu pin fue aprobado!</h2>
            </div>
            <p style="color:#6b6b6b;font-size:15px;line-height:1.6;">
              Hola <strong>@${username}</strong>,<br><br>
              Tu publicación <strong>"${pinTitle}"</strong> ha sido revisada y aprobada por nuestro equipo.
            </p>
            ${bonusPoints > 0 ? `
            <div style="background:#e8f5e9;border-radius:12px;padding:20px;text-align:center;margin:24px 0;">
              <p style="margin:0;color:#2e7d32;font-size:13px;text-transform:uppercase;letter-spacing:2px;">Puntos ganados</p>
              <p style="margin:8px 0 0;color:#1b5e20;font-size:36px;font-weight:800;">+${bonusPoints}</p>
            </div>` : ''}
          </td>
        </tr>
        <tr>
          <td style="background:#f8f5f2;padding:20px;text-align:center;">
            <p style="margin:0;color:#999;font-size:12px;">© ${new Date().getFullYear()} TRESESENTA</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

/**
 * Enviar notificación de verificación rechazada
 */
async function sendVerificationRejectedEmail(email, username, pinTitle, reason) {
  console.log(`[EMAIL] Verificación rechazada para: ${email} - Pin: ${pinTitle}`);

  return sendEmail({
    to: email,
    subject: 'Tu pin requiere cambios | TRESESENTA',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:#f5f0eb;">
  <table width="100%" cellspacing="0" cellpadding="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#3d2c1f 0%,#c67b5c 100%);padding:40px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:32px;font-weight:800;">TRESESENTA</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <div style="text-align:center;margin-bottom:24px;">
              <h2 style="margin:12px 0 0;color:#c62828;font-size:22px;">Verificación no aprobada</h2>
            </div>
            <p style="color:#6b6b6b;font-size:15px;line-height:1.6;">
              Hola <strong>@${username}</strong>,<br><br>
              Tu publicación <strong>"${pinTitle}"</strong> no pudo ser verificada en esta ocasión.
            </p>
            <div style="background:#ffebee;border-radius:12px;padding:20px;margin:24px 0;">
              <p style="margin:0 0 8px;color:#c62828;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:700;">Motivo</p>
              <p style="margin:0;color:#b71c1c;font-size:15px;line-height:1.5;">"${reason}"</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f5f2;padding:20px;text-align:center;">
            <p style="margin:0 0 4px;color:#6b6b6b;font-size:13px;">Dudas? Escríbenos a</p>
            <a href="mailto:hola@tresesenta.com" style="color:#c67b5c;font-size:13px;text-decoration:none;">hola@tresesenta.com</a>
            <p style="margin:12px 0 0;color:#999;font-size:12px;">© ${new Date().getFullYear()} TRESESENTA</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail,
  sendVerificationApprovedEmail,
  sendVerificationRejectedEmail,
};
