import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import {
  listarAutomatizaciones,
  listarEjecuciones,
} from "@/app/actions/automatizaciones";
import { EVENTOS, TIPOS_ACCION } from "@/lib/automatizaciones/catalogos";

export const dynamic = "force-dynamic";

function nombreEvento(id: string): string {
  return EVENTOS.find((e) => e.id === id)?.nombre ?? id;
}

function nombreAccion(id: string): string {
  return TIPOS_ACCION.find((t) => t.id === id)?.nombre ?? id;
}

const COLOR_ESTADO: Record<string, string> = {
  ok: "bg-sauce/15 text-verde-profundo",
  omitido: "bg-carbon/10 text-carbon/50",
  error: "bg-rojo/10 text-rojo",
};

/** Panel de automatizaciones (reglas + bitácora de ejecuciones). */
export default async function PaginaAutomatizaciones() {
  let automatizaciones;
  let ejecuciones;
  try {
    [automatizaciones, ejecuciones] = await Promise.all([
      listarAutomatizaciones(),
      listarEjecuciones(20),
    ]);
  } catch {
    return (
      <main className="min-h-screen pb-10">
        <Encabezado />
        <div className="mx-auto max-w-4xl px-4 pt-5">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            Automatizaciones
          </h1>
          <p className="mt-4 rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo">
            No se pudo cargar el módulo. Si es la primera vez, corre la migración{" "}
            <span className="font-mono">0011_automatizaciones.sql</span> en
            Supabase.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-4xl px-4 pt-5">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
              Automatizaciones
            </h1>
            <p className="mt-1 text-sm text-carbon/60">
              Reglas que se ejecutan solas cuando ocurre algo (un nuevo lead, un
              cambio de etapa, etc.).
            </p>
          </div>
          <Link
            href="/automatizaciones/nuevo"
            className="rounded-md bg-sauce px-4 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo"
          >
            + Nueva automatización
          </Link>
        </div>

        {automatizaciones.length === 0 ? (
          <p className="rounded-lg border border-dashed border-carbon/15 p-8 text-center text-sm text-carbon/40">
            Aún no hay automatizaciones. Crea la primera con “+ Nueva
            automatización”.
          </p>
        ) : (
          <div className="space-y-2">
            {automatizaciones.map((a) => (
              <Link
                key={a.id}
                href={`/automatizaciones/${a.id}/editar`}
                className="flex items-center justify-between gap-3 rounded-lg border border-carbon/10 bg-white p-4 transition hover:border-dorado hover:shadow-sm"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-titular font-medium text-verde-profundo">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        a.activa ? "bg-sauce" : "bg-carbon/25"
                      }`}
                      title={a.activa ? "Activa" : "Inactiva"}
                    />
                    {a.nombre}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-carbon/50">
                    Cuando: {nombreEvento(a.evento)}
                    {a.condiciones.length > 0 &&
                      ` · ${a.condiciones.length} condición(es)`}{" "}
                    → {a.acciones.map((ac) => nombreAccion(ac.tipo)).join(", ") || "sin acciones"}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-sauce">Editar →</span>
              </Link>
            ))}
          </div>
        )}

        {/* Bitácora de ejecuciones */}
        <h2 className="mb-3 mt-10 font-titular text-xl font-semibold text-verde-profundo">
          Ejecuciones recientes
        </h2>
        {ejecuciones.length === 0 ? (
          <p className="rounded-lg border border-dashed border-carbon/15 p-6 text-center text-sm text-carbon/40">
            Todavía no se ha ejecutado ninguna automatización.
          </p>
        ) : (
          <div className="space-y-1.5">
            {ejecuciones.map((e) => (
              <div
                key={e.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-carbon/10 bg-white px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-carbon/80">
                    {e.nombre || nombreEvento(e.evento)}
                  </p>
                  <p className="truncate text-xs text-carbon/50">
                    {nombreEvento(e.evento)}
                    {e.expedienteId && ` · ${e.expedienteId}`}
                    {e.prospectoId && ` · ${e.prospectoId}`} · {e.detalle}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    COLOR_ESTADO[e.estado] ?? "bg-carbon/10 text-carbon/50"
                  }`}
                >
                  {e.estado}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
