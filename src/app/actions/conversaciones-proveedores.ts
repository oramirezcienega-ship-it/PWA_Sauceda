"use server";

/**
 * Pestaña "Proveedores" de Conversaciones: los chats con proveedores por la línea oficial
 * de WhatsApp, aparte de los clientes (Sofía no les contesta). El envío y la recepción
 * viven en src/lib/whatsapp-proveedores.ts.
 */

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";
import { ESTADO_PENDIENTE_VENTANA, enviarWhatsAppProveedor, ventanaAbiertaProveedor } from "@/lib/whatsapp-proveedores";

export interface ResumenConversacionProveedor {
  proveedorId: string;
  nombre: string;
  categoria: string;
  telefono: string;
  ultimoTexto: string;
  ultimoAt: string | null;
  ultimaDireccion: "in" | "out" | null;
  /** Mensajes completos esperando que el proveedor conteste (ventana de 24 h cerrada). */
  pendientes: number;
}

export interface MensajeProveedor {
  id: string;
  direccion: "in" | "out";
  texto: string;
  estado: string;
  agente: string;
  createdAt: string;
  entregadoAt: string | null;
  leidoAt: string | null;
}

/** Proveedores con WhatsApp: primero los que tienen conversación, la más reciente arriba. */
export async function listarConversacionesProveedores(): Promise<ResumenConversacionProveedor[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const [{ data: provs }, { data: msgs }] = await Promise.all([
    sb.from("proveedores").select("id, nombre, categoria, whatsapp, telefono").eq("activo", true).order("nombre"),
    sb
      .from("mensajes_whatsapp")
      .select("proveedor_id, direccion, texto, estado, created_at")
      .not("proveedor_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);
  const porProv = new Map<string, any[]>();
  for (const m of msgs || []) {
    const arr = porProv.get((m as any).proveedor_id) ?? [];
    arr.push(m);
    porProv.set((m as any).proveedor_id, arr);
  }
  return (provs || [])
    .map((p: any) => {
      const arr = porProv.get(p.id) ?? [];
      const ultimo = arr[0];
      return {
        proveedorId: p.id,
        nombre: p.nombre,
        categoria: p.categoria || "",
        telefono: normalizarTelefono(p.whatsapp || p.telefono || ""),
        ultimoTexto: ultimo?.texto || "",
        ultimoAt: ultimo?.created_at || null,
        ultimaDireccion: ultimo?.direccion || null,
        pendientes: arr.filter((m) => m.estado === ESTADO_PENDIENTE_VENTANA).length,
      };
    })
    .filter((r) => r.telefono || r.ultimoAt)
    .sort((a, b) => (b.ultimoAt || "").localeCompare(a.ultimoAt || "") || a.nombre.localeCompare(b.nombre));
}

/** Hilo con el proveedor (incluye lo que escribió a la línea antes de estar dado de alta). */
export async function obtenerConversacionProveedor(
  proveedorId: string
): Promise<{ mensajes: MensajeProveedor[]; ventanaAbierta: boolean }> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data: p } = await sb.from("proveedores").select("whatsapp, telefono").eq("id", proveedorId).maybeSingle();
  const tel = normalizarTelefono(p?.whatsapp || p?.telefono || "");
  let q = sb.from("mensajes_whatsapp").select("id, direccion, texto, estado, agente, created_at, entregado_at, leido_at");
  q = tel ? q.or(`proveedor_id.eq.${proveedorId},telefono.in.(${variantesTelefono(tel).map((v) => `"${v}"`).join(",")})`) : q.eq("proveedor_id", proveedorId);
  const { data } = await q.order("created_at", { ascending: true }).limit(500);
  return {
    mensajes: (data || []).map((m: any) => ({
      id: m.id,
      direccion: m.direccion === "in" ? "in" : "out",
      texto: m.texto || "",
      estado: m.estado || "",
      agente: m.agente || "",
      createdAt: m.created_at,
      entregadoAt: m.entregado_at || null,
      leidoAt: m.leido_at || null,
    })),
    ventanaAbierta: await ventanaAbiertaProveedor(sb, proveedorId),
  };
}

export async function enviarMensajeProveedorAction(
  proveedorId: string,
  texto: string
): Promise<{ ok: boolean; via?: "texto" | "plantilla"; error?: string }> {
  await requireAdmin();
  if (!texto.trim()) return { ok: false, error: "El mensaje está vacío." };
  const sb = supabaseServidor();
  const u = await usuarioActual();
  const { data: perfil } = u ? await sb.from("perfiles").select("nombre").eq("id", u.id).maybeSingle() : { data: null };
  return enviarWhatsAppProveedor(sb, {
    proveedorId,
    texto,
    resumen: `te escribimos de SAUCEDA: ${texto.replace(/\s+/g, " ").trim().slice(0, 160)}${texto.length > 160 ? "…" : ""}`,
    agente: perfil?.nombre || "",
  });
}
