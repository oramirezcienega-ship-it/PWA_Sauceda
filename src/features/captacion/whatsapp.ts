import { supabaseServidor } from "@/lib/supabase/server";

/**
 * MÓDULO: CAPTACIÓN · WhatsApp (Meta Cloud API)
 *
 * Recibe mensajes entrantes de WhatsApp y crea un expediente en etapa
 * "nuevo-lead". NO requiere sesión de admin (lo invoca Meta vía webhook),
 * por eso usa directamente el cliente con service role.
 */

/** Mensaje de WhatsApp ya normalizado. */
export interface MensajeWhatsApp {
  telefono: string;
  nombre?: string;
  mensaje?: string;
}

/** Forma mínima del payload del webhook de Meta que nos interesa. */
interface PayloadWhatsApp {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          from?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

/** Extrae los mensajes entrantes del payload de Meta (ignora estados de entrega). */
export function extraerMensajes(payload: PayloadWhatsApp): MensajeWhatsApp[] {
  const mensajes: MensajeWhatsApp[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};

      // Nombre de perfil por número (wa_id).
      const nombrePorWaId: Record<string, string> = {};
      for (const contacto of value.contacts ?? []) {
        if (contacto.wa_id && contacto.profile?.name) {
          nombrePorWaId[contacto.wa_id] = contacto.profile.name;
        }
      }

      for (const m of value.messages ?? []) {
        if (!m.from) continue;
        const texto =
          m.text?.body ?? (m.type ? `(mensaje de tipo ${m.type})` : undefined);
        mensajes.push({
          telefono: m.from,
          nombre: nombrePorWaId[m.from],
          mensaje: texto,
        });
      }
    }
  }

  return mensajes;
}

/** Fecha de hoy en formato ISO corto (YYYY-MM-DD). */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Genera el siguiente folio correlativo (EXP-00N). */
async function siguienteId(
  sb: ReturnType<typeof supabaseServidor>,
): Promise<string> {
  const { data } = await sb.from("expedientes").select("id");
  const numeros = (data ?? [])
    .map((r) => parseInt(String(r.id).replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `EXP-${String(max + 1).padStart(3, "0")}`;
}

/** Genera el siguiente folio de prospecto (PRO-00N). */
async function siguienteIdProspecto(
  sb: ReturnType<typeof supabaseServidor>,
): Promise<string> {
  const { data } = await sb.from("prospectos").select("id");
  const numeros = (data ?? [])
    .map((r) => parseInt(String(r.id).replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `PRO-${String(max + 1).padStart(3, "0")}`;
}

/** Busca o crea el prospecto (por teléfono) para un lead de WhatsApp. */
async function obtenerOCrearProspecto(
  sb: ReturnType<typeof supabaseServidor>,
  lead: MensajeWhatsApp,
): Promise<string> {
  const { data: existentes } = await sb
    .from("prospectos")
    .select("id")
    .eq("telefono", lead.telefono)
    .limit(1);

  if (existentes && existentes.length > 0) {
    return existentes[0].id as string;
  }

  const id = await siguienteIdProspecto(sb);
  await sb.from("prospectos").insert({
    id,
    nombre: lead.nombre?.trim() || `Lead WhatsApp ${lead.telefono}`,
    telefono: lead.telefono,
    origen: "whatsapp",
  });
  return id;
}

/**
 * Registra un lead entrante de WhatsApp.
 * Crea (o reutiliza) el prospecto por teléfono con origen "whatsapp", y le
 * cuelga un expediente en "nuevo-lead". Si ya existe un expediente con ese
 * teléfono, NO duplica: anota el nuevo mensaje y actualiza la fecha.
 */
export async function registrarLeadWhatsApp(
  lead: MensajeWhatsApp,
): Promise<void> {
  const sb = supabaseServidor();

  // Prospecto (persona): se busca o se crea por teléfono.
  const prospectoId = await obtenerOCrearProspecto(sb, lead);

  // Dedupe del expediente por teléfono.
  const { data: existentes } = await sb
    .from("expedientes")
    .select("id, notas")
    .eq("telefono", lead.telefono)
    .limit(1);

  if (existentes && existentes.length > 0) {
    const exp = existentes[0] as { id: string; notas: string };
    const nota = `${exp.notas ?? ""}\n[WhatsApp ${hoyISO()}] ${
      lead.mensaje ?? ""
    }`.trim();
    await sb
      .from("expedientes")
      .update({ notas: nota, ultimo_movimiento: hoyISO() })
      .eq("id", exp.id);
    return;
  }

  const id = await siguienteId(sb);
  await sb.from("expedientes").insert({
    id,
    cliente: lead.nombre?.trim() || `Lead WhatsApp ${lead.telefono}`,
    fraccionamiento: "Por definir",
    etapa: "nuevo-lead",
    situacion: lead.mensaje
      ? `Primer mensaje: ${lead.mensaje}`.slice(0, 300)
      : "Contacto entrante por WhatsApp.",
    telefono: lead.telefono,
    valor_estimado: 0,
    saldo_deuda: 0,
    notas: "Lead entrante automáticamente por WhatsApp.",
    ultimo_movimiento: hoyISO(),
    prospecto_id: prospectoId,
  });
}
