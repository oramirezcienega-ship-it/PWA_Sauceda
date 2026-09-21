"use client";

import React, { useState } from "react";
import type { Cotizacion, CotizacionModularData } from "@/lib/types";
import { PLANTILLA_PERGOLA_AZOTEA_3X3 } from "@/lib/plantillasModulares";
import { guardarDatosModulares } from "@/app/actions/cotizaciones";

interface ModalEditorCotizacionModularProps {
  abierto: boolean;
  onCerrar: () => void;
  cotizacion: Cotizacion;
  onGuardado: (nuevosDatos: CotizacionModularData) => void;
}

export function ModalEditorCotizacionModular({
  abierto,
  onCerrar,
  cotizacion,
  onGuardado,
}: ModalEditorCotizacionModularProps) {
  const datosIniciales: CotizacionModularData =
    cotizacion.datosModulares || PLANTILLA_PERGOLA_AZOTEA_3X3;

  const [seccion, setSeccion] = useState<"general" | "base" | "opciones" | "complementos" | "condiciones">("general");
  const [datos, setDatos] = useState<CotizacionModularData>(JSON.parse(JSON.stringify(datosIniciales)));
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error" | ""; texto: string }>({ tipo: "", texto: "" });

  if (!abierto) return null;

  // Handlers para viñetas de estructura base
  const handleCambiarDetalleBase = (index: number, valor: string) => {
    setDatos((prev) => {
      const detalles = [...(prev.estructuraBase.detalles || [])];
      detalles[index] = valor;
      return { ...prev, estructuraBase: { ...prev.estructuraBase, detalles } };
    });
  };

  const handleAgregarDetalleBase = () => {
    setDatos((prev) => ({
      ...prev,
      estructuraBase: {
        ...prev.estructuraBase,
        detalles: [...(prev.estructuraBase.detalles || []), ""],
      },
    }));
  };

  const handleEliminarDetalleBase = (index: number) => {
    setDatos((prev) => {
      const detalles = [...(prev.estructuraBase.detalles || [])];
      detalles.splice(index, 1);
      return { ...prev, estructuraBase: { ...prev.estructuraBase, detalles } };
    });
  };

  // Handlers para grupos de opciones
  const handleCambiarOpcion = (
    grupoIndex: number,
    opcionIndex: number,
    campo: "nombre" | "descripcion" | "precio",
    valor: any
  ) => {
    setDatos((prev) => {
      const grupos = [...(prev.gruposOpciones || [])];
      const grupo = { ...grupos[grupoIndex] };
      const opciones = [...grupo.opciones];
      opciones[opcionIndex] = {
        ...opciones[opcionIndex],
        [campo]: campo === "precio" ? Number(valor) || 0 : valor,
      };
      grupo.opciones = opciones;
      grupos[grupoIndex] = grupo;
      return { ...prev, gruposOpciones: grupos };
    });
  };

  const handleAgregarOpcion = (grupoIndex: number) => {
    setDatos((prev) => {
      const grupos = [...(prev.gruposOpciones || [])];
      const grupo = { ...grupos[grupoIndex] };
      grupo.opciones = [
        ...grupo.opciones,
        {
          id: `opc_${Date.now()}`,
          nombre: "Nueva Opción",
          descripcion: "Descripción de la opción...",
          precio: 0,
        },
      ];
      grupos[grupoIndex] = grupo;
      return { ...prev, gruposOpciones: grupos };
    });
  };

  const handleEliminarOpcion = (grupoIndex: number, opcionIndex: number) => {
    setDatos((prev) => {
      const grupos = [...(prev.gruposOpciones || [])];
      const grupo = { ...grupos[grupoIndex] };
      grupo.opciones = grupo.opciones.filter((_, idx) => idx !== opcionIndex);
      grupos[grupoIndex] = grupo;
      return { ...prev, gruposOpciones: grupos };
    });
  };

  // Handlers para complementos
  const handleCambiarComplemento = (
    index: number,
    campo: "nombre" | "descripcion" | "precio",
    valor: any
  ) => {
    setDatos((prev) => {
      const complementos = [...(prev.complementos || [])];
      complementos[index] = {
        ...complementos[index],
        [campo]: campo === "precio" ? Number(valor) || 0 : valor,
      };
      return { ...prev, complementos };
    });
  };

  const handleAgregarComplemento = () => {
    setDatos((prev) => ({
      ...prev,
      complementos: [
        ...(prev.complementos || []),
        {
          id: `comp_${Date.now()}`,
          nombre: "Nuevo Complemento",
          descripcion: "Descripción del complemento adicional...",
          precio: 0,
        },
      ],
    }));
  };

  const handleEliminarComplemento = (index: number) => {
    setDatos((prev) => ({
      ...prev,
      complementos: (prev.complementos || []).filter((_, idx) => idx !== index),
    }));
  };

  // Guardar en Base de Datos
  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGuardando(true);
      setMensaje({ tipo: "", texto: "" });

      const res = await guardarDatosModulares({
        cotizacionId: cotizacion.id,
        datosModulares: datos,
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
        texto: "¡Configuración de la cotización dinámica actualizada con éxito!",
      });

      onGuardado(datos);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/50 p-3 sm:p-6 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-carbon/10 overflow-hidden font-cuerpo my-auto">
        {/* Encabezado */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">✏️</span>
            <div>
              <h3 className="font-titular text-base font-bold text-verde-profundo leading-tight">
                Editor de Cotización Dinámica / Modular
              </h3>
              <p className="text-xs text-carbon/60">
                Folio: <strong className="text-dorado">{cotizacion.id}</strong> — Ajusta precios, partidas, dimensiones y condiciones.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="text-carbon/40 hover:text-carbon text-xl font-bold p-1 rounded-lg transition"
          >
            ✕
          </button>
        </div>

        {/* Pestañas de edición */}
        <div className="flex border-b bg-white px-6 gap-2 pt-2 text-xs font-titular overflow-x-auto">
          {[
            { id: "general", etiqueta: "📋 General & Ficha", icono: "📐" },
            { id: "base", etiqueta: "🏗️ Estructura Base", icono: "🧱" },
            { id: "opciones", etiqueta: "🧩 Opciones & Variantes", icono: "🎛️" },
            { id: "complementos", etiqueta: "✨ Complementos", icono: "💡" },
            { id: "condiciones", etiqueta: "📄 Condiciones", icono: "⚖️" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSeccion(tab.id as any)}
              className={`pb-2.5 px-3 font-semibold border-b-2 transition whitespace-nowrap ${
                seccion === tab.id
                  ? "border-verde-profundo text-verde-profundo font-bold"
                  : "border-transparent text-carbon/60 hover:text-carbon"
              }`}
            >
              {tab.etiqueta}
            </button>
          ))}
        </div>

        {/* Contenido del formulario */}
        <form onSubmit={handleGuardar} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. SECCIÓN GENERAL & FICHA TÉCNICA */}
          {seccion === "general" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">
                  Título de la Propuesta Dinámica:
                </label>
                <input
                  type="text"
                  required
                  value={datos.titulo}
                  onChange={(e) => setDatos((p) => ({ ...p, titulo: e.target.value }))}
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs font-medium focus:border-sauce focus:outline-none"
                  placeholder="Ej: Pérgola de azotea 3 × 3 m"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">
                  Descripción General:
                </label>
                <textarea
                  rows={3}
                  value={datos.descripcion}
                  onChange={(e) => setDatos((p) => ({ ...p, descripcion: e.target.value }))}
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs font-medium focus:border-sauce focus:outline-none"
                  placeholder="Descripción del alcance y estructura..."
                />
              </div>

              <div className="border-t pt-4">
                <h4 className="font-titular text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Dimensiones y Ficha Técnica
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Superficie (m²):</label>
                    <input
                      type="number"
                      step="0.1"
                      value={datos.dimensiones?.superficieM2 || 0}
                      onChange={(e) =>
                        setDatos((p) => ({
                          ...p,
                          dimensiones: { ...(p.dimensiones || {}), superficieM2: Number(e.target.value) || 0 },
                        }))
                      }
                      className="w-full rounded-lg border border-carbon/20 px-3 py-1.5 text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Altura Libre (m):</label>
                    <input
                      type="number"
                      step="0.05"
                      value={datos.dimensiones?.alturaLibreM || 0}
                      onChange={(e) =>
                        setDatos((p) => ({
                          ...p,
                          dimensiones: { ...(p.dimensiones || {}), alturaLibreM: Number(e.target.value) || 0 },
                        }))
                      }
                      className="w-full rounded-lg border border-carbon/20 px-3 py-1.5 text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Postes de Apoyo:</label>
                    <input
                      type="number"
                      value={datos.dimensiones?.postes || 0}
                      onChange={(e) =>
                        setDatos((p) => ({
                          ...p,
                          dimensiones: { ...(p.dimensiones || {}), postes: Number(e.target.value) || 0 },
                        }))
                      }
                      className="w-full rounded-lg border border-carbon/20 px-3 py-1.5 text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Plazo (días hábiles):</label>
                    <input
                      type="number"
                      value={datos.dimensiones?.plazoDiasHabiles || 0}
                      onChange={(e) =>
                        setDatos((p) => ({
                          ...p,
                          dimensiones: { ...(p.dimensiones || {}), plazoDiasHabiles: Number(e.target.value) || 0 },
                        }))
                      }
                      className="w-full rounded-lg border border-carbon/20 px-3 py-1.5 text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Garantía (meses):</label>
                    <input
                      type="number"
                      value={datos.dimensiones?.garantiaMeses || 0}
                      onChange={(e) =>
                        setDatos((p) => ({
                          ...p,
                          dimensiones: { ...(p.dimensiones || {}), garantiaMeses: Number(e.target.value) || 0 },
                        }))
                      }
                      className="w-full rounded-lg border border-carbon/20 px-3 py-1.5 text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. SECCIÓN ESTRUCTURA BASE */}
          {seccion === "base" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-carbon/80 mb-1">
                    Título de la Partida Base Obligatoria:
                  </label>
                  <input
                    type="text"
                    required
                    value={datos.estructuraBase?.titulo || ""}
                    onChange={(e) =>
                      setDatos((p) => ({
                        ...p,
                        estructuraBase: { ...p.estructuraBase, titulo: e.target.value },
                      }))
                    }
                    className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs font-semibold focus:border-sauce focus:outline-none"
                    placeholder="Ej: Estructura metálica terminada"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-verde-profundo mb-1">
                    Precio Base ($ MXN sin IVA):
                  </label>
                  <input
                    type="number"
                    required
                    step="100"
                    value={datos.estructuraBase?.precio || 0}
                    onChange={(e) =>
                      setDatos((p) => ({
                        ...p,
                        estructuraBase: { ...p.estructuraBase, precio: Number(e.target.value) || 0 },
                      }))
                    }
                    className="w-full rounded-lg border-2 border-verde-profundo bg-emerald-50/20 px-3 py-2 text-sm font-mono font-bold text-verde-profundo"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">
                  Subtítulo / Encabezado de Partida:
                </label>
                <input
                  type="text"
                  value={datos.estructuraBase?.subtitulo || ""}
                  onChange={(e) =>
                    setDatos((p) => ({
                      ...p,
                      estructuraBase: { ...p.estructuraBase, subtitulo: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs focus:border-sauce focus:outline-none text-carbon/80"
                  placeholder="Ej: PARTIDA 1 — ESTRUCTURA (OBLIGATORIA)"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">
                  Nota explicativa de la partida base:
                </label>
                <input
                  type="text"
                  value={datos.estructuraBase?.nota || ""}
                  onChange={(e) =>
                    setDatos((p) => ({
                      ...p,
                      estructuraBase: { ...p.estructuraBase, nota: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs text-carbon/70 focus:border-sauce focus:outline-none"
                  placeholder="Ej: La estructura sola es plenamente funcional como pérgola de sombra parcial..."
                />
              </div>

              {/* Viñetas técnicas */}
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Especificaciones Técnicas (Viñetas):
                  </span>
                  <button
                    type="button"
                    onClick={handleAgregarDetalleBase}
                    className="text-xs text-sauce hover:underline font-bold"
                  >
                    + Agregar viñeta técnica
                  </button>
                </div>

                <div className="space-y-2">
                  {(datos.estructuraBase?.detalles || []).map((det, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-mono w-5">{idx + 1}.</span>
                      <input
                        type="text"
                        value={det}
                        onChange={(e) => handleCambiarDetalleBase(idx, e.target.value)}
                        className="flex-1 rounded-lg border border-carbon/20 px-3 py-1.5 text-xs font-medium focus:border-sauce focus:outline-none"
                        placeholder="Especificación técnica..."
                      />
                      <button
                        type="button"
                        onClick={() => handleEliminarDetalleBase(idx)}
                        className="text-rose-500 hover:text-rose-700 text-xs px-2 py-1 font-bold"
                        title="Eliminar viñeta"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. SECCIÓN GRUPOS DE OPCIONES & VARIANTES */}
          {seccion === "opciones" && (
            <div className="space-y-6">
              {(datos.gruposOpciones || []).map((grupo, gIdx) => (
                <div key={grupo.id || gIdx} className="bg-slate-50 p-4 rounded-xl border border-carbon/10 space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Grupo {gIdx + 1} (Radio Selection)</span>
                      <h4 className="font-titular text-sm font-bold text-slate-800">{grupo.titulo}</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAgregarOpcion(gIdx)}
                      className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-2.5 py-1 rounded-lg transition"
                    >
                      + Agregar Opción
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {grupo.opciones.map((opc, oIdx) => (
                      <div
                        key={opc.id || oIdx}
                        className="bg-white p-3 rounded-xl border border-slate-200 space-y-2"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase">Nombre:</label>
                            <input
                              type="text"
                              required
                              value={opc.nombre}
                              onChange={(e) => handleCambiarOpcion(gIdx, oIdx, "nombre", e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase">Precio Adicional ($):</label>
                            <input
                              type="number"
                              step="100"
                              value={opc.precio}
                              onChange={(e) => handleCambiarOpcion(gIdx, oIdx, "precio", e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono font-bold text-emerald-800"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-2 pt-3 sm:pt-0">
                            <button
                              type="button"
                              onClick={() => handleEliminarOpcion(gIdx, oIdx)}
                              className="text-rose-500 hover:text-rose-700 text-xs font-bold px-2 py-1 rounded"
                              title="Eliminar opción"
                            >
                              ✕ Eliminar
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Descripción explicativa:</label>
                          <input
                            type="text"
                            value={opc.descripcion}
                            onChange={(e) => handleCambiarOpcion(gIdx, oIdx, "descripcion", e.target.value)}
                            className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600"
                            placeholder="Beneficios, aislamiento, luminosidad..."
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 4. SECCIÓN COMPLEMENTOS OPCIONALES */}
          {seccion === "complementos" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-titular text-sm font-bold text-slate-800">
                    Complementos Opcionales (Checkboxes interactivos)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Elementos adicionales que el cliente puede marcar o desmarcar a voluntad.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAgregarComplemento}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl transition shadow-xs"
                >
                  + Agregar Complemento
                </button>
              </div>

              <div className="space-y-3">
                {(datos.complementos || []).map((comp, cIdx) => (
                  <div key={comp.id || cIdx} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Nombre del Complemento:</label>
                        <input
                          type="text"
                          required
                          value={comp.nombre}
                          onChange={(e) => handleCambiarComplemento(cIdx, "nombre", e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Precio ($ MXN):</label>
                        <input
                          type="number"
                          step="100"
                          value={comp.precio}
                          onChange={(e) => handleCambiarComplemento(cIdx, "precio", e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono font-bold text-emerald-800"
                        />
                      </div>
                      <div className="flex items-center justify-end pt-3 sm:pt-0">
                        <button
                          type="button"
                          onClick={() => handleEliminarComplemento(cIdx)}
                          className="text-rose-500 hover:text-rose-700 text-xs font-bold px-2 py-1"
                        >
                          ✕ Eliminar
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Descripción:</label>
                      <input
                        type="text"
                        value={comp.descripcion}
                        onChange={(e) => handleCambiarComplemento(cIdx, "descripcion", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"
                        placeholder="Ej: 4 spots LED embutidos en plafón con interruptor de pared..."
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. CONDICIONES COMERCIALES */}
          {seccion === "condiciones" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">Anticipo y Forma de Pago:</label>
                <input
                  type="text"
                  value={datos.condiciones?.anticipo || ""}
                  onChange={(e) =>
                    setDatos((p) => ({
                      ...p,
                      condiciones: { ...(p.condiciones || {}), anticipo: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs text-slate-800"
                  placeholder="Ej: 65% a la firma para compra de material, saldo contra entrega."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">Plazo de Entrega:</label>
                <input
                  type="text"
                  value={datos.condiciones?.plazo || ""}
                  onChange={(e) =>
                    setDatos((p) => ({
                      ...p,
                      condiciones: { ...(p.condiciones || {}), plazo: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs text-slate-800"
                  placeholder="Ej: 5 días hábiles a partir del anticipo: 3 de taller y 2 de obra."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">Garantía:</label>
                <input
                  type="text"
                  value={datos.condiciones?.garantia || ""}
                  onChange={(e) =>
                    setDatos((p) => ({
                      ...p,
                      condiciones: { ...(p.condiciones || {}), garantia: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs text-slate-800"
                  placeholder="Ej: 12 meses en estructura y soldadura; 24 meses en estanqueidad de la cubierta."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">Precios y Moneda:</label>
                <input
                  type="text"
                  value={datos.condiciones?.precios || ""}
                  onChange={(e) =>
                    setDatos((p) => ({
                      ...p,
                      condiciones: { ...(p.condiciones || {}), precios: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs text-slate-800"
                  placeholder="Ej: En pesos mexicanos, sin IVA. Sujetos a revisión después de la vigencia por acero."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">Nota Legal y Exclusiones:</label>
                <textarea
                  rows={3}
                  value={datos.condiciones?.notaLegal || ""}
                  onChange={(e) =>
                    setDatos((p) => ({
                      ...p,
                      condiciones: { ...(p.condiciones || {}), notaLegal: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs text-slate-800"
                  placeholder="Ej: No incluye retiro de impermeabilizante previo ni resanes si los muros no tienen dala..."
                />
              </div>
            </div>
          )}

          {mensaje.texto && (
            <div
              className={`p-3 rounded-lg text-xs font-semibold ${
                mensaje.tipo === "ok"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {mensaje.texto}
            </div>
          )}

          {/* Barra inferior de acciones */}
          <div className="flex items-center justify-between pt-4 border-t">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="px-4 py-2 rounded-xl border border-carbon/20 text-xs font-semibold text-carbon/70 hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-5 py-2 rounded-xl bg-verde-profundo hover:bg-verde-profundo/90 text-white text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-2"
            >
              {guardando ? (
                <>
                  <span className="animate-spin text-sm">⏳</span>
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>Guardar Cambios Modulares</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
