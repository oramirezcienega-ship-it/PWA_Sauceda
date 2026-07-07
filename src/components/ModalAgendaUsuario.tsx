"use client";

import { useState, useEffect } from "react";
import type { UsuarioApp } from "@/app/actions/usuarios";
import {
  obtenerAgendaUsuario,
  actualizarConfiguracionAgenda,
  crearBloqueo,
  eliminarBloqueo,
  crearCita,
  cancelarCita,
  obtenerSlotsDisponibles,
  type Cita,
  type Bloqueo,
} from "@/app/actions/agenda";

interface ModalAgendaUsuarioProps {
  usuario: UsuarioApp;
  onClose: () => void;
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

export function ModalAgendaUsuario({ usuario, onClose }: ModalAgendaUsuarioProps) {
  const [tab, setTab] = useState<"horarios" | "bloqueos" | "citas">("horarios");
  const [cargando, setCargando] = useState(true);

  // Estados de datos de agenda
  const [horariosAgenda, setHorariosAgenda] = useState<Record<string, { inicio: string; fin: string }[]>>({});
  const [duracionCita, setDuracionCita] = useState<number>(60);
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);

  // Estados de formularios y acciones
  const [guardandoHorarios, setGuardandoHorarios] = useState(false);
  
  // Formulario de Bloqueo
  const [bloqueoFecha, setBloqueoFecha] = useState("");
  const [bloqueoInicio, setBloqueoInicio] = useState("09:00");
  const [bloqueoFin, setBloqueoFin] = useState("10:00");
  const [bloqueoDesc, setBloqueoDesc] = useState("");
  const [creandoBloqueo, setCreandoBloqueo] = useState(false);

