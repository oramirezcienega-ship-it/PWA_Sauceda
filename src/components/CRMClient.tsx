"use client";

import { useEffect, useState, useMemo } from "react";
import { obtenerDatosCRM, type CRMData, type CRMMessage } from "@/app/actions/crm";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from "recharts";

// Paleta de colores SAUCEDA
const COLORES = {
  verdeProfundo: "#2D4A2B",
  verdeSauce: "#5C7A52",
  dorado: "#C9A961",
  crema: "#F5F1E8",
  carbon: "#0F172A",
  rojo: "#C44A4A",
  rojoLuz: "#FEE2E2",
  verdeLuz: "#DCFCE7",
  cielo: "#5C8DAA",
  gris: "#64748B",
  grisLuz: "#F1F5F9"
};

// Componente principal del cliente
export function CRMClient() {
  const [data, setData] = useState<CRMData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<string>("");
  const [refrescar, setRefrescar] = useState(0);

  // Navegación entre las 5 vistas
  const [vistaActiva, setVistaActiva] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Filtros globales (para la Vista 3: Tabla de leads, y aplicable a métricas si se desea)
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroChannel, setFiltroChannel] = useState<string>("todos");
  const [filtroCalificacion, setFiltroCalificacion] = useState<string>("todos");
  const [filtroFecha, setFiltroFecha] = useState<string>("todos"); // todos, hoy, semana, mes
  const [filtroSearch, setFiltroSearch] = useState<string>("");

  // Lead seleccionado para el Drawer de conversación
  const [leadChatSeleccionado, setLeadChatSeleccionado] = useState<string | null>(null);

  // Carga de datos inicial y polling (5 minutos)
  useEffect(() => {
    let activo = true;

    async function cargar() {
      if (activo) setLoading(true);
      try {
        const result = await obtenerDatosCRM();
        if (activo) {
          setData(result);
          setError(null);
          setLastFetchTime(result.timestamp);
        }
      } catch (err) {
        if (activo) {
          console.error("Error al cargar datos CRM:", err);
          setError(err instanceof Error ? err.message : "Error de comunicación con Supabase.");
        }
      } finally {
        if (activo) setLoading(false);
      }
    }

    cargar();

    // Intervalo de actualización automática cada 5 minutos (300,000 ms)
    const intervalId = setInterval(() => {
      cargar();
    }, 5 * 60 * 1000);

    return () => {
      activo = false;
      clearInterval(intervalId);
    };
  }, [refrescar]);

  // Handler para recargar manualmente
  const handleRecargar = () => {
    setRefrescar((prev) => prev + 1);
  };

  // Filtrado de leads para la tabla
  const leadsFiltrados = useMemo(() => {
    if (!data) return [];
    return data.leads.filter((l) => {
      // Búsqueda por nombre o teléfono
      if (
        filtroSearch &&
        !l.name.toLowerCase().includes(filtroSearch.toLowerCase()) &&
        !l.phone.includes(filtroSearch)
      ) {
        return false;
      }

      // Filtro por estatus de conversación
      if (filtroStatus !== "todos" && l.status !== filtroStatus) {
        return false;
      }

      // Filtro por canal de origen
      if (filtroChannel !== "todos" && l.source !== filtroChannel) {
        return false;
      }

      // Filtro por semáforo de calificación
      if (filtroCalificacion !== "todos" && l.qualified !== filtroCalificacion) {
        return false;
      }

      // Filtro por fecha de entrada
      if (filtroFecha !== "todos") {
        const entrada = new Date(l.created_at).getTime();
        const ahora = Date.now();
        const diffMs = ahora - entrada;

        if (filtroFecha === "hoy") {
          // Últimas 24 horas
          if (diffMs > 24 * 60 * 60 * 1000) return false;
        } else if (filtroFecha === "semana") {
          // Últimos 7 días
          if (diffMs > 7 * 24 * 60 * 60 * 1000) return false;
        } else if (filtroFecha === "mes") {
          // Últimos 30 días
          if (diffMs > 30 * 24 * 60 * 60 * 1000) return false;
        }
      }

      return true;
    });
  }, [data, filtroSearch, filtroStatus, filtroChannel, filtroCalificacion, filtroFecha]);

  // Lead seleccionado para el chat
  const leadSeleccionadoInfo = useMemo(() => {
    if (!data || !leadChatSeleccionado) return null;
    return data.leads.find((l) => l.id === leadChatSeleccionado) || null;
  }, [data, leadChatSeleccionado]);

  // SVG de Estrella Dorada
  const IconoEstrella = () => (
    <svg
      className="h-4 w-4 text-[#C9A961] fill-[#C9A961] inline-block"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );

  // SVG de Alerta Roja
  const IconoAlerta = () => (
    <svg
      className="h-4 w-4 text-[#C44A4A] inline-block animate-pulse mr-1"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );

  if (loading && !data) {
    return <CRMClientSkeleton />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-10">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
          <h2 className="font-fraunces text-2xl font-bold text-[#C44A4A]">Error de Conexión</h2>
          <p className="mt-2 text-sm text-carbon/80">{error}</p>
          <div className="mt-5 flex justify-center gap-4">
            <button
              onClick={handleRecargar}
              className="rounded-lg bg-[#2D4A2B] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5C7A52] shadow-sm"
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex min-h-screen bg-slate-50 text-[#0F172A] font-cuerpo">
      {/* SIDEBAR INTERNO DE NAVEGACIÓN */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden lg:flex lg:flex-col shrink-0 sticky top-0 h-[calc(100vh-60px)] z-20">
        <div className="p-4 border-b border-slate-100 bg-[#F5F1E8]/20">
          <span className="font-fraunces text-lg font-bold text-[#2D4A2B] block">CRM Analítico</span>
          <span className="text-xs text-slate-500 block mt-0.5">SAUCEDA Bienes Raíces</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <TabButton
            active={vistaActiva === 1}
            onClick={() => setVistaActiva(1)}
            icon="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 7h4v4H7V7zm6 0h4v2h-4V7zm0 4h4v2h-4v-2zm-6 4h10v2H7v-2z"
            label="1. Resumen del Embudo"
          />
          <TabButton
            active={vistaActiva === 2}
            onClick={() => setVistaActiva(2)}
            icon="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"
            label="2. Tiempo de Respuesta"
          />
          <TabButton
            active={vistaActiva === 3}
            onClick={() => setVistaActiva(3)}
            icon="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"
            label="3. Tabla de Leads"
            badge={leadsFiltrados.length}
          />
          <TabButton
            active={vistaActiva === 4}
            onClick={() => setVistaActiva(4)}
            icon="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"
            label="4. Análisis Chats"
          />
          <TabButton
            active={vistaActiva === 5}
            onClick={() => setVistaActiva(5)}
            icon="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V7h14v12zm-2-7h-4v4h4v-4z"
            label="5. Evolución Semanal"
          />
        </nav>
        <div className="p-4 border-t border-slate-100 text-[10px] text-slate-400 bg-slate-50">
          <div>Refresco: Auto (5 min)</div>
          <div className="mt-0.5">Último: {lastFetchTime}</div>
          <div className="mt-0.5">Schema: <span className="font-mono">{data.schemaUsado === "fallback" ? "fallback (prospectos)" : "estándar (leads)"}</span></div>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* BARRA SUPERIOR DE ACCIONES */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            {/* Menú de pestañas visible solo en móvil */}
            <div className="lg:hidden">
              <select
                value={vistaActiva}
                onChange={(e) => setVistaActiva(Number(e.target.value) as any)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#2D4A2B] focus:border-[#5C7A52] focus:ring-1 focus:ring-[#5C7A52]"
              >
                <option value={1}>1. Resumen del Embudo</option>
                <option value={2}>2. Tiempo de Respuesta</option>
                <option value={3}>3. Tabla de Leads</option>
                <option value={4}>4. Análisis Chats</option>
                <option value={5}>5. Evolución Semanal</option>
              </select>
            </div>
            <h1 className="font-fraunces text-2xl font-extrabold text-[#2D4A2B] hidden lg:block">
              {vistaActiva === 1 && "Resumen del Embudo"}
              {vistaActiva === 2 && "Tiempo de Respuesta"}
              {vistaActiva === 3 && "Tabla de Leads"}
              {vistaActiva === 4 && "Análisis de Conversaciones"}
              {vistaActiva === 5 && "Evolución Semanal"}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:inline-block">
              Actualizado: <span className="font-mono font-medium">{lastFetchTime}</span>
            </span>
            <button
              onClick={handleRecargar}
              className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 transition text-slate-600 hover:text-slate-900"
              title="Actualizar datos"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.27 15H18"
                />
              </svg>
            </button>
          </div>
        </header>

        {/* CONTENEDOR DE LA VISTA ACTIVA */}
        <div className="p-6 max-w-[1600px] w-full mx-auto space-y-6 flex-1">
          
          {/* ==============================================
              VISTA 1: RESUMEN DEL EMBUDO
             ============================================== */}
          {vistaActiva === 1 && (
            <div className="space-y-6">
              {/* Tarjetas superiores de métricas */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <CardMetrica
                  titulo="Leads Recibidos"
                  valor={data.resumenEmbudo.totalLeads}
                  desc="Total captados"
                  color="border-l-4 border-slate-400"
                />
                <CardMetrica
                  titulo="Contactados por Sofía"
                  valor={data.resumenEmbudo.contactados}
                  desc="Con al menos 1 msg out"
                  color="border-l-4 border-[#5C8DAA]"
                />
                <CardMetrica
                  titulo="Respondieron"
                  valor={data.resumenEmbudo.respondieron}
                  desc="Respondieron a Sofía"
                  color="border-l-4 border-[#C9A961]"
                />
                <CardMetrica
                  titulo="Calificados"
                  valor={data.resumenEmbudo.calificadosVerde + data.resumenEmbudo.calificadosAmarillo}
                  desc="Calificación Verde + Amarillo"
                  color="border-l-4 border-[#5C7A52]"
                  extra={
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 font-mono">
                      <span className="text-[#2D4A2B] font-bold">V: {data.resumenEmbudo.calificadosVerde}</span>
                      <span>A: {data.resumenEmbudo.calificadosAmarillo}</span>
                    </div>
                  }
                />
                <CardMetrica
                  titulo="Perdidos / Sin respuesta"
                  valor={data.resumenEmbudo.perdidos}
                  desc="Fallo de contacto o Rojo"
                  color="border-l-4 border-[#C44A4A]"
                  extra={
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 font-mono">
                      <span className="text-[#C44A4A] font-bold">Rojo: {data.resumenEmbudo.calificadosRojo}</span>
                    </div>
                  }
                />
              </div>

              {/* Embudo y Tasas */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Visualización del Embudo */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm lg:col-span-7 flex flex-col justify-between">
                  <div>
                    <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] mb-2">Embudo de Conversión</h3>
                    <p className="text-xs text-slate-500 mb-6">Eficiencia de los pasos del proceso de ventas de Sofía</p>
                  </div>
                  <div className="space-y-5 flex-1 flex flex-col justify-center max-w-xl mx-auto w-full">
                    {/* Barra 1: Recibidos */}
                    <FunnelBar
                      etiqueta="Leads Recibidos"
                      valor={data.resumenEmbudo.totalLeads}
                      porcentaje={100}
                      color="bg-slate-400"
                    />
                    {/* Barra 2: Contactados */}
                    <FunnelBar
                      etiqueta="Contactados"
                      valor={data.resumenEmbudo.contactados}
                      porcentaje={data.resumenEmbudo.tasaLeadAContactado}
                      color="bg-[#5C8DAA]"
                    />
                    {/* Barra 3: Respondieron */}
                    <FunnelBar
                      etiqueta="Respondieron"
                      valor={data.resumenEmbudo.respondieron}
                      porcentaje={Math.round((data.resumenEmbudo.respondieron / data.resumenEmbudo.totalLeads) * 100) || 0}
                      color="bg-[#C9A961]"
                    />
                    {/* Barra 4: Calificados */}
                    <FunnelBar
                      etiqueta="Calificados (Verde/Amarillo)"
                      valor={data.resumenEmbudo.calificadosVerde + data.resumenEmbudo.calificadosAmarillo}
                      porcentaje={Math.round(((data.resumenEmbudo.calificadosVerde + data.resumenEmbudo.calificadosAmarillo) / data.resumenEmbudo.totalLeads) * 100) || 0}
                      color="bg-[#5C7A52]"
                    />
                  </div>
                </div>

                {/* Tasas de conversión individuales */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm lg:col-span-5 flex flex-col justify-between">
                  <div>
                    <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] mb-1">Tasas de Conversión por Etapa</h3>
                    <p className="text-xs text-slate-500 mb-6">Porcentaje de leads que avanzan al siguiente paso</p>
                  </div>
                  <div className="space-y-6">
                    <ConversionStep
                      titulo="Contacto Inicial"
                      desc="Leads que Sofía contactó exitosamente"
                      porcentaje={data.resumenEmbudo.tasaLeadAContactado}
                      origenLabel="Leads recibidos"
                      destinoLabel="Leads contactados"
                    />
                    <ConversionStep
                      titulo="Tasa de Respuesta"
                      desc="Leads contactados que respondieron al chat"
                      porcentaje={data.resumenEmbudo.tasaContactadoARespondio}
                      origenLabel="Leads contactados"
                      destinoLabel="Leads respondieron"
                    />
                    <ConversionStep
                      titulo="Tasa de Calificación"
                      desc="Leads con conversación calificada (Verde/Amarillo)"
                      porcentaje={data.resumenEmbudo.tasaRespondioACalificado}
                      origenLabel="Leads respondieron"
                      destinoLabel="Leads calificados"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================
              VISTA 2: TIEMPO DE RESPUESTA
             ============================================== */}
          {vistaActiva === 2 && (
            <div className="space-y-6">
              {/* Alerta y Métrica Promedio */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm md:col-span-5 flex flex-col justify-between">
                  <div>
                    <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] mb-1">Tiempo de Respuesta de Sofía</h3>
                    <p className="text-xs text-slate-500 mb-6">Lapso transcurrido desde la creación del lead al primer mensaje saliente</p>
                  </div>
                  <div className="py-6 text-center">
                    <span className="text-slate-400 text-xs font-mono uppercase tracking-wider block">Tiempo Promedio</span>
                    <span className="text-6xl font-fraunces font-extrabold text-[#2D4A2B] mt-2 block">
                      {data.tiempoRespuesta.promedioMinutos} <span className="text-3xl font-sans font-normal">min</span>
                    </span>
                  </div>

                  {data.tiempoRespuesta.alerta ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3 mt-4 border-l-4 border-l-[#C44A4A]">
                      <svg className="h-5 w-5 text-[#C44A4A] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <h4 className="text-sm font-semibold text-[#C44A4A]">Alerta: Tiempo de respuesta elevado</h4>
                        <p className="text-xs text-red-700 mt-1">El tiempo de respuesta promedio supera el límite establecido de 5 minutos.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-start gap-3 mt-4 border-l-4 border-l-[#5C7A52]">
                      <svg className="h-5 w-5 text-[#5C7A52] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <h4 className="text-sm font-semibold text-[#5C7A52]">Tiempo de respuesta óptimo</h4>
                        <p className="text-xs text-green-700 mt-1">El tiempo promedio está dentro del estándar aceptable de la marca (menos de 5 minutos).</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Gráfico de distribución de respuesta */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm md:col-span-7 flex flex-col justify-between">
                  <div>
                    <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] mb-1">Distribución del Tiempo de Respuesta</h3>
                    <p className="text-xs text-slate-500 mb-6">Distribución porcentual del tiempo de primer contacto</p>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: "< 5 min", cantidad: data.tiempoRespuesta.distribucion.menos5min, fill: "#2D4A2B" },
                          { name: "5–30 min", cantidad: data.tiempoRespuesta.distribucion.entre5y30min, fill: "#5C7A52" },
                          { name: "30 min–2 hr", cantidad: data.tiempoRespuesta.distribucion.entre30miny2hr, fill: "#C9A961" },
                          { name: "> 2 hr", cantidad: data.tiempoRespuesta.distribucion.mas2hr, fill: "#C44A4A" }
                        ]}
                        margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="name" fontSize={11} stroke="#94A3B8" />
                        <YAxis fontSize={11} stroke="#94A3B8" />
                        <Tooltip
                          contentStyle={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E2E8F0" }}
                          cursor={{ fill: "rgba(148, 163, 184, 0.05)" }}
                        />
                        <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                          {
                            [
                              { fill: "#2D4A2B" },
                              { fill: "#5C7A52" },
                              { fill: "#C9A961" },
                              { fill: "#C44A4A" }
                            ].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))
                          }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================
              VISTA 3: TABLA DE LEADS
             ============================================== */}
          {vistaActiva === 3 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              {/* Barra de Filtros */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between">
                <div className="flex flex-wrap gap-2 items-center flex-1">
                  {/* Búsqueda */}
                  <div className="relative w-64 max-w-full">
                    <input
                      type="text"
                      placeholder="Buscar por nombre o celular..."
                      value={filtroSearch}
                      onChange={(e) => setFiltroSearch(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pl-8 text-xs text-slate-800 placeholder-slate-400 focus:border-[#5C7A52] focus:ring-1 focus:ring-[#5C7A52]"
                    />
                    <svg className="absolute left-2.5 top-2.5 h-4.5 w-4.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>

                  {/* Filtro Estatus */}
                  <select
                    value={filtroStatus}
                    onChange={(e) => setFiltroStatus(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#5C7A52]"
                  >
                    <option value="todos">Todos los Estatus</option>
                    <option value="sin contactar">Sin Contactar</option>
                    <option value="en proceso">En Proceso</option>
                    <option value="calificado">Calificado</option>
                    <option value="perdido">Perdido</option>
                  </select>

                  {/* Filtro Canal */}
                  <select
                    value={filtroChannel}
                    onChange={(e) => setFiltroChannel(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#5C7A52]"
                  >
                    <option value="todos">Todos los Canales</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="facebook">Meta Ads (FB)</option>
                    <option value="instagram">Instagram</option>
                    <option value="sitio-web">Sitio Web</option>
                    <option value="recomendacion">Recomendado</option>
                    <option value="otro">Otro</option>
                  </select>

                  {/* Filtro Calificación */}
                  <select
                    value={filtroCalificacion}
                    onChange={(e) => setFiltroCalificacion(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#5C7A52]"
                  >
                    <option value="todos">Cualquier Semáforo</option>
                    <option value="verde">Verde (Calificado)</option>
                    <option value="amarillo">Amarillo (En proceso)</option>
                    <option value="rojo">Rojo (Perdido)</option>
                  </select>

                  {/* Filtro Fecha */}
                  <select
                    value={filtroFecha}
                    onChange={(e) => setFiltroFecha(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#5C7A52]"
                  >
                    <option value="todos">Cualquier Fecha</option>
                    <option value="hoy">Entradas Hoy (24h)</option>
                    <option value="semana">Esta Semana (7d)</option>
                    <option value="mes">Este Mes (30d)</option>
                  </select>
                </div>

                <div className="text-xs text-slate-500 font-mono">
                  Leads: <span className="font-bold text-[#2D4A2B]">{leadsFiltrados.length}</span> / {data.resumenEmbudo.totalLeads}
                </div>
              </div>

              {/* Tabla */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-slate-100 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                    <tr>
                      <th className="px-6 py-3">Nombre / Teléfono</th>
                      <th className="px-6 py-3">Fecha de Entrada</th>
                      <th className="px-6 py-3">Origen</th>
                      <th className="px-6 py-3">Estatus</th>
                      <th className="px-6 py-3">Semáforo</th>
                      <th className="px-6 py-3 text-right">Último Mensaje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {leadsFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                          No se encontraron leads con los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      leadsFiltrados.map((l) => {
                        // Resaltar en rojo si lleva más de 24h sin respuesta de Sofía
                        // Resaltar en verde si calificó como verde
                        let rowBg = "hover:bg-slate-50";
                        let borderLeft = "";

                        if (l.sinRespuestaSofia) {
                          rowBg = "bg-red-50/70 hover:bg-red-100/50";
                          borderLeft = "border-l-4 border-l-[#C44A4A]";
                        } else if (l.qualified === "verde") {
                          rowBg = "bg-green-50/70 hover:bg-green-100/50";
                          borderLeft = "border-l-4 border-l-[#5C7A52]";
                        }

                        return (
                          <tr
                            key={l.id}
                            onClick={() => setLeadChatSeleccionado(l.id)}
                            className={`cursor-pointer transition ${rowBg} ${borderLeft}`}
                          >
                            <td className="px-6 py-4">
                              <div className="font-bold flex items-center gap-1 text-[#2D4A2B]">
                                {l.name}
                                {l.qualified === "verde" && <IconoEstrella />}
                                {l.sinRespuestaSofia && <IconoAlerta />}
                              </div>
                              <div className="text-xs text-slate-500 font-mono mt-0.5">{l.phone}</div>
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">
                              {new Date(l.created_at).toLocaleDateString()} {new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-block px-2.5 py-1 text-xs rounded-full bg-slate-100 text-slate-700 uppercase font-mono font-medium">
                                {l.source}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full ${
                                  l.status === "calificado"
                                    ? "bg-green-100 text-green-800"
                                    : l.status === "sin contactar"
                                      ? "bg-slate-100 text-slate-600"
                                      : l.status === "perdido"
                                        ? "bg-red-100 text-red-800"
                                        : "bg-blue-100 text-blue-800"
                                }`}
                              >
                                {l.status === "sin contactar" && "Sin contactar"}
                                {l.status === "en proceso" && "En proceso"}
                                {l.status === "calificado" && "Calificado"}
                                {l.status === "perdido" && "Perdido"}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="flex items-center gap-1.5">
                                <span
                                  className={`h-2.5 w-2.5 rounded-full ${
                                    l.qualified === "verde"
                                      ? "bg-green-500 shadow-[0_0_8px_#22c55e]"
                                      : l.qualified === "rojo"
                                        ? "bg-red-500 shadow-[0_0_8px_#ef4444]"
                                        : "bg-yellow-500 shadow-[0_0_8px_#eab308]"
                                  }`}
                                />
                                <span className="text-xs capitalize font-medium">
                                  {l.qualified === "verde" && "Verde"}
                                  {l.qualified === "amarillo" && "Amarillo"}
                                  {l.qualified === "rojo" && "Rojo"}
                                </span>
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="text-xs font-medium text-slate-700">{l.tiempoUltimoMensaje}</div>
                              <div className="text-xs text-slate-400 mt-1 line-clamp-1 max-w-[200px] inline-block font-mono">
                                {l.ultimoTexto || "Sin mensajes"}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==============================================
              VISTA 4: ANÁLISIS DE CONVERSACIONES
             ============================================== */}
          {vistaActiva === 4 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Mensajes de Apertura Comunes */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
                  <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] mb-1">Mensaje de Apertura de Sofía más Común</h3>
                  <p className="text-xs text-slate-500 mb-4">Plantillas o textos introductorios de la IA que inician los hilos</p>
                  <div className="space-y-3 flex-1">
                    {data.analisisConversaciones.mensajesAperturaComunes.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-8">Sin datos de mensajes de apertura.</p>
                    ) : (
                      data.analisisConversaciones.mensajesAperturaComunes.map((m, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                          <span className="h-6 w-6 rounded-full bg-[#5C7A52] text-white flex items-center justify-center text-xs font-bold shrink-0">
                            {m.cantidad}
                          </span>
                          <p className="text-xs text-slate-700 italic line-clamp-3">"{m.texto}"</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Mensajes Finales de Conversaciones Perdidas */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
                  <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] mb-1">Punto de Corte en Leads Perdidos</h3>
                  <p className="text-xs text-slate-500 mb-4">Últimos mensajes enviados en conversaciones que no prosperaron</p>
                  <div className="space-y-3 flex-1">
                    {data.analisisConversaciones.puntosDeCortePerdidos.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-8">Sin datos de puntos de corte.</p>
                    ) : (
                      data.analisisConversaciones.puntosDeCortePerdidos.map((c, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 mt-0.5 ${
                                c.remitente === "user"
                                  ? "bg-slate-200 text-slate-700"
                                  : "bg-[#2D4A2B]/10 text-[#2D4A2B]"
                              }`}
                            >
                              {c.remitente === "user" ? "Cliente" : "Sofía"}
                            </span>
                            <p className="text-xs text-slate-700 italic line-clamp-3">"{c.texto}"</p>
                          </div>
                          <span className="text-xs font-mono font-bold text-[#C44A4A] bg-red-50 px-2 py-0.5 rounded shrink-0">
                            {c.cantidad} chat{c.cantidad === 1 ? "" : "s"}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Heatmap de tasa de respuesta por hora */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] mb-1">Heatmap de Tasa de Respuesta por Hora del Día</h3>
                <p className="text-xs text-slate-500 mb-6">Frecuencia de leads recibidos y su tasa de respuesta según la hora de entrada</p>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.analisisConversaciones.heatmapRespuestaHora}
                      margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="hora" tickFormatter={(h) => `${h}:00`} fontSize={10} stroke="#94A3B8" />
                      <YAxis fontSize={10} stroke="#94A3B8" />
                      <Tooltip
                        contentStyle={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E2E8F0" }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-md text-xs font-cuerpo space-y-1">
                                <p className="font-bold text-[#2D4A2B]">{d.hora}:00 hrs</p>
                                <p className="text-slate-600">Leads recibidos: <span className="font-semibold text-slate-800">{d.leads}</span></p>
                                <p className="text-slate-600">Respuestas: <span className="font-semibold text-slate-800">{d.respuestas}</span></p>
                                <p className="text-[#C9A961] font-bold">Tasa Respuesta: {d.tasa}%</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend fontSize={11} wrapperStyle={{ fontSize: '11px' }} />
                      <Bar name="Leads Recibidos" dataKey="leads" fill="#5C8DAA" radius={[2, 2, 0, 0]} />
                      <Bar name="Tasa de Respuesta (%)" dataKey="tasa" fill="#5C7A52" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Nube de palabras clave */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Palabras clave calificadas */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] mb-1">Palabras Clave en Chats Calificados</h3>
                  <p className="text-xs text-slate-500 mb-4">Términos más repetidos en conversaciones de leads calificados (Verde/Amarillo)</p>
                  <div className="flex flex-wrap gap-2 py-4">
                    {data.analisisConversaciones.palabrasClaveCalificaron.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center w-full">Sin datos de palabras clave.</p>
                    ) : (
                      data.analisisConversaciones.palabrasClaveCalificaron.map((p, idx) => {
                        // Calcular un tamaño de fuente proporcional
                        const maxCount = data.analisisConversaciones.palabrasClaveCalificaron[0].cantidad;
                        const factor = p.cantidad / maxCount;
                        const size = 11 + Math.round(factor * 12);
                        
                        return (
                          <span
                            key={idx}
                            style={{ fontSize: `${size}px` }}
                            className="inline-block px-2.5 py-1 rounded-lg bg-[#2D4A2B]/5 text-[#2D4A2B] font-semibold transition hover:bg-[#2D4A2B]/10 select-none cursor-default"
                            title={`Repetida ${p.cantidad} veces`}
                          >
                            {p.palabra} <span className="text-[9px] opacity-40 font-mono">({p.cantidad})</span>
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Palabras clave no calificadas */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] mb-1">Palabras Clave en Chats Perdidos</h3>
                  <p className="text-xs text-slate-500 mb-4">Términos más repetidos en conversaciones de leads perdidos/no calificados</p>
                  <div className="flex flex-wrap gap-2 py-4">
                    {data.analisisConversaciones.palabrasClaveNoCalificaron.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center w-full">Sin datos de palabras clave.</p>
                    ) : (
                      data.analisisConversaciones.palabrasClaveNoCalificaron.map((p, idx) => {
                        const maxCount = data.analisisConversaciones.palabrasClaveNoCalificaron[0].cantidad;
                        const factor = p.cantidad / maxCount;
                        const size = 11 + Math.round(factor * 12);

                        return (
                          <span
                            key={idx}
                            style={{ fontSize: `${size}px` }}
                            className="inline-block px-2.5 py-1 rounded-lg bg-red-50 text-[#C44A4A] font-semibold transition hover:bg-red-100/50 select-none cursor-default"
                            title={`Repetida ${p.cantidad} veces`}
                          >
                            {p.palabra} <span className="text-[9px] opacity-40 font-mono">({p.cantidad})</span>
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================
              VISTA 5: EVOLUCIÓN SEMANAL
             ============================================== */}
          {vistaActiva === 5 && (
            <div className="space-y-6">
              {/* Comparativas WoW */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <CardWoW
                  titulo="Variación Semanal de Leads"
                  valorActual={data.evolucionSemanal.semanas[data.evolucionSemanal.semanas.length - 1]?.leadsRecibidos ?? 0}
                  cambioPorcentaje={data.evolucionSemanal.wowLeadsVariacionPct}
                  descripcion="Leads recibidos en la semana actual comparado con la semana anterior"
                />
                <CardWoW
                  titulo="Variación Semanal Tasa de Respuesta"
                  valorActual={`${data.evolucionSemanal.semanas[data.evolucionSemanal.semanas.length - 1]?.tasaRespuesta ?? 0}%`}
                  cambioPorcentaje={data.evolucionSemanal.wowTasaRespuestaVariacionPct}
                  esPuntosPorcentuales={true}
                  descripcion="Variación en puntos porcentuales de la tasa de respuesta WoW"
                />
              </div>

              {/* Gráficos de Evolución */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Leads Recibidos por Semana */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] mb-1">Leads Recibidos Semanalmente</h3>
                  <p className="text-xs text-slate-500 mb-6">Volumen total de nuevos contactos por semana</p>
                  <div className="h-64 w-full">
                    {data.evolucionSemanal.semanas.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-20">Insuficientes datos semanales.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={data.evolucionSemanal.semanas}
                          margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                        >
                          <defs>
                            <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2d4a2b" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#2d4a2b" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="semana" fontSize={10} stroke="#94A3B8" />
                          <YAxis fontSize={10} stroke="#94A3B8" />
                          <Tooltip
                            contentStyle={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E2E8F0" }}
                          />
                          <Area
                            name="Leads Recibidos"
                            type="monotone"
                            dataKey="leadsRecibidos"
                            stroke="#2D4A2B"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorLeads)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Tasa de Respuesta por Semana */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] mb-1">Tasa de Respuesta Semanal</h3>
                  <p className="text-xs text-slate-500 mb-6">Porcentaje semanal de leads que contestaron a Sofía</p>
                  <div className="h-64 w-full">
                    {data.evolucionSemanal.semanas.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-20">Insuficientes datos semanales.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={data.evolucionSemanal.semanas}
                          margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="semana" fontSize={10} stroke="#94A3B8" />
                          <YAxis tickFormatter={(v) => `${v}%`} fontSize={10} stroke="#94A3B8" />
                          <Tooltip
                            contentStyle={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #E2E8F0" }}
                            formatter={(value) => [`${value}%`, "Tasa de Respuesta"]}
                          />
                          <Line
                            name="Tasa de Respuesta"
                            type="monotone"
                            dataKey="tasaRespuesta"
                            stroke="#C9A961"
                            strokeWidth={2.5}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* DRAWER / DETALLE DEL CHAT (MODAL DERECHO) */}
      {leadChatSeleccionado && leadSeleccionadoInfo && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Overlay de fondo */}
          <div
            className="absolute inset-0 bg-carbon/40 backdrop-blur-sm transition-opacity"
            onClick={() => setLeadChatSeleccionado(null)}
          />

          {/* Panel Lateral */}
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10 animate-slide-in-right">
            {/* Header del Drawer */}
            <div className="p-4 border-b border-slate-200 bg-[#F5F1E8]/35 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1">
                  <h3 className="font-fraunces text-base font-bold text-[#2D4A2B]">{leadSeleccionadoInfo.name}</h3>
                  {leadSeleccionadoInfo.qualified === "verde" && <IconoEstrella />}
                </div>
                <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                  <span>{leadSeleccionadoInfo.phone}</span>
                  <span>•</span>
                  <span>Canal: <span className="uppercase font-semibold">{leadSeleccionadoInfo.source}</span></span>
                </div>
              </div>
              <button
                onClick={() => setLeadChatSeleccionado(null)}
                className="rounded-lg p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Historial del Chat */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 scrollbar-sutil">
              {leadSeleccionadoInfo.conversacionCompleta.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  No se registran mensajes en este hilo de conversación.
                </div>
              ) : (
                leadSeleccionadoInfo.conversacionCompleta.map((msg) => {
                  const esUser = msg.role === "user";
                  return (
                    <div key={msg.id} className={`flex ${esUser ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-sm border ${
                          esUser
                            ? "bg-[#2D4A2B] text-white rounded-br-none border-[#2D4A2B]"
                            : "bg-white text-slate-800 rounded-bl-none border-slate-200"
                        }`}
                      >
                        {!esUser && (
                          <span className="text-[10px] font-bold text-[#5C7A52] block mb-1 uppercase tracking-wide">
                            Sofía / IA
                          </span>
                        )}
                        <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>
                        <span
                          className={`text-[9px] block text-right mt-1.5 opacity-60 font-mono ${
                            esUser ? "text-slate-300" : "text-slate-500"
                          }`}
                        >
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Informativo */}
            <div className="p-3 bg-slate-100 border-t border-slate-200 text-[10px] text-slate-400 text-center font-mono">
              Lead ID: {leadSeleccionadoInfo.id} • Creado: {new Date(leadSeleccionadoInfo.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- SUBCOMPONENTES AUXILIARES ---

// Botón del Menú del Sidebar
function TabButton({
  active,
  onClick,
  icon,
  label,
  badge
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition ${
        active
          ? "bg-[#2D4A2B] text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <svg
          className={`h-4.5 w-4.5 shrink-0 ${active ? "text-[#C9A961]" : "text-slate-400"}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d={icon} />
        </svg>
        <span className="truncate">{label}</span>
      </div>
      {badge !== undefined && (
        <span
          className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
            active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// Tarjeta de Métrica Simple
function CardMetrica({
  titulo,
  valor,
  desc,
  color,
  extra
}: {
  titulo: string;
  valor: string | number;
  desc: string;
  color: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between ${color}`}>
      <div>
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">{titulo}</span>
        <span className="text-2xl font-fraunces font-extrabold text-[#2D4A2B] mt-1.5 block">{valor}</span>
      </div>
      <div className="mt-2 pt-2 border-t border-slate-100">
        <span className="text-[11px] text-slate-500 block leading-tight">{desc}</span>
        {extra}
      </div>
    </div>
  );
}

// Barra del Embudo de Conversión
function FunnelBar({
  etiqueta,
  valor,
  porcentaje,
  color
}: {
  etiqueta: string;
  valor: number;
  porcentaje: number;
  color: string;
}) {
  return (
    <div className="space-y-1.5 w-full">
      <div className="flex justify-between items-end text-xs font-semibold">
        <span className="text-slate-700">{etiqueta}</span>
        <span className="text-slate-500 font-mono">
          <span className="text-[#2D4A2B] font-bold text-sm">{valor}</span> ({porcentaje}%)
        </span>
      </div>
      <div className="h-5 w-full bg-slate-100 rounded-lg overflow-hidden border border-slate-200/50">
        <div
          className={`h-full rounded-lg transition-all duration-500 ${color}`}
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  );
}

// Elemento de Paso de Conversión
function ConversionStep({
  titulo,
  desc,
  porcentaje,
  origenLabel,
  destinoLabel
}: {
  titulo: string;
  desc: string;
  porcentaje: number;
  origenLabel: string;
  destinoLabel: string;
}) {
  return (
    <div className="p-4 rounded-xl border border-slate-100 bg-[#F5F1E8]/20 flex items-center justify-between gap-4">
      <div className="flex-1 space-y-1">
        <h4 className="text-sm font-bold text-[#2D4A2B]">{titulo}</h4>
        <p className="text-xs text-slate-500 leading-snug">{desc}</p>
        <div className="text-[10px] text-slate-400 font-mono mt-1">
          {origenLabel} $\rightarrow$ {destinoLabel}
        </div>
      </div>
      <div className="text-right shrink-0">
        <span className="text-2xl font-fraunces font-extrabold text-[#C9A961] block">{porcentaje}%</span>
        <span className="text-[10px] text-slate-400 font-medium">conversión</span>
      </div>
    </div>
  );
}

// Tarjeta WoW (Evolución Semanal)
function CardWoW({
  titulo,
  valorActual,
  cambioPorcentaje,
  esPuntosPorcentuales,
  descripcion
}: {
  titulo: string;
  valorActual: string | number;
  cambioPorcentaje: number;
  esPuntosPorcentuales?: boolean;
  descripcion: string;
}) {
  const esPositivo = cambioPorcentaje >= 0;
  const esCero = cambioPorcentaje === 0;

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{titulo}</h4>
        <div className="flex items-baseline gap-2.5 mt-2">
          <span className="text-4xl font-fraunces font-extrabold text-[#2D4A2B]">{valorActual}</span>
          {!esCero && (
            <span
              className={`inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-xs font-bold font-mono ${
                esPositivo ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              }`}
            >
              {esPositivo ? "↑" : "↓"} {Math.abs(cambioPorcentaje)}
              {esPuntosPorcentuales ? " pp" : "%"}
            </span>
          )}
          {esCero && (
            <span className="bg-slate-100 text-slate-600 rounded px-2 py-0.5 text-xs font-bold font-mono">
              0%
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-4 leading-relaxed border-t border-slate-100 pt-3">{descripcion}</p>
    </div>
  );
}

// Skeleton para pantalla de carga
function CRMClientSkeleton() {
  return (
    <div className="flex min-h-screen bg-slate-50 text-[#0F172A] font-cuerpo">
      {/* Sidebar Mock */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden lg:flex lg:flex-col p-4 space-y-6 shrink-0">
        <div className="h-10 bg-slate-200 rounded animate-pulse" />
        <div className="space-y-3 flex-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      </aside>

      {/* Main Panel Mock */}
      <main className="flex-1 p-6 space-y-6">
        <div className="h-8 bg-slate-200 rounded w-1/4 animate-pulse mb-6" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-2xl p-4 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="h-80 bg-white border border-slate-200 rounded-2xl animate-pulse" />
          <div className="h-80 bg-white border border-slate-200 rounded-2xl animate-pulse" />
        </div>
      </main>
    </div>
  );
}
