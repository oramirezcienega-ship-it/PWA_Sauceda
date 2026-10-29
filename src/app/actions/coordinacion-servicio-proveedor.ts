"use server";

/**
 * Coordinar un servicio o instalación con un proveedor (p. ej. el plomero) desde la
 * conversación del cliente: Sofía redacta el WhatsApp con el trabajo, la fecha que pide
 * el cliente y la dirección; el asesor lo revisa y lo manda desde su WhatsApp (wa.me).
 * Aquí solo se prepara, se redacta y se registra en la bitácora.
 */

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";
import { extraerDireccionDeTexto, linkMapsDeDireccion } from "@/lib/direccion";
import { registrarActividad } from "@/lib/actividades";
import { costosProveedoresDe, loCotizadoAlCliente, proveedoresDelProducto } from "@/lib/costo-servicio";

export type TipoCoordinacionProveedor = "servicio" | "instalacion" | "inspeccion";

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
  /** Proveedor sugerido: el preferido del producto cotizado; si no hay, el último usado con el cliente o el plomero. */
  proveedorSugeridoId: string | null;
  /** Proveedores ligados en el catálogo al producto cotizado (preferido primero). */
  relacionadosIds: string[];
  /** Costo de cada proveedor según lo que ya se le cotizó al cliente (producto + variación). */
  costosSugeridos: Record<string, number>;
  /** De dónde salió el costo sugerido ("" si no hay). */
  origenCosto: string;
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

    // El predeterminado es el del producto cotizado (catálogo): el preferido, o el único ligado.
    const cotizado = await loCotizadoAlCliente(sb, { expedienteId, prospectoId });
    const relacionadosIds = cotizado
      ? (await proveedoresDelProducto(sb, cotizado)).filter((id) => proveedores.some((p) => p.id === id))
      : [];
    if (relacionadosIds.length) sugerido = relacionadosIds[0];

    const nombre = [expediente?.cliente || prospecto?.nombre, expediente?.cliente ? expediente?.primer_apellido : prospecto?.primer_apellido]
      .filter(Boolean)
      .join(" ");

    let direccion = expediente?.direccion_propiedad || prospecto?.direccion || "";
    let linkMaps = expediente?.link_google_maps || (direccion ? linkMapsDeDireccion(direccion) : "");
    if (!direccion) {
      const { data: ultimosMsgs } = await sb
        .from("mensajes_whatsapp")
        .select("texto")
        .in("telefono", variantesTelefono(telefono))
        .eq("direccion", "in")
        .order("created_at", { ascending: false })
        .limit(10);
      for (const m of ultimosMsgs || []) {
        const extraida = extraerDireccionDeTexto(m.texto);
        if (extraida) {
          direccion = extraida;
          linkMaps = linkMapsDeDireccion(extraida);
          if (expedienteId) {
            void sb.from("expedientes").update({ direccion_propiedad: direccion, link_google_maps: linkMaps }).eq("id", expedienteId);
          }
          if (prospectoId) {
            void sb.from("prospectos").update({ direccion: direccion }).eq("id", prospectoId);
          }
          break;
        }
      }
    }

    return {
      ok: true,
      datos: {
        expedienteId,
        prospectoId,
        clienteNombre: nombre,
        direccion,
        linkMaps,
        trabajo: expediente?.necesidad || "",
        proveedores,
        proveedorSugeridoId: sugerido,
        relacionadosIds,
        costosSugeridos: cotizado ? await costosProveedoresDe(sb, cotizado) : {},
        origenCosto: cotizado?.origen || "",
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
    // Link de su portal: ahí acepta y propone horarios (la solicitud se registra al mandar el mensaje).
    const { tokenProveedor, linkPortalProveedor } = await import("@/lib/solicitudes-proveedor");
    const token = await tokenProveedor(sb, input.proveedorId);
    const { prospecto, expediente } = await idsCliente(sb, input.telefono);
    let solFolio: string | undefined;
    if (expediente?.id) {
      const { data: ultSol } = await sb
        .from("solicitudes_proveedor")
        .select("folio")
        .eq("expediente_id", expediente.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ultSol?.folio) solFolio = ultSol.folio;
    }
    const { generarMensajeCoordinacionProveedor } = await import("@/lib/ia/agente");
    const texto = await generarMensajeCoordinacionProveedor(sb, {
      ...input,
      proveedorNombre: prov.contacto_nombre || prov.nombre,
      fecha: fechaLegible(input.fecha),
      costo: input.costo ? pesos(input.costo) : "",
      linkRespuesta: token ? linkPortalProveedor(token, solFolio) : "",
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
}): Promise<{ ok: boolean; ordenFolio?: string; ordenCreada?: boolean; solicitudFolio?: string; solicitudId?: string; error?: string }> {
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

    const que = input.tipo === "instalacion" ? "instalación" : input.tipo === "inspeccion" ? "inspección técnica" : "servicio";

    // Con costo, si el cliente ya tiene OT abierta, queda ahí; si no, la abre la aceptación del proveedor.
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

    // Solicitud para que el proveedor acepte y proponga horarios desde su portal (al aceptar se abre la OT).
    const sol = expediente
      ? await registrarSolicitudDirecta(sb, {
          expedienteId: expediente.id,
          zona: expediente.fraccionamiento || "",
          ordenTrabajoId: ot?.folio && !ot.error ? await idOrden(sb, ot.folio) : null,
          proveedorId: input.proveedorId,
          descripcion: [
            `${que[0].toUpperCase()}${que.slice(1)}${expediente.necesidad ? `: ${expediente.necesidad}` : ""}`,
            input.direccion ? `Dirección: ${input.direccion}` : "",
            input.linkMaps ? `Maps: ${input.linkMaps}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          fechasSugeridas: input.fecha ? `${fechaLegible(input.fecha)}${input.horario ? ` · ${input.horario}` : ""}` : "",
          costo: input.costo,
        })
      : null;

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
        sol?.folio ? `Solicitud ${sol.folio}: el proveedor acepta y propone horarios desde su portal.` : "",
        input.direccion ? `Dirección: ${input.direccion}` : "",
        input.linkMaps ? `Maps: ${input.linkMaps}` : "",
        `Mensaje:\n${input.mensaje.trim()}`,
        `[proveedor:${input.proveedorId}]`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (ot?.error) return { ok: false, error: `Quedó en la bitácora, pero no en la orden de trabajo: ${ot.error}` };
    revalidatePath("/conversaciones");
    return { ok: true, ordenFolio: ot?.folio, ordenCreada: ot?.creada, solicitudFolio: sol?.folio, solicitudId: sol?.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo registrar la coordinación." };
  }
}

/**
 * Manda el mensaje de coordinación al proveedor por la línea oficial (queda en su
 * conversación) y lo registra igual que al mandarlo desde el WhatsApp del asesor.
 */
export async function enviarCoordinacionOficial(
  input: Parameters<typeof registrarCoordinacionProveedor>[0] & { trabajo: string }
): Promise<{ ok: boolean; via?: "texto" | "plantilla"; ordenFolio?: string; ordenCreada?: boolean; solicitudFolio?: string; error?: string }> {
  try {
    await requireAdmin();
    if (!input.mensaje.trim()) return { ok: false, error: "El mensaje está vacío." };
    const sb = supabaseServidor();
    const yo = await usuarioActual();
    const { data: perfil } = yo ? await sb.from("perfiles").select("nombre").eq("id", yo.id).maybeSingle() : { data: null };
    const { enviarWhatsAppProveedor } = await import("@/lib/whatsapp-proveedores");
    const trabajo = input.trabajo.split(/[;.]/)[0].trim() || "un servicio";
    const lugar = input.direccion.split(",").slice(0, 2).join(",").trim();
    // Primero registrar para tener el folio de solicitud y orden de trabajo
    const r = await registrarCoordinacionProveedor({ ...input, mensaje: input.mensaje });
    if (!r.ok) return { ok: false, error: r.error };

    // Si el mensaje tiene el link de precios y tenemos solicitudFolio, asegurar que viaje enfocado
    let mensajeFinal = input.mensaje;
    if (r.solicitudFolio && mensajeFinal.includes("/precios-proveedor/")) {
      mensajeFinal = mensajeFinal.replace(/(\/precios-proveedor\/[A-Za-z0-9_-]+)(?!\?solicitud=)/g, `$1?solicitud=${r.solicitudFolio}`);
    }

    const resumen = `tenemos ${input.tipo === "inspeccion" ? "una inspección técnica" : "un servicio"} para ti: ${trabajo}${lugar ? ` en ${lugar}` : ""}${input.fecha ? `, ${fechaLegible(input.fecha)}${input.horario ? ` ${input.horario}` : ""}` : ""}. ¿Lo puedes tomar?`;
    const env = await enviarWhatsAppProveedor(sb, { proveedorId: input.proveedorId, texto: mensajeFinal, resumen, agente: perfil?.nombre || "" });
    if (!env.ok) return { ok: false, error: env.error };
    return { ...r, ok: true, via: env.via };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo enviar." };
  }
}

/**
 * El proveedor aceptó por fuera del sistema (por WhatsApp): se registra la coordinación y
 * su aceptación con el horario acordado, para programar el servicio enseguida.
 */
export async function registrarAceptacionProveedor(input: {
  telefono: string;
  proveedorId: string;
  tipo: TipoCoordinacionProveedor;
  direccion: string;
  linkMaps: string;
  fecha: string;
  horario: string;
  costo: number | null;
  mensaje: string;
}): Promise<{ ok: boolean; solicitudId?: string; opcion?: string; error?: string }> {
  try {
    await requireAdmin();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return { ok: false, error: "Indica la fecha que acordaron." };
    const r = await registrarCoordinacionProveedor({ ...input, mensaje: input.mensaje.trim() || "(Acordado directo por WhatsApp)" });
    if (!r.ok) return { ok: false, error: r.error };
    if (!r.solicitudId) return { ok: false, error: "El cliente no tiene expediente: crea su expediente para programar el servicio." };

    const sb = supabaseServidor();
    const opcion = `${fechaLegible(input.fecha)}${input.horario.trim() ? ` · ${input.horario.trim()}` : ""}`;
    const ahora = new Date().toISOString();
    const { data: envio } = await sb
      .from("solicitudes_proveedor_envios")
      .select("id, fechas_propuestas")
      .eq("solicitud_id", r.solicitudId)
      .eq("proveedor_id", input.proveedorId)
      .maybeSingle();
    if (!envio) return { ok: false, error: "No se encontró la solicitud al proveedor." };
    const fechas = Array.from(new Set([opcion, ...(Array.isArray(envio.fechas_propuestas) ? envio.fechas_propuestas.map(String) : [])]));
    await sb
      .from("solicitudes_proveedor_envios")
      .update({
        estado: "aceptada",
        respondida_at: ahora,
        fechas_propuestas: fechas,
        comentario: "Aceptó por WhatsApp (lo registró el asesor).",
        updated_at: ahora,
      })
      .eq("id", envio.id);
    await sb
      .from("solicitudes_proveedor")
      .update({
        estado: "asignada",
        proveedor_asignado_id: input.proveedorId,
        ...(input.costo && input.costo > 0 ? { costo_acordado: input.costo } : {}),
        updated_at: ahora,
      })
      .eq("id", r.solicitudId)
      .in("estado", ["abierta", "asignada"]);
    // Aceptó: se abre la orden de trabajo.
    const { abrirOrdenTrabajoSolicitud } = await import("@/lib/solicitudes-proveedor");
    await abrirOrdenTrabajoSolicitud(sb, r.solicitudId);
    return { ok: true, solicitudId: r.solicitudId, opcion };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo registrar la aceptación." };
  }
}

/**
 * Deja constancia de la Cotización Express enviada (producto y variación) para tomar de ahí
 * el costo del proveedor al coordinar y programar el servicio.
 */
export async function registrarCotizacionExpress(
  telefono: string,
  d: { productoId: string; productoNombre: string; cantidad: number | null; variacion: string; total: number }
): Promise<{ ok: boolean; cotizacionId?: string; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const { prospecto, expediente } = await idsCliente(sb, telefono);
    if (!expediente && !prospecto) return { ok: false, error: "Cliente no encontrado." };

    // Obtener datos del producto para costos, unidad y especificaciones
    const { data: prod } = await sb.from("productos_servicios").select("*").eq("id", d.productoId).maybeSingle();
    const { costoReferenciaOferta } = await import("@/lib/solicitudes-proveedor");
    let costoProv = prod ? costoReferenciaOferta(prod as any, d.cantidad) : null;
    if (!costoProv || !(costoProv > 0)) {
      costoProv = Math.round(d.total * 0.7);
    }

    const filtroCliente = [
      expediente?.id ? `expediente_id.eq.${expediente.id}` : null,
      prospecto?.id ? `prospecto_id.eq.${prospecto.id}` : null,
    ].filter(Boolean).join(",");

    let cotId: string;
    const { data: cotExistente } = filtroCliente
      ? await sb
          .from("cotizaciones")
          .select("id, estatus")
          .or(filtroCliente)
          .in("estatus", ["calculando_costo", "enviada"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    if (cotExistente) {
      cotId = cotExistente.id;
      await sb
        .from("cotizaciones")
        .update({
          precio_final: d.total,
          costo_directo: costoProv,
          costo_estimado: costoProv,
          utilidad_monto: Math.max(0, d.total - costoProv),
          utilidad_pct: d.total > 0 ? Math.round(((d.total - costoProv) / d.total) * 10000) / 100 : 0,
          estatus: "enviada",
          updated_at: new Date().toISOString(),
        })
        .eq("id", cotId);
      await sb.from("cotizacion_conceptos").delete().eq("cotizacion_id", cotId);
    } else {
      const { data: existentes } = await sb.from("cotizaciones").select("id");
      const numeros = (existentes || [])
        .map((r: any) => parseInt(String(r.id).replace(/\D/g, ""), 10))
        .filter((n: number) => !isNaN(n));
      const max = numeros.length ? Math.max(...numeros) : 0;
      cotId = `COT-${String(max + 1).padStart(3, "0")}`;

      await sb.from("cotizaciones").insert({
        id: cotId,
        prospecto_id: prospecto?.id || null,
        expediente_id: expediente?.id || null,
        servicio_tipo: "otro",
        estatus: "enviada",
        requiere_visita: false,
        costo_estimado: costoProv,
        costo_directo: costoProv,
        precio_final: d.total,
        utilidad_monto: Math.max(0, d.total - costoProv),
        utilidad_pct: d.total > 0 ? Math.round(((d.total - costoProv) / d.total) * 10000) / 100 : 0,
        token: crypto.randomUUID(),
        modalidad: "estatica",
        condiciones_pago: "Pago de contado al término del servicio a entera satisfacción.",
        garantia: prod?.estandar_garantia || prod?.plantilla_garantia || "Garantía de servicio realizado en mano de obra.",
        alcances: prod?.descripcion || `${d.productoNombre}${d.variacion ? ` · ${d.variacion}` : ""}`,
        notas_internas: `Generada automáticamente desde Cotización Express (${d.productoNombre} · ${d.variacion || ""}).`,
      });
    }

    await sb.from("cotizacion_conceptos").insert({
      cotizacion_id: cotId,
      producto_servicio_id: d.productoId,
      descripcion: `${d.productoNombre}${d.variacion ? ` · ${d.variacion}` : ""}`,
      cantidad: d.cantidad || 1,
      unidad: prod?.unidad || "servicio",
      costo_unitario: costoProv && d.cantidad && d.cantidad > 0 ? Math.round((costoProv / d.cantidad) * 100) / 100 : costoProv,
      precio_unitario: d.cantidad && d.cantidad > 0 ? Math.round((d.total / d.cantidad) * 100) / 100 : d.total,
      descuento: 0,
      importe: d.total,
    });

    if (expediente?.id) {
      await sb
        .from("expedientes")
        .update({
          etapa: "cotizacion",
          ultimo_movimiento: new Date().toISOString().split("T")[0],
        })
        .eq("id", expediente.id);
    }

    await registrarActividad(sb, {
      expedienteId: expediente?.id ?? null,
      prospectoId: prospecto?.id ?? null,
      tipo: "cotizacion_express",
      titulo: `Cotización Express · ${d.productoNombre}${d.variacion ? ` · ${d.variacion}` : ""} · ${pesos(d.total)} (${cotId})`,
      detalle: `[cotizacion:${cotId}][producto:${d.productoId}]${d.cantidad ? `[cantidad:${d.cantidad}]` : ""}[precio:${d.total}]`,
    });

    return { ok: true, cotizacionId: cotId };
  } catch (err: any) {
    console.error("No se pudo registrar la cotización express:", err);
    return { ok: false, error: err?.message || "No se pudo registrar la cotización." };
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
    /** Si no hay OT abierta, crear una (si no, se deja para cuando el proveedor acepte). */
    crear?: boolean;
  }
): Promise<{ folio: string; creada: boolean; error?: string } | null> {
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

  // Buscar si el cliente tiene una cotización reciente para vincular la OT y heredar precio_cliente
  let cotId: string | null = null;
  let precioCliente: number | null = null;
  const filtroCliente = [
    d.expedienteId ? `expediente_id.eq.${d.expedienteId}` : null,
    d.prospectoId ? `prospecto_id.eq.${d.prospectoId}` : null,
  ].filter(Boolean).join(",");
  if (filtroCliente) {
    const { data: ultCot } = await sb
      .from("cotizaciones")
      .select("id, precio_final, estatus")
      .or(filtroCliente)
      .neq("estatus", "cancelada")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultCot) {
      cotId = ultCot.id;
      precioCliente = Number(ultCot.precio_final || 0) || null;
      if (ultCot.estatus === "enviada" || ultCot.estatus === "calculando_costo") {
        await sb.from("cotizaciones").update({ estatus: "aceptada", updated_at: new Date().toISOString() }).eq("id", ultCot.id);
      }
    }
  }

  if (ot) {
    const { error } = await sb
      .from("ordenes_trabajo")
      .update({
        proveedor_id: d.proveedorId,
        costo_proveedor: d.costo,
        proveedor_concepto: d.concepto,
        ...(d.fechaProgramada && !ot.fecha_programada ? { fecha_programada: d.fechaProgramada } : {}),
        ...(cotId && !ot.cotizacion_id ? { cotizacion_id: cotId } : {}),
        ...(precioCliente && !ot.precio_cliente ? { precio_cliente: precioCliente } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ot.id);
    return error ? { folio: ot.folio, creada: false, error: error.message } : { folio: ot.folio, creada: false };
  }

  if (!d.crear) return null;
  const { crearOrdenTrabajo } = await import("@/app/actions/ordenes-trabajo");
  const r = await crearOrdenTrabajo({
    expedienteId: d.expedienteId,
    cotizacionId: cotId,
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

async function idOrden(sb: ReturnType<typeof supabaseServidor>, folio: string): Promise<string | null> {
  const { data } = await sb.from("ordenes_trabajo").select("id").eq("folio", folio).maybeSingle();
  return data?.id ?? null;
}

/** Plazo para que el proveedor responda desde su portal; después se avisa al grupo. */
const HORAS_RESPUESTA = 24;

/**
 * Solicitud directa a un solo proveedor (sin cascada ni aviso automático: el mensaje ya
 * salió por el WhatsApp del asesor). Si ya hay una abierta para este cliente y proveedor,
 * se actualiza en vez de duplicarla; si ya la aceptó, se deja como está.
 */
async function registrarSolicitudDirecta(
  sb: ReturnType<typeof supabaseServidor>,
  d: {
    expedienteId: string;
    zona: string;
    ordenTrabajoId: string | null;
    proveedorId: string;
    descripcion: string;
    fechasSugeridas: string;
    costo: number | null;
  }
): Promise<{ id: string; folio: string } | null> {
  const ahora = new Date();
  const limite = new Date(ahora.getTime() + HORAS_RESPUESTA * 3600 * 1000).toISOString();
  const { data: previas } = await sb
    .from("solicitudes_proveedor")
    .select("id, folio, estado, solicitudes_proveedor_envios ( id, proveedor_id, estado )")
    .eq("expediente_id", d.expedienteId)
    .is("cotizacion_id", null)
    .in("estado", ["abierta", "asignada"])
    .order("created_at", { ascending: false });
  const previa = (previas || []).find((s: any) =>
    (s.solicitudes_proveedor_envios || []).some((e: any) => e.proveedor_id === d.proveedorId)
  ) as any;
  if (previa?.estado === "asignada") return { id: previa.id, folio: previa.folio };
  if (previa) {
    await sb
      .from("solicitudes_proveedor")
      .update({
        descripcion: d.descripcion,
        fechas_sugeridas: d.fechasSugeridas,
        ...(d.ordenTrabajoId ? { orden_trabajo_id: d.ordenTrabajoId } : {}),
        updated_at: ahora.toISOString(),
      })
      .eq("id", previa.id);
    const envio = previa.solicitudes_proveedor_envios.find((e: any) => e.proveedor_id === d.proveedorId);
    await sb
      .from("solicitudes_proveedor_envios")
      .update({ costo_referencia: d.costo, fecha_limite: limite, updated_at: ahora.toISOString() })
      .eq("id", envio.id);
    return { id: previa.id, folio: previa.folio };
  }

  const { siguienteFolioSolicitud } = await import("@/lib/solicitudes-proveedor");
  const yo = await usuarioActual();
  const folio = await siguienteFolioSolicitud(sb);
  const { data: sol, error } = await sb
    .from("solicitudes_proveedor")
    .insert({
      folio,
      expediente_id: d.expedienteId,
      orden_trabajo_id: d.ordenTrabajoId,
      descripcion: d.descripcion.slice(0, 4000),
      zona: d.zona.slice(0, 300),
      fechas_sugeridas: d.fechasSugeridas.slice(0, 500),
      modo: "cascada",
      horas_respuesta: HORAS_RESPUESTA,
      notas_internas: "Coordinación de servicio desde la conversación del cliente.",
      creado_por: yo?.id || null,
    })
    .select("id")
    .single();
  if (error || !sol) {
    console.error("No se pudo crear la solicitud directa al proveedor:", error);
    return null;
  }
  const { error: errEnv } = await sb.from("solicitudes_proveedor_envios").insert({
    solicitud_id: sol.id,
    proveedor_id: d.proveedorId,
    orden: 0,
    estado: "enviada",
    enviada_at: ahora.toISOString(),
    fecha_limite: limite,
    notificado: true,
    costo_referencia: d.costo,
  });
  if (errEnv) console.error("No se pudo crear el envío de la solicitud directa:", errEnv);
  return { id: sol.id, folio };
}
