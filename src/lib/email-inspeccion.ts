import { MARCA } from "./marca";

interface DatosCorreoInspeccion {
  clienteNombre: string;
  fecha: string;
  horaInicio: string;
  horaFin?: string;
  asesorNombre: string;
  telefonoContacto: string;
  notas?: string;
  direccion?: string;
}

const SITE_URL = process.env.SITE_URL || "https://crm.saucedamx.com";

/**
 * Genera el HTML de confirmación de inspección técnica con diseño premium SAUCEDA.
 */
export function generarHtmlCorreoInspeccion(datos: DatosCorreoInspeccion): string {
  const fechaObj = new Date(`${datos.fecha}T00:00:00`);
  const fechaLegible = !isNaN(fechaObj.getTime())
    ? fechaObj.toLocaleDateString("es-MX", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : datos.fecha;

  const primerNombre = datos.clienteNombre.split(" ")[0] || datos.clienteNombre;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmación de Inspección Técnica - SAUCEDA</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F1E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F1E8;padding:24px 12px;">
    <tr>
      <td align="center">
        <!-- Contenedor Principal -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.05);">
          
          <!-- Encabezado SAUCEDA -->
          <tr>
            <td style="background-color:#2D4A2B;padding:28px 24px;text-align:center;">
              <div style="color:#F5F1E8;font-size:24px;font-weight:bold;letter-spacing:2px;">SAUCEDA</div>
              <div style="color:#C9A961;font-size:11px;font-weight:600;letter-spacing:3px;margin-top:4px;">CONSTRUCCIÓN & IMPERMEABILIZACIÓN</div>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:32px 28px;">
              <div style="display:inline-block;background-color:#EBF3E8;color:#2D4A2B;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:bold;margin-bottom:16px;">
                🔍 VISITA TÉCNICA AGENDADA
              </div>

              <h1 style="color:#2D4A2B;font-size:20px;font-weight:700;margin:0 0 12px;line-height:1.3;">
                ¡Hola, ${primerNombre}! Tu inspección técnica está confirmada
              </h1>

              <p style="color:#555555;font-size:14px;line-height:1.6;margin:0 0 24px;">
                Nos complace confirmarte que tu visita técnica de valoración con el equipo de SAUCEDA ha quedado programada exitosamente. A continuación te compartimos los detalles:
              </p>

              <!-- Tarjeta de Detalles -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAF7;border-radius:12px;border:1px solid #E2EBDD;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#666666;width:130px;vertical-align:top;">
                          <strong>🗓️ Fecha:</strong>
                        </td>
                        <td style="padding:6px 0;font-size:13px;color:#1A1A1A;font-weight:600;text-transform:capitalize;">
                          ${fechaLegible}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#666666;vertical-align:top;">
                          <strong>⏰ Horario:</strong>
                        </td>
                        <td style="padding:6px 0;font-size:13px;color:#1A1A1A;font-weight:600;">
                          ${datos.horaInicio} ${datos.horaFin ? `a ${datos.horaFin}` : ""} hrs
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#666666;vertical-align:top;">
                          <strong>👷 Asesor/Técnico:</strong>
                        </td>
                        <td style="padding:6px 0;font-size:13px;color:#2D4A2B;font-weight:700;">
                          ${datos.asesorNombre}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#666666;vertical-align:top;">
                          <strong>📞 Contacto directo:</strong>
                        </td>
                        <td style="padding:6px 0;font-size:13px;color:#1A1A1A;font-weight:600;">
                          <a href="tel:${datos.telefonoContacto.replace(/\D/g, "")}" style="color:#2D4A2B;text-decoration:none;">${datos.telefonoContacto}</a>
                        </td>
                      </tr>
                      ${
                        datos.direccion
                          ? `
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#666666;vertical-align:top;">
                          <strong>📍 Ubicación:</strong>
                        </td>
                        <td style="padding:6px 0;font-size:13px;color:#1A1A1A;">
                          ${datos.direccion}
                        </td>
                      </tr>
                      `
                          : ""
                      }
                      ${
                        datos.notas
                          ? `
                      <tr>
                        <td style="padding:6px 0;font-size:13px;color:#666666;vertical-align:top;">
                          <strong>📝 Observaciones:</strong>
                        </td>
                        <td style="padding:6px 0;font-size:13px;color:#555555;font-style:italic;">
                          ${datos.notas}
                        </td>
                      </tr>
                      `
                          : ""
                      }
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Recomendaciones -->
              <div style="background-color:#FFFBEB;border-left:4px solid #F59E0B;padding:12px 16px;border-radius:4px;font-size:12px;color:#92400E;line-height:1.5;margin-bottom:24px;">
                💡 <strong>Recomendación importante:</strong> Para agilizar la inspección, te sugerimos asegurar el acceso libre a la azotea o áreas que requieran atención.
              </div>

              <!-- Botón WhatsApp -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="text-align:center;">
                <tr>
                  <td align="center">
                    <a href="https://wa.me/${MARCA.whatsapp}?text=${encodeURIComponent(`Hola, tengo dudas sobre mi cita de inspección del día ${datos.fecha}`)}" style="display:inline-block;background-color:#25D366;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">
                      💬 Escribirnos por WhatsApp
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#777777;font-size:12px;line-height:1.5;margin:24px 0 0;text-align:center;">
                Si requieres cambiar el día o la hora de tu cita, por favor avísanos con al menos 2 horas de anticipación llamando o escribiendo al <strong>${datos.telefonoContacto}</strong>.
              </p>
            </td>
          </tr>

          <!-- Pie de página -->
          <tr>
            <td style="background-color:#2D4A2B;padding:20px;text-align:center;color:#F5F1E8;font-size:12px;">
              <div style="color:#C9A961;font-weight:600;margin-bottom:6px;">SAUCEDA · Tradición con tecnología</div>
              <div style="color:#A3B899;font-size:11px;">León, Guanajuato, México · WhatsApp: ${MARCA.whatsappTexto}</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
