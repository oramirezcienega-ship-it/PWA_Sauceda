import type { EstatusProspecto, CalificacionProspecto } from "./types";

export const ESTATUS_PROSPECTO_LISTA: { id: EstatusProspecto; nombre: string }[] = [
  { id: "nuevo", nombre: "Nuevo" },
  { id: "en_conversacion", nombre: "En conversación" },
  { id: "expediente_abierto", nombre: "Expediente abierto" },
  { id: "cliente", nombre: "Cliente" },
  { id: "sin_contacto", nombre: "Sin contacto" },
  { id: "no_viable", nombre: "No viable" },
];

export const ESTATUS_POR_ID: Record<EstatusProspecto, string> = ESTATUS_PROSPECTO_LISTA.reduce(
  (acc, o) => {
    acc[o.id] = o.nombre;
    return acc;
  },
  {} as Record<EstatusProspecto, string>
);

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
