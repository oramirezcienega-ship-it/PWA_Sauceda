import { Encabezado } from "@/components/Encabezado";
import { resumenOperacion, resumenAsesor } from "@/app/actions/reportes";
import { rolUsuarioActual, obtenerUsuarioActual } from "@/app/actions/usuarios";
import { formatoPesos } from "@/lib/formato";
import Link from "next/link";
import { BotonLlamar } from "@/components/BotonLlamar";
import { labelTipoNegocio } from "@/lib/types";
import { ProximasVisitasWidget } from "@/components/ProximasVisitasWidget";
import { ResumenKpisAsesor } from "@/components/ResumenKpisAsesor";
import { FiltrosDashboard } from "@/components/FiltrosDashboard";

export const dynamic = "force-dynamic";

/** Dashboard principal del sistema. Adaptativo según el rol (Admin u Asesor). */
export default async function PaginaDashboard({
  searchParams,
}: {
  searchParams: {
    rango?: string;
    desde?: string;
    hasta?: string;
  };
}) {
  const rol = await rolUsuarioActual();

  // Calcular limites de fecha a partir de los searchParams
  let fechaInicio: string | undefined = undefined;
  let fechaFin: string | undefined = undefined;

  const rango = searchParams.rango || "todos";

  if (rango !== "todos") {
    const ahora = new Date();
    if (rango === "hoy") {
      const hoyInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
      fechaInicio = hoyInicio.toISOString();
      const hoyFin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
      fechaFin = hoyFin.toISOString();
    } else if (rango === "7dias") {
      const hace7dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
      hace7dias.setHours(0, 0, 0, 0);
      fechaInicio = hace7dias.toISOString();
    } else if (rango === "mes") {
      const mesInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      fechaInicio = mesInicio.toISOString();
    } else if (rango === "anio") {
      const anioInicio = new Date(ahora.getFullYear(), 0, 1);
      fechaInicio = anioInicio.toISOString();
    } else if (rango === "personalizado") {
      if (searchParams.desde) {
        const d = new Date(searchParams.desde);
        d.setHours(0, 0, 0, 0);
        fechaInicio = d.toISOString();
      }
      if (searchParams.hasta) {
        const h = new Date(searchParams.hasta);
        h.setHours(23, 59, 59, 999);
        fechaFin = h.toISOString();
      }
    }
  }

  if (rol === "asesor" || rol === "operaciones") {
    const user = await obtenerUsuarioActual();
    const usuarioNombre = user?.nombre || (rol === "asesor" ? "Asesor" : "Operario");
    
    let r;
    try {
      r = await resumenAsesor(fechaInicio, fechaFin);
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
        <div className="mx-auto max-w-[1700px] px-4 pt-5">
          <div className="mb-4 flex flex-col gap-2">
            {/* Título y Botón en la misma fila */}
            <div className="flex items-center justify-between gap-3">
              <h1 className="font-titular text-xl sm:text-2xl font-bold text-verde-profundo">
                Panel de Control
              </h1>
              <Link
                href="/conversaciones"
                className="inline-flex items-center gap-1 rounded-md bg-verde-profundo px-3 py-1.5 text-xs font-bold text-crema shadow transition hover:bg-verde-profundo/90"
              >
                💬 Bandeja<span className="hidden sm:inline"> de Entrada</span>
              </Link>
            </div>

            {/* Mensaje de saludo optimizado */}
            <p className="text-xs text-carbon/50 leading-tight">
              Hola, <span className="font-semibold text-verde-profundo">{usuarioNombre}</span>. Aquí tienes tus tareas e indicadores.
            </p>
          </div>

          <FiltrosDashboard />

          {/* Tarjetas de Métricas (Colapsable en Móvil) */}
          <ResumenKpisAsesor
            totalLeads={r.totalLeads}
            tareasPendientes={r.tareasPendientes}
            tareasCompletadas={r.tareasCompletadas}
            cerrados={r.cerrados}
            tasaConversion={r.tasaConversion}
          />

          <div className="mt-4 sm:mt-6 space-y-4">
            {/* Widget de Próximas Visitas, Llamadas e Instalaciones */}
            <ProximasVisitasWidget />

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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[480px] overflow-y-auto pr-1 scrollbar-sutil">
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
    r = await resumenOperacion(fechaInicio, fechaFin);
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
  const maxTipoNegocio = Math.max(1, ...r.porTipoNegocio.map((t) => t.total));

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

        <FiltrosDashboard />

        {/* Tarjetas de métricas */}
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-4">
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

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
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

          {/* Tipo de negocio */}
          <div className="rounded-xl border border-carbon/10 bg-white p-5">
            <h2 className="mb-4 font-titular text-lg font-semibold text-verde-profundo">
              Tipo de negocio
            </h2>
            {r.porTipoNegocio.length === 0 ? (
              <p className="text-sm text-carbon/40">Sin datos de tipo de negocio.</p>
            ) : (
              <div className="space-y-2">
                {r.porTipoNegocio.map((t) => (
                  <Barra
                    key={t.tipoNegocio}
                    etiqueta={t.nombre}
                    total={t.total}
                    max={maxTipoNegocio}
                    color="bg-dorado"
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
    <div className="rounded-xl border border-carbon/10 bg-white p-2.5 sm:p-4 shadow-sm flex flex-col justify-between">
      <p className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-carbon/40 truncate" title={etiqueta}>
        {etiqueta}
      </p>
      <p
        className={`mt-0.5 font-mono text-base sm:text-2xl font-bold ${
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
