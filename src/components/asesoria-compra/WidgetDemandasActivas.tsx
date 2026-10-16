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

          {/* Tabla de compradores: una fila por demanda, un dato por columna */}
          {cargando ? (
            <div className="flex items-center justify-center py-8 text-xs text-carbon/50">
              <span className="animate-pulse">Cargando demandas de compradores...</span>
            </div>
          ) : demandasFiltradas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-carbon/20 bg-white/70 py-6 text-center text-xs text-carbon/50">
              No se encontraron compradores activos con los criterios buscados.
            </div>
          ) : (
            <div className="max-w-full overflow-x-auto rounded-xl border border-carbon/10 bg-white">
              <table className="w-full min-w-[1040px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-carbon/10 bg-carbon/5 text-[10px] font-bold uppercase tracking-wider text-carbon/50">
                    <th className="px-3 py-2">Comprador</th>
                    <th className="px-3 py-2">Estatus</th>
                    <th className="px-3 py-2">Presupuesto</th>
                    <th className="px-3 py-2">Zonas de interés</th>
                    <th className="px-3 py-2 text-center">Recámaras</th>
                    <th className="px-3 py-2">Plazo</th>
                    <th className="px-3 py-2 text-center">En catálogo</th>
                    <th className="px-3 py-2 text-center">Aliados</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {demandasFiltradas.map((d) => {
                    const esActivo = demandaSeleccionada?.ordenTrabajoId === d.ordenTrabajoId;
                    const primerInicial = (d.clienteNombre || "C").trim().charAt(0).toUpperCase();

                    return (
                      <tr
                        key={d.ordenTrabajoId}
                        onClick={() => onSeleccionarDemanda(esActivo ? null : d)}
                        title="Cruzar presupuesto y zonas contra el inventario"
                        className={`cursor-pointer border-b border-carbon/10 align-middle transition-colors last:border-b-0 ${
                          esActivo ? "bg-sauce/10 ring-2 ring-inset ring-sauce/30" : "hover:bg-violet-50/60"
                        }`}
                      >
                        {/* Comprador: avatar + nombre + folio */}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-titular text-xs font-bold ${
                                esActivo ? "bg-sauce text-crema" : "bg-violet-100 text-violet-900"
                              }`}
                            >
                              {esActivo ? "✓" : primerInicial}
                            </div>
                            <div className="min-w-0">
                              <div className="max-w-[180px] truncate font-bold text-carbon" title={d.clienteNombre}>
                                {d.clienteNombre}
                              </div>
                              <span className="font-mono text-[10px] text-carbon/50">{d.folio}</span>
                            </div>
                          </div>
                        </td>

                        {/* Estatus */}
                        <td className="px-3 py-2">
                          <span
                            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              d.etapaActual?.includes("Apto")
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {d.etapaActual || "En curso"}
                          </span>
                        </td>

                        {/* Presupuesto y capacidad de compra */}
                        <td className="px-3 py-2">
                          <div className="whitespace-nowrap font-titular text-sm font-extrabold text-sauce">
                            {d.presupuestoTotal > 0 ? formatoPesos(d.presupuestoTotal) : "Por definir"}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-carbon/70">
                            {d.montoCredito ? (
                              <span className="whitespace-nowrap">Crédito: {formatoPesos(d.montoCredito)}</span>
                            ) : null}
                            {d.montoAhorro ? (
                              <span className="whitespace-nowrap">Ahorro: {formatoPesos(d.montoAhorro)}</span>
                            ) : null}
                            {d.tipoCredito && (
                              <span className="rounded bg-carbon/10 px-1 text-[9px] font-bold uppercase">
                                {d.tipoCredito}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Zonas deseadas */}
                        <td className="px-3 py-2">
                          {d.zonas.length > 0 ? (
                            <div className="flex max-w-[260px] flex-wrap gap-1">
                              {d.zonas.slice(0, 3).map((z, idx) => (
                                <span
                                  key={idx}
                                  className="inline-block rounded-md bg-violet-100/70 px-1.5 py-0.5 text-[10px] font-medium text-violet-900"
                                >
                                  📍 {z}
                                </span>
                              ))}
                              {d.zonas.length > 3 && (
                                <span
                                  className="inline-block rounded-md bg-carbon/10 px-1.5 py-0.5 text-[10px] text-carbon/60"
                                  title={d.zonas.slice(3).join(", ")}
                                >
                                  +{d.zonas.length - 3} más
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] italic text-carbon/40">Sin zona registrada</span>
                          )}
                        </td>

                        {/* Recámaras */}
                        <td className="px-3 py-2 text-center whitespace-nowrap text-carbon/70">
                          {d.recamarasMin ? `${d.recamarasMin}+` : <span className="text-carbon/30">—</span>}
                        </td>

                        {/* Plazo */}
                        <td className="px-3 py-2 whitespace-nowrap text-carbon/70">
                          {d.plazoMudanza ? (
                            ETIQUETAS_PLAZO[d.plazoMudanza] || d.plazoMudanza
                          ) : (
                            <span className="text-carbon/30">—</span>
                          )}
                        </td>

                        {/* Coincidencias en catálogo */}
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              d.coincidenciasInventario > 0 ? "text-emerald-700" : "text-carbon/40"
                            }`}
                          >
                            {d.coincidenciasInventario > 0 ? `🟢 ${d.coincidenciasInventario}` : "⚪ 0"}
                          </span>
                        </td>

                        {/* Solicitudes a aliados */}
                        <td className="px-3 py-2 text-center whitespace-nowrap text-carbon/60">
                          {d.solicitudesAliados > 0 ? `🤝 ${d.solicitudesAliados}` : "Sin aliados"}
                        </td>

                        {/* Acciones */}
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => onSeleccionarDemanda(esActivo ? null : d)}
                              className={`whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold transition-colors ${
                                esActivo
                                  ? "bg-sauce text-crema hover:bg-verde-profundo"
                                  : "border border-sauce/30 bg-sauce/10 text-verde-profundo hover:bg-sauce hover:text-crema"
                              }`}
                            >
                              {esActivo ? "✓ Quitar" : "🔍 Filtrar"}
                            </button>

                            <button
                              type="button"
                              onClick={() => setDemandaParaAliados(d)}
                              title="Solicitar opciones a aliados inmobiliarios"
                              className="whitespace-nowrap rounded-lg border border-orange-300 bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                            >
                              🤝 Aliados
                            </button>

                            {d.expedienteId ? (
                              <Link
                                href={`/expediente/${d.expedienteId}`}
                                title="Abrir expediente completo"
                                className="rounded-lg border border-carbon/20 bg-white px-2 py-1 text-xs text-carbon/70 hover:bg-carbon/5"
                              >
                                📁
                              </Link>
                            ) : (
                              <span className="w-[30px]" />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
