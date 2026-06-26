"use client";

import { useState } from "react";
import type { UsuarioApp } from "@/app/actions/usuarios";

interface TurnoVisual {
  usuarioId: string;
  nombre: string;
  rol: "admin" | "asesor";
  disponibleLlamadas: boolean;
  inicio: string;
  fin: string;
}

const DIAS_SEMANA = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
];

function formatearHora(hora: string) {
  if (!hora) return "";
  const partes = hora.split(":");
  if (partes.length >= 2) {
    return `${partes[0]}:${partes[1]}`;
  }
  return hora;
}

export function CalendarioGuardias({ usuarios }: { usuarios: UsuarioApp[] }) {
  const [hoveredUsuarioId, setHoveredUsuarioId] = useState<string | null>(null);

  // Agrupar y ordenar los turnos por cada día de la semana
  const turnosPorDia: Record<string, TurnoVisual[]> = {};

  DIAS_SEMANA.forEach(({ key }) => {
    const turnos: TurnoVisual[] = [];
    usuarios
      .filter((u) => u.activo) // Solo usuarios activos en la plataforma
      .forEach((u) => {
        const bloques = u.horarios_guardia?.[key];
        if (Array.isArray(bloques)) {
          bloques.forEach((b) => {
            turnos.push({
              usuarioId: u.id,
              nombre: u.nombre,
              rol: u.rol,
              disponibleLlamadas: !!u.disponible_llamadas,
              inicio: b.inicio,
              fin: b.fin,
            });
          });
        }
      });

    // Ordenar cronológicamente por hora de inicio
    turnos.sort((a, b) => a.inicio.localeCompare(b.inicio));
    turnosPorDia[key] = turnos;
  });

  return (
    <div className="rounded-2xl border border-carbon/10 bg-white p-5 shadow-sm">
      {/* Encabezado */}
      <div className="mb-6">
        <h2 className="font-titular text-xl font-semibold text-verde-profundo flex items-center gap-2">
          <span>📅</span> Calendario de Guardias Semanal
        </h2>
        <p className="mt-1 text-xs text-carbon/60 leading-relaxed">
          Visualización de la cobertura del conmutador de Lunes a Domingo. 
          Pasa el cursor sobre un asesor para resaltar todas sus guardias de la semana.
        </p>
        <div className="mt-2 flex items-center gap-4 text-[10px] text-carbon/50">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sauce animate-pulse" />
            Guardia activa (Desvío de llamadas encendido)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-carbon/25" />
            Guardia programada (Desvío apagado)
          </span>
        </div>
      </div>

      {/* Grid del Calendario Semanal */}
      <div className="w-full overflow-x-auto pb-2">
        <div className="min-w-[840px] grid grid-cols-7 gap-3">
          {DIAS_SEMANA.map(({ key, label }) => {
            const turnos = turnosPorDia[key] || [];
            return (
              <div key={key} className="flex flex-col rounded-xl bg-crema/40 p-2.5 min-h-[220px]">
                {/* Cabecera del día */}
                <div className="mb-3 text-center rounded-lg bg-verde-profundo/5 py-1 text-xs font-bold text-verde-profundo tracking-wide">
                  {label}
                </div>

                {/* Lista de turnos del día */}
                <div className="flex flex-col gap-2 flex-grow">
                  {turnos.length === 0 ? (
                    <div className="flex flex-grow items-center justify-center rounded-lg border border-dashed border-carbon/10 p-3 text-center">
                      <span className="text-[10px] font-medium text-carbon/35 italic">
                        Sin guardias
                      </span>
                    </div>
                  ) : (
                    turnos.map((turno, idx) => {
                      const isHovered = hoveredUsuarioId === turno.usuarioId;
                      const hasAnyHover = hoveredUsuarioId !== null;
                      return (
                        <div
                          key={`${turno.usuarioId}-${idx}`}
                          onMouseEnter={() => setHoveredUsuarioId(turno.usuarioId)}
                          onMouseLeave={() => setHoveredUsuarioId(null)}
                          className={`group rounded-lg border p-2 text-left transition-all duration-200 ${
                            isHovered
                              ? "border-sauce bg-sauce/15 shadow-sm scale-[1.02]"
                              : hasAnyHover
                              ? "border-carbon/5 bg-white/40 opacity-40"
                              : "border-carbon/10 bg-white hover:border-sauce/40 hover:shadow-xs"
                          }`}
                        >
                          {/* Fila superior: Nombre y Estado */}
                          <div className="flex items-start justify-between gap-1">
                            <span className="truncate text-xs font-bold text-carbon group-hover:text-verde-profundo" title={turno.nombre}>
                              {turno.nombre}
                            </span>
                            <span
                              className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                                turno.disponibleLlamadas
                                  ? "bg-sauce"
                                  : "bg-carbon/25"
                              }`}
                              title={
                                turno.disponibleLlamadas
                                  ? "Guardia activa (recibe llamadas)"
                                  : "Guardia apagada"
                              }
                            />
                          </div>

                          {/* Fila intermedia: Rol */}
                          <div className="mt-0.5">
                            <span className="text-[9px] font-semibold text-carbon/40 uppercase tracking-wider">
                              {turno.rol === "admin" ? "👑 Admin" : "💼 Asesor"}
                            </span>
                          </div>

                          {/* Fila inferior: Horas */}
                          <div className="mt-1.5 flex items-center gap-1 rounded bg-carbon/5 px-1.5 py-0.5 text-[9px] font-semibold font-mono text-carbon/60 w-fit">
                            <svg className="h-3 w-3 text-carbon/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatearHora(turno.inicio)} - {formatearHora(turno.fin)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
