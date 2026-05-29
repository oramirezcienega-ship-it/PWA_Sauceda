import type { Expediente } from "@/lib/types";
import { ETAPAS, ETAPAS_POR_ID } from "@/lib/etapas";
import { formatoFecha } from "@/lib/formato";

/**
 * Portal del cliente — vista de SEGUIMIENTO (solo lectura).
 *
 * Es lo que ve el cliente vendedor al abrir su enlace privado. Muestra
 * únicamente lo que le concierne de SU expediente: en qué etapa va y el
 * avance del trámite. NO muestra notas internas, saldos ni otros expedientes.
 */
export function SeguimientoCliente({ expediente }: { expediente: Expediente }) {
  const etapaActual = ETAPAS_POR_ID[expediente.etapa];
  const total = ETAPAS.length;
  const completadas = etapaActual.orden + 1;
  const porcentaje = Math.round((completadas / total) * 100);

  return (
    <main className="min-h-screen bg-crema">
      {/* Encabezado de marca */}
      <header className="bg-verde-profundo text-crema">
        <div className="mx-auto max-w-xl px-5 py-5">
          <p className="font-display text-2xl font-semibold tracking-tight">
            SAUCEDA
          </p>
          <p className="font-titular text-sm italic text-dorado">
            Tradición con tecnología.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-5 py-6">
        {/* Saludo */}
        <p className="text-sm text-carbon/60">Seguimiento de tu traspaso</p>
        <h1 className="mt-1 font-titular text-3xl font-semibold text-verde-profundo">
          Hola, {expediente.cliente.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-carbon/70">
          Tu propiedad en <strong>{expediente.fraccionamiento}</strong>, León, Gto.
        </p>

        {/* Etapa actual destacada */}
        <div className="mt-6 rounded-2xl border border-sauce/30 bg-white p-5 text-center shadow-sm">
          <p className="text-xs uppercase tracking-wide text-carbon/40">
            Tu trámite está en
          </p>
          <p className="mt-1 font-titular text-2xl font-semibold text-sauce">
            {etapaActual.nombre}
          </p>
          <p className="mt-2 text-sm text-carbon/70">
            {etapaActual.descripcion}
          </p>

          {/* Barra de avance */}
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-carbon/10">
            <div
              className="h-full rounded-full bg-sauce transition-all"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
          <p className="mt-1 font-mono text-xs text-carbon/50">
            Etapa {completadas} de {total} · {porcentaje}%
          </p>
        </div>

        {/* Línea de etapas */}
        <div className="mt-6 rounded-2xl border border-carbon/10 bg-white p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-carbon/50">
            Etapas del traspaso
          </p>
          <ol className="space-y-2">
            {ETAPAS.map((etapa) => {
              const actual = etapa.id === expediente.etapa;
              const completada = etapa.orden < etapaActual.orden;
              return (
                <li key={etapa.id} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${
                      actual
                        ? "bg-verde-profundo text-crema"
                        : completada
                          ? "bg-sauce text-crema"
                          : "bg-carbon/10 text-carbon/40"
                    }`}
                  >
                    {completada ? "✓" : etapa.orden + 1}
                  </span>
                  <span
                    className={`text-sm ${
                      actual
                        ? "font-medium text-verde-profundo"
                        : completada
                          ? "text-carbon/70"
                          : "text-carbon/40"
                    }`}
                  >
                    {etapa.nombre}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Contacto */}
        <div className="mt-6 rounded-2xl border border-dorado/40 bg-dorado/5 p-5 text-center">
          <p className="text-sm text-carbon/70">
            ¿Tienes dudas sobre tu trámite?
          </p>
          <a
            href="https://wa.me/524771234567"
            className="mt-2 inline-block rounded-md bg-sauce px-4 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo"
          >
            Contactar a mi asesor
          </a>
        </div>

        <p className="mt-6 text-center font-mono text-[11px] text-carbon/40">
          Última actualización: {formatoFecha(expediente.ultimoMovimiento)}
        </p>
      </div>
    </main>
  );
}
