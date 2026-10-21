"use server";

/**
 * Coordinar un servicio o instalación con un proveedor (p. ej. el plomero) desde la
 * conversación del cliente: Sofía redacta el WhatsApp con el trabajo, la fecha que pide
 * el cliente y la dirección; el asesor lo revisa y lo manda desde su WhatsApp (wa.me).
 * Aquí solo se prepara, se redacta y se registra en la bitácora.
 */

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";
import { registrarActividad } from "@/lib/actividades";

export type TipoCoordinacionProveedor = "servicio" | "instalacion";

export interface ProveedorCoordinable {
  id: string;
  nombre: string;
  categoria: string;
  /** Dígitos con lada para wa.me ("" si no tiene). */
  whatsapp: string;
}

export interface DatosCoordinacionServicio {
  expedienteId: string | null;
  prospectoId: string | null;
  clienteNombre: string;
  direccion: string;
  linkMaps: string;
  trabajo: string;
  proveedores: ProveedorCoordinable[];
  /** Proveedor sugerido: el último con el que se coordinó este cliente, o el plomero. */
  proveedorSugeridoId: string | null;
}

async function idsCliente(sb: ReturnType<typeof supabaseServidor>, telefono: string) {
  const v = variantesTelefono(telefono);
  const { data: pros } = await sb
    .from("prospectos")
    .select("id, nombre, primer_apellido, direccion")
    .in("telefono", v)
    .order("created_at", { ascending: false })
    .limit(1);
  const prospecto = pros?.[0] ?? null;
  let q = sb.from("expedientes").select("id, cliente, primer_apellido, fraccionamiento, direccion_propiedad, link_google_maps, necesidad, tipo_negocio");
  q = prospecto ? q.or(`prospecto_id.eq.${prospecto.id},telefono.in.(${v.join(",")})`) : q.in("telefono", v);
  const { data: exps } = await q.order("created_at", { ascending: false }).limit(1);
  return { prospecto, expediente: exps?.[0] ?? null };
}

export async function prepararCoordinacionServicio(
  telefono: string
): Promise<{ ok: boolean; datos?: DatosCoordinacionServicio; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { prospecto, expediente } = await idsCliente(sb, telefono);

    const { data: provs } = await sb
      .from("proveedores")
      .select("id, nombre, categoria, whatsapp, telefono")
      .eq("activo", true)
      .order("nombre");
    const proveedores: ProveedorCoordinable[] = (provs || []).map((p: any) => ({
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria || "",
      whatsapp: normalizarTelefono(p.whatsapp || p.telefono || ""),
    }));

    // Sugerido: el último proveedor coordinado para este cliente; si no, el plomero.
    let sugerido: string | null = null;
    const expedienteId = expediente?.id ?? null;
    const prospectoId = prospecto?.id ?? null;
    if (expedienteId || prospectoId) {
      let qa = sb.from("actividades").select("detalle").eq("tipo", "coordinacion_proveedor");
      qa = expedienteId ? qa.eq("expediente_id", expedienteId) : qa.eq("prospecto_id", prospectoId!);
      const { data: ult } = await qa.order("created_at", { ascending: false }).limit(1);
      const id = String(ult?.[0]?.detalle || "").match(/\[proveedor:([0-9a-f-]{36})\]/)?.[1];
      if (id && proveedores.some((p) => p.id === id)) sugerido = id;
    }
    sugerido ??=
      proveedores.find((p) => /plomer/i.test(`${p.categoria} ${p.nombre}`))?.id ??
      proveedores.find((p) => /clemente/i.test(p.nombre))?.id ??
      null;

    const nombre = [expediente?.cliente || prospecto?.nombre, expediente?.cliente ? expediente?.primer_apellido : prospecto?.primer_apellido]
      .filter(Boolean)
      .join(" ");
    return {
      ok: true,
      datos: {
        expedienteId,
        prospectoId,
        clienteNombre: nombre,
        direccion: expediente?.direccion_propiedad || prospecto?.direccion || "",
        linkMaps: expediente?.link_google_maps || "",
        trabajo: expediente?.necesidad || "",
        proveedores,
        proveedorSugeridoId: sugerido,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudieron cargar los datos." };
  }
}

export async function redactarMensajeProveedorSofia(input: {
  telefono: string;
  proveedorId: string;
  tipo: TipoCoordinacionProveedor;
  clienteNombre: string;
  direccion: string;
  linkMaps: string;
  fecha: string;
  horario: string;
  trabajo: string;
  costo: number | null;
  indicacion?: string | null;
}): Promise<{ ok: boolean; texto?: string; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { data: prov } = await sb.from("proveedores").select("nombre, contacto_nombre").eq("id", input.proveedorId).maybeSingle();
    if (!prov) return { ok: false, error: "Selecciona el proveedor." };
    const { generarMensajeCoordinacionProveedor } = await import("@/lib/ia/agente");
    const texto = await generarMensajeCoordinacionProveedor(sb, {
      ...input,
      proveedorNombre: prov.contacto_nombre || prov.nombre,
      fecha: fechaLegible(input.fecha),
      costo: input.costo ? pesos(input.costo) : "",
    });
    if (!texto) return { ok: false, error: "Sofía no generó el mensaje (¿IA sin crédito o desactivada?)." };
    return { ok: true, texto };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Sofía no pudo redactar el mensaje." };
  }
}

