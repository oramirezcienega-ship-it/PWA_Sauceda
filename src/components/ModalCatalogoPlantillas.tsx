"use client";

import React, { useMemo, useState } from "react";
import type { PlantillaWhatsApp } from "@/lib/whatsapp";
import {
  clasificarPlantilla,
  obtenerCategoriaDeTipoNegocio,
  type CategoriaPlantilla,
} from "@/lib/plantillas-whatsapp";

interface ModalCatalogoPlantillasProps {
  abierto: boolean;
  alCerrar: () => void;
  plantillas: PlantillaWhatsApp[];
  plantillaSeleccionada: string;
  alSeleccionar: (nombrePlantilla: string) => void;
  tipoNegocio?: string | null;
  nombreCliente?: string;
}

const CATEGORIA_ESTILOS: Record<
  CategoriaPlantilla,
  { badge: string; border: string; bg: string; text: string }
> = {
  impermeabilizacion: {
    badge: "bg-blue-100 text-blue-900 border-blue-300",
    border: "border-blue-200 hover:border-blue-400",
    bg: "bg-blue-50/30",
    text: "text-blue-900",
  },
  remodelacion: {
    badge: "bg-orange-100 text-orange-900 border-orange-300",
    border: "border-orange-200 hover:border-orange-400",
    bg: "bg-orange-50/30",
    text: "text-orange-900",
  },
  piso_estampado: {
    badge: "bg-stone-200 text-stone-900 border-stone-400",
    border: "border-stone-200 hover:border-stone-400",
    bg: "bg-stone-50/40",
    text: "text-stone-900",
  },
  cisternas_tinacos: {
    badge: "bg-cyan-100 text-cyan-900 border-cyan-300",
    border: "border-cyan-200 hover:border-cyan-400",
    bg: "bg-cyan-50/30",
    text: "text-cyan-900",
  },
  herreria: {
    badge: "bg-zinc-200 text-zinc-900 border-zinc-400",
    border: "border-zinc-200 hover:border-zinc-400",
    bg: "bg-zinc-50/40",
    text: "text-zinc-900",
  },
  bienes_raices: {
    badge: "bg-emerald-100 text-emerald-900 border-emerald-300",
    border: "border-emerald-200 hover:border-emerald-400",
    bg: "bg-emerald-50/30",
    text: "text-emerald-900",
  },
  operativas_cotizaciones: {
    badge: "bg-slate-200 text-slate-800 border-slate-300",
    border: "border-slate-200 hover:border-slate-400",
    bg: "bg-slate-50/40",
    text: "text-slate-900",
  },
  general: {
    badge: "bg-purple-100 text-purple-900 border-purple-300",
    border: "border-purple-200 hover:border-purple-400",
    bg: "bg-purple-50/30",
    text: "text-purple-900",
  },
};

/**
 * Resalta las variables {{1}}, {{2}}... en el texto de la plantilla.
 */
function formatearCuerpoConVariables(texto: string) {
  if (!texto) return null;
  const partes = texto.split(/(\{\{\d+\}\})/g);
  return partes.map((parte, i) => {
    if (/^\{\{\d+\}\}$/.test(parte)) {
      return (
        <span
          key={i}
          className="inline-block bg-sauce/20 text-verde-profundo font-bold px-1 py-0.5 rounded text-[11px] font-mono mx-0.5 shadow-2xs border border-sauce/30"
        >
          {parte}
        </span>
      );
    }
    return <span key={i}>{parte}</span>;
  });
}

