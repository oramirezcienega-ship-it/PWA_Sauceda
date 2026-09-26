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
  iniciarPropuestaCoordinacion,
  registrarVotosAsesorCoordinacion,
  enviarOpcionesAClienteCoordinacion,
  confirmarCitaFinalCoordinacion,
  obtenerCoordinacionActivaProspecto,
  cancelarCoordinacionAction as cancelarCoordLib,
  type SolicitudInspeccionInput,
  type SlotHorarioDisponible,
  type EstadoInspeccionSLA,
  type IniciarPropuestaInput,
  type OpcionHorarioPropuesta,
  type CoordinacionInspeccionDetalle,
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

/**
 * 6. Inicia una propuesta de coordinación tentativa y notifica a los asesores
 */
export async function iniciarPropuestaCoordinacionAction(
  input: IniciarPropuestaInput
): Promise<{ ok: boolean; coordinacionId?: string; error?: string }> {
  try {
    const sb = supabaseServidor();
    const res = await iniciarPropuestaCoordinacion(sb, input);
    revalidatePath("/prospectos");
    revalidatePath(`/prospectos/${input.prospectoId}`);
    return res;
  } catch (err: any) {
    console.error("[Action] Error en iniciarPropuestaCoordinacionAction:", err);
    return { ok: false, error: err.message || "Error al iniciar propuesta." };
  }
}

/**
 * 7. Registra votos de un asesor para las opciones de horario
 */
export async function registrarVotosAsesorAction(
  coordinacionId: string,
  asesorId: string,
  votos: Record<string, boolean>,
  notas?: string,
  prospectoId?: string
): Promise<{ ok: boolean; opcionesValidadas: string[]; error?: string }> {
  try {
    const sb = supabaseServidor();
    const res = await registrarVotosAsesorCoordinacion(sb, coordinacionId, asesorId, votos, notas);
    if (prospectoId) {
      revalidatePath(`/prospectos/${prospectoId}`);
    }
    return res;
  } catch (err: any) {
    console.error("[Action] Error en registrarVotosAsesorAction:", err);
    return { ok: false, opcionesValidadas: [], error: err.message };
  }
}

/**
 * 8. Envía las opciones validadas por ambos asesores al cliente vía WhatsApp
 */
export async function enviarOpcionesClienteAction(
  coordinacionId: string,
  prospectoId?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = supabaseServidor();
    const res = await enviarOpcionesAClienteCoordinacion(sb, coordinacionId);
    if (prospectoId) {
      revalidatePath(`/prospectos/${prospectoId}`);
    }
    return res;
  } catch (err: any) {
    console.error("[Action] Error en enviarOpcionesClienteAction:", err);
    return { ok: false, error: err.message };
  }
}

/**
 * 9. El cliente seleccionó una opción: Confirma la cita definitiva y notifica de vuelta a los asesores
 */
export async function confirmarCitaFinalCoordinacionAction(
  coordinacionId: string,
  opcionId: string,
  prospectoId?: string
): Promise<{ ok: boolean; citaId?: string; error?: string }> {
  try {
    const sb = supabaseServidor();
    const res = await confirmarCitaFinalCoordinacion(sb, coordinacionId, opcionId);
    revalidatePath("/agenda");
    revalidatePath("/prospectos");
    if (prospectoId) {
      revalidatePath(`/prospectos/${prospectoId}`);
    }
    return res;
  } catch (err: any) {
    console.error("[Action] Error en confirmarCitaFinalCoordinacionAction:", err);
    return { ok: false, error: err.message };
  }
}

/**
 * 10. Consulta la coordinación activa de un prospecto
 */
export async function obtenerCoordinacionActivaProspectoAction(
  prospectoId: string
): Promise<{ ok: boolean; coordinacion: CoordinacionInspeccionDetalle | null; error?: string }> {
  try {
    const sb = supabaseServidor();
    const coordinacion = await obtenerCoordinacionActivaProspecto(sb, prospectoId);
    return { ok: true, coordinacion };
  } catch (err: any) {
    console.error("[Action] Error en obtenerCoordinacionActivaProspectoAction:", err);
    return { ok: false, coordinacion: null, error: err.message };
  }
}

/**
 * 11. Cancela la propuesta de coordinación activa
 */
export async function cancelarCoordinacionActivaAction(
  coordinacionId: string,
  prospectoId?: string
): Promise<{ ok: boolean }> {
  try {
    const sb = supabaseServidor();
    await cancelarCoordLib(sb, coordinacionId);
    if (prospectoId) {
      revalidatePath(`/prospectos/${prospectoId}`);
    }
    return { ok: true };
  } catch (err: any) {
    console.error("[Action] Error en cancelarCoordinacionActivaAction:", err);
    return { ok: false };
  }
}
