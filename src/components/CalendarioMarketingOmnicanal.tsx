"use client";

import React, { useState, useMemo } from "react";
import { PublicacionProgramada, reprogramarPublicacion } from "@/app/actions/marketing";

interface CalendarioMarketingOmnicanalProps {
  publicaciones: PublicacionProgramada[];
  onRecargar: () => Promise<void>;
  onPrevisualizar: (pub: PublicacionProgramada) => void;
  onEditar: (pub: PublicacionProgramada) => void;
  onNuevaPublicacionParaFecha?: (fechaIso: string) => void;
}

export default function CalendarioMarketingOmnicanal({
  publicaciones,
  onRecargar,
  onPrevisualizar,
  onEditar,
  onNuevaPublicacionParaFecha,
}: CalendarioMarketingOmnicanalProps) {
  const [fechaActual, setFechaActual] = useState<Date>(() => new Date());
  const [canalFiltro, setCanalFiltro] = useState<string>("todos");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("todos");
  const [vista, setVista] = useState<"mes" | "agenda">("mes");

  // Publicación seleccionada para el modal de inspección y reprogramación rápida
  const [pubSeleccionada, setPubSeleccionada] = useState<PublicacionProgramada | null>(null);
  const [nuevaFechaHora, setNuevaFechaHora] = useState<string>("");
  const [guardandoFecha, setGuardandoFecha] = useState(false);

  const mesActual = fechaActual.getMonth();
  const anioActual = fechaActual.getFullYear();

  const mesesNombres = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const diasSemana = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  // Navegación de mes
  const handleMesAnterior = () => {
    setFechaActual(new Date(anioActual, mesActual - 1, 1));
  };

  const handleMesSiguiente = () => {
    setFechaActual(new Date(anioActual, mesActual + 1, 1));
  };

  const handleHoy = () => {
    setFechaActual(new Date());
  };

  // Filtrado de publicaciones para el calendario
  const publicacionesFiltradas = useMemo(() => {
    return publicaciones.filter((pub) => {
      // Filtro de canal
      if (canalFiltro !== "todos") {
        if (canalFiltro === "mautic") {
          if (pub.plataforma !== "mautic" && pub.plataforma !== "email") return false;
        } else if (pub.plataforma !== canalFiltro) {
          return false;
        }
      }

      // Filtro de estado
      if (estadoFiltro !== "todos") {
        if (estadoFiltro === "aprobados" && pub.estado !== "aprobado") return false;
        if (estadoFiltro === "pendientes" && pub.estado !== "pendiente_revision") return false;
        if (estadoFiltro === "publicados" && pub.estado !== "publicado") return false;
      }

      return true;
    });
  }, [publicaciones, canalFiltro, estadoFiltro]);

  // Contadores por canal en el mes visible
  const conteosCanalMes = useMemo(() => {
    const conteos: Record<string, number> = {
      todos: 0,
      facebook: 0,
      instagram: 0,
      tiktok: 0,
      whatsapp: 0,
      mautic: 0,
    };

    publicaciones.forEach((pub) => {
      if (!pub.fecha_programacion) return;
      const f = new Date(pub.fecha_programacion);
      if (f.getMonth() === mesActual && f.getFullYear() === anioActual) {
        conteos.todos = (conteos.todos || 0) + 1;
        if (pub.plataforma === "email" || pub.plataforma === "mautic") {
          conteos.mautic = (conteos.mautic || 0) + 1;
        } else if (conteos[pub.plataforma] !== undefined) {
          conteos[pub.plataforma] = (conteos[pub.plataforma] || 0) + 1;
        }
      }
    });

    return conteos;
  }, [publicaciones, mesActual, anioActual]);

  // Agrupar publicaciones por fecha (formato YYYY-MM-DD)
  const publicacionesPorDia = useMemo(() => {
    const mapa = new Map<string, PublicacionProgramada[]>();

    publicacionesFiltradas.forEach((pub) => {
      if (!pub.fecha_programacion) return;
      const clave = pub.fecha_programacion.split("T")[0];
      if (!mapa.has(clave)) {
        mapa.set(clave, []);
      }
      mapa.get(clave)!.push(pub);
    });

    // Ordenar cada día por hora
    mapa.forEach((lista) => {
      lista.sort((a, b) => (a.fecha_programacion > b.fecha_programacion ? 1 : -1));
    });

    return mapa;
  }, [publicacionesFiltradas]);

  // Generación de celdas para la cuadrícula mensual
  const celdasCalendario = useMemo(() => {
    const primerDiaDelMes = new Date(anioActual, mesActual, 1);
    const ultimoDiaDelMes = new Date(anioActual, mesActual + 1, 0);

    // En JS 0 es Domingo, 1 Lunes... convertimos para que Lunes sea 0 y Domingo 6
    let diaInicioSemana = primerDiaDelMes.getDay() - 1;
    if (diaInicioSemana === -1) diaInicioSemana = 6;

    const totalDias = ultimoDiaDelMes.getDate();
    const celdas: Array<{
      fechaStr: string;
      diaNumero: number;
      esMesActual: boolean;
      esHoy: boolean;
      publicaciones: PublicacionProgramada[];
    }> = [];

    const hoyStr = new Date().toISOString().split("T")[0];

    // Días del mes anterior para rellenar la primera fila
    const ultimoDiaMesAnterior = new Date(anioActual, mesActual, 0).getDate();
    for (let i = diaInicioSemana - 1; i >= 0; i--) {
      const diaNum = ultimoDiaMesAnterior - i;
      const d = new Date(anioActual, mesActual - 1, diaNum);
      const fechaStr = d.toISOString().split("T")[0];
      celdas.push({
        fechaStr,
        diaNumero: diaNum,
        esMesActual: false,
        esHoy: fechaStr === hoyStr,
        publicaciones: publicacionesPorDia.get(fechaStr) || [],
      });
    }

    // Días del mes actual
    for (let dia = 1; dia <= totalDias; dia++) {
      const d = new Date(anioActual, mesActual, dia);
      const fechaStr = d.toISOString().split("T")[0];
      celdas.push({
        fechaStr,
        diaNumero: dia,
        esMesActual: true,
        esHoy: fechaStr === hoyStr,
        publicaciones: publicacionesPorDia.get(fechaStr) || [],
      });
    }

    // Días del siguiente mes para completar la cuadrícula de 7 columnas
    const celdasRestantes = (7 - (celdas.length % 7)) % 7;
    for (let dia = 1; dia <= celdasRestantes; dia++) {
      const d = new Date(anioActual, mesActual + 1, dia);
      const fechaStr = d.toISOString().split("T")[0];
      celdas.push({
        fechaStr,
        diaNumero: dia,
        esMesActual: false,
        esHoy: fechaStr === hoyStr,
        publicaciones: publicacionesPorDia.get(fechaStr) || [],
      });
    }

    return celdas;
  }, [anioActual, mesActual, publicacionesPorDia]);

  // Helpers de badges de plataforma
  const getBadgeCanal = (plataforma: string) => {
    switch (plataforma) {
      case "facebook":
        return { bg: "bg-[#1877F2]/10 text-[#1877F2] border-[#1877F2]/30", icon: "🔵", label: "FB" };
      case "instagram":
        return { bg: "bg-pink-500/10 text-pink-600 border-pink-500/30", icon: "🟣", label: "IG" };
      case "tiktok":
        return { bg: "bg-black/10 text-carbon border-black/20", icon: "⚫", label: "TT" };
      case "whatsapp":
        return { bg: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", icon: "🟢", label: "WA" };
      case "email":
      case "mautic":
        return { bg: "bg-orange-500/10 text-orange-700 border-orange-500/30", icon: "🟠", label: "Mautic" };
      default:
        return { bg: "bg-gray-100 text-carbon/70 border-gray-200", icon: "🌐", label: plataforma };
    }
  };

  const getPuntoEstado = (estado: string) => {
    switch (estado) {
      case "pendiente_revision":
        return { color: "bg-amber-500", label: "Revisión" };
      case "aprobado":
        return { color: "bg-emerald-500", label: "Aprobado" };
      case "publicado":
        return { color: "bg-blue-500", label: "Publicado" };
      case "rechazado":
        return { color: "bg-red-500", label: "Rechazado" };
      default:
        return { color: "bg-gray-400", label: estado };
    }
  };

  const formatHora = (fechaIso: string) => {
    try {
      const d = new Date(fechaIso);
      return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: true });
    } catch {
      return "";
    }
  };

  // Abrir inspección rápida de una publicación
  const handleAbrirDetalle = (pub: PublicacionProgramada) => {
    setPubSeleccionada(pub);
    if (pub.fecha_programacion) {
      setNuevaFechaHora(pub.fecha_programacion.substring(0, 16));
    } else {
      setNuevaFechaHora("");
    }
  };

  // Guardar nueva fecha y hora
  const handleGuardarNuevaFecha = async () => {
    if (!pubSeleccionada?.id || !nuevaFechaHora) return;
    setGuardandoFecha(true);
    try {
      const fechaCompletaIso = new Date(nuevaFechaHora).toISOString();
      const res = await reprogramarPublicacion(pubSeleccionada.id, fechaCompletaIso);
      if (res.success && res.data) {
        setPubSeleccionada(res.data);
        await onRecargar();
      } else {
        alert("Error al reprogramar: " + res.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setGuardandoFecha(false);
    }
  };

  // Atajos rápidos de hora para reprogramar
  const handleAplicarAtajoHora = (tipo: "hoy_tarde" | "manana_10" | "manana_19" | "sabado_11") => {
    const base = new Date();
    if (tipo === "hoy_tarde") {
      base.setHours(18, 0, 0, 0);
    } else if (tipo === "manana_10") {
      base.setDate(base.getDate() + 1);
      base.setHours(10, 0, 0, 0);
    } else if (tipo === "manana_19") {
      base.setDate(base.getDate() + 1);
      base.setHours(19, 30, 0, 0);
    } else if (tipo === "sabado_11") {
      const diasHastaSabado = (6 - base.getDay() + 7) % 7 || 7;
      base.setDate(base.getDate() + diasHastaSabado);
      base.setHours(11, 0, 0, 0);
    }
    // Formatear a YYYY-MM-DDTHH:mm
    const tzOffset = base.getTimezoneOffset() * 60000;
    const localISOTime = new Date(base.getTime() - tzOffset).toISOString().slice(0, 16);
    setNuevaFechaHora(localISOTime);
  };

  return (
    <section className="bg-white rounded-3xl border border-dorado/30 shadow-md overflow-hidden mt-10">
      {/* Cabecera del Calendario */}
      <div className="bg-verde-profundo text-crema p-5 sm:p-6 border-b border-dorado/30">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📅</span>
              <h2 className="font-bold text-xl sm:text-2xl">
                Calendario Editorial Omnicanal
              </h2>
            </div>
            <p className="text-xs text-crema/70 mt-1">
              Visualiza y reprograma publicaciones en Facebook, Instagram, TikTok, WhatsApp y Mautic.
            </p>
          </div>

          {/* Navegación de Mes */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white/10 rounded-2xl p-1 border border-white/20">
              <button
                onClick={handleMesAnterior}
                className="w-8 h-8 rounded-xl hover:bg-white/20 flex items-center justify-center text-sm font-bold transition cursor-pointer"
                title="Mes anterior"
              >
                ◀
              </button>
              <span className="px-4 text-sm font-bold min-w-[150px] text-center">
                {mesesNombres[mesActual]} {anioActual}
              </span>
              <button
                onClick={handleMesSiguiente}
                className="w-8 h-8 rounded-xl hover:bg-white/20 flex items-center justify-center text-sm font-bold transition cursor-pointer"
                title="Mes siguiente"
              >
                ▶
              </button>
            </div>

            <button
              onClick={handleHoy}
              className="bg-dorado hover:bg-dorado/90 text-verde-profundo font-bold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer shadow-xs"
            >
              Hoy
            </button>

            {/* Alternador Mes / Agenda */}
            <div className="hidden sm:flex bg-white/10 rounded-xl p-0.5 border border-white/20">
              <button
                onClick={() => setVista("mes")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  vista === "mes" ? "bg-white text-verde-profundo shadow-xs" : "text-crema hover:text-white"
                }`}
              >
                Cuadrícula
              </button>
              <button
                onClick={() => setVista("agenda")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  vista === "agenda" ? "bg-white text-verde-profundo shadow-xs" : "text-crema hover:text-white"
                }`}
              >
                Agenda
              </button>
            </div>
          </div>
        </div>

        {/* Barra de Filtros Omnicanal */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t border-white/10">
          {/* Chips de Canales con Conteo */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setCanalFiltro("todos")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                canalFiltro === "todos"
                  ? "bg-white text-verde-profundo shadow-sm"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
            >
              <span>🌐</span> Todos ({conteosCanalMes.todos})
            </button>

            <button
              onClick={() => setCanalFiltro("facebook")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                canalFiltro === "facebook"
                  ? "bg-[#1877F2] text-white shadow-sm"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
            >
              <span>🔵</span> Facebook ({conteosCanalMes.facebook})
            </button>

            <button
              onClick={() => setCanalFiltro("instagram")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                canalFiltro === "instagram"
                  ? "bg-gradient-to-r from-[#833AB4] to-[#FD1D1D] text-white shadow-sm"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
            >
              <span>🟣</span> Instagram ({conteosCanalMes.instagram})
            </button>

            <button
              onClick={() => setCanalFiltro("tiktok")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                canalFiltro === "tiktok"
                  ? "bg-black text-white shadow-sm"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
            >
              <span>⚫</span> TikTok ({conteosCanalMes.tiktok})
            </button>

            <button
              onClick={() => setCanalFiltro("whatsapp")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                canalFiltro === "whatsapp"
                  ? "bg-[#25D366] text-white shadow-sm"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
            >
              <span>🟢</span> WhatsApp ({conteosCanalMes.whatsapp})
            </button>

            <button
              onClick={() => setCanalFiltro("mautic")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                canalFiltro === "mautic"
                  ? "bg-[#FF6A00] text-white shadow-sm"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
            >
              <span>🟠</span> Mautic / Correo ({conteosCanalMes.mautic})
            </button>
          </div>

          {/* Filtro de Estado */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-crema/60 uppercase">Estado:</span>
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl px-3 py-1 text-xs text-crema focus:outline-none focus:bg-verde-profundo cursor-pointer"
            >
              <option value="todos" className="text-carbon">Todos los Estados</option>
              <option value="pendientes" className="text-carbon">⏳ Pendientes de Revisión</option>
              <option value="aprobados" className="text-carbon">✅ Aprobados / Programados</option>
              <option value="publicados" className="text-carbon">📲 Publicados</option>
            </select>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* CUADRÍCULA MENSUAL */}
      {/* ============================================================== */}
      {vista === "mes" && (
        <div className="p-3 sm:p-5">
          {/* Encabezado Días de la Semana */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center">
            {diasSemana.map((dia, idx) => (
              <div
                key={dia}
                className={`py-2 text-xs font-bold uppercase tracking-wider rounded-xl ${
                  idx >= 5 ? "text-amber-800 bg-amber-50/50" : "text-carbon/60 bg-gray-50"
                }`}
              >
                {dia}
              </div>
            ))}
          </div>

          {/* Días del Calendario */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {celdasCalendario.map((celda, idx) => {
              return (
                <div
                  key={`${celda.fechaStr}-${idx}`}
                  className={`min-h-[110px] sm:min-h-[135px] p-2 rounded-2xl border transition-all flex flex-col justify-between ${
                    celda.esHoy
                      ? "border-emerald-500 bg-emerald-50/30 ring-2 ring-emerald-500/20 shadow-xs"
                      : celda.esMesActual
                      ? "border-gray-200 bg-white hover:border-dorado/50 hover:shadow-xs"
                      : "border-gray-100 bg-gray-50/50 opacity-40 hover:opacity-80"
                  }`}
                >
                  {/* Número de Día y Botón Añadir */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                        celda.esHoy
                          ? "bg-emerald-600 text-white shadow-xs"
                          : celda.esMesActual
                          ? "text-carbon"
                          : "text-carbon/40"
                      }`}
                    >
                      {celda.diaNumero}
                    </span>

                    {celda.esHoy && (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                        HOY
                      </span>
                    )}

                    {onNuevaPublicacionParaFecha && (
                      <button
                        onClick={() => onNuevaPublicacionParaFecha(celda.fechaStr)}
                        className="opacity-0 group-hover:opacity-100 hover:bg-gray-200 text-carbon/60 rounded p-0.5 text-xs transition cursor-pointer"
                        title="Programar para este día"
                      >
                        +
                      </button>
                    )}
                  </div>

                  {/* Lista de Publicaciones del Día */}
                  <div className="flex-1 space-y-1 overflow-y-auto max-h-[90px] pr-0.5">
                    {celda.publicaciones.map((pub) => {
                      const canalBadge = getBadgeCanal(pub.plataforma);
                      const punto = getPuntoEstado(pub.estado);

                      return (
                        <div
                          key={pub.id}
                          onClick={() => handleAbrirDetalle(pub)}
                          className={`p-1.5 rounded-lg border text-[11px] leading-tight cursor-pointer transition hover:scale-[1.02] shadow-2xs group relative ${canalBadge.bg}`}
                          title={`${pub.titulo} (${pub.plataforma})`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold flex items-center gap-1 truncate">
                              <span>{canalBadge.icon}</span>
                              <span className="truncate">{pub.titulo}</span>
                            </span>
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${punto.color}`}
                              title={punto.label}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-carbon/60 mt-0.5 font-mono">
                            <span>⏰ {formatHora(pub.fecha_programacion)}</span>
                            <span className="text-[9px] uppercase font-bold">{canalBadge.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA DE AGENDA SEMANAL / MENSUAL */}
      {/* ============================================================== */}
      {vista === "agenda" && (
        <div className="p-4 sm:p-6 space-y-4">
          {Array.from(publicacionesPorDia.entries()).length === 0 ? (
            <div className="text-center py-12 text-carbon/50">
              <span className="text-4xl">📭</span>
              <p className="mt-2 text-sm font-semibold">No hay publicaciones con los filtros seleccionados</p>
            </div>
          ) : (
            Array.from(publicacionesPorDia.entries()).map(([fechaStr, listaPubs]) => {
              const fechaObj = new Date(fechaStr + "T12:00:00");
              const esHoy = fechaStr === new Date().toISOString().split("T")[0];

              return (
                <div key={fechaStr} className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
                  <div
                    className={`px-4 py-2.5 font-bold text-xs uppercase flex items-center justify-between ${
                      esHoy ? "bg-emerald-600 text-white" : "bg-gray-100 text-carbon/80"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>📅</span>
                      {fechaObj.toLocaleDateString("es-MX", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    {esHoy && <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">HOY</span>}
                  </div>

                  <div className="p-3 divide-y divide-gray-100 bg-white">
                    {listaPubs.map((pub) => {
                      const canalBadge = getBadgeCanal(pub.plataforma);
                      const punto = getPuntoEstado(pub.estado);

                      return (
                        <div
                          key={pub.id}
                          className="py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-gray-50/80 px-2 rounded-xl transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-lg">{canalBadge.icon}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-sm text-carbon truncate">
                                  {pub.titulo}
                                </h4>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${canalBadge.bg}`}>
                                  {pub.plataforma}
                                </span>
                              </div>
                              <p className="text-xs text-carbon/60 line-clamp-1 mt-0.5">
                                {pub.contenido}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-xs text-carbon/70 font-semibold bg-gray-100 px-2.5 py-1 rounded-lg">
                              ⏰ {formatHora(pub.fecha_programacion)}
                            </span>
                            <span
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg text-white ${punto.color}`}
                            >
                              {punto.label}
                            </span>
                            <button
                              onClick={() => onPrevisualizar(pub)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                            >
                              👁️ Previsualizar
                            </button>
                            <button
                              onClick={() => handleAbrirDetalle(pub)}
                              className="bg-white hover:bg-gray-100 border border-gray-200 text-carbon text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                            >
                              ⏰ Reagendar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL DE INSPECCIÓN Y REPROGRAMACIÓN RÁPIDA */}
      {/* ============================================================== */}
      {pubSeleccionada && (
        <div className="fixed inset-0 z-50 bg-carbon/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-dorado/30 overflow-hidden">
            {/* Cabecera del Detalle */}
            <div className="bg-verde-profundo text-crema p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-dorado block">
                  Gestión Rápida de Publicación
                </span>
                <h3 className="font-bold text-base mt-0.5 truncate max-w-[340px]">
                  {pubSeleccionada.titulo}
                </h3>
              </div>
              <button
                onClick={() => setPubSeleccionada(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold cursor-pointer transition"
              >
                ✕
              </button>
            </div>

            {/* Contenido del Detalle */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Badges de Canal, Formato y Estado */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${getBadgeCanal(pubSeleccionada.plataforma).bg}`}>
                  {getBadgeCanal(pubSeleccionada.plataforma).icon} {pubSeleccionada.plataforma.toUpperCase()}
                </span>
                <span className="text-xs bg-gray-100 text-carbon/70 font-semibold px-2.5 py-1 rounded-lg">
                  {pubSeleccionada.tipo_formato}
                </span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg text-white ${getPuntoEstado(pubSeleccionada.estado).color}`}>
                  {getPuntoEstado(pubSeleccionada.estado).label}
                </span>
              </div>

              {/* Miniatura y Copy */}
              <div className="bg-gray-50 rounded-2xl p-3 border border-gray-200 flex gap-3 items-start">
                {pubSeleccionada.url_imagen && (
                  <img
                    src={pubSeleccionada.url_imagen}
                    alt="Arte"
                    className="w-16 h-16 rounded-xl object-cover border border-gray-300 shrink-0 bg-black"
                  />
                )}
                <p className="text-xs text-carbon/80 leading-relaxed line-clamp-3">
                  {pubSeleccionada.contenido}
                </p>
              </div>

              {/* Selector de Reprogramación */}
              <div className="border border-dorado/30 rounded-2xl p-4 bg-dorado/5 space-y-3">
                <label className="text-xs font-bold text-verde-profundo block">
                  ⏰ Reprogramar Fecha y Hora de Publicación
                </label>
                <input
                  type="datetime-local"
                  value={nuevaFechaHora}
                  onChange={(e) => setNuevaFechaHora(e.target.value)}
                  className="w-full bg-white border border-dorado/30 rounded-xl px-3.5 py-2 text-sm text-carbon focus:outline-none focus:border-verde-profundo"
                />

                {/* Atajos de Horarios Estratégicos */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold text-carbon/50 block">Atajos de 1 clic:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAplicarAtajoHora("hoy_tarde")}
                      className="text-[11px] font-semibold bg-white hover:bg-gray-100 border border-gray-200 rounded-lg py-1.5 px-2 text-carbon text-left cursor-pointer transition"
                    >
                      🌆 Hoy a las 18:00 hrs
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAplicarAtajoHora("manana_10")}
                      className="text-[11px] font-semibold bg-white hover:bg-gray-100 border border-gray-200 rounded-lg py-1.5 px-2 text-carbon text-left cursor-pointer transition"
                    >
                      🌅 Mañana a las 10:00 hrs
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAplicarAtajoHora("manana_19")}
                      className="text-[11px] font-semibold bg-white hover:bg-gray-100 border border-gray-200 rounded-lg py-1.5 px-2 text-carbon text-left cursor-pointer transition"
                    >
                      🌙 Mañana a las 19:30 hrs
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAplicarAtajoHora("sabado_11")}
                      className="text-[11px] font-semibold bg-white hover:bg-gray-100 border border-gray-200 rounded-lg py-1.5 px-2 text-carbon text-left cursor-pointer transition"
                    >
                      ☀️ Sábado a las 11:00 hrs
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={guardandoFecha}
                  onClick={handleGuardarNuevaFecha}
                  className="w-full bg-verde-profundo hover:bg-verde-profundo/90 text-crema font-bold text-xs py-2.5 rounded-xl transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {guardandoFecha ? "Guardando..." : "💾 Guardar Nueva Fecha y Hora"}
                </button>
              </div>

              {/* Botón de Previsualización en Redes */}
              <button
                type="button"
                onClick={() => {
                  onPrevisualizar(pubSeleccionada);
                  setPubSeleccionada(null);
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>👁️</span> Previsualizar en Red Social
              </button>
            </div>

            {/* Pie del Detalle */}
            <div className="bg-gray-50 px-5 py-3.5 border-t border-gray-200 flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  onEditar(pubSeleccionada);
                  setPubSeleccionada(null);
                }}
                className="text-xs font-bold text-verde-profundo hover:underline cursor-pointer"
              >
                ✏️ Editar Post Completo
              </button>
              <button
                type="button"
                onClick={() => setPubSeleccionada(null)}
                className="bg-gray-200 hover:bg-gray-300 text-carbon font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
