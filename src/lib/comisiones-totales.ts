import type { Comision } from "@/lib/types";

/**
 * Totales de las tarjetas "Base Comisionable" e "Inspecciones", compartidos
 * por el reporte de comisiones y su vista imprimible para que coincidan.
 */
export function calcularTotalesTarjetas(comisiones: Comision[]) {
  let baseVentas = 0;
  let ventasCount = 0;
  let inspeccionesMonto = 0;
  let inspeccionesCount = 0;

  for (const c of comisiones) {
    if (c.estatus === "cancelada") continue;
    if (c.tipoComision === "inspeccion") {
      inspeccionesMonto += c.montoComision || 0;
      inspeccionesCount++;
    } else {
      baseVentas += c.baseComisionable || 0;
      ventasCount++;
    }
  }

  return { baseVentas, ventasCount, inspeccionesMonto, inspeccionesCount };
}
