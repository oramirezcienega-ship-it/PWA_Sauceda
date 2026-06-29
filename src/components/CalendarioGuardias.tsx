"use client";

import { useState } from "react";
import type { UsuarioApp } from "@/app/actions/usuarios";

interface TurnoVisual {
  usuarioId: string;
  nombre: string;
  rol: "admin" | "asesor" | "operaciones";
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

function horaAMinutos(h: string): number {
  if (!h) return 0;
  const partes = h.split(":");
  const hrs = parseInt(partes[0], 10) || 0;
  const mins = parseInt(partes[1], 10) || 0;
  return hrs * 60 + mins;
}

function minutosAHora(m: number): string {
  const hrs = Math.floor(m / 60);
  const mins = m % 60;
  const hrsStr = hrs.toString().padStart(2, "0");
  const minsStr = mins.toString().padStart(2, "0");
  return `${hrsStr}:${minsStr}`;
}

interface Intervalo {
  inicio: number;
  fin: number;
}

function obtenerAnalisisCobertura(turnos: TurnoVisual[]) {
  const LAB_INICIO = 540; // 09:00
  const LAB_FIN = 1080;  // 18:00

  // 1. Convertir turnos a intervalos en minutos
  const intervalos: Intervalo[] = turnos.map(t => ({
    inicio: horaAMinutos(t.inicio),
    fin: horaAMinutos(t.fin)
  }));

  // 2. Ordenar intervalos por inicio
  intervalos.sort((a, b) => a.inicio - b.inicio);

  // 3. Fusionar intervalos superpuestos
  const fusionados: Intervalo[] = [];
  intervalos.forEach(curr => {
    if (fusionados.length === 0) {
      fusionados.push({ ...curr });
    } else {
      const last = fusionados[fusionados.length - 1];
      if (curr.inicio <= last.fin) {
        last.fin = Math.max(last.fin, curr.fin);
      } else {
        fusionados.push({ ...curr });
      }
    }
  });

  // 4. Calcular bloques de 1 hora para el timeline (9-10, 10-11, etc.)
  const bloquesHorarios = Array.from({ length: 9 }, (_, idx) => {
    const inicioBloque = LAB_INICIO + idx * 60;
    const finBloque = inicioBloque + 60;

    let minsCubiertos = 0;
    fusionados.forEach(f => {
      const overlapInicio = Math.max(inicioBloque, f.inicio);
      const overlapFin = Math.min(finBloque, f.fin);
      if (overlapInicio < overlapFin) {
        minsCubiertos += (overlapFin - overlapInicio);
      }
    });

    const porcentaje = (minsCubiertos / 60) * 100;
    return {
      label: `${minutosAHora(inicioBloque)} - ${minutosAHora(finBloque)}`,
      porcentaje,
      cubierto: porcentaje >= 90,
      parcial: porcentaje > 0 && porcentaje < 90
    };
  });

  // 5. Calcular los intervalos desprotegidos dentro del horario laboral
  const vaciosLaborales: Intervalo[] = [];
  let cursor = LAB_INICIO;

  fusionados.forEach(f => {
    if (f.inicio > cursor) {
      const vacioInicio = Math.max(LAB_INICIO, cursor);
      const vacioFin = Math.min(LAB_FIN, f.inicio);
      if (vacioInicio < vacioFin) {
        vaciosLaborales.push({ inicio: vacioInicio, fin: vacioFin });
      }
    }
    cursor = Math.max(cursor, f.fin);
  });

  if (cursor < LAB_FIN) {
    const vacioInicio = Math.max(LAB_INICIO, cursor);
    const vacioFin = LAB_FIN;
    if (vacioInicio < vacioFin) {
      vaciosLaborales.push({ inicio: vacioInicio, fin: vacioFin });
    }
  }

  const textosVacios = vaciosLaborales.map(v => 
    `${minutosAHora(v.inicio)} - ${minutosAHora(v.fin)}`
  );

  let minutosLaboralesCubiertos = 0;
  fusionados.forEach(f => {
    const overlapInicio = Math.max(LAB_INICIO, f.inicio);
    const overlapFin = Math.min(LAB_FIN, f.fin);
    if (overlapInicio < overlapFin) {
      minutosLaboralesCubiertos += (overlapFin - overlapInicio);
    }
  });

  const totalLaboral = LAB_FIN - LAB_INICIO;
  const porcentajeTotal = Math.round((minutosLaboralesCubiertos / totalLaboral) * 100);

  return {
    bloquesHorarios,
    textosVacios,
    porcentajeTotal,
    estaCompleto: porcentajeTotal >= 100,
    sinCobertura: porcentajeTotal === 0
  };
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
            const infoCobertura = obtenerAnalisisCobertura(turnos);
            return (
              <div key={key} className="flex flex-col rounded-xl bg-crema/40 p-2.5 min-h-[220px]">
                {/* Cabecera del día */}
                <div className="mb-3 text-center rounded-lg bg-verde-profundo/5 py-1 text-xs font-bold text-verde-profundo tracking-wide">
                  {label}
                </div>

                {/* Análisis de Cobertura */}
                <div className="mb-3 rounded-xl border border-carbon/5 bg-white p-2.5 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-bold text-carbon/40 uppercase tracking-wider">Cobertura Laboral</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      infoCobertura.estaCompleto 
                        ? "bg-sauce/15 text-verde-profundo" 
                        : infoCobertura.sinCobertura 
                        ? "bg-rojo/10 text-rojo" 
                        : "bg-amber-100 text-amber-800"
                    }`}>
                      {infoCobertura.porcentajeTotal}%
                    </span>
                  </div>
                  
                  {/* Timeline de 9 segmentos */}
                  <div className="flex gap-0.5 h-2 w-full bg-carbon/5 rounded overflow-hidden mb-1.5">
                    {infoCobertura.bloquesHorarios.map((b, i) => (
                      <div
                        key={i}
                        className={`flex-grow h-full rounded-sm transition-all ${
                          b.cubierto 
                            ? "bg-sauce" 
                            : b.parcial 
                            ? "bg-amber-400" 
                            : "bg-carbon/10 hover:bg-carbon/15"
                        }`}
                        title={`${b.label}: ${b.cubierto ? "Cubierto" : b.parcial ? "Parcial" : "Sin cubrir"}`}
                      />
                    ))}
                  </div>
                  
                  {/* Texto explicativo */}
                  <div className="text-[9px] leading-tight">
                    {infoCobertura.estaCompleto && (
                      <span className="text-verde-profundo font-semibold flex items-center gap-0.5">
                        ✅ 100% Cubierto (09-18h)
                      </span>
                    )}
                    {infoCobertura.sinCobertura && (
                      <span className="text-rojo font-semibold flex items-center gap-0.5">
                        ⚠️ Horario descubierto
                      </span>
                    )}
                    {!infoCobertura.estaCompleto && !infoCobertura.sinCobertura && (
                      <div className="text-amber-800 font-medium">
                        <span className="font-bold">Libre:</span>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {infoCobertura.textosVacios.map((v, idx) => (
                            <span key={idx} className="bg-amber-50 border border-amber-200/50 px-1 rounded font-mono text-[8px] text-amber-950">
                              {v}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
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
