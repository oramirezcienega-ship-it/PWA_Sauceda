"use server";

import { requireAdmin, requireAdministrador, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";
import {
  calcularEstimacion,
  enviarCotizacionEspecial,
  prepararEstimacion,
  siguienteFolioCotizacionEspecial,
  textoEstimacion,
  usuarioBotTelegram,
} from "@/lib/cotizaciones-especiales";
import { responderConversacion } from "@/app/actions/conversaciones";
import { modeloClaude, opcionesClaude, textoDeRespuesta } from "@/lib/ia/claude";

export type EstadoCotizacionEspecial = "enviada" | "estimacion_lista" | "enviada_cliente" | "cerrada" | "cancelada";
export type EstadoRespuestaEspecial =
  | "enviada"
  | "cotizando"
  | "cotizada"
  | "requiere_visita"
  | "rechazada"
  | "vencida"
  | "sin_telegram";

export interface RespuestaEspecial {
  id: string;
  proveedorId: string;
  proveedorNombre: string;
  estado: EstadoRespuestaEspecial;
  precio: number | null;
  tiempo: string;
  incluye: string;
  fechaLimite: string | null;
  respondidaAt: string | null;
}

export interface CotizacionEspecial {
  id: string;
  folio: string;
  titulo: string;
  descripcion: string;
  zona: string;
  tipoNegocio: string | null;
  fotos: string[];
  estado: EstadoCotizacionEspecial;
  margenPct: number | null;
  respuestaElegidaId: string | null;
  precioSugerido: number | null;
  rangoMin: number | null;
  rangoMax: number | null;
  estimacionTexto: string;
  estimacionEnviadaAt: string | null;
  createdAt: string;
  respuestas: RespuestaEspecial[];
}

export interface ProveedorParaEspecial {
  id: string;
  nombre: string;
  /** Tiene ofertas en servicios de esa línea de negocio. */
  enLinea: boolean;
  tieneTelegram: boolean;
  /** @usuario de la cuenta vinculada, para confirmar que es la del proveedor. */
  telegramUsuario: string | null;
  enlaceTelegram: string | null;
}

const num = (v: any) => (v === null || v === undefined ? null : Number(v));

function aCotizacion(f: any): CotizacionEspecial {
  return {
    id: f.id,
    folio: f.folio,
    titulo: f.titulo,
    descripcion: f.descripcion || "",
    zona: f.zona || "",
    tipoNegocio: f.tipo_negocio || null,
    fotos: (Array.isArray(f.fotos) ? f.fotos : []).map((x: any) => x?.url).filter(Boolean),
    estado: f.estado,
    margenPct: num(f.margen_pct),
    respuestaElegidaId: f.respuesta_elegida_id || null,
    precioSugerido: num(f.precio_sugerido),
    rangoMin: num(f.rango_min),
    rangoMax: num(f.rango_max),
    estimacionTexto: f.estimacion_texto || "",
    estimacionEnviadaAt: f.estimacion_enviada_at || null,
    createdAt: f.created_at,
    respuestas: (f.cotizaciones_especiales_respuestas || [])
      .map((r: any) => ({
        id: r.id,
        proveedorId: r.proveedor_id,
        proveedorNombre: r.proveedores?.nombre || "Proveedor",
        estado: r.estado,
        precio: num(r.precio),
        tiempo: r.tiempo || "",
        incluye: r.incluye || "",
        fechaLimite: r.fecha_limite || null,
        respondidaAt: r.respondida_at || null,
      }))
      .sort((a: RespuestaEspecial, b: RespuestaEspecial) => (a.precio ?? Infinity) - (b.precio ?? Infinity)),
  };
}

// Hay dos relaciones entre las tablas (respuesta -> cotización y respuesta_elegida): se indica cuál usar,
// si no PostgREST responde "más de una relación" y la lista sale vacía.
const SELECT_CE =
  "*, cotizaciones_especiales_respuestas!cotizaciones_especiales_respuestas_cotizacion_especial_id_fkey ( id, proveedor_id, estado, precio, tiempo, incluye, fecha_limite, respondida_at, proveedores:proveedor_id ( nombre ) )";

/** Cotizaciones especiales de una conversación, la más reciente primero. */
export async function listarCotizacionesEspecialesConversacion(telefono: string): Promise<CotizacionEspecial[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("cotizaciones_especiales")
    .select(SELECT_CE)
    .eq("telefono_cliente", telefono)
    .neq("estado", "cancelada")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    console.error("[Cotizaciones especiales] Error al listar:", error.message);
    return [];
  }
  return (data || []).map(aCotizacion);
}

