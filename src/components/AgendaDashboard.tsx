"use client";

import { useState, useEffect, useCallback } from "react";
import {
  obtenerAgendaRango,
  confirmarCita,
  cancelarCita,
  crearBloqueo,
  eliminarBloqueo,
  type Cita,
  type Bloqueo,
} from "@/app/actions/agenda";
import Link from "next/link";

interface AgendaDashboardProps {
  usuarioActual: {
    id: string;
    nombre: string;
    rol: "admin" | "asesor" | "operaciones";
  };
  asesoresActivos: {
    id: string;
    nombre: string;
  }[];
  siteUrl: string;
}

export function AgendaDashboard({
  usuarioActual,
  asesoresActivos,
  siteUrl,
}: AgendaDashboardProps) {
  // Determinar el asesor inicial a visualizar
  const esAdmin = usuarioActual.rol === "admin";
  const [selectedAsesorId, setSelectedAsesorId] = useState(
    esAdmin && asesoresActivos.length > 0
      ? asesoresActivos.find((a) => a.id === usuarioActual.id)?.id || asesoresActivos[0].id
      : usuarioActual.id
  );

  // Selector del mes activo
  const hoy = new Date();
  const [añoActivo, setAñoActivo] = useState(hoy.getFullYear());
  const [mesActivo, setMesActivo] = useState(hoy.getMonth()); // 0-11
  const [diaSeleccionado, setDiaSeleccionado] = useState<number | null>(hoy.getDate());

  // Datos cargados de la agenda
  const [citas, setCitas] = useState<Cita[]>([]);
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [copiado, setCopiado] = useState(false);

  // Estados de formularios
  const [bloqueoInicio, setBloqueoInicio] = useState("09:00");
  const [bloqueoFin, setBloqueoFin] = useState("10:00");
  const [bloqueoDesc, setBloqueoDesc] = useState("");
  const [guardandoBloqueo, setGuardandoBloqueo] = useState(false);

  // Cargar agenda para el mes seleccionado
  const cargarAgendaMes = useCallback(async () => {
    setCargando(true);
    try {
      const inicioMes = `${añoActivo}-${String(mesActivo + 1).padStart(2, "0")}-01`;
      const finMes = `${añoActivo}-${String(mesActivo + 1).padStart(2, "0")}-31`; // SQL maneja bien lte

      const data = await obtenerAgendaRango(selectedAsesorId, inicioMes, finMes);
      setCitas(data.citas || []);
      setBloqueos(data.bloqueos || []);
    } catch (err) {
      console.error("Error al cargar agenda:", err);
    } finally {
      setCargando(false);
    }
  }, [selectedAsesorId, mesActivo, añoActivo]);

  useEffect(() => {
    cargarAgendaMes();
  }, [cargarAgendaMes]);

  const copiarEnlacePublico = async () => {
    const url = `${siteUrl}/agenda/${selectedAsesorId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  // Lógica del Calendario
  const nombresMeses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  const primerDiaMes = new Date(añoActivo, mesActivo, 1).getDay();
  const totalDiasMes = new Date(añoActivo, mesActivo + 1, 0).getDate();

  const irMesAnterior = () => {
    setDiaSeleccionado(null);
    if (mesActivo === 0) {
      setMesActivo(11);
      setAñoActivo(añoActivo - 1);
    } else {
      setMesActivo(mesActivo - 1);
    }
  };

  const irMesSiguiente = () => {
    setDiaSeleccionado(null);
    if (mesActivo === 11) {
      setMesActivo(0);
      setAñoActivo(añoActivo + 1);
    } else {
      setMesActivo(mesActivo + 1);
    }
  };

  // Obtener citas y bloqueos del día seleccionado
  const obtenerActividadesDia = (dia: number) => {
    const fechaStr = `${añoActivo}-${String(mesActivo + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    
    const citasDia = citas.filter((c) => c.fecha === fechaStr);
    const bloqueosDia = bloqueos.filter((b) => b.fecha === fechaStr);

    return { citasDia, bloqueosDia };
  };

  // Acciones sobre citas
  async function handleConfirmarCita(citaId: string) {
    try {
      await confirmarCita(citaId);
      setCitas((prev) =>
        prev.map((c) => (c.id === citaId ? { ...c, estado: "confirmada" } : c))
      );
    } catch (err) {
      console.error(err);
      alert("No se pudo confirmar la cita.");
    }
  }

  async function handleCancelarCita(citaId: string) {
    if (!confirm("¿Seguro que deseas cancelar esta cita?")) return;
    try {
      await cancelarCita(citaId);
      setCitas((prev) => prev.filter((c) => c.id !== citaId));
    } catch (err) {
      console.error(err);
      alert("No se pudo cancelar la cita.");
    }
  }

  // Acciones sobre bloqueos
  async function handleAgregarBloqueo(e: React.FormEvent) {
    e.preventDefault();
    if (!diaSeleccionado || !bloqueoInicio || !bloqueoFin || !bloqueoDesc.trim()) return;

    setGuardandoBloqueo(true);
    try {
      const fechaStr = `${añoActivo}-${String(mesActivo + 1).padStart(2, "0")}-${String(diaSeleccionado).padStart(2, "0")}`;
      await crearBloqueo(
        selectedAsesorId,
        fechaStr,
        `${bloqueoInicio}:00`,
        `${bloqueoFin}:00`,
        bloqueoDesc
      );
      setBloqueoDesc("");
      cargarAgendaMes(); // Recargar datos
    } catch (err) {
      console.error(err);
      alert("Error al agregar bloqueo.");
    } finally {
      setGuardandoBloqueo(false);
    }
  }

  async function handleEliminarBloqueo(bloqueoId: string) {
    if (!confirm("¿Seguro que deseas eliminar este bloqueo?")) return;
    try {
      await eliminarBloqueo(bloqueoId);
      setBloqueos((prev) => prev.filter((b) => b.id !== bloqueoId));
    } catch (err) {
      console.error(err);
      alert("Error al eliminar bloqueo.");
    }
  }

  const { citasDia = [], bloqueosDia = [] } =
    diaSeleccionado !== null ? obtenerActividadesDia(diaSeleccionado) : {};

  const nombreAsesorVisual =
    asesoresActivos.find((a) => a.id === selectedAsesorId)?.nombre || usuarioActual.nombre;

  return (
    <div className="space-y-6">
      {/* Encabezado y Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-2xl border border-carbon/10 p-5 shadow-sm">
        <div className="space-y-1">
          <h2 className="font-titular text-xl font-bold text-verde-profundo flex items-center gap-2">
            <span>📅</span> Control de Citas y Agenda
          </h2>
          <p className="text-xs text-carbon/60">
            Administra tus citas comerciales, bloquea espacios temporales y confirma solicitudes pendientes.
          </p>
        </div>

        {/* Si es Admin, selector de asesores */}
        {esAdmin ? (
          <div className="flex items-center gap-2 self-start md:self-center">
            <span className="text-xs font-semibold text-carbon/50">Asesor:</span>
            <select
              value={selectedAsesorId}
              onChange={(e) => {
                setSelectedAsesorId(e.target.value);
                setDiaSeleccionado(hoy.getDate());
              }}
              className="rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs text-verde-profundo font-semibold outline-none focus:border-sauce"
            >
              {asesoresActivos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="text-xs font-semibold text-sauce bg-sauce/15 border border-sauce/20 px-3 py-1.5 rounded-lg">
            💼 Agenda de <strong>{usuarioActual.nombre}</strong>
          </div>
        )}
      </div>

      {/* Widget de Enlace Público */}
      <div className="bg-crema/40 border border-carbon/10 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-carbon/40">Enlace de reserva del asesor</span>
          <span className="font-mono text-xs text-carbon/80 select-all block mt-1">
            {siteUrl}/agenda/{selectedAsesorId}
          </span>
        </div>
        <button
          type="button"
          onClick={copiarEnlacePublico}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all self-start md:self-center flex items-center gap-1.5 ${
            copiado
              ? "bg-sauce text-white"
              : "bg-white border border-carbon/15 text-carbon hover:bg-carbon/5"
          }`}
        >
          {copiado ? "✓ ¡Copiado!" : "📋 Copiar Enlace Público"}
        </button>
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        
        {/* Columna Izquierda: Calendario Semanal/Mensual */}
        <div className="md:col-span-6 bg-white rounded-2xl border border-carbon/10 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-carbon/80 capitalize">
              {nombresMeses[mesActivo]} {añoActivo}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={irMesAnterior}
                className="p-1 rounded-lg border border-carbon/10 text-carbon hover:bg-carbon/5"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={irMesSiguiente}
                className="p-1 rounded-lg border border-carbon/10 text-carbon hover:bg-carbon/5"
              >
                ▶
              </button>
            </div>
          </div>

          {/* Grid del calendario */}
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
            {/* Cabecera semana */}
            {diasSemana.map((d) => (
              <div key={d} className="py-1 font-semibold text-carbon/40">
                {d}
              </div>
            ))}

            {/* Celdas vacías */}
            {Array.from({ length: primerDiaMes }).map((_, idx) => (
              <div key={`empty-${idx}`} className="py-2" />
            ))}

            {/* Días */}
            {Array.from({ length: totalDiasMes }).map((_, idx) => {
              const dia = idx + 1;
              const { citasDia = [], bloqueosDia = [] } = obtenerActividadesDia(dia);
              const esSeleccionado = diaSeleccionado === dia;
              
              const citasPendientes = citasDia.filter((c) => c.estado === "pendiente").length;
              const citasConfirmadas = citasDia.filter((c) => c.estado === "confirmada").length;
              const tieneBloqueos = bloqueosDia.length > 0;

              return (
                <button
                  key={`day-${dia}`}
                  type="button"
                  onClick={() => setDiaSeleccionado(dia)}
                  className={`relative py-3 rounded-xl font-semibold flex flex-col items-center justify-center min-h-[50px] transition-all border ${
                    esSeleccionado
                      ? "bg-sauce border-sauce text-white shadow font-bold"
                      : "bg-white border-carbon/5 text-carbon hover:bg-sauce/10 hover:text-verde-profundo"
                  }`}
                >
                  <span>{dia}</span>
                  
                  {/* Indicadores en miniatura */}
                  <div className="flex justify-center gap-0.5 mt-1.5">
                    {citasPendientes > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title={`${citasPendientes} pendiente(s)`} />
                    )}
                    {citasConfirmadas > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title={`${citasConfirmadas} confirmada(s)`} />
                    )}
                    {tieneBloqueos && (
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" title="Franja bloqueada" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex gap-4 text-[10px] text-carbon/40 pt-2 border-t border-carbon/5">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-400" /> Cita Pendiente
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Cita Aceptada
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-400" /> Bloqueado
            </span>
          </div>
        </div>

        {/* Columna Derecha: Detalle de Actividades del Día */}
        <div className="md:col-span-6 bg-white rounded-2xl border border-carbon/10 p-5 shadow-sm space-y-5">
          {diaSeleccionado === null ? (
            <div className="py-12 text-center text-sm text-carbon/40 italic">
              Haz clic en algún día del calendario para ver y configurar sus actividades.
            </div>
          ) : (
            <>
              {/* Encabezado del Día */}
              <div className="border-b border-carbon/10 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-titular text-base font-bold text-verde-profundo">
                    Actividades del {diaSeleccionado} de {nombresMeses[mesActivo]}
                  </h3>
                  <p className="text-[10px] text-carbon/40">
                    Agenda de <strong>{nombreAsesorVisual}</strong>
                  </p>
                </div>
              </div>

              {/* Listado de citas del día */}
              <div className="space-y-3">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-carbon/40">
                  Citas Reservadas
                </label>
                {citasDia.length === 0 ? (
                  <p className="text-xs text-carbon/40 italic py-4 text-center rounded-xl border border-dashed border-carbon/10 bg-carbon/5">
                    No hay citas agendadas para esta fecha.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {citasDia.map((c) => {
                      const esPendiente = c.estado === "pendiente";
                      return (
                        <div
                          key={c.id}
                          className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs transition-all ${
                            esPendiente
                              ? "bg-amber-50/50 border-amber-200"
                              : "bg-white border-carbon/10"
                          }`}
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-carbon">{c.cliente_nombre}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                                  esPendiente
                                    ? "bg-amber-100 text-amber-800 border-amber-200"
                                    : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                }`}
                              >
                                {esPendiente ? "⚠️ Por confirmar" : "✓ Confirmada"}
                              </span>
                            </div>
                            <div className="text-xs text-carbon/50 flex flex-wrap gap-x-3 gap-y-0.5 font-medium">
                              <span>🕒 {c.hora_inicio.slice(0, 5)} - {c.hora_fin.slice(0, 5)} hs</span>
                              <span>📞 {c.cliente_telefono}</span>
                              <span className="capitalize">({c.tipo_cita === "venta" ? "venta" : "asesoría"})</span>
                            </div>
                            {c.notas && (
                              <p className="text-xs text-carbon/60 bg-carbon/5 px-2.5 py-1.5 rounded-lg italic mt-1">
                                "{c.notas}"
                              </p>
                            )}
                          </div>

                          {/* Acciones */}
                          <div className="flex flex-wrap gap-1.5 flex-shrink-0 self-end sm:self-center">
                            {esPendiente ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleConfirmarCita(c.id)}
                                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-emerald-700 transition"
                                >
                                  Aceptar ✓
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelarCita(c.id)}
                                  className="rounded-lg bg-rojo/10 border border-rojo/10 px-2.5 py-1.5 text-xs font-bold text-rojo hover:bg-rojo/15 transition"
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleCancelarCita(c.id)}
                                className="rounded-lg border border-rojo/10 bg-rojo/5 px-2.5 py-1.5 text-xs font-semibold text-rojo hover:bg-rojo/10 transition"
                                title="Cancelar Cita"
                              >
                                Cancelar
                              </button>
                            )}
                            
                            {/* Enlaces de CRM */}
                            <a
                              href={`/conversaciones?tel=${c.cliente_telefono}`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-carbon/15 bg-white p-1.5 text-xs font-bold text-carbon hover:bg-carbon/5 flex items-center justify-center"
                              title="Conversar por WhatsApp CRM"
                            >
                              💬
                            </a>

                            {c.prospecto_id && (
                              <Link
                                href={`/prospectos/${c.prospecto_id}`}
                                className="rounded-lg border border-carbon/15 bg-white px-2 py-1.5 text-xs font-semibold text-carbon hover:bg-carbon/5 flex items-center justify-center"
                                title="Ver ficha del prospecto"
                              >
                                👤 Ficha
                              </Link>
                            )}
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bloqueos del día */}
              <div className="space-y-2 border-t border-carbon/10 pt-4">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-carbon/40">
                  Bloqueos Registrados
                </label>
                {bloqueosDia.length === 0 ? (
                  <p className="text-xs text-carbon/40 italic py-2 text-center">
                    No hay bloqueos para este día.
                  </p>
                ) : (
                  <div className="divide-y divide-carbon/5 rounded-xl border border-carbon/10 bg-white">
                    {bloqueosDia.map((b) => (
                      <div key={b.id} className="flex items-center justify-between p-3 text-xs">
                        <div>
                          <p className="font-bold text-carbon/80">{b.descripcion}</p>
                          <p className="text-[10px] text-carbon/40 mt-0.5">
                            🕒 {b.hora_inicio.slice(0, 5)} - {b.hora_fin.slice(0, 5)} hs
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleEliminarBloqueo(b.id)}
                          className="text-rojo hover:bg-rojo/10 p-1.5 rounded transition"
                          title="Eliminar bloqueo"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Formulario de bloqueo rápido */}
              <form onSubmit={handleAgregarBloqueo} className="rounded-xl border border-carbon/10 p-4 space-y-3 bg-carbon/5">
                <h4 className="text-xs font-bold text-verde-profundo uppercase tracking-wider">Bloquear Horario Rápido</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-semibold text-carbon/50 uppercase mb-1">Hora Inicio</label>
                    <input
                      type="time"
                      required
                      value={bloqueoInicio}
                      onChange={(e) => setBloqueoInicio(e.target.value)}
                      className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-semibold text-carbon/50 uppercase mb-1">Hora Fin</label>
                    <input
                      type="time"
                      required
                      value={bloqueoFin}
                      onChange={(e) => setBloqueoFin(e.target.value)}
                      className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-semibold text-carbon/50 uppercase mb-1">Motivo</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Junta de ventas, Salida a INFONAVIT"
                    value={bloqueoDesc}
                    onChange={(e) => setBloqueoDesc(e.target.value)}
                    className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={guardandoBloqueo}
                    className="rounded-lg bg-verde-profundo px-4 py-2 text-xs font-semibold text-white transition hover:bg-sauce disabled:opacity-50"
                  >
                    {guardandoBloqueo ? "Registrando..." : "Bloquear Horario"}
                  </button>
                </div>
              </form>

            </>
          )}
        </div>

      </div>
    </div>
  );
}