  // Formulario de Cita Manual
  const [modoCrearCita, setModoCrearCita] = useState(false);
  const [citaNombre, setCitaNombre] = useState("");
  const [citaTelefono, setCitaTelefono] = useState("");
  const [citaEmail, setCitaEmail] = useState("");
  const [citaTipo, setCitaTipo] = useState<"venta" | "asesoria">("venta");
  const [citaFecha, setCitaFecha] = useState("");
  const [citaHora, setCitaHora] = useState("");
  const [citaNotas, setCitaNotas] = useState("");
  const [slotsDisponibles, setSlotsDisponibles] = useState<{ inicio: string; fin: string }[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [guardandoCita, setGuardandoCita] = useState(false);

  // Cargar datos al abrir
  useEffect(() => {
    async function cargarDatos() {
      try {
        const data = await obtenerAgendaUsuario(usuario.id);
        setHorariosAgenda(data.horarios_agenda || {});
        setDuracionCita(data.duracion_cita || 60);
        setBloqueos(data.bloqueos || []);
        setCitas(data.citas || []);
      } catch (err) {
        console.error("Error al cargar agenda:", err);
        alert("No se pudieron cargar los datos de la agenda.");
      } finally {
        setCargando(false);
      }
    }
    cargarDatos();
  }, [usuario.id]);

  // Cargar slots disponibles cuando cambia la fecha en la cita manual
  useEffect(() => {
    if (!citaFecha) {
      setSlotsDisponibles([]);
      return;
    }

    async function cargarSlots() {
      setCargandoSlots(true);
      try {
        const slots = await obtenerSlotsDisponibles(usuario.id, citaFecha);
        setSlotsDisponibles(slots);
        if (slots.length > 0) {
          setCitaHora(slots[0].inicio);
        } else {
          setCitaHora("");
        }
      } catch (err) {
        console.error("Error al cargar slots:", err);
      } finally {
        setCargandoSlots(false);
      }
    }

    cargarSlots();
  }, [citaFecha, usuario.id]);

  // Manejo de disponibilidad semanal
  const actualizarFranja = (dia: string, index: number, campo: "inicio" | "fin", valor: string) => {
    let v = valor;
    if (valor && valor.split(":").length === 2) {
      v = `${valor}:00`;
    }
    setHorariosAgenda((prev) => {
      const slots = [...(prev[dia] || [])];
      slots[index] = { ...slots[index], [campo]: v };
      return { ...prev, [dia]: slots };
    });
  };

  const eliminarFranja = (dia: string, index: number) => {
    setHorariosAgenda((prev) => {
      const slots = (prev[dia] || []).filter((_, i) => i !== index);
      return { ...prev, [dia]: slots };
    });
  };

  const agregarFranja = (dia: string) => {
    setHorariosAgenda((prev) => {
      const slots = [...(prev[dia] || [])];
      slots.push({ inicio: "09:00:00", fin: "18:00:00" });
      return { ...prev, [dia]: slots };
    });
  };

  async function handleGuardarHorarios() {
    setGuardandoHorarios(true);
    try {
      await actualizarConfiguracionAgenda(usuario.id, horariosAgenda, duracionCita);
      alert("Configuración de horarios guardada con éxito.");
    } catch (err) {
      console.error(err);
      alert("Error al guardar horarios.");
    } finally {
      setGuardandoHorarios(false);
    }
  }

  // Manejo de bloqueos
  async function handleAgregarBloqueo(e: React.FormEvent) {
    e.preventDefault();
    if (!bloqueoFecha || !bloqueoInicio || !bloqueoFin || !bloqueoDesc.trim()) return;

    setCreandoBloqueo(true);
    try {
      const nuevo = await crearBloqueo(
        usuario.id,
        bloqueoFecha,
        `${bloqueoInicio}:00`,
        `${bloqueoFin}:00`,
        bloqueoDesc
      );
      setBloqueos((prev) => [...prev, nuevo].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio)));
      
      // Reset
      setBloqueoFecha("");
      setBloqueoDesc("");
    } catch (err) {
      console.error(err);
      alert("Error al crear bloqueo.");
    } finally {
      setCreandoBloqueo(false);
    }
  }

  async function handleEliminarBloqueo(id: string) {
    if (!confirm("¿Seguro que deseas eliminar este bloqueo?")) return;
    try {
      await eliminarBloqueo(id);
      setBloqueos((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      console.error(err);
      alert("Error al eliminar bloqueo.");
    }
  }

  // Manejo de citas
  async function handleCrearCitaManual(e: React.FormEvent) {
    e.preventDefault();
    if (!citaNombre.trim() || !citaTelefono.trim() || !citaFecha || !citaHora) return;

    setGuardandoCita(true);
    try {
      // Calcular hora fin a partir de la duración
      const slotSeleccionado = slotsDisponibles.find(s => s.inicio === citaHora);
      const horaFin = slotSeleccionado ? slotSeleccionado.fin : citaHora;

      const nueva = await crearCita({
        perfil_id: usuario.id,
        cliente_nombre: citaNombre,
        cliente_telefono: citaTelefono,
        cliente_email: citaEmail || undefined,
        tipo_cita: citaTipo,
        fecha: citaFecha,
        hora_inicio: citaHora,
        hora_fin: horaFin,
        notas: citaNotas || undefined,
        estado: "confirmada",
      });

      setCitas((prev) => [...prev, nueva].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio)));
      
      // Reset
      setModoCrearCita(false);
      setCitaNombre("");
      setCitaTelefono("");
      setCitaEmail("");
      setCitaFecha("");
      setCitaHora("");
      setCitaNotas("");
      alert("Cita programada con éxito.");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Error al programar la cita.");
    } finally {
      setGuardandoCita(false);
    }
  }

  async function handleCancelarCita(id: string) {
    if (!confirm("¿Seguro que deseas cancelar esta cita?")) return;
    try {
      await cancelarCita(id);
      setCitas((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      console.error(err);
      alert("Error al cancelar la cita.");
    }
  }

  function formatearFecha(fStr: string) {
    const [y, m, d] = fStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("es-MX", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl space-y-4 rounded-2xl border border-dorado/30 bg-white p-6 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-carbon/10 pb-3 flex-shrink-0">
          <div>
            <h3 className="font-titular text-lg font-semibold text-verde-profundo flex items-center gap-2">
              <span>📅</span> Agenda de Citas de {usuario.nombre}
            </h3>
            <p className="text-xs text-carbon/50">
              Configura disponibilidad, agrega bloqueos y consulta las citas activas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-carbon/60 transition hover:bg-carbon/5 font-bold"
          >
            ✕
          </button>
        </div>

        {/* Pestañas */}
        <div className="flex border-b border-carbon/10 text-sm flex-shrink-0">
          <button
            type="button"
            onClick={() => setTab("horarios")}
            className={`px-4 py-2 border-b-2 font-medium transition ${
              tab === "horarios"
                ? "border-sauce text-verde-profundo font-semibold"
                : "border-transparent text-carbon/60 hover:text-carbon"
            }`}
          >
            ⚙️ Horarios Disponibles
          </button>
          <button
            type="button"
            onClick={() => setTab("bloqueos")}
            className={`px-4 py-2 border-b-2 font-medium transition ${
              tab === "bloqueos"
                ? "border-sauce text-verde-profundo font-semibold"
                : "border-transparent text-carbon/60 hover:text-carbon"
            }`}
          >
            🚫 Espacios Bloqueados ({bloqueos.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("citas")}
            className={`px-4 py-2 border-b-2 font-medium transition ${
              tab === "citas"
                ? "border-sauce text-verde-profundo font-semibold"
                : "border-transparent text-carbon/60 hover:text-carbon"
            }`}
          >
            💼 Citas Agendadas ({citas.length})
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-grow overflow-y-auto min-h-0 pr-1">
          {cargando ? (
            <div className="py-12 text-center text-sm text-carbon/50">
              Cargando configuración de la agenda...
            </div>
          ) : tab === "horarios" ? (
            <div className="space-y-4 pt-1">
              {/* Duración */}
              <div className="flex items-center justify-between rounded-xl border border-carbon/10 bg-crema/20 p-4">
                <div>
                  <span className="block text-xs font-bold text-verde-profundo">
                    Duración de cada cita
                  </span>
                  <span className="block text-[10px] text-carbon/50">
                    Define la duración de las franjas horarias que verá el cliente.
                  </span>
                </div>
                <select
                  value={duracionCita}
                  onChange={(e) => setDuracionCita(Number(e.target.value))}
                  className="rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs text-verde-profundo outline-none focus:border-sauce focus:ring-2 focus:ring-sauce/20"
                >
                  <option value={30}>30 minutos</option>
                  <option value={45}>45 minutos</option>
                  <option value={60}>1 hora (60 min)</option>
                  <option value={90}>1.5 horas (90 min)</option>
                  <option value={120}>2 horas (120 min)</option>
                </select>
              </div>

              {/* Horarios por día */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-carbon/40">
                  Horarios de Atención Semanal
                </label>
                <div className="space-y-2 rounded-xl border border-carbon/10 p-3 bg-carbon/5">
                  {DIAS_SEMANA.map((dia) => {
                    const franjas = horariosAgenda[dia.key] || [];
                    const activo = franjas.length > 0;

                    return (
                      <div key={dia.key} className="rounded-lg border border-carbon/10 bg-white p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-verde-profundo">{dia.label}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (activo) {
                                setHorariosAgenda(prev => ({ ...prev, [dia.key]: [] }));
                              } else {
                                setHorariosAgenda(prev => ({ ...prev, [dia.key]: [{ inicio: "09:00:00", fin: "18:00:00" }] }));
                              }
                            }}
                            className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold transition ${
                              activo ? "bg-verde-profundo text-crema" : "bg-carbon/10 text-carbon/50 border border-carbon/10"
                            }`}
                          >
                            {activo ? "Disponible" : "No disponible"}
                          </button>
                        </div>

                        {activo && (
                          <div className="space-y-2 pt-2 border-t border-carbon/5">
                            {franjas.map((franja, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <div className="flex-1">
                                  <span className="block text-[9px] text-carbon/40 font-semibold uppercase">De:</span>
                                  <input
                                    type="time"
                                    value={franja.inicio.slice(0, 5)}
                                    onChange={(e) => actualizarFranja(dia.key, idx, "inicio", e.target.value)}
                                    className="w-full rounded border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none"
                                  />
                                </div>
                                <div className="flex-1">
                                  <span className="block text-[9px] text-carbon/40 font-semibold uppercase">A:</span>
                                  <input
                                    type="time"
                                    value={franja.fin.slice(0, 5)}
                                    onChange={(e) => actualizarFranja(dia.key, idx, "fin", e.target.value)}
                                    className="w-full rounded border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => eliminarFranja(dia.key, idx)}
                                  className="mt-4 rounded p-1 text-rojo hover:bg-rojo/10 transition"
                                  title="Eliminar franja"
                                >
                                  🗑️
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => agregarFranja(dia.key)}
                              className="text-[10px] font-bold text-sauce hover:underline block pt-0.5"
                            >
                              + Añadir franja de atención
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Botón Guardar */}
              <div className="flex justify-end pt-2 border-t border-carbon/5">
                <button
                  type="button"
                  onClick={handleGuardarHorarios}
                  disabled={guardandoHorarios}
                  className="rounded-lg bg-sauce px-4 py-2 text-xs font-semibold text-crema transition hover:bg-verde-profundo disabled:opacity-50"
                >
                  {guardandoHorarios ? "Guardando..." : "Guardar Horarios"}
                </button>
              </div>
            </div>
          ) : tab === "bloqueos" ? (
            <div className="space-y-4 pt-1">
              {/* Formulario para agregar bloqueo */}
              <form onSubmit={handleAgregarBloqueo} className="rounded-xl border border-carbon/10 p-4 space-y-3 bg-crema/25">
                <h4 className="text-xs font-bold text-verde-profundo uppercase tracking-wider">Bloquear Espacio en Agenda</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[9px] font-semibold text-carbon/50 uppercase mb-1">Fecha</label>
                    <input
                      type="date"
                      required
                      value={bloqueoFecha}
                      onChange={(e) => setBloqueoFecha(e.target.value)}
                      className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                    />
                  </div>
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
                  <label className="block text-[9px] font-semibold text-carbon/50 uppercase mb-1">Motivo / Descripción</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Junta fuera de la oficina, Cita médica, Vacaciones"
                    value={bloqueoDesc}
                    onChange={(e) => setBloqueoDesc(e.target.value)}
                    className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={creandoBloqueo}
                    className="rounded-lg bg-verde-profundo px-4 py-2 text-xs font-semibold text-white transition hover:bg-sauce disabled:opacity-50"
                  >
                    {creandoBloqueo ? "Guardando..." : "Bloquear Horario"}
                  </button>
                </div>
              </form>

              {/* Lista de bloqueos */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-carbon/40">
                  Bloqueos Activos
                </label>
                {bloqueos.length === 0 ? (
                  <p className="text-xs text-carbon/40 italic py-4 text-center rounded-xl border border-dashed border-carbon/10">
                    No hay bloqueos futuros programados.
                  </p>
                ) : (
                  <div className="divide-y divide-carbon/5 rounded-xl border border-carbon/10 bg-white">
                    {bloqueos.map((b) => (
                      <div key={b.id} className="flex items-center justify-between p-3 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-verde-profundo truncate">{b.descripcion}</p>
                          <p className="text-[10px] text-carbon/50 mt-0.5">
                            📅 {formatearFecha(b.fecha)} | 🕒 {b.hora_inicio.slice(0, 5)} - {b.hora_fin.slice(0, 5)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleEliminarBloqueo(b.id)}
                          className="rounded p-1.5 text-rojo hover:bg-rojo/10 transition flex-shrink-0"
                          title="Eliminar bloqueo"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              {modoCrearCita ? (
                /* Formulario para registrar cita manual */
                <form onSubmit={handleCrearCitaManual} className="rounded-xl border border-carbon/10 p-4 space-y-3 bg-sauce/5 border-sauce/20">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-verde-profundo uppercase tracking-wider">Agendar Cita Manualmente</h4>
                    <button
                      type="button"
                      onClick={() => setModoCrearCita(false)}
                      className="text-xs text-carbon/60 hover:text-carbon font-semibold hover:underline"
                    >
                      Volver al listado
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-semibold text-carbon/50 uppercase mb-1">Nombre del Cliente</label>
                      <input
                        type="text"
                        required
                        placeholder="Nombre completo"
                        value={citaNombre}
                        onChange={(e) => setCitaNombre(e.target.value)}
                        className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-semibold text-carbon/50 uppercase mb-1">Teléfono / WhatsApp</label>
                      <input
                        type="text"
                        required
                        placeholder="10 dígitos"
                        value={citaTelefono}
                        onChange={(e) => setCitaTelefono(e.target.value)}
                        className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[9px] font-semibold text-carbon/50 uppercase mb-1">Email (Opcional)</label>
                      <input
                        type="email"
                        placeholder="cliente@ejemplo.com"
                        value={citaEmail}
                        onChange={(e) => setCitaEmail(e.target.value)}
                        className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-semibold text-carbon/50 uppercase mb-1">Tipo de Cita</label>
                      <select
                        value={citaTipo}
                        onChange={(e) => setCitaTipo(e.target.value as "venta" | "asesoria")}
                        className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                      >
                        <option value="venta">Cita de Venta</option>
                        <option value="asesoria">Asesoría</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-semibold text-carbon/50 uppercase mb-1">Fecha</label>
                      <input
                        type="date"
                        required
                        value={citaFecha}
                        onChange={(e) => setCitaFecha(e.target.value)}
                        className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-semibold text-carbon/50 uppercase mb-1">Horarios Disponibles</label>
                    {cargandoSlots ? (
                      <p className="text-xs text-carbon/40 italic">Cargando horarios disponibles...</p>
                    ) : !citaFecha ? (
                      <p className="text-xs text-carbon/40 italic">Selecciona una fecha primero para ver disponibilidad.</p>
                    ) : slotsDisponibles.length === 0 ? (
                      <p className="text-xs text-rojo font-semibold">No hay horarios disponibles para la fecha seleccionada.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 mt-1.5 max-h-[120px] overflow-y-auto p-1.5 rounded-lg border border-carbon/10 bg-white">
                        {slotsDisponibles.map((s) => (
                          <button
                            key={s.inicio}
                            type="button"
                            onClick={() => setCitaHora(s.inicio)}
                            className={`px-3 py-1 rounded text-xs font-semibold border transition ${
                              citaHora === s.inicio
                                ? "bg-sauce border-sauce text-white shadow-sm"
                                : "bg-white border-carbon/15 text-carbon hover:bg-carbon/5"
                            }`}
                          >
                            {s.inicio.slice(0, 5)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[9px] font-semibold text-carbon/50 uppercase mb-1">Notas Internas</label>
                    <textarea
                      placeholder="Detalles sobre la cita o necesidades del cliente..."
                      rows={2}
                      value={citaNotas}
                      onChange={(e) => setCitaNotas(e.target.value)}
                      className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce resize-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setModoCrearCita(false)}
                      className="rounded-lg bg-carbon/10 px-4 py-2 text-xs font-semibold text-carbon transition hover:bg-carbon/25"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={guardandoCita || !citaHora}
                      className="rounded-lg bg-sauce px-4 py-2 text-xs font-semibold text-crema transition hover:bg-verde-profundo disabled:opacity-50"
                    >
                      {guardandoCita ? "Agendando..." : "Agendar Cita"}
                    </button>
                  </div>
                </form>
              ) : (
                /* Listado de citas agendadas */
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-carbon/40">
                      Próximas Citas Reservadas
                    </label>
                    <button
                      type="button"
                      onClick={() => setModoCrearCita(true)}
                      className="rounded-lg border border-sauce/20 bg-sauce/5 px-3 py-1.5 text-xs font-semibold text-verde-profundo transition-all hover:bg-sauce/15"
                    >
                      + Agendar Manualmente
                    </button>
                  </div>

                  {citas.length === 0 ? (
                    <p className="text-xs text-carbon/40 italic py-8 text-center rounded-xl border border-dashed border-carbon/10 bg-white">
                      No hay citas futuras registradas en la agenda.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {citas.map((c) => (
                        <div key={c.id} className="rounded-xl border border-carbon/10 bg-white p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-verde-profundo">{c.cliente_nombre}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                c.tipo_cita === "venta"
                                  ? "bg-dorado/15 text-yellow-800 border border-dorado/20"
                                  : "bg-cielo/15 text-cielo border border-cielo/20"
                              }`}>
                                {c.tipo_cita === "venta" ? "🛍️ Cita Venta" : "🎓 Asesoría"}
                              </span>
                            </div>
                            <div className="text-xs text-carbon/60 flex flex-wrap gap-x-4 gap-y-1">
                              <span>📅 {formatearFecha(c.fecha)}</span>
                              <span>🕒 {c.hora_inicio.slice(0, 5)} - {c.hora_fin.slice(0, 5)}</span>
                              <span>📞 {c.cliente_telefono}</span>
                            </div>
                            {c.notas && (
                              <p className="text-xs text-carbon/50 bg-carbon/5 px-2.5 py-1.5 rounded-lg italic mt-1.5">
                                "{c.notas}"
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                            <a
                              href={`https://wa.me/${c.cliente_telefono}`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-100 flex items-center gap-1"
                            >
                              💬 WhatsApp
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCancelarCita(c.id)}
                              className="rounded-lg border border-rojo/10 bg-rojo/5 px-3 py-1.5 text-xs font-semibold text-rojo/85 transition hover:bg-rojo/10"
                            >
                              Cancelar Cita
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-carbon/5 pt-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-carbon/10 px-4 py-2 text-sm font-medium text-carbon transition hover:bg-carbon/25"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
