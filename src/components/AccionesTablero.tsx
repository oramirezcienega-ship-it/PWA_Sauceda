import Link from "next/link";

/**
 * Acciones del encabezado del tablero.
 * Por ahora: crear un expediente nuevo.
 */
export function AccionesTablero() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/expediente/importar"
        className="rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon/70 transition hover:border-sauce hover:text-sauce"
      >
        Importar CSV
      </Link>
      <Link
        href="/expediente/nuevo"
        className="rounded-md bg-sauce px-4 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo"
      >
        + Nuevo negocio
      </Link>
    </div>
  );
}
