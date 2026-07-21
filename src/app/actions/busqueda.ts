"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";

export interface ResultadoBusquedaGlobal {
  tipo: "prospecto" | "expediente" | "cotizacion" | "cita";
  id: string;
  titulo: string;
  subtitulo: string;
  etiqueta: string;
  url: string;
}

/**
 * Buscador Omnipresente / Global del sistema.
 * Permite buscar por teléfono, nombre, folios (EXP-, PROSP-, COT-), fraccionamiento, etc.
 * a través de prospectos, expedientes, cotizaciones y agenda.
 */
export async function buscarGlobal(query: string): Promise<ResultadoBusquedaGlobal[]> {
  await requireAdmin();
  const q = (query || "").trim();
  if (!q || q.length < 2) return [];

  const sb = supabaseServidor();
  const term = `%${q}%`;
  const resultados: ResultadoBusquedaGlobal[] = [];

  try {
    // 1. Buscar en Prospectos
    const { data: prospectos } = await sb
      .from("prospectos")
      .select("id, nombre, primer_apellido, segundo_apellido, telefono, email, fraccionamiento, servicio_interes")
      .or(`id.ilike.${term},nombre.ilike.${term},primer_apellido.ilike.${term},segundo_apellido.ilike.${term},telefono.ilike.${term},email.ilike.${term},fraccionamiento.ilike.${term}`)
      .limit(8);

    if (prospectos) {
      prospectos.forEach((p: any) => {
        const nombreComp = [p.nombre, p.primer_apellido, p.segundo_apellido].filter(Boolean).join(" ");
        resultados.push({
          tipo: "prospecto",
          id: p.id,
          titulo: `👤 ${nombreComp || p.id}`,
          subtitulo: `Folio: ${p.id} · Tel: ${p.telefono || "Sin tel"} ${p.fraccionamiento ? `· ${p.fraccionamiento}` : ""}`,
          etiqueta: "Prospecto",
          url: `/prospectos/${p.id}`,
        });
      });
    }

    // 2. Buscar en Expedientes
    const { data: expedientes } = await sb
      .from("expedientes")
      .select("id, cliente, primer_apellido, segundo_apellido, telefono, fraccionamiento, etapa")
      .or(`id.ilike.${term},cliente.ilike.${term},primer_apellido.ilike.${term},segundo_apellido.ilike.${term},telefono.ilike.${term},fraccionamiento.ilike.${term}`)
      .limit(8);

    if (expedientes) {
      expedientes.forEach((e: any) => {
        const nombreComp = [e.cliente, e.primer_apellido, e.segundo_apellido].filter(Boolean).join(" ");
        resultados.push({
          tipo: "expediente",
          id: e.id,
          titulo: `📁 ${nombreComp || e.id}`,
          subtitulo: `Folio: ${e.id} · Tel: ${e.telefono || "Sin tel"} · Etapa: ${e.etapa || "nuevo-lead"}`,
          etiqueta: "Expediente",
          url: `/expediente/${e.id}`,
        });
      });
    }

    // 3. Buscar en Cotizaciones de Construcción
    const { data: cotizaciones } = await sb
      .from("cotizaciones_ventas")
      .select("id, prospecto_nombre, prospecto_telefono, servicio_tipo, estatus, prospecto_id, expediente_id")
      .or(`id.ilike.${term},prospecto_nombre.ilike.${term},prospecto_telefono.ilike.${term},servicio_tipo.ilike.${term}`)
      .limit(8);

    if (cotizaciones) {
      cotizaciones.forEach((c: any) => {
        resultados.push({
          tipo: "cotizacion",
          id: c.id,
          titulo: `📋 Cotización ${c.id}`,
          subtitulo: `Cliente: ${c.prospecto_nombre || "Sin nombre"} · Servicio: ${c.servicio_tipo || "Construcción"} · Estatus: ${c.estatus || "borrador"}`,
          etiqueta: "Cotización",
          url: `/construccion/${c.id}`,
        });
      });
    }

    // 4. Buscar en Agenda Citas
    const { data: citas } = await sb
      .from("agenda_citas")
      .select("id, cliente_nombre, cliente_telefono, tipo_cita, fecha, hora_inicio, expediente_id, prospecto_id")
      .or(`cliente_nombre.ilike.${term},cliente_telefono.ilike.${term},tipo_cita.ilike.${term}`)
      .limit(6);

    if (citas) {
      citas.forEach((ct: any) => {
        resultados.push({
          tipo: "cita",
          id: ct.id,
          titulo: `🗓️ Cita: ${ct.cliente_nombre || "Cliente"}`,
          subtitulo: `Tipo: ${ct.tipo_cita || "cita"} · Fecha: ${ct.fecha} a las ${ct.hora_inicio.slice(0, 5)}hs`,
          etiqueta: "Agenda Cita",
          url: ct.expediente_id ? `/expediente/${ct.expediente_id}` : ct.prospecto_id ? `/prospectos/${ct.prospecto_id}` : "/agenda",
        });
      });
    }
  } catch (err) {
    console.error("Error en busquedaGlobal:", err);
  }

  return resultados;
}
