"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  obtenerCoordinacionesSlaAgenda,
  agendarCitaDesdeCoordinacion,
  type CoordinacionSlaItem,
  type RespuestaCoordinacionesSla,
  type EstadoSlaItem,
} from "@/app/actions/coordinaciones-sla";

export function CoordinacionesSlaDashboard() {
  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState<RespuestaCoordinacionesSla | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filtroSla, setFiltroSla] = useState<"todas" | "vencidas_riesgo" | "listas_cliente" | "esperando_proveedor">("todas");
  const [filtroNegocio, setFiltroNegocio] = useState<string>("todos");
  const [busqueda, setBusqueda] = useState<string>("");

  // Modal para agendar cita
  const [itemAgendar, setItemAgendar] = useState<CoordinacionSlaItem | null>(null);
  const [fechaCita, setFechaCita] = useState<string>("");
  const [horaInicio, setHoraInicio] = useState<string>("10:00");
  const [horaFin, setHoraFin] = useState<string>("11:00");
  const [guardandoCita, setGuardandoCita] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await obtenerCoordinacionesSlaAgenda();
      setDatos(res);
    } catch (err: any) {
      console.error("Error al cargar coordinaciones:", err);
      setError("No se pudieron cargar las coordinaciones. Revisa tu conexión.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Formato legible de tiempo restante
  const formatoTiempoRestante = (minutos: number | null, estado: EstadoSlaItem) => {
    if (minutos === null) return "Sin SLA definido";
    if (minutos < 0) {
      const m = Math.abs(minutos);
      const horas = Math.floor(m / 60);
      const mins = m % 60;
      return horas > 0 ? `Vencido hace ${horas}h ${mins}m` : `Vencido hace ${mins}m`;
    }
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    if (horas > 24) {
      const dias = Math.floor(horas / 24);
      return `${dias}d ${horas % 24}h restantes`;
    }
    return horas > 0 ? `${horas}h ${mins}m restantes` : `${mins} min restantes`;
  };

  // Filtrado
  const itemsFiltrados = useMemo(() => {
    if (!datos) return [];
    return datos.items.filter((item) => {
      // Filtro por estado SLA
      if (filtroSla === "vencidas_riesgo") {
        if (item.slaEstado !== "vencido" && item.slaEstado !== "por_vencer") return false;
      } else if (filtroSla === "listas_cliente") {
        if (item.fase !== "fechas_recibidas" && item.fase !== "acordada_por_agendar") return false;
      } else if (filtroSla === "esperando_proveedor") {
        if (item.fase !== "esperando_proveedor") return false;
      }

      // Filtro por negocio
      if (filtroNegocio !== "todos" && item.tipoNegocio !== filtroNegocio) {
        return false;
      }

      // Búsqueda
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        const coincide =
          item.clienteNombre.toLowerCase().includes(q) ||
          item.folio.toLowerCase().includes(q) ||
          item.proveedorNombre.toLowerCase().includes(q) ||
          item.zona.toLowerCase().includes(q) ||
          item.descripcion.toLowerCase().includes(q);
        if (!coincide) return false;
      }

      return true;
    });
  }, [datos, filtroSla, filtroNegocio, busqueda]);

  // Lista de negocios únicos para el filtro
  const negociosUnicos = useMemo(() => {
    if (!datos) return [];
    const sets = new Set<string>();
    datos.items.forEach((i) => {
      if (i.tipoNegocio) sets.add(i.tipoNegocio);
    });
    return Array.from(sets);
  }, [datos]);

  // Manejar apertura de modal para agendar
  const abrirModalAgendar = (item: CoordinacionSlaItem) => {
    setItemAgendar(item);
    // Sugerir fecha de hoy o de mañana
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    setFechaCita(manana.toISOString().split("T")[0]);
    setHoraInicio("10:00");
    setHoraFin("11:00");
  };

  const handleConfirmarAgendado = async () => {
    if (!itemAgendar || !fechaCita) return;
    setGuardandoCita(true);
    try {
      const res = await agendarCitaDesdeCoordinacion({
        solicitudId: itemAgendar.tipoOrigen === "solicitud_servicio" ? itemAgendar.id : undefined,
        expedienteId: itemAgendar.expedienteId,
        clienteNombre: itemAgendar.clienteNombre,
        clienteTelefono: itemAgendar.clienteTelefono,
        fecha: fechaCita,
        horaInicio,
        horaFin,
        servicioTipo: itemAgendar.tipoNegocio,
        fraccionamiento: itemAgendar.zona,
        notas: `Coordinado con ${itemAgendar.proveedorNombre}. ${itemAgendar.descripcion}`,
      });

      if (res.ok) {
        setMensajeExito(`¡Cita agendada exitosamente para ${itemAgendar.clienteNombre} el ${fechaCita}!`);
        setItemAgendar(null);
        await cargarDatos();
        setTimeout(() => setMensajeExito(null), 5000);
      } else {
        alert("Error al agendar cita: " + (res.error || "Ocurrió un error inesperado"));
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setGuardandoCita(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mensaje de Éxito */}
      {mensajeExito && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{mensajeExito}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensajeExito(null)}
            className="text-emerald-600 hover:text-emerald-900 text-xs"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Encabezado y Métricas SLA */}
      <div className="bg-white p-5 rounded-2xl border border-carbon/10 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-black text-carbon flex items-center gap-2">
              <span>⚡</span> Coordinaciones Pendientes & SLAs Operativos
            </h2>
            <p className="text-xs text-carbon/60 mt-0.5">
              Control en tiempo real de servicios, instalaciones e inspecciones que se están negociando con proveedores antes de fijar fecha con el cliente.
            </p>
          </div>
          <button
            type="button"
            onClick={cargarDatos}
            disabled={cargando}
            className="self-start md:self-auto px-3.5 py-1.5 rounded-xl border border-carbon/15 text-xs font-bold text-carbon hover:bg-carbon/5 transition flex items-center gap-1.5"
          >
            <span>🔄</span> {cargando ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        {/* Semáforo de SLAs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Vencidas */}
          <button
            type="button"
            onClick={() => setFiltroSla(filtroSla === "vencidas_riesgo" ? "todas" : "vencidas_riesgo")}
            className={`p-3.5 rounded-xl border text-left transition ${
              filtroSla === "vencidas_riesgo"
                ? "bg-red-50 border-red-300 ring-2 ring-red-400"
                : "bg-red-50/50 border-red-100 hover:bg-red-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-red-700">🔴 SLAs Vencidos</span>
              <span className="text-xs">⚠️</span>
            </div>
            <div className="text-2xl font-black text-red-800 mt-1">
              {datos?.resumen.vencidas ?? 0}
            </div>
            <div className="text-[10px] text-red-600 font-medium mt-0.5">
              Requieren llamada inmediata
            </div>
          </button>

          {/* Por Vencer */}
          <button
            type="button"
            onClick={() => setFiltroSla(filtroSla === "vencidas_riesgo" ? "todas" : "vencidas_riesgo")}
            className={`p-3.5 rounded-xl border text-left transition ${
              datos?.resumen.porVencer ? "bg-amber-50 border-amber-200" : "bg-white border-carbon/10"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-800">🟡 Por Vencer (&lt; 2h)</span>
              <span className="text-xs">⏳</span>
            </div>
            <div className="text-2xl font-black text-amber-900 mt-1">
              {datos?.resumen.porVencer ?? 0}
            </div>
            <div className="text-[10px] text-amber-700 font-medium mt-0.5">
              Sin respuesta de proveedor
            </div>
          </button>

          {/* Listas para cliente */}
          <button
            type="button"
            onClick={() => setFiltroSla(filtroSla === "listas_cliente" ? "todas" : "listas_cliente")}
            className={`p-3.5 rounded-xl border text-left transition ${
              filtroSla === "listas_cliente"
                ? "bg-blue-50 border-blue-300 ring-2 ring-blue-400"
                : "bg-blue-50/50 border-blue-100 hover:bg-blue-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-800">💬 Listas para Cliente</span>
              <span className="text-xs">📲</span>
            </div>
            <div className="text-2xl font-black text-blue-900 mt-1">
              {datos?.resumen.fechasListasParaCliente ?? 0}
            </div>
            <div className="text-[10px] text-blue-700 font-medium mt-0.5">
              Fechas listas para agendar
            </div>
          </button>

          {/* Total Activas */}
          <button
            type="button"
            onClick={() => setFiltroSla("todas")}
            className={`p-3.5 rounded-xl border text-left transition ${
              filtroSla === "todas"
                ? "bg-verde-profundo/5 border-verde-profundo/30 ring-2 ring-verde-profundo/20"
                : "bg-white border-carbon/10 hover:bg-carbon/5"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-carbon">📋 Total Activas</span>
              <span className="text-xs">⚡</span>
            </div>
            <div className="text-2xl font-black text-carbon mt-1">
              {datos?.resumen.totalActivas ?? 0}
            </div>
            <div className="text-[10px] text-carbon/60 font-medium mt-0.5">
              En flujo operativo
            </div>
          </button>
        </div>

        {/* Filtros y Buscador */}
        <div className="mt-4 pt-4 border-t border-carbon/10 flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por cliente, folio (ej. SOL-0005), proveedor o colonia..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-carbon/20 focus:outline-none focus:border-verde-profundo"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filtroNegocio}
              onChange={(e) => setFiltroNegocio(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-carbon/20 bg-white focus:outline-none focus:border-verde-profundo font-medium"
            >
              <option value="todos">Todos los Negocios</option>
              {negociosUnicos.map((neg) => (
                <option key={neg} value={neg}>
                  {neg}
                </option>
              ))}
            </select>

            <select
              value={filtroSla}
              onChange={(e) => setFiltroSla(e.target.value as any)}
              className="px-3 py-2 text-xs rounded-xl border border-carbon/20 bg-white focus:outline-none focus:border-verde-profundo font-medium"
            >
              <option value="todas">Todos los Estados</option>
              <option value="vencidas_riesgo">🔴 Vencidas / En Riesgo</option>
              <option value="esperando_proveedor">⏳ Esperando Proveedor</option>
              <option value="listas_cliente">💬 Listas para Cliente</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Coordinaciones */}
      {cargando ? (
        <div className="bg-white p-12 rounded-2xl border border-carbon/10 text-center text-xs text-carbon/50">
          <div className="inline-block animate-spin text-2xl mb-2">🔄</div>
          <div>Cargando coordinaciones y estados de SLA...</div>
        </div>
      ) : error ? (
        <div className="bg-red-50 p-6 rounded-2xl border border-red-200 text-center text-xs text-red-700">
          <div>{error}</div>
          <button
            type="button"
            onClick={cargarDatos}
            className="mt-3 px-4 py-1.5 rounded-lg bg-red-600 text-white font-bold"
          >
            Reintentar
          </button>
        </div>
      ) : itemsFiltrados.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-carbon/10 text-center text-carbon/60">
          <span className="text-3xl">🎉</span>
          <h3 className="font-bold text-sm text-carbon mt-2">No hay coordinaciones pendientes con estos filtros</h3>
          <p className="text-xs text-carbon/50 mt-1 max-w-sm mx-auto">
            Todas las citas están al día o no coinciden con los criterios de búsqueda actuales.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {itemsFiltrados.map((item) => {
            const esVencido = item.slaEstado === "vencido";
            const esPorVencer = item.slaEstado === "por_vencer";
            const tieneFechas = item.fechasPropuestasProveedor.length > 0 || item.fechaAcordada;

            // Construir enlace de WhatsApp para recordar al proveedor
            const telProv = (item.proveedorTelefono || "").replace(/\D/g, "");
            const telProvWa = telProv.length === 10 ? `52${telProv}` : telProv;
            const msjProveedor = encodeURIComponent(
              `Hola ${item.proveedorNombre.split(" ")[0]} 👋, tenemos pendiente la confirmación de fecha para el servicio:\n\n` +
              `📌 *${item.folio}: ${item.tipoServicio}*\n` +
              `📍 Zona: ${item.zona}\n` +
              `¿Nos podrías apoyar indicando qué día y horario tienes disponible? Saludos.`
            );
            const linkWaProveedor = telProvWa ? `https://wa.me/${telProvWa}?text=${msjProveedor}` : null;

            // Construir enlace de WhatsApp para cliente
            const telCli = (item.clienteTelefono || "").replace(/\D/g, "");
            const telCliWa = telCli.length === 10 ? `52${telCli}` : telCli;
            const fechasTxt = item.fechasPropuestasProveedor.length > 0
              ? item.fechasPropuestasProveedor.map((f, idx) => `  ${idx + 1}️⃣ ${f}`).join("\n")
              : `  1️⃣ ${item.fechaAcordada || "Horario por definir"}`;
            const msjCliente = encodeURIComponent(
              `¡Hola ${item.clienteNombre.split(" ")[0]}! 👋\n\n` +
              `Ya tenemos la propuesta de fechas del técnico para tu ${item.tipoServicio.toLowerCase()}:\n\n` +
              `${fechasTxt}\n\n` +
              `¿Cuál de estos horarios te queda mejor para recibir al especialista? Quedamos a tus órdenes.`
            );
            const linkWaCliente = telCliWa ? `https://wa.me/${telCliWa}?text=${msjCliente}` : null;

            return (
              <div
                key={`${item.tipoOrigen}-${item.id}`}
                className={`bg-white rounded-2xl border p-5 transition shadow-sm ${
                  esVencido
                    ? "border-red-300 ring-1 ring-red-200"
                    : esPorVencer
                    ? "border-amber-300 ring-1 ring-amber-100"
                    : "border-carbon/10 hover:border-carbon/20"
                }`}
              >
                {/* Header de la tarjeta */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-carbon/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-carbon/5 text-carbon border border-carbon/10">
                      {item.folio}
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-verde-profundo/10 text-verde-profundo">
                      {item.tipoNegocio}
                    </span>
                    <span className="text-xs text-carbon/40">·</span>
                    <span className="text-xs font-semibold text-carbon/70">
                      {item.tipoServicio}
                    </span>
                  </div>

                  {/* Badge de SLA */}
                  <div className="flex items-center gap-2">
                    {esVencido ? (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-red-100 text-red-800 border border-red-200 flex items-center gap-1.5 animate-pulse">
                        <span>🔴</span>
                        <span>{formatoTiempoRestante(item.slaMinutosRestantes, item.slaEstado)}</span>
                      </span>
                    ) : esPorVencer ? (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1.5">
                        <span>🟡</span>
                        <span>{formatoTiempoRestante(item.slaMinutosRestantes, item.slaEstado)}</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                        <span>🟢</span>
                        <span>{formatoTiempoRestante(item.slaMinutosRestantes, item.slaEstado)}</span>
                      </span>
                    )}

                    {item.fase === "fechas_recibidas" && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200">
                        💬 Fechas listas
                      </span>
                    )}
                  </div>
                </div>

                {/* Cuerpo de la tarjeta */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  {/* Columna 1: Cliente y Ubicación */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-carbon/40 mb-1">
                      Cliente y Ubicación
                    </div>
                    <div className="font-bold text-sm text-carbon flex items-center gap-1.5">
                      <span>👤</span>
                      <span>{item.clienteNombre}</span>
                    </div>
                    {item.clienteTelefono && (
                      <div className="text-xs text-carbon/70 mt-1 flex items-center gap-2">
                        <span>📞 {item.clienteTelefono}</span>
                        {telCliWa && (
                          <a
                            href={`https://wa.me/${telCliWa}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-verde-profundo hover:underline font-bold text-[11px]"
                          >
                            (WhatsApp)
                          </a>
                        )}
                      </div>
                    )}
                    <div className="text-xs text-carbon/60 mt-1 flex items-start gap-1">
                      <span>📍</span>
                      <span>{item.zona || item.direccion || "Zona León"}</span>
                    </div>
                  </div>

                  {/* Columna 2: Descripción y Proveedor */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-carbon/40 mb-1">
                      Proveedor y Trabajo
                    </div>
                    <div className="text-xs text-carbon font-medium line-clamp-2">
                      {item.descripcion}
                    </div>
                    <div className="mt-2 text-xs">
                      <span className="text-carbon/50">Técnico/Cuadrilla: </span>
                      <span className="font-bold text-carbon">{item.proveedorNombre}</span>
                    </div>
                    {item.costoAcordado && (
                      <div className="text-xs font-bold text-verde-profundo mt-0.5">
                        Costo acordado: ${item.costoAcordado.toLocaleString("es-MX")} MXN
                      </div>
                    )}
                  </div>

                  {/* Columna 3: Fechas y Horarios */}
                  <div className="bg-carbon/5 p-3 rounded-xl border border-carbon/10">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-carbon/50 mb-1 flex items-center justify-between">
                      <span>Ventanas de Horario</span>
                      <span className="text-[10px] font-semibold text-carbon/40">
                        SLA total: {item.horasRespuestaTotal}h
                      </span>
                    </div>

                    {item.fechasPropuestasProveedor.length > 0 ? (
                      <div className="space-y-1 mt-1">
                        <div className="text-[11px] font-bold text-blue-900">
                          Horarios que ofreció el técnico:
                        </div>
                        {item.fechasPropuestasProveedor.map((f, idx) => (
                          <div key={idx} className="text-xs text-carbon font-medium flex items-center gap-1.5">
                            <span className="text-blue-600">▪</span>
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    ) : item.fechaAcordada ? (
                      <div className="text-xs font-bold text-emerald-800">
                        Fecha acordada: {item.fechaAcordada}
                      </div>
                    ) : (
                      <div className="text-xs text-carbon/50 italic">
                        Esperando que el técnico confirme horarios...
                        {item.fechasSugeridasInicial && (
                          <div className="text-[11px] text-carbon/70 not-italic mt-1">
                            Sugerida: {item.fechasSugeridasInicial}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Acciones de Cierre */}
                <div className="mt-4 pt-3 border-t border-carbon/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {/* Botón WhatsApp Proveedor */}
                    {linkWaProveedor && item.fase === "esperando_proveedor" && (
                      <a
                        href={linkWaProveedor}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm"
                      >
                        <span>📲</span> Recordar al Técnico por WhatsApp
                      </a>
                    )}

                    {/* Botón Enviar opciones al cliente */}
                    {linkWaCliente && (
                      <a
                        href={linkWaCliente}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm"
                      >
                        <span>💬</span> Enviar Opciones al Cliente
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Botón Agendar Cita en Calendario */}
                    <button
                      type="button"
                      onClick={() => abrirModalAgendar(item)}
                      className="px-3.5 py-1.5 rounded-xl bg-verde-profundo hover:bg-verde-profundo/90 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm"
                    >
                      <span>📅</span> Agendar Cita en Ruta Semanal
                    </button>

                    {/* Enlace al Expediente */}
                    {item.expedienteId && (
                      <Link
                        href={`/expediente/${item.expedienteId}`}
                        className="px-3 py-1.5 rounded-xl border border-carbon/15 text-carbon hover:bg-carbon/5 font-semibold text-xs transition flex items-center gap-1"
                      >
                        <span>📁</span> Ver Expediente
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal para Agendar Cita Fija */}
      {itemAgendar && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-carbon/10 space-y-4">
            <div className="flex items-center justify-between border-b border-carbon/10 pb-3">
              <h3 className="font-black text-sm text-carbon flex items-center gap-2">
                <span>📅</span> Agendar en Ruta Semanal
              </h3>
              <button
                type="button"
                onClick={() => setItemAgendar(null)}
                className="text-carbon/40 hover:text-carbon text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-carbon/70">
              Vas a formalizar la cita para <strong className="text-carbon">{itemAgendar.clienteNombre}</strong> ({itemAgendar.tipoServicio}) con el técnico <strong className="text-carbon">{itemAgendar.proveedorNombre}</strong>.
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-carbon/70 mb-1">
                  Fecha de la Cita:
                </label>
                <input
                  type="date"
                  value={fechaCita}
                  onChange={(e) => setFechaCita(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-carbon/20 focus:outline-none focus:border-verde-profundo font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-carbon/70 mb-1">
                    Hora Inicio:
                  </label>
                  <input
                    type="time"
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-carbon/20 focus:outline-none focus:border-verde-profundo font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-carbon/70 mb-1">
                    Hora Fin:
                  </label>
                  <input
                    type="time"
                    value={horaFin}
                    onChange={(e) => setHoraFin(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-carbon/20 focus:outline-none focus:border-verde-profundo font-medium"
                  />
                </div>
              </div>

              {itemAgendar.fechasPropuestasProveedor.length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900">
                  <div className="font-bold mb-1">Horarios que propuso el técnico:</div>
                  {itemAgendar.fechasPropuestasProveedor.map((f, i) => (
                    <div key={i} className="text-blue-800">▪ {f}</div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-carbon/10">
              <button
                type="button"
                onClick={() => setItemAgendar(null)}
                disabled={guardandoCita}
                className="px-4 py-2 text-xs font-bold text-carbon/60 hover:text-carbon"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarAgendado}
                disabled={guardandoCita || !fechaCita}
                className="px-4 py-2 rounded-xl bg-verde-profundo hover:bg-verde-profundo/90 text-white font-bold text-xs transition disabled:opacity-50"
              >
                {guardandoCita ? "Guardando cita..." : "Confirmar y Pasar a Ruta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