/** Proveedores activos; primero los que ya trabajan esa línea de negocio. */
export async function proveedoresParaEspecial(tipoNegocio: string | null): Promise<ProveedorParaEspecial[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const [{ data: provs }, { data: ofertas }, bot] = await Promise.all([
    sb.from("proveedores").select("id, nombre, telegram_chat_id, telegram_username").eq("activo", true).order("nombre"),
    sb
      .from("proveedor_productos")
      .select("proveedor_id, productos_servicios:producto_id ( tipo_negocio )")
      .eq("activo", true),
    usuarioBotTelegram(sb),
  ]);
  const enLinea = new Set(
    (ofertas || [])
      .filter((o: any) => tipoNegocio && o.productos_servicios?.tipo_negocio === tipoNegocio)
      .map((o: any) => o.proveedor_id)
  );
  return (provs || [])
    .map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      enLinea: enLinea.has(p.id),
      tieneTelegram: !!p.telegram_chat_id,
      telegramUsuario: p.telegram_username || null,
      enlaceTelegram: bot ? `https://t.me/${bot}?start=prov_${p.id}` : null,
    }))
    .sort((a, b) => Number(b.enLinea) - Number(a.enLinea) || a.nombre.localeCompare(b.nombre, "es"));
}

/** Quita el Telegram vinculado a un proveedor (cuenta equivocada o cambio de teléfono). */
export async function desvincularTelegramProveedor(proveedorId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdministrador();
    const { error } = await supabaseServidor()
      .from("proveedores")
      .update({ telegram_chat_id: null, telegram_username: null })
      .eq("id", proveedorId);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo desvincular." };
  }
}

/** Crea la cotización especial y la manda por Telegram a los proveedores elegidos. */
export async function crearCotizacionEspecial(datos: {
  telefono: string;
  prospectoId?: string | null;
  expedienteId?: string | null;
  tipoNegocio: string | null;
  titulo: string;
  descripcion: string;
  zona: string;
  fotos: string[];
  horasRespuesta: number;
  proveedoresIds: string[];
}): Promise<{ ok: boolean; error?: string; enviados?: number; sinTelegram?: string[] }> {
  await requireAdmin();
  if (!datos.titulo.trim()) return { ok: false, error: "Ponle un título a la solicitud." };
  if (datos.proveedoresIds.length === 0) return { ok: false, error: "Elige al menos un proveedor." };
  const sb = supabaseServidor();
  const usuario = await usuarioActual().catch(() => null);

  const folio = await siguienteFolioCotizacionEspecial(sb);
  const { data: ce, error } = await sb
    .from("cotizaciones_especiales")
    .insert({
      folio,
      telefono_cliente: datos.telefono,
      prospecto_id: datos.prospectoId || null,
      expediente_id: datos.expedienteId || null,
      tipo_negocio: datos.tipoNegocio || null,
      titulo: datos.titulo.trim().slice(0, 200),
      descripcion: datos.descripcion.trim().slice(0, 3000),
      zona: datos.zona.trim().slice(0, 200),
      // Referencias de foto: id de medio de WhatsApp ([image:ID]) o URL pública
      fotos: datos.fotos.map((u) => u.trim()).filter((u) => /^[\w.:/?=&%-]{4,500}$/.test(u)).slice(0, 10).map((url) => ({ url })),
      horas_respuesta: Math.min(Math.max(Number(datos.horasRespuesta) || 24, 1), 168),
      creado_por: (usuario as any)?.id || null,
    })
    .select("id")
    .single();
  if (error || !ce) return { ok: false, error: error?.message || "No se pudo crear la solicitud." };

  const { error: errResp } = await sb
    .from("cotizaciones_especiales_respuestas")
    .insert(datos.proveedoresIds.map((pid) => ({ cotizacion_especial_id: ce.id, proveedor_id: pid })));
  if (errResp) return { ok: false, error: errResp.message };

  const r = await enviarCotizacionEspecial(sb, ce.id);
  return { ok: true, enviados: r.enviados, sinTelegram: r.sinTelegram };
}

/** Usar otra respuesta de proveedor (o recalcular con otro margen) para la estimación. */
export async function recalcularEstimacionEspecial(
  ceId: string,
  opciones: { respuestaId?: string; margenPct?: number }
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  if (opciones.margenPct !== undefined) {
    const m = Number(opciones.margenPct);
    if (!(m >= 0 && m < 95)) return { ok: false, error: "Margen no válido." };
    await sb.from("cotizaciones_especiales").update({ margen_pct: m }).eq("id", ceId);
  }
  const ok = await prepararEstimacion(sb, ceId, { respuestaId: opciones.respuestaId, avisar: false });
  return ok ? { ok: true } : { ok: false, error: "Aún no hay cotizaciones de proveedores para estimar." };
}

