import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { aplicarParametros } from "@/lib/parametros";

/**
 * Notificaciones por correo (Resend). Es "best-effort": si no hay
 * RESEND_API_KEY configurada o falla el envío, no se interrumpe la
 * operación principal (el mensaje/formulario ya quedó en el portal).
 */

const SITE_URL = process.env.SITE_URL || "https://app.saucedamx.com";

function clienteResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

async function enviarCorreo(
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

/** Plantilla HTML con la marca SAUCEDA. */
function plantilla(titulo: string, cuerpo: string, urlPortal: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:#2D4A2B;padding:20px;text-align:center;">
      <div style="color:#F5F1E8;font-size:22px;font-weight:bold;letter-spacing:1px;">SAUCEDA</div>
      <div style="color:#C9A961;font-size:11px;letter-spacing:3px;">BIENES RAÍCES</div>
    </div>
    <div style="padding:24px;background:#F5F1E8;color:#1A1A1A;">
      <h2 style="color:#2D4A2B;margin-top:0;">${titulo}</h2>
      <p style="white-space:pre-line;line-height:1.5;">${cuerpo}</p>
      <p style="margin-top:20px;">
        <a href="${urlPortal}" style="display:inline-block;background:#5C7A52;color:#F5F1E8;padding:12px 22px;border-radius:6px;text-decoration:none;">Ver en mi portal</a>
      </p>
      <p style="margin-top:24px;font-size:12px;color:#7a7a7a;">Tradición con tecnología.</p>
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
