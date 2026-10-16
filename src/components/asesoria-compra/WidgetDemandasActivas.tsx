"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatoPesos } from "@/lib/formato";
import type { DemandaCompradorInventario } from "@/app/actions/asesoria-compra";
import { PanelBusquedaAliados } from "@/components/aliados/PanelBusquedaAliados";

interface Props {
  demandas: DemandaCompradorInventario[];
  cargando: boolean;
  demandaSeleccionada: DemandaCompradorInventario | null;
  onSeleccionarDemanda: (demanda: DemandaCompradorInventario | null) => void;
  onRecargar: () => void;
}

const ETIQUETAS_PLAZO: Record<string, string> = {
  inmediato: "Inmediato",
  "1_3_meses": "1-3 meses",
  "3_6_meses": "3-6 meses",
  mas_6_meses: "+6 meses",
};

export function WidgetDemandasActivas({
  demandas,
  cargando,
  demandaSeleccionada,
  onSeleccionarDemanda,
  onRecargar,
}: Props) {
  const [colapsado, setColapsado] = useState(false);
  const [busquedaTexto, setBusquedaTexto] = useState("");
  const [demandaParaAliados, setDemandaParaAliados] = useState<DemandaCompradorInventario | null>(null);

  const demandasFiltradas = useMemo(() => {
    if (!busquedaTexto.trim()) return demandas;
    const q = busquedaTexto.toLowerCase();
    return demandas.filter(
      (d) =>
        d.clienteNombre.toLowerCase().includes(q) ||
        d.folio.toLowerCase().includes(q) ||
        d.zonas.some((z) => z.toLowerCase().includes(q)) ||
        (d.tipoCredito && d.tipoCredito.toLowerCase().includes(q)),
    );
  }, [demandas, busquedaTexto]);

  return (
    <section className="mb-6 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/70 via-white to-amber-50/40 p-4 shadow-sm transition-all duration-200">
      {/* Header del Widget */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
            🎯
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-titular text-base font-bold text-carbon">
                Demandas Activas de Compradores
              </h2>
              <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">
                {demandas.length} cliente{demandas.length === 1 ? "" : "s"} buscando
              </span>
              {demandaSeleccionada && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sauce/15 px-2 py-0.5 text-[11px] font-semibold text-verde-profundo">
                  <span className="h-1.5 w-1.5 rounded-full bg-sauce animate-pulse" />
                  Filtrando: {demandaSeleccionada.clienteNombre}
                </span>
              )}
            </div>
            <p className="text-[11px] text-carbon/60">
              Haz clic en cualquier comprador para cruzar su presupuesto y zonas contra el inventario, o solicita opciones a aliados.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {demandaSeleccionada && (
            <button
              type="button"
              onClick={() => onSeleccionarDemanda(null)}
              className="rounded-lg border border-carbon/20 bg-white px-2.5 py-1 text-xs font-semibold text-carbon/80 hover:bg-carbon/5"
            >
              ✕ Limpiar filtro
            </button>
          )}

          <button
            type="button"
            onClick={onRecargar}
            disabled={cargando}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-carbon/15 bg-white text-xs text-carbon/70 hover:bg-carbon/5 disabled:opacity-50"
            title="Recargar demandas"
          >
            🔄
          </button>

          <button
            type="button"
            onClick={() => setColapsado((v) => !v)}
            className="rounded-lg border border-carbon/15 bg-white px-2.5 py-1 text-xs font-semibold text-carbon/70 hover:bg-carbon/5"
          >
            {colapsado ? `▲ Ver ${demandas.length} compradores` : "▼ Ocultar"}
          </button>
        </div>
      </div>

      {/* Contenido expandido */}
      {!colapsado && (
        <div className="mt-4 space-y-3">
          {/* Mini barra de búsqueda de clientes */}
          {demandas.length > 3 && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="🔍 Filtrar por nombre, zona o folio..."
                value={busquedaTexto}
                onChange={(e) => setBusquedaTexto(e.target.value)}
                className="max-w-xs rounded-lg border border-carbon/20 bg-white px-3 py-1 text-xs text-carbon focus:border-sauce focus:outline-none"
              />
              {busquedaTexto && (
                <button
                  type="button"
                  onClick={() => setBusquedaTexto("")}
                  className="text-xs text-carbon/50 hover:text-carbon"
                >
                  Limpiar búsqueda
                </button>
              )}
            </div>
          )}

          {/* Grid / Carrusel de Tarjetas de Compradores */}
          {cargando ? (
            <div className="flex items-center justify-center py-8 text-xs text-carbon/50">
              <span className="animate-pulse">Cargando demandas de compradores...</span>
            </div>
          ) : demandasFiltradas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-carbon/20 bg-white/70 py-6 text-center text-xs text-carbon/50">
              No se encontraron compradores activos con los criterios buscados.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {demandasFiltradas.map((d) => {
                const esActivo = demandaSeleccionada?.ordenTrabajoId === d.ordenTrabajoId;
                const primerInicial = (d.clienteNombre || "C").trim().charAt(0).toUpperCase();

                return (
                  <div
                    key={d.ordenTrabajoId}
                    className={`relative flex flex-col justify-between rounded-xl border p-3.5 transition-all duration-200 ${
                      esActivo
                        ? "border-sauce bg-sauce/10 shadow-md ring-2 ring-sauce/30"
                        : "border-carbon/10 bg-white hover:border-sauce/40 hover:shadow-sm"
                    }`}
                  >
                    {/* Indicador de filtro activo en la tarjeta */}
                    {esActivo && (
                      <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-sauce text-[10px] font-bold text-crema shadow">
                        ✓
                      </span>
                    )}

                    <div>
                      {/* Cabecera de la tarjeta: Nombre + Folio */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 font-titular text-xs font-bold text-violet-900">
                            {primerInicial}
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-xs font-bold text-carbon" title={d.clienteNombre}>
                              {d.clienteNombre}
                            </h3>
                            <span className="font-mono text-[10px] text-carbon/50">{d.folio}</span>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                            d.etapaActual?.includes("Apto")
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {d.etapaActual || "En curso"}
                        </span>
                      </div>

                      {/* Presupuesto y Capacidad de Compra */}
                      <div className="mt-2.5 rounded-lg bg-carbon/5 p-2">
                        <div className="text-[10px] uppercase font-bold tracking-wider text-carbon/50">
                          Presupuesto Estimado
                        </div>
                        <div className="font-titular text-base font-extrabold text-sauce">
                          {d.presupuestoTotal > 0 ? formatoPesos(d.presupuestoTotal) : "Por definir"}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-carbon/70">
                          {d.montoCredito ? (
                            <span>Crédito: {formatoPesos(d.montoCredito)}</span>
                          ) : null}
                          {d.montoAhorro ? (
                            <span>Ahorro: {formatoPesos(d.montoAhorro)}</span>
                          ) : null}
                          {d.tipoCredito && (
                            <span className="rounded bg-carbon/10 px-1 py-0.2 text-[9px] uppercase font-bold">
                              {d.tipoCredito}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Zonas deseadas */}
                      <div className="mt-2">
                        <div className="text-[10px] font-bold text-carbon/50 uppercase">Zonas de interés</div>
                        {d.zonas.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {d.zonas.slice(0, 3).map((z, idx) => (
                              <span
                                key={idx}
                                className="inline-block rounded-md bg-violet-100/70 px-1.5 py-0.5 text-[10px] font-medium text-violet-900"
                              >
                                📍 {z}
                              </span>
                            ))}
                            {d.zonas.length > 3 && (
                              <span className="inline-block rounded-md bg-carbon/10 px-1.5 py-0.5 text-[10px] text-carbon/60">
                                +{d.zonas.length - 3} más
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="mt-0.5 text-[10px] italic text-carbon/40">Sin zona específica registrada</p>
                        )}
                      </div>

                      {/* Requisitos adicionales */}
                      {(d.recamarasMin || d.plazoMudanza) && (
                        <div className="mt-2 flex items-center gap-2 text-[10px] text-carbon/60">
                          {d.recamarasMin && <span>🛏️ {d.recamarasMin}+ rec.</span>}
                          {d.plazoMudanza && <span>⏱️ {ETIQUETAS_PLAZO[d.plazoMudanza] || d.plazoMudanza}</span>}
                        </div>
                      )}

                      {/* Estado del cruce e inventario */}
                      <div className="mt-2.5 flex items-center justify-between border-t border-carbon/10 pt-2 text-[10px]">
                        <span
                          className={`font-semibold ${
                            d.coincidenciasInventario > 0 ? "text-emerald-700" : "text-carbon/40"
                          }`}
                        >
                          {d.coincidenciasInventario > 0
                            ? `🟢 ${d.coincidenciasInventario} en catálogo`
                            : "⚪ 0 en catálogo"}
                        </span>

                        <span className="text-carbon/60">
                          {d.solicitudesAliados > 0
                            ? `🤝 ${d.solicitudesAliados} aliado${d.solicitudesAliados === 1 ? "" : "s"}`
                            : "🤝 Sin aliados"}
                        </span>
                      </div>
                    </div>

                    {/* Acciones de la Tarjeta */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-carbon/10 pt-2.5">
                      <button
                        type="button"
                        onClick={() => onSeleccionarDemanda(esActivo ? null : d)}
                        className={`flex-1 rounded-lg px-2 py-1.5 text-center text-xs font-bold transition-colors ${
                          esActivo
                            ? "bg-sauce text-crema hover:bg-verde-profundo"
                            : "border border-sauce/30 bg-sauce/10 text-verde-profundo hover:bg-sauce hover:text-crema"
                        }`}
                      >
                        {esActivo ? "✓ Quitar filtro" : "🔍 Filtrar"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setDemandaParaAliados(d)}
                        title="Solicitar opciones a aliados inmobiliarios"
                        className="rounded-lg border border-orange-300 bg-orange-50 px-2 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                      >
                        🤝 Aliados
                      </button>

                      {d.expedienteId && (
                        <Link
                          href={`/expediente/${d.expedienteId}`}
                          title="Abrir expediente completo"
                          className="rounded-lg border border-carbon/20 bg-white px-2 py-1.5 text-xs text-carbon/70 hover:bg-carbon/5"
                        >
                          📁
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal de Lanzar Búsqueda a Aliados */}
      {demandaParaAliados && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between border-b border-carbon/10 pb-3">
              <div>
                <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">
                  Red de Aliados Inmobiliarios
                </span>
                <h3 className="mt-1 font-titular text-lg font-bold text-carbon">
                  Solicitar Búsqueda para {demandaParaAliados.clienteNombre}
                </h3>
                <p className="text-xs text-carbon/60">
                  Folio: {demandaParaAliados.folio} · Presupuesto:{" "}
                  {demandaParaAliados.presupuestoTotal > 0
                    ? formatoPesos(demandaParaAliados.presupuestoTotal)
                    : "No fijado"}{" "}
                  · Zonas: {demandaParaAliados.zonas.join(", ") || "General"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDemandaParaAliados(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-carbon/20 bg-white text-base font-bold text-carbon/70 hover:bg-carbon/5"
              >
                ✕
              </button>
            </div>

            <PanelBusquedaAliados ordenTrabajoId={demandaParaAliados.ordenTrabajoId} />
          </div>
        </div>
      )}
    </section>
  );
}
