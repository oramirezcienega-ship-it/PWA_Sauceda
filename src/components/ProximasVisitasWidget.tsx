"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { obtenerProximasCitasEInstalaciones, type Cita } from "@/app/actions/agenda";

interface ProximasVisitasWidgetProps {
  perfilId?: string | null;
}

export function ProximasVisitasWidget({ perfilId }: ProximasVisitasWidgetProps) {
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "instalacion" | "inspeccion">("todos");

  useEffect(() => {
    let activo = true;
    setCargando(true);
    obtenerProximasCitasEInstalaciones(perfilId)
      .then((data) => {
        if (activo) {
          setCitas(data);
          setCargando(false);
        }
      })
      .catch(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [perfilId]);

  const citasFiltradas = citas.filter((c) => {
    if (filtroTipo === "instalacion") return c.tipo_cita === "instalacion";
    if (filtroTipo === "inspeccion") return c.tipo_cita === "inspeccion";
    return true;
  });

  const totalInstalaciones = citas.filter((c) => c.tipo_cita === "instalacion").length;
  const totalInspecciones = citas.filter((c) => c.tipo_cita === "inspeccion").length;

  if (!cargando && citas.length === 0) {
    return null; // Si no hay citas agendadas no abrumamos la pantalla
  }

  return (
    <div className="mb-6 rounded-2xl border border-carbon/10 bg-white p-4 sm:p-5 shadow-sm space-y-3.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-titular text-base sm:text-lg font-bold text-carbon flex items-center gap-2">
            <span>🗓️</span> Próximas Visitas e Instalaciones
          </h3>
          <p className="text-xs text-carbon/50">
            Agenda del técnico con inspecciones en sitio e instalaciones profesionales
          </p>
        </div>

        {/* Filtros por tipo de visita */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setFiltroTipo("todos")}
            className={`px-3 py-1 rounded-lg transition ${
              filtroTipo === "todos" ? "bg-white text-carbon shadow-xs font-bold" : "text-carbon/60 hover:text-carbon"
            }`}
          >
            Todas ({citas.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltroTipo("instalacion")}
            className={`px-3 py-1 rounded-lg transition ${
              filtroTipo === "instalacion" ? "bg-emerald-600 text-white shadow-xs font-bold" : "text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            🛠️ Instalaciones ({totalInstalaciones})
          </button>
          <button
            type="button"
            onClick={() => setFiltroTipo("inspeccion")}
            className={`px-3 py-1 rounded-lg transition ${
              filtroTipo === "inspeccion" ? "bg-blue-600 text-white shadow-xs font-bold" : "text-blue-700 hover:bg-blue-50"
            }`}
          >
            🔍 Inspecciones ({totalInspecciones})
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="py-6 text-center text-xs text-carbon/40 animate-pulse">
          Cargando agenda de trabajo...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {citasFiltradas.map((c) => {
            const esInstalacion = c.tipo_cita === "instalacion";
            const esInspeccion = c.tipo_cita === "inspeccion";

            return (
              <div
                key={c.id}
                className={`p-3.5 rounded-xl border transition-all space-y-2 flex flex-col justify-between ${
                  esInstalacion
                    ? "border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50"
                    : esInspeccion
                    ? "border-blue-200 bg-blue-50/40 hover:bg-blue-50"
                    : "border-carbon/10 bg-slate-50 hover:bg-white"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border ${
                        esInstalacion
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : esInspeccion
                          ? "bg-blue-100 text-blue-800 border-blue-300"
                          : "bg-amber-100 text-amber-800 border-amber-300"
                      }`}
                    >
                      {esInstalacion ? "🛠️ Instalación" : esInspeccion ? "🔍 Inspección Técnica" : "🛍️ Venta / Cita"}
                    </span>
                    <span className="text-xs font-mono font-bold text-carbon/70">
                      🕒 {c.hora_inicio.slice(0, 5)} - {c.hora_fin.slice(0, 5)}
                    </span>
                  </div>

                  <p className="font-bold text-sm text-carbon leading-snug truncate">{c.cliente_nombre}</p>
                  
                  {c.fraccionamiento && (
                    <p className="text-xs font-semibold text-verde-profundo flex items-center gap-1 mt-0.5">
                      <span>📍</span> {c.fraccionamiento}
                    </p>
                  )}

                  <p className="text-[11px] text-carbon/50 mt-1">
                    📅 {new Date(c.fecha + "T00:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}
                  </p>

                  {c.notas && (
                    <p className="text-[11px] text-carbon/60 bg-white/80 p-1.5 rounded-md italic mt-1.5 border border-carbon/5 line-clamp-2">
                      "{c.notas}"
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-carbon/5">
                  <a
                    href={`https://wa.me/${c.cliente_telefono}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-100"
                  >
                    💬 WhatsApp
                  </a>

                  {c.expediente_id ? (
                    <Link
                      href={`/crm?expedienteId=${c.expediente_id}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-sauce hover:underline"
                    >
                      Ver Expediente →
                    </Link>
                  ) : (
                    <span className="text-[10px] text-carbon/40">{c.cliente_telefono}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
