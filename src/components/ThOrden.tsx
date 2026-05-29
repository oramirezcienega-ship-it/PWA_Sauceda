import type { DireccionOrden } from "@/hooks/useOrden";

/** Encabezado de tabla ordenable (reutilizable entre tablas). */
export function ThOrden({
  columna,
  claveActiva,
  dir,
  onOrdenar,
  alineado = "izquierda",
  children,
}: {
  columna: string;
  claveActiva: string | null;
  dir: DireccionOrden;
  onOrdenar: (columna: string) => void;
  alineado?: "izquierda" | "derecha";
  children: React.ReactNode;
}) {
  const activo = claveActiva === columna;
  return (
    <th
      className={`px-3 py-2.5 text-[10px] font-medium uppercase tracking-wide text-carbon/50 ${
        alineado === "derecha" ? "text-right" : "text-left"
      }`}
    >
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        className={`inline-flex items-center gap-1 hover:text-verde-profundo ${
          alineado === "derecha" ? "flex-row-reverse" : ""
        } ${activo ? "text-verde-profundo" : ""}`}
      >
        {children}
        <span className="text-[9px]">
          {activo ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
