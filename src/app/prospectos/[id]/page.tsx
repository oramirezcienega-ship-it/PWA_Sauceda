import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import { EliminarProspecto } from "@/components/EliminarProspecto";
import { EtapaBadge } from "@/components/EtapaBadge";
import { obtenerProspecto } from "@/app/actions/prospectos";
import { ORIGEN_POR_ID } from "@/lib/origenes";
import { formatoPesos } from "@/lib/formato";

export const dynamic = "force-dynamic";

/** Detalle de un prospecto + sus expedientes relacionados. */
export default async function PaginaProspecto({
  params,
}: {
  params: { id: string };
}) {
  const resultado = await obtenerProspecto(params.id);

  if (!resultado) {
    return (
      <main className="min-h-screen pb-10">
        <Encabezado />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="font-titular text-2xl text-verde-profundo">
            Prospecto no encontrado
          </p>
          <Link
            href="/prospectos"
            className="mt-6 inline-block rounded-md bg-sauce px-4 py-2 text-sm text-crema hover:bg-verde-profundo"
          >
            ← Volver a prospectos
          </Link>
        </div>
      </main>
    );
  }

  const { prospecto, expedientes } = resultado;

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Link
          href="/prospectos"
          className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
        >
          ← Volver a prospectos
        </Link>

        {/* Cabecera */}
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
              {prospecto.nombre}
            </h1>
            <p className="mt-1 text-sm text-carbon/60">
              <span className="inline-flex items-center rounded-full border border-cielo/30 bg-cielo/10 px-2.5 py-0.5 text-xs text-cielo">
                {ORIGEN_POR_ID[prospecto.origen]}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={`/prospectos/${prospecto.id}/editar`}
              className="rounded-md border border-carbon/15 bg-white px-3 py-1.5 text-xs text-carbon/70 transition hover:border-sauce hover:text-sauce"
            >
              Editar
            </Link>
            <EliminarProspecto id={prospecto.id} />
          </div>
        </div>

        {/* Datos del prospecto */}
        <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-carbon/10 bg-carbon/10 sm:grid-cols-2">
          <Dato etiqueta="Teléfono" valor={prospecto.telefono || "—"} mono />
          <Dato etiqueta="Correo" valor={prospecto.correo || "—"} />
          <Dato etiqueta="Ciudad" valor={prospecto.ciudad || "—"} />
          <Dato
            etiqueta="Valor de campaña"
            valor={formatoPesos(prospecto.valorCampana)}
            mono
          />
          <Dato
            etiqueta="Dirección"
            valor={prospecto.direccion || "—"}
            ancho
          />
        </dl>

        {prospecto.notas && (
          <div className="mt-4 rounded-xl border border-carbon/10 bg-white p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-carbon/50">
              Notas
            </p>
            <p className="text-sm text-carbon/80">{prospecto.notas}</p>
          </div>
        )}

        {/* Expedientes relacionados */}
        <div className="mt-6 flex items-center justify-between">
          <h2 className="font-titular text-xl font-semibold text-verde-profundo">
            Expedientes ({expedientes.length})
          </h2>
          <Link
            href={`/expediente/nuevo?prospecto=${prospecto.id}`}
            className="rounded-md bg-sauce px-3 py-1.5 text-xs font-medium text-crema transition hover:bg-verde-profundo"
          >
            + Nuevo expediente
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {expedientes.length === 0 && (
            <p className="rounded-lg border border-dashed border-carbon/15 p-6 text-center text-sm text-carbon/40">
              Este prospecto aún no tiene expedientes.
            </p>
          )}
          {expedientes.map((exp) => (
            <Link
              key={exp.id}
              href={`/expediente/${exp.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-carbon/10 bg-white p-3 transition hover:border-dorado hover:shadow-sm"
            >
              <div>
                <p className="font-titular font-medium text-verde-profundo">
                  {exp.fraccionamiento}
                </p>
                <p className="font-mono text-[10px] text-carbon/40">{exp.id}</p>
              </div>
              <EtapaBadge etapa={exp.etapa} />
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

function Dato({
  etiqueta,
  valor,
  mono,
  ancho,
}: {
  etiqueta: string;
  valor: string;
  mono?: boolean;
  ancho?: boolean;
}) {
  return (
    <div className={`bg-white p-3 ${ancho ? "sm:col-span-2" : ""}`}>
      <dt className="text-[10px] uppercase tracking-wide text-carbon/40">
        {etiqueta}
      </dt>
      <dd className={`mt-0.5 text-carbon ${mono ? "font-mono" : "font-cuerpo"}`}>
        {valor}
      </dd>
    </div>
  );
}
