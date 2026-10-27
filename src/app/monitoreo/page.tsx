"use client";

import React, { useState, useEffect } from "react";

interface AlarmaEvento {
  id: string;
  cuenta: string;
  nombre_titular: string;
  tipo_inmueble: string;
  direccion: string;
  telefono_contacto: string;
  contacto_emergencia: string;
  codigo_sia: string;
  descripcion: string;
  prioridad: "critica" | "alta" | "media" | "baja" | "informativa";
  zona: number;
  nombre_zona: string;
  veredicto_ia: string;
  confianza_ia: number;
  es_falsa_alarma: boolean;
  accion_recomendada: string;
  snapshot_url: string;
  estatus_despacho: "pendiente" | "en_atencion" | "despachado" | "descartado" | "resuelto";
  disuasion_activada: boolean;
  timestamp: string;
  created_at_fmt: string;
  notas_operador?: string;
}

// Datos semilla de demostración inmediata
const EVENTOS_DEFAULT: AlarmaEvento[] = [
  {
    id: "EVT-1001",
    cuenta: "CTA-1001",
    nombre_titular: "Coto Residencial Monte Rosa",
    tipo_inmueble: "fraccionamiento",
    direccion: "Blvd. Monte Rosa #120, León Gto",
    telefono_contacto: "4771234567",
    contacto_emergencia: "Vigilancia Caseta Principal (4779876543)",
    codigo_sia: "IV",
    descripcion: "Intrusión Perimetral Confirmada por Video IA",
    prioridad: "critica",
    zona: 2,
    nombre_zona: "Barda Perimetral Posterior",
    veredicto_ia: "🚨 AMENAZA CONFIRMADA: Sujeto detectado escalando barda perimetral posterior en horario nocturno.",
    confianza_ia: 96.8,
    es_falsa_alarma: false,
    accion_recomendada: "Disparar disuasión activa (altavoz/estrobo) y alertar al guardia en caseta.",
    snapshot_url: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=800&q=80",
    estatus_despacho: "pendiente",
    disuasion_activada: false,
    timestamp: new Date().toISOString(),
    created_at_fmt: "Hoy 16:32:15",
  },
  {
    id: "EVT-1002",
    cuenta: "CTA-1002",
    nombre_titular: "Abarrotes Lía - Bodega Central",
    tipo_inmueble: "bodega",
    direccion: "Av. De las Rosas #340, Col. San Miguel, León Gto",
    telefono_contacto: "4777654321",
    contacto_emergencia: "Óscar Ramírez (4771122334)",
    codigo_sia: "PA",
    descripcion: "Alarma de Pánico / Asalto Silencioso",
    prioridad: "critica",
    zona: 99,
    nombre_zona: "Botón Silencioso Mostrador",
    veredicto_ia: "🚨 EMERGENCIA: Botón de Asalto / Pánico activado manualmente por personal en mostrador.",
    confianza_ia: 100.0,
    es_falsa_alarma: false,
    accion_recomendada: "Despacho inmediato de patrulla municipal y verificación discreta por WhatsApp.",
    snapshot_url: "https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&w=800&q=80",
    estatus_despacho: "pendiente",
    disuasion_activada: false,
    timestamp: new Date(Date.now() - 360000).toISOString(),
    created_at_fmt: "Hoy 16:26:00",
  },
  {
    id: "EVT-1003",
    cuenta: "CTA-1003",
    nombre_titular: "Ing. Roberto Méndez",
    tipo_inmueble: "residencial",
    direccion: "Paseo del Molino #412, León Gto",
    telefono_contacto: "4773344556",
    contacto_emergencia: "Sra. Elena Soto (4775566778)",
    codigo_sia: "BA",
    descripcion: "Alarma de Robo / Sensor Patio Trasero",
    prioridad: "baja",
    zona: 2,
    nombre_zona: "Jardín Trasero",
    veredicto_ia: "✅ FALSA ALARMA DESCARTADA: Mascota (canino bóxer) transitando en patio. Cero presencia humana.",
    confianza_ia: 98.4,
    es_falsa_alarma: true,
    accion_recomendada: "Auto-descartado por IA sin perturbar al residente. Guardado en bitácora.",
    snapshot_url: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=800&q=80",
    estatus_despacho: "descartado",
    disuasion_activada: false,
    timestamp: new Date(Date.now() - 900000).toISOString(),
    created_at_fmt: "Hoy 16:17:00",
  },
];

