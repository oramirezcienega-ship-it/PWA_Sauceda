"use client";

import { useEffect, useState } from "react";
import {
  crearActividadManual,
  listarActividadesDeExpediente,
  listarActividadesDeProspecto,
} from "@/app/actions/actividades";
import { obtenerCitasDeEntidad, type Cita } from "@/app/actions/agenda";
import type { Actividad, TipoActividad } from "@/lib/types";

interface ActividadesConExpedienteProps {
  expedienteId?: string | null;
  prospectoId?: string | null;
  asesorNombreDefault?: string | null;
  operadorNombreDefault?: string | null;
}

export interface ActividadItem {
  id: string;
  origen: "actividad" | "cita";
  tipo: string;
  titulo: string;
  detalle?: string;
  fechaISO: string;
  responsable: string;
  estatus: "pendiente" | "completada" | "cancelada";
}

const ICONO_TIPO: Record<string, string> = {
  llamada: "📞",
  inspeccion: "🔍",
  instalacion: "🛠️",
  visita: "🔍",
  reunion: "🤝",
  nota: "📝",
  correo: "✉️",
  mensaje: "💬",
  etapa: "🔀",
  creacion: "✨",
  construccion: "🏗️",
  sistema: "⚙️",
};

const NOMBRES_TIPO: Record<string, string> = {
  llamada: "Llamada",
  inspeccion: "Inspección Técnica",
  instalacion: "Instalación",
  visita: "Visita Técnica",
  reunion: "Reunión",
  nota: "Nota / Bitácora",
  correo: "Correo Electrónico",
  mensaje: "Mensaje WhatsApp",
};

export function formatoFechaHoraSegundo(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return (
      new Intl.DateTimeFormat("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(d) + " hrs"
    );
  } catch {
    return iso;
  }
}

