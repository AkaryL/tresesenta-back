/**
 * Servicio de Email con Resend
 * Envía códigos OTP con diseño profesional
 */

const { Resend } = require('resend');

// Solo inicializar Resend si hay API key
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.EMAIL_FROM || 'TRESESENTA <onboarding@resend.dev>';

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
  <title>Tu código de acceso</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f0eb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f0eb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header con gradiente -->
          <tr>
            <td style="background: linear-gradient(135deg, #3d2c1f 0%, #c67b5c 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: -1px;">
                TRESESENTA
              </h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px; letter-spacing: 2px;">
                MAPA 360
              </p>
            </td>
          </tr>

          <!-- Contenido -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 16px 0; color: #3d2c1f; font-size: 22px; font-weight: 700; text-align: center;">
                Tu código de verificación
              </h2>

              <p style="margin: 0 0 30px 0; color: #6b6b6b; font-size: 15px; line-height: 1.6; text-align: center;">
                Ingresa este código para acceder a tu cuenta. Expira en <strong>10 minutos</strong>.
              </p>

              <!-- Código OTP -->
              <div style="background: linear-gradient(135deg, #f8f5f2 0%, #f0ebe5 100%); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 30px;">
                <p style="margin: 0 0 8px 0; color: #6b6b6b; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">
                  Código de acceso
                </p>
                <div style="font-size: 40px; font-weight: 800; letter-spacing: 8px; color: #c67b5c; font-family: 'Courier New', monospace;">
                  ${code}
                </div>
              </div>

              <p style="margin: 0; color: #999999; font-size: 13px; text-align: center; line-height: 1.5;">
                Si no solicitaste este código, puedes ignorar este email.
                <br>Tu cuenta permanece segura.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f5f2; padding: 24px 30px; text-align: center; border-top: 1px solid #e8e4e0;">
              <p style="margin: 0 0 8px 0; color: #3d2c1f; font-size: 14px; font-weight: 600;">
                ¿Necesitas ayuda?
              </p>
              <p style="margin: 0; color: #6b6b6b; font-size: 13px;">
                Contáctanos en <a href="mailto:hola@tresesenta.com" style="color: #c67b5c; text-decoration: none;">hola@tresesenta.com</a>
              </p>
              <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e8e4e0;">
                <p style="margin: 0; color: #999999; font-size: 11px;">
                  © ${new Date().getFullYear()} TRESESENTA
                  <br>Este es un email automático, por favor no respondas.
                </p>
              </div>
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
  const EMAIL_MODE = process.env.EMAIL_MODE || 'console';

  // Siempre mostrar en consola para debugging
  console.log('\n' + '='.repeat(50));
  console.log('[OTP] CÓDIGO DE VERIFICACIÓN');
  console.log('='.repeat(50));
  console.log(`Para: ${email}`);
  console.log(`CÓDIGO: ${code}`);
  console.log('='.repeat(50) + '\n');

  // Si está en modo console o no hay API key, no enviar email real
  if (EMAIL_MODE === 'console' || !resend) {
    console.log('[EMAIL] Modo console - no se envía email real');
    return { success: true, mode: 'console' };
  }

  // Enviar email real con Resend
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `${code} - Tu código de acceso | TRESESENTA`,
      html: getOTPEmailHTML(code, email),
    });

    if (error) {
      console.error('[EMAIL] Error de Resend:', error);
      throw new Error(error.message);
    }

    console.log(`[EMAIL] ✅ Email enviado a ${email} (ID: ${data.id})`);
    return { success: true, mode: 'resend', id: data.id };

  } catch (error) {
    console.error('[EMAIL] Error al enviar:', error.message);
    // No lanzar error para no bloquear el flujo
    return { success: false, mode: 'resend', error: error.message };
  }
}

/**
 * Enviar email de bienvenida
 */
async function sendWelcomeEmail(email, firstName) {
  const EMAIL_MODE = process.env.EMAIL_MODE || 'console';
  const name = firstName || 'Cliente';

  console.log(`[EMAIL] Bienvenida para: ${email}`);

  if (EMAIL_MODE === 'console' || !resend) {
    return { success: true, mode: 'console' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `¡Bienvenido a TRESESENTA, ${name}!`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
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
              <h2 style="margin: 0 0 16px 0; color: #3d2c1f; font-size: 24px;">¡Hola ${name}! 👋</h2>
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
</html>
      `,
    });

    if (error) throw new Error(error.message);
    return { success: true, mode: 'resend', id: data.id };

  } catch (error) {
    console.error('[EMAIL] Error welcome:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail
};
