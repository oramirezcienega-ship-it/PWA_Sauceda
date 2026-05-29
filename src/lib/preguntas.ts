import type { TipoPregunta } from "./types";

/** Tipos de pregunta disponibles, con su nombre para mostrar. */
export const TIPOS_PREGUNTA: { id: TipoPregunta; nombre: string }[] = [
  { id: "texto-corto", nombre: "Texto corto" },
  { id: "texto-largo", nombre: "Texto largo" },
  { id: "numero", nombre: "Número" },
  { id: "opcion-multiple", nombre: "Opción múltiple" },
  { id: "si-no", nombre: "Sí / No" },
  { id: "fecha", nombre: "Fecha" },
  { id: "archivo", nombre: "Archivo (PDF/foto)" },
];

export const TIPO_PREGUNTA_NOMBRE: Record<TipoPregunta, string> =
  TIPOS_PREGUNTA.reduce(
    (acc, t) => {
      acc[t.id] = t.nombre;
      return acc;
    },
    {} as Record<TipoPregunta, string>,
  );
