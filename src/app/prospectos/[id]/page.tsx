import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import { EliminarProspecto } from "@/components/EliminarProspecto";
import { Actividades } from "@/components/Actividades";
import { EtapaBadge } from "@/components/EtapaBadge";
import { obtenerProspecto } from "@/app/actions/prospectos";
import { obtenerCotizacionesDeProspecto } from "@/app/actions/cotizaciones";
import { ORIGEN_POR_ID } from "@/lib/origenes";
import { formatoPesos } from "@/lib/formato";
import { EstatusProspectoBadge } from "@/components/EstatusProspectoBadge";
import { labelTipoNegocio } from "@/lib/types";
import { CalificacionProspectoBadge } from "@/components/CalificacionProspectoBadge";
import { AsesorSelector } from "@/components/AsesorSelector";
import { BotonLlamar } from "@/components/BotonLlamar";
import { ConversacionHistorica } from "@/components/ConversacionHistorica";
import { LlamadasHistoricas } from "@/components/LlamadasHistoricas";
import { TimelineSecuencia } from "@/components/TimelineSecuencia";
import { BotonNoViable } from "@/components/BotonNoViable";
import { LinkCitaWidget } from "@/components/LinkCitaWidget";
import { OperadorSelector } from "@/components/OperadorSelector";
import { WidgetAgendaCitas } from "@/components/WidgetAgendaCitas";
import { BotonDuplicarCotizacion } from "@/components/BotonDuplicarCotizacion";


export const dynamic = "force-dynamic";