/** Registra en la bitácora del cliente que se mandó el mensaje al proveedor y guarda la dirección confirmada. */
export async function registrarCoordinacionProveedor(input: {
  telefono: string;
  proveedorId: string;
  tipo: TipoCoordinacionProveedor;
  direccion: string;
  linkMaps: string;
  fecha: string;
  horario: string;
  costo: number | null;
  mensaje: string;
}): Promise<{ ok: boolean; ordenFolio?: string; ordenCreada?: boolean; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { prospecto, expediente } = await idsCliente(sb, input.telefono);
    if (!expediente && !prospecto) return { ok: true };
    const { data: prov } = await sb.from("proveedores").select("nombre").eq("id", input.proveedorId).maybeSingle();
    const yo = await usuarioActual();
    const { data: perfil } = yo ? await sb.from("perfiles").select("nombre").eq("id", yo.id).maybeSingle() : { data: null };

    // La dirección que se confirmó con el proveedor queda en el expediente.
    if (expediente) {
      const cambios: Record<string, string> = {};
      if (input.direccion.trim() && input.direccion.trim() !== (expediente.direccion_propiedad || "")) cambios.direccion_propiedad = input.direccion.trim();
      if (input.linkMaps.trim() && input.linkMaps.trim() !== (expediente.link_google_maps || "")) cambios.link_google_maps = input.linkMaps.trim();
      if (Object.keys(cambios).length) await sb.from("expedientes").update(cambios).eq("id", expediente.id);
    }

    const que = input.tipo === "instalacion" ? "instalación" : "servicio";

    // Con costo, el proveedor y lo que cobra quedan en la orden de trabajo del cliente.
    let ot: { folio: string; creada: boolean; error?: string } | null = null;
    if (input.costo && input.costo > 0) {
      ot = await guardarEnOrdenTrabajo(sb, {
        expedienteId: expediente?.id ?? null,
        prospectoId: prospecto?.id ?? null,
        tipoNegocio: expediente?.tipo_negocio || "",
        proveedorId: input.proveedorId,
        proveedorNombre: prov?.nombre || "Proveedor",
        costo: input.costo,
        concepto: `${que[0].toUpperCase()}${que.slice(1)}${expediente?.necesidad ? ` · ${expediente.necesidad}` : ""}${input.fecha ? ` · ${fechaLegible(input.fecha)}` : ""}`,
        fechaProgramada: fechaProgramada(input.fecha, input.horario),
      });
    }

    await registrarActividad(sb, {
      expedienteId: expediente?.id ?? null,
      prospectoId: prospecto?.id ?? null,
      tipo: "coordinacion_proveedor",
      titulo: `Coordinación de ${que} con ${prov?.nombre || "proveedor"} (WhatsApp)`,
      detalle: [
        `Enviado por ${perfil?.nombre || "—"} desde su WhatsApp.`,
        input.fecha ? `Fecha que pide el cliente: ${fechaLegible(input.fecha)}${input.horario ? ` · ${input.horario}` : ""}` : "",
        input.costo ? `Costo del proveedor: ${pesos(input.costo)}` : "",
        ot?.folio ? `Orden de trabajo: ${ot.folio}${ot.creada ? " (creada)" : " (actualizada)"}` : "",
        ot?.error ? `No se pudo guardar en la orden de trabajo: ${ot.error}` : "",
        input.direccion ? `Dirección: ${input.direccion}` : "",
        input.linkMaps ? `Maps: ${input.linkMaps}` : "",
        `Mensaje:\n${input.mensaje.trim()}`,
        `[proveedor:${input.proveedorId}]`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (ot?.error) return { ok: false, error: `Quedó en la bitácora, pero no en la orden de trabajo: ${ot.error}` };
    return { ok: true, ordenFolio: ot?.folio, ordenCreada: ot?.creada };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo registrar la coordinación." };
  }
}

/** "2026-10-23" → "jueves 23 de octubre". Deja tal cual lo que no sea fecha ISO. */
function fechaLegible(fecha: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City" });
}

function pesos(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

/**
 * Orden de trabajo abierta del cliente para este proveedor: la que ya lo tiene, o una sin
 * proveedor. Si no hay (o todas son de otro proveedor), se crea una nueva.
 */
async function guardarEnOrdenTrabajo(
  sb: ReturnType<typeof supabaseServidor>,
  d: {
    expedienteId: string | null;
    prospectoId: string | null;
    tipoNegocio: string;
    proveedorId: string;
    proveedorNombre: string;
    costo: number;
    concepto: string;
    fechaProgramada: string | null;
  }
): Promise<{ folio: string; creada: boolean; error?: string }> {
  let q = sb
    .from("ordenes_trabajo")
    .select("id, folio, proveedor_id, fecha_programada")
    .in("estatus", ["pendiente", "en_proceso"]);
  q = d.expedienteId && d.prospectoId
    ? q.or(`expediente_id.eq.${d.expedienteId},prospecto_id.eq.${d.prospectoId}`)
    : d.expedienteId
    ? q.eq("expediente_id", d.expedienteId)
    : q.eq("prospecto_id", d.prospectoId!);
  const { data: abiertas } = await q.order("created_at", { ascending: false });
  const ot =
    (abiertas || []).find((o: any) => o.proveedor_id === d.proveedorId) ||
    (abiertas || []).find((o: any) => !o.proveedor_id);

  if (ot) {
    const { error } = await sb
      .from("ordenes_trabajo")
      .update({
        proveedor_id: d.proveedorId,
        costo_proveedor: d.costo,
        proveedor_concepto: d.concepto,
        ...(d.fechaProgramada && !ot.fecha_programada ? { fecha_programada: d.fechaProgramada } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ot.id);
    return error ? { folio: ot.folio, creada: false, error: error.message } : { folio: ot.folio, creada: false };
  }

  const { crearOrdenTrabajo } = await import("@/app/actions/ordenes-trabajo");
  const r = await crearOrdenTrabajo({
    expedienteId: d.expedienteId,
    prospectoId: d.prospectoId,
    ...(d.tipoNegocio ? { tipoNegocio: d.tipoNegocio } : {}),
    titulo: `${d.concepto} — ${d.proveedorNombre}`,
    fechaProgramada: d.fechaProgramada || undefined,
    proveedorId: d.proveedorId,
    costoProveedor: d.costo,
    proveedorConcepto: d.concepto,
  });
  if (!r.ok || !r.folio) return { folio: "", creada: false, error: r.error || "No se pudo crear la orden de trabajo." };
  return { folio: r.folio, creada: true };
}

/** Fecha + horario a timestamp de México: "10:30", "4 pm", "mañana" (9 h) o "tarde" (14 h); 9 h si no se entiende. */
function fechaProgramada(fecha: string, horario: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const h = horario.toLowerCase();
  let hora = 9;
  let min = 0;
  const m = h.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.\s*m\.|p\.\s*m\.)?/);
  if (m) {
    hora = Number(m[1]);
    min = Number(m[2] || 0);
    if (m[3]?.startsWith("p") && hora < 12) hora += 12;
    if (m[3]?.startsWith("a") && hora === 12) hora = 0;
  } else if (/tarde/.test(h)) {
    hora = 14;
  }
  if (hora > 23 || min > 59) return null;
  return `${fecha}T${String(hora).padStart(2, "0")}:${String(min).padStart(2, "0")}:00-06:00`;
}
