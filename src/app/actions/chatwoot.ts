"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { variantesTelefono } from "@/lib/telefono";
import { labelTipoNegocio } from "@/lib/types";

export interface InfoContactoWidget {
  encontrado: boolean;
  telefono: string;
  nombre: string;
  email: string | null;
  tipoNegocio: string | null;
  tipoNegocioLabel: string | null;
  
  // Expediente
  expediente: {
    id: string;
    cliente: string;
    etapa: string;
    ciudad: string | null;
    direccion: string | null;
    asesorNombre: string | null;
    total: number | null;
    saldo: number | null;
    createdAt: string;
  } | null;

  // Prospecto
  prospecto: {
    id: string;
    nombre: string;
    origen: string | null;
    estatus: string | null;
    etapaVenta: string | null;
    asesorNombre: string | null;
    montoEstimado: number | null;
    createdAt: string;
  } | null;

  // Cotizaciones
  cotizaciones: Array<{
    id: string;
    folio: string | null;
    total: number;
    estado: string;
    token: string | null;
    fecha: string;
  }>;

  // Próxima Cita
  proximaCita: {
    id: string;
    titulo: string;
    fecha: string;
    hora: string;
    tipo: string;
    estado: string;
  } | null;
}

/** Obtiene la ficha consolidada de un contacto para el panel lateral de Chatwoot */
export async function obtenerInfoContactoChatwoot(
  telefono?: string | null,
  email?: string | null,
): Promise<InfoContactoWidget> {
  const sb = supabaseServidor();
  const telLimpio = (telefono || "").trim();
  const emailLimpio = (email || "").trim().toLowerCase();

  const variantes = telLimpio ? variantesTelefono(telLimpio) : [];
  const ultimos10 = telLimpio.replace(/\D/g, "").slice(-10);

  // 1. Buscar Expediente
  let expData: any = null;
  if (variantes.length > 0 || ultimos10) {
    let query = sb
      .from("expedientes")
      .select("id, cliente, primer_apellido, segundo_apellido, correo, telefono, etapa, ciudad, direccion, tipo_negocio, total, saldo, created_at, prospecto_id, perfiles:asesor_id(nombre)")
      .order("created_at", { ascending: false });

    if (variantes.length > 0) {
      query = query.in("telefono", variantes);
    } else {
      query = query.like("telefono", `%${ultimos10}`);
    }

    const { data } = await query.limit(1).maybeSingle();
    expData = data;
  }

  if (!expData && emailLimpio) {
    const { data } = await sb
      .from("expedientes")
      .select("id, cliente, primer_apellido, segundo_apellido, correo, telefono, etapa, ciudad, direccion, tipo_negocio, total, saldo, created_at, prospecto_id, perfiles:asesor_id(nombre)")
      .ilike("correo", emailLimpio)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expData = data;
  }

  // 2. Buscar Prospecto
  let prosData: any = null;
  if (expData?.prospecto_id) {
    const { data } = await sb
      .from("prospectos")
      .select("id, nombre, primer_apellido, segundo_apellido, correo, telefono, origen, estatus, etapa_venta, tipo_negocio, monto_estimado, created_at, perfiles:asesor_id(nombre)")
      .eq("id", expData.prospecto_id)
      .maybeSingle();
    prosData = data;
  } else {
    if (variantes.length > 0 || ultimos10) {
      let query = sb
        .from("prospectos")
        .select("id, nombre, primer_apellido, segundo_apellido, correo, telefono, origen, estatus, etapa_venta, tipo_negocio, monto_estimado, created_at, perfiles:asesor_id(nombre)")
        .order("created_at", { ascending: false });

      if (variantes.length > 0) {
        query = query.in("telefono", variantes);
      } else {
        query = query.like("telefono", `%${ultimos10}`);
      }

      const { data } = await query.limit(1).maybeSingle();
      prosData = data;
    }

    if (!prosData && emailLimpio) {
      const { data } = await sb
        .from("prospectos")
        .select("id, nombre, primer_apellido, segundo_apellido, correo, telefono, origen, estatus, etapa_venta, tipo_negocio, monto_estimado, created_at, perfiles:asesor_id(nombre)")
        .ilike("correo", emailLimpio)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      prosData = data;
    }
  }

  // 3. Buscar Cotizaciones
  const cotizaciones: InfoContactoWidget["cotizaciones"] = [];
  const expId = expData?.id;
  const prosId = prosData?.id;

  if (expId || prosId) {
    let q = sb
      .from("cotizaciones")
      .select("id, folio, total, estado, token, created_at")
      .order("created_at", { ascending: false })
      .limit(3);

    if (expId) {
      q = q.eq("expediente_id", expId);
    } else if (prosId) {
      q = q.eq("prospecto_id", prosId);
    }

    const { data: cotData } = await q;
    if (cotData) {
      for (const c of cotData) {
        cotizaciones.push({
          id: c.id,
          folio: c.folio || null,
          total: Number(c.total || 0),
          estado: c.estado || "borrador",
          token: c.token || null,
          fecha: c.created_at,
        });
      }
    }
  }

  // 4. Buscar Próxima Cita
  let proximaCita: InfoContactoWidget["proximaCita"] = null;
  if (expId || prosId) {
    const ahoraIso = new Date().toISOString().split("T")[0];
    let qCita = sb
      .from("agenda_citas")
      .select("id, titulo, fecha, hora, tipo, estado")
      .gte("fecha", ahoraIso)
      .neq("estado", "cancelada")
      .order("fecha", { ascending: true })
      .order("hora", { ascending: true })
      .limit(1);

    if (expId) {
      qCita = qCita.eq("expediente_id", expId);
    } else if (prosId) {
      qCita = qCita.eq("prospecto_id", prosId);
    }

    const { data: citaData } = await qCita.maybeSingle();
    if (citaData) {
      proximaCita = {
        id: citaData.id,
        titulo: citaData.titulo || "Cita programada",
        fecha: citaData.fecha,
        hora: citaData.hora,
        tipo: citaData.tipo || "Visita Técnica",
        estado: citaData.estado || "programada",
      };
    }
  }

  // Consolidar Nombres y Metadatos
  const nombreExp = expData ? [expData.cliente, expData.primer_apellido, expData.segundo_apellido].filter(Boolean).join(" ") : "";
  const nombrePros = prosData ? [prosData.nombre, prosData.primer_apellido, prosData.segundo_apellido].filter(Boolean).join(" ") : "";
  const nombreFinal = nombreExp || nombrePros || telLimpio || "Contacto sin registrar";

  const rawTipo = expData?.tipo_negocio || prosData?.tipo_negocio || null;

  return {
    encontrado: Boolean(expData || prosData),
    telefono: telLimpio || expData?.telefono || prosData?.telefono || "",
    nombre: nombreFinal,
    email: expData?.correo || prosData?.correo || emailLimpio || null,
    tipoNegocio: rawTipo,
    tipoNegocioLabel: rawTipo ? labelTipoNegocio(rawTipo) : null,
    expediente: expData
      ? {
          id: expData.id,
          cliente: nombreExp || expData.cliente,
          etapa: expData.etapa || "Nuevo",
          ciudad: expData.ciudad || null,
          direccion: expData.direccion || null,
          asesorNombre: expData.perfiles?.nombre || null,
          total: expData.total != null ? Number(expData.total) : null,
          saldo: expData.saldo != null ? Number(expData.saldo) : null,
          createdAt: expData.created_at,
        }
      : null,
    prospecto: prosData
      ? {
          id: prosData.id,
          nombre: nombrePros || prosData.nombre,
          origen: prosData.origen || null,
          estatus: prosData.estatus || null,
          etapaVenta: prosData.etapa_venta || null,
          asesorNombre: prosData.perfiles?.nombre || null,
          montoEstimado: prosData.monto_estimado != null ? Number(prosData.monto_estimado) : null,
          createdAt: prosData.created_at,
        }
      : null,
    cotizaciones,
    proximaCita,
  };
}
