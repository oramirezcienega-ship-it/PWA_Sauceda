import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { aplicarParametros } from "@/lib/parametros";
import { MARCA } from "@/lib/marca";

/**
 * Notificaciones por correo (Resend). Es "best-effort": si no hay
 * RESEND_API_KEY configurada o falla el envío, no se interrumpe la
 * operación principal (el mensaje/formulario ya quedó en el portal).
 */

const SITE_URL = process.env.SITE_URL || "https://crm.saucedamx.com";

function clienteResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function enviarCorreo(
  para: string,
  asunto: string,
  html: string,
): Promise<void> {
  try {
    const resend = clienteResend();
    if (!resend || !para) return;
    const from = process.env.RESEND_FROM || "SAUCEDA <onboarding@resend.dev>";
    await resend.emails.send({ from, to: para, subject: asunto, html });
  } catch (err) {
    console.error("No se pudo enviar el correo:", err);
  }
}

/** Plantilla HTML con la marca SAUCEDA. El título es opcional. */
function plantilla(titulo: string, cuerpo: string, urlPortal: string): string {
  const encabezado = titulo
    ? `<h2 style="color:#2D4A2B;margin-top:0;">${titulo}</h2>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:#2D4A2B;padding:20px;text-align:center;">
      <img src="${SITE_URL}/logo.svg" width="48" height="48" alt="SAUCEDA" style="display:block;margin:0 auto 8px;" />
      <div style="color:#F5F1E8;font-size:22px;font-weight:bold;letter-spacing:1px;">SAUCEDA</div>
      <div style="color:#C9A961;font-size:11px;letter-spacing:3px;">BIENES RAÍCES</div>
    </div>
    <div style="padding:24px;background:#F5F1E8;color:#1A1A1A;">
      ${encabezado}
      <p style="white-space:pre-line;line-height:1.5;">${cuerpo}</p>
      <p style="margin-top:20px;">
        <a href="${urlPortal}" style="display:inline-block;background:#5C7A52;color:#F5F1E8;padding:12px 22px;border-radius:6px;text-decoration:none;">Ver en mi portal</a>
      </p>
    </div>
    <div style="padding:18px 24px;background:#2D4A2B;color:#F5F1E8;text-align:center;font-size:13px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 10px;">
        <tr>
          <td style="padding:0 7px;">
            <a href="https://wa.me/${MARCA.whatsapp}" title="WhatsApp">
              <img src="https://img.icons8.com/color/48/whatsapp--v1.png" width="30" height="30" alt="WhatsApp" style="display:block;" />
            </a>
          </td>
          <td style="padding:0 7px;">
            <a href="${MARCA.web}" title="Sitio web">
              <img src="https://img.icons8.com/color/48/domain--v1.png" width="30" height="30" alt="Sitio web" style="display:block;" />
            </a>
          </td>
          <td style="padding:0 7px;">
            <a href="${MARCA.facebook}" title="Facebook">
              <img src="https://img.icons8.com/color/48/facebook-new.png" width="30" height="30" alt="Facebook" style="display:block;" />
            </a>
          </td>
          <td style="padding:0 7px;">
            <a href="${MARCA.instagram}" title="Instagram">
              <img src="https://img.icons8.com/color/48/instagram-new.png" width="30" height="30" alt="Instagram" style="display:block;" />
            </a>
          </td>
          <td style="padding:0 7px;">
            <a href="${MARCA.tiktok}" title="TikTok">
              <img src="https://img.icons8.com/color/48/tiktok--v1.png" width="30" height="30" alt="TikTok" style="display:block;" />
            </a>
          </td>
        </tr>
      </table>
      <div style="font-size:12px;color:#C9A961;">WhatsApp: ${MARCA.whatsappTexto} · ${MARCA.web.replace("https://", "")}</div>
      <div style="margin-top:8px;font-size:11px;color:#9bb38f;">Tradición con tecnología.</div>
    </div>
  </div>`;
}

interface Contacto {
  correo: string;
  token: string;
  params: Record<string, string>;
}

