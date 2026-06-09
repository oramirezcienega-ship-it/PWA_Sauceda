import { supabaseServidor } from "@/lib/supabase/server";
import { registrarActividad } from "@/lib/actividades";
import { enviarBienvenida } from "@/lib/bienvenida";
import { dispararEvento } from "@/lib/automatizaciones/motor";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";

/**
 * MÓDULO: CAPTACIÓN · Sitio web (formulario "Cotizar" de saucedamx.com).
 * Crea (o reutiliza) el prospecto con origen "sitio-web" y le cuelga un
 * expediente en "nuevo-lead". No requiere sesión (lo invoca el sitio web).
 */

export interface LeadWeb {
  nombre: string;
  primerApellido?: string;
  segundoApellido?: string;
  telefono?: string;
  correo?: string;
  mensaje?: string;
  tipoCredito?: string;
  direccionPropiedad?: string;
  linkGoogleMaps?: string;
  necesidad?: string;
  valorEstimado?: number;
  saldoDeuda?: number;
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function siguienteId(
  sb: ReturnType<typeof supabaseServidor>,
  tabla: string,
  prefijo: string,
): Promise<string> {
  const { data } = await sb.from(tabla).select("id");
  const numeros = (data ?? [])
    .map((r) => parseInt(String(r.id).replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `${prefijo}-${String(max + 1).padStart(3, "0")}`;
}

export async function registrarLeadWeb(lead: LeadWeb): Promise<string> {
  const sb = supabaseServidor();
  const nombre = lead.nombre?.trim() || "Lead del sitio web";
  const telefonoRaw = (lead.telefono ?? "").trim();
  // Se guarda normalizado (52 + 10 dígitos) y se busca por todas las variantes.
  const telefono = telefonoRaw ? normalizarTelefono(telefonoRaw) : "";
  const variantesTel = telefonoRaw ? variantesTelefono(telefonoRaw) : [];
  const correo = (lead.correo ?? "").trim();

  // Buscar prospecto existente por teléfono o correo (evita duplicados).
  let prospectoId: string | null = null;
  if (variantesTel.length) {
    const { data } = await sb
      .from("prospectos")
      .select("id")
      .in("telefono", variantesTel)
      .limit(1);
    if (data && data.length) prospectoId = data[0].id as string;
  }
  if (!prospectoId && correo) {
    const { data } = await sb
      .from("prospectos")
      .select("id")
      .eq("correo", correo)
      .limit(1);
    if (data && data.length) prospectoId = data[0].id as string;
  }
  if (!prospectoId) {
    const id = await siguienteId(sb, "prospectos", "PRO");
    await sb.from("prospectos").insert({
      id,
      nombre,
      primer_apellido: lead.primerApellido ?? "",
      segundo_apellido: lead.segundoApellido ?? "",
      telefono,
      correo,
      origen: "sitio-web",
    });
    prospectoId = id;
    // Automatizaciones: prospecto nuevo captado por el sitio web.
    await dispararEvento(sb, "nuevo-prospecto", { prospectoId: id });
  }

  // Si ya existe un expediente con ese teléfono, no duplicamos: solo anotamos.
  if (variantesTel.length) {
    const { data: ex } = await sb
      .from("expedientes")
      .select("id, token")
      .in("telefono", variantesTel)
      .limit(1);
    if (ex && ex.length) {
      await sb
        .from("expedientes")
        .update({ ultimo_movimiento: hoyISO() })
        .eq("id", ex[0].id);
      await registrarActividad(sb, {
        expedienteId: ex[0].id as string,
        tipo: "sistema",
        titulo: "Nueva solicitud de cotización (sitio web)",
        detalle: lead.mensaje ?? "",
      });
      // Reutilizamos el expediente existente: devolvemos su token de portal.
      return ex[0].token as string;
    }
  }

  // Token único y seguro para el enlace privado del cliente (/seguimiento/[token]).
  const token = crypto.randomUUID();
  const expId = await siguienteId(sb, "expedientes", "EXP");
  await sb.from("expedientes").insert({
    id: expId,
    token,
    cliente: nombre,
    primer_apellido: lead.primerApellido ?? "",
    segundo_apellido: lead.segundoApellido ?? "",
    fraccionamiento: "Por definir",
    etapa: "nuevo-lead",
    situacion: lead.mensaje
      ? `Cotización web: ${lead.mensaje}`.slice(0, 300)
      : "Solicitud de cotización desde el sitio web.",
    telefono,
    valor_estimado: lead.valorEstimado || 0,
    saldo_deuda: lead.saldoDeuda || 0,
    notas: "Lead entrante desde el sitio web (sección Cotizar).",
    ultimo_movimiento: hoyISO(),
    prospecto_id: prospectoId,
    tipo_credito: lead.tipoCredito || null,
    direccion_propiedad: lead.direccionPropiedad || null,
    link_google_maps: lead.linkGoogleMaps || null,
    necesidad: lead.necesidad || null,
  });
  await registrarActividad(sb, {
    expedienteId: expId,
    prospectoId,
    tipo: "creacion",
    titulo: "Lead del sitio web (Cotizar)",
    detalle: lead.mensaje ?? "",
  });
  // Bienvenida automática (correo + WhatsApp + portal). Best-effort.
  await enviarBienvenida(sb, expId);
  // Automatizaciones: expediente nuevo captado por el sitio web.
  await dispararEvento(sb, "nuevo-expediente", {
    expedienteId: expId,
    prospectoId,
  });
  return token;
}
