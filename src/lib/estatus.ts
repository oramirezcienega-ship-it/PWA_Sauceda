import type { EstatusProspecto, CalificacionProspecto } from "./types";

export const ESTATUS_PROSPECTO_LISTA: { id: EstatusProspecto; nombre: string }[] = [
  { id: "lead", nombre: "Lead (Recién captado)" },
  { id: "mql", nombre: "MQL (En conversación)" },
  { id: "sql", nombre: "SQL (Pasa a ventas / Expediente)" },
  { id: "cliente", nombre: "Cliente (Firmado)" },
  { id: "sin_contacto", nombre: "Sin contacto" },
  { id: "no_viable", nombre: "No viable" },
];

export const ESTATUS_POR_ID: Record<EstatusProspecto, string> = {
  lead: "Lead",
  mql: "MQL",
  sql: "SQL",
  cliente: "Cliente",
  nuevo: "Lead",
  en_conversacion: "MQL",
  expediente_abierto: "SQL",
  sin_contacto: "Sin contacto",
  no_viable: "No viable",
};

export const CALIFICACION_PROSPECTO_LISTA: { id: CalificacionProspecto; nombre: string }[] = [
  { id: "caliente", nombre: "Caliente (Alta prioridad)" },
  { id: "templado", nombre: "Templado (Media prioridad)" },
  { id: "frio", nombre: "Frío (Baja prioridad)" },
  { id: "descalificado", nombre: "Descalificado" },
];

export const CALIFICACION_POR_ID: Record<CalificacionProspecto, string> = CALIFICACION_PROSPECTO_LISTA.reduce(
  (acc, o) => {
    acc[o.id] = o.nombre;
    return acc;
  },
  {} as Record<CalificacionProspecto, string>
);
