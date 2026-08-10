import type { SupabaseClient } from "@supabase/supabase-js";
import { aplicarParametros } from "@/lib/parametros";
import { notificarCliente } from "@/lib/email";
import { enviarWhatsAppTexto, enviarWhatsAppPlantilla } from "@/lib/whatsapp";
import { registrarActividad } from "@/lib/actividades";
import { MARCA } from "@/lib/marca";

/**
 * Mensaje de bienvenida automático al crear un expediente.
 * Se envía por todos los medios posibles (portal del cliente, correo y
 * WhatsApp). Es best-effort: si un medio no está configurado o falla, no
 * interrumpe la creación del expediente.
 */

const SITE_URL = process.env.SITE_URL || "https://crm.saucedamx.com";

/** Texto base del mensaje de bienvenida (admite parámetros del cliente). */
function textoBienvenida(): string {
  return `¡Hola {nombre}! 👋 Te damos la bienvenida a SAUCEDA Bienes Raíces.

Recibimos tu información y muy pronto un asesor te contactará para acompañarte en el proceso de traspaso de tu propiedad.

Cualquier duda, escríbenos por WhatsApp al ${MARCA.whatsappTexto}.`;
}

interface FilaExp {
  telefono: string | null;
  cliente: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
  fraccionamiento: string | null;
  token: string | null;
}

/**
 * Envía la bienvenida al cliente del expediente por todos los medios.
 *
 * ventanaWhatsAppAbierta: true cuando el cliente nos escribió primero (lead
 * entrante por WhatsApp); permite usar texto libre. Para contactos en frío
 * (alta manual o sitio web) se usa la plantilla aprobada si está configurada.
 */
export async function enviarBienvenida(
  sb: SupabaseClient,
  expedienteId: string,
  opts: { ventanaWhatsAppAbierta?: boolean; omitirWhatsApp?: boolean } = {},
): Promise<void> {
  try {
    const { data } = await sb
      .from("expedientes")
      .select(
        "telefono, cliente, primer_apellido, segundo_apellido, fraccionamiento, token",
      )
      .eq("id", expedienteId)
      .maybeSingle();
    if (!data) return;
    const d = data as FilaExp;

    const nombreCompleto = [d.cliente, d.primer_apellido, d.segundo_apellido]
      .filter(Boolean)
      .join(" ");
    const params = {
      nombre: d.cliente ?? "",
      primer_apellido: d.primer_apellido ?? "",
      segundo_apellido: d.segundo_apellido ?? "",
      nombre_completo: nombreCompleto,
      fraccionamiento: d.fraccionamiento ?? "",
    };
    const base = textoBienvenida();
    const textoResuelto = aplicarParametros(base, params);

    // 1) Portal del cliente: queda registrado como mensaje enviado.
    await sb.from("mensajes_enviados").insert({
      expediente_id: expedienteId,
      titulo: "Bienvenida",
      texto: textoResuelto,
    });

    // 2) Correo (con la marca y el enlace al portal; sin título interno).
    await notificarCliente(
      sb,
      expedienteId,
      "Bienvenido(a) a SAUCEDA Bienes Raíces",
      "",
      base,
    );

    // 3) WhatsApp (best-effort). Se puede omitir si la IA dará la bienvenida.
    if (d.telefono && d.token && !opts.omitirWhatsApp) {
      if (opts.ventanaWhatsAppAbierta) {
        // El cliente escribió primero: texto libre con el enlace al portal.
        const textoWa = `${textoResuelto}\n\nDa seguimiento a tu proceso aquí: ${SITE_URL}/seguimiento/${d.token}`;
        await enviarWhatsAppTexto(d.telefono, textoWa);
      } else {
        // Contacto en frío: requiere plantilla aprobada (si está configurada).
        const plantilla = process.env.WHATSAPP_BIENVENIDA_TEMPLATE;
        const idioma = process.env.WHATSAPP_BIENVENIDA_IDIOMA || "es_MX";
        if (plantilla) {
          await enviarWhatsAppPlantilla(
            d.telefono,
            plantilla,
            idioma,
            [d.cliente ?? ""],
            d.token,
          );
        }
      }
    }

    await registrarActividad(sb, {
      expedienteId,
      tipo: "sistema",
      titulo: "Mensaje de bienvenida enviado",
      detalle: "Portal, correo y WhatsApp (según los datos disponibles).",
    });
  } catch (err) {
    console.error("No se pudo enviar la bienvenida:", err);
  }
}