/** Detalle de un prospecto + sus expedientes relacionados. */
export default async function PaginaProspecto({
  params,
}: {
  params: { id: string };
}) {
  const resultado = await obtenerProspecto(params.id);
  const cotizaciones = resultado ? await obtenerCotizacionesDeProspecto(params.id) : [];

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
        {/* Señalética Visual de Identificación: PROSPECTO */}
        <div className="mb-4 rounded-xl border border-indigo-300/40 bg-gradient-to-r from-indigo-900 via-indigo-800 to-blue-950 px-4 py-3 text-white shadow-md flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/30 text-lg border border-indigo-400/30">
              👤
            </span>
            <div>
              <span className="font-titular text-sm font-bold uppercase tracking-wider text-indigo-200 block">
                Ficha de Prospecto
              </span>
              <span className="text-[11px] text-indigo-300/80 block font-mono">
                Lead Comercial · Registro Inicial & Cotización
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold bg-indigo-500/30 border border-indigo-400/40 text-indigo-100 px-3 py-1 rounded-full shadow-2xs">
              {prospecto.id}
            </span>
            {expedientes.map((exp) => (
              <Link
                key={exp.id}
                href={`/expediente/${exp.id}`}
                className="inline-flex items-center gap-1.5 font-mono text-xs font-bold bg-amber-400/25 border border-amber-300/50 text-amber-200 hover:bg-amber-400/40 px-3 py-1 rounded-full transition shadow-xs"
              >
                📁 {exp.id} →
              </Link>
            ))}
          </div>
        </div>

        <Link
          href="/prospectos"
          className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo font-semibold"
        >
          ← Volver a prospectos
        </Link>

        {/* Acceso Directo Destacado a Expediente(s) */}
        {expedientes.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-50/60 p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-900/70 flex items-center gap-1.5">
              <span>📁 Expediente{expedientes.length === 1 ? "" : "s"} Relacionado{expedientes.length === 1 ? "" : "s"} ({expedientes.length})</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {expedientes.map((exp) => (
                <Link
                  key={exp.id}
                  href={`/expediente/${exp.id}`}
                  className="inline-flex items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-white px-3.5 py-2 text-xs font-medium text-verde-profundo shadow-xs transition hover:border-sauce hover:shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sauce">{exp.id}</span>
                    <span className="text-carbon/60">• {exp.fraccionamiento || "Por definir"}</span>
                    {exp.tipoNegocio && (
                      <span className="rounded bg-carbon/5 px-1.5 py-0.5 text-[10px] text-carbon/70 font-sans">
                        {labelTipoNegocio(exp.tipoNegocio)}
                      </span>
                    )}
                  </div>
                  <span className="font-semibold text-sauce hover:underline">Ver Expediente →</span>
                </Link>
              ))}
            </div>
          </div>
        )}

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

        {/* Widget de Agendamiento Directo e Historial de Citas */}
        <div className="mt-6">
          <WidgetAgendaCitas
            prospectoId={prospecto.id}
            clienteNombre={prospecto.nombreCompleto}
            clienteTelefono={prospecto.telefono || ""}
            clienteEmail={prospecto.correo || null}
          />
        </div>

        {/* Módulo de Cotizaciones y Propuesta Comercial (Sauceda Construye) */}
        <div className="mt-6 rounded-2xl border border-carbon/10 bg-white p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-titular text-base sm:text-lg font-semibold text-carbon flex items-center gap-1.5">
                📋 Cotizaciones y Propuestas
              </h3>
              <p className="text-xs text-carbon/50">
                Propuestas comerciales y visitas técnicas asociadas
              </p>
            </div>
            <Link
              href={`/construccion?prospectoId=${prospecto.id}&crear=1`}
              className="rounded-lg bg-sauce/10 border border-sauce/20 hover:bg-sauce hover:text-white transition px-3 py-1.5 text-xs font-semibold text-sauce flex items-center gap-1 font-titular"
            >
              + Nueva Cotización
            </Link>
          </div>

          {cotizaciones.length === 0 ? (
            <div className="py-6 text-center border border-dashed border-carbon/15 rounded-lg bg-carbon/[0.01]">
              <p className="text-xs text-carbon/40 mb-2">No hay cotizaciones para este prospecto.</p>
              <Link
                href={`/construccion?prospectoId=${prospecto.id}&crear=1`}
                className="inline-flex items-center gap-1 text-xs text-sauce hover:underline font-semibold"
              >
                Crear primera cotización →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {cotizaciones.map((c) => (
                <div key={c.id} className="p-3.5 rounded-xl border border-carbon/10 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col xs:flex-row xs:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/construccion/${c.id}`} className="font-mono font-bold text-sauce hover:underline">
                        {c.id}
                      </Link>
                      <span className="text-xs font-semibold text-carbon/60">
                        {c.servicioTipo === "impermeabilizacion" ? "Impermeabilización" :
                         c.servicioTipo === "pintura" ? "Pintura" :
                         c.servicioTipo === "losa" ? "Construcción de Losa" :
                         c.servicioTipo === "remodelacion" ? "Remodelación" : "Otro Servicio"}
                      </span>
                    </div>
                    <p className="text-xs text-carbon/40 mt-0.5">
                      Creada: {new Date(c.createdAt).toLocaleDateString("es-MX")}
                    </p>
                  </div>

                  <div className="flex items-center justify-between xs:justify-end gap-3 flex-wrap">
                    <div className="text-right font-mono">
                      <span className="block text-xs font-bold text-verde-profundo">
                        {c.precioFinal > 0 ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(c.precioFinal) : "—"}
                      </span>
                      <span className="text-[10px] text-carbon/40 uppercase tracking-wide">Precio Venta</span>
                    </div>
                    
                    <div className="flex flex-col items-end gap-1">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        c.estatus === "aceptada" ? "bg-green-100 text-green-700" :
                        c.estatus === "rechazada" ? "bg-red-100 text-red-700" :
                        c.estatus === "esperando_visita" ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {c.estatus.replace("_", " ")}
                      </span>

                      <div className="flex items-center gap-1.5 mt-0.5">
                        <BotonDuplicarCotizacion
                          cotizacionId={c.id}
                          prospectoId={prospecto.id}
                        />

                        {(c.estatus === "aprobada" || c.estatus === "enviada" || c.estatus === "aceptada") && (
                          <a
                            href={`/cotizacion/${c.token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] text-sauce hover:underline font-semibold flex items-center gap-0.5 animate-pulse"
                            title="Ver vista pública del cliente"
                          >
                            🔗 Portal
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
