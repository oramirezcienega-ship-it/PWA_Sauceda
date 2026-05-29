import { ETAPAS, ETAPAS_POR_ID } from "@/lib/etapas";
import type { EtapaId } from "@/lib/types";

/**
 * Avance del traspaso como stepper horizontal: círculos numerados conectados
 * por líneas. Completadas en verde (✓), la actual en azul, las siguientes en
 * gris. "Perdido" se muestra como estado aparte.
 */
export function AvanceTraspaso({ etapa }: { etapa: EtapaId }) {
  if (etapa === "perdido") {
    return (
      <div className="rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo">
        Estado: <strong>Perdido</strong> — el trámite no continúa.
      </div>
    );
  }

  const actualOrden = ETAPAS_POR_ID[etapa].orden;
  const pasos = ETAPAS.filter((e) => e.id !== "perdido");
  const ultimo = pasos.length - 1;

  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-[520px]">
        {pasos.map((p, i) => {
          const completada = p.orden < actualOrden;
          const actual = p.orden === actualOrden;
          // Línea que ENTRA al círculo (verde si ya llegamos a esta etapa).
          const lineaIzq = p.orden <= actualOrden;
          // Línea que SALE del círculo (verde si esta etapa ya se completó).
          const lineaDer = p.orden < actualOrden;
          return (
            <li key={p.id} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <span
                  className={`h-0.5 flex-1 ${
                    i === 0
                      ? "opacity-0"
                      : lineaIzq
                        ? "bg-sauce"
                        : "bg-carbon/15"
                  }`}
                />
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                    completada
                      ? "bg-sauce text-crema"
                      : actual
                        ? "bg-cielo text-white"
                        : "bg-carbon/10 text-carbon/40"
                  }`}
                >
                  {completada ? "✓" : p.orden + 1}
                </span>
                <span
                  className={`h-0.5 flex-1 ${
                    i === ultimo
                      ? "opacity-0"
                      : lineaDer
                        ? "bg-sauce"
                        : "bg-carbon/15"
                  }`}
                />
              </div>
              <span
                className={`mt-1.5 text-center text-[10px] leading-tight ${
                  actual
                    ? "font-semibold text-cielo"
                    : completada
                      ? "text-carbon/70"
                      : "text-carbon/40"
                }`}
              >
                {p.nombre}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
