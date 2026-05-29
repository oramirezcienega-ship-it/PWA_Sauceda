import type { EtapaId } from "@/lib/types";
import { ETAPAS_POR_ID } from "@/lib/etapas";

/**
 * Insignia de color para cada etapa del flujo.
 * Los colores derivan de la paleta de marca para mantener coherencia.
 */
const ESTILO_ETAPA: Record<EtapaId, string> = {
  "nuevo-lead": "bg-cielo/15 text-cielo border-cielo/30",
  contactado: "bg-sauce/15 text-sauce border-sauce/30",
  valuacion: "bg-dorado/20 text-[#8a7233] border-dorado/40",
  oferta: "bg-dorado/25 text-[#8a7233] border-dorado/50",
  documentos: "bg-sauce/20 text-verde-profundo border-sauce/40",
  notaria: "bg-verde-profundo/15 text-verde-profundo border-verde-profundo/30",
  cerrado: "bg-verde-profundo text-crema border-verde-profundo",
};

export function EtapaBadge({ etapa }: { etapa: EtapaId }) {
  const def = ETAPAS_POR_ID[etapa];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-cuerpo text-xs font-medium ${ESTILO_ETAPA[etapa]}`}
    >
      {def.nombre}
    </span>
  );
}
