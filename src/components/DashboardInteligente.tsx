"use client";

import { useEffect, useState, useMemo } from "react";
import {
  obtenerMetricasMarketing,
  obtenerInsightsIA,
  generarInsightsConIA,
  obtenerKPIsRealesCRM,
  sincronizarHistorialMarketing,
  type MarketingMetric,
  type AIInsight
} from "@/app/actions/reportes-ia";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  LineChart,
  Line,
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
  amarillo: "#D97706",
  verdeLuz: "#DCFCE7",
  rojoLuz: "#FEE2E2",
  amarilloLuz: "#FEF3C7",
  gris: "#64748B",
  azul: "#3B82F6",
  violeta: "#8B5CF6"
};

const PALETA_CANALES = {
  facebook: "#1877F2",
  instagram: "#E1306C",
  tiktok: "#00f2fe",
  "google-analytics": "#F29111",
  otro: "#64748B"
};

// Funciones auxiliares para renderizado de Markdown simple
function parseBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*([\s\S]*?)\*\*/g);
  return parts.map((part, i) => {
    return i % 2 === 1 ? <strong key={i} className="font-bold text-slate-800">{part}</strong> : part;
  });
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inList = false;
  let inNumList = false;
  let listItems: React.ReactNode[] = [];

  const commitList = (key: string | number) => {
    if (inList) {
      elements.push(
        <ul key={`ul-${key}`} className="list-disc pl-4 space-y-1 my-1.5">
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
    if (inNumList) {
      elements.push(
        <ol key={`ol-${key}`} className="list-decimal pl-4 space-y-1 my-1.5">
          {listItems}
        </ol>
      );
      listItems = [];
      inNumList = false;
    }
  };

  lines.forEach((line, idx) => {
    const cleanLine = line.trim();
    if (!cleanLine) {
      commitList(idx);
      return;
    }

    // Encabezado 4 (####) - verificar antes de ###
    if (cleanLine.startsWith("####")) {
      commitList(idx);
      elements.push(
        <h5 key={idx} className="font-bold text-slate-800 text-xs mt-3 mb-1 uppercase tracking-wider">
          {parseBold(cleanLine.replace(/^####\s*/, ""))}
        </h5>
      );
      return;
    }

    // Encabezado 3 (###)
    if (cleanLine.startsWith("###")) {
      commitList(idx);
      elements.push(
        <h4 key={idx} className="font-bold text-[#2D4A2B] text-sm mt-4 mb-2">
          {parseBold(cleanLine.replace(/^###\s*/, ""))}
        </h4>
      );
      return;
    }

    // Item de lista no ordenada (- o *)
    if (cleanLine.startsWith("- ") || cleanLine.startsWith("* ")) {
      if (inNumList) commitList(idx);
      inList = true;
      listItems.push(
        <li key={idx} className="text-slate-600 text-xs">
          {parseBold(cleanLine.replace(/^[-*]\s*/, ""))}
        </li>
      );
      return;
    }

    // Item de lista ordenada (1. , 2. )
    if (/^\d+\.\s+/.test(cleanLine)) {
      if (inList) commitList(idx);
      inNumList = true;
      listItems.push(
        <li key={idx} className="text-slate-600 text-xs">
          {parseBold(cleanLine.replace(/^\d+\.\s+/, ""))}
        </li>
      );
      return;
    }

    // Párrafo normal
    commitList(idx);
    elements.push(
      <p key={idx} className="my-1.5 text-xs text-slate-600 leading-relaxed">
        {parseBold(cleanLine)}
      </p>
    );
  });

  commitList("final");
  return elements;
}

export function DashboardInteligente() {
  const [metricas, setMetricas] = useState<MarketingMetric[]>([]);
  const [insight, setInsight] = useState<AIInsight | null>(null);
  const [kpisRealesCRM, setKpisRealesCRM] = useState({ totalLeads: 0, totalVentas: 0 });
  const [loading, setLoading] = useState(true);
  const [generandoIA, setGenerandoIA] = useState(false);
  const [rangoDias, setRangoDias] = useState<7 | 14 | 30>(14);

  // Estados para sincronización de historial
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [sincronizandoHistorial, setSincronizandoHistorial] = useState(false);
  const [fbToken, setFbToken] = useState("");
  const [fbAdAccountId, setFbAdAccountId] = useState("1269333735358072");
  const [fbFechaInicio, setFbFechaInicio] = useState("2026-05-01");

  // Carga de datos inicial
  useEffect(() => {
    async function cargarDatos() {
      setLoading(true);
      try {
        const [met, ins, kpisCrm] = await Promise.all([
          obtenerMetricasMarketing(),
          obtenerInsightsIA(),
          obtenerKPIsRealesCRM()
        ]);
        setMetricas(met);
        setInsight(ins);
        setKpisRealesCRM(kpisCrm);
      } catch (error) {
        console.error("Error al cargar datos de analítica:", error);
      } finally {
        setLoading(false);
      }
    }
    cargarDatos();
  }, []);

  // Handler para regenerar insights con IA (llamando a Claude)
  const handleRegenerarIA = async () => {
    setGenerandoIA(true);
    try {
      const nuevoInsight = await generarInsightsConIA();
      setInsight(nuevoInsight);
      // Actualizar también KPIs reales por si cambiaron
      const kpisCrm = await obtenerKPIsRealesCRM();
      setKpisRealesCRM(kpisCrm);
    } catch (error) {
      alert("Error al invocar al cerebro analítico. Verifique la API Key de Anthropic.");
      console.error(error);
    } finally {
      setGenerandoIA(false);
    }
  };

  // Handler para ejecutar el backfill histórico desde Facebook Ads
  const handleSincronizarHistorial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbToken.trim()) {
      alert("Por favor introduce el Token de Acceso de Facebook.");
      return;
    }
    setSincronizandoHistorial(true);
    try {
      const res = await sincronizarHistorialMarketing(fbToken, fbAdAccountId, fbFechaInicio);
      if (res.success) {
        alert(res.message);
        setShowSyncModal(false);
        // Recargar datos en la UI
        const [met, kpisCrm] = await Promise.all([
          obtenerMetricasMarketing(),
          obtenerKPIsRealesCRM()
        ]);
        setMetricas(met);
        setKpisRealesCRM(kpisCrm);
      } else {
        alert(`Fallo en la sincronización: ${res.message}`);
      }
    } catch (err: any) {
      alert(`Error en el servidor: ${err.message}`);
    } finally {
      setSincronizandoHistorial(false);
    }
  };

  // Filtrar métricas en base al rango de días seleccionado
  const metricasFiltradas = useMemo(() => {
    if (metricas.length === 0) return [];
    
    // Obtener las fechas más recientes
    const fechasUnicas = Array.from(new Set(metricas.map(m => m.fecha)))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime()); // De más nueva a más vieja

    const fechasRango = fechasUnicas.slice(0, rangoDias);
    return metricas
      .filter(m => fechasRango.includes(m.fecha))
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()); // Ascendente para gráficos
  }, [metricas, rangoDias]);

  // Cálculos consolidados para los KPI Cards
  const kpis = useMemo(() => {
    const totalGasto = metricasFiltradas.reduce((acc, curr) => acc + Number(curr.gasto_publicitario), 0);
    const totalLeadsMarketing = metricasFiltradas.reduce((acc, curr) => acc + curr.leads_registrados_crm, 0);
    const totalClics = metricasFiltradas.reduce((acc, curr) => acc + curr.clics, 0);
    const totalImpresiones = metricasFiltradas.reduce((acc, curr) => acc + curr.impresiones, 0);
    
    // CPA Promedio se calcula en base al gasto y los leads captados de campañas pagadas
    const cpa = totalLeadsMarketing > 0 ? totalGasto / totalLeadsMarketing : 0;
    
    // Tasa de conversión global del CRM real
    const conversion = kpisRealesCRM.totalLeads > 0 ? (kpisRealesCRM.totalVentas / kpisRealesCRM.totalLeads) * 100 : 0;
    const ctr = totalImpresiones > 0 ? (totalClics / totalImpresiones) * 100 : 0;

    return {
      totalGasto,
      totalLeadsMarketing,
      cpa,
      conversion,
      ctr
    };
  }, [metricasFiltradas, kpisRealesCRM]);

  // Agrupado diario para el gráfico de Gasto vs Leads
  const datosPorDia = useMemo(() => {
    const mapa = new Map<string, { fecha: string; Gasto: number; Leads: number }>();
    metricasFiltradas.forEach(m => {
      const existente = mapa.get(m.fecha) || { fecha: m.fecha, Gasto: 0, Leads: 0 };
      existente.Gasto += Number(m.gasto_publicitario);
      existente.Leads += m.leads_registrados_crm;
      mapa.set(m.fecha, existente);
    });
    return Array.from(mapa.values());
  }, [metricasFiltradas]);

  // Agrupado por canal para gráfico de torta de adquisición
  const datosPorCanal = useMemo(() => {
    const mapa = new Map<string, { name: string; value: number }>();
    metricasFiltradas.forEach(m => {
      const canalNombre = m.canal.toUpperCase();
      const existente = mapa.get(m.canal) || { name: canalNombre, value: 0 };
      existente.value += m.leads_registrados_crm;
      mapa.set(m.canal, existente);
    });
    return Array.from(mapa.values()).filter(d => d.value > 0);
  }, [metricasFiltradas]);

  // Historial de CPA por día
  const datosCpaDiario = useMemo(() => {
    const mapa = new Map<string, { fecha: string; Gasto: number; Leads: number }>();
    metricasFiltradas.forEach(m => {
      const existente = mapa.get(m.fecha) || { fecha: m.fecha, Gasto: 0, Leads: 0 };
      existente.Gasto += Number(m.gasto_publicitario);
      existente.Leads += m.leads_registrados_crm;
      mapa.set(m.fecha, existente);
    });
    return Array.from(mapa.values()).map(d => ({
      fecha: d.fecha.slice(5), // Cortar año para el gráfico
      CPA: d.Leads > 0 ? Number((d.Gasto / d.Leads).toFixed(2)) : 0
    }));
  }, [metricasFiltradas]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 font-cuerpo">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#2D4A2B] border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-600 text-sm">Cargando Torre de Control...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-[#0F172A] font-cuerpo p-4 lg:p-8">
      {/* CABECERA */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">En Vivo</span>
          </div>
          <h1 className="font-fraunces text-3xl font-extrabold text-[#2D4A2B] tracking-tight">
            🧠 Dashboard Inteligente (Admin)
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Analítica consolidada multi-canal con recomendaciones automáticas y control operativo.
          </p>
        </div>

        {/* CONTROLES */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setRangoDias(d as any)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  rangoDias === d
                    ? "bg-[#2D4A2B] text-[#F5F1E8]"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Últimos {d} días
              </button>
            ))}
          </div>

          <button
            onClick={handleRegenerarIA}
            disabled={generandoIA}
            className="flex items-center gap-2 rounded-lg bg-[#2D4A2B] px-4 py-2 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition disabled:opacity-50 shadow-sm"
          >
            {generandoIA ? (
              <>
                <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Sofía está analizando...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Analizar con Sofía (IA)
              </>
            )}
          </button>

          <button
            onClick={() => setShowSyncModal(true)}
            className="flex items-center gap-2 rounded-lg border border-[#2D4A2B] bg-white px-4 py-2 text-xs font-bold text-[#2D4A2B] hover:bg-[#F5F1E8] transition shadow-sm"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
            </svg>
            Sincronizar Historial
          </button>
        </div>
      </header>

      {/* SECCIÓN DEL CEREBRO DE RECOMENDACIONES (SOFÍA) */}
      {insight && (
        <section className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tarjeta Alertas Críticas (Rojo) */}
          <div className="rounded-2xl border border-red-200 bg-[#FDF2F2] p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
                  ⚠️
                </span>
                <h3 className="font-semibold text-red-900 text-sm uppercase tracking-wider">Alertas Críticas</h3>
              </div>
              <div className="space-y-3">
                {insight.alertas.length === 0 ? (
                  <p className="text-xs text-red-600 font-medium">Sin fallas operativas registradas.</p>
                ) : (
                  insight.alertas.map((a, idx) => (
                    <p key={idx} className="text-xs text-red-800 leading-relaxed font-medium">
                      {a}
                    </p>
                  ))
                )}
              </div>
            </div>
            {insight.estado_salud === "critico" && (
              <span className="mt-4 inline-block self-start rounded-full bg-red-600 px-3 py-1 text-[10px] font-bold text-white uppercase tracking-wider">
                Salud Crítica
              </span>
            )}
          </div>

          {/* Tarjeta Oportunidades (Amarillo) */}
          <div className="rounded-2xl border border-amber-200 bg-[#FFFBEB] p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                  💡
                </span>
                <h3 className="font-semibold text-amber-900 text-sm uppercase tracking-wider">Oportunidades de Mejora</h3>
              </div>
              <div className="space-y-3">
                {insight.oportunidades.length === 0 ? (
                  <p className="text-xs text-amber-600 font-medium">Sin oportunidades sugeridas hoy.</p>
                ) : (
                  insight.oportunidades.map((o, idx) => (
                    <p key={idx} className="text-xs text-amber-800 leading-relaxed font-medium">
                      {o}
                    </p>
                  ))
                )}
              </div>
            </div>
            {insight.estado_salud === "regular" && (
              <span className="mt-4 inline-block self-start rounded-full bg-amber-500 px-3 py-1 text-[10px] font-bold text-white uppercase tracking-wider">
                Salud Regular
              </span>
            )}
          </div>

          {/* Reporte de Diagnóstico General */}
          <div className="rounded-2xl border border-emerald-150 bg-white p-6 shadow-sm flex flex-col justify-between border-slate-200">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                    📈
                  </span>
                  <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">Salud Operativa</h3>
                </div>
                {insight.estado_salud === "excelente" && (
                  <span className="rounded-full bg-emerald-500 px-3 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                    Excelente
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-600 leading-relaxed font-medium prose prose-sm max-h-48 overflow-y-auto pr-2 scrollbar-sutil">
                {/* Visualizar Diagnóstico con parser simple de markdown */}
                {renderMarkdown(insight.diagnostico_general)}
              </div>
            </div>
            <div className="mt-4 text-[10px] text-slate-400">
              Generado el: {insight.fecha}
            </div>
          </div>
        </section>
      )}

      {/* TARJETAS DE KPIS PRINCIPALES */}
      <section className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Gasto Total</span>
          <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">${kpis.totalGasto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
          <span className="text-[9px] text-slate-400">Presupuesto invertido</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Leads CRM</span>
          <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{kpisRealesCRM.totalLeads}</p>
          <span className="text-[9px] text-slate-400">Capturados en CRM</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">CPA Promedio</span>
          <p className="text-xl font-extrabold text-amber-600 mt-1">${kpis.cpa.toFixed(2)}</p>
          <span className="text-[9px] text-slate-400">Costo por Adquisición</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Ventas Cerradas</span>
          <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{kpisRealesCRM.totalVentas}</p>
          <span className="text-[9px] text-slate-400">Expedientes finalizados</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Conversión</span>
          <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{kpis.conversion.toFixed(1)}%</p>
          <span className="text-[9px] text-slate-400">Lead a Venta</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">CTR Promedio</span>
          <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{kpis.ctr.toFixed(2)}%</p>
          <span className="text-[9px] text-slate-400">Clics / Impresiones</span>
        </div>
      </section>

      {/* GRÁFICOS ANALÍTICOS */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Gráfico 1: Relación Gasto vs Leads (Area/Bar) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm lg:col-span-2">
          <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-4">
            Relación Gasto Publicitario vs Leads Capturados
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={datosPorDia} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorGasto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORES.verdeSauce} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={COLORES.verdeSauce} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="fecha" tick={{ fontSize: 9 }} stroke="#64748B" />
                <YAxis yAxisId="left" tick={{ fontSize: 9 }} stroke="#64748B" label={{ value: 'Gasto ($)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 10, fill: '#64748B' } }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} stroke="#64748B" label={{ value: 'Leads', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fontSize: 10, fill: '#64748B' } }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area yAxisId="left" type="monotone" dataKey="Gasto" name="Inversión ($)" stroke={COLORES.verdeSauce} fillOpacity={1} fill="url(#colorGasto)" strokeWidth={2} />
                <Bar yAxisId="right" dataKey="Leads" name="Leads Capturados" fill={COLORES.dorado} radius={[4, 4, 0, 0]} barSize={20} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Torta de Leads por Canal */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-4">
            Distribución de Adquisición
          </h3>
          <div className="h-72 flex items-center justify-center">
            {datosPorCanal.length === 0 ? (
              <p className="text-slate-400 text-xs font-medium">Sin datos para distribuir.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={datosPorCanal}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {datosPorCanal.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={PALETA_CANALES[entry.name.toLowerCase() as keyof typeof PALETA_CANALES] || COLORES.gris} 
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} leads`, 'Total']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend 
                    layout="horizontal" 
                    verticalAlign="bottom" 
                    align="center"
                    wrapperStyle={{ fontSize: 10 }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Gráfico 3: Tendencia de CPA diario */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm lg:col-span-1">
          <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-4">
            Evolución del CPA Diario ($)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={datosCpaDiario} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="fecha" tick={{ fontSize: 9 }} stroke="#64748B" />
                <YAxis tick={{ fontSize: 9 }} stroke="#64748B" />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Line type="monotone" dataKey="CPA" name="CPA ($)" stroke={COLORES.amarillo} strokeWidth={2.5} activeDot={{ r: 6 }} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabla Detallada Histórica */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-fraunces text-base font-bold text-[#2D4A2B]">
              Historial Consolidado de Métricas
            </h3>
            <span className="text-[10px] text-slate-500 font-semibold bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
              {metricasFiltradas.length} Registros
            </span>
          </div>
          <div className="overflow-x-auto max-h-64 scrollbar-sutil">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-bold tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Canal</th>
                  <th className="px-4 py-2">Campaña</th>
                  <th className="px-4 py-2 text-right">Inversión</th>
                  <th className="px-4 py-2 text-right">Clics</th>
                  <th className="px-4 py-2 text-right">Leads</th>
                  <th className="px-4 py-2 text-right">Cerrados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {metricasFiltradas.map((m, index) => (
                  <tr key={m.id || index} className="hover:bg-slate-50 text-slate-700">
                    <td className="px-4 py-2.5 font-mono text-[10px]">{m.fecha}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold text-white uppercase" style={{ backgroundColor: PALETA_CANALES[m.canal] || COLORES.gris }}>
                        {m.canal}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 truncate max-w-[150px]">{m.campana_nombre || "Orgánico / General"}</td>
                    <td className="px-4 py-2.5 text-right font-mono">${Number(m.gasto_publicitario).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{m.clics}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[#2D4A2B] font-bold">{m.leads_registrados_crm}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-600 font-bold">{m.ventas_cerradas_crm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* MODAL DE SINCRONIZACIÓN HISTÓRICA */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
                🔄 Sincronizar Historial de Publicidad
              </h3>
              <button 
                onClick={() => setShowSyncModal(false)}
                className="text-slate-400 hover:text-[#2D4A2B] text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSincronizarHistorial} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Meta Access Token (con permiso ads_read)
                </label>
                <textarea
                  value={fbToken}
                  onChange={(e) => setFbToken(e.target.value)}
                  placeholder="Pega el token de Meta generado en la consola..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-mono h-20 resize-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    ID Cuenta Publicitaria
                  </label>
                  <input
                    type="text"
                    value={fbAdAccountId}
                    onChange={(e) => setFbAdAccountId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Sincronizar desde
                  </label>
                  <input
                    type="date"
                    value={fbFechaInicio}
                    onChange={(e) => setFbFechaInicio(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none"
                    required
                  />
                </div>
              </div>

              <p className="text-[10px] text-slate-400 leading-normal font-medium">
                Esta acción descargará día por día los gastos reales de Meta Ads, contará automáticamente los prospectos registrados en el CRM para cada día y creará el historial consolidado.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSyncModal(false)}
                  className="w-1/2 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sincronizandoHistorial}
                  className="w-1/2 rounded-xl bg-[#2D4A2B] py-2.5 text-xs font-semibold text-[#F5F1E8] hover:bg-[#5C7A52] transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {sincronizandoHistorial ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent font-bold"></div>
                      Sincronizando...
                    </>
                  ) : (
                    "Iniciar"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
