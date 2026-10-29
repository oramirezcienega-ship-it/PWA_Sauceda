"use client";

import React, { useState, useRef, useEffect } from "react";

export interface OpcionMultiSelect {
  value: string;
  label: string;
  grupo?: string;
  icono?: string;
}

export interface AtajoRapido {
  label: string;
  icono?: string;
  accion: () => void;
  activo?: boolean;
}

interface MultiSelectFiltroProps {
  titulo: string;
  opciones: OpcionMultiSelect[];
  seleccionados: string[];
  onChange: (nuevos: string[]) => void;
  etiquetaPersonalizada?: string;
  iconoPrincipal?: string;
  atajos?: AtajoRapido[];
  placeholderVacio?: string;
}

export function MultiSelectFiltro({
  titulo,
  opciones,
  seleccionados,
  onChange,
  etiquetaPersonalizada,
  iconoPrincipal,
  atajos = [],
  placeholderVacio = "Ninguno",
}: MultiSelectFiltroProps) {
  const [abierto, setAbierto] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setAbierto(false);
      }
    }
    if (abierto) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [abierto]);

  const toggleOpcion = (val: string) => {
    if (seleccionados.includes(val)) {
      onChange(seleccionados.filter((v) => v !== val));
    } else {
      onChange([...seleccionados, val]);
    }
  };

  const seleccionarTodos = () => {
    onChange(opciones.map((o) => o.value));
  };

  const limpiarTodos = () => {
    onChange([]);
  };

  // Calcular texto del botón
  const count = seleccionados.length;
  const esTodos = count === opciones.length && opciones.length > 0;
  const esNinguno = count === 0;

  let textoBoton = etiquetaPersonalizada;
  if (!textoBoton) {
    if (esTodos) {
      textoBoton = "Todos";
    } else if (esNinguno) {
      textoBoton = placeholderVacio;
    } else if (count === 1) {
      const encontrada = opciones.find((o) => o.value === seleccionados[0]);
      textoBoton = encontrada ? `${encontrada.icono ? `${encontrada.icono} ` : ""}${encontrada.label}` : "1 seleccionado";
    } else {
      textoBoton = `${count} seleccionados`;
    }
  }

  // Agrupar opciones si tienen propiedad 'grupo'
  const grupos = opciones.reduce<Record<string, OpcionMultiSelect[]>>((acc, opc) => {
    const g = opc.grupo || "Opciones";
    if (!acc[g]) acc[g] = [];
    acc[g].push(opc);
    return acc;
  }, {});

  const tieneGrupos = Object.keys(grupos).length > 1 || (Object.keys(grupos).length === 1 && Object.keys(grupos)[0] !== "Opciones");

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <label className="block text-[10px] uppercase font-bold text-carbon/50 mb-1">
        {titulo}
      </label>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className={`w-full rounded-xl border px-3 py-2 text-xs flex items-center justify-between gap-1.5 transition text-left cursor-pointer ${
          abierto
            ? "border-sauce ring-2 ring-sauce/20 bg-white"
            : count > 0 && !esNinguno
            ? "border-carbon/30 bg-white text-carbon font-medium shadow-2xs hover:border-carbon/40"
            : "border-carbon/20 bg-white text-carbon/60 hover:border-carbon/30"
        }`}
      >
        <span className="flex items-center gap-1.5 truncate">
          {iconoPrincipal && <span className="shrink-0">{iconoPrincipal}</span>}
          <span className="truncate">{textoBoton}</span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {count > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                !esTodos
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {count}
            </span>
          )}
          <span className="text-[10px] text-carbon/40">▼</span>
        </div>
      </button>

      {abierto && (
        <div className="absolute left-0 right-0 sm:right-auto sm:w-80 mt-1.5 rounded-2xl bg-white border border-carbon/15 shadow-2xl z-50 p-2.5 text-xs font-cuerpo animate-in fade-in zoom-in-95 duration-100 space-y-2">
          {/* Atajos Rápidos */}
          {atajos.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pb-2 border-b border-carbon/10">
              {atajos.map((at, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={at.accion}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer ${
                    at.activo
                      ? "bg-verde-profundo text-white shadow-2xs"
                      : "bg-slate-100 hover:bg-slate-200 text-carbon/80"
                  }`}
                >
                  {at.icono && <span>{at.icono}</span>}
                  <span>{at.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Encabezado con Todos / Ninguno */}
          <div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-wider text-carbon/50">
            <span>Opciones ({count}/{opciones.length})</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={seleccionarTodos}
                className="text-sauce hover:text-verde-profundo hover:underline font-bold cursor-pointer"
              >
                Todas
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={limpiarTodos}
                className="text-rose-600 hover:underline font-bold cursor-pointer"
              >
                Ninguna
              </button>
            </div>
          </div>

          {/* Lista de Opciones */}
          <div className="max-h-64 overflow-y-auto space-y-2 pr-0.5 pt-0.5">
            {tieneGrupos ? (
              Object.entries(grupos).map(([nombreGrupo, items]) => {
                const todosGrupo = items.every((i) => seleccionados.includes(i.value));
                return (
                  <div key={nombreGrupo} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[10px] font-bold text-carbon/40 uppercase tracking-wider px-2 pt-1">
                      <span>{nombreGrupo}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (todosGrupo) {
                            const ids = new Set(items.map((i) => i.value));
                            onChange(seleccionados.filter((v) => !ids.has(v)));
                          } else {
                            const unicos = new Set([...seleccionados, ...items.map((i) => i.value)]);
                            onChange(Array.from(unicos));
                          }
                        }}
                        className="text-[9.5px] text-sauce hover:underline lowercase font-normal"
                      >
                        {todosGrupo ? "desmarcar grupo" : "marcar grupo"}
                      </button>
                    </div>
                    {items.map((opc) => {
                      const checked = seleccionados.includes(opc.value);
                      return (
                        <label
                          key={opc.value}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition select-none ${
                            checked
                              ? "bg-emerald-50/80 text-emerald-900 font-semibold"
                              : "hover:bg-slate-50 text-carbon/80"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOpcion(opc.value)}
                            className="rounded border-carbon/30 text-verde-profundo focus:ring-verde-profundo h-3.5 w-3.5"
                          />
                          {opc.icono && <span className="shrink-0">{opc.icono}</span>}
                          <span className="truncate">{opc.label}</span>
                        </label>
                      );
                    })}
                  </div>
                );
              })
            ) : (
              <div className="space-y-0.5">
                {opciones.map((opc) => {
                  const checked = seleccionados.includes(opc.value);
                  return (
                    <label
                      key={opc.value}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition select-none ${
                        checked
                          ? "bg-emerald-50/80 text-emerald-900 font-semibold"
                          : "hover:bg-slate-50 text-carbon/80"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOpcion(opc.value)}
                        className="rounded border-carbon/30 text-verde-profundo focus:ring-verde-profundo h-3.5 w-3.5"
                      />
                      {opc.icono && <span className="shrink-0">{opc.icono}</span>}
                      <span className="truncate">{opc.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
