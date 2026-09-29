"use client";

import { actualizarEstatusOrdenTrabajo } from "@/app/actions/ordenes-trabajo";

type EstatusOT = "pendiente" | "en_proceso" | "completada" | "cancelada";

/**
 * Cambia el estatus de una OT. Si el contrato aún no está firmado, avisa y
 * permite al administrador continuar (queda en bitácora).
 * Devuelve true si el cambio se aplicó.
 */
export async function cambiarEstatusOTConContrato(ordenId: string, nuevo: EstatusOT): Promise<boolean> {
  let r = await actualizarEstatusOrdenTrabajo(ordenId, nuevo);
  if (!r.ok && r.codigo === "CONTRATO_PENDIENTE") {
    const seguir = window.confirm(
      `${r.error}\n\nSolo un administrador puede iniciar la orden sin contrato firmado. ` +
        `¿Continuar de todos modos? Quedará registrado en la bitácora.`
    );
    if (!seguir) return false;
    r = await actualizarEstatusOrdenTrabajo(ordenId, nuevo, { overrideContrato: true });
  }
  if (!r.ok) {
    alert(r.error || "Error al actualizar el estado de la orden.");
    return false;
  }
  return true;
}