export function ActividadesConExpediente({
  expedienteId,
  prospectoId,
  asesorNombreDefault,
  operadorNombreDefault,
}: ActividadesConExpedienteProps) {
  const [items, setItems] = useState<ActividadItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstatus, setFiltroEstatus] = useState<"todas" | "pendientes" | "completadas">("todas");
  
  // State para agregar nueva actividad
  const [mostrarForm, setMostrarForm] = useState(false);
  const [tipo, setTipo] = useState<TipoActividad>("llamada");
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [fechaProg, setFechaProg] = useState("");
  const [horaProg, setHoraProg] = useState("");
  const [responsableInput, setResponsableInput] = useState(asesorNombreDefault || operadorNombreDefault || "Asesor / Operador");
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const unificadas: ActividadItem[] = [];

      // 1. Obtener Citas de la agenda (Inspecciones, Instalaciones, Llamadas)
      if (prospectoId || expedienteId) {
        const citasData: Cita[] = await obtenerCitasDeEntidad(prospectoId, expedienteId);
        citasData.forEach((c) => {
          const fechaCompletaISO = `${c.fecha}T${c.hora_inicio || "09:00:00"}`;
          let estatusFinal: "pendiente" | "completada" | "cancelada" = "pendiente";
          if (c.estado === "confirmada" || (c as any).estado === "completada") {
            estatusFinal = "completada";
          } else if (c.estado === "cancelada") {
            estatusFinal = "cancelada";
          }

          unificadas.push({
            id: `cita-${c.id}`,
            origen: "cita",
            tipo: c.tipo_cita || "visita",
            titulo: `${NOMBRES_TIPO[c.tipo_cita] || c.tipo_cita} - ${c.cliente_nombre}`,
            detalle: c.notas || `Horario: ${c.hora_inicio} a ${c.hora_fin}`,
            fechaISO: fechaCompletaISO,
            responsable: c.perfil_nombre || asesorNombreDefault || operadorNombreDefault || "Técnico Asignado",
            estatus: estatusFinal,
          });
        });
      }

      // 2. Obtener Actividades manuales / automáticas
      let actData: Actividad[] = [];
      if (expedienteId) {
        actData = await listarActividadesDeExpediente(expedienteId);
      } else if (prospectoId) {
        actData = await listarActividadesDeProspecto(prospectoId);
      }

      actData.forEach((a) => {
        // Analizar si en el detalle viene "Programada para:" o si la fecha ya ocurrió
        const esProgramada = a.detalle?.includes("Programada para:") || a.detalle?.includes("📅");
        const estatusFinal: "pendiente" | "completada" = esProgramada ? "pendiente" : "completada";

        unificadas.push({
          id: `act-${a.id}`,
          origen: "actividad",
          tipo: a.tipo,
          titulo: a.titulo,
          detalle: a.detalle,
          fechaISO: a.fecha,
          responsable: asesorNombreDefault || operadorNombreDefault || "Asesor Comercial",
          estatus: estatusFinal,
        });
      });

      // Ordenar cronológicamente descendente (más recientes / próximas primero)
      unificadas.sort((a, b) => new Date(b.fechaISO).getTime() - new Date(a.fechaISO).getTime());

      setItems(unificadas);
    } catch (err) {
      console.error("Error al cargar actividades del expediente:", err);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, [expedienteId, prospectoId]);

  async function registrar() {
    if (!titulo.trim()) return;
    setGuardando(true);
    try {
      let detalleFinal = detalle.trim();
      if (fechaProg) {
        const infoFecha = `📅 Programada para: ${fechaProg}${horaProg ? ` a las ${horaProg}:00 hrs` : ""}`;
        detalleFinal = detalleFinal ? `${infoFecha}\n${detalleFinal}` : infoFecha;
      }
      if (responsableInput) {
        detalleFinal = `${detalleFinal}\n👤 Responsable: ${responsableInput}`.trim();
      }

      await crearActividadManual({
        expedienteId: expedienteId ?? null,
        prospectoId: prospectoId ?? null,
        tipo,
        titulo: titulo.trim(),
        detalle: detalleFinal,
      });

      setTitulo("");
      setDetalle("");
      setFechaProg("");
      setHoraProg("");
      setTipo("llamada");
      setMostrarForm(false);
      await cargar();
    } catch (err) {
      console.error("Error al registrar actividad:", err);
    } finally {
      setGuardando(false);
    }
  }

  const itemsFiltrados = items.filter((i) => {
    if (filtroEstatus === "pendientes") return i.estatus === "pendiente";
    if (filtroEstatus === "completadas") return i.estatus === "completada";
    return true;
  });

  const numPendientes = items.filter((i) => i.estatus === "pendiente").length;
  const numCompletadas = items.filter((i) => i.estatus === "completada").length;

  return (
    <div className="rounded-2xl border border-carbon/10 bg-white p-4 sm:p-6 shadow-sm space-y-4">
      {/* Header con Título Requerido */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-carbon/5 pb-3">
        <div>
          <h3 className="font-titular text-base sm:text-lg font-bold text-verde-profundo flex items-center gap-2 uppercase tracking-wide">
            <span>📋</span> Actividades con el expediente
          </h3>
          <p className="text-xs text-carbon/50 mt-0.5">
            Llamadas, inspecciones, instalaciones y compromisos de seguimiento
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de Filtro */}
          <div className="flex rounded-lg border border-carbon/15 bg-carbon/5 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFiltroEstatus("todas")}
              className={`rounded-md px-2.5 py-1 transition ${
                filtroEstatus === "todas" ? "bg-white text-verde-profundo shadow-2xs" : "text-carbon/60 hover:text-carbon"
              }`}
            >
              Todas ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroEstatus("pendientes")}
              className={`rounded-md px-2.5 py-1 transition ${
                filtroEstatus === "pendientes" ? "bg-white text-amber-700 shadow-2xs" : "text-carbon/60 hover:text-carbon"
              }`}
            >
              ⏳ Pendientes ({numPendientes})
            </button>
            <button
              type="button"
              onClick={() => setFiltroEstatus("completadas")}
              className={`rounded-md px-2.5 py-1 transition ${
                filtroEstatus === "completadas" ? "bg-white text-emerald-700 shadow-2xs" : "text-carbon/60 hover:text-carbon"
              }`}
            >
              🟢 Completadas ({numCompletadas})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMostrarForm(!mostrarForm)}
            className="rounded-lg bg-sauce hover:bg-verde-profundo text-white px-3 py-1.5 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
          >
            {mostrarForm ? "Cancelar" : "+ Nueva Actividad"}
          </button>
        </div>
      </div>

      {/* Formulario de Registro Rápido */}
      {mostrarForm && (
        <div className="rounded-xl border border-sauce/20 bg-sauce/5 p-4 space-y-3">
          <h4 className="text-xs font-bold text-verde-profundo uppercase tracking-wider">
            Registrar o Programar Actividad
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-carbon/60 uppercase mb-1">Tipo de Actividad</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoActividad)}
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce outline-none"
              >
                <option value="llamada">📞 Llamada Telefónica</option>
                <option value="inspeccion">🔍 Inspección Técnica</option>
                <option value="instalacion">🛠️ Instalación</option>
                <option value="visita">🔍 Visita Técnica</option>
                <option value="reunion">🤝 Reunión Presencial</option>
                <option value="nota">📝 Nota de Seguimiento</option>
                <option value="correo">✉️ Correo Electrónico</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-carbon/60 uppercase mb-1">Título / Asunto *</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej. Llamar para acordar presupuesto de impermeabilización"
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-carbon/60 uppercase mb-1">Fecha Programada (opcional)</label>
              <input
                type="date"
                value={fechaProg}
                onChange={(e) => setFechaProg(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs text-carbon focus:border-sauce outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-carbon/60 uppercase mb-1">Hora Programada (opcional)</label>
              <input
                type="time"
                value={horaProg}
                onChange={(e) => setHoraProg(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs text-carbon focus:border-sauce outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-carbon/60 uppercase mb-1">Responsable</label>
              <input
                type="text"
                value={responsableInput}
                onChange={(e) => setResponsableInput(e.target.value)}
                placeholder="Nombre del asesor o operador"
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-carbon/60 uppercase mb-1">Detalles / Observaciones</label>
            <textarea
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              rows={2}
              placeholder="Detalles adicionales, acuerdos previas u observaciones..."
              className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setMostrarForm(false)}
              className="px-3 py-1.5 rounded-lg border border-carbon/15 text-xs text-carbon/70 hover:bg-carbon/5"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={registrar}
              disabled={!titulo.trim() || guardando}
              className="px-4 py-1.5 rounded-lg bg-sauce hover:bg-verde-profundo text-white text-xs font-bold transition disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar Actividad"}
            </button>
          </div>
        </div>
      )}

      {/* Lista de Actividades */}
      {cargando ? (
        <div className="py-8 text-center text-xs text-carbon/40 font-mono">
          Cargando actividades del expediente...
        </div>
      ) : itemsFiltrados.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-carbon/15 rounded-xl bg-slate-50/50 space-y-1">
          <p className="text-xs font-semibold text-carbon/60">No se encontraron actividades en esta categoría.</p>
          <p className="text-[11px] text-carbon/40">Utiliza el botón superior para agregar compromisos o llamadas.</p>
        </div>
      ) : (
        <div className="divide-y divide-carbon/10">
          {itemsFiltrados.map((item) => (
            <div key={item.id} className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:bg-slate-50/50 rounded-lg px-2 transition">
              <div className="flex items-start gap-3 flex-1">
                <span className="text-xl p-2 rounded-xl bg-carbon/5 shrink-0 select-none">
                  {ICONO_TIPO[item.tipo] || "📋"}
                </span>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-xs sm:text-sm font-bold text-verde-profundo">
                      {item.titulo}
                    </h4>

                    {/* Badge Tipo */}
                    <span className="rounded-md bg-carbon/5 px-2 py-0.5 text-[10px] font-semibold text-carbon/70 uppercase">
                      {NOMBRES_TIPO[item.tipo] || item.tipo}
                    </span>

                    {/* Badge Estatus */}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        item.estatus === "completada"
                          ? "bg-emerald-100 text-emerald-800"
                          : item.estatus === "cancelada"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-800 animate-pulse"
                      }`}
                    >
                      {item.estatus === "completada"
                        ? "🟢 Completada"
                        : item.estatus === "cancelada"
                        ? "🔴 Cancelada"
                        : "⏳ Pendiente / Programada"}
                    </span>
                  </div>

                  {item.detalle && (
                    <p className="text-xs text-carbon/75 whitespace-pre-line leading-relaxed">
                      {item.detalle}
                    </p>
                  )}

                  {/* Metadatos: Responsable y Fecha con hora, min, seg */}
                  <div className="flex items-center gap-4 text-[11px] text-carbon/50 pt-1 font-mono flex-wrap">
                    <span className="flex items-center gap-1">
                      👤 <strong className="font-semibold text-carbon/70 font-sans">Responsable:</strong> {item.responsable}
                    </span>

                    <span className="flex items-center gap-1">
                      🗓️ <strong className="font-semibold text-carbon/70 font-sans">Fecha y Hora:</strong> {formatoFechaHoraSegundo(item.fechaISO)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
