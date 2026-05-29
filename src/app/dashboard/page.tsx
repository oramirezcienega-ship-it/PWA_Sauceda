import { Encabezado } from "@/components/Encabezado";
import { resumenOperacion } from "@/app/actions/reportes";
import { formatoPesos } from "@/lib/formato";

export const dynamic = "force-dynamic";

/** Dashboard general de la operación. */
export default async function PaginaDashboard() {
  let r;
  try {
    r = await resumenOperacion();
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return (
      <main className="min-h-screen pb-10">
        <Encabezado />
        <div className="mx-auto max-w-5xl px-4 pt-5">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            Dashboard
          </h1>
          <p className="mt-4 rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo">
            No se pudo cargar el reporte. {mensaje}
          </p>
        </div>
      </main>
    );
  }

  const maxEtapa = Math.max(1, ...r.porEtapa.map((e) => e.total));
  const maxOrigen = Math.max(1, ...r.porOrigen.map((o) => o.total));

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-5xl px-4 pt-5">
        <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-carbon/60">
          Resumen general de la operación.
        </p>

        {/* Tarjetas de métricas */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Metrica etiqueta="Leads (prospectos)" valor={String(r.totalLeads)} />
          <Metrica etiqueta="Expedientes" valor={String(r.totalExpedientes)} />
          <Metrica etiqueta="Activos" valor={String(r.activos)} />
          <Metrica
            etiqueta="Cerrados"
            valor={String(r.cerrados)}
            resaltar
          />
          <Metrica etiqueta="Perdidos" valor={String(r.perdidos)} />
          <Metrica
            etiqueta="Tasa de conversión"
            valor={`${r.tasaConversion}%`}
            resaltar
          />
          <Metrica
            etiqueta="Inversión campañas"
            valor={formatoPesos(r.inversionCampanas)}
          />
          <Metrica
            etiqueta="Costo por lead"
            valor={formatoPesos(r.costoPorLead)}
          />
        </div>

        <p className="mt-3 text-sm text-carbon/60">
          Valor estimado en pipeline activo:{" "}
          <span className="font-mono font-medium text-sauce">
            {formatoPesos(r.valorPipeline)}
          </span>
        </p>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Embudo de conversión */}
          <div className="rounded-xl border border-carbon/10 bg-white p-5">
            <h2 className="mb-4 font-titular text-lg font-semibold text-verde-profundo">
              Embudo de conversión
            </h2>
            <div className="space-y-2">
              {r.porEtapa.map((e) => (
                <Barra
                  key={e.etapa}
                  etiqueta={e.nombre}
                  total={e.total}
                  max={maxEtapa}
                  color={
                    e.etapa === "perdido"
                      ? "bg-rojo/60"
                      : e.etapa === "cerrado"
                        ? "bg-verde-profundo"
                        : "bg-sauce"
                  }
                />
              ))}
            </div>
          </div>

          {/* Leads por fuente */}
          <div className="rounded-xl border border-carbon/10 bg-white p-5">
            <h2 className="mb-4 font-titular text-lg font-semibold text-verde-profundo">
              Leads por fuente
            </h2>
            {r.porOrigen.length === 0 ? (
              <p className="text-sm text-carbon/40">Sin datos de origen.</p>
            ) : (
              <div className="space-y-2">
                {r.porOrigen.map((o) => (
                  <Barra
                    key={o.origen}
                    etiqueta={o.nombre}
                    total={o.total}
                    max={maxOrigen}
                    color="bg-cielo"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Metrica({
  etiqueta,
  valor,
  resaltar,
}: {
  etiqueta: string;
  valor: string;
  resaltar?: boolean;
}) {
  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-4">
      <p className="text-[10px] uppercase tracking-wide text-carbon/40">
        {etiqueta}
      </p>
      <p
        className={`mt-1 font-mono text-2xl font-semibold ${
          resaltar ? "text-sauce" : "text-verde-profundo"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

function Barra({
  etiqueta,
  total,
  max,
  color,
}: {
  etiqueta: string;
  total: number;
  max: number;
  color: string;
}) {
  const pct = Math.round((total / max) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-carbon/70">
        <span>{etiqueta}</span>
        <span className="font-mono font-medium text-verde-profundo">
          {total}
        </span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-carbon/10">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${total === 0 ? 0 : Math.max(pct, 4)}%` }}
        />
      </div>
    </div>
  );
}