async function contactoDeExpediente(
  sb: SupabaseClient,
  expedienteId: string,
): Promise<Contacto | null> {
  const { data } = await sb
    .from("expedientes")
    .select(
      "token, cliente, primer_apellido, segundo_apellido, fraccionamiento, prospectos(correo)",
    )
    .eq("id", expedienteId)
    .maybeSingle();
  if (!data) return null;
  const d = data as unknown as {
    token: string;
    cliente: string;
    primer_apellido: string;
    segundo_apellido: string;
    fraccionamiento: string;
    prospectos?: { correo: string } | { correo: string }[] | null;
  };
  const prosp = Array.isArray(d.prospectos) ? d.prospectos[0] : d.prospectos;
  const nombreCompleto = [d.cliente, d.primer_apellido, d.segundo_apellido]
    .filter(Boolean)
    .join(" ");
  return {
    correo: prosp?.correo ?? "",
    token: d.token,
    params: {
      nombre: d.cliente,
      primer_apellido: d.primer_apellido,
      segundo_apellido: d.segundo_apellido,
      nombre_completo: nombreCompleto,
      fraccionamiento: d.fraccionamiento,
    },
  };
}

/**
 * Notifica al cliente por correo (si tiene email en su prospecto).
 * Resuelve los parámetros ({nombre}, etc.) en el título y el cuerpo.
 */
export async function notificarCliente(
  sb: SupabaseClient,
  expedienteId: string,
  asunto: string,
  titulo: string,
  cuerpo: string,
): Promise<void> {
  const c = await contactoDeExpediente(sb, expedienteId);
  if (!c || !c.correo) return;
  const html = plantilla(
    aplicarParametros(titulo, c.params),
    aplicarParametros(cuerpo, c.params),
    `${SITE_URL}/seguimiento/${c.token}`,
  );
  await enviarCorreo(c.correo, aplicarParametros(asunto, c.params), html);
}

/** Plantilla HTML simplificada para notificaciones al equipo operativo. */
function plantillaAgente(
  titulo: string,
  cuerpo: string,
  enlaceLabel?: string,
  enlaceUrl?: string,
): string {
  const encabezado = titulo
    ? `<h2 style="color:#2D4A2B;margin-top:0;">${titulo}</h2>`
    : "";
  const boton = (enlaceLabel && enlaceUrl)
    ? `<p style="margin-top:20px;">
        <a href="${enlaceUrl}" style="display:inline-block;background:#5C7A52;color:#F5F1E8;padding:12px 22px;border-radius:6px;text-decoration:none;">${enlaceLabel}</a>
      </p>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:#2D4A2B;padding:20px;text-align:center;">
      <img src="${SITE_URL}/logo.svg" width="48" height="48" alt="SAUCEDA" style="display:block;margin:0 auto 8px;" />
      <div style="color:#F5F1E8;font-size:22px;font-weight:bold;letter-spacing:1px;">SAUCEDA</div>
      <div style="color:#C9A961;font-size:11px;letter-spacing:3px;">CRM NOTIFICACIONES</div>
    </div>
    <div style="padding:24px;background:#F5F1E8;color:#1A1A1A;">
      ${encabezado}
      <p style="white-space:pre-line;line-height:1.5;">${cuerpo}</p>
      ${boton}
    </div>
    <div style="padding:18px 24px;background:#2D4A2B;color:#F5F1E8;text-align:center;font-size:11px;">
      <div style="color:#C9A961;">SAUCEDA Bienes Raíces · Panel de Control</div>
      <div style="margin-top:8px;color:#9bb38f;">Este es un correo automático generado por el sistema. Por favor no lo respondas.</div>
    </div>
  </div>`;
}

/** Notifica a un usuario/agente del sistema por correo electrónico. */
export async function notificarAgenteEmail(
  para: string,
  asunto: string,
  titulo: string,
  cuerpo: string,
  enlaceLabel?: string,
  enlaceUrl?: string,
): Promise<void> {
  const html = plantillaAgente(titulo, cuerpo, enlaceLabel, enlaceUrl);
  await enviarCorreo(para, asunto, html);
}
