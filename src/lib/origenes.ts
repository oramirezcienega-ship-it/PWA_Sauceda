import type { OrigenAdquisicion } from "./types";

/** Orígenes de adquisición disponibles, con su nombre para mostrar. */
export const ORIGENES: { id: OrigenAdquisicion; nombre: string }[] = [
  { id: "whatsapp", nombre: "WhatsApp" },
  { id: "facebook", nombre: "Facebook" },
  { id: "instagram", nombre: "Instagram" },
  { id: "recomendacion", nombre: "Recomendación" },
  { id: "sitio-web", nombre: "Sitio web" },
  { id: "volante", nombre: "Volante" },
  { id: "otro", nombre: "Otro" },
];

/** Mapa de acceso rápido id → nombre. */
export const ORIGEN_POR_ID: Record<OrigenAdquisicion, string> = ORIGENES.reduce(
  (acc, o) => {
    acc[o.id] = o.nombre;
    return acc;
  },
  {} as Record<OrigenAdquisicion, string>,
);
