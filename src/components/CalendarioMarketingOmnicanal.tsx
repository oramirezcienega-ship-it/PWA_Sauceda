"use client";

import React, { useState, useMemo, useEffect } from "react";
import { PublicacionProgramada, reprogramarPublicacion } from "@/app/actions/marketing";

interface CalendarioMarketingOmnicanalProps {
  publicaciones: PublicacionProgramada[];
  onRecargar: () => Promise<void>;
  onPrevisualizar: (pub: PublicacionProgramada) => void;
  onEditar: (pub: PublicacionProgramada) => void;
  onNuevaPublicacionParaFecha?: (fechaIso: string) => void;
}

interface CeldaCalendario {
  fechaStr: string;
  diaNumero: number;
  nombreDia: string;
  nombreMes: string;
  esMesActual: boolean;
  esHoy: boolean;
  publicaciones: PublicacionProgramada[];
}

function obtenerLunesDeSemana(fecha: Date): Date {
  const f = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12, 0, 0);
  const diaSemana = f.getDay();
  const diasDesdeLunes = diaSemana === 0 ? 6 : diaSemana - 1;
  f.setDate(f.getDate() - diasDesdeLunes);
  return f;
}

export default function CalendarioMarketingOmnicanal({
  publicaciones,
  onRecargar,
  onPrevisualizar,
  onEditar,
  onNuevaPublicacionParaFecha,
}: CalendarioMarketingOmnicanalProps) {
  const [fechaActual, setFechaActual] = useState<Date>(() => new Date());
  const [canalesFiltro, setCanalesFiltro] = useState<string[]>([]);
  const [estadosFiltro, setEstadosFiltro] = useState<string[]>([]);
  const [vista, setVista] = useState<"semana" | "quincena" | "mes" | "agenda">("semana");
  const [filtrosCargados, setFiltrosCargados] = useState(false);

  // Restaurar filtros y vista guardados en localStorage al iniciar
  useEffect(() => {
    try {
      const guardado = localStorage.getItem("crm_sauceda_calendario_filtros_v2");
      if (guardado) {
        const parsed = JSON.parse(guardado);
        if (Array.isArray(parsed.canales)) setCanalesFiltro(parsed.canales);
        if (Array.isArray(parsed.estados)) setEstadosFiltro(parsed.estados);
        if (["semana", "quincena", "mes", "agenda"].includes(parsed.vista)) {
          setVista(parsed.vista);
        }
      }
    } catch (e) {
      console.warn("Aviso al restaurar filtros del calendario:", e);
    } finally {
      setFiltrosCargados(true);
    }
  }, []);

  // Guardar filtros y vista en localStorage al cambiar
  useEffect(() => {
    if (!filtrosCargados) return;
    try {
      localStorage.setItem(
        "crm_sauceda_calendario_filtros_v2",
        JSON.stringify({
          canales: canalesFiltro,
          estados: estadosFiltro,
          vista,
        })
      );
    } catch (e) {
      console.warn("Aviso al guardar filtros del calendario:", e);
    }
  }, [canalesFiltro, estadosFiltro, vista, filtrosCargados]);

  // Handlers para togglear filtros múltiples
  const handleToggleCanal = (canal: string) => {
    if (canal === "todos") {
      setCanalesFiltro([]);
      return;
    }
    setCanalesFiltro((prev) =>
      prev.includes(canal) ? prev.filter((c) => c !== canal) : [...prev, canal]
    );
  };

  const handleToggleEstado = (estado: string) => {
    if (estado === "todos") {
      setEstadosFiltro([]);
      return;
    }
    setEstadosFiltro((prev) =>
      prev.includes(estado) ? prev.filter((e) => e !== estado) : [...prev, estado]
    );
  };

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
  const mesesNombresCortos = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
  ];
  const diasSemana = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  // Navegación adaptable al nivel de zoom
  const handleAnterior = () => {
    if (vista === "semana") {
      const f = new Date(fechaActual);
      f.setDate(f.getDate() - 7);
      setFechaActual(f);
    } else if (vista === "quincena") {
      const f = new Date(fechaActual);
      f.setDate(f.getDate() - 14);
      setFechaActual(f);
    } else {
      setFechaActual(new Date(anioActual, mesActual - 1, 1));
    }
  };

  const handleSiguiente = () => {
    if (vista === "semana") {
      const f = new Date(fechaActual);
      f.setDate(f.getDate() + 7);
      setFechaActual(f);
    } else if (vista === "quincena") {
      const f = new Date(fechaActual);
      f.setDate(f.getDate() + 14);
      setFechaActual(f);
    } else {
      setFechaActual(new Date(anioActual, mesActual + 1, 1));
    }
  };

  const handleHoy = () => {
    setFechaActual(new Date());
  };

  // Título dinámico para la barra de navegación según el zoom
  const tituloNavegacion = useMemo(() => {
    if (vista === "mes" || vista === "agenda") {
      return `${mesesNombres[mesActual]} ${anioActual}`;
    }

    const lunes = obtenerLunesDeSemana(fechaActual);

    if (vista === "semana") {
      const domingo = new Date(lunes);
      domingo.setDate(lunes.getDate() + 6);

      const dLunes = lunes.getDate();
      const mLunes = mesesNombresCortos[lunes.getMonth()];
      const aLunes = lunes.getFullYear();

      const dDom = domingo.getDate();
      const mDom = mesesNombresCortos[domingo.getMonth()];
      const aDom = domingo.getFullYear();

      if (lunes.getMonth() === domingo.getMonth()) {
        return `Semana: ${dLunes} - ${dDom} ${mLunes} ${aDom}`;
      } else if (aLunes === aDom) {
        return `Semana: ${dLunes} ${mLunes} - ${dDom} ${mDom} ${aDom}`;
      } else {
        return `Semana: ${dLunes} ${mLunes} ${aLunes} - ${dDom} ${mDom} ${aDom}`;
      }
    }

    if (vista === "quincena") {
      const finQuincena = new Date(lunes);
      finQuincena.setDate(lunes.getDate() + 13);

      const dInicio = lunes.getDate();
      const mInicio = mesesNombresCortos[lunes.getMonth()];
      const aInicio = lunes.getFullYear();

      const dFin = finQuincena.getDate();
      const mFin = mesesNombresCortos[finQuincena.getMonth()];
      const aFin = finQuincena.getFullYear();

      if (lunes.getMonth() === finQuincena.getMonth()) {
        return `15 Días: ${dInicio} - ${dFin} ${mInicio} ${aFin}`;
      } else if (aInicio === aFin) {
        return `15 Días: ${dInicio} ${mInicio} - ${dFin} ${mFin} ${aFin}`;
      } else {
        return `15 Días: ${dInicio} ${mInicio} ${aInicio} - ${dFin} ${mFin} ${aFin}`;
      }
    }

    return `${mesesNombres[mesActual]} ${anioActual}`;
  }, [vista, fechaActual, mesActual, anioActual]);

  // Filtrado de publicaciones para el calendario (Multiselección)
  const publicacionesFiltradas = useMemo(() => {
    return publicaciones.filter((pub) => {
      // Filtro de canal múltiple
      if (canalesFiltro.length > 0) {
        const coincideCanal = canalesFiltro.some((canal) => {
          if (canal === "mautic") {
            return pub.plataforma === "mautic" || pub.plataforma === "email";
          }
          return pub.plataforma === canal;
        });
        if (!coincideCanal) return false;
      }

      // Filtro de estado múltiple
      if (estadosFiltro.length > 0) {
        const coincideEstado = estadosFiltro.some((est) => {
          if (est === "pendientes") return pub.estado === "pendiente_revision";
          if (est === "aprobados") return pub.estado === "aprobado";
          if (est === "publicados") return pub.estado === "publicado";
          if (est === "rechazados") return pub.estado === "rechazado";
          return pub.estado === est;
        });
        if (!coincideEstado) return false;
      }

      return true;
    });
  }, [publicaciones, canalesFiltro, estadosFiltro]);

  // Agrupar publicaciones por fecha (formato YYYY-MM-DD en hora de México)
  const publicacionesPorDia = useMemo(() => {
    const mapa = new Map<string, PublicacionProgramada[]>();

    publicacionesFiltradas.forEach((pub) => {
      const strFecha = (pub.estado === "publicado" && pub.publicado_en)
        ? pub.publicado_en
        : (pub.fecha_programacion || pub.publicado_en || pub.created_at);
      if (!strFecha) return;
      const f = new Date(strFecha);
      if (isNaN(f.getTime())) return;

      // Convertir siempre a la fecha local de México para no desfasar por UTC
      const clave = f.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
      if (!mapa.has(clave)) {
        mapa.set(clave, []);
      }
      mapa.get(clave)!.push(pub);
    });

    // Ordenar cada día por hora cronológica
    mapa.forEach((lista) => {
      lista.sort((a, b) => {
        const strA = (a.estado === "publicado" && a.publicado_en)
          ? a.publicado_en
          : (a.fecha_programacion || a.publicado_en || a.created_at || "");
        const strB = (b.estado === "publicado" && b.publicado_en)
          ? b.publicado_en
          : (b.fecha_programacion || b.publicado_en || b.created_at || "");
        const da = new Date(strA).getTime() || 0;
        const db = new Date(strB).getTime() || 0;
        return da - db;
      });
    });

    return mapa;
  }, [publicacionesFiltradas]);

  // Lista de días ordenados cronológicamente para la vista de Agenda
  const diasAgenda = useMemo(() => {
    return Array.from(publicacionesPorDia.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [publicacionesPorDia]);

  // Generación de celdas para el Zoom Semanal (7 días)
  const celdasSemana = useMemo(() => {
    const lunes = obtenerLunesDeSemana(fechaActual);
    const hoyStr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
    const celdas: CeldaCalendario[] = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      const fechaStr = d.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
      const diaNumero = d.getDate();
      const nombreDia = d.toLocaleDateString("es-MX", { weekday: "short" });
      const nombreMes = mesesNombresCortos[d.getMonth()];

      celdas.push({
        fechaStr,
        diaNumero,
        nombreDia,
        nombreMes,
        esMesActual: d.getMonth() === mesActual,
        esHoy: fechaStr === hoyStr,
        publicaciones: publicacionesPorDia.get(fechaStr) || [],
      });
    }

    return celdas;
  }, [fechaActual, mesActual, publicacionesPorDia]);

  // Generación de celdas para el Zoom 15 Días (2 semanas completas = 14 días)
  const celdasQuincena = useMemo(() => {
    const lunes = obtenerLunesDeSemana(fechaActual);
    const hoyStr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
    const celdas: CeldaCalendario[] = [];

    for (let i = 0; i < 14; i++) {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      const fechaStr = d.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
      const diaNumero = d.getDate();
      const nombreDia = d.toLocaleDateString("es-MX", { weekday: "short" });
      const nombreMes = mesesNombresCortos[d.getMonth()];

      celdas.push({
        fechaStr,
        diaNumero,
        nombreDia,
        nombreMes,
        esMesActual: d.getMonth() === mesActual,
        esHoy: fechaStr === hoyStr,
        publicaciones: publicacionesPorDia.get(fechaStr) || [],
      });
    }

    return celdas;
  }, [fechaActual, mesActual, publicacionesPorDia]);

  // Generación de celdas para la cuadrícula mensual
  const celdasCalendario = useMemo(() => {
    const primerDiaDelMes = new Date(anioActual, mesActual, 1);
    const ultimoDiaDelMes = new Date(anioActual, mesActual + 1, 0);

    // En JS 0 es Domingo, 1 Lunes... convertimos para que Lunes sea 0 y Domingo 6
    let diaInicioSemana = primerDiaDelMes.getDay() - 1;
    if (diaInicioSemana === -1) diaInicioSemana = 6;

    const totalDias = ultimoDiaDelMes.getDate();
    const celdas: CeldaCalendario[] = [];

    // Fecha de hoy en formato YYYY-MM-DD en la zona horaria de México (evita desfase UTC de +6 hrs después de las 6 PM)
    const hoyStr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });

    // Días del mes anterior para rellenar la primera fila
    const ultimoDiaMesAnterior = new Date(anioActual, mesActual, 0).getDate();
    const mesPrev = mesActual === 0 ? 12 : mesActual;
    const anioPrev = mesActual === 0 ? anioActual - 1 : anioActual;
    for (let i = diaInicioSemana - 1; i >= 0; i--) {
      const diaNum = ultimoDiaMesAnterior - i;
      const fechaStr = `${anioPrev}-${String(mesPrev).padStart(2, "0")}-${String(diaNum).padStart(2, "0")}`;
      celdas.push({
        fechaStr,
        diaNumero: diaNum,
        nombreDia: "",
        nombreMes: mesesNombresCortos[mesPrev - 1],
        esMesActual: false,
        esHoy: fechaStr === hoyStr,
        publicaciones: publicacionesPorDia.get(fechaStr) || [],
      });
    }

    // Días del mes actual
    for (let dia = 1; dia <= totalDias; dia++) {
      const fechaStr = `${anioActual}-${String(mesActual + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      celdas.push({
        fechaStr,
        diaNumero: dia,
        nombreDia: "",
        nombreMes: mesesNombresCortos[mesActual],
        esMesActual: true,
        esHoy: fechaStr === hoyStr,
        publicaciones: publicacionesPorDia.get(fechaStr) || [],
      });
    }

    // Días del siguiente mes para completar la cuadrícula de 7 columnas
    const celdasRestantes = (7 - (celdas.length % 7)) % 7;
    const mesNext = mesActual === 11 ? 1 : mesActual + 2;
    const anioNext = mesActual === 11 ? anioActual + 1 : anioActual;
    for (let dia = 1; dia <= celdasRestantes; dia++) {
      const fechaStr = `${anioNext}-${String(mesNext).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      celdas.push({
        fechaStr,
        diaNumero: dia,
        nombreDia: "",
        nombreMes: mesesNombresCortos[mesNext - 1],
        esMesActual: false,
        esHoy: fechaStr === hoyStr,
        publicaciones: publicacionesPorDia.get(fechaStr) || [],
      });
    }

    return celdas;
  }, [anioActual, mesActual, publicacionesPorDia]);

  // Contadores dinámicos por canal según el nivel de zoom y fechas visibles
  const conteosCanal = useMemo(() => {
    const conteos: Record<string, number> = {
      todos: 0,
      facebook: 0,
      instagram: 0,
      tiktok: 0,
      whatsapp: 0,
      mautic: 0,
    };

    let fechasVisibles: Set<string> | null = null;
    if (vista === "semana") {
      fechasVisibles = new Set(celdasSemana.map((c) => c.fechaStr));
    } else if (vista === "quincena") {
      fechasVisibles = new Set(celdasQuincena.map((c) => c.fechaStr));
    }

    publicaciones.forEach((pub) => {
      const strFecha = (pub.estado === "publicado" && pub.publicado_en)
        ? pub.publicado_en
        : (pub.fecha_programacion || pub.publicado_en || pub.created_at);
      if (!strFecha) return;
      const f = new Date(strFecha);
      if (isNaN(f.getTime())) return;

      const fechaLocalStr = f.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });

      if (fechasVisibles) {
        if (!fechasVisibles.has(fechaLocalStr)) return;
      } else {
        const [anio, mes] = fechaLocalStr.split("-").map(Number);
        if (mes - 1 !== mesActual || anio !== anioActual) return;
      }

      conteos.todos = (conteos.todos || 0) + 1;
      if (pub.plataforma === "email" || pub.plataforma === "mautic") {
        conteos.mautic = (conteos.mautic || 0) + 1;
      } else if (conteos[pub.plataforma] !== undefined) {
        conteos[pub.plataforma] = (conteos[pub.plataforma] || 0) + 1;
      }
    });

    return conteos;
  }, [publicaciones, vista, celdasSemana, celdasQuincena, mesActual, anioActual]);

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
        return { color: "bg-amber-500", label: "Borrador" };
      case "aprobado":
        return { color: "bg-emerald-500", label: "Programada" };
      case "publicado":
        return { color: "bg-blue-500", label: "✓ Enviada" };
      case "rechazado":
        return { color: "bg-red-500", label: "Rechazado" };
      default:
        return { color: "bg-gray-400", label: estado };
    }
  };

  const formatHora = (fechaIso: string) => {
    try {
      const d = new Date(fechaIso);
      return d.toLocaleTimeString("es-MX", {
        timeZone: "America/Mexico_City",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "";
    }
  };

  const formatHoraPub = (pub: PublicacionProgramada) => {
    try {
      const str = (pub.estado === "publicado" && pub.publicado_en)
        ? pub.publicado_en
        : (pub.fecha_programacion || pub.publicado_en || pub.created_at);
      if (!str) return "";
      const d = new Date(str);
      return d.toLocaleTimeString("es-MX", {
        timeZone: "America/Mexico_City",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "";
    }
  };

  // Abrir inspección rápida de una publicación
  const handleAbrirDetalle = (pub: PublicacionProgramada) => {
    setPubSeleccionada(pub);
    if (pub.fecha_programacion) {
      const d = new Date(pub.fecha_programacion);
      if (isNaN(d.getTime())) {
        setNuevaFechaHora("");
      } else {
        const tzOffset = d.getTimezoneOffset() * 60000;
        setNuevaFechaHora(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));
      }
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

          {/* Navegación adaptable al Zoom */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <div className="flex items-center bg-white/10 rounded-2xl p-1 border border-white/20">
              <button
                type="button"
                onClick={handleAnterior}
                className="w-8 h-8 rounded-xl hover:bg-white/20 flex items-center justify-center text-sm font-bold transition cursor-pointer"
                title={vista === "semana" ? "Semana anterior" : vista === "quincena" ? "15 días anteriores" : "Mes anterior"}
              >
                ◀
              </button>
              <span className="px-3 sm:px-4 text-xs sm:text-sm font-bold min-w-[140px] sm:min-w-[175px] text-center tracking-tight">
                {tituloNavegacion}
              </span>
              <button
                type="button"
                onClick={handleSiguiente}
                className="w-8 h-8 rounded-xl hover:bg-white/20 flex items-center justify-center text-sm font-bold transition cursor-pointer"
                title={vista === "semana" ? "Semana siguiente" : vista === "quincena" ? "Próximos 15 días" : "Mes siguiente"}
              >
                ▶
              </button>
            </div>

            <button
              type="button"
              onClick={handleHoy}
              className="bg-dorado hover:bg-dorado/90 text-verde-profundo font-bold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer shadow-xs"
            >
              Hoy
            </button>

            {/* Selector de Zoom / Vista (Semana, 15 Días, Mes, Agenda) */}
            <div className="flex bg-white/10 rounded-xl p-0.5 border border-white/20 items-center">
              <button
                type="button"
                onClick={() => setVista("semana")}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  vista === "semana" ? "bg-white text-verde-profundo shadow-xs" : "text-crema hover:text-white"
                }`}
                title="Zoom Semanal: Ver solo 7 días con tarjetas grandes y legibles"
              >
                <span>🔍 Semana</span>
              </button>
              <button
                type="button"
                onClick={() => setVista("quincena")}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  vista === "quincena" ? "bg-white text-verde-profundo shadow-xs" : "text-crema hover:text-white"
                }`}
                title="Zoom 15 Días: Ver 2 semanas con mayor espacio"
              >
                <span>🗓️ 15 Días</span>
              </button>
              <button
                type="button"
                onClick={() => setVista("mes")}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  vista === "mes" ? "bg-white text-verde-profundo shadow-xs" : "text-crema hover:text-white"
                }`}
                title="Vista Mensual completa (30 días)"
              >
                <span>📅 Mes</span>
              </button>
              <button
                type="button"
                onClick={() => setVista("agenda")}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  vista === "agenda" ? "bg-white text-verde-profundo shadow-xs" : "text-crema hover:text-white"
                }`}
                title="Lista cronológica de publicaciones"
              >
                <span>📋 Agenda</span>
              </button>
            </div>
          </div>
        </div>

        {/* Barra de Filtros Omnicanal con Selección Múltiple */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t border-white/10">
          {/* Chips de Canales con Conteo dinámico y Multiselección */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => handleToggleCanal("todos")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                canalesFiltro.length === 0
                  ? "bg-white text-verde-profundo shadow-sm"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
              title="Mostrar todos los canales"
            >
              <span>🌐</span> Todos ({conteosCanal.todos})
            </button>

            <button
              type="button"
              onClick={() => handleToggleCanal("facebook")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                canalesFiltro.includes("facebook")
                  ? "bg-[#1877F2] text-white shadow-sm ring-2 ring-white/50"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
              title="Filtrar Facebook (clic para activar/desactivar)"
            >
              <span>🔵</span> Facebook ({conteosCanal.facebook})
              {canalesFiltro.includes("facebook") && <span className="text-[10px] ml-0.5">✓</span>}
            </button>

            <button
              type="button"
              onClick={() => handleToggleCanal("instagram")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                canalesFiltro.includes("instagram")
                  ? "bg-gradient-to-r from-[#833AB4] to-[#FD1D1D] text-white shadow-sm ring-2 ring-white/50"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
              title="Filtrar Instagram (clic para activar/desactivar)"
            >
              <span>🟣</span> Instagram ({conteosCanal.instagram})
              {canalesFiltro.includes("instagram") && <span className="text-[10px] ml-0.5">✓</span>}
            </button>

            <button
              type="button"
              onClick={() => handleToggleCanal("tiktok")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                canalesFiltro.includes("tiktok")
                  ? "bg-black text-white shadow-sm ring-2 ring-white/50"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
              title="Filtrar TikTok (clic para activar/desactivar)"
            >
              <span>⚫</span> TikTok ({conteosCanal.tiktok})
              {canalesFiltro.includes("tiktok") && <span className="text-[10px] ml-0.5">✓</span>}
            </button>

            <button
              type="button"
              onClick={() => handleToggleCanal("whatsapp")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                canalesFiltro.includes("whatsapp")
                  ? "bg-[#25D366] text-white shadow-sm ring-2 ring-white/50"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
              title="Filtrar WhatsApp (clic para activar/desactivar)"
            >
              <span>🟢</span> WhatsApp ({conteosCanal.whatsapp})
              {canalesFiltro.includes("whatsapp") && <span className="text-[10px] ml-0.5">✓</span>}
            </button>

            <button
              type="button"
              onClick={() => handleToggleCanal("mautic")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                canalesFiltro.includes("mautic")
                  ? "bg-[#FF6A00] text-white shadow-sm ring-2 ring-white/50"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
              title="Filtrar Mautic / Correo (clic para activar/desactivar)"
            >
              <span>🟠</span> Mautic / Correo ({conteosCanal.mautic})
              {canalesFiltro.includes("mautic") && <span className="text-[10px] ml-0.5">✓</span>}
            </button>
          </div>

          {/* Filtros de Estado Multiselección y Limpiar */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-[11px] font-bold text-crema/60 uppercase mr-1">Estado:</span>
            <button
              type="button"
              onClick={() => handleToggleEstado("todos")}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                estadosFiltro.length === 0
                  ? "bg-white text-verde-profundo shadow-sm"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => handleToggleEstado("pendientes")}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                estadosFiltro.includes("pendientes")
                  ? "bg-amber-500 text-white shadow-sm ring-2 ring-white/50"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
              title="Borradores o pendientes de revisión"
            >
              <span>⏳ Borradores</span>
              {estadosFiltro.includes("pendientes") && <span className="text-[10px]">✓</span>}
            </button>
            <button
              type="button"
              onClick={() => handleToggleEstado("aprobados")}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                estadosFiltro.includes("aprobados")
                  ? "bg-emerald-500 text-white shadow-sm ring-2 ring-white/50"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
              title="Publicaciones programadas aprobadas"
            >
              <span>⏰ Programadas</span>
              {estadosFiltro.includes("aprobados") && <span className="text-[10px]">✓</span>}
            </button>
            <button
              type="button"
              onClick={() => handleToggleEstado("publicados")}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                estadosFiltro.includes("publicados")
                  ? "bg-blue-500 text-white shadow-sm ring-2 ring-white/50"
                  : "bg-white/10 text-crema/80 hover:bg-white/20"
              }`}
              title="Publicaciones ya enviadas o publicadas"
            >
              <span>✓ Enviadas</span>
              {estadosFiltro.includes("publicados") && <span className="text-[10px]">✓</span>}
            </button>

            {(canalesFiltro.length > 0 || estadosFiltro.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setCanalesFiltro([]);
                  setEstadosFiltro([]);
                }}
                className="bg-red-500/20 hover:bg-red-500/30 text-crema hover:text-white px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition cursor-pointer border border-red-400/30 ml-1"
                title="Limpiar todos los filtros aplicados en el calendario"
              >
                <span>✕</span> Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 1. ZOOM SEMANAL (7 DÍAS EN GRANDE)                             */}
      {/* ============================================================== */}
      {vista === "semana" && (
        <div className="p-3 sm:p-5 overflow-x-auto">
          <div className="min-w-[860px]">
            {/* Encabezado Días de la Semana con fecha grande */}
            <div className="grid grid-cols-7 gap-2 mb-3 text-center">
              {celdasSemana.map((celda, idx) => (
                <div
                  key={celda.fechaStr}
                  className={`py-2 px-1 rounded-2xl border transition-all ${
                    celda.esHoy
                      ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                      : idx >= 5
                      ? "bg-amber-50/80 border-amber-200/80 text-amber-900"
                      : "bg-gray-50 border-gray-200 text-carbon"
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                    {diasSemana[idx]}
                  </div>
                  <div className="text-lg font-black leading-tight">
                    {celda.diaNumero} <span className="text-[10px] font-semibold uppercase">{celda.nombreMes}</span>
                  </div>
                  {celda.esHoy && (
                    <span className="inline-block bg-white text-emerald-800 text-[9px] font-black px-2 py-0.2 rounded-full uppercase mt-0.5 shadow-2xs">
                      HOY
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Columnas de los 7 Días con tarjetas amplias */}
            <div className="grid grid-cols-7 gap-2">
              {celdasSemana.map((celda) => {
                const tienePubs = celda.publicaciones.length > 0;

                return (
                  <div
                    key={celda.fechaStr}
                    className={`min-h-[520px] p-2.5 rounded-2xl border transition-all flex flex-col justify-between ${
                      celda.esHoy
                        ? "border-emerald-500 bg-emerald-50/20 ring-2 ring-emerald-500/20 shadow-xs"
                        : "border-gray-200 bg-white hover:border-dorado/40"
                    }`}
                  >
                    {/* Encabezado del Día */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                            celda.esHoy
                              ? "bg-emerald-600 text-white"
                              : "bg-gray-100 text-carbon"
                          }`}
                        >
                          {celda.diaNumero}
                        </span>
                        <span className="text-[10px] font-semibold text-carbon/50">
                          {celda.publicaciones.length} {celda.publicaciones.length === 1 ? "post" : "posts"}
                        </span>
                      </div>

                      {onNuevaPublicacionParaFecha && (
                        <button
                          type="button"
                          onClick={() => onNuevaPublicacionParaFecha(celda.fechaStr)}
                          className="hover:bg-emerald-100 text-emerald-700 bg-emerald-50 rounded-lg px-1.5 py-0.5 text-xs font-bold transition cursor-pointer flex items-center gap-0.5"
                          title="Programar publicación para este día"
                        >
                          + Post
                        </button>
                      )}
                    </div>

                    {/* Contenido / Tarjetas de Publicaciones en Grande */}
                    <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[680px] pr-1">
                      {tienePubs ? (
                        celda.publicaciones.map((pub) => {
                          const canalBadge = getBadgeCanal(pub.plataforma);
                          const esPublicado = pub.estado === "publicado";
                          const esAprobado = pub.estado === "aprobado";

                          return (
                            <div
                              key={pub.id}
                              className={`p-3 rounded-2xl border transition-all hover:shadow-md text-xs relative group ${
                                esPublicado
                                  ? "bg-blue-50/90 border-blue-300 text-blue-950"
                                  : esAprobado
                                  ? "bg-emerald-50/80 border-emerald-300 text-emerald-950"
                                  : canalBadge.bg
                              }`}
                            >
                              {/* Imagen del Arte si existe */}
                              {pub.url_imagen && (
                                <div className="relative mb-2 rounded-xl overflow-hidden border border-black/10 bg-black aspect-video">
                                  <img
                                    src={pub.url_imagen}
                                    alt={pub.titulo}
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      if (pub.id) {
                                        (e.target as HTMLImageElement).src = `/api/marketing/imagen/${pub.id}`;
                                      }
                                    }}
                                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                  />
                                  <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/70 backdrop-blur-xs text-white px-2 py-0.5 rounded-md text-[10px] font-bold">
                                    <span>{canalBadge.icon}</span>
                                    <span>{canalBadge.label}</span>
                                  </div>
                                  <div className="absolute top-1.5 right-1.5">
                                    <span
                                      className={`text-[9px] font-bold px-2 py-0.5 rounded-md text-white shadow-xs ${
                                        esPublicado ? "bg-blue-600" : esAprobado ? "bg-emerald-600" : "bg-amber-600"
                                      }`}
                                    >
                                      {esPublicado ? "✓ Enviada" : esAprobado ? "⏰ Programada" : "Borrador"}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Cabecera si no hay imagen */}
                              {!pub.url_imagen && (
                                <div className="flex items-center justify-between gap-1 mb-1.5">
                                  <span className="font-bold flex items-center gap-1.5">
                                    <span>{canalBadge.icon}</span>
                                    <span className="text-[11px] uppercase font-bold tracking-tight text-carbon/80">
                                      {canalBadge.label}
                                    </span>
                                  </span>
                                  <span
                                    className={`text-[9px] font-bold px-2 py-0.5 rounded-md text-white ${
                                      esPublicado ? "bg-blue-600" : esAprobado ? "bg-emerald-600" : "bg-amber-600"
                                    }`}
                                  >
                                    {esPublicado ? "✓ Enviada" : esAprobado ? "⏰ Programada" : "Borrador"}
                                  </span>
                                </div>
                              )}

                              {/* Título */}
                              <h4 className="font-bold text-xs sm:text-sm text-carbon line-clamp-2 leading-snug">
                                {pub.titulo}
                              </h4>

                              {/* Contenido / Copy */}
                              {pub.contenido && (
                                <p className="text-[11px] text-carbon/70 line-clamp-2 mt-1 leading-relaxed">
                                  {pub.contenido}
                                </p>
                              )}

                              {/* Hora y Enlace */}
                              <div className="flex items-center justify-between text-[11px] text-carbon/70 mt-2.5 pt-2 border-t border-black/5 font-mono">
                                <span className="flex items-center gap-1 font-semibold">
                                  <span>{esPublicado ? "📲" : "⏰"}</span>
                                  <span>{formatHoraPub(pub)}</span>
                                </span>
                                {esPublicado && pub.url_publicacion && (
                                  <a
                                    href={pub.url_publicacion}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline"
                                  >
                                    Ver post ↗
                                  </a>
                                )}
                              </div>

                              {/* Botones de acción rápida en la tarjeta semanal */}
                              <div className="flex items-center gap-1.5 mt-2.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => onPrevisualizar(pub)}
                                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1.5 rounded-lg transition shadow-2xs flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <span>👁️</span> Previsualizar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAbrirDetalle(pub)}
                                  className="bg-white hover:bg-gray-100 border border-gray-300 text-carbon font-bold text-[10px] px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                                  title="Ver detalles o reagendar"
                                >
                                  <span>⏰</span>
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-4 border border-dashed border-gray-200 rounded-xl text-carbon/40">
                          <span className="text-2xl mb-1 opacity-60">🏖️</span>
                          <span className="text-[11px] font-medium">Sin publicaciones</span>
                          {onNuevaPublicacionParaFecha && (
                            <button
                              type="button"
                              onClick={() => onNuevaPublicacionParaFecha(celda.fechaStr)}
                              className="mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg transition cursor-pointer"
                            >
                              + Programar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. ZOOM 15 DÍAS (2 SEMANAS COMPLETAS = 14 DÍAS)                */}
      {/* ============================================================== */}
      {vista === "quincena" && (
        <div className="p-3 sm:p-5 overflow-x-auto">
          <div className="min-w-[860px]">
            {/* Encabezado Días de la Semana */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2 text-center">
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

            {/* Cuadrícula de 14 Días (2 Filas x 7 Columnas) */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {celdasQuincena.map((celda) => {
                return (
                  <div
                    key={celda.fechaStr}
                    className={`min-h-[250px] sm:min-h-[290px] p-2.5 rounded-2xl border transition-all flex flex-col justify-between ${
                      celda.esHoy
                        ? "border-emerald-500 bg-emerald-50/30 ring-2 ring-emerald-500/20 shadow-xs"
                        : "border-gray-200 bg-white hover:border-dorado/50 hover:shadow-xs"
                    }`}
                  >
                    {/* Número de Día y Nombre de Mes */}
                    <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-gray-100">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                            celda.esHoy
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "bg-gray-100 text-carbon"
                          }`}
                        >
                          {celda.diaNumero}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-carbon/60">
                          {celda.nombreMes}
                        </span>
                      </div>

                      {celda.esHoy && (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                          HOY
                        </span>
                      )}

                      {onNuevaPublicacionParaFecha && (
                        <button
                          type="button"
                          onClick={() => onNuevaPublicacionParaFecha(celda.fechaStr)}
                          className="hover:bg-gray-200 text-carbon/60 rounded p-0.5 text-xs transition cursor-pointer"
                          title="Programar para este día"
                        >
                          +
                        </button>
                      )}
                    </div>

                    {/* Lista de Publicaciones del Día */}
                    <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[220px] pr-0.5">
                      {celda.publicaciones.map((pub) => {
                        const canalBadge = getBadgeCanal(pub.plataforma);
                        const esPublicado = pub.estado === "publicado";
                        const esAprobado = pub.estado === "aprobado";

                        return (
                          <div
                            key={pub.id}
                            onClick={() => handleAbrirDetalle(pub)}
                            className={`p-2 rounded-xl border text-[11px] leading-tight cursor-pointer transition hover:scale-[1.01] hover:shadow-xs group ${
                              esPublicado
                                ? "bg-blue-50/90 border-blue-300 text-blue-950 hover:border-blue-500"
                                : esAprobado
                                ? "bg-emerald-50/80 border-emerald-300 text-emerald-950 hover:border-emerald-500"
                                : canalBadge.bg
                            }`}
                            title={`${pub.titulo} (${pub.plataforma.toUpperCase()})`}
                          >
                            <div className="flex items-start gap-2">
                              {pub.url_imagen && (
                                <img
                                  src={pub.url_imagen}
                                  alt={pub.titulo}
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    if (pub.id) {
                                      (e.target as HTMLImageElement).src = `/api/marketing/imagen/${pub.id}`;
                                    }
                                  }}
                                  className="w-12 h-12 rounded-lg object-cover border border-gray-300 shrink-0 bg-black"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                  <span className="font-bold flex items-center gap-1 text-[10px] uppercase text-carbon/70">
                                    <span>{canalBadge.icon}</span>
                                    <span>{canalBadge.label}</span>
                                  </span>
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full text-white shrink-0 ${
                                      esPublicado
                                        ? "bg-blue-600 shadow-xs"
                                        : esAprobado
                                        ? "bg-emerald-600 shadow-xs"
                                        : "bg-amber-600 shadow-xs"
                                    }`}
                                  >
                                    {esPublicado ? "✓ Enviada" : esAprobado ? "⏰ Prog" : "Borrador"}
                                  </span>
                                </div>
                                <div className="font-bold text-carbon text-xs line-clamp-1">
                                  {pub.titulo}
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-carbon/60 mt-1 font-mono">
                                  <span className="flex items-center gap-1">
                                    <span>{esPublicado ? "📲" : "⏰"}</span>
                                    <span>{formatHoraPub(pub)}</span>
                                  </span>
                                  {esPublicado && pub.url_publicacion && (
                                    <a
                                      href={pub.url_publicacion}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-blue-600 hover:text-blue-800 font-bold underline"
                                    >
                                      Ver ↗
                                    </a>
                                  )}
                                </div>
                              </div>
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
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. CUADRÍCULA MENSUAL COMPLETA (30/31 DÍAS)                     */}
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
                      const esPublicado = pub.estado === "publicado";
                      const esAprobado = pub.estado === "aprobado";

                      return (
                        <div
                          key={pub.id}
                          onClick={() => handleAbrirDetalle(pub)}
                          className={`p-1.5 rounded-xl border text-[11px] leading-tight cursor-pointer transition hover:scale-[1.02] shadow-2xs group relative ${
                            esPublicado
                              ? "bg-blue-50/90 border-blue-300 text-blue-950 hover:border-blue-500 hover:shadow-xs"
                              : esAprobado
                              ? "bg-emerald-50/80 border-emerald-300 text-emerald-950 hover:border-emerald-500 hover:shadow-xs"
                              : canalBadge.bg
                          }`}
                          title={`${pub.titulo} (${pub.plataforma.toUpperCase()} • ${esPublicado ? "Enviada / Publicada" : esAprobado ? "Programada" : "Borrador"})`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold flex items-center gap-1.5 truncate">
                              <span>{canalBadge.icon}</span>
                              <span className="text-[10px] uppercase font-bold tracking-tight text-carbon/70">
                                {canalBadge.label}
                              </span>
                            </span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full text-white shrink-0 ${
                                esPublicado
                                  ? "bg-blue-600 shadow-xs"
                                  : esAprobado
                                  ? "bg-emerald-600 shadow-xs"
                                  : "bg-amber-600 shadow-xs"
                              }`}
                            >
                              {esPublicado ? "✓ Enviada" : esAprobado ? "⏰ Programada" : "Borrador"}
                            </span>
                          </div>

                          <div className="text-[11px] font-medium text-carbon truncate mt-0.5">
                            {pub.titulo}
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-carbon/60 mt-1 font-mono pt-0.5 border-t border-black/5">
                            <span className="flex items-center gap-1">
                              <span>{esPublicado ? "📲" : "⏰"}</span>
                              <span>{formatHoraPub(pub)}</span>
                              {esPublicado && (
                                <span className="text-[9px] text-blue-700 font-bold ml-0.5">Enviada</span>
                              )}
                            </span>
                            {esPublicado && pub.url_publicacion && (
                              <a
                                href={pub.url_publicacion}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[9px] text-blue-600 hover:text-blue-800 font-bold underline"
                              >
                                Ver ↗
                              </a>
                            )}
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
          {diasAgenda.length === 0 ? (
            <div className="text-center py-12 text-carbon/50">
              <span className="text-4xl">📭</span>
              <p className="mt-2 text-sm font-semibold">No hay publicaciones con los filtros seleccionados</p>
            </div>
          ) : (
            diasAgenda.map(([fechaStr, listaPubs]) => {
              const [anioStr, mesStr, diaStr] = fechaStr.split("-");
              const fechaObj = new Date(Number(anioStr), Number(mesStr) - 1, Number(diaStr), 12, 0, 0);
              const hoyStr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
              const esHoy = fechaStr === hoyStr;

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
                    <div className="flex items-center gap-2">
                      {esHoy && <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">HOY</span>}
                      <span className="text-[10px] font-normal opacity-80">
                        {listaPubs.length} {listaPubs.length === 1 ? "publicación" : "publicaciones"}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 divide-y divide-gray-100 bg-white">
                    {listaPubs.map((pub) => {
                      const canalBadge = getBadgeCanal(pub.plataforma);
                      const esPublicado = pub.estado === "publicado";
                      const esAprobado = pub.estado === "aprobado";

                      return (
                        <div
                          key={pub.id}
                          className="py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-gray-50/80 px-2 rounded-xl transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xl">{canalBadge.icon}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-sm text-carbon truncate">
                                  {pub.titulo}
                                </h4>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${canalBadge.bg}`}>
                                  {canalBadge.label}
                                </span>
                              </div>
                              <p className="text-xs text-carbon/60 line-clamp-1 mt-0.5">
                                {pub.contenido}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`font-mono text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
                                esPublicado
                                  ? "bg-blue-50 text-blue-800 border border-blue-200"
                                  : "bg-gray-100 text-carbon/70"
                              }`}
                            >
                              <span>{esPublicado ? "📲 Enviada a las:" : "⏰"}</span>
                              <span>{formatHoraPub(pub)}</span>
                            </span>
                            <span
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg text-white flex items-center gap-1 ${
                                esPublicado
                                  ? "bg-blue-600 shadow-xs"
                                  : esAprobado
                                  ? "bg-emerald-600 shadow-xs"
                                  : "bg-amber-600 shadow-xs"
                              }`}
                            >
                              {esPublicado ? "✓ Enviada" : esAprobado ? "⏰ Programada" : "⏳ Borrador"}
                            </span>
                            {pub.url_publicacion && (
                              <a
                                href={pub.url_publicacion}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1"
                              >
                                <span>🔗</span> Ver en {canalBadge.label} ↗
                              </a>
                            )}
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
                              {esPublicado ? "ℹ️ Detalle" : "⏰ Reagendar"}
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
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      if (pubSeleccionada.id) {
                        (e.target as HTMLImageElement).src = `/api/marketing/imagen/${pubSeleccionada.id}`;
                      }
                    }}
                    className="w-16 h-16 rounded-xl object-cover border border-gray-300 shrink-0 bg-black"
                  />
                )}
                <p className="text-xs text-carbon/80 leading-relaxed line-clamp-3">
                  {pubSeleccionada.contenido}
                </p>
              </div>

              {pubSeleccionada.estado === "publicado" && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 text-blue-950 font-bold text-xs">
                    <span className="text-base">📲</span>
                    <span>Enviada y Publicada en {pubSeleccionada.plataforma.toUpperCase()} • {formatHoraPub(pubSeleccionada)}</span>
                  </div>
                  {pubSeleccionada.url_publicacion && (
                    <a
                      href={pubSeleccionada.url_publicacion}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-white border border-blue-200 px-3 py-1.5 rounded-xl shadow-2xs hover:bg-blue-100 transition shrink-0"
                    >
                      <span>🔗</span> Ver en {pubSeleccionada.plataforma === "instagram" ? "Instagram" : "Facebook"} ↗
                    </a>
                  )}
                </div>
              )}

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
