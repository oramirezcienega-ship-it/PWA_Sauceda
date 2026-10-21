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
  mensaje: string;
}): Promise<{ ok: boolean; error?: string }> {
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
    await registrarActividad(sb, {
      expedienteId: expediente?.id ?? null,
      prospectoId: prospecto?.id ?? null,
      tipo: "coordinacion_proveedor",
      titulo: `Coordinación de ${que} con ${prov?.nombre || "proveedor"} (WhatsApp)`,
      detalle: [
        `Enviado por ${perfil?.nombre || "—"} desde su WhatsApp.`,
        input.fecha ? `Fecha que pide el cliente: ${fechaLegible(input.fecha)}${input.horario ? ` · ${input.horario}` : ""}` : "",
        input.direccion ? `Dirección: ${input.direccion}` : "",
        `Mensaje:\n${input.mensaje.trim()}`,
        `[proveedor:${input.proveedorId}]`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo registrar la coordinación." };
  }
}

/** "2026-10-23" → "jueves 23 de octubre". Deja tal cual lo que no sea fecha ISO. */
function fechaLegible(fecha: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City" });
}
