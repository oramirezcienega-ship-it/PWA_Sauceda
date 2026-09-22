"use client";

import React, { useState, useMemo } from "react";
import type { Cotizacion, CotizacionModularData, VisitaReporte, OpcionesSeleccionadasModular } from "@/lib/types";
import { PLANTILLA_PERGOLA_AZOTEA_3X3, recalcularCotizacionModular } from "@/lib/plantillasModulares";
import { guardarDatosModulares } from "@/app/actions/cotizaciones";

interface ModalEditorCotizacionModularProps {
  abierto: boolean;
  onCerrar: () => void;
  cotizacion: Cotizacion;
  reporteVisita?: VisitaReporte | null;
  onGuardado: (nuevosDatos: CotizacionModularData, seleccionActualizada?: OpcionesSeleccionadasModular, nuevoPrecio?: number) => void;
}

export function ModalEditorCotizacionModular({
  abierto,
  onCerrar,
  cotizacion,
  reporteVisita,
  onGuardado,
}: ModalEditorCotizacionModularProps) {
  const datosIniciales: CotizacionModularData =
    cotizacion.datosModulares || PLANTILLA_PERGOLA_AZOTEA_3X3;

  const [seccion, setSeccion] = useState<"armar" | "dimensiones" | "costos_m2" | "condiciones">("armar");
  const [datos, setDatos] = useState<CotizacionModularData>(JSON.parse(JSON.stringify(datosIniciales)));
  
  // Selección de opciones activas (para el selector visual del ejecutivo)
  const [opcionesElegidas, setOpcionesElegidas] = useState<Record<string, string>>(() => {
    if (cotizacion.opcionesSeleccionadas?.opciones) {
      return { ...cotizacion.opcionesSeleccionadas.opciones };
    }
    // Valores recomendados o por defecto
    const iniciales: Record<string, string> = {};
    (datos.gruposOpciones || []).forEach((g) => {
      const recomendada = g.opciones.find((o) => o.recomendado) || g.opciones[0];
      if (recomendada) iniciales[g.id] = recomendada.id;
    });
    return iniciales;
  });

  const [complementosElegidos, setComplementosElegidos] = useState<string[]>(
    cotizacion.opcionesSeleccionadas?.complementos || []
  );

  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error" | ""; texto: string }>({ tipo: "", texto: "" });

  // Dimensiones actuales
  const largoActual = Number(datos.dimensiones?.largoM || 3.0);
  const anchoActual = Number(datos.dimensiones?.anchoM || 3.0);
  const superficieActual = Number(datos.dimensiones?.superficieM2 || (largoActual * anchoActual).toFixed(2)) || 9.0;

  // Cálculo en tiempo real del resumen
  const desgloseEnVivo = useMemo(() => {
    const base = Number(datos.estructuraBase?.precio || 0);
    let opcionesTotal = 0;
    const itemsOpciones: { grupo: string; nombre: string; precio: number; precioM2?: number }[] = [];

    (datos.gruposOpciones || []).forEach((grupo) => {
      const opcId = opcionesElegidas[grupo.id];
      const opc = grupo.opciones.find((o) => o.id === opcId);
      if (opc) {
        opcionesTotal += Number(opc.precio || 0);
        itemsOpciones.push({
          grupo: grupo.titulo,
          nombre: opc.nombre,
          precio: Number(opc.precio || 0),
          precioM2: opc.precioPorM2,
        });
      }
    });

    let complementosTotal = 0;
    const itemsComplementos: { nombre: string; precio: number }[] = [];
    (datos.complementos || []).forEach((comp) => {
      if (complementosElegidos.includes(comp.id)) {
        complementosTotal += Number(comp.precio || 0);
        itemsComplementos.push({
          nombre: comp.nombre,
          precio: Number(comp.precio || 0),
        });
      }
    });

    const totalSinIva = base + opcionesTotal + complementosTotal;
    const precioM2 = superficieActual > 0 ? Math.round(totalSinIva / superficieActual) : 0;

    return {
      base,
      opcionesTotal,
      complementosTotal,
      totalSinIva,
      precioM2,
      itemsOpciones,
      itemsComplementos,
    };
  }, [datos, opcionesElegidas, complementosElegidos, superficieActual]);

  if (!abierto) return null;

  const formatMoneda = (val: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(val);

  // Recalcular dimensiones
  const handleCambiarDimensiones = (nuevoLargo: number, nuevoAncho: number) => {
    const recalculado = recalcularCotizacionModular(datos, nuevoLargo, nuevoAncho);
    setDatos(recalculado);
  };

  // Sincronizar desde la Visita Técnica
  const handleSincronizarVisita = () => {
    if (!reporteVisita?.medidas?.largo || !reporteVisita?.medidas?.ancho) return;
    const l = Number(reporteVisita.medidas.largo);
    const a = Number(reporteVisita.medidas.ancho);
    if (l > 0 && a > 0) {
      handleCambiarDimensiones(l, a);
      setMensaje({
        tipo: "ok",
        texto: `Medidas sincronizadas desde el reporte de visita técnica: ${l} m × ${a} m (${(l * a).toFixed(2)} m²). Precios recalculados.`,
      });
    }
  };

  // Toggle complementos
  const handleToggleComplemento = (id: string) => {
    setComplementosElegidos((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Guardar en Base de Datos
  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGuardando(true);
      setMensaje({ tipo: "", texto: "" });

      const seleccionAGuardar: OpcionesSeleccionadasModular = {
        opciones: opcionesElegidas,
        complementos: complementosElegidos,
        incluirIva: cotizacion.opcionesSeleccionadas?.incluirIva || false,
      };

      const res = await guardarDatosModulares({
        cotizacionId: cotizacion.id,
        datosModulares: datos,
        opcionesSeleccionadas: seleccionAGuardar,
        precioFinal: desgloseEnVivo.totalSinIva,
      });

      if (!res.ok) {
        setMensaje({
          tipo: "error",
          texto: res.error || "Error al guardar los cambios en la cotización dinámica.",
        });
        return;
      }

      setMensaje({
        tipo: "ok",
        texto: "¡Cotización dinámica y selección de opciones guardadas exitosamente!",
      });

      onGuardado(datos, seleccionAGuardar, desgloseEnVivo.totalSinIva);

      setTimeout(() => {
        onCerrar();
      }, 700);
    } catch (err: any) {
      setMensaje({
        tipo: "error",
        texto: err?.message || "Ocurrió un error inesperado al guardar.",
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/50 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-5xl max-h-[94vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-carbon/10 overflow-hidden font-cuerpo my-auto">
        {/* Encabezado Principal */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b bg-gradient-to-r from-[#1E3A2F] to-[#2D5A46] text-white">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📐</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono bg-white/20 px-2 py-0.5 rounded font-bold uppercase text-emerald-200">
                  Configurador Paramétrico
                </span>
                <span className="text-xs font-mono font-bold text-amber-300">{cotizacion.id}</span>
              </div>
              <h3 className="font-titular text-base font-bold text-white leading-tight mt-0.5">
                {datos.titulo || "Cotización Modular Dinámica"}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="text-white/70 hover:text-white text-xl font-bold p-1 rounded-lg transition"
          >
            ✕
          </button>
        </div>

        {/* Pestañas de Navegación */}
        <div className="flex border-b bg-slate-50 px-6 gap-2 pt-2 text-xs font-titular overflow-x-auto">
          {[
            { id: "armar", etiqueta: "⚡ Armar Paquete & Resumen", icono: "🎛️" },
            { id: "dimensiones", etiqueta: "📐 Dimensiones & Levantamiento", icono: "📏" },
            { id: "costos_m2", etiqueta: "🏷️ Costos Unitarios / m²", icono: "🧱" },
            { id: "condiciones", etiqueta: "⚖️ Condiciones Comerciales", icono: "📄" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSeccion(tab.id as any)}
              className={`pb-2.5 px-3.5 font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-1.5 ${
                seccion === tab.id
                  ? "border-[#1E3A2F] text-[#1E3A2F] font-bold bg-white rounded-t-lg shadow-2xs"
                  : "border-transparent text-carbon/60 hover:text-carbon"
              }`}
            >
              <span>{tab.icono}</span>
              <span>{tab.etiqueta}</span>
            </button>
          ))}
        </div>

        {/* Contenedor con Scroll */}
        <form onSubmit={handleGuardar} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* ========================================================================= */}
          {/* PESTAÑA 1: ARMAR PAQUETE INTERACTIVO & TOTAL EN VIVO (VISTA DEL EJECUTIVO) */}
          {/* ========================================================================= */}
          {seccion === "armar" && (
            <div className="space-y-6">
              {/* Barra rápida de Dimensiones */}
              <div className="bg-emerald-50/50 border border-emerald-900/15 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📏</span>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Dimensiones de Proyecto</span>
                    <div className="font-mono text-base font-bold text-[#1E3A2F]">
                      {largoActual.toFixed(2)} m × {anchoActual.toFixed(2)} m ={" "}
                      <span className="text-emerald-700 bg-white px-2 py-0.5 rounded-lg border border-emerald-200">
                        {superficieActual.toFixed(2)} m²
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {reporteVisita?.medidas?.largo && reporteVisita?.medidas?.ancho && (
                    <button
                      type="button"
                      onClick={handleSincronizarVisita}
                      className="rounded-lg bg-white border border-emerald-300 hover:bg-emerald-100/50 text-[#1E3A2F] text-xs font-bold px-3 py-1.5 transition flex items-center gap-1.5 shadow-2xs"
                      title="Importar medidas de la visita técnica"
                    >
                      <span>📥</span>
                      <span>Sincronizar Visita ({reporteVisita.medidas.largo}×{reporteVisita.medidas.ancho}m)</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSeccion("dimensiones")}
                    className="rounded-lg bg-[#1E3A2F] hover:bg-[#1E3A2F]/90 text-white text-xs font-semibold px-3 py-1.5 transition flex items-center gap-1"
                  >
                    <span>✏️ Cambiar Medidas</span>
                  </button>
                </div>
              </div>

              {/* Selector Visual de Cubiertas y Plafones */}
              {(datos.gruposOpciones || []).map((grupo) => (
                <div key={grupo.id} className="space-y-2.5">
                  <div className="flex items-center justify-between border-b pb-1.5">
                    <h4 className="font-titular text-sm font-bold text-slate-800 flex items-center gap-2">
                      <span>{grupo.id === "cubierta" ? "☀️" : "🛋️"}</span>
                      <span>{grupo.titulo}</span>
                    </h4>
                    <span className="text-[11px] text-slate-500">Selecciona el acabado deseado</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {grupo.opciones.map((opc) => {
                      const seleccionada = opcionesElegidas[grupo.id] === opc.id;
                      return (
                        <div
                          key={opc.id}
                          onClick={() => setOpcionesElegidas((prev) => ({ ...prev, [grupo.id]: opc.id }))}
                          className={`p-3.5 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between relative ${
                            seleccionada
                              ? "border-[#1E3A2F] bg-emerald-50/40 shadow-xs ring-1 ring-[#1E3A2F]/20"
                              : "border-slate-200 hover:border-slate-300 bg-white"
                          }`}
                        >
                          {opc.recomendado && (
                            <span className="absolute -top-2 right-3 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                              ★ Recomendado
                            </span>
                          )}

                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-800">{opc.nombre}</span>
                              <input
                                type="radio"
                                name={`grupo_${grupo.id}`}
                                checked={seleccionada}
                                onChange={() => {}}
                                className="text-[#1E3A2F] focus:ring-[#1E3A2F] h-4 w-4"
                              />
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                              {opc.descripcion || "Acabado estándar."}
                            </p>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-100 flex items-baseline justify-between">
                            <span className="font-mono text-sm font-bold text-[#1E3A2F]">
                              {opc.precio > 0 ? formatMoneda(opc.precio) : "Incluido ($0)"}
                            </span>
                            {opc.precioPorM2 && opc.precioPorM2 > 0 && (
                              <span className="text-[10px] font-mono text-slate-400">
                                (${Math.round(opc.precioPorM2)}/m²)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Selector de Complementos Opcionales */}
              {datos.complementos && datos.complementos.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between border-b pb-1.5">
                    <h4 className="font-titular text-sm font-bold text-slate-800 flex items-center gap-2">
                      <span>✨</span>
                      <span>Complementos Adicionales</span>
                    </h4>
                    <span className="text-[11px] text-slate-500">Marca los complementos a incluir en la propuesta</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {datos.complementos.map((comp) => {
                      const activo = complementosElegidos.includes(comp.id);
                      return (
                        <label
                          key={comp.id}
                          className={`p-3.5 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between ${
                            activo
                              ? "border-[#1E3A2F] bg-emerald-50/40 shadow-xs"
                              : "border-slate-200 hover:border-slate-300 bg-white"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-800">{comp.nombre}</span>
                              <input
                                type="checkbox"
                                checked={activo}
                                onChange={() => handleToggleComplemento(comp.id)}
                                className="text-[#1E3A2F] focus:ring-[#1E3A2F] h-4 w-4 rounded"
                              />
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                              {comp.descripcion}
                            </p>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between font-mono text-xs font-bold text-[#1E3A2F]">
                            <span>{formatMoneda(comp.precio)}</span>
                            <span className="text-[10px] text-slate-400 font-sans font-normal">
                              {activo ? "✓ Incluido" : "+ Agregar"}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TARJETA DE RESUMEN EN VIVO */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 rounded-2xl shadow-lg space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💰</span>
                    <span className="font-titular text-sm font-bold text-amber-300 uppercase tracking-wider">
                      Resumen Financiero del Paquete ({superficieActual.toFixed(2)} m²)
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-300 uppercase block">Costo promedio</span>
                    <span className="font-mono text-xs font-bold text-emerald-400">
                      {formatMoneda(desgloseEnVivo.precioM2)} / m²
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-slate-400 block uppercase">1. Estructura Base:</span>
                    <span className="font-mono text-sm font-bold text-white mt-0.5 block">
                      {formatMoneda(desgloseEnVivo.base)}
                    </span>
                  </div>
                  <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-slate-400 block uppercase">2. Cubiertas & Plafón:</span>
                    <span className="font-mono text-sm font-bold text-white mt-0.5 block">
                      {formatMoneda(desgloseEnVivo.opcionesTotal)}
                    </span>
                  </div>
                  <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-slate-400 block uppercase">3. Complementos:</span>
                    <span className="font-mono text-sm font-bold text-white mt-0.5 block">
                      {formatMoneda(desgloseEnVivo.complementosTotal)}
                    </span>
                  </div>
                  <div className="bg-emerald-500/20 p-2.5 rounded-xl border border-emerald-400/30 text-right">
                    <span className="text-[10px] text-emerald-300 block uppercase font-bold">TOTAL PROPUESTA:</span>
                    <span className="font-mono text-base font-extrabold text-amber-300 mt-0.5 block">
                      {formatMoneda(desgloseEnVivo.totalSinIva)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PESTAÑA 2: DIMENSIONES & LEVANTAMIENTO */}
          {/* ========================================================================= */}
          {seccion === "dimensiones" && (
            <div className="space-y-6">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-titular text-sm font-bold text-slate-800">
                      Dimensiones del Proyecto (Metros Lineales y Superficie)
                    </h4>
                    <p className="text-xs text-slate-500">
                      Al cambiar el largo o ancho, se recalculan automáticamente la superficie y los costos por m².
                    </p>
                  </div>
                  {reporteVisita?.medidas?.largo && reporteVisita?.medidas?.ancho && (
                    <button
                      type="button"
                      onClick={handleSincronizarVisita}
                      className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 transition flex items-center gap-1.5 shadow-xs"
                    >
                      <span>📥</span>
                      <span>Sincronizar Medidas de Visita Técnica</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Largo / Fondo (metros):
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="1"
                      max="20"
                      value={largoActual}
                      onChange={(e) => handleCambiarDimensiones(Number(e.target.value) || 1, anchoActual)}
                      className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:border-[#1E3A2F] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Ancho / Claro (metros):
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="1"
                      max="20"
                      value={anchoActual}
                      onChange={(e) => handleCambiarDimensiones(largoActual, Number(e.target.value) || 1)}
                      className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 text-sm font-mono font-bold text-slate-900 focus:border-[#1E3A2F] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-emerald-800 mb-1">
                      Superficie Resultante (m²):
                    </label>
                    <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-sm font-mono font-extrabold text-emerald-900">
                      {superficieActual.toFixed(2)} m²
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-200">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Altura Libre (m):</label>
                    <input
                      type="number"
                      step="0.05"
                      value={datos.dimensiones?.alturaLibreM || 1.95}
                      onChange={(e) =>
                        setDatos((p) => {
                          const dims = p.dimensiones || { superficieM2: 9 };
                          return {
                            ...p,
                            dimensiones: { ...dims, superficieM2: dims.superficieM2, alturaLibreM: Number(e.target.value) || 1.95 },
                          };
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Postes de Esquina:</label>
                    <input
                      type="number"
                      value={datos.dimensiones?.postes || 1}
                      onChange={(e) =>
                        setDatos((p) => {
                          const dims = p.dimensiones || { superficieM2: 9 };
                          return {
                            ...p,
                            dimensiones: { ...dims, superficieM2: dims.superficieM2, postes: Number(e.target.value) || 1 },
                          };
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Plazo de Obra (días):</label>
                    <input
                      type="number"
                      value={datos.dimensiones?.plazoDiasHabiles || 5}
                      onChange={(e) =>
                        setDatos((p) => {
                          const dims = p.dimensiones || { superficieM2: 9 };
                          return {
                            ...p,
                            dimensiones: { ...dims, superficieM2: dims.superficieM2, plazoDiasHabiles: Number(e.target.value) || 5 },
                          };
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Garantía (meses):</label>
                    <input
                      type="number"
                      value={datos.dimensiones?.garantiaMeses || 12}
                      onChange={(e) =>
                        setDatos((p) => {
                          const dims = p.dimensiones || { superficieM2: 9 };
                          return {
                            ...p,
                            dimensiones: { ...dims, superficieM2: dims.superficieM2, garantiaMeses: Number(e.target.value) || 12 },
                          };
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Título de la Propuesta:</label>
                <input
                  type="text"
                  value={datos.titulo}
                  onChange={(e) => setDatos((p) => ({ ...p, titulo: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Descripción del Proyecto:</label>
                <textarea
                  rows={3}
                  value={datos.descripcion}
                  onChange={(e) => setDatos((p) => ({ ...p, descripcion: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PESTAÑA 3: COSTOS UNITARIOS / m² & FÓRMULAS */}
          {/* ========================================================================= */}
          {seccion === "costos_m2" && (
            <div className="space-y-6">
              {/* Estructura Base PTR */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-titular text-sm font-bold text-slate-800">
                    Fórmula de Partida Base PTR (Estructura Metálica)
                  </h4>
                  <span className="font-mono text-xs font-bold text-[#1E3A2F]">
                    Total Base Actual: {formatMoneda(datos.estructuraBase?.precio || 0)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Costo Fijo Taller ($):</label>
                    <input
                      type="number"
                      step="100"
                      value={datos.estructuraBase?.costoFijo || 7300}
                      onChange={(e) => {
                        const fijo = Number(e.target.value) || 0;
                        setDatos((p) => {
                          const m2 = p.estructuraBase?.costoPorM2 || 1800;
                          return {
                            ...p,
                            estructuraBase: {
                              ...p.estructuraBase,
                              costoFijo: fijo,
                              precio: Math.round(fijo + m2 * superficieActual),
                            },
                          };
                        });
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Costo por m² ($):</label>
                    <input
                      type="number"
                      step="50"
                      value={datos.estructuraBase?.costoPorM2 || 1800}
                      onChange={(e) => {
                        const m2 = Number(e.target.value) || 0;
                        setDatos((p) => {
                          const fijo = p.estructuraBase?.costoFijo || 7300;
                          return {
                            ...p,
                            estructuraBase: {
                              ...p.estructuraBase,
                              costoPorM2: m2,
                              precio: Math.round(fijo + m2 * superficieActual),
                            },
                          };
                        });
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Precio Final Base ($):</label>
                    <input
                      type="number"
                      step="100"
                      value={datos.estructuraBase?.precio || 23500}
                      onChange={(e) =>
                        setDatos((p) => ({
                          ...p,
                          estructuraBase: { ...p.estructuraBase, precio: Number(e.target.value) || 0 },
                        }))
                      }
                      className="w-full rounded-lg border-2 border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs font-mono font-extrabold text-emerald-900"
                    />
                  </div>
                </div>
              </div>

              {/* Tarifas por m² de Cubiertas y Plafones */}
              {(datos.gruposOpciones || []).map((grupo, gIdx) => (
                <div key={grupo.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h4 className="font-titular text-sm font-bold text-slate-800">
                    Tarifas por m² — {grupo.titulo}
                  </h4>
                  <div className="space-y-2">
                    {grupo.opciones.map((opc, oIdx) => (
                      <div key={opc.id} className="bg-white p-3 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                        <div className="sm:col-span-2">
                          <span className="text-xs font-bold text-slate-800 block">{opc.nombre}</span>
                          <span className="text-[11px] text-slate-500">{opc.descripcion}</span>
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500">Tarifa por m² ($):</label>
                          <input
                            type="number"
                            step="10"
                            value={opc.precioPorM2 || 0}
                            onChange={(e) => {
                              const tarifa = Number(e.target.value) || 0;
                              setDatos((prev) => {
                                const grupos = [...(prev.gruposOpciones || [])];
                                const opciones = [...grupos[gIdx].opciones];
                                opciones[oIdx] = {
                                  ...opciones[oIdx],
                                  precioPorM2: tarifa,
                                  precio: Math.round(tarifa * superficieActual),
                                  tipoPrecio: tarifa > 0 ? "m2" : "fijo",
                                };
                                grupos[gIdx].opciones = opciones;
                                return { ...prev, gruposOpciones: grupos };
                              });
                            }}
                            className="w-full rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500">Importe Total ({superficieActual.toFixed(1)}m²):</label>
                          <input
                            type="number"
                            step="100"
                            value={opc.precio}
                            onChange={(e) => {
                              const total = Number(e.target.value) || 0;
                              setDatos((prev) => {
                                const grupos = [...(prev.gruposOpciones || [])];
                                const opciones = [...grupos[gIdx].opciones];
                                opciones[oIdx] = {
                                  ...opciones[oIdx],
                                  precio: total,
                                };
                                grupos[gIdx].opciones = opciones;
                                return { ...prev, gruposOpciones: grupos };
                              });
                            }}
                            className="w-full rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-mono font-bold text-emerald-800"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ========================================================================= */}
          {/* PESTAÑA 4: CONDICIONES COMERCIALES */}
          {/* ========================================================================= */}
          {seccion === "condiciones" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Anticipo y Forma de Pago:</label>
                <input
                  type="text"
                  value={datos.condiciones?.anticipo || ""}
                  onChange={(e) =>
                    setDatos((p) => ({
                      ...p,
                      condiciones: { ...(p.condiciones || {}), anticipo: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Plazo de Entrega:</label>
                <input
                  type="text"
                  value={datos.condiciones?.plazo || ""}
                  onChange={(e) =>
                    setDatos((p) => ({
                      ...p,
                      condiciones: { ...(p.condiciones || {}), plazo: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Garantía:</label>
                <input
                  type="text"
                  value={datos.condiciones?.garantia || ""}
                  onChange={(e) =>
                    setDatos((p) => ({
                      ...p,
                      condiciones: { ...(p.condiciones || {}), garantia: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nota Legal y Exclusiones:</label>
                <textarea
                  rows={3}
                  value={datos.condiciones?.notaLegal || ""}
                  onChange={(e) =>
                    setDatos((p) => ({
                      ...p,
                      condiciones: { ...(p.condiciones || {}), notaLegal: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
            </div>
          )}

          {mensaje.texto && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold ${
                mensaje.tipo === "ok"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {mensaje.texto}
            </div>
          )}

          {/* Barra inferior fija de acciones */}
          <div className="flex items-center justify-between pt-4 border-t sticky bottom-0 bg-white">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-6 py-2 rounded-xl bg-[#1E3A2F] hover:bg-[#1E3A2F]/90 text-white text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-2"
            >
              {guardando ? (
                <>
                  <span className="animate-spin text-sm">⏳</span>
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>Guardar y Publicar al Cliente ({formatMoneda(desgloseEnVivo.totalSinIva)})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
