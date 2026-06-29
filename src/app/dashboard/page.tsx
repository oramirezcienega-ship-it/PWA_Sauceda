import { Encabezado } from "@/components/Encabezado";
import { resumenOperacion, resumenAsesor } from "@/app/actions/reportes";
import { rolUsuarioActual, obtenerUsuarioActual } from "@/app/actions/usuarios";
import { formatoPesos } from "@/lib/formato";
import Link from "next/link";
import { BotonLlamar } from "@/components/BotonLlamar";

export const dynamic = "force-dynamic";

/** Dashboard principal del sistema. Adaptativo según el rol (Admin u Asesor). */
export default async function PaginaDashboard() {
  const rol = await rolUsuarioActual();

  if (rol === "asesor") {
    const user = await obtenerUsuarioActual();
    const usuarioNombre = user?.nombre || "Asesor";
    
    let r;
    try {
      r = await resumenAsesor();
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error";
      return (
        <main className="min-h-screen pb-10 bg-crema/20">
          <Encabezado />
          <div className="mx-auto max-w-5xl px-4 pt-5">
            <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
              Mi Panel de Control
            </h1>
            <p className="mt-4 rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo">
              No se pudo cargar tu panel de control. {mensaje}
            </p>
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-screen pb-10 bg-crema/10">
        <Encabezado />
        <div className="mx-auto max-w-6xl px-4 pt-5">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
                Mi Panel de Control
              </h1>
              <p className="mt-1 text-sm text-carbon/60">
                Hola, <span className="font-medium text-verde-profundo">{usuarioNombre}</span>. Aquí tienes tus indicadores y tareas prioritarias.
              </p>
            </div>
            <div>
              <Link
                href="/conversaciones"
                className="inline-block rounded-md bg-verde-profundo px-4 py-2 text-sm font-medium text-crema shadow transition hover:bg-verde-profundo/90"
              >
                Bandeja de Entrada
              </Link>
            </div>
          </div>

          {/* Tarjetas de Métricas */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            <Metrica etiqueta="Leads Asignados" valor={String(r.totalLeads)} />
            <Metrica 
              etiqueta="Tareas Pendientes" 
              valor={String(r.tareasPendientes)} 
              resaltar={r.tareasPendientes > 0} 
            />
            <Metrica etiqueta="Tareas Completadas" valor={String(r.tareasCompletadas)} />
            <Metrica etiqueta="Expedientes Cerrados" valor={String(r.cerrados)} />
            <Metrica 
              etiqueta="Conversión" 
              valor={`${r.tasaConversion}%`} 
              resaltar 
            />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Sección de Leads Asignados */}
            <div className="lg:col-span-2 rounded-xl border border-carbon/10 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-titular text-lg font-semibold text-verde-profundo">
                  Mis Leads Asignados ({r.totalLeads})
                </h2>
                <span className="text-xs text-carbon/40">Listado interactivo</span>
              </div>

              {r.leadsAsignados.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-carbon/40">No tienes leads asignados actualmente.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-carbon/10 text-xs font-semibold uppercase tracking-wider text-carbon/40">
                        <th className="pb-3">Nombre / Contacto</th>
                        <th className="pb-3">Detalle Expediente</th>
                        <th className="pb-3">Calificación</th>
                        <th className="pb-3">Estatus</th>
                        <th className="pb-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-carbon/5 text-sm">
                      {r.leadsAsignados.map((l) => (
                        <tr key={l.id} className="hover:bg-carbon/[0.01] transition align-top">
                          <td className="py-4 font-medium text-carbon align-top">
                            <div>{l.nombre}</div>
                            {l.telefono && (
                              <div className="text-xs text-carbon/40 font-mono mt-0.5">{l.telefono}</div>
                            )}
                          </td>
                          <td className="py-4 text-xs align-top">
                            {l.expedienteId ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-verde-profundo">
                                  🏢 {l.fraccionamiento || "Sin fraccionamiento"}
                                </span>
                                {l.etapaExpediente && (
                                  <span className="inline-block text-[10px] text-[#3b667e] font-semibold bg-[#3b667e]/10 px-1.5 py-0.5 rounded self-start mt-0.5">
                                    {l.etapaExpediente}
                                  </span>
                                )}
                                {l.notasExpediente && (
                                  <span className="text-[10px] text-carbon/50 italic block max-w-[220px] whitespace-pre-wrap mt-0.5" title={l.notasExpediente}>
                                    {l.notasExpediente}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-carbon/30 italic">Sin expediente enlazado</span>
                            )}
                          </td>
                          <td className="py-4 align-top">
                            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                              l.calificacion === "caliente" ? "bg-rojoLuz text-rojo" :
                              l.calificacion === "templado" ? "bg-dorado/20 text-[#B8860B]" :
                              l.calificacion === "frio" ? "bg-carbon/5 text-carbon/60" :
                              "bg-carbon/10 text-carbon/40"
                            }`}>
                              {l.calificacion}
                            </span>
                          </td>
                          <td className="py-4 align-top">
                            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                              l.estatus === "cliente" ? "bg-verdeLuz text-verde-profundo" :
                              l.estatus === "expediente_abierto" ? "bg-cielo/15 text-[#3b667e]" :
                              l.estatus === "en_conversacion" ? "bg-amber-100 text-amber-800" :
                              l.estatus === "nuevo" ? "bg-verde-profundo/10 text-verde-profundo" :
                              "bg-carbon/10 text-carbon/50"
                            }`}>
                              {l.estatus.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-4 text-right align-top">
                            <div className="flex items-center justify-end gap-2 flex-wrap md:flex-nowrap">
                              {l.telefono ? (
                                <>
                                  <BotonLlamar
                                    telefono={l.telefono}
                                    prospectoId={l.id.startsWith("exp-") ? null : l.id}
                                  />
                                  <Link
                                    href={`/conversaciones?tel=${l.telefono}`}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-100 hover:text-green-800"
                                    title="WhatsApp Web CRM"
                                  >
                                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                    </svg>
                                    WhatsApp
                                  </Link>
                                </>
                              ) : (
                                <span className="text-xs text-carbon/30 italic">Sin número</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Sección de Tareas Pendientes */}
            <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-titular text-lg font-semibold text-verde-profundo">
                Tareas Pendientes ({r.tareasPendientes})
              </h2>

              {r.tareasPendientesLista.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-carbon/40">No tienes llamadas o tareas agendadas.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1 scrollbar-sutil">
                  {r.tareasPendientesLista.map((t) => (
                    <div key={t.id} className="rounded-lg border border-carbon/5 bg-carbon/[0.01] p-3 hover:border-sauce/30 transition">
                      <div className="flex items-start justify-between gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          t.tipo === "llamada" ? "bg-cielo/20 text-[#3b667e]" : "bg-dorado/20 text-[#B8860B]"
                        }`}>
                          {t.tipo}
                        </span>
                        <span className="text-[10px] text-carbon/40 font-mono">
                          {new Date(t.agendadaPara).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })} · {new Date(t.agendadaPara).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      
                      <p className="mt-2 text-sm font-semibold text-carbon">{t.leadNombre}</p>
                      <p className="text-xs text-carbon/50 font-mono">{t.leadTelefono}</p>
                      <p className="mt-2 text-xs text-carbon/70 bg-white border border-carbon/5 rounded p-2 italic leading-relaxed">
                        {t.contexto}
                      </p>

                      <div className="mt-3 flex justify-end">
                        <Link
                          href={`/conversaciones?tel=${t.leadTelefono}`}
                          className="rounded bg-sauce px-3 py-1.5 text-xs font-medium text-crema hover:bg-verde-profundo transition"
                        >
                          Atender Tarea
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Dashboard del Administrador (global)
  let r;
  try {
    r = await resumenOperacion();
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return (
      <main className="min-h-screen pb-10 bg-crema/10">
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
    <main className="min-h-screen pb-10 bg-crema/5">
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
    <div className="rounded-xl border border-carbon/10 bg-white p-4 shadow-sm">
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