export default function CentralMonitoreoPage() {
  const [eventos, setEventos] = useState<AlarmaEvento[]>(EVENTOS_DEFAULT);
  const [eventoSeleccionado, setEventoSeleccionado] = useState<AlarmaEvento>(EVENTOS_DEFAULT[0]);
  const [filtro, setFiltro] = useState<"todas" | "criticas" | "ia" | "resueltas">("todas");
  const [coreConectado, setCoreConectado] = useState(false);
  const [cargandoSimulacion, setCargandoSimulacion] = useState(false);
  const [mensajeDisuasion, setMensajeDisuasion] = useState<string | null>(null);

  // Consultar estado del microservicio core en localhost:8089
  const consultarCore = async () => {
    try {
      const res = await fetch("http://localhost:8089/api/events");
      if (res.ok) {
        const data = await res.json();
        if (data.eventos && data.eventos.length > 0) {
          setEventos(data.eventos);
          setEventoSeleccionado((prev) => {
            const existe = data.eventos.find((e: AlarmaEvento) => e.id === prev?.id);
            return existe || data.eventos[0];
          });
        }
        setCoreConectado(true);
      } else {
        setCoreConectado(false);
      }
    } catch {
      setCoreConectado(false);
    }
  };

  useEffect(() => {
    consultarCore();
    const interval = setInterval(consultarCore, 3500);
    return () => clearInterval(interval);
  }, []);

  // Simular evento
  const dispararSimulacion = async (tipo: "perimetral_ia" | "panico" | "falsa_alarma") => {
    setCargandoSimulacion(true);
    try {
      const res = await fetch("http://localhost:8089/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo }),
      });
      if (res.ok) {
        await consultarCore();
      } else {
        generarSimulacionLocal(tipo);
      }
    } catch {
      generarSimulacionLocal(tipo);
    } finally {
      setCargandoSimulacion(false);
    }
  };

  const generarSimulacionLocal = (tipo: "perimetral_ia" | "panico" | "falsa_alarma") => {
    const id = `SIM-${Date.now()}`;
    let nuevo: AlarmaEvento;

    if (tipo === "perimetral_ia") {
      nuevo = {
        id,
        cuenta: "CTA-1001",
        nombre_titular: "Coto Residencial Monte Rosa",
        tipo_inmueble: "fraccionamiento",
        direccion: "Blvd. Monte Rosa #120, León Gto",
        telefono_contacto: "4771234567",
        contacto_emergencia: "Vigilancia Caseta (4779876543)",
        codigo_sia: "IV",
        descripcion: "Intrusión Perimetral Confirmada por Video IA",
        prioridad: "critica",
        zona: 2,
        nombre_zona: "Barda Perimetral Posterior",
        veredicto_ia: "🚨 AMENAZA CONFIRMADA: Sujeto sospechoso detectado sobre muro perimetral.",
        confianza_ia: 97.4,
        es_falsa_alarma: false,
        accion_recomendada: "Activar sirena exterior y notificar al guardia en caseta.",
        snapshot_url: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=800&q=80",
        estatus_despacho: "pendiente",
        disuasion_activada: false,
        timestamp: new Date().toISOString(),
        created_at_fmt: "Hace unos segundos",
      };
    } else if (tipo === "panico") {
      nuevo = {
        id,
        cuenta: "CTA-1002",
        nombre_titular: "Abarrotes Lía - Bodega Central",
        tipo_inmueble: "bodega",
        direccion: "Av. De las Rosas #340, Col. San Miguel",
        telefono_contacto: "4777654321",
        contacto_emergencia: "Óscar Ramírez (4771122334)",
        codigo_sia: "PA",
        descripcion: "Alarma de Pánico / Asalto en Vivo",
        prioridad: "critica",
        zona: 99,
        nombre_zona: "Botón Silencioso Mostrador",
        veredicto_ia: "🚨 EMERGENCIA: Botón de asalto activado en caja registradora.",
        confianza_ia: 100.0,
        es_falsa_alarma: false,
        accion_recomendada: "Despacho inmediato de unidad de seguridad y llamada a titular.",
        snapshot_url: "https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&w=800&q=80",
        estatus_despacho: "pendiente",
        disuasion_activada: false,
        timestamp: new Date().toISOString(),
        created_at_fmt: "Hace unos segundos",
      };
    } else {
      nuevo = {
        id,
        cuenta: "CTA-1003",
        nombre_titular: "Ing. Roberto Méndez",
        tipo_inmueble: "residencial",
        direccion: "Paseo del Molino #412",
        telefono_contacto: "4773344556",
        contacto_emergencia: "Sra. Elena Soto (4775566778)",
        codigo_sia: "BA",
        descripcion: "Detección de Movimiento Patio",
        prioridad: "baja",
        zona: 2,
        nombre_zona: "Patio Trasero",
        veredicto_ia: "✅ FALSA ALARMA: Movimiento originado por ramas y viento fuerte. Cero personas.",
        confianza_ia: 95.8,
        es_falsa_alarma: true,
        accion_recomendada: "Auto-descarte silencioso.",
        snapshot_url: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=800&q=80",
        estatus_despacho: "descartado",
        disuasion_activada: false,
        timestamp: new Date().toISOString(),
        created_at_fmt: "Hace unos segundos",
      };
    }

    setEventos((prev) => [nuevo, ...prev]);
    setEventoSeleccionado(nuevo);
  };

  // Acciones operativas
  const activarDisuasion = async () => {
    if (!eventoSeleccionado) return;
    try {
      await fetch("http://localhost:8089/api/events/disuasion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evento_id: eventoSeleccionado.id }),
      });
    } catch {}

    setEventos((prev) =>
      prev.map((e) => (e.id === eventoSeleccionado.id ? { ...e, disuasion_activada: true } : e))
    );
    setEventoSeleccionado((prev) => ({ ...prev, disuasion_activada: true }));
    setMensajeDisuasion("🚨 COMANDO ENVIADO: Estrobo y sirena de 110 dB activados en el sitio.");
    setTimeout(() => setMensajeDisuasion(null), 5000);
  };

  const resolverIncidente = async (nuevoEstatus: "resuelto" | "descartado") => {
    if (!eventoSeleccionado) return;
    try {
      await fetch("http://localhost:8089/api/events/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento_id: eventoSeleccionado.id,
          estatus: nuevoEstatus,
          notas: "Atendido desde consola PWA Sauceda.",
        }),
      });
    } catch {}

    setEventos((prev) =>
      prev.map((e) =>
        e.id === eventoSeleccionado.id ? { ...e, estatus_despacho: nuevoEstatus } : e
      )
    );
    setEventoSeleccionado((prev) => ({ ...prev, estatus_despacho: nuevoEstatus }));
  };

  const generarEnlaceWhatsApp = () => {
    if (!eventoSeleccionado) return "#";
    const texto = encodeURIComponent(
      `*SAUCEDA SEGURIDAD ELECTRÓNICA - REPORTE DE INCIDENCIA*\n` +
      `Estimado/a ${eventoSeleccionado.nombre_titular},\n` +
      `Le informamos que se ha registrado una alerta en su cuenta *${eventoSeleccionado.cuenta}*:\n\n` +
      `📍 *Ubicación:* ${eventoSeleccionado.direccion}\n` +
      `🛡️ *Zona:* ${eventoSeleccionado.nombre_zona} (Zona ${eventoSeleccionado.zona})\n` +
      `⚡ *Tipo de Evento:* ${eventoSeleccionado.descripcion}\n` +
      `🤖 *Diagnóstico de IA:* ${eventoSeleccionado.veredicto_ia}\n\n` +
      `Nuestra central ha tomado el control. Si usted se encuentra bien o reconoce la actividad, favor de confirmar por este medio.`
    );
    return `https://wa.me/52${eventoSeleccionado.telefono_contacto.replace(/\D/g, "")}?text=${texto}`;
  };

  // Filtrado de eventos
  const eventosFiltrados = eventos.filter((e) => {
    if (filtro === "criticas") return e.prioridad === "critica" && e.estatus_despacho !== "resuelto" && e.estatus_despacho !== "descartado";
    if (filtro === "ia") return !e.es_falsa_alarma;
    if (filtro === "resueltas") return e.estatus_despacho === "resuelto" || e.estatus_despacho === "descartado";
    return true;
  });

  const alarmasActivas = eventos.filter(
    (e) => e.prioridad === "critica" && e.estatus_despacho === "pendiente"
  ).length;

  return (
    <div className="flex flex-col min-h-screen bg-[#0B0F17] text-slate-100 p-4 md:p-6 font-cuerpo">
      {/* 1. Header Táctico */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${coreConectado ? "bg-emerald-400" : "bg-amber-400"} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${coreConectado ? "bg-emerald-500" : "bg-amber-500"}`}></span>
            </span>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white font-display">
              CENTRAL DE MONITOREO INTELIGENTE 2.0
            </h1>
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-dorado/15 text-dorado border border-dorado/30">
              Sauceda SOC
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Recepción SIA DC-09 &bull; Descarte de Falsas Alarmas con Visión IA &bull; Despacho Autónomo
          </p>
        </div>

        {/* Barra de simulación y controles en vivo */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
            <span className="font-mono text-[11px] text-slate-400">Core Daemon:</span>
            {coreConectado ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                ● En Línea (10001/8089)
              </span>
            ) : (
              <span className="text-amber-400 font-medium">● Local Fallback</span>
            )}
          </div>

          <button
            onClick={() => dispararSimulacion("perimetral_ia")}
            disabled={cargandoSimulacion}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-700/60 rounded-lg transition-all shadow-sm cursor-pointer"
            title="Simula un salto de barda perimetral con persona identificada"
          >
            <span>⚡ Simular Intrusión (IA)</span>
          </button>

          <button
            onClick={() => dispararSimulacion("panico")}
            disabled={cargandoSimulacion}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-700/60 rounded-lg transition-all shadow-sm cursor-pointer"
            title="Simula la pulsación del botón de pánico en mostrador"
          >
            <span>🚨 Simular Pánico</span>
          </button>

          <button
            onClick={() => dispararSimulacion("falsa_alarma")}
            disabled={cargandoSimulacion}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-all shadow-sm cursor-pointer"
            title="Simula sensor activado por perro o viento (IA lo descarta)"
          >
            <span>🍃 Simular Falsa Alarma</span>
          </button>
        </div>
      </header>

      {/* 2. Barra de Métricas y KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 my-5">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Alarmas Activas</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className={`text-2xl font-bold font-mono ${alarmasActivas > 0 ? "text-red-400 animate-pulse" : "text-emerald-400"}`}>
              {alarmasActivas}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Prioridad Roja</span>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Filtro Anti-Falsas Alarmas</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-emerald-400 font-mono">95.4%</span>
            <span className="text-[10px] text-emerald-500/80 font-mono">IA Pericial</span>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Cuentas Monitoreadas</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-dorado font-mono">4</span>
            <span className="text-[10px] text-slate-500 font-mono">Suscripciones MRR</span>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Tiempo de Verificación</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-bold text-sky-400 font-mono">1.4 s</span>
            <span className="text-[10px] text-slate-500 font-mono">Vs 5 min tradicional</span>
          </div>
        </div>
      </section>

      {/* 3. Notificación de Disuasión en Vivo */}
      {mensajeDisuasion && (
        <div className="mb-4 p-3 bg-red-950 border border-red-500 text-red-200 rounded-xl text-xs font-bold animate-bounce flex items-center justify-between">
          <span>{mensajeDisuasion}</span>
          <span className="text-[10px] font-mono text-red-400">STATUS: RELE_ACTIVO_24V</span>
        </div>
      )}

      {/* 4. Cabina Operativa: 2 Columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
        {/* COLUMNA IZQUIERDA: Bandeja de Eventos (5 columnas) */}
        <div className="lg:col-span-5 flex flex-col bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          {/* Selector de Filtros */}
          <div className="flex items-center gap-1 p-2.5 bg-slate-900 border-b border-slate-800 text-xs">
            <button
              onClick={() => setFiltro("todas")}
              className={`px-3 py-1 rounded-lg font-medium transition ${filtro === "todas" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
            >
              Todas ({eventos.length})
            </button>
            <button
              onClick={() => setFiltro("criticas")}
              className={`px-3 py-1 rounded-lg font-medium transition ${filtro === "criticas" ? "bg-red-900/60 text-red-200 border border-red-700/50" : "text-slate-400 hover:text-white"}`}
            >
              🚨 Críticas
            </button>
            <button
              onClick={() => setFiltro("ia")}
              className={`px-3 py-1 rounded-lg font-medium transition ${filtro === "ia" ? "bg-emerald-900/60 text-emerald-200 border border-emerald-700/50" : "text-slate-400 hover:text-white"}`}
            >
              🤖 Amenazas IA
            </button>
            <button
              onClick={() => setFiltro("resueltas")}
              className={`px-3 py-1 rounded-lg font-medium transition ${filtro === "resueltas" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
            >
              Historial
            </button>
          </div>

          {/* Lista de Tarjetas de Eventos */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 max-h-[700px] scrollbar-thin">
            {eventosFiltrados.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No hay eventos que coincidan con este filtro.
              </div>
            ) : (
              eventosFiltrados.map((evt) => {
                const esActivo = eventoSeleccionado?.id === evt.id;
                const esCritico = evt.prioridad === "critica";

                return (
                  <div
                    key={evt.id}
                    onClick={() => setEventoSeleccionado(evt)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                      esActivo
                        ? "bg-slate-800/90 border-dorado/60 shadow-lg ring-1 ring-dorado/40"
                        : "bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700"
                    }`}
                  >
                    {/* Indicador de pulso si es alerta activa */}
                    {esCritico && evt.estatus_despacho === "pendiente" && (
                      <span className="absolute top-3 right-3 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                      </span>
                    )}

                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/50 border border-slate-700 text-slate-300">
                        {evt.codigo_sia} &bull; Zona {evt.zona}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {evt.cuenta}
                      </span>
                      <span className="text-[10px] text-slate-500 ml-auto mr-3">
                        {evt.created_at_fmt}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-white leading-snug">
                      {evt.nombre_titular}
                    </h4>
                    <p className="text-[11px] text-slate-300 mt-0.5 font-medium">
                      {evt.descripcion} &bull; <span className="text-slate-400">{evt.nombre_zona}</span>
                    </p>

                    {/* Badge de IA */}
                    <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                      <span
                        className={`font-semibold flex items-center gap-1 ${
                          evt.es_falsa_alarma ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {evt.es_falsa_alarma ? "🟢 Descartado IA" : "🔴 Amenaza Confirmada"}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        Certeza: {evt.confianza_ia}%
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: Cabina de Despacho Táctico y Video Pericial (7 columnas) */}
        <div className="lg:col-span-7 flex flex-col bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden p-5">
          {eventoSeleccionado ? (
            <div className="flex flex-col h-full space-y-4">
              {/* Encabezado del Incidente Activo */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-700/60 uppercase">
                      Incidente {eventoSeleccionado.id}
                    </span>
                    <span className="text-xs font-mono text-slate-400 uppercase">
                      {eventoSeleccionado.tipo_inmueble}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        eventoSeleccionado.estatus_despacho === "pendiente"
                          ? "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse"
                          : eventoSeleccionado.estatus_despacho === "descartado"
                          ? "bg-slate-800 text-slate-400"
                          : "bg-emerald-500/20 text-emerald-400"
                      }`}
                    >
                      {eventoSeleccionado.estatus_despacho}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-white mt-1">
                    {eventoSeleccionado.nombre_titular}
                  </h2>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <span>📍 {eventoSeleccionado.direccion}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(eventoSeleccionado.direccion)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 flex items-center gap-1"
                  >
                    <span>🗺️ Ver Mapa</span>
                  </a>
                </div>
              </div>

              {/* Visor de Snapshot / Video Pericial de la Cámara */}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-h-72 border border-slate-800 flex items-center justify-center group shadow-inner">
                {eventoSeleccionado.snapshot_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={eventoSeleccionado.snapshot_url}
                    alt="Evidencia Pericial"
                    className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition duration-300"
                  />
                ) : (
                  <div className="text-center text-slate-500 text-xs">
                    Sin stream de video configurado para esta zona.
                  </div>
                )}

                {/* Overlay Pericial Estilizado */}
                <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-mono text-emerald-400 border border-emerald-500/30 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-ping"></span>
                  <span>CAM-0{eventoSeleccionado.zona} &bull; {eventoSeleccionado.nombre_zona.toUpperCase()}</span>
                </div>

                {/* Bounding box simulado sobre el objetivo si no es falsa alarma */}
                {!eventoSeleccionado.es_falsa_alarma && (
                  <div className="absolute inset-x-1/4 top-12 bottom-12 border-2 border-dashed border-red-500 rounded bg-red-500/10 flex flex-col justify-between p-2 pointer-events-none">
                    <span className="self-start text-[10px] font-mono bg-red-600 text-white px-1.5 py-0.5 rounded font-bold">
                      INTRUSO CONFIRMADO: {eventoSeleccionado.confianza_ia}%
                    </span>
                    <span className="self-end text-[9px] font-mono bg-black/80 text-white px-1 rounded">
                      ROI: [320, 180, 580, 420]
                    </span>
                  </div>
                )}
              </div>

              {/* Diagnóstico Pericial de Inteligencia Artificial */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-dorado uppercase tracking-wider flex items-center gap-1.5">
                    <span>🧠 Diagnóstico Pericial IA</span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    Nivel de Confianza: <strong className="text-white">{eventoSeleccionado.confianza_ia}%</strong>
                  </span>
                </div>
                <p className="text-xs text-slate-200 font-medium leading-relaxed">
                  {eventoSeleccionado.veredicto_ia}
                </p>
                <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                  <span className="font-semibold text-slate-300">Acción Táctica Sugerida:</span>
                  <span>{eventoSeleccionado.accion_recomendada}</span>
                </div>
              </div>

              {/* Ficha de Contactos de Emergencia */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Titular Principal</span>
                  <p className="font-semibold text-white mt-0.5">{eventoSeleccionado.nombre_titular}</p>
                  <a
                    href={`tel:${eventoSeleccionado.telefono_contacto}`}
                    className="inline-flex items-center gap-1 text-dorado hover:underline mt-1 font-mono text-[11px]"
                  >
                    📞 {eventoSeleccionado.telefono_contacto}
                  </a>
                </div>

                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Enlace de Emergencia</span>
                  <p className="font-semibold text-white mt-0.5">{eventoSeleccionado.contacto_emergencia}</p>
                  <span className="text-[10px] text-slate-500 font-mono">Prioridad 1 en Protocolo</span>
                </div>
              </div>

              {/* Barra de Acciones Tácticas del Operador */}
              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-2">
                {/* 1. WhatsApp al Cliente */}
                <a
                  href={generarEnlaceWhatsApp()}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 min-w-[160px] py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition shadow-md text-center"
                >
                  <span>📲 WhatsApp al Cliente</span>
                </a>

                {/* 2. Disuasión Activa (Sirena/Estrobo) */}
                <button
                  onClick={activarDisuasion}
                  disabled={eventoSeleccionado.disuasion_activada}
                  className={`py-2.5 px-4 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition shadow-md cursor-pointer ${
                    eventoSeleccionado.disuasion_activada
                      ? "bg-slate-800 text-slate-500 border border-slate-700"
                      : "bg-red-600 hover:bg-red-500 text-white"
                  }`}
                  title="Envía comando al relevador IP para activar sirena y luz estroboscópica"
                >
                  <span>{eventoSeleccionado.disuasion_activada ? "🚨 Disuasión Activa" : "⚡ Activar Sirena 110dB"}</span>
                </button>

                {/* 3. Descartar como Falsa Alarma */}
                <button
                  onClick={() => resolverIncidente("descartado")}
                  className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl border border-slate-700 transition cursor-pointer"
                  title="Descarta la alarma y guarda el evento para re-entrenar el filtro de IA"
                >
                  <span>Falsa Alarma</span>
                </button>

                {/* 4. Cerrar Incidente / Resuelto */}
                <button
                  onClick={() => resolverIncidente("resuelto")}
                  className="py-2.5 px-4 bg-sauce hover:bg-verde-profundo text-white font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  <span>✅ Concluir Caso</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm">
              Selecciona una alarma de la bandeja izquierda para ver los detalles.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
