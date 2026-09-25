"use server";

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, requireAdministrador } from "@/lib/supabase/cliente-sesion";
import {
  calcularSlotsDisponiblesConjuntos,
  solicitarCoordinacionInspeccion,
  responderConfirmacionAsesor,
  verificarYActualizarSLAInspecciones,
  obtenerCitasInspeccionSLA,
  type SolicitudInspeccionInput,
  type SlotHorarioDisponible,
  type EstadoInspeccionSLA,
} from "@/lib/coordinacion-inspecciones";

/**
 * 1. Obtiene los horarios libres comunes entre los asesores requeridos.
 */
export async function obtenerSlotsInspeccionAction(
  asesoresIds: string[],
  diasAdelante: number = 3,
  duracionMinutos: number = 60
): Promise<{ ok: boolean; slots: SlotHorarioDisponible[]; error?: string }> {
  try {
    const sb = supabaseServidor();
    const slots = await calcularSlotsDisponiblesConjuntos(sb, asesoresIds, diasAdelante, duracionMinutos);
    return { ok: true, slots };
  } catch (err: any) {
    console.error("[Action] Error al calcular slots disponibles:", err);
    return { ok: false, slots: [], error: err.message || "Error al calcular slots." };
  }
}

/**
 * 2. Inicia la solicitud de coordinación con SLA y alertas simultáneas.
 */
export async function solicitarInspeccionCoordinadaAction(
  datos: SolicitudInspeccionInput
): Promise<{ ok: boolean; citaId?: string; slaLimiteAt?: string; error?: string }> {
  try {
    const sb = supabaseServidor();
    const res = await solicitarCoordinacionInspeccion(sb, datos);

    revalidatePath("/agenda");
    revalidatePath("/prospectos");
    if (datos.expedienteId) {
      revalidatePath(`/expedientes/${datos.expedienteId}`);
    }

    return res;
  } catch (err: any) {
    console.error("[Action] Error en solicitarInspeccionCoordinadaAction:", err);
    return { ok: false, error: err.message || "Error al coordinar inspección." };
  }
}

/**
 * 3. Confirma o declina la asistencia de un asesor.
 */
export async function responderAsistenciaAsesorAction(
  citaId: string,
  asesorId: string,
  aceptada: boolean,
  motivo?: string
): Promise<{ ok: boolean; estadoFinal?: string; error?: string }> {
  try {
    const sb = supabaseServidor();
    const res = await responderConfirmacionAsesor(sb, citaId, asesorId, aceptada, motivo);

    revalidatePath("/agenda");
    revalidatePath("/prospectos");

    return res;
  } catch (err: any) {
    console.error("[Action] Error en responderAsistenciaAsesorAction:", err);
    return { ok: false, error: err.message || "Error al responder confirmación." };
  }
}

/**
 * 4. Monitor de SLA en tiempo real (disparado por polling del CRM o cron).
 */
export async function verificarSLAInspeccionesAction(): Promise<{
  ok: boolean;
  metricas?: { evaluadas: number; enRiesgo: number; vencidas: number; autoConfirmadas: number };
  error?: string;
}> {
  try {
    const sb = supabaseServidor();
    const metricas = await verificarYActualizarSLAInspecciones(sb);

    if (metricas.enRiesgo > 0 || metricas.vencidas > 0) {
      revalidatePath("/agenda");
    }

    return { ok: true, metricas };
  } catch (err: any) {
    console.error("[Action] Error en verificarSLAInspeccionesAction:", err);
    return { ok: false, error: err.message || "Error al evaluar SLA." };
  }
}

/**
 * 5. Tablero de inspecciones y estatus SLA para vista de administradores.
 */
export async function obtenerTableroInspeccionesSLAAction(): Promise<{
  ok: boolean;
  citas: EstadoInspeccionSLA[];
  error?: string;
}> {
  try {
    await requireAdministrador();
    const sb = supabaseServidor();
    const citas = await obtenerCitasInspeccionSLA(sb);
    return { ok: true, citas };
  } catch (err: any) {
    console.error("[Action] Error en obtenerTableroInspeccionesSLAAction:", err);
    return { ok: false, citas: [], error: err.message || "Error al obtener tablero SLA." };
  }
}
