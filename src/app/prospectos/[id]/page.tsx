import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import { EliminarProspecto } from "@/components/EliminarProspecto";
import { Actividades } from "@/components/Actividades";
import { EtapaBadge } from "@/components/EtapaBadge";
import { obtenerProspecto } from "@/app/actions/prospectos";
import { ORIGEN_POR_ID } from "@/lib/origenes";
import { formatoPesos } from "@/lib/formato";
import { EstatusProspectoBadge } from "@/components/EstatusProspectoBadge";
import { CalificacionProspectoBadge } from "@/components/CalificacionProspectoBadge";
import { AsesorSelector } from "@/components/AsesorSelector";
import { BotonLlamar } from "@/components/BotonLlamar";
import { ConversacionHistorica } from "@/components/ConversacionHistorica";
import { LlamadasHistoricas } from "@/components/LlamadasHistoricas";
import { TimelineSecuencia } from "@/components/TimelineSecuencia";
import { BotonNoViable } from "@/components/BotonNoViable";
import { LinkCitaWidget } from "@/components/LinkCitaWidget";
import { OperadorSelector } from "@/components/OperadorSelector";


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
              {prospecto.nombreCompleto}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-cielo/30 bg-cielo/10 px-2.5 py-0.5 text-xs text-cielo">
                {ORIGEN_POR_ID[prospecto.origen]}
              </span>
              <EstatusProspectoBadge estatus={prospecto.estatus} />
              <CalificacionProspectoBadge calificacion={prospecto.calificacion} />
              {prospecto.noViable && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rojo/10 border border-rojo/30 px-2.5 py-0.5 text-[11px] font-bold text-rojo">
                  🚫 No viable
                </span>
              )}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <AsesorSelector
                entidadId={prospecto.id}
                tipoEntidad="prospecto"
                asesorIdActual={prospecto.asesorId ?? null}
                asesorNombreActual={prospecto.asesorNombre ?? null}
              />
              <OperadorSelector
                entidadId={prospecto.id}
                tipoEntidad="prospecto"
                operadorIdActual={prospecto.operadorId ?? null}
                operadorNombreActual={prospecto.operadorNombre ?? null}
              />
              <BotonNoViable
                entidadId={prospecto.id}
                tipo="prospecto"
                noViable={prospecto.noViable ?? false}
              />
            </div>
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
          <div className="bg-white p-3">
            <dt className="text-[10px] uppercase tracking-wide text-carbon/40">
              Teléfono
            </dt>
            <dd className="mt-0.5 flex items-center gap-2 text-carbon font-mono">
              <span>{prospecto.telefono || "—"}</span>
              {prospecto.telefono && (
                <div className="flex items-center gap-1.5">
                  <BotonLlamar telefono={prospecto.telefono} prospectoId={prospecto.id} />
                  <Link
                    href={`/conversaciones?tel=${prospecto.telefono}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-100 hover:text-green-800"
                    title="Abrir chat de WhatsApp"
                  >
                    💬 WhatsApp
                  </Link>
                </div>
              )}
            </dd>
          </div>
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

        {(prospecto.campaignName ||
          prospecto.adsetName ||
          prospecto.adName) && (
          <dl className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-carbon/10 bg-carbon/10 sm:grid-cols-3">
            <Dato etiqueta="Campaign" valor={prospecto.campaignName || "—"} />
            <Dato etiqueta="Adset" valor={prospecto.adsetName || "—"} />
            <Dato etiqueta="Ad" valor={prospecto.adName || "—"} />
          </dl>
        )}

        {prospecto.notas && (
          <div className="mt-4 rounded-xl border border-carbon/10 bg-white p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-carbon/50">
              Notas
            </p>
            <p className="text-sm text-carbon/80">{prospecto.notas}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LinkCitaWidget
            asesorId={prospecto.asesorId ?? null}
            asesorNombre={prospecto.asesorNombre ?? null}
            prospectoId={prospecto.id}
            prospectoNombre={prospecto.nombreCompleto}
            prospectoTelefono={prospecto.telefono ?? null}
            siteUrl={process.env.SITE_URL || "http://localhost:3000"}
          />

          <LinkCitaWidget
            asesorId={prospecto.operadorId ?? null}
            asesorNombre={prospecto.operadorNombre ?? null}
            prospectoId={prospecto.id}
            prospectoNombre={prospecto.nombreCompleto}
            prospectoTelefono={prospecto.telefono ?? null}
            siteUrl={process.env.SITE_URL || "http://localhost:3000"}
            titulo="📅 Enlace de Agendamiento de Inspección"
            tipoCitaPredefinido="inspeccion"
            rolEtiqueta="Operador"
          />
        </div>

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

        {/* Línea de tiempo de la Secuencia de Automatización */}
        <TimelineSecuencia phoneOrId={prospecto.id} />

        {/* Historial de conversaciones de WhatsApp */}
        {prospecto.telefono && (
          <ConversacionHistorica telefono={prospecto.telefono} />
        )}

        {/* Historial de llamadas telefónicas y grabaciones */}
        {prospecto.telefono && (
          <LlamadasHistoricas telefono={prospecto.telefono} />
        )}

        {/* Bitácora de actividades del prospecto */}
        <Actividades prospectoId={prospecto.id} />
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
