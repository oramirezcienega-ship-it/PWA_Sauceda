"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { ETAPAS } from "@/lib/etapas";
import { ORIGENES } from "@/lib/origenes";
import type { EtapaId } from "@/lib/types";

/** Resumen general de la operación para el dashboard. */
export interface ResumenOperacion {
  totalLeads: number;
  totalExpedientes: number;
  cerrados: number;
  perdidos: number;
  activos: number;
  tasaConversion: number;
  inversionCampanas: number;
  costoPorLead: number;
  valorPipeline: number;
  porEtapa: { etapa: EtapaId; nombre: string; total: number }[];
  porOrigen: { origen: string; nombre: string; total: number }[];
}

export async function resumenOperacion(): Promise<ResumenOperacion> {
  await requireAdmin();
  const sb = supabaseServidor();

  const { data: exps, error: e1 } = await sb
    .from("expedientes")
    .select("etapa, valor_estimado");
  if (e1) throw new Error(e1.message);
  const { data: prosp, error: e2 } = await sb
    .from("prospectos")
    .select("origen, valor_campana");
  if (e2) throw new Error(e2.message);

  const expedientes = (exps ?? []) as {
    etapa: EtapaId;
    valor_estimado: number;
  }[];
  const prospectos = (prosp ?? []) as {
    origen: string;
    valor_campana: number;
  }[];

  const totalExpedientes = expedientes.length;
  const cerrados = expedientes.filter((e) => e.etapa === "cerrado").length;
  const perdidos = expedientes.filter((e) => e.etapa === "perdido").length;
  const activos = totalExpedientes - cerrados - perdidos;
  const tasaConversion = totalExpedientes
    ? Math.round((cerrados / totalExpedientes) * 100)
    : 0;

  const totalLeads = prospectos.length;
  const inversionCampanas = prospectos.reduce(
    (s, p) => s + Number(p.valor_campana || 0),
    0,
  );
  const costoPorLead = totalLeads
    ? Math.round(inversionCampanas / totalLeads)
    : 0;
  const valorPipeline = expedientes
    .filter((e) => e.etapa !== "cerrado" && e.etapa !== "perdido")
    .reduce((s, e) => s + Number(e.valor_estimado || 0), 0);

  const porEtapa = ETAPAS.map((et) => ({
    etapa: et.id,
    nombre: et.nombre,
    total: expedientes.filter((e) => e.etapa === et.id).length,
  }));

  const porOrigen = ORIGENES.map((o) => ({
    origen: o.id,
    nombre: o.nombre,
    total: prospectos.filter((p) => p.origen === o.id).length,
  }))
    .filter((o) => o.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    totalLeads,
    totalExpedientes,
    cerrados,
    perdidos,
    activos,
    tasaConversion,
    inversionCampanas,
    costoPorLead,
    valorPipeline,
    porEtapa,
    porOrigen,
  };
}
