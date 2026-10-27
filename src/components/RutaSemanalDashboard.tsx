"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  obtenerRutaSemanalInspecciones,
  reprogramarCitaSemanal,
  actualizarEstadoCitaSemanal,
  type CitaRutaEnriquecida,
  type RespuestaRutaSemanal,
} from "@/app/actions/ruta-inspecciones";

const NOMBRES_DIAS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

const MESES_CORTOS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function obtenerLunesYFinDeSemana(fechaReferencia: Date) {
  const d = new Date(fechaReferencia);
  const day = d.getDay();
  // Lunes como día 1. Si es domingo (0), retroceder 6 días.
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const lunes = new Date(d.setDate(diff));
  lunes.setHours(0, 0, 0, 0);

  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  domingo.setHours(23, 59, 59, 999);

  const formatoISO = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const dia = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${dia}`;
  };

  return {
    lunes,
    domingo,
    inicioISO: formatoISO(lunes),
    finISO: formatoISO(domingo),
  };
}

export function RutaSemanalDashboard() {
  const [fechaBase, setFechaBase] = useState<Date>(new Date());
  const [cargando, setCargando] = useState(true);
  const [datosRuta, setDatosRuta] = useState<RespuestaRutaSemanal | null>(null);

  // Filtros activos
  const [filtroProveedor, setFiltroProveedor] = useState<string>("todos");
  const [filtroNegocio, setFiltroNegocio] = useState<string>("todos");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");

  // Notificación de copiado
  const [copiadoWa, setCopiadoWa] = useState(false);

  // Modal de reprogramación
  const [citaAEditar, setCitaAEditar] = useState<CitaRutaEnriquecida | null>(null);
  const [editFecha, setEditFecha] = useState("");
  const [editHoraInicio, setEditHoraInicio] = useState("");
  const [guardandoCambio, setGuardandoCambio] = useState(false);

  const { lunes, domingo, inicioISO, finISO } = useMemo(
    () => obtenerLunesYFinDeSemana(fechaBase),
    [fechaBase]
  );

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const res = await obtenerRutaSemanalInspecciones(inicioISO, finISO);
      setDatosRuta(res);
    } catch (err) {
      console.error("Error al cargar ruta semanal:", err);
    } finally {
      setCargando(false);
    }
  }, [inicioISO, finISO]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Navegación de semanas
  const irSemanaAnterior = () => {
    setFechaBase((prev) => {
      const n = new Date(prev);
      n.setDate(n.getDate() - 7);
      return n;
    });
  };

  const irSemanaSiguiente = () => {
    setFechaBase((prev) => {
      const n = new Date(prev);
      n.setDate(n.getDate() + 7);
      return n;
    });
  };

  const irSemanaActual = () => {
    setFechaBase(new Date());
  };

  // Citas filtradas
  const citasFiltradas = useMemo(() => {
    if (!datosRuta) return [];
    return datosRuta.citas.filter((c) => {
      if (filtroProveedor !== "todos" && c.tecnico_asignado !== filtroProveedor) {
        return false;
      }
      if (filtroNegocio !== "todos" && c.servicio_tipo !== filtroNegocio) {
        return false;
      }
      if (filtroEstado === "confirmada" && c.estado !== "confirmada") {
        return false;
      }
      if (filtroEstado === "pendiente" && c.estado === "confirmada") {
        return false;
      }
      return true;
    });
  }, [datosRuta, filtroProveedor, filtroNegocio, filtroEstado]);

  // Agrupar citas filtradas por día (ISO fecha: YYYY-MM-DD)
  const citasPorDia = useMemo(() => {
    const mapa: Record<string, CitaRutaEnriquecida[]> = {};
    // Inicializar los 7 días de la semana
    for (let i = 0; i < 7; i++) {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      mapa[iso] = [];
    }

    citasFiltradas.forEach((c) => {
      if (mapa[c.fecha]) {
        mapa[c.fecha].push(c);
      } else {
        mapa[c.fecha] = [c];
      }
    });

    return mapa;
  }, [citasFiltradas, lunes]);

  // Copiar itinerario en formato WhatsApp
  const copiarItinerarioWhatsApp = async () => {
    if (!citasFiltradas.length) return;

    const proveedorTitulo =
      filtroProveedor !== "todos" ? ` (${filtroProveedor})` : "";
    let texto = `📋 *RUTA SEMANAL DE INSPECCIONES — SAUCEDA*${proveedorTitulo}\n`;
    texto += `🗓️ Del ${lunes.getDate()} de ${MESES_CORTOS[lunes.getMonth()]} al ${domingo.getDate()} de ${MESES_CORTOS[domingo.getMonth()]} de ${domingo.getFullYear()}\n\n`;

    Object.entries(citasPorDia).forEach(([fechaIso, items]) => {
      if (items.length === 0) return;
      const [y, m, d] = fechaIso.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      const diaNombre = NOMBRES_DIAS[dt.getDay()].toUpperCase();

      texto += `==============================\n`;
      texto += `📌 *${diaNombre} ${d} DE ${MESES_CORTOS[m - 1].toUpperCase()}* (${items.length} visitas)\n`;
      texto += `==============================\n\n`;

      items.forEach((c, idx) => {
        const estIcon = c.estado === "confirmada" ? "🟢" : "🟡";
        texto += `${idx + 1}. ${estIcon} *${c.hora_inicio}* — *${c.cliente_nombre}* ${c.expediente_id ? `(${c.expediente_id})` : ""}\n`;
        texto += `   📍 *Dirección:* ${c.direccion_completa}\n`;
        if (c.cliente_telefono) {
          const telLimpio = c.cliente_telefono.replace(/\D/g, "");
          texto += `   📞 *Teléfono:* ${c.cliente_telefono} (wa.me/52${telLimpio})\n`;
        }
        if (c.notas) {
          texto += `   📝 *Detalle:* ${c.notas.replace(/\n/g, " ")}\n`;
        }
        texto += `   👷 *Asignado:* ${c.tecnico_asignado}\n\n`;
      });
    });

    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoWa(true);
      setTimeout(() => setCopiadoWa(false), 2500);
    } catch (e) {
      console.error("Error al copiar texto:", e);
    }
  };

  // Abrir modal de reprogramación
  const abrirModalReprogramar = (cita: CitaRutaEnriquecida) => {
    setCitaAEditar(cita);
    setEditFecha(cita.fecha);
    setEditHoraInicio(cita.hora_inicio);
  };

  // Guardar reprogramación
  const handleGuardarReprogramacion = async () => {
    if (!citaAEditar || !editFecha || !editHoraInicio) return;
    setGuardandoCambio(true);
    try {
      await reprogramarCitaSemanal(citaAEditar.id, editFecha, editHoraInicio);
      setCitaAEditar(null);
      await cargarDatos();
    } catch (e) {
      console.error(e);
      alert("No se pudo reprogramar la cita.");
    } finally {
      setGuardandoCambio(false);
    }
  };

  // Cambiar estado rápido
  const handleToggleEstado = async (cita: CitaRutaEnriquecida) => {
    const nuevo = cita.estado === "confirmada" ? "pendiente" : "confirmada";
    try {
      await actualizarEstadoCitaSemanal(cita.id, nuevo);
      await cargarDatos();
    } catch (e) {
      console.error(e);
      alert("No se pudo cambiar el estado.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra de Encabezado y Selector de Semana */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white rounded-2xl border border-carbon/10 p-5 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">🗺️</span>
            <h2 className="font-titular text-xl font-bold text-verde-profundo">
              Planificador y Ruta Semanal de Inspecciones
            </h2>
          </div>
          <p className="text-xs text-carbon/60">
            Organiza los bloques territoriales, confirma visitas de campo y despacha itinerarios por WhatsApp a los técnicos.
          </p>
        </div>

        {/* Controles de Semana */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={irSemanaAnterior}
            className="px-3 py-1.5 rounded-xl border border-carbon/15 bg-white text-xs font-bold text-carbon hover:bg-carbon/5 transition"
            title="Semana anterior"
          >
            ◀ Anterior
          </button>
          <button
            type="button"
            onClick={irSemanaActual}
            className="px-3 py-1.5 rounded-xl border border-sauce/30 bg-sauce/10 text-xs font-bold text-sauce hover:bg-sauce/20 transition"
          >
            Esta Semana
          </button>
          <button
            type="button"
            onClick={irSemanaSiguiente}
            className="px-3 py-1.5 rounded-xl border border-carbon/15 bg-white text-xs font-bold text-carbon hover:bg-carbon/5 transition"
            title="Semana siguiente"
          >
            Siguiente ▶
          </button>

          <span className="text-xs font-semibold text-carbon/80 bg-carbon/5 border border-carbon/10 px-3 py-1.5 rounded-xl">
            {lunes.getDate()} {MESES_CORTOS[lunes.getMonth()]} — {domingo.getDate()} {MESES_CORTOS[domingo.getMonth()]}, {domingo.getFullYear()}
          </span>
        </div>
      </div>

      {/* Barra de Filtros y Acción de Despacho */}
      <div className="bg-white rounded-2xl border border-carbon/10 p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Filtro Proveedor */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-carbon/50">
                Técnico:
              </span>
              <select
                value={filtroProveedor}
                onChange={(e) => setFiltroProveedor(e.target.value)}
                className="rounded-xl border border-carbon/15 bg-crema/20 px-3 py-1.5 text-xs text-verde-profundo font-semibold outline-none focus:border-sauce"
              >
                <option value="todos">Todos los Técnicos</option>
                {datosRuta?.proveedores.map((p) => (
                  <option key={p.id} value={p.nombre}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro Negocio */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-carbon/50">
                Línea:
              </span>
              <select
                value={filtroNegocio}
                onChange={(e) => setFiltroNegocio(e.target.value)}
                className="rounded-xl border border-carbon/15 bg-crema/20 px-3 py-1.5 text-xs text-verde-profundo font-semibold outline-none focus:border-sauce"
              >
                <option value="todos">Todas las Líneas</option>
                {datosRuta?.tiposNegocio.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro Estatus */}
            <div className="flex items-center gap-1 bg-carbon/5 p-1 rounded-xl border border-carbon/10">
              <button
                type="button"
                onClick={() => setFiltroEstado("todos")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  filtroEstado === "todos"
                    ? "bg-white text-carbon shadow-xs"
                    : "text-carbon/60 hover:text-carbon"
                }`}
              >
                Todas ({datosRuta?.resumen.total || 0})
              </button>
              <button
                type="button"
                onClick={() => setFiltroEstado("confirmada")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                  filtroEstado === "confirmada"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-emerald-700 hover:text-emerald-900"
                }`}
              >
                <span>●</span> Confirmadas ({datosRuta?.resumen.confirmadas || 0})
              </button>
              <button
                type="button"
                onClick={() => setFiltroEstado("pendiente")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                  filtroEstado === "pendiente"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "text-amber-700 hover:text-amber-900"
                }`}
              >
                <span>●</span> Pendientes ({datosRuta?.resumen.pendientes || 0})
              </button>
            </div>
          </div>

          {/* Botón Acción Copiar Ruta WhatsApp */}
          <button
            type="button"
            onClick={copiarItinerarioWhatsApp}
            disabled={citasFiltradas.length === 0}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 self-start md:self-auto ${
              copiadoWa
                ? "bg-emerald-600 text-white"
                : "bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            <span>{copiadoWa ? "✓" : "📋"}</span>
            {copiadoWa ? "¡Ruta copiada al portapapeles!" : "Copiar Ruta para WhatsApp"}
          </button>
        </div>
      </div>

      {/* Grid de Días de la Semana */}
      {cargando ? (
        <div className="bg-white rounded-2xl border border-carbon/10 p-12 text-center text-sm text-carbon/60">
          Cargando ruta de la semana...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Object.entries(citasPorDia).map(([fechaIso, items]) => {
            const [y, m, d] = fechaIso.split("-").map(Number);
            const dt = new Date(y, m - 1, d);
            const diaIndex = dt.getDay();
            const diaNombre = NOMBRES_DIAS[diaIndex];

            const esHoy =
              new Date().toISOString().slice(0, 10) === fechaIso;

            const confirmadasDia = items.filter((x) => x.estado === "confirmada").length;

            return (
              <div
                key={fechaIso}
                className={`rounded-2xl border transition-all flex flex-col ${
                  esHoy
                    ? "bg-amber-50/30 border-sauce shadow-sm"
                    : "bg-white border-carbon/10 hover:border-carbon/20 shadow-xs"
                }`}
              >
                {/* Cabecera del Día */}
                <div
                  className={`p-3.5 border-b rounded-t-2xl flex items-center justify-between ${
                    esHoy
                      ? "bg-sauce/10 border-sauce/20"
                      : "bg-carbon/5 border-carbon/10"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-bold capitalize ${
                        esHoy ? "text-sauce" : "text-carbon/90"
                      }`}
                    >
                      {diaNombre} {d} {MESES_CORTOS[m - 1]}
                    </span>
                    {esHoy && (
                      <span className="bg-sauce text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                        Hoy
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-carbon/60">
                    {items.length} {items.length === 1 ? "visita" : "visitas"}
                    {items.length > 0 && ` · 🟢 ${confirmadasDia}`}
                  </span>
                </div>

                {/* Lista de Visitas del Día */}
                <div className="p-3.5 space-y-3 flex-1">
                  {items.length === 0 ? (
                    <div className="py-8 text-center text-xs text-carbon/40 italic">
                      Sin visitas programadas
                    </div>
                  ) : (
                    items.map((cita) => {
                      const esConf = cita.estado === "confirmada";
                      const telLimpio = (cita.cliente_telefono || "").replace(/\D/g, "");
                      const enlaceMaps =
                        cita.link_google_maps ||
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          cita.direccion_completa + ", León Guanajuato"
                        )}`;

                      return (
                        <div
                          key={cita.id}
                          className={`p-3 rounded-xl border transition-all space-y-2 relative ${
                            esConf
                              ? "bg-emerald-50/30 border-emerald-500/25 hover:border-emerald-500/50"
                              : "bg-amber-50/30 border-amber-500/25 hover:border-amber-500/50"
                          }`}
                        >
                          {/* Fila Superior: Horario, Estatus y Técnico */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-verde-profundo bg-white px-2 py-0.5 rounded-md border border-carbon/10 shadow-2xs">
                              ⏰ {cita.hora_inicio} — {cita.hora_fin}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                                  esConf
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {esConf ? "🟢 Confirmada" : "🟡 Pendiente"}
                              </span>
                            </div>
                          </div>

                          {/* Cliente y Folio */}
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-carbon">
                                {cita.cliente_nombre}
                              </span>
                              {cita.expediente_id && (
                                <Link
                                  href={`/expediente/${cita.expediente_id}`}
                                  className="text-[11px] font-mono font-bold text-sauce hover:underline"
                                  title="Abrir expediente en CRM"
                                >
                                  ({cita.expediente_id})
                                </Link>
                              )}
                            </div>
                          </div>

                          {/* Dirección */}
                          <div className="text-[11px] text-carbon/80 leading-relaxed">
                            📍 <span className="font-medium">{cita.direccion_completa}</span>
                          </div>

                          {/* Notas / Servicio */}
                          {cita.notas && (
                            <div className="text-[11px] text-carbon/60 line-clamp-2 italic bg-white/60 p-1.5 rounded-md border border-carbon/5">
                              {cita.notas}
                            </div>
                          )}

                          {/* Badge Técnico Asignado */}
                          <div className="text-[11px] text-carbon/70 flex items-center justify-between pt-1 border-t border-carbon/10">
                            <span className="flex items-center gap-1">
                              <span>👷</span> {cita.tecnico_asignado}
                            </span>
                            {cita.valor_estimado ? (
                              <span className="text-[10px] font-mono font-bold text-sauce">
                                ${cita.valor_estimado.toLocaleString("es-MX")}
                              </span>
                            ) : null}
                          </div>

                          {/* Botonera de Acciones de la Tarjeta */}
                          <div className="flex items-center justify-between gap-1.5 pt-1.5">
                            <div className="flex items-center gap-1">
                              {/* Maps */}
                              <a
                                href={enlaceMaps}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2 py-1 rounded-lg bg-white border border-carbon/15 text-[10px] font-semibold text-carbon hover:bg-carbon/5 flex items-center gap-1"
                                title="Abrir en Google Maps"
                              >
                                🗺️ Maps
                              </a>

                              {/* WhatsApp */}
                              {telLimpio && (
                                <a
                                  href={`https://wa.me/52${telLimpio}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold flex items-center gap-1"
                                  title="Contactar al cliente por WhatsApp"
                                >
                                  💬 WA
                                </a>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              {/* Cambiar Estado */}
                              <button
                                type="button"
                                onClick={() => handleToggleEstado(cita)}
                                className="px-2 py-1 rounded-lg bg-white border border-carbon/15 text-[10px] font-semibold text-carbon hover:bg-carbon/5"
                                title={esConf ? "Marcar como pendiente" : "Marcar como confirmada"}
                              >
                                {esConf ? "🟡 Pasar Pendiente" : "🟢 Confirmar"}
                              </button>

                              {/* Reprogramar */}
                              <button
                                type="button"
                                onClick={() => abrirModalReprogramar(cita)}
                                className="px-2 py-1 rounded-lg bg-white border border-carbon/15 text-[10px] font-semibold text-sauce hover:bg-sauce/5"
                                title="Cambiar fecha u horario"
                              >
                                ✏️ Mover
                              </button>
                            </div>
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
      )}

      {/* Modal para Reprogramar Visita */}
      {citaAEditar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-carbon/15 p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-carbon/10 pb-3">
              <h3 className="font-titular text-base font-bold text-verde-profundo">
                Reprogramar Visita Técnica
              </h3>
              <button
                type="button"
                onClick={() => setCitaAEditar(null)}
                className="text-carbon/40 hover:text-carbon text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 text-xs">
              <p className="font-bold text-carbon">{citaAEditar.cliente_nombre}</p>
              <p className="text-carbon/60">{citaAEditar.direccion_completa}</p>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-carbon/60 uppercase mb-1">
                  Nueva Fecha:
                </label>
                <input
                  type="date"
                  value={editFecha}
                  onChange={(e) => setEditFecha(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs font-semibold text-carbon outline-none focus:border-sauce"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-carbon/60 uppercase mb-1">
                  Nueva Hora de Inicio:
                </label>
                <input
                  type="time"
                  value={editHoraInicio}
                  onChange={(e) => setEditHoraInicio(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs font-semibold text-carbon outline-none focus:border-sauce"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-carbon/10">
              <button
                type="button"
                onClick={() => setCitaAEditar(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-carbon/15 text-carbon hover:bg-carbon/5 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarReprogramacion}
                disabled={guardandoCambio}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-sauce text-white hover:bg-sauce/90 transition shadow-sm disabled:opacity-50"
              >
                {guardandoCambio ? "Guardando..." : "Guardar Cambio"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
