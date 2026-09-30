import { labelTipoNegocio } from "@/lib/types";

/**
 * Señalética visual de cada tipo de negocio (ícono, etiqueta corta y colores) para
 * reconocerlos de un vistazo en listas y encabezados.
 */
export interface VisualNegocio {
  icono: string;
  /** Nombre completo, sin recortar (p. ej. "Mantenimiento Tinacos"). */
  nombre: string;
  /** Familia: bienes raíces o construcción. */
  linea: "Bienes Raíces" | "Sauceda Construye" | "Otro";
  /** Clases Tailwind de la insignia (fondo, texto, borde). */
  clases: string;
  /** Clase del borde izquierdo de acento. */
  acento: string;
}

const CONSTRUYE = "Sauceda Construye" as const;
const RAICES = "Bienes Raíces" as const;

const TABLA: Record<string, Omit<VisualNegocio, "nombre">> = {
  "traspaso_compra": { icono: "🏠", linea: RAICES, clases: "bg-sky-50 text-sky-900 border-sky-300", acento: "border-l-sky-500" },
  "promocion_venta": { icono: "📣", linea: RAICES, clases: "bg-indigo-50 text-indigo-900 border-indigo-300", acento: "border-l-indigo-500" },
  "solo_tramite": { icono: "📄", linea: RAICES, clases: "bg-slate-100 text-slate-800 border-slate-300", acento: "border-l-slate-400" },
  "construccion": { icono: "🏗️", linea: CONSTRUYE, clases: "bg-amber-50 text-amber-900 border-amber-300", acento: "border-l-amber-500" },
  "construccion-impermeabilizacion": { icono: "☔", linea: CONSTRUYE, clases: "bg-blue-50 text-blue-900 border-blue-300", acento: "border-l-blue-500" },
  "construccion-remodelacion": { icono: "🔨", linea: CONSTRUYE, clases: "bg-orange-50 text-orange-900 border-orange-300", acento: "border-l-orange-500" },
  "construccion-piso-estampado": { icono: "🧱", linea: CONSTRUYE, clases: "bg-stone-100 text-stone-800 border-stone-300", acento: "border-l-stone-500" },
  "construccion-mantenimiento-postventa": { icono: "🔧", linea: CONSTRUYE, clases: "bg-emerald-50 text-emerald-900 border-emerald-300", acento: "border-l-emerald-500" },
  "construccion-mantenimiento-cisternas": { icono: "💧", linea: CONSTRUYE, clases: "bg-cyan-50 text-cyan-900 border-cyan-300", acento: "border-l-cyan-500" },
  "construccion-mantenimiento-tinacos": { icono: "🚰", linea: CONSTRUYE, clases: "bg-teal-50 text-teal-900 border-teal-300", acento: "border-l-teal-500" },
  "construccion-herreria": { icono: "⚙️", linea: CONSTRUYE, clases: "bg-zinc-100 text-zinc-800 border-zinc-300", acento: "border-l-zinc-500" },
  "otro": { icono: "❔", linea: "Otro", clases: "bg-slate-100 text-slate-700 border-slate-300", acento: "border-l-slate-400" },
};

const SIN_CLASIFICAR: Omit<VisualNegocio, "nombre"> = {
  icono: "🏷️",
  linea: "Otro",
  clases: "bg-slate-50 text-carbon/50 border-carbon/15",
  acento: "border-l-transparent",
};

export function visualNegocio(tipo?: string | null): VisualNegocio {
  if (!tipo) return { ...SIN_CLASIFICAR, nombre: "Sin clasificar" };
  const base = TABLA[tipo] ?? SIN_CLASIFICAR;
  return { ...base, nombre: labelTipoNegocio(tipo).replace(/^Sauceda Construye \((.*)\)$/, "$1") };
}
