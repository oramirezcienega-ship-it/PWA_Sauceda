import type { CalificacionProspecto } from "@/lib/types";

const CONFIG: Record<
  CalificacionProspecto,
  { label: string; style: string; icon: string }
> = {
  caliente: {
    label: "Caliente",
    style: "bg-orange-50 text-orange-700 border-orange-200",
    icon: "🔥",
  },
  templado: {
    label: "Templado",
    style: "bg-amber-50 text-amber-700 border-amber-200",
    icon: "⚡",
  },
  frio: {
    label: "Frío",
    style: "bg-cyan-50 text-cyan-700 border-cyan-200",
    icon: "❄️",
  },
  descalificado: {
    label: "Descalificado",
    style: "bg-red-50 text-red-700 border-red-200",
    icon: "🚫",
  },
};

export function CalificacionProspectoBadge({
  calificacion,
}: {
  calificacion: CalificacionProspecto;
}) {
  const conf = CONFIG[calificacion] || {
    label: calificacion,
    style: "bg-slate-50 text-slate-600 border-slate-200",
    icon: "❓",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-cuerpo text-xs font-semibold ${conf.style}`}
    >
      <span>{conf.icon}</span>
      <span>{conf.label}</span>
    </span>
  );
}
