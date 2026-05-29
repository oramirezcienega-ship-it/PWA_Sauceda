"use client";

import Link from "next/link";
import { ORIGEN_POR_ID } from "@/lib/origenes";
import { formatoPesos } from "@/lib/formato";
import type { Prospecto } from "@/lib/types";
import { useOrden } from "@/hooks/useOrden";
import { ThOrden } from "./ThOrden";

const COMPARADORES: Record<string, (a: Prospecto, b: Prospecto) => number> = {
  nombre: (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, "es"),
  telefono: (a, b) => a.telefono.localeCompare(b.telefono, "es"),
  ciudad: (a, b) => a.ciudad.localeCompare(b.ciudad, "es"),
  origen: (a, b) =>
    ORIGEN_POR_ID[a.origen].localeCompare(ORIGEN_POR_ID[b.origen], "es"),
  valorCampana: (a, b) => a.valorCampana - b.valorCampana,
};

/** Tabla de prospectos con columnas ordenables. */
export function TablaProspectos({ prospectos }: { prospectos: Prospecto[] }) {
  const orden = useOrden(prospectos, COMPARADORES);

  return (
    <div className="overflow-x-auto rounded-xl border border-carbon/10 bg-white scrollbar-sutil">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-carbon/10 bg-crema/60 text-left">
            {(
              [
                ["nombre", "Prospecto", "izquierda"],
                ["telefono", "Teléfono", "izquierda"],
                ["ciudad", "Ciudad", "izquierda"],
                ["origen", "Origen", "izquierda"],
                ["valorCampana", "Valor campaña", "derecha"],
              ] as const
            ).map(([columna, label, alineado]) => (
              <ThOrden
                key={columna}
                columna={columna}
                claveActiva={orden.clave}
                dir={orden.dir}
                onOrdenar={orden.ordenarPor}
                alineado={alineado}
              >
                {label}
              </ThOrden>
            ))}
          </tr>
        </thead>
        <tbody>
          {orden.ordenados.map((p) => (
            <tr
              key={p.id}
              className="border-b border-carbon/5 transition hover:bg-crema/40"
            >
              <td className="px-3 py-2.5">
                <Link
                  href={`/prospectos/${p.id}`}
                  className="font-titular font-medium text-verde-profundo hover:text-sauce"
                >
                  {p.nombreCompleto}
                </Link>
                <span className="ml-2 font-mono text-[10px] text-carbon/40">
                  {p.id}
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono text-xs text-carbon/70">
                {p.telefono || "—"}
              </td>
              <td className="px-3 py-2.5 text-carbon/70">{p.ciudad || "—"}</td>
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center rounded-full border border-cielo/30 bg-cielo/10 px-2.5 py-0.5 text-xs text-cielo">
                  {ORIGEN_POR_ID[p.origen]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-carbon/70">
                {formatoPesos(p.valorCampana)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