/** Envía la estimación (texto editado por el asesor) al cliente por la conversación. */
export async function enviarEstimacionEspecial(
  ceId: string,
  texto: string,
  rango?: { min: number; max: number }
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data: ce } = await sb
    .from("cotizaciones_especiales")
    .select("id, estado, telefono_cliente")
    .eq("id", ceId)
    .maybeSingle();
  if (!ce) return { ok: false, error: "La cotización especial no existe." };
  if (ce.estado === "enviada_cliente") return { ok: false, error: "Esta estimación ya se envió." };
  if (!texto.trim()) return { ok: false, error: "El mensaje está vacío." };

  const res = await responderConversacion(ce.telefono_cliente, texto.trim());
  if (!res.ok) return { ok: false, error: res.error || "No se pudo enviar al cliente." };

  await sb
    .from("cotizaciones_especiales")
    .update({
      estado: "enviada_cliente",
      estimacion_texto: texto.trim(),
      estimacion_enviada_at: new Date().toISOString(),
      ...(rango ? { rango_min: rango.min, rango_max: rango.max } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ceId);
  return { ok: true };
}

export async function cancelarCotizacionEspecial(ceId: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { error } = await sb
    .from("cotizaciones_especiales")
    .update({ estado: "cancelada", updated_at: new Date().toISOString() })
    .eq("id", ceId);
  if (error) return { ok: false, error: error.message };
  await sb
    .from("cotizaciones_especiales_respuestas")
    .update({ tg_paso: null })
    .eq("cotizacion_especial_id", ceId);
  return { ok: true };
}

/** Texto de estimación con un rango editado por el asesor (vista previa en la tarjeta). */
export async function previsualizarEstimacionEspecial(p: {
  titulo: string;
  descripcion: string;
  tiempo: string;
  incluye: string;
  costo: number;
  margenPct: number;
}): Promise<{ precio: number; min: number; max: number; texto: string }> {
  await requireAdmin();
  const est = calcularEstimacion(p.costo, p.margenPct);
  return { ...est, texto: textoEstimacion({ ...p, min: est.min, max: est.max }) };
}

export interface BorradorCotizacionEspecial {
  titulo: string;
  descripcion: string;
  zona: string;
}

const ESQUEMA_BORRADOR = {
  type: "object",
  properties: {
    titulo: { type: "string" },
    descripcion: { type: "string" },
    zona: { type: "string" },
  },
  required: ["titulo", "descripcion", "zona"],
  additionalProperties: false,
};

/**
 * Convierte la conversación con el cliente en una solicitud clara para proveedores:
 * título corto, descripción técnica en viñetas y colonia/municipio, sin saludos ni
 * datos personales. Devuelve null si la IA no está disponible (el modal usa el texto crudo).
 */
export async function estructurarCotizacionEspecial(
  mensajes: { direccion: "in" | "out"; texto: string }[],
  tipoNegocio: string | null
): Promise<BorradorCotizacionEspecial | null> {
  await requireAdmin();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const chat = mensajes
    .filter((m) => m.texto && !m.texto.startsWith("[") && m.texto.trim().length > 1)
    .slice(-20)
    .map((m) => `${m.direccion === "in" ? "Cliente" : "Nosotros"}: ${m.texto.trim()}`)
    .join("\n");
  if (!apiKey || !chat) return null;

  const prompt = `Eres coordinador de una empresa de construcción y mantenimiento en León, Guanajuato. Vas a pedir cotización a proveedores externos por algo que el cliente pidió en este chat de WhatsApp.

Línea de negocio: ${tipoNegocio || "sin definir"}

<chat>
${chat}
</chat>

Redacta la solicitud para los proveedores:
- titulo: qué trabajo se necesita, en 4 a 10 palabras (ej. "Limpieza de 2 tinacos y reparación de fuga").
- descripcion: viñetas cortas que empiecen con "• ", una por renglón, solo con datos útiles para cotizar: trabajo a realizar, cantidades, medidas o capacidades, materiales, estado actual o fallas, accesos y tipo de inmueble. Si falta un dato importante para cotizar (p. ej. capacidad en litros), agrega una viñeta "• Por confirmar: …". Escribe en tercera persona ("El cliente…" o impersonal), sin saludos, agradecimientos ni preferencias de contacto, y sin inventar datos.
- zona: colonia, fraccionamiento o municipio si el cliente lo mencionó; si no, cadena vacía.
Nunca incluyas nombre, teléfono, correo ni dirección exacta (calle y número) del cliente.`;

  try {
    const model = modeloClaude();
    const base = opcionesClaude(model, { maxTokens: 800, temperature: 0.2 });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        ...base,
        output_config: {
          ...((base.output_config as Record<string, unknown>) || {}),
          format: { type: "json_schema", schema: ESQUEMA_BORRADOR },
        },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error("[Cotización especial] Error de Claude:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    if (data?.stop_reason === "refusal") return null;
    const r = JSON.parse(textoDeRespuesta(data)) as BorradorCotizacionEspecial;
    return {
      titulo: String(r.titulo || "").trim(),
      descripcion: String(r.descripcion || "").trim(),
      zona: String(r.zona || "").trim(),
    };
  } catch (err) {
    console.error("[Cotización especial] No se pudo estructurar el borrador:", err);
    return null;
  }
}
