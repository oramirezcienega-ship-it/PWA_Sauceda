"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatoPesos } from "@/lib/formato";
import {
  enviarListaDemandasWhatsApp,
  type DemandaCompradorInventario,
} from "@/app/actions/asesoria-compra";
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

/** Texto para WhatsApp: solo datos de búsqueda, sin nombre ni teléfono del cliente. */
function armarTextoDemandas(demandas: DemandaCompradorInventario[]): string {
  const bloques = demandas.map((d) => {
    const lineas = [`*${d.folio}*`];
    lineas.push(`💰 Presupuesto: ${d.presupuestoTotal > 0 ? formatoPesos(d.presupuestoTotal) : "Por definir"}`);
    if (d.tipoCredito) lineas.push(`🏦 Crédito: ${d.tipoCredito.toUpperCase()}`);
    lineas.push(`📍 Zonas: ${d.zonas.length > 0 ? d.zonas.join(", ") : "Abierto"}`);
    if (d.recamarasMin) lineas.push(`🛏️ Recámaras: ${d.recamarasMin}+`);
    if (d.plazoMudanza) lineas.push(`⏱️ Plazo: ${ETIQUETAS_PLAZO[d.plazoMudanza] || d.plazoMudanza}`);
    return lineas.join("\n");
  });
  return [
    `🏠 *Compradores buscando casa — Sauceda* (${demandas.length})`,
    "Si tienes una opción que encaje, respóndenos con el folio.",
    ...bloques,
  ].join("\n\n");
}

function celdaCsv(valor: string): string {
  return /[",\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

function descargarCsvDemandas(demandas: DemandaCompradorInventario[]) {
  const encabezado = ["Folio", "Presupuesto", "Tipo de crédito", "Zonas de interés", "Recámaras", "Plazo"];
  const filas = demandas.map((d) => [
    d.folio,
    d.presupuestoTotal > 0 ? String(d.presupuestoTotal) : "",
    d.tipoCredito || "",
    d.zonas.join(", "),
    d.recamarasMin ? `${d.recamarasMin}+` : "",
    d.plazoMudanza ? ETIQUETAS_PLAZO[d.plazoMudanza] || d.plazoMudanza : "",
  ]);
  const csv = [encabezado, ...filas].map((f) => f.map(celdaCsv).join(",")).join("\r\n");
  // BOM para que Excel respete acentos
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `demandas-compradores-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const [compartirAbierto, setCompartirAbierto] = useState(false);
  const [textoCompartir, setTextoCompartir] = useState("");
  const [telefonoApi, setTelefonoApi] = useState("");
  const [avisoCompartir, setAvisoCompartir] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviandoApi, startEnvioApi] = useTransition();

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
            onClick={() => {
              setTextoCompartir(armarTextoDemandas(demandasFiltradas));
              setAvisoCompartir(null);
              setCompartirAbierto(true);
            }}
            disabled={cargando || demandasFiltradas.length === 0}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            title="Compartir o exportar la lista (respeta el filtro de búsqueda)"
          >
            📤 Compartir
          </button>

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

      {/* Modal de compartir / exportar la lista */}
      {compartirAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between border-b border-carbon/10 pb-3">
              <div>
                <h3 className="font-titular text-lg font-bold text-carbon">
                  Compartir {demandasFiltradas.length} demanda{demandasFiltradas.length === 1 ? "" : "s"}
                </h3>
                <p className="text-xs text-carbon/60">
                  Folio, presupuesto, crédito, zonas, recámaras y plazo. No incluye nombre ni teléfono del cliente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompartirAbierto(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-carbon/20 bg-white text-base font-bold text-carbon/70 hover:bg-carbon/5"
              >
                ✕
              </button>
            </div>

            <textarea
              value={textoCompartir}
              onChange={(e) => setTextoCompartir(e.target.value)}
              rows={12}
              className="w-full rounded-lg border border-carbon/20 bg-carbon/[0.02] p-2 font-mono text-[11px] text-carbon focus:border-sauce focus:outline-none"
            />

            {/* Línea principal: abre WhatsApp del usuario para elegir contacto o grupo */}
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(textoCompartir)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                title="Abre tu WhatsApp para elegir contacto o grupo"
              >
                📱 WhatsApp · Línea principal
              </a>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(textoCompartir);
                    setAvisoCompartir({ ok: true, texto: "Texto copiado al portapapeles." });
                  } catch {
                    setAvisoCompartir({ ok: false, texto: "No se pudo copiar; selecciona el texto manualmente." });
                  }
                }}
                className="rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs font-semibold text-carbon/80 hover:bg-carbon/5"
              >
                📋 Copiar
              </button>
              <button
                type="button"
                onClick={() => descargarCsvDemandas(demandasFiltradas)}
                className="rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs font-semibold text-carbon/80 hover:bg-carbon/5"
              >
                📊 Exportar CSV (Excel)
              </button>
            </div>

            {/* Línea API: envío directo desde el número de Meta */}
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
              <div className="text-xs font-bold text-sky-900">🤖 Enviar por Línea API (Meta)</div>
              <p className="mb-2 text-[10px] text-sky-900/70">
                Meta solo entrega texto libre si el destinatario escribió a la línea en las últimas 24 h.
              </p>
              <div className="flex gap-2">
                <input
                  type="tel"
                  placeholder="Teléfono a 10 dígitos"
                  value={telefonoApi}
                  onChange={(e) => setTelefonoApi(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-carbon/20 bg-white px-3 py-1 text-xs text-carbon focus:border-sauce focus:outline-none"
                />
                <button
                  type="button"
                  disabled={enviandoApi || telefonoApi.replace(/\D/g, "").length < 10}
                  onClick={() =>
                    startEnvioApi(async () => {
                      const res = await enviarListaDemandasWhatsApp(telefonoApi, textoCompartir);
                      setAvisoCompartir(
                        res.ok
                          ? { ok: true, texto: "Lista enviada por la línea API." }
                          : { ok: false, texto: res.mensaje || "No se pudo enviar." },
                      );
                    })
                  }
                  className="whitespace-nowrap rounded-lg bg-sky-600 px-3 py-1 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {enviandoApi ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </div>

            {avisoCompartir && (
              <div
                className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                  avisoCompartir.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
                }`}
              >
                {avisoCompartir.texto}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
