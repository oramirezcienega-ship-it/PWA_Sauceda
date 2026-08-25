"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  obtenerProximasCitasEInstalaciones,
  programarCitaManual,
  reagendarCitaCompleta,
  cancelarCitaConMotivo,
  type Cita,
} from "@/app/actions/agenda";
import { concluirTareaYProgramarSiguiente } from "@/app/actions/bpm";
import { obtenerUsuarioActual, listarPerfilesActivos } from "@/app/actions/usuarios";

interface ProximasVisitasWidgetProps {
  perfilId?: string | null;
}

interface PerfilSimple {
  id: string;
  nombre: string;
  rol: string;
}

/** Formatea fechas de forma segura evitando problemas de zona horaria (UTC vs Local) */
function formatearFechaSegura(fechaStr: string): string {
  if (!fechaStr) return "";
  const partes = fechaStr.slice(0, 10).split("-").map(Number);
  if (partes.length < 3 || isNaN(partes[0])) return fechaStr;
  const dateObj = new Date(partes[0], partes[1] - 1, partes[2]);
  return dateObj.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function ProximasVisitasWidget({ perfilId }: ProximasVisitasWidgetProps) {
  const [citas, setCitas] = useState<Cita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [perfiles, setPerfiles] = useState<PerfilSimple[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "instalacion" | "inspeccion" | "llamada">("todos");

  // Modal para captura de retro / resultado de la llamada o cita
  const [citaSelModal, setCitaSelModal] = useState<Cita | null>(null);
  const [resultadoTipo, setResultadoTipo] = useState<"agendado" | "reintentar" | "frio" | "completado">("agendado");
  const [observacionesModal, setObservacionesModal] = useState("");
  const [fechaAgendada, setFechaAgendada] = useState(new Date().toISOString().slice(0, 10));
  const [horaAgendada, setHoraAgendada] = useState("10:00");
  const [guardandoModal, setGuardandoModal] = useState(false);

  // Panel de Configuración de Cita (Reagendamiento)
  const [citaReagendarModal, setCitaReagendarModal] = useState<Cita | null>(null);
  const [reagendarPerfilId, setReagendarPerfilId] = useState("");
  const [reagendarTipoCita, setReagendarTipoCita] = useState<"inspeccion" | "instalacion" | "llamada" | "venta" | "asesoria">("inspeccion");
  const [reagendarFecha, setReagendarFecha] = useState("");
  const [reagendarHoraInicio, setReagendarHoraInicio] = useState("10:00");
  const [reagendarHoraFin, setReagendarHoraFin] = useState("11:00");
  const [reagendarNotas, setReagendarNotas] = useState("");
  const [reagendarNotificarWsp, setReagendarNotificarWsp] = useState(true);
  const [guardandoReagendado, setGuardandoReagendado] = useState(false);

  // Modal de Cancelación de Cita
  const [citaCancelarModal, setCitaCancelarModal] = useState<Cita | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const [guardandoCancelado, setGuardandoCancelado] = useState(false);

  const cargarAgenda = useCallback(async () => {
    setCargando(true);
    try {
      let pId = perfilId;
      if (!pId) {
        const u = await obtenerUsuarioActual();
        if (u && u.rol !== "admin") {
          pId = u.id;
        }
      }
      const data = await obtenerProximasCitasEInstalaciones(pId);
      setCitas(data);
    } catch {
      // ignore
    } finally {
      setCargando(false);
    }
  }, [perfilId]);

  useEffect(() => {
    cargarAgenda();
    // Cargar catálogo de asesores/técnicos activos
    listarPerfilesActivos()
      .then((res) => setPerfiles(res))
      .catch(() => {});
  }, [cargarAgenda]);

  function handleAbrirModalResultado(cita: Cita) {
    setCitaSelModal(cita);
    setObservacionesModal("");
    const esLlamada = cita.tipo_cita === "llamada";
    setResultadoTipo(esLlamada ? "agendado" : "completado");
  }

  async function handleGuardarResultadoModal() {
    if (!citaSelModal) return;
    setGuardandoModal(true);
    try {
      const expedienteId = citaSelModal.expediente_id || null;
      const prospectoId = citaSelModal.prospecto_id || null;

      let tituloBitacora = `Cita / Llamada "${citaSelModal.tipo_cita || 'Llamada'}" atendida`;

      if (resultadoTipo === "agendado") {
        tituloBitacora = `🟢 Cita / Visita Agendada: ${fechaAgendada} a las ${horaAgendada} hrs`;

        await programarCitaManual({
          expedienteId,
          prospectoId,
          perfilId: citaSelModal.perfil_id,
          clienteNombre: citaSelModal.cliente_nombre,
          clienteTelefono: citaSelModal.cliente_telefono || "",
          tipoCita: "inspeccion",
          fecha: fechaAgendada,
          horaInicio: horaAgendada,
          horaFin: `${horaAgendada.slice(0, 2)}:30`,
          notas: `Inspección agendada tras llamada. ${observacionesModal}`,
          notificarCliente: true
        });
      } else if (resultadoTipo === "reintentar") {
        tituloBitacora = `🟡 Reintento de Llamada Programado: ${fechaAgendada} a las ${horaAgendada} hrs`;

        await programarCitaManual({
          expedienteId,
          prospectoId,
          perfilId: citaSelModal.perfil_id,
          clienteNombre: citaSelModal.cliente_nombre,
          clienteTelefono: citaSelModal.cliente_telefono || "",
          tipoCita: "llamada",
          fecha: fechaAgendada,
          horaInicio: horaAgendada,
          horaFin: `${horaAgendada.slice(0, 2)}:15`,
          notas: `Reintento de llamada. ${observacionesModal}`,
        });
      } else if (resultadoTipo === "frio") {
        tituloBitacora = `🔴 Cliente Descartado / Prospecto Frío`;
        if (expedienteId) {
          const { cambiarCalificacionExpediente } = await import("@/app/actions/expedientes");
          await cambiarCalificacionExpediente(expedienteId, "frio");
        } else if (prospectoId) {
          const { cambiarCalificacionMasivo } = await import("@/app/actions/prospectos");
          await cambiarCalificacionMasivo([prospectoId], "frio");
        }
      }

      await concluirTareaYProgramarSiguiente({
        expedienteId,
        prospectoId,
        citaId: citaSelModal.id,
        resultadoNotas: `${tituloBitacora}. ${observacionesModal ? `Notas: ${observacionesModal}` : ''}`,
        reprogramarSiguiente: false,
      });

      setCitaSelModal(null);
      await cargarAgenda();
    } catch (err: any) {
      console.error("Error al guardar resultado de agenda:", err);
      alert("Error al guardar resultado: " + err.message);
    } finally {
      setGuardandoModal(false);
    }
  }

  // Abre el Panel de Configuración de Cita (Reagendamiento)
  function handleAbrirReagendarModal(cita: Cita) {
    setCitaReagendarModal(cita);
    setReagendarPerfilId(cita.perfil_id || "");
    setReagendarTipoCita(cita.tipo_cita || "inspeccion");
    setReagendarFecha(cita.fecha || new Date().toISOString().slice(0, 10));
    setReagendarHoraInicio(cita.hora_inicio ? cita.hora_inicio.slice(0, 5) : "10:00");
    setReagendarHoraFin(cita.hora_fin ? cita.hora_fin.slice(0, 5) : "11:00");
    setReagendarNotas(cita.notas || "");
    setReagendarNotificarWsp(true);
  }

  // Guarda el reagendamiento (Cancela cita previa y crea la nueva)
  async function handleGuardarReagendamiento() {
    if (!citaReagendarModal) return;
    if (!reagendarFecha || !reagendarHoraInicio || !reagendarHoraFin) {
      alert("Por favor indica la fecha y franja horaria.");
      return;
    }
    setGuardandoReagendado(true);
    try {
      const res = await reagendarCitaCompleta({
        citaAnteriorId: citaReagendarModal.id,
        perfilId: reagendarPerfilId || citaReagendarModal.perfil_id,
        tipoCita: reagendarTipoCita,
        fecha: reagendarFecha,
        horaInicio: reagendarHoraInicio,
        horaFin: reagendarHoraFin,
        notas: reagendarNotas,
        notificarCliente: reagendarNotificarWsp,
      });

      if (!res.ok) {
        alert("No se pudo reagendar: " + res.error);
        return;
      }

      setCitaReagendarModal(null);
      await cargarAgenda();
    } catch (err: any) {
      console.error("Error al reagendar cita:", err);
      alert("Error al reagendar cita: " + err.message);
    } finally {
      setGuardandoReagendado(false);
    }
  }

  // Abre el modal de cancelación
  function handleAbrirCancelarModal(cita: Cita) {
    setCitaCancelarModal(cita);
    setMotivoCancelar("");
  }

  // Guarda la cancelación de cita
  async function handleGuardarCancelacion() {
    if (!citaCancelarModal) return;
    setGuardandoCancelado(true);
    try {
      const res = await cancelarCitaConMotivo({
        citaId: citaCancelarModal.id,
        motivo: motivoCancelar.trim(),
      });

      if (!res.ok) {
        alert("Error al cancelar cita: " + res.error);
        return;
      }

      setCitaCancelarModal(null);
      await cargarAgenda();
    } catch (err: any) {
      console.error("Error al cancelar cita:", err);
      alert("Error al cancelar cita: " + err.message);
    } finally {
      setGuardandoCancelado(false);
    }
  }

  const citasFiltradas = citas.filter((c) => {
    if (filtroTipo === "instalacion") return c.tipo_cita === "instalacion";
    if (filtroTipo === "inspeccion") return c.tipo_cita === "inspeccion";
    if (filtroTipo === "llamada") return c.tipo_cita === "llamada";
    return true;
  });

  const totalInstalaciones = citas.filter((c) => c.tipo_cita === "instalacion").length;
  const totalInspecciones = citas.filter((c) => c.tipo_cita === "inspeccion").length;
  const totalLlamadas = citas.filter((c) => c.tipo_cita === "llamada").length;

  return (
    <div className="mb-6 rounded-2xl border border-carbon/10 bg-white p-4 sm:p-5 shadow-sm space-y-3.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-titular text-base sm:text-lg font-bold text-carbon flex items-center gap-2">
            <span>🗓️</span> Próximas Citas, Llamadas e Instalaciones
          </h3>
          <p className="text-xs text-carbon/50">
            Agenda del técnico y asesor con llamadas, inspecciones e instalaciones programadas
          </p>
        </div>

        {/* Filtros por tipo de actividad */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold flex-wrap">
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
          <button
            type="button"
            onClick={() => setFiltroTipo("llamada")}
            className={`px-3 py-1 rounded-lg transition ${
              filtroTipo === "llamada" ? "bg-amber-600 text-white shadow-xs font-bold" : "text-amber-700 hover:bg-amber-50"
            }`}
          >
            📞 Llamadas ({totalLlamadas})
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="py-6 text-center text-xs text-carbon/40 animate-pulse">
          Cargando agenda de trabajo...
        </div>
      ) : citasFiltradas.length === 0 ? (
        <div className="py-6 px-4 text-center border border-dashed border-carbon/15 rounded-xl bg-slate-50/50">
          <span className="text-2xl block mb-1">✨</span>
          <p className="text-xs font-bold text-verde-profundo">No tienes citas ni llamadas programadas pendientes.</p>
          <p className="text-[11px] text-carbon/45 mt-0.5">Tus actividades operativas del día están al corriente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {citasFiltradas.map((c) => {
            const esInstalacion = c.tipo_cita === "instalacion";
            const esInspeccion = c.tipo_cita === "inspeccion";
            const esLlamada = c.tipo_cita === "llamada";

            return (
              <div
                key={c.id}
                className={`p-3.5 rounded-xl border transition-all space-y-2 flex flex-col justify-between ${
                  esInstalacion
                    ? "border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50"
                    : esInspeccion
                    ? "border-blue-200 bg-blue-50/40 hover:bg-blue-50"
                    : esLlamada
                    ? "border-amber-200 bg-amber-50/40 hover:bg-amber-50"
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
                          : esLlamada
                          ? "bg-amber-100 text-amber-800 border-amber-300"
                          : "bg-slate-100 text-slate-800 border-slate-300"
                      }`}
                    >
                      {esInstalacion ? "🛠️ Instalación" : esInspeccion ? "🔍 Inspección Técnica" : esLlamada ? "📞 Llamada Programada" : "🛍️ Venta / Cita"}
                    </span>
                    <span className="text-xs font-mono font-bold text-carbon/70">
                      🕒 {c.hora_inicio.slice(0, 5)} - {c.hora_fin.slice(0, 5)}
                    </span>
                  </div>

                  <p className="font-bold text-sm text-carbon leading-snug truncate">{c.cliente_nombre}</p>
                  
                  {c.perfil_nombre && (
                    <p className="text-[11px] font-semibold text-sauce flex items-center gap-1 mt-0.5">
                      <span>👤</span> Responsable: <span className="font-bold">{c.perfil_nombre}</span>
                    </p>
                  )}

                  {c.fraccionamiento && (
                    <p className="text-xs font-semibold text-verde-profundo flex items-center gap-1 mt-0.5">
                      <span>📍</span> {c.fraccionamiento}
                    </p>
                  )}

                  <p className="text-[11px] text-carbon/50 mt-1">
                    📅 {formatearFechaSegura(c.fecha)}
                  </p>

                  {c.notas && (
                    <p className="text-[11px] text-carbon/60 bg-white/80 p-1.5 rounded-md italic mt-1.5 border border-carbon/5 line-clamp-2">
                      "{c.notas}"
                    </p>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-carbon/5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`https://wa.me/${c.cliente_telefono}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-100"
                      >
                        💬 WhatsApp
                      </a>

                      {c.cliente_telefono && (
                        <a
                          href={`tel:${c.cliente_telefono}`}
                          onClick={() => setTimeout(() => handleAbrirModalResultado(c), 500)}
                          className="inline-flex items-center gap-1 rounded-lg border border-sauce/20 bg-sauce/10 px-2 py-1 text-xs font-semibold text-sauce transition hover:bg-sauce hover:text-white"
                        >
                          📞 Llamar
                        </a>
                      )}
                    </div>

                    {c.expediente_id ? (
                      <Link
                        href={`/expediente/${c.expediente_id}`}
                        className="inline-flex items-center gap-0.5 text-xs font-bold text-sauce hover:underline"
                      >
                        Ver →
                      </Link>
                    ) : null}
                  </div>

                  {/* Acciones directas de Gestión de Citas (Reagendar / Cancelar / Concluir) */}
                  <div className="flex items-center justify-between gap-1.5 pt-1">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleAbrirReagendarModal(c)}
                        title="Reagendar esta cita con nueva fecha/hora o responsable"
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 px-2 py-1 text-[11px] font-bold transition cursor-pointer"
                      >
                        📅 Reagendar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAbrirCancelarModal(c)}
                        title="Cancelar esta cita y asentar motivo"
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 px-2 py-1 text-[11px] font-bold transition cursor-pointer"
                      >
                        ❌ Cancelar
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAbrirModalResultado(c)}
                      className="inline-flex items-center gap-1 rounded-lg bg-sauce hover:bg-verde-profundo text-white px-2 py-1 text-[11px] font-bold transition shadow-2xs cursor-pointer"
                    >
                      ✓ Retro
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal 1: Panel de Configuración / Reagendamiento de Cita */}
      {citaReagendarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-xl space-y-4 border border-carbon/10 text-carbon my-8">
            <div className="flex items-start justify-between border-b border-carbon/10 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">
                  ⚙️ Panel de Configuración de Cita
                </span>
                <h3 className="font-titular text-base font-bold text-verde-profundo">
                  Reagendar cita para {citaReagendarModal.cliente_nombre}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCitaReagendarModal(null)}
                className="text-carbon/40 hover:text-carbon font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-[11px]">
                💡 Al reagendar, la cita original del <strong>{formatearFechaSegura(citaReagendarModal.fecha)}</strong> se marcará como cancelada/reagendada y se creará el nuevo registro.
              </div>

              {/* Responsable asignado */}
              <div>
                <label className="block text-[11px] font-bold text-carbon/70 uppercase mb-1">
                  1. Asesor / Técnico Responsable:
                </label>
                <select
                  value={reagendarPerfilId}
                  onChange={(e) => setReagendarPerfilId(e.target.value)}
                  className="w-full rounded-lg border border-carbon/20 bg-white p-2 text-xs font-semibold text-carbon focus:border-sauce"
                >
                  <option value="">-- Seleccionar Responsable --</option>
                  {perfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.rol})
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo de Cita */}
              <div>
                <label className="block text-[11px] font-bold text-carbon/70 uppercase mb-1">
                  2. Tipo de Cita / Actividad:
                </label>
                <select
                  value={reagendarTipoCita}
                  onChange={(e) => setReagendarTipoCita(e.target.value as any)}
                  className="w-full rounded-lg border border-carbon/20 bg-white p-2 text-xs font-semibold text-carbon focus:border-sauce"
                >
                  <option value="inspeccion">🔍 Inspección Técnica en Sitio</option>
                  <option value="instalacion">🛠️ Instalación Profesional</option>
                  <option value="llamada">📞 Llamada Telefónica</option>
                  <option value="venta">🛍️ Cita Comercial / Venta</option>
                  <option value="asesoria">💬 Asesoría Técnica</option>
                </select>
              </div>

              {/* Fecha y Franja Horaria */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-slate-50 border border-carbon/10 rounded-xl">
                <div>
                  <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                    Nueva Fecha
                  </label>
                  <input
                    type="date"
                    value={reagendarFecha}
                    onChange={(e) => setReagendarFecha(e.target.value)}
                    className="w-full rounded border border-carbon/20 bg-white px-2 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                    Hora Inicio
                  </label>
                  <input
                    type="time"
                    value={reagendarHoraInicio}
                    onChange={(e) => setReagendarHoraInicio(e.target.value)}
                    className="w-full rounded border border-carbon/20 bg-white px-2 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                    Hora Fin
                  </label>
                  <input
                    type="time"
                    value={reagendarHoraFin}
                    onChange={(e) => setReagendarHoraFin(e.target.value)}
                    className="w-full rounded border border-carbon/20 bg-white px-2 py-1.5 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-[11px] font-bold text-carbon/70 uppercase mb-1">
                  Observaciones / Instrucciones:
                </label>
                <textarea
                  rows={2}
                  value={reagendarNotas}
                  onChange={(e) => setReagendarNotas(e.target.value)}
                  placeholder="Ej. El cliente solicitó posponer por viaje. Acceso por la calle lateral."
                  className="w-full rounded-lg border border-carbon/20 bg-white p-2.5 text-xs text-carbon outline-none focus:border-sauce"
                />
              </div>

              {/* Opción WhatsApp */}
              <label className="flex items-center gap-2 cursor-pointer bg-green-50/70 p-2.5 rounded-xl border border-green-200 text-green-900 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={reagendarNotificarWsp}
                  onChange={(e) => setReagendarNotificarWsp(e.target.checked)}
                  className="rounded text-sauce focus:ring-sauce h-4 w-4"
                />
                <span>Enviar confirmación automática por WhatsApp al cliente</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-carbon/10">
              <button
                type="button"
                onClick={() => setCitaReagendarModal(null)}
                className="rounded-lg border border-carbon/20 px-3.5 py-1.5 text-xs font-bold text-carbon/60 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarReagendamiento}
                disabled={guardandoReagendado}
                className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-4 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
              >
                {guardandoReagendado ? "Guardando..." : "💾 Confirmar y Reagendar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Cancelación de Cita */}
      {citaCancelarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-xl space-y-4 border border-carbon/10 text-carbon">
            <div className="flex items-start justify-between border-b border-carbon/10 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 block">
                  🚫 Cancelación de Cita
                </span>
                <h3 className="font-titular text-base font-bold text-carbon">
                  Cancelar cita de {citaCancelarModal.cliente_nombre}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCitaCancelarModal(null)}
                className="text-carbon/40 hover:text-carbon font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-carbon/70">
                La cita quedará asentada como <strong>cancelada</strong> en el historial y la bitácora del cliente.
              </p>

              <div>
                <label className="block text-[11px] font-bold text-carbon/70 uppercase mb-1">
                  Motivo de la Cancelación:
                </label>
                <textarea
                  rows={3}
                  value={motivoCancelar}
                  onChange={(e) => setMotivoCancelar(e.target.value)}
                  placeholder="Ej. El cliente ya no requiere el servicio / Cambio de opinión / Número equivocado."
                  className="w-full rounded-lg border border-carbon/20 bg-white p-2.5 text-xs text-carbon outline-none focus:border-sauce"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-carbon/10">
              <button
                type="button"
                onClick={() => setCitaCancelarModal(null)}
                className="rounded-lg border border-carbon/20 px-3.5 py-1.5 text-xs font-bold text-carbon/60 hover:bg-slate-50 cursor-pointer"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleGuardarCancelacion}
                disabled={guardandoCancelado}
                className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-4 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
              >
                {guardandoCancelado ? "Cancelando..." : "🚫 Confirmar Cancelación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Captura de Retro / Resultado Operativo */}
      {citaSelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-lg shadow-xl space-y-4 border border-carbon/10 text-carbon">
            <div className="flex items-start justify-between border-b border-carbon/5 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-sauce block">
                  Captura de Retro / Resultado Operativo
                </span>
                <h3 className="font-titular text-base font-bold text-verde-profundo">
                  {citaSelModal.cliente_nombre} ({citaSelModal.tipo_cita || 'Llamada'})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCitaSelModal(null)}
                className="text-carbon/40 hover:text-carbon font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Tarjetas Interactivas de Resultado (1-Click) */}
              <div>
                <label className="block text-[11px] font-bold text-carbon/60 uppercase mb-1.5">
                  1. ¿Cuál fue el resultado de la llamada / cita?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResultadoTipo("agendado")}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      resultadoTipo === "agendado"
                        ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950 font-bold shadow-2xs"
                        : "bg-white border-carbon/15 hover:bg-slate-50 text-carbon/80"
                    }`}
                  >
                    <div className="text-xs">🟢 Visita Agendada</div>
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">Fija fecha/hora de la inspección</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResultadoTipo("reintentar")}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      resultadoTipo === "reintentar"
                        ? "bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 text-amber-950 font-bold shadow-2xs"
                        : "bg-white border-carbon/15 hover:bg-slate-50 text-carbon/80"
                    }`}
                  >
                    <div className="text-xs">🟡 No Contestó</div>
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">Programa reintento de llamada</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResultadoTipo("frio")}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      resultadoTipo === "frio"
                        ? "bg-rose-50 border-rose-500 ring-2 ring-rose-500/20 text-rose-950 font-bold shadow-2xs"
                        : "bg-white border-carbon/15 hover:bg-slate-50 text-carbon/80"
                    }`}
                  >
                    <div className="text-xs">🔴 Descartar / Frío</div>
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">Sin interés o número erróneo</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResultadoTipo("completado")}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                      resultadoTipo === "completado"
                        ? "bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950 font-bold shadow-2xs"
                        : "bg-white border-carbon/15 hover:bg-slate-50 text-carbon/80"
                    }`}
                  >
                    <div className="text-xs">✅ Finalizar Tarea</div>
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">Solo registrar observaciones</div>
                  </button>
                </div>
              </div>

              {/* Si agendó visita o reagendó llamada: Campos de Fecha y Hora */}
              {(resultadoTipo === "agendado" || resultadoTipo === "reintentar") && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-sauce/5 border border-sauce/20 rounded-xl">
                  <div>
                    <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                      {resultadoTipo === "agendado" ? "Fecha de Visita Técnica" : "Fecha de Próxima Llamada"}
                    </label>
                    <input
                      type="date"
                      value={fechaAgendada}
                      onChange={(e) => setFechaAgendada(e.target.value)}
                      className="w-full rounded border border-carbon/20 bg-white px-2 py-1 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                      Hora Programada
                    </label>
                    <input
                      type="time"
                      value={horaAgendada}
                      onChange={(e) => setHoraAgendada(e.target.value)}
                      className="w-full rounded border border-carbon/20 bg-white px-2 py-1 text-xs font-bold"
                    />
                  </div>
                </div>
              )}

              {/* Bitácora de Observaciones */}
              <div>
                <label className="block text-[11px] font-bold text-carbon/60 uppercase mb-1">
                  Observaciones / Retro de la llamada:
                </label>
                <textarea
                  rows={3}
                  value={observacionesModal}
                  onChange={(e) => setObservacionesModal(e.target.value)}
                  placeholder="Ej. El cliente solicita cotización para 200m2 de losa. Cita confirmada para el viernes 10:00 am."
                  className="w-full rounded-lg border border-carbon/20 bg-white p-2.5 text-xs text-carbon outline-none focus:border-sauce"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-carbon/5">
              <button
                type="button"
                onClick={() => setCitaSelModal(null)}
                className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs font-bold text-carbon/60 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarResultadoModal}
                disabled={guardandoModal}
                className="rounded-lg bg-sauce hover:bg-verde-profundo text-white px-4 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
              >
                {guardandoModal ? "Guardando..." : "💾 Guardar y Finalizar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