export function ModalCatalogoPlantillas({
  abierto,
  alCerrar,
  plantillas,
  plantillaSeleccionada,
  alSeleccionar,
  tipoNegocio,
  nombreCliente,
}: ModalCatalogoPlantillasProps) {
  const [tabFiltro, setTabFiltro] = useState<string>("recomendadas");
  const [busqueda, setBusqueda] = useState<string>("");

  const infoNegocio = useMemo(() => {
    return obtenerCategoriaDeTipoNegocio(tipoNegocio);
  }, [tipoNegocio]);

  // Clasificar cada plantilla
  const plantillasConMeta = useMemo(() => {
    return plantillas.map((p) => {
      const info = clasificarPlantilla(p);
      return {
        ...p,
        clasificacion: info,
      };
    });
  }, [plantillas]);

  // Filtrado reactivo
  const plantillasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();

    return plantillasConMeta.filter((p) => {
      // Filtro de búsqueda
      if (q) {
        const n = p.nombre.toLowerCase();
        const c = p.cuerpo.toLowerCase();
        const cat = p.categoria.toLowerCase();
        const etiq = p.clasificacion.etiqueta.toLowerCase();
        if (!n.includes(q) && !c.includes(q) && !cat.includes(q) && !etiq.includes(q)) {
          return false;
        }
      }

      // Filtro de pestaña
      if (tabFiltro === "todas") return true;

      if (tabFiltro === "recomendadas") {
        if (!infoNegocio) return true;
        // Recomendadas: coinciden con la línea de negocio del lead, o son operativas/bienvenida
        return (
          p.clasificacion.categoria === infoNegocio.categoria ||
          p.clasificacion.categoria === "operativas_cotizaciones" ||
          p.clasificacion.categoria === "general"
        );
      }

      return p.clasificacion.categoria === tabFiltro;
    });
  }, [plantillasConMeta, busqueda, tabFiltro, infoNegocio]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl border border-carbon/15 overflow-hidden">
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-carbon/10 bg-crema/40 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📋</span>
            <div>
              <h2 className="text-base font-bold text-verde-profundo leading-tight">
                Catálogo Visual de Plantillas de WhatsApp
              </h2>
              <p className="text-xs text-carbon/60">
                Selecciona una plantilla aprobada por Meta para reactivar la conversación con{" "}
                <strong className="text-carbon">{nombreCliente || "el cliente"}</strong>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            className="rounded-lg p-1.5 text-carbon/40 hover:bg-carbon/10 hover:text-carbon transition text-lg font-bold cursor-pointer"
            title="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div className="border-b border-carbon/10 bg-white p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Buscador */}
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon/40 text-sm">
                🔍
              </span>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, texto o servicio (ej: imper, garantía, cotización)..."
                className="w-full rounded-lg border border-carbon/20 pl-9 pr-8 py-2 text-xs text-carbon placeholder:text-carbon/40 focus:border-sauce focus:outline-none focus:ring-1 focus:ring-sauce"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-carbon/40 hover:text-carbon p-0.5"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="text-xs font-semibold text-carbon/50 shrink-0">
              Mostrando <span className="text-verde-profundo font-bold">{plantillasFiltradas.length}</span> de{" "}
              <span>{plantillas.length}</span> plantillas
            </div>
          </div>

          {/* Pestañas de categoría */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {infoNegocio && (
              <button
                type="button"
                onClick={() => setTabFiltro("recomendadas")}
                className={`rounded-full px-3 py-1 font-bold transition flex items-center gap-1 cursor-pointer ${
                  tabFiltro === "recomendadas"
                    ? "bg-sauce text-crema shadow-xs"
                    : "bg-carbon/5 text-carbon/70 hover:bg-carbon/10"
                }`}
              >
                <span>⭐</span>
                <span>Recomendadas ({infoNegocio.nombreLegible})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setTabFiltro("todas")}
              className={`rounded-full px-3 py-1 font-semibold transition flex items-center gap-1 cursor-pointer ${
                tabFiltro === "todas"
                  ? "bg-verde-profundo text-crema shadow-xs font-bold"
                  : "bg-carbon/5 text-carbon/70 hover:bg-carbon/10"
              }`}
            >
              <span>🌐</span>
              <span>Todas</span>
            </button>

            <button
              type="button"
              onClick={() => setTabFiltro("impermeabilizacion")}
              className={`rounded-full px-3 py-1 transition flex items-center gap-1 cursor-pointer ${
                tabFiltro === "impermeabilizacion"
                  ? "bg-blue-700 text-white font-bold shadow-xs"
                  : "bg-blue-50 text-blue-900 hover:bg-blue-100"
              }`}
            >
              <span>☔</span>
              <span>Impermeabilización</span>
            </button>

            <button
              type="button"
              onClick={() => setTabFiltro("operativas_cotizaciones")}
              className={`rounded-full px-3 py-1 transition flex items-center gap-1 cursor-pointer ${
                tabFiltro === "operativas_cotizaciones"
                  ? "bg-slate-700 text-white font-bold shadow-xs"
                  : "bg-slate-100 text-slate-800 hover:bg-slate-200"
              }`}
            >
              <span>📋</span>
              <span>Operativas & Citas</span>
            </button>

            <button
              type="button"
              onClick={() => setTabFiltro("remodelacion")}
              className={`rounded-full px-3 py-1 transition flex items-center gap-1 cursor-pointer ${
                tabFiltro === "remodelacion"
                  ? "bg-orange-700 text-white font-bold shadow-xs"
                  : "bg-orange-50 text-orange-900 hover:bg-orange-100"
              }`}
            >
              <span>🔨</span>
              <span>Remodelación</span>
            </button>

            <button
              type="button"
              onClick={() => setTabFiltro("cisternas_tinacos")}
              className={`rounded-full px-3 py-1 transition flex items-center gap-1 cursor-pointer ${
                tabFiltro === "cisternas_tinacos"
                  ? "bg-cyan-700 text-white font-bold shadow-xs"
                  : "bg-cyan-50 text-cyan-900 hover:bg-cyan-100"
              }`}
            >
              <span>💧</span>
              <span>Cisternas & Tinacos</span>
            </button>

            <button
              type="button"
              onClick={() => setTabFiltro("herreria")}
              className={`rounded-full px-3 py-1 transition flex items-center gap-1 cursor-pointer ${
                tabFiltro === "herreria"
                  ? "bg-zinc-800 text-white font-bold shadow-xs"
                  : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
              }`}
            >
              <span>⚙️</span>
              <span>Herrería</span>
            </button>

            <button
              type="button"
              onClick={() => setTabFiltro("bienes_raices")}
              className={`rounded-full px-3 py-1 transition flex items-center gap-1 cursor-pointer ${
                tabFiltro === "bienes_raices"
                  ? "bg-emerald-700 text-white font-bold shadow-xs"
                  : "bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
              }`}
            >
              <span>🏠</span>
              <span>Bienes Raíces</span>
            </button>
          </div>
        </div>

        {/* Cuadrícula de Tarjetas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-crema/10 scrollbar-sutil">
          {plantillasFiltradas.length === 0 ? (
            <div className="py-12 text-center text-carbon/40 space-y-2">
              <span className="text-3xl block">🔍</span>
              <p className="text-sm font-semibold">No se encontraron plantillas con ese criterio.</p>
              <p className="text-xs">Prueba borrando el término de búsqueda o cambiando de pestaña.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {plantillasFiltradas.map((p) => {
                const esSeleccionada = p.nombre === plantillaSeleccionada;
                const estilo = CATEGORIA_ESTILOS[p.clasificacion.categoria] ?? CATEGORIA_ESTILOS.general;

                return (
                  <div
                    key={p.nombre}
                    onClick={() => {
                      alSeleccionar(p.nombre);
                      alCerrar();
                    }}
                    className={`group relative flex flex-col justify-between rounded-xl border bg-white p-4 transition-all duration-150 cursor-pointer text-left ${
                      esSeleccionada
                        ? "border-sauce ring-2 ring-sauce/50 shadow-md bg-sauce/5"
                        : `${estilo.border} hover:shadow-md hover:-translate-y-0.5`
                    }`}
                  >
                    <div className="space-y-2.5">
                      {/* Cabecera de la tarjeta */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${estilo.badge}`}
                          >
                            <span>{p.clasificacion.icono}</span>
                            <span>{p.clasificacion.etiqueta}</span>
                          </span>

                          <span className="rounded bg-carbon/5 px-1.5 py-0.5 text-[9px] font-mono font-bold text-carbon/60">
                            {p.idioma}
                          </span>

                          <span className="rounded bg-carbon/5 px-1.5 py-0.5 text-[9px] font-semibold text-carbon/60">
                            {p.categoria}
                          </span>
                        </div>

                        {p.parametros > 0 && (
                          <span className="shrink-0 text-[10px] bg-dorado/15 text-dorado font-bold px-1.5 py-0.5 rounded">
                            {p.parametros} var{p.parametros === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>

                      {/* Nombre técnico de la plantilla */}
                      <h3 className="font-mono text-xs font-bold text-carbon group-hover:text-verde-profundo transition-colors">
                        {p.nombre}
                      </h3>

                      {/* Cuerpo de la plantilla con formato */}
                      <div className="rounded-lg bg-carbon/5 p-3 text-xs text-carbon/80 font-sans leading-relaxed whitespace-pre-line border border-carbon/5 max-h-44 overflow-y-auto scrollbar-sutil">
                        {formatearCuerpoConVariables(p.cuerpo)}
                      </div>
                    </div>

                    {/* Pie con botón de selección */}
                    <div className="mt-3 pt-2.5 border-t border-carbon/10 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-carbon/50">
                        {esSeleccionada ? "✓ Seleccionada para enviar" : "Clic para seleccionar"}
                      </span>

                      <button
                        type="button"
                        className={`rounded-md px-3 py-1 text-xs font-bold transition flex items-center gap-1 ${
                          esSeleccionada
                            ? "bg-sauce text-crema"
                            : "bg-verde-profundo/10 text-verde-profundo group-hover:bg-sauce group-hover:text-crema"
                        }`}
                      >
                        <span>{esSeleccionada ? "✓ Elegida" : "Elegir"}</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pie del modal */}
        <div className="flex items-center justify-between border-t border-carbon/10 bg-white px-5 py-3 text-xs text-carbon/60">
          <span>
            💡 <em>Al seleccionar una plantilla, se cargarán sus variables dinámicas en el panel de envío.</em>
          </span>
          <button
            type="button"
            onClick={alCerrar}
            className="rounded-lg border border-carbon/20 px-4 py-1.5 font-semibold text-carbon/70 hover:bg-carbon/5 transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
