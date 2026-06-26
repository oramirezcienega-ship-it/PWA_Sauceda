import type { EstatusProspecto } from "@/lib/types";
import { ESTATUS_POR_ID } from "@/lib/estatus";

const ESTILO_ESTATUS: Record<EstatusProspecto, string> = {
  nuevo: "bg-sky-50 text-sky-700 border-sky-200",
  en_conversacion: "bg-purple-50 text-purple-700 border-purple-200",
  expediente_abierto: "bg-amber-50 text-amber-800 border-amber-200",
  cliente: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sin_contacto: "bg-slate-50 text-slate-500 border-slate-200",
  no_viable: "bg-rose-50 text-rose-700 border-rose-200",
};

export function EstatusProspectoBadge({ estatus }: { estatus: EstatusProspecto }) {
  const nombre = ESTATUS_POR_ID[estatus] || estatus;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-cuerpo text-xs font-semibold ${ESTILO_ESTATUS[estatus]}`}
    >
      {nombre}
    </span>
  );
}
