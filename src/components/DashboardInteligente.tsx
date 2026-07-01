"use client";

import { useEffect, useState, useMemo } from "react";
import {
  obtenerMetricasMarketing,
  obtenerInsightsIA,
  generarInsightsConIA,
  obtenerKPIsRealesCRM,
  obtenerKPIsPeriodoCRM,
  sincronizarHistorialMarketing,
  sincronizarHistorialTikTok,
  obtenerTransaccionesFinancieras,
  crearTransaccionFinanciera,
  importarTransaccionesMasivas,
  eliminarTransaccionFinanciera,
  obtenerExpedientesCerradosSinComision,
  obtenerTodosLosExpedientes,
  eliminarDatosDemostracionFinanzas,
  actualizarTransaccionFinanciera,
  obtenerMetricasOrganicas,
  guardarMetricaOrganica,
  eliminarMetricaOrganica,
  sincronizarMetricasOrganicasMeta,
  type MarketingMetric,
  type TransaccionFinanciera,
  type AIInsight,
  type MetricaOrganica
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
  Cell,
  ComposedChart
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
  const [metricasOrganicas, setMetricasOrganicas] = useState<MetricaOrganica[]>([]);
  const [insightMarketing, setInsightMarketing] = useState<AIInsight | null>(null);
  const [insightFinanzas, setInsightFinanzas] = useState<AIInsight | null>(null);
  const [insightOrganico, setInsightOrganico] = useState<AIInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [generandoIA, setGenerandoIA] = useState(false);

  // Selector de Pestaña Principal (Marketing vs Finanzas vs Orgánico)
  const [activeTab, setActiveTab] = useState<"marketing" | "finanzas" | "organico">("marketing");

  // Rangos de fecha y selección
  const [rangoSeleccionado, setRangoSeleccionado] = useState<"7" | "14" | "30" | "este-mes" | "este-ano" | "custom">("14");
  const [vistaPnLMensual, setVistaPnLMensual] = useState(false);
  const [fechaInicioCustom, setFechaInicioCustom] = useState("");
  const [fechaFinCustom, setFechaFinCustom] = useState("");

  // KPIs dinámicos del CRM (en base a la fecha filtrada)
  const [crmKPIs, setCrmKPIs] = useState({
    actual: { totalLeads: 0, totalVentas: 0 },
    previo: { totalLeads: 0, totalVentas: 0 }
  });

  // Estados de Finanzas y P&L
  const [transacciones, setTransacciones] = useState<TransaccionFinanciera[]>([]);
  const [transaccionesPrev, setTransaccionesPrev] = useState<TransaccionFinanciera[]>([]);
  const [expedientesCerrados, setExpedientesCerrados] = useState<any[]>([]);
  const [todosLosExpedientes, setTodosLosExpedientes] = useState<any[]>([]);
  const [loadingFinanzas, setLoadingFinanzas] = useState(false);

  // Modales financieros
  const [showManualModal, setShowManualModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Formulario manual
  const [manualData, setManualData] = useState({
    fecha: new Date().toISOString().split("T")[0],
    tipo: "gasto" as "ingreso" | "gasto",
    categoria: "otro" as any,
    concepto: "",
    monto: "",
    expediente_id: "",
    es_recurrente: false
  });
  const [loadingManual, setLoadingManual] = useState(false);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Estado para Drill-down de P&L
  const [drillDownConfig, setDrillDownConfig] = useState<{
    categoria: string;
    mes?: string;
    titulo: string;
  } | null>(null);
  const [updatingTxId, setUpdatingTxId] = useState<string | null>(null);

  // Importador de Excel
  const [importText, setImportText] = useState("");
  const [loadingImport, setLoadingImport] = useState(false);

  // Modal de Métricas Orgánicas
  const [showOrganicModal, setShowOrganicModal] = useState(false);
  const [loadingOrganic, setLoadingOrganic] = useState(false);
  const [organicData, setOrganicData] = useState({
    fecha: new Date().toISOString().split("T")[0],
    plataforma: "instagram" as "facebook" | "instagram" | "tiktok",
    seguidores: "",
    publicaciones: "",
    visualizaciones: "",
    interacciones: ""
  });

  // Estados para sincronización de historial
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncTab, setSyncTab] = useState<"facebook" | "tiktok" | "organico">("facebook");
  const [sincronizandoHistorial, setSincronizandoHistorial] = useState(false);
  const [sincronizandoOrganico, setSincronizandoOrganico] = useState(false);
  const [fbToken, setFbToken] = useState("");
  const [fbAdAccountId, setFbAdAccountId] = useState("1269333735358072");
  const [fbPageId, setFbPageId] = useState("");
  const [diasOrganicos, setDiasOrganicos] = useState(14);
  const [fbFechaInicio, setFbFechaInicio] = useState("2026-05-01");

  // Credenciales de TikTok
  const [tkToken, setTkToken] = useState("");
  const [tkAdvertiserId, setTkAdvertiserId] = useState("");
  const [tkFechaInicio, setTkFechaInicio] = useState("2026-05-01");
  const [sincronizandoTikTok, setSincronizandoTikTok] = useState(false);

  // Carga de datos inicial (métricas fijas de marketing y diagnósticos de Sofía)
  useEffect(() => {
    async function cargarDatos() {
      setLoading(true);
      try {
        const [met, insM, insF, insO] = await Promise.all([
          obtenerMetricasMarketing(),
          obtenerInsightsIA("marketing"),
          obtenerInsightsIA("finanzas"),
          obtenerInsightsIA("organico")
        ]);
        setMetricas(met);
        setInsightMarketing(insM);
        setInsightFinanzas(insF);
        setInsightOrganico(insO);
      } catch (error) {
        console.error("Error al cargar datos de analítica:", error);
      } finally {
        setLoading(false);
      }
    }
    cargarDatos();
  }, []);

  // Calcular las fechas del período seleccionado y del período previo equivalente
  const fechasCalculadas = useMemo(() => {
    const today = new Date();
    let fechaFin = today.toISOString().split("T")[0];
    let fechaInicio = "";

    if (rangoSeleccionado === "7") {
      const d = new Date();
      d.setDate(today.getDate() - 6);
      fechaInicio = d.toISOString().split("T")[0];
    } else if (rangoSeleccionado === "14") {
      const d = new Date();
      d.setDate(today.getDate() - 13);
      fechaInicio = d.toISOString().split("T")[0];
    } else if (rangoSeleccionado === "30") {
      const d = new Date();
      d.setDate(today.getDate() - 29);
      fechaInicio = d.toISOString().split("T")[0];
    } else if (rangoSeleccionado === "este-mes") {
      const primerDia = new Date(today.getFullYear(), today.getMonth(), 1);
      fechaInicio = primerDia.toISOString().split("T")[0];
    } else if (rangoSeleccionado === "este-ano") {
      const primerDia = new Date(today.getFullYear(), 0, 1);
      fechaInicio = primerDia.toISOString().split("T")[0];
    } else if (rangoSeleccionado === "custom" && fechaInicioCustom && fechaFinCustom) {
      fechaInicio = fechaInicioCustom;
      fechaFin = fechaFinCustom;
    } else {
      // Fallback por defecto a 14 días
      const d = new Date();
      d.setDate(today.getDate() - 13);
      fechaInicio = d.toISOString().split("T")[0];
    }

    let fechaInicioPrev = "";
    let fechaFinPrev = "";

    if (rangoSeleccionado === "este-mes") {
      // Periodo anterior: mes completo anterior
      const primerDiaPrev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const ultimoDiaPrev = new Date(today.getFullYear(), today.getMonth(), 0);
      fechaInicioPrev = primerDiaPrev.toISOString().split("T")[0];
      fechaFinPrev = ultimoDiaPrev.toISOString().split("T")[0];
    } else if (rangoSeleccionado === "este-ano") {
      // Periodo anterior: año anterior completo equivalente (YTD)
      const primerDiaPrev = new Date(today.getFullYear() - 1, 0, 1);
      const equivalenteDiaPrev = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
      fechaInicioPrev = primerDiaPrev.toISOString().split("T")[0];
      fechaFinPrev = equivalenteDiaPrev.toISOString().split("T")[0];
    } else {
      // Calcular período anterior equivalente para la comparativa MoM
      const start = new Date(fechaInicio);
      const end = new Date(fechaFin);
      const diffMs = end.getTime() - start.getTime() + 24 * 3600 * 1000;

      const startPrev = new Date(start.getTime() - diffMs);
      const endPrev = new Date(start.getTime() - 1);

      fechaInicioPrev = startPrev.toISOString().split("T")[0];
      fechaFinPrev = endPrev.toISOString().split("T")[0];
    }

    return {
      fechaInicio,
      fechaFin,
      fechaInicioPrev,
      fechaFinPrev
    };
  }, [rangoSeleccionado, fechaInicioCustom, fechaFinCustom]);

  // Cargar dinámicamente los KPIs de CRM, transacciones financieras, expedientes sin comisión y métricas orgánicas
  useEffect(() => {
    if (!fechasCalculadas.fechaInicio || !fechasCalculadas.fechaFin) return;

    async function cargarDatosFinancierosYCRM() {
      setLoadingFinanzas(true);
      try {
        const [kpis, trans, transPrev, expCerrados, todosExps, org] = await Promise.all([
          obtenerKPIsPeriodoCRM(
            fechasCalculadas.fechaInicio,
            fechasCalculadas.fechaFin,
            fechasCalculadas.fechaInicioPrev,
            fechasCalculadas.fechaFinPrev
          ),
          obtenerTransaccionesFinancieras(fechasCalculadas.fechaInicio, fechasCalculadas.fechaFin),
          obtenerTransaccionesFinancieras(fechasCalculadas.fechaInicioPrev, fechasCalculadas.fechaFinPrev),
          obtenerExpedientesCerradosSinComision(),
          obtenerTodosLosExpedientes(),
          obtenerMetricasOrganicas(fechasCalculadas.fechaInicio, fechasCalculadas.fechaFin)
        ]);
        setCrmKPIs(kpis);
        setTransacciones(trans);
        setTransaccionesPrev(transPrev);
        setExpedientesCerrados(expCerrados);
        setTodosLosExpedientes(todosExps);
        setMetricasOrganicas(org);
      } catch (error) {
        console.error("Error al cargar datos financieros y CRM:", error);
      } finally {
        setLoadingFinanzas(false);
      }
    }
    cargarDatosFinancierosYCRM();
  }, [fechasCalculadas]);

  // Handler para regenerar insights con IA (llamando a Claude)
  const handleRegenerarIA = async () => {
    setGenerandoIA(true);
    try {
      const nuevoInsight = await generarInsightsConIA(
        fechasCalculadas.fechaInicio,
        fechasCalculadas.fechaFin,
        fechasCalculadas.fechaInicioPrev,
        fechasCalculadas.fechaFinPrev,
        activeTab
      );
      if (activeTab === "marketing") {
        setInsightMarketing(nuevoInsight);
      } else if (activeTab === "finanzas") {
        setInsightFinanzas(nuevoInsight);
      } else if (activeTab === "organico") {
        setInsightOrganico(nuevoInsight);
      }
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
        const met = await obtenerMetricasMarketing();
        setMetricas(met);
        // Forzar actualización de KPIs CRM recalculando
        const kpis = await obtenerKPIsPeriodoCRM(
          fechasCalculadas.fechaInicio,
          fechasCalculadas.fechaFin,
          fechasCalculadas.fechaInicioPrev,
          fechasCalculadas.fechaFinPrev
        );
        setCrmKPIs(kpis);
      } else {
        alert(`Fallo en la sincronización: ${res.message}`);
      }
    } catch (err: any) {
      alert(`Error en el servidor: ${err.message}`);
    } finally {
      setSincronizandoHistorial(false);
    }
  };

  // Handler para ejecutar el backfill histórico desde TikTok Ads
  const handleSincronizarTikTok = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tkToken.trim() || !tkAdvertiserId.trim()) {
      alert("Por favor introduce el Token de Acceso y el ID de Anunciante de TikTok.");
      return;
    }
    setSincronizandoTikTok(true);
    try {
      const res = await sincronizarHistorialTikTok(tkToken, tkAdvertiserId, tkFechaInicio);
      if (res.success) {
        alert(res.message);
        setShowSyncModal(false);
        // Recargar datos en la UI
        const met = await obtenerMetricasMarketing();
        setMetricas(met);
        // Forzar actualización de KPIs CRM recalculando
        const kpis = await obtenerKPIsPeriodoCRM(
          fechasCalculadas.fechaInicio,
          fechasCalculadas.fechaFin,
          fechasCalculadas.fechaInicioPrev,
          fechasCalculadas.fechaFinPrev
        );
        setCrmKPIs(kpis);
      } else {
        alert(`Fallo en la sincronización de TikTok: ${res.message}`);
      }
    } catch (err: any) {
      alert(`Error en el servidor: ${err.message}`);
    } finally {
      setSincronizandoTikTok(false);
    }
  };

  // Handler para ejecutar la sincronización orgánica de Facebook/Instagram desde Meta Graph API
  const handleSincronizarOrganicoMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbToken.trim() || !fbPageId.trim()) {
      alert("Por favor introduce el Token de Acceso y el ID de Página de Facebook.");
      return;
    }
    setSincronizandoOrganico(true);
    try {
      const res = await sincronizarMetricasOrganicasMeta(fbToken, fbPageId, diasOrganicos);
      if (res.success) {
        alert(res.message);
        setShowSyncModal(false);
        // Recargar datos en la UI
        const org = await obtenerMetricasOrganicas(fechasCalculadas.fechaInicio, fechasCalculadas.fechaFin);
        setMetricasOrganicas(org);
      } else {
        alert(`Fallo en la sincronización orgánica: ${res.message}`);
      }
    } catch (err: any) {
      alert(`Error en el servidor: ${err.message}`);
    } finally {
      setSincronizandoOrganico(false);
    }
  };

  // Handler para registrar movimiento contable de forma manual o editar uno existente
  const handleCrearTransaccionManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualData.concepto.trim() || !manualData.monto) {
      alert("Por favor completa el concepto y el monto.");
      return;
    }

    const categoriaFinal = isCustomCategory ? customCategoryName.trim().toLowerCase() : manualData.categoria;
    if (isCustomCategory && !customCategoryName.trim()) {
      alert("Por favor ingresa un nombre para la nueva categoría.");
      return;
    }

    setLoadingManual(true);
    try {
      const payload = {
        fecha: manualData.fecha,
        tipo: manualData.tipo,
        categoria: categoriaFinal,
        concepto: manualData.concepto,
        monto: Number(manualData.monto),
        expediente_id: manualData.expediente_id || null,
        es_recurrente: manualData.es_recurrente
      };

      let res;
      if (editingId) {
        res = await actualizarTransaccionFinanciera(editingId, payload);
      } else {
        res = await crearTransaccionFinanciera(payload);
      }

      if (res.success) {
        alert(res.message);
        setShowManualModal(false);
        // Resetear formulario
        setManualData({
          fecha: new Date().toISOString().split("T")[0],
          tipo: "gasto",
          categoria: "otro",
          concepto: "",
          monto: "",
          expediente_id: "",
          es_recurrente: false
        });
        setIsCustomCategory(false);
        setCustomCategoryName("");
        setEditingId(null);
        // Recargar datos
        const trans = await obtenerTransaccionesFinancieras(fechasCalculadas.fechaInicio, fechasCalculadas.fechaFin);
        const expCerrados = await obtenerExpedientesCerradosSinComision();
        setTransacciones(trans);
        setExpedientesCerrados(expCerrados);
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      alert(`Error al guardar movimiento: ${err.message}`);
    } finally {
      setLoadingManual(false);
    }
  };

  // Handler para eliminar un movimiento financiero
  const handleEliminarTransaccion = async (id: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este registro financiero?")) return;
    try {
      const res = await eliminarTransaccionFinanciera(id);
      if (res.success) {
        alert(res.message);
        // Recargar transacciones
        const trans = await obtenerTransaccionesFinancieras(fechasCalculadas.fechaInicio, fechasCalculadas.fechaFin);
        const expCerrados = await obtenerExpedientesCerradosSinComision();
        setTransacciones(trans);
        setExpedientesCerrados(expCerrados);
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      alert(`Error al eliminar movimiento: ${err.message}`);
    }
  };

  // Handler para guardar métrica orgánica manual
  const handleGuardarMetricaOrganica = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organicData.seguidores || !organicData.publicaciones) {
      alert("Por favor completa al menos los campos de seguidores y publicaciones.");
      return;
    }
    setLoadingOrganic(true);
    try {
      const res = await guardarMetricaOrganica({
        fecha: organicData.fecha,
        plataforma: organicData.plataforma,
        seguidores: Number(organicData.seguidores),
        publicaciones: Number(organicData.publicaciones),
        visualizaciones: Number(organicData.visualizaciones || 0),
        interacciones: Number(organicData.interacciones || 0)
      });
      if (res.success) {
        alert(res.message);
        setShowOrganicModal(false);
        // Resetear campos
        setOrganicData({
          fecha: new Date().toISOString().split("T")[0],
          plataforma: "instagram",
          seguidores: "",
          publicaciones: "",
          visualizaciones: "",
          interacciones: ""
        });
        // Recargar datos orgánicos
        const org = await obtenerMetricasOrganicas(fechasCalculadas.fechaInicio, fechasCalculadas.fechaFin);
        setMetricasOrganicas(org);
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      alert(`Error al registrar métrica orgánica: ${err.message}`);
    } finally {
      setLoadingOrganic(false);
    }
  };

  // Handler para eliminar métrica orgánica
  const handleEliminarMetricaOrganicaRow = async (id: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este registro de métrica orgánica?")) return;
    try {
      const res = await eliminarMetricaOrganica(id);
      if (res.success) {
        alert(res.message);
        // Recargar datos orgánicos
        const org = await obtenerMetricasOrganicas(fechasCalculadas.fechaInicio, fechasCalculadas.fechaFin);
        setMetricasOrganicas(org);
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      alert(`Error al eliminar registro orgánico: ${err.message}`);
    }
  };

  // Handler para procesar y cargar datos copiados desde Excel (tabuladores / comas)
  const handleImportarExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importText.trim()) {
      alert("Por favor pega los datos de Excel en el cuadro de texto.");
      return;
    }
    setLoadingImport(true);
    try {
      const lineas = importText.split("\n");
      const transaccionesImportadas: Omit<TransaccionFinanciera, "id" | "created_at">[] = [];

      for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (!linea) continue;

        // Dividir por tabulación (copia directa de Excel) o por coma (CSV)
        const columnas = linea.split(/\t|,/);
        if (columnas.length < 5) continue;

        const fecha = columnas[0].trim();
        const tipo = columnas[1].trim().toLowerCase() as "ingreso" | "gasto";
        const categoria = columnas[2].trim().toLowerCase() as any;
        const concepto = columnas[3].trim();
        const montoRaw = columnas[4].trim().replace(/[^0-9.-]+/g, ""); // Quitar símbolos de moneda y comas
        const monto = Number(montoRaw);

        // Validaciones básicas de fila
        if (!fecha || !["ingreso", "gasto"].includes(tipo) || isNaN(monto)) {
          continue;
        }

        transaccionesImportadas.push({
          fecha,
          tipo,
          categoria,
          concepto,
          monto,
          expediente_id: null
        });
      }

      if (transaccionesImportadas.length === 0) {
        alert("No se encontraron registros válidos para importar. Formato requerido por columna: Fecha (YYYY-MM-DD) | Tipo (ingreso/gasto) | Categoría | Concepto | Monto.");
        setLoadingImport(false);
        return;
      }

      const res = await importarTransaccionesMasivas(transaccionesImportadas);
      if (res.success) {
        alert(res.message);
        setShowImportModal(false);
        setImportText("");
        // Recargar transacciones
        const trans = await obtenerTransaccionesFinancieras(fechasCalculadas.fechaInicio, fechasCalculadas.fechaFin);
        setTransacciones(trans);
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      alert(`Error al procesar la importación: ${err.message}`);
    } finally {
      setLoadingImport(false);
    }
  };

  // Handler para limpiar los datos demo que contengan "(Demo)"
  const handleLimpiarDemos = async () => {
    if (!confirm("¿Estás seguro de que deseas eliminar TODOS los registros de prueba etiquetados con '(Demo)'?")) return;
    try {
      const res = await eliminarDatosDemostracionFinanzas();
      if (res.success) {
        alert(res.message);
        // Recargar datos
        const trans = await obtenerTransaccionesFinancieras(fechasCalculadas.fechaInicio, fechasCalculadas.fechaFin);
        const expCerrados = await obtenerExpedientesCerradosSinComision();
        setTransacciones(trans);
        setExpedientesCerrados(expCerrados);
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      alert(`Error al limpiar datos demo: ${err.message}`);
    }
  };

  // Categorías de ingresos y gastos dinámicas extraídas de las transacciones existentes en base de datos
  const categoriasIngreso = useMemo(() => {
    const predeterminadas = ["comision", "venta", "otro"];
    const existentes = transacciones
      .filter(t => t.tipo === "ingreso")
      .map(t => t.categoria.toLowerCase());
    return Array.from(new Set([...predeterminadas, ...existentes]));
  }, [transacciones]);

  const categoriasGasto = useMemo(() => {
    const predeterminadas = ["nomina", "renta", "servicios", "marketing", "impuestos", "otro"];
    const existentes = transacciones
      .filter(t => t.tipo === "gasto")
      .map(t => t.categoria.toLowerCase());
    return Array.from(new Set([...predeterminadas, ...existentes]));
  }, [transacciones]);

  // Filtrar métricas de marketing para el período actual basándonos en fechas de calendario reales
  const metricasFiltradas = useMemo(() => {
    if (metricas.length === 0) return [];
    return metricas
      .filter(m => m.fecha >= fechasCalculadas.fechaInicio && m.fecha <= fechasCalculadas.fechaFin)
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()); // Orden ascendente para gráficos
  }, [metricas, fechasCalculadas]);

  // Filtrar métricas de marketing para el período comparativo previo
  const metricasFiltradasPrev = useMemo(() => {
    if (metricas.length === 0) return [];
    return metricas
      .filter(m => m.fecha >= fechasCalculadas.fechaInicioPrev && m.fecha <= fechasCalculadas.fechaFinPrev);
  }, [metricas, fechasCalculadas]);

  // Estado de Resultados (P&L) tradicional
  const estadoResultados = useMemo(() => {
    let ventasDirectas = 0;
    let comisiones = 0;
    let otrosIngresos = 0;

    let nomina = 0;
    let renta = 0;
    let servicios = 0;
    let impuestos = 0;
    let otrosGastos = 0;

    transacciones.forEach(t => {
      const cat = t.categoria.toLowerCase();
      if (t.tipo === "ingreso") {
        if (cat === "venta") ventasDirectas += t.monto;
        else if (cat === "comision") comisiones += t.monto;
        else otrosIngresos += t.monto;
      } else {
        if (cat === "nomina") nomina += t.monto;
        else if (cat === "renta") renta += t.monto;
        else if (cat === "servicios") servicios += t.monto;
        else if (cat === "impuestos") impuestos += t.monto;
        else if (cat !== "marketing") otrosGastos += t.monto;
      }
    });

    const metaAdsGasto = metricasFiltradas.reduce((acc, curr) => acc + (curr.gasto_publicitario || 0), 0);
    const marketingTransacciones = transacciones
      .filter(t => t.tipo === "gasto" && t.categoria.toLowerCase() === "marketing")
      .reduce((acc, curr) => acc + curr.monto, 0);

    const totalIngresos = ventasDirectas + comisiones + otrosIngresos;
    const totalMarketing = metaAdsGasto + marketingTransacciones;
    const utilidadBruta = totalIngresos - totalMarketing;

    const totalOpex = nomina + renta + servicios + impuestos + otrosGastos;
    const utilidadNeta = utilidadBruta - totalOpex;
    const margenNeto = totalIngresos > 0 ? (utilidadNeta / totalIngresos) * 100 : 0;

    return {
      ventasDirectas,
      comisiones,
      otrosIngresos,
      totalIngresos,
      totalMarketing,
      utilidadBruta,
      nomina,
      renta,
      servicios,
      impuestos,
      otrosGastos,
      totalOpex,
      utilidadNeta,
      margenNeto
    };
  }, [transacciones, metricasFiltradas]);

  // Cálculos consolidados para Métricas Orgánicas
  const organicoKPIs = useMemo(() => {
    const ultimosSeguidores = { facebook: 0, instagram: 0, tiktok: 0 };
    const ultimasFechas = { facebook: "", instagram: "", tiktok: "" };

    let totalPublicaciones = 0;
    let totalVisualizaciones = 0;
    let totalInteracciones = 0;

    metricasOrganicas.forEach(o => {
      totalPublicaciones += o.publicaciones;
      totalVisualizaciones += o.visualizaciones;
      totalInteracciones += o.interacciones;

      const plat = o.plataforma.toLowerCase() as "facebook" | "instagram" | "tiktok";
      if (!ultimasFechas[plat] || o.fecha > ultimasFechas[plat]) {
        ultimasFechas[plat] = o.fecha;
        ultimosSeguidores[plat] = o.seguidores;
      }
    });

    const seguidoresTotales = ultimosSeguidores.facebook + ultimosSeguidores.instagram + ultimosSeguidores.tiktok;
    const engagementRate = totalVisualizaciones > 0 ? (totalInteracciones / totalVisualizaciones) * 100 : 0;

    return {
      seguidores: seguidoresTotales,
      desgloseSeguidores: ultimosSeguidores,
      publicaciones: totalPublicaciones,
      visualizaciones: totalVisualizaciones,
      interacciones: totalInteracciones,
      engagementRate
    };
  }, [metricasOrganicas]);

  // Datos agrupados para el gráfico de crecimiento de seguidores
  const datosSeguidoresGrafico = useMemo(() => {
    const fechasMap = new Map<string, { fecha: string; Facebook: number; Instagram: number; TikTok: number }>();
    metricasOrganicas.forEach(o => {
      const fechaCorta = o.fecha.slice(5); // cortar año
      const plat = o.plataforma.toLowerCase();
      const existente = fechasMap.get(o.fecha) || { fecha: fechaCorta, Facebook: 0, Instagram: 0, TikTok: 0 };
      if (plat === "facebook") existente.Facebook = o.seguidores;
      else if (plat === "instagram") existente.Instagram = o.seguidores;
      else if (plat === "tiktok") existente.TikTok = o.seguidores;
      fechasMap.set(o.fecha, existente);
    });
    return Array.from(fechasMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [metricasOrganicas]);

  // Datos agrupados para el gráfico de publicaciones y vistas orgánicas
  const datosContenidoGrafico = useMemo(() => {
    const fechasMap = new Map<string, { fecha: string; Publicaciones: number; Visualizaciones: number }>();
    metricasOrganicas.forEach(o => {
      const fechaCorta = o.fecha.slice(5);
      const existente = fechasMap.get(o.fecha) || { fecha: fechaCorta, Publicaciones: 0, Visualizaciones: 0 };
      existente.Publicaciones += o.publicaciones;
      existente.Visualizaciones += o.visualizaciones;
      fechasMap.set(o.fecha, existente);
    });
    return Array.from(fechasMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [metricasOrganicas]);

  // Obtener la lista de meses "AAAA-MM" que caen dentro del período seleccionado
  const mesesEnPeriodo = useMemo(() => {
    if (!fechasCalculadas.fechaInicio || !fechasCalculadas.fechaFin) return [];
    const start = new Date(fechasCalculadas.fechaInicio + 'T00:00:00');
    const end = new Date(fechasCalculadas.fechaFin + 'T00:00:00');
    const resultado: string[] = [];
    const actual = new Date(start.getFullYear(), start.getMonth(), 1);

    while (actual <= end) {
      const year = actual.getFullYear();
      const month = String(actual.getMonth() + 1).padStart(2, '0');
      resultado.push(`${year}-${month}`);
      actual.setMonth(actual.getMonth() + 1);
    }
    return resultado;
  }, [fechasCalculadas]);

  // Desglose del P&L mensual para el período seleccionado
  const PnLMensual = useMemo(() => {
    const mapa = new Map<string, {
      ventasDirectas: number;
      comisiones: number;
      otrosIngresos: number;
      nomina: number;
      renta: number;
      servicios: number;
      impuestos: number;
      otrosGastos: number;
      marketingTransacciones: number;
      metaAdsGasto: number;
    }>();

    // Inicializar mapa para todos los meses del periodo
    mesesEnPeriodo.forEach(mes => {
      mapa.set(mes, {
        ventasDirectas: 0,
        comisiones: 0,
        otrosIngresos: 0,
        nomina: 0,
        renta: 0,
        servicios: 0,
        impuestos: 0,
        otrosGastos: 0,
        marketingTransacciones: 0,
        metaAdsGasto: 0
      });
    });

    // Sumar transacciones financieras
    transacciones.forEach(t => {
      const mes = t.fecha.slice(0, 7); // "YYYY-MM"
      if (!mapa.has(mes)) {
        mapa.set(mes, {
          ventasDirectas: 0,
          comisiones: 0,
          otrosIngresos: 0,
          nomina: 0,
          renta: 0,
          servicios: 0,
          impuestos: 0,
          otrosGastos: 0,
          marketingTransacciones: 0,
          metaAdsGasto: 0
        });
      }
      const datosMes = mapa.get(mes)!;
      const cat = t.categoria.toLowerCase();
      if (t.tipo === "ingreso") {
        if (cat === "venta") datosMes.ventasDirectas += t.monto;
        else if (cat === "comision") datosMes.comisiones += t.monto;
        else datosMes.otrosIngresos += t.monto;
      } else {
        if (cat === "nomina") datosMes.nomina += t.monto;
        else if (cat === "renta") datosMes.renta += t.monto;
        else if (cat === "servicios") datosMes.servicios += t.monto;
        else if (cat === "impuestos") datosMes.impuestos += t.monto;
        else if (cat === "marketing") datosMes.marketingTransacciones += t.monto;
        else datosMes.otrosGastos += t.monto;
      }
    });

    // Sumar el gasto publicitario de Meta/TikTok desde las métricas diarias
    metricasFiltradas.forEach(m => {
      const mes = m.fecha.slice(0, 7);
      if (mapa.has(mes)) {
        mapa.get(mes)!.metaAdsGasto += (m.gasto_publicitario || 0);
      }
    });

    // Construir estructura final para la tabla
    return mesesEnPeriodo.map(mes => {
      const datos = mapa.get(mes)!;
      const totalIngresos = datos.ventasDirectas + datos.comisiones + datos.otrosIngresos;
      const totalMarketing = datos.metaAdsGasto + datos.marketingTransacciones;
      const utilidadBruta = totalIngresos - totalMarketing;
      const totalOpex = datos.nomina + datos.renta + datos.servicios + datos.impuestos + datos.otrosGastos;
      const utilidadNeta = utilidadBruta - totalOpex;
      const margenNeto = totalIngresos > 0 ? (utilidadNeta / totalIngresos) * 100 : 0;

      return {
        mes,
        ...datos,
        totalIngresos,
        totalMarketing,
        utilidadBruta,
        totalOpex,
        utilidadNeta,
        margenNeto
      };
    });
  }, [mesesEnPeriodo, transacciones, metricasFiltradas]);

  const formatearMes = (mesStr: string) => {
    const [year, month] = mesStr.split("-");
    const nombresMeses = [
      "Ene", "Feb", "Mar", "Abr", "May", "Jun",
      "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
    ];
    return `${nombresMeses[parseInt(month, 10) - 1]} ${year.slice(2)}`;
  };

  // Transacciones filtradas para el modal de Drill-down
  const transaccionesDrillDown = useMemo(() => {
    if (!drillDownConfig) return [];
    const { categoria, mes } = drillDownConfig;

    return transacciones.filter((t) => {
      // Filtrar por mes si aplica
      if (mes && !t.fecha.startsWith(mes)) {
        return false;
      }

      const cat = t.categoria.toLowerCase();
      if (categoria === "comision") {
        return t.tipo === "ingreso" && cat === "comision";
      }
      if (categoria === "venta") {
        return t.tipo === "ingreso" && cat === "venta";
      }
      if (categoria === "otrosIngresos") {
        return t.tipo === "ingreso" && cat !== "comision" && cat !== "venta";
      }
      if (categoria === "marketing") {
        return t.tipo === "gasto" && cat === "marketing";
      }
      if (categoria === "nomina") {
        return t.tipo === "gasto" && cat === "nomina";
      }
      if (categoria === "renta") {
        return t.tipo === "gasto" && cat === "renta";
      }
      if (categoria === "servicios") {
        return t.tipo === "gasto" && cat === "servicios";
      }
      if (categoria === "impuestos") {
        return t.tipo === "gasto" && cat === "impuestos";
      }
      if (categoria === "otrosGastos") {
        return t.tipo === "gasto" && !["nomina", "renta", "servicios", "impuestos", "marketing"].includes(cat);
      }
      return false;
    });
  }, [drillDownConfig, transacciones]);

  // Registros diarios de marketing para el Drill-down
  const marketingMetricasDrillDown = useMemo(() => {
    if (!drillDownConfig || !["marketing", "publicidad"].includes(drillDownConfig.categoria)) return [];
    const { mes } = drillDownConfig;
    return metricasFiltradas.filter((m) => {
      if (mes && !m.fecha.startsWith(mes)) return false;
      return (m.gasto_publicitario || 0) > 0;
    });
  }, [drillDownConfig, metricasFiltradas]);

  const handleCambiarCategoriaDrillDown = async (id: string, nuevaCategoria: string) => {
    setUpdatingTxId(id);
    try {
      const res = await actualizarTransaccionFinanciera(id, { categoria: nuevaCategoria });
      if (res.success) {
        setTransacciones(prev => prev.map(t => t.id === id ? { ...t, categoria: nuevaCategoria } : t));
      } else {
        alert("Error al actualizar la categoría: " + res.message);
      }
    } catch (error: any) {
      alert("Error al actualizar: " + error.message);
    } finally {
      setUpdatingTxId(null);
    }
  };

  const handleEliminarTransaccionDrillDown = async (id: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este movimiento contable?")) return;
    setUpdatingTxId(id);
    try {
      const res = await eliminarTransaccionFinanciera(id);
      if (res.success) {
        setTransacciones(prev => prev.filter(t => t.id !== id));
      } else {
        alert("Error al eliminar la transacción: " + res.message);
      }
    } catch (error: any) {
      alert("Error al eliminar: " + error.message);
    } finally {
      setUpdatingTxId(null);
    }
  };

  // Cálculos consolidados para los KPI Cards
  const kpis = useMemo(() => {
    // 1. Periodo actual
    const totalGasto = metricasFiltradas.reduce((acc, curr) => acc + Number(curr.gasto_publicitario), 0);
    const totalLeadsMarketing = metricasFiltradas.reduce((acc, curr) => acc + curr.leads_registrados_crm, 0);
    const totalClics = metricasFiltradas.reduce((acc, curr) => acc + curr.clics, 0);
    const totalImpresiones = metricasFiltradas.reduce((acc, curr) => acc + curr.impresiones, 0);
    
    const cpa = totalLeadsMarketing > 0 ? totalGasto / totalLeadsMarketing : 0;
    const ctr = totalImpresiones > 0 ? (totalClics / totalImpresiones) * 100 : 0;

    // 2. Periodo previo
    const totalGastoPrev = metricasFiltradasPrev.reduce((acc, curr) => acc + Number(curr.gasto_publicitario), 0);
    const totalLeadsMarketingPrev = metricasFiltradasPrev.reduce((acc, curr) => acc + curr.leads_registrados_crm, 0);
    const totalClicsPrev = metricasFiltradasPrev.reduce((acc, curr) => acc + curr.clics, 0);
    const totalImpresionesPrev = metricasFiltradasPrev.reduce((acc, curr) => acc + curr.impresiones, 0);

    const cpaPrev = totalLeadsMarketingPrev > 0 ? totalGastoPrev / totalLeadsMarketingPrev : 0;
    const ctrPrev = totalImpresionesPrev > 0 ? (totalClicsPrev / totalImpresionesPrev) * 100 : 0;

    // 3. Variaciones porcentuales del periodo anterior
    const variacionGasto = totalGastoPrev > 0 ? ((totalGasto - totalGastoPrev) / totalGastoPrev) * 100 : 0;
    const variacionCpa = cpaPrev > 0 ? ((cpa - cpaPrev) / cpaPrev) * 100 : 0;
    const variacionCtr = ctrPrev > 0 ? ((ctr - ctrPrev) / ctrPrev) * 100 : 0;

    const variacionLeads = crmKPIs.previo.totalLeads > 0 
      ? ((crmKPIs.actual.totalLeads - crmKPIs.previo.totalLeads) / crmKPIs.previo.totalLeads) * 100 
      : 0;
    const variacionVentas = crmKPIs.previo.totalVentas > 0 
      ? ((crmKPIs.actual.totalVentas - crmKPIs.previo.totalVentas) / crmKPIs.previo.totalVentas) * 100 
      : 0;

    // Tasas de conversión y su variación
    const conversion = crmKPIs.actual.totalLeads > 0 
      ? (crmKPIs.actual.totalVentas / crmKPIs.actual.totalLeads) * 100 
      : 0;
    const conversionPrev = crmKPIs.previo.totalLeads > 0 
      ? (crmKPIs.previo.totalVentas / crmKPIs.previo.totalLeads) * 100 
      : 0;
    const variacionConversion = conversionPrev > 0 
      ? ((conversion - conversionPrev) / conversionPrev) * 100 
      : 0;

    return {
      totalGasto,
      totalGastoPrev,
      variacionGasto,
      cpa,
      cpaPrev,
      variacionCpa,
      ctr,
      ctrPrev,
      variacionCtr,
      conversion,
      variacionConversion,
      variacionLeads,
      variacionVentas
    };
  }, [metricasFiltradas, metricasFiltradasPrev, crmKPIs]);

  // Cálculos consolidados para la pestaña de Finanzas y P&L
  const finanzasKPIs = useMemo(() => {
    // 1. Periodo actual
    const ingresos = transacciones
      .filter(t => t.tipo === "ingreso")
      .reduce((sum, t) => sum + t.monto, 0);

    const opex = transacciones
      .filter(t => t.tipo === "gasto" && t.categoria !== "marketing")
      .reduce((sum, t) => sum + t.monto, 0);

    const marketing = kpis.totalGasto;

    const utilidadNeta = ingresos - (opex + marketing);
    const margenNeta = ingresos > 0 ? (utilidadNeta / ingresos) * 100 : 0;
    const roasReal = marketing > 0 ? ingresos / marketing : 0;

    // 2. Periodo previo
    const ingresosPrev = transaccionesPrev
      .filter(t => t.tipo === "ingreso")
      .reduce((sum, t) => sum + t.monto, 0);

    const opexPrev = transaccionesPrev
      .filter(t => t.tipo === "gasto" && t.categoria !== "marketing")
      .reduce((sum, t) => sum + t.monto, 0);

    const marketingPrev = kpis.totalGastoPrev;

    const utilidadNetaPrev = ingresosPrev - (opexPrev + marketingPrev);
    const margenNetaPrev = ingresosPrev > 0 ? (utilidadNetaPrev / ingresosPrev) * 100 : 0;
    const roasRealPrev = marketingPrev > 0 ? ingresosPrev / marketingPrev : 0;

    // 3. Variaciones porcentuales MoM
    const variacionIngresos = ingresosPrev > 0 ? ((ingresos - ingresosPrev) / ingresosPrev) * 100 : 0;
    const variacionOpex = opexPrev > 0 ? ((opex - opexPrev) / opexPrev) * 100 : 0;
    const variacionUtilidad = utilidadNetaPrev > 0 ? ((utilidadNeta - utilidadNetaPrev) / utilidadNetaPrev) * 100 : 0;
    const variacionMargen = margenNeta - margenNetaPrev; // Variación directa en puntos porcentuales
    const variacionRoas = roasRealPrev > 0 ? ((roasReal - roasRealPrev) / roasRealPrev) * 100 : 0;

    return {
      ingresos,
      ingresosPrev,
      opex,
      opexPrev,
      marketing,
      marketingPrev,
      utilidadNeta,
      utilidadNetaPrev,
      margenNeta,
      margenNetaPrev,
      roasReal,
      roasRealPrev,
      variacionIngresos,
      variacionOpex,
      variacionUtilidad,
      variacionMargen,
      variacionRoas
    };
  }, [transacciones, transaccionesPrev, kpis]);

  // Agrupado diario para el gráfico de Ingresos vs Gastos en Recharts
  const datosGraficoFinanciero = useMemo(() => {
    const mapa = new Map<string, { fecha: string; Ingresos: number; Gastos: number }>();

    // Rellenar primero con fechas de marketing para mantener sincronía
    metricasFiltradas.forEach(m => {
      const existente = mapa.get(m.fecha) || { fecha: m.fecha, Ingresos: 0, Gastos: 0 };
      existente.Gastos += Number(m.gasto_publicitario);
      mapa.set(m.fecha, existente);
    });

    // Sumar transacciones de ingresos/gastos
    transacciones.forEach(t => {
      const existente = mapa.get(t.fecha) || { fecha: t.fecha, Ingresos: 0, Gastos: 0 };
      if (t.tipo === "ingreso") {
        existente.Ingresos += t.monto;
      } else {
        existente.Gastos += t.monto;
      }
      mapa.set(t.fecha, existente);
    });

    return Array.from(mapa.values())
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map(d => ({
        fecha: d.fecha.slice(5), // YYYY-MM-DD -> MM-DD
        Ingresos: Number(d.Ingresos.toFixed(2)),
        Gastos: Number(d.Gastos.toFixed(2))
      }));
  }, [metricasFiltradas, transacciones]);

  // Agrupado por categoría de gastos para el gráfico de dona
  const datosDistribucionOpex = useMemo(() => {
    const mapa = new Map<string, number>();

    // Gastos operativos
    transacciones
      .filter(t => t.tipo === "gasto" && t.categoria !== "marketing")
      .forEach(t => {
        const cat = t.categoria.toUpperCase();
        mapa.set(cat, (mapa.get(cat) || 0) + t.monto);
      });

    // Inversión en marketing
    const totalMarketing = kpis.totalGasto;
    if (totalMarketing > 0) {
      mapa.set("MARKETING", totalMarketing);
    }

    return Array.from(mapa.entries()).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(2))
    }));
  }, [transacciones, kpis]);

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

  const insight = activeTab === "marketing" ? insightMarketing : (activeTab === "organico" ? insightOrganico : insightFinanzas);
  const isEditingChildTransaction = editingId ? !!transacciones.find(t => t.id === editingId)?.recurrente_parent_id : false;

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
      {/* CABECERA Y PESTAÑAS FIJAS */}
      <div className="sticky top-0 z-40 bg-slate-50/95 backdrop-blur-md pt-4 pb-1 border-b border-slate-200 mb-6 -mx-4 px-4 lg:-mx-8 lg:px-8">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-3">
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
              {(["7", "14", "30", "este-mes", "este-ano", "custom"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRangoSeleccionado(r)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    rangoSeleccionado === r
                      ? "bg-[#2D4A2B] text-[#F5F1E8]"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {r === "custom"
                    ? "Personalizado"
                    : r === "este-mes"
                    ? "Este Mes"
                    : r === "este-ano"
                    ? "Este Año"
                    : `Últimos ${r} días`}
                </button>
              ))}
            </div>

            {rangoSeleccionado === "custom" && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
                <input
                  type="date"
                  value={fechaInicioCustom}
                  onChange={(e) => setFechaInicioCustom(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-[#2D4A2B] focus:outline-none px-1"
                />
                <span className="text-slate-400 text-xs font-bold">al</span>
                <input
                  type="date"
                  value={fechaFinCustom}
                  onChange={(e) => setFechaFinCustom(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-[#2D4A2B] focus:outline-none px-1"
                />
              </div>
            )}

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

        {/* PESTAÑAS PRINCIPALES DEL DASHBOARD */}
        <div className="flex text-sm font-semibold flex-wrap">
          <button
            onClick={() => setActiveTab("marketing")}
            className={`pb-3 px-4 transition ${
              activeTab === "marketing"
                ? "border-b-2 border-[#2D4A2B] text-[#2D4A2B] font-bold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            📣 Adquisición & Leads (Marketing)
          </button>
          <button
            onClick={() => setActiveTab("finanzas")}
            className={`pb-3 px-4 transition ${
              activeTab === "finanzas"
                ? "border-b-2 border-[#2D4A2B] text-[#2D4A2B] font-bold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            💰 Finanzas & P&L (Contabilidad)
          </button>
          <button
            onClick={() => setActiveTab("organico")}
            className={`pb-3 px-4 transition ${
              activeTab === "organico"
                ? "border-b-2 border-[#2D4A2B] text-[#2D4A2B] font-bold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            📈 Redes & Tráfico Orgánico
          </button>
        </div>
      </div>

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

      {loadingFinanzas ? (
        <div className="flex h-96 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2D4A2B] border-t-transparent"></div>
        </div>
      ) : activeTab === "marketing" ? (
        <>
          {/* TARJETAS DE KPIS PRINCIPALES (MARKETING) */}
          <section className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Gasto Total</span>
                <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">${kpis.totalGasto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="mt-1 flex flex-col">
                <span className="text-[9px] text-slate-400">Presupuesto invertido</span>
                {kpis.totalGastoPrev > 0 ? (
                  <span className={`text-[9px] font-bold ${kpis.variacionGasto <= 0 ? "text-emerald-600" : "text-slate-500"}`}>
                    {kpis.variacionGasto >= 0 ? "▲" : "▼"} {Math.abs(kpis.variacionGasto).toFixed(1)}% vs periodo ant.
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300">Sin comparativo</span>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Leads CRM</span>
                <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{crmKPIs.actual.totalLeads}</p>
              </div>
              <div className="mt-1 flex flex-col">
                <span className="text-[9px] text-slate-400">Capturados en CRM</span>
                {crmKPIs.previo.totalLeads > 0 ? (
                  <span className={`text-[9px] font-bold ${kpis.variacionLeads >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {kpis.variacionLeads >= 0 ? "▲" : "▼"} {Math.abs(kpis.variacionLeads).toFixed(1)}% vs periodo ant.
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300">Sin comparativo</span>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">CPA Promedio</span>
                <p className="text-xl font-extrabold text-amber-600 mt-1">${kpis.cpa.toFixed(2)}</p>
              </div>
              <div className="mt-1 flex flex-col">
                <span className="text-[9px] text-slate-400">Costo por Adquisición</span>
                {kpis.cpaPrev > 0 ? (
                  <span className={`text-[9px] font-bold ${kpis.variacionCpa <= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {kpis.variacionCpa >= 0 ? "▲" : "▼"} {Math.abs(kpis.variacionCpa).toFixed(1)}% vs periodo ant.
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300">Sin comparativo</span>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Ventas Cerradas</span>
                <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{crmKPIs.actual.totalVentas}</p>
              </div>
              <div className="mt-1 flex flex-col">
                <span className="text-[9px] text-slate-400">Expedientes finalizados</span>
                {crmKPIs.previo.totalVentas > 0 ? (
                  <span className={`text-[9px] font-bold ${kpis.variacionVentas >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {kpis.variacionVentas >= 0 ? "▲" : "▼"} {Math.abs(kpis.variacionVentas).toFixed(1)}% vs periodo ant.
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300">Sin comparativo</span>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Conversión</span>
                <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{kpis.conversion.toFixed(1)}%</p>
              </div>
              <div className="mt-1 flex flex-col">
                <span className="text-[9px] text-slate-400">Lead a Venta</span>
                {crmKPIs.previo.totalLeads > 0 ? (
                  <span className={`text-[9px] font-bold ${kpis.variacionConversion >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {kpis.variacionConversion >= 0 ? "▲" : "▼"} {Math.abs(kpis.variacionConversion).toFixed(1)}% vs periodo ant.
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300">Sin comparativo</span>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">CTR Promedio</span>
                <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{kpis.ctr.toFixed(2)}%</p>
              </div>
              <div className="mt-1 flex flex-col">
                <span className="text-[9px] text-slate-400">Clics / Impresiones</span>
                {kpis.ctrPrev > 0 ? (
                  <span className={`text-[9px] font-bold ${kpis.variacionCtr >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {kpis.variacionCtr >= 0 ? "▲" : "▼"} {Math.abs(kpis.variacionCtr).toFixed(1)}% vs periodo ant.
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300">Sin comparativo</span>
                )}
              </div>
            </div>
          </section>

          {/* GRÁFICOS ANALÍTICOS (MARKETING) */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
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

            {/* TABLA DETALLADA HISTÓRICA */}
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
        </>
      ) : activeTab === "finanzas" ? (
        <>
          {/* TARJETAS DE KPIS PRINCIPALES (FINANZAS Y P&L) */}
          <section className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Ingresos Totales</span>
                <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">${finanzasKPIs.ingresos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="mt-1 flex flex-col">
                <span className="text-[9px] text-slate-400">Ventas & Comisiones</span>
                {finanzasKPIs.ingresosPrev > 0 ? (
                  <span className={`text-[9px] font-bold ${finanzasKPIs.variacionIngresos >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {finanzasKPIs.variacionIngresos >= 0 ? "▲" : "▼"} {Math.abs(finanzasKPIs.variacionIngresos).toFixed(1)}% vs periodo ant.
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300">Sin comparativo</span>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Inversión Marketing</span>
                <p className="text-xl font-extrabold text-amber-600 mt-1">${finanzasKPIs.marketing.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="mt-1 flex flex-col">
                <span className="text-[9px] text-slate-400">Facebook & TikTok Ads</span>
                {finanzasKPIs.marketingPrev > 0 ? (
                  <span className={`text-[9px] font-bold ${finanzasKPIs.marketing <= finanzasKPIs.marketingPrev ? "text-emerald-600" : "text-rose-600"}`}>
                    {finanzasKPIs.marketing >= finanzasKPIs.marketingPrev ? "▲" : "▼"} {Math.abs(((finanzasKPIs.marketing - finanzasKPIs.marketingPrev)/finanzasKPIs.marketingPrev)*100).toFixed(1)}% vs periodo ant.
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300">Sin comparativo</span>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Gastos OPEX</span>
                <p className="text-xl font-extrabold text-slate-700 mt-1">${finanzasKPIs.opex.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="mt-1 flex flex-col">
                <span className="text-[9px] text-slate-400">Nómina, renta, servicios</span>
                {finanzasKPIs.opexPrev > 0 ? (
                  <span className={`text-[9px] font-bold ${finanzasKPIs.variacionOpex <= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {finanzasKPIs.variacionOpex >= 0 ? "▲" : "▼"} {Math.abs(finanzasKPIs.variacionOpex).toFixed(1)}% vs periodo ant.
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300">Sin comparativo</span>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Utilidad Neta</span>
                <p className={`text-xl font-extrabold mt-1 ${finanzasKPIs.utilidadNeta >= 0 ? "text-[#2D4A2B]" : "text-rose-600"}`}>
                  ${finanzasKPIs.utilidadNeta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="mt-1 flex flex-col">
                <span className="text-[9px] text-slate-400">Ingresos - Egresos</span>
                {finanzasKPIs.utilidadNetaPrev !== 0 ? (
                  <span className={`text-[9px] font-bold ${finanzasKPIs.utilidadNeta >= finanzasKPIs.utilidadNetaPrev ? "text-emerald-600" : "text-rose-600"}`}>
                    {finanzasKPIs.utilidadNeta >= finanzasKPIs.utilidadNetaPrev ? "▲" : "▼"} {Math.abs(finanzasKPIs.variacionUtilidad).toFixed(1)}% vs periodo ant.
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300">Sin comparativo</span>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Margen Neto</span>
                <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{finanzasKPIs.margenNeta.toFixed(1)}%</p>
              </div>
              <div className="mt-1 flex flex-col">
                <span className="text-[9px] text-slate-400">Porcentaje de Retorno</span>
                {finanzasKPIs.ingresosPrev > 0 ? (
                  <span className={`text-[9px] font-bold ${finanzasKPIs.variacionMargen >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {finanzasKPIs.variacionMargen >= 0 ? "▲" : "▼"} {Math.abs(finanzasKPIs.variacionMargen).toFixed(1)} pp vs periodo ant.
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300">Sin comparativo</span>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ROAS Real</span>
                <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{finanzasKPIs.roasReal.toFixed(2)}x</p>
              </div>
              <div className="mt-1 flex flex-col">
                <span className="text-[9px] text-slate-400">Retorno real de inversión</span>
                {finanzasKPIs.roasRealPrev > 0 ? (
                  <span className={`text-[9px] font-bold ${finanzasKPIs.variacionRoas >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {finanzasKPIs.variacionRoas >= 0 ? "▲" : "▼"} {Math.abs(finanzasKPIs.variacionRoas).toFixed(1)}% vs periodo ant.
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-300">Sin comparativo</span>
                )}
              </div>
            </div>
          </section>

          {/* GRÁFICOS FINANCIEROS */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm lg:col-span-2">
              <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-4">
                Flujo de Caja (Ingresos vs Egresos Totales)
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosGraficoFinanciero} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 9 }} stroke="#64748B" />
                    <YAxis tick={{ fontSize: 9 }} stroke="#64748B" />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Ingresos" name="Ingresos ($)" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Gastos" name="Egresos ($)" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-4">
                Distribución del Total de Gastos
              </h3>
              <div className="h-72 flex flex-col justify-between">
                {datosDistribucionOpex.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    Sin egresos registrados en este periodo.
                  </div>
                ) : (
                  <>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={datosDistribucionOpex}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {datosDistribucionOpex.map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={Object.values(COLORES)[index % Object.values(COLORES).length]} 
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] mt-2 max-h-20 overflow-y-auto pr-1 scrollbar-sutil">
                      {datosDistribucionOpex.map((entry, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <span
                            className="h-2 w-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: Object.values(COLORES)[idx % Object.values(COLORES).length] }}
                          />
                          <span className="truncate text-slate-600 uppercase font-semibold">{entry.name}:</span>
                          <span className="font-bold">${entry.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* TABLA DE TRANSACCIONES Y ATRIBUCIÓN CRM */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-fraunces text-base font-bold text-[#2D4A2B]">
                  Libro Contable (Ingresos y Costos Operativos)
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleLimpiarDemos}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-[#FDF2F2] px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 transition shadow-sm"
                  >
                    🗑️ Limpiar Demos
                  </button>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
                  >
                    📋 Importar Excel
                  </button>
                  <button
                    onClick={() => setShowManualModal(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-[#2D4A2B] px-3 py-1.5 text-xs font-bold text-[#F5F1E8] hover:bg-[#5C7A52] transition shadow-sm"
                  >
                    ➕ Nuevo Registro
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[350px] scrollbar-sutil">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-bold tracking-wider sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5">Fecha</th>
                      <th className="px-4 py-2.5">Tipo</th>
                      <th className="px-4 py-2.5">Categoría</th>
                      <th className="px-4 py-2.5">Concepto</th>
                      <th className="px-4 py-2.5 text-right">Monto</th>
                      <th className="px-4 py-2.5 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {transacciones.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          Sin transacciones contables registradas para este periodo.
                        </td>
                      </tr>
                    ) : (
                      transacciones.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50 text-slate-700 transition">
                          <td className="px-4 py-2.5 font-mono text-[10px]">{t.fecha}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider ${
                              t.tipo === "ingreso" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            }`}>
                              {t.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-[10px] font-bold uppercase text-slate-500">{t.categoria}</td>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-slate-800 flex items-center gap-1.5 flex-wrap">
                              <span>{t.concepto}</span>
                              {t.es_recurrente && (
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[8px] font-bold px-1.5 py-0.2 rounded" title="Plantilla recurrente activa">
                                  🔁 Recurrente
                                </span>
                              )}
                              {t.recurrente_parent_id && (
                                <span className="bg-slate-50 text-slate-500 border border-slate-200 text-[8px] font-medium px-1.5 py-0.2 rounded" title="Movimiento generado automáticamente">
                                  ⚙️ Autogenerado
                                </span>
                              )}
                            </div>
                            {t.expediente_cliente && (
                              <span className="text-[9px] text-[#2D4A2B] bg-[#F5F1E8] px-1.5 py-0.5 rounded mt-0.5 inline-block font-bold">
                                Folio: {t.expediente_id} · Cliente: {t.expediente_cliente}
                              </span>
                            )}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono font-bold ${
                            t.tipo === "ingreso" ? "text-emerald-600" : "text-slate-900"
                          }`}>
                            ${t.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-2.5 text-center flex items-center justify-center gap-3">
                            <button
                              onClick={() => {
                                setEditingId(t.id!);
                                setManualData({
                                  fecha: t.fecha,
                                  tipo: t.tipo,
                                  categoria: t.categoria,
                                  concepto: t.concepto,
                                  monto: String(t.monto),
                                  expediente_id: t.expediente_id || "",
                                  es_recurrente: t.es_recurrente || false
                                });
                                const isCustom = t.tipo === "ingreso"
                                  ? !["comision", "venta", "otro"].includes(t.categoria.toLowerCase())
                                  : !["nomina", "renta", "servicios", "marketing", "impuestos", "otro"].includes(t.categoria.toLowerCase());
                                if (isCustom) {
                                  setIsCustomCategory(true);
                                  setCustomCategoryName(t.categoria);
                                } else {
                                  setIsCustomCategory(false);
                                  setCustomCategoryName("");
                                }
                                setShowManualModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-900 hover:underline font-bold"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleEliminarTransaccion(t.id!)}
                              className="text-rose-600 hover:text-rose-900 hover:underline font-bold"
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PANEL DE ATRIBUCIÓN CRM */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-2">
                Atribución de Ventas CRM
              </h3>
              <p className="text-[10px] text-slate-400 mb-4 leading-normal">
                Registra la comisión de los expedientes cerrados en tu embudo para sumarlos a los ingresos del P&L:
              </p>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-sutil">
                {expedientesCerrados.length === 0 ? (
                  <div className="flex h-44 flex-col items-center justify-center text-xs text-slate-400 text-center p-4">
                    <span>🎉</span>
                    <span className="mt-1 font-semibold text-slate-500">¡Todo al día!</span>
                    <span className="text-[10px] text-slate-300 mt-0.5">Todos los expedientes cerrados tienen sus comisiones registradas.</span>
                  </div>
                ) : (
                  expedientesCerrados.map((exp) => (
                    <div key={exp.id} className="border border-slate-100 rounded-xl p-3 hover:border-[#2D4A2B] transition flex flex-col justify-between bg-slate-50">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[9px] font-bold text-slate-400 font-mono uppercase">EXP: {exp.id}</span>
                          <span className="bg-emerald-100 text-emerald-800 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Cerrado</span>
                        </div>
                        <h4 className="font-bold text-slate-800 text-xs truncate">{exp.cliente}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">Valor de Operación: <span className="font-semibold text-slate-600">${exp.valor_estimado.toLocaleString("es-MX")}</span></p>
                      </div>
                      <button
                        onClick={() => {
                          setManualData({
                            fecha: exp.ultimo_movimiento || new Date().toISOString().split("T")[0],
                            tipo: "ingreso",
                            categoria: "comision",
                            concepto: `Comisión por Venta Cerrada: ${exp.cliente}`,
                            monto: String(Math.round(exp.valor_estimado * 0.05)), // Sugiere 5% de comisión por defecto
                            expediente_id: exp.id,
                            es_recurrente: false
                          });
                          setShowManualModal(true);
                        }}
                        className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1.5 rounded-lg transition text-center shadow-sm"
                      >
                        Registrar Comisión (5%)
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* ESTADO DE RESULTADOS TRADICIONAL (P&L STATEMENT) */}
          <section className="mb-8">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="border-b border-slate-100 pb-4 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="font-fraunces text-base font-bold text-[#2D4A2B]">
                    Estado de Resultados (P&L Tradicional)
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                    Resumen contable estructurado para el período seleccionado
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 shadow-sm text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setVistaPnLMensual(false)}
                      className={`rounded-md px-2.5 py-1 transition ${
                        !vistaPnLMensual
                          ? "bg-[#2D4A2B] text-[#F5F1E8]"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Consolidado
                    </button>
                    <button
                      type="button"
                      onClick={() => setVistaPnLMensual(true)}
                      className={`rounded-md px-2.5 py-1 transition ${
                        vistaPnLMensual
                          ? "bg-[#2D4A2B] text-[#F5F1E8]"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Mensual
                    </button>
                  </div>
                  <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 px-2 py-1 rounded tracking-wide">
                    Moneda: MXN ($)
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto scrollbar-sutil">
                {vistaPnLMensual ? (
                  <table className="w-full text-xs text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[9px] tracking-wider">
                        <th className="px-4 py-2.5 min-w-[200px]">Concepto</th>
                        <th className="px-4 py-2.5">Detalle / Notas</th>
                        {PnLMensual.map((m) => (
                          <th key={m.mes} className="px-4 py-2.5 text-right font-mono text-[10px]">
                            {formatearMes(m.mes)}
                          </th>
                        ))}
                        <th className="px-4 py-2.5 text-right bg-slate-100 font-bold font-mono text-[10px] text-slate-800">
                          Acumulado
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* 1. INGRESOS */}
                      <tr className="bg-slate-50 border-y border-slate-200 font-bold text-[#2D4A2B]">
                        <td className="px-4 py-2.5 uppercase tracking-wider text-[10px]" colSpan={2}>
                          1. Ingresos Operativos (Revenues)
                        </td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className="px-4 py-2.5 text-right font-mono">
                            ${m.totalIngresos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-mono bg-slate-50 text-slate-800">
                          ${estadoResultados.totalIngresos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500">Comisiones Inmobiliarias</td>
                        <td className="px-4 py-2 text-slate-400 text-[10px]">Intermediación de ventas/rentas</td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className="px-4 py-2 text-right font-mono text-slate-700">
                            <span
                              onClick={() => setDrillDownConfig({ categoria: "comision", mes: m.mes, titulo: `Comisiones Inmobiliarias (${formatearMes(m.mes)})` })}
                              className="cursor-pointer hover:underline text-emerald-700 font-bold hover:bg-slate-100 rounded px-1.5 py-0.5 -mx-1.5"
                            >
                              ${m.comisiones.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-mono text-slate-700 bg-slate-50/50">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "comision", titulo: "Comisiones Inmobiliarias (Acumulado)" })}
                            className="cursor-pointer hover:underline text-emerald-700 font-bold hover:bg-slate-100 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            ${estadoResultados.comisiones.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500">Ventas Directas</td>
                        <td className="px-4 py-2 text-slate-400 text-[10px]">Traspasos y cierres directos</td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className="px-4 py-2 text-right font-mono text-slate-700">
                            <span
                              onClick={() => setDrillDownConfig({ categoria: "venta", mes: m.mes, titulo: `Ventas Directas (${formatearMes(m.mes)})` })}
                              className="cursor-pointer hover:underline text-emerald-700 font-bold hover:bg-slate-100 rounded px-1.5 py-0.5 -mx-1.5"
                            >
                              ${m.ventasDirectas.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-mono text-slate-700 bg-slate-50/50">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "venta", titulo: "Ventas Directas (Acumulado)" })}
                            className="cursor-pointer hover:underline text-emerald-700 font-bold hover:bg-slate-100 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            ${estadoResultados.ventasDirectas.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500 font-medium">Otros Ingresos</td>
                        <td className="px-4 py-2 text-slate-400 text-[10px]">Otros conceptos financieros</td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className="px-4 py-2 text-right font-mono text-slate-700">
                            <span
                              onClick={() => setDrillDownConfig({ categoria: "otrosIngresos", mes: m.mes, titulo: `Otros Ingresos (${formatearMes(m.mes)})` })}
                              className="cursor-pointer hover:underline text-emerald-700 font-bold hover:bg-slate-100 rounded px-1.5 py-0.5 -mx-1.5"
                            >
                              ${m.otrosIngresos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-mono text-slate-700 bg-slate-50/50">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "otrosIngresos", titulo: "Otros Ingresos (Acumulado)" })}
                            className="cursor-pointer hover:underline text-emerald-700 font-bold hover:bg-slate-100 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            ${estadoResultados.otrosIngresos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>

                      {/* 2. COSTO DE VENTAS */}
                      <tr className="bg-slate-50 border-y border-slate-200 font-bold text-slate-700">
                        <td className="px-4 py-2.5 uppercase tracking-wider text-[10px]" colSpan={2}>
                          2. Costo de Adquisición / Marketing (COGS)
                        </td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className="px-4 py-2.5 text-right font-mono text-rose-600">
                            -${m.totalMarketing.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-mono text-rose-600 bg-slate-50">
                          -${estadoResultados.totalMarketing.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500 font-medium">Inversión en Publicidad Directa</td>
                        <td className="px-4 py-2 text-slate-400 text-[10px]">Meta Ads, TikTok Ads y agencias</td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className="px-4 py-2 text-right font-mono text-rose-600">
                            <span
                              onClick={() => setDrillDownConfig({ categoria: "marketing", mes: m.mes, titulo: `Inversión en Publicidad/Marketing (${formatearMes(m.mes)})` })}
                              className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                            >
                              -${m.totalMarketing.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-mono text-rose-600 bg-slate-50/50">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "marketing", titulo: "Inversión en Publicidad/Marketing (Acumulado)" })}
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.totalMarketing.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>

                      {/* UTILIDAD BRUTA */}
                      <tr className="bg-[#F5F1E8] border-y border-[#E6DEC9] font-extrabold text-[#2D4A2B]">
                        <td className="px-4 py-3 uppercase tracking-wider text-[10px]" colSpan={2}>
                          (=) Utilidad Bruta (Gross Profit)
                        </td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className="px-4 py-3 text-right font-mono text-[12px]">
                            ${m.utilidadBruta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right font-mono text-[13px] bg-[#EBE5D5] text-[#2D4A2B]">
                          ${estadoResultados.utilidadBruta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>

                      {/* 3. GASTOS OPERATIVOS */}
                      <tr className="bg-slate-50 border-y border-slate-200 font-bold text-slate-700">
                        <td className="px-4 py-2.5 uppercase tracking-wider text-[10px]" colSpan={2}>
                          3. Gastos de Operación y Administración (OPEX)
                        </td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className="px-4 py-2.5 text-right font-mono text-rose-600">
                            -${m.totalOpex.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-mono text-rose-600 bg-slate-50">
                          -${estadoResultados.totalOpex.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500">Nóminas y Sueldos</td>
                        <td className="px-4 py-2 text-slate-400 text-[10px]">Salarios y honorarios profesionales fijos</td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className="px-4 py-2 text-right font-mono text-rose-600">
                            <span
                              onClick={() => setDrillDownConfig({ categoria: "nomina", mes: m.mes, titulo: `Nóminas y Sueldos (${formatearMes(m.mes)})` })}
                              className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                            >
                              -${m.nomina.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-mono text-rose-600 bg-slate-50/50">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "nomina", titulo: "Nóminas y Sueldos (Acumulado)" })}
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.nomina.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500">Renta de Oficinas</td>
                        <td className="px-4 py-2 text-slate-400 text-[10px]">Alquileres corporativos</td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className="px-4 py-2 text-right font-mono text-rose-600">
                            <span
                              onClick={() => setDrillDownConfig({ categoria: "renta", mes: m.mes, titulo: `Renta de Oficinas (${formatearMes(m.mes)})` })}
                              className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                            >
                              -${m.renta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-mono text-rose-600 bg-slate-50/50">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "renta", titulo: "Renta de Oficinas (Acumulado)" })}
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.renta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500 font-medium">Servicios Básicos</td>
                        <td className="px-4 py-2 text-slate-400 text-[10px]">Luz, internet, telefonía e insumos</td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className="px-4 py-2 text-right font-mono text-rose-600">
                            <span
                              onClick={() => setDrillDownConfig({ categoria: "servicios", mes: m.mes, titulo: `Servicios Básicos (${formatearMes(m.mes)})` })}
                              className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                            >
                              -${m.servicios.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-mono text-rose-600 bg-slate-50/50">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "servicios", titulo: "Servicios Básicos (Acumulado)" })}
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.servicios.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500 font-medium">Impuestos y Retenciones</td>
                        <td className="px-4 py-2 text-slate-400 text-[10px]">Pagos al SAT y provisiones fiscales</td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className="px-4 py-2 text-right font-mono text-rose-600">
                            <span
                              onClick={() => setDrillDownConfig({ categoria: "impuestos", mes: m.mes, titulo: `Impuestos y Retenciones (${formatearMes(m.mes)})` })}
                              className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                            >
                              -${m.impuestos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-mono text-rose-600 bg-slate-50/50">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "impuestos", titulo: "Impuestos y Retenciones (Acumulado)" })}
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.impuestos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500">Otros Gastos Administrativos</td>
                        <td className="px-4 py-2 text-slate-400 text-[10px]">Cualquier otro gasto de operación menor</td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className="px-4 py-2 text-right font-mono text-rose-600">
                            <span
                              onClick={() => setDrillDownConfig({ categoria: "otrosGastos", mes: m.mes, titulo: `Otros Gastos Administrativos (${formatearMes(m.mes)})` })}
                              className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                            >
                              -${m.otrosGastos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-mono text-rose-600 bg-slate-50/50">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "otrosGastos", titulo: "Otros Gastos Administrativos (Acumulado)" })}
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.otrosGastos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>

                      {/* RESULTADO NETO */}
                      <tr className={`border-y-2 border-slate-900 font-black ${
                        estadoResultados.utilidadNeta >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
                      }`}>
                        <td className="px-4 py-3.5 uppercase tracking-wider text-[11px]" colSpan={2}>
                          (=) Utilidad Neta (Net Income / EBIT)
                        </td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className={`px-4 py-3.5 text-right font-mono text-xs ${
                            m.utilidadNeta >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}>
                            ${m.utilidadNeta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </td>
                        ))}
                        <td className="px-4 py-3.5 text-right font-mono text-sm underline decoration-double bg-slate-100">
                          ${estadoResultados.utilidadNeta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="font-semibold text-slate-500 text-[10px]">
                        <td className="px-4 py-2" colSpan={2}>Margen de Utilidad Neto (%)</td>
                        {PnLMensual.map((m) => (
                          <td key={m.mes} className={`px-4 py-2 text-right font-mono font-bold ${
                            m.margenNeto >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}>
                            {m.margenNeto.toFixed(2)}%
                          </td>
                        ))}
                        <td className={`px-4 py-2 text-right font-mono font-bold bg-slate-50/50 ${
                          estadoResultados.margenNeto >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}>
                          {estadoResultados.margenNeto.toFixed(2)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-xs text-left border-collapse">
                    <tbody>
                      {/* INGRESO BRUTO */}
                      <tr className="bg-slate-50 border-y border-slate-200 font-bold text-[#2D4A2B]">
                        <td className="px-4 py-2.5 uppercase tracking-wider text-[10px]" colSpan={2}>
                          1. Ingresos Operativos (Revenues)
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">
                          ${estadoResultados.totalIngresos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500">Comisiones Inmobiliarias</td>
                        <td className="px-4 py-2 text-slate-400">Ingresos por intermediación de ventas/rentas</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-700">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "comision", titulo: "Comisiones Inmobiliarias" })}
                            className="cursor-pointer hover:underline text-emerald-700 font-bold hover:bg-slate-100 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            ${estadoResultados.comisiones.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500">Ventas Directas</td>
                        <td className="px-4 py-2 text-slate-400">Ingresos directos o traspasos comerciales</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-700">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "venta", titulo: "Ventas Directas" })}
                            className="cursor-pointer hover:underline text-emerald-700 font-bold hover:bg-slate-100 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            ${estadoResultados.ventasDirectas.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500 font-medium">Otros Ingresos</td>
                        <td className="px-4 py-2 text-slate-400">Otros conceptos de entrada financiera</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-700">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "otrosIngresos", titulo: "Otros Ingresos" })}
                            className="cursor-pointer hover:underline text-emerald-700 font-bold hover:bg-slate-100 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            ${estadoResultados.otrosIngresos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>

                      {/* COSTO DE VENTAS */}
                      <tr className="bg-slate-50 border-y border-slate-200 font-bold text-slate-700">
                        <td className="px-4 py-2.5 uppercase tracking-wider text-[10px]" colSpan={2}>
                          2. Costo de Adquisición / Marketing (COGS)
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-rose-600">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "marketing", titulo: "Inversión en Publicidad / Marketing" })}
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.totalMarketing.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500 font-medium">Inversión en Publicidad Directa</td>
                        <td className="px-4 py-2 text-slate-400">Gasto en Meta Ads, TikTok Ads y agencias de medios</td>
                        <td className="px-4 py-2 text-right font-mono text-rose-600">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "marketing", titulo: "Inversión en Publicidad / Marketing" })}
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.totalMarketing.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>

                      {/* UTILIDAD BRUTA */}
                      <tr className="bg-[#F5F1E8] border-y border-[#E6DEC9] font-extrabold text-[#2D4A2B]">
                        <td className="px-4 py-3 uppercase tracking-wider text-[10px]" colSpan={2}>
                          (=) Utilidad Bruta (Gross Profit)
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[13px]">
                          ${estadoResultados.utilidadBruta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>

                      {/* GASTOS OPERATIVOS */}
                      <tr className="bg-slate-50 border-y border-slate-200 font-bold text-slate-700">
                        <td className="px-4 py-2.5 uppercase tracking-wider text-[10px]" colSpan={2}>
                          3. Gastos de Operación y Administración (OPEX)
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-rose-600">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "nomina", titulo: "Gastos Operativos (OPEX)" })} // Default to showing OPEX breakdown (can list all OPEX accounts or default to nomina)
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.totalOpex.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500">Nóminas y Sueldos</td>
                        <td className="px-4 py-2 text-slate-400">Salarios y honorarios profesionales fijos</td>
                        <td className="px-4 py-2 text-right font-mono text-rose-600">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "nomina", titulo: "Nóminas y Sueldos" })}
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.nomina.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500">Renta de Oficinas</td>
                        <td className="px-4 py-2 text-slate-400">Alquileres de sucursales e inmuebles corporativos</td>
                        <td className="px-4 py-2 text-right font-mono text-rose-600">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "renta", titulo: "Renta de Oficinas" })}
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.renta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500 font-medium">Servicios Básicos</td>
                        <td className="px-4 py-2 text-slate-400">Luz, agua, internet, telefonía e insumos de oficina</td>
                        <td className="px-4 py-2 text-right font-mono text-rose-600">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "servicios", titulo: "Servicios Básicos" })}
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.servicios.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500 font-medium">Impuestos y Retenciones</td>
                        <td className="px-4 py-2 text-slate-400">Pagos al SAT y provisiones fiscales</td>
                        <td className="px-4 py-2 text-right font-mono text-rose-600">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "impuestos", titulo: "Impuestos y Retenciones" })}
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.impuestos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 font-medium">
                        <td className="px-8 py-2 text-slate-500">Otros Gastos Administrativos</td>
                        <td className="px-4 py-2 text-slate-400">Cualquier otro gasto de operación menor o misceláneo</td>
                        <td className="px-4 py-2 text-right font-mono text-rose-600">
                          <span
                            onClick={() => setDrillDownConfig({ categoria: "otrosGastos", titulo: "Otros Gastos Administrativos" })}
                            className="cursor-pointer hover:underline text-rose-700 font-bold hover:bg-rose-50 rounded px-1.5 py-0.5 -mx-1.5"
                          >
                            -${estadoResultados.otrosGastos.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>

                      {/* RESULTADO NETO */}
                      <tr className={`border-y-2 border-slate-900 font-black ${
                        estadoResultados.utilidadNeta >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
                      }`}>
                        <td className="px-4 py-3.5 uppercase tracking-wider text-[11px]" colSpan={2}>
                          (=) Utilidad Neta (Net Income / EBIT)
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-sm underline decoration-double">
                          ${estadoResultados.utilidadNeta.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="font-semibold text-slate-500 text-[10px]">
                        <td className="px-4 py-2" colSpan={2}>Margen de Utilidad Neto (%)</td>
                        <td className={`px-4 py-2 text-right font-mono font-bold ${
                          estadoResultados.margenNeto >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}>
                          {estadoResultados.margenNeto.toFixed(2)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          {/* TARJETAS DE KPIS PRINCIPALES (ORGANICO) */}
          <section className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8 animate-in fade-in duration-200">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Seguidores Totales</span>
                <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{organicoKPIs.seguidores.toLocaleString()}</p>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 text-[9px] text-slate-400">
                <span>🔵 FB: {organicoKPIs.desgloseSeguidores.facebook.toLocaleString()}</span>
                <span>📸 IG: {organicoKPIs.desgloseSeguidores.instagram.toLocaleString()}</span>
                <span>🎵 TK: {organicoKPIs.desgloseSeguidores.tiktok.toLocaleString()}</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Publicaciones Orgánicas</span>
                <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{organicoKPIs.publicaciones.toLocaleString()}</p>
              </div>
              <span className="text-[9px] text-slate-400">Contenido creado en periodo</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Visualizaciones Orgánicas</span>
                <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{organicoKPIs.visualizaciones.toLocaleString()}</p>
              </div>
              <span className="text-[9px] text-slate-400">Reproducciones & impresiones</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Interacciones Totales</span>
                <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{organicoKPIs.interacciones.toLocaleString()}</p>
              </div>
              <span className="text-[9px] text-slate-400">Me gusta, comentarios & compartidos</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-[#2D4A2B] transition flex flex-col justify-between h-28">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Engagement Rate Promedio</span>
                <p className="text-xl font-extrabold text-[#2D4A2B] mt-1">{organicoKPIs.engagementRate.toFixed(2)}%</p>
              </div>
              <span className="text-[9px] text-slate-400">Interacciones / Visualizaciones</span>
            </div>
          </section>

          {/* SECCIÓN DE GRÁFICOS ORGÁNICOS */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-4">📈 Crecimiento de Seguidores por Plataforma</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={datosSeguidoresGrafico}>
                    <defs>
                      <linearGradient id="colorFb" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1877F2" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#1877F2" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorIg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#E4405F" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#E4405F" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorTk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#000000" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#000000" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="fecha" stroke="#94A3B8" fontSize={10} />
                    <YAxis stroke="#94A3B8" fontSize={10} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #E2E8F0" }} />
                    <Legend verticalAlign="top" height={36}/>
                    <Area name="Facebook" type="monotone" dataKey="Facebook" stroke="#1877F2" fillOpacity={1} fill="url(#colorFb)" strokeWidth={2} />
                    <Area name="Instagram" type="monotone" dataKey="Instagram" stroke="#E4405F" fillOpacity={1} fill="url(#colorIg)" strokeWidth={2} />
                    <Area name="TikTok" type="monotone" dataKey="TikTok" stroke="#0F172A" fillOpacity={1} fill="url(#colorTk)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] mb-4">🎥 Publicaciones vs Alcance de Video</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={datosContenidoGrafico}>
                    <XAxis dataKey="fecha" stroke="#94A3B8" fontSize={10} />
                    <YAxis yAxisId="left" label={{ value: 'Publicaciones', angle: -90, position: 'insideLeft', style: { fill: '#94A3B8', fontSize: 10 } }} stroke="#94A3B8" fontSize={10} />
                    <YAxis yAxisId="right" orientation="right" label={{ value: 'Visualizaciones', angle: 90, position: 'insideRight', style: { fill: '#94A3B8', fontSize: 10 } }} stroke="#94A3B8" fontSize={10} />
                    <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #E2E8F0" }} />
                    <Legend verticalAlign="top" height={36}/>
                    <Bar yAxisId="left" name="Posts Orgánicos" dataKey="Publicaciones" barSize={20} fill="#2D4A2B" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" name="Views Orgánicos" type="monotone" dataKey="Visualizaciones" stroke="#E4405F" strokeWidth={2} activeDot={{ r: 8 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* BITÁCORA Y HISTORIAL ORGÁNICO */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B]">📖 Bitácora de Métricas Orgánicas</h3>
                <p className="text-xs text-slate-500 mt-0.5">Historial de registros semanales o mensuales para control de evolución orgánica.</p>
              </div>
              <button
                onClick={() => setShowOrganicModal(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#2D4A2B] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1E331D] transition shadow-sm self-start sm:self-center"
              >
                ➕ Registrar Métricas Orgánicas
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-600">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Fecha</th>
                    <th className="px-6 py-3">Plataforma</th>
                    <th className="px-6 py-3 text-right">Seguidores</th>
                    <th className="px-6 py-3 text-right">Publicaciones</th>
                    <th className="px-6 py-3 text-right">Visualizaciones</th>
                    <th className="px-6 py-3 text-right">Interacciones</th>
                    <th className="px-6 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {metricasOrganicas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                        No hay métricas orgánicas registradas en este periodo. Registre su primera métrica para ver los gráficos.
                      </td>
                    </tr>
                  ) : (
                    metricasOrganicas.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-3.5 font-mono">{o.fecha}</td>
                        <td className="px-6 py-3.5">
                          {o.plataforma === "facebook" ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 uppercase">
                              🔵 Facebook
                            </span>
                          ) : o.plataforma === "instagram" ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 uppercase">
                              📸 Instagram
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-800 uppercase">
                              🎵 TikTok
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono">{o.seguidores.toLocaleString()}</td>
                        <td className="px-6 py-3.5 text-right font-mono">{o.publicaciones.toLocaleString()}</td>
                        <td className="px-6 py-3.5 text-right font-mono">{o.visualizaciones.toLocaleString()}</td>
                        <td className="px-6 py-3.5 text-right font-mono">{o.interacciones.toLocaleString()}</td>
                        <td className="px-6 py-3.5 text-center">
                          <button
                            onClick={() => handleEliminarMetricaOrganicaRow(o.id!)}
                            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition"
                            title="Eliminar"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

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

            {/* TABS DE SELECCIÓN DE CANAL */}
            <div className="flex border-b border-slate-100 mb-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSyncTab("facebook")}
                className={`w-1/3 pb-2 text-center transition ${
                  syncTab === "facebook"
                    ? "border-b-2 border-[#2D4A2B] text-[#2D4A2B] font-bold"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                🔵 Meta Ads
              </button>
              <button
                type="button"
                onClick={() => setSyncTab("tiktok")}
                className={`w-1/3 pb-2 text-center transition ${
                  syncTab === "tiktok"
                    ? "border-b-2 border-[#2D4A2B] text-[#2D4A2B] font-bold"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                🎵 TikTok Ads
              </button>
              <button
                type="button"
                onClick={() => setSyncTab("organico")}
                className={`w-1/3 pb-2 text-center transition ${
                  syncTab === "organico"
                    ? "border-b-2 border-[#2D4A2B] text-[#2D4A2B] font-bold"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                📈 Orgánico (Facebook/IG)
              </button>
            </div>

            {syncTab === "facebook" ? (
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
            ) : (
              <form onSubmit={handleSincronizarTikTok} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    TikTok Developer Access Token
                  </label>
                  <textarea
                    value={tkToken}
                    onChange={(e) => setTkToken(e.target.value)}
                    placeholder="Pega tu Access Token de TikTok Developer..."
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-mono h-20 resize-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      ID Anunciante (Advertiser ID)
                    </label>
                    <input
                      type="text"
                      value={tkAdvertiserId}
                      onChange={(e) => setTkAdvertiserId(e.target.value)}
                      placeholder="Ej: 7123456789012345678"
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
                      value={tkFechaInicio}
                      onChange={(e) => setTkFechaInicio(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 leading-normal font-medium">
                  Esta acción descargará día por día los gastos reales de TikTok Ads, filtrará y asociará los leads de TikTok del CRM, y los consolidará en la Torre de Control.
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
                    disabled={sincronizandoTikTok}
                    className="w-1/2 rounded-xl bg-[#2D4A2B] py-2.5 text-xs font-semibold text-[#F5F1E8] hover:bg-[#5C7A52] transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sincronizandoTikTok ? (
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
            )}

            {syncTab === "organico" && (
              <form onSubmit={handleSincronizarOrganicoMeta} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Meta Access Token (con permisos read_insights, instagram_basic)
                  </label>
                  <textarea
                    value={fbToken}
                    onChange={(e) => setFbToken(e.target.value)}
                    placeholder="Escribe o pega tu token de acceso de Facebook Graph API..."
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none min-h-[60px]"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Facebook Page ID
                    </label>
                    <input
                      type="text"
                      value={fbPageId}
                      onChange={(e) => setFbPageId(e.target.value)}
                      placeholder="Ej: 1029384756"
                      className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Días a sincronizar
                    </label>
                    <select
                      value={diasOrganicos}
                      onChange={(e) => setDiasOrganicos(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-semibold text-slate-700 bg-white"
                    >
                      <option value={7}>Últimos 7 días</option>
                      <option value={14}>Últimos 14 días</option>
                      <option value={30}>Últimos 30 días</option>
                    </select>
                  </div>
                </div>

                <p className="text-[10px] text-slate-400 leading-relaxed font-semibold">
                  ⚠️ Esta sincronización busca de manera automática la cuenta de Instagram Business vinculada a tu página de Facebook para descargar las estadísticas acumuladas de ambas redes.
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
                    disabled={sincronizandoOrganico}
                    className="w-1/2 rounded-xl bg-[#2D4A2B] py-2.5 text-xs font-semibold text-[#F5F1E8] hover:bg-[#5C7A52] transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sincronizandoOrganico ? (
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
            )}
          </div>
        </div>
      )}

      {/* MODAL NUEVO REGISTRO MANUAL (FINANZAS) */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
                {editingId ? "✏️ Editar Movimiento Contable" : "➕ Registrar Movimiento Contable"}
              </h3>
              <button 
                onClick={() => {
                  setShowManualModal(false);
                  setEditingId(null);
                  setManualData({
                    fecha: new Date().toISOString().split("T")[0],
                    tipo: "gasto",
                    categoria: "otro",
                    concepto: "",
                    monto: "",
                    expediente_id: "",
                    es_recurrente: false
                  });
                  setIsCustomCategory(false);
                  setCustomCategoryName("");
                }}
                className="text-slate-400 hover:text-[#2D4A2B] text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCrearTransaccionManual} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={manualData.fecha}
                    onChange={(e) => setManualData({ ...manualData, fecha: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Tipo de Movimiento
                  </label>
                  <select
                    value={manualData.tipo}
                    onChange={(e) => {
                      const tipo = e.target.value as "ingreso" | "gasto";
                      const categoria = tipo === "ingreso" ? "venta" : "nomina";
                      setManualData({ ...manualData, tipo, categoria });
                    }}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-semibold text-slate-700 bg-white"
                  >
                    <option value="gasto">🔴 Gasto (Egreso)</option>
                    <option value="ingreso">🟢 Ingreso (Venta/Comisión)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Categoría
                  </label>
                  {isCustomCategory ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customCategoryName}
                        onChange={(e) => setCustomCategoryName(e.target.value)}
                        placeholder="Ej: Mantenimiento"
                        className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCategory(false);
                          setCustomCategoryName("");
                        }}
                        className="text-xs text-slate-400 hover:text-slate-600 px-1 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <select
                      value={manualData.categoria}
                      onChange={(e) => {
                        if (e.target.value === "__NEW__") {
                          setIsCustomCategory(true);
                        } else {
                          setManualData({ ...manualData, categoria: e.target.value });
                        }
                      }}
                      className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-semibold text-slate-700 bg-white"
                    >
                      {(manualData.tipo === "ingreso" ? categoriasIngreso : categoriasGasto).map((cat) => (
                        <option key={cat} value={cat}>
                          {cat.toUpperCase()}
                        </option>
                      ))}
                      <option value="__NEW__">➕ OTRA CATEGORÍA...</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Monto ($ MXN)
                  </label>
                  <input
                    type="number"
                    value={manualData.monto}
                    onChange={(e) => setManualData({ ...manualData, monto: e.target.value })}
                    placeholder="Ej: 15000"
                    min="0"
                    step="0.01"
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Concepto / Detalle
                </label>
                <input
                  type="text"
                  value={manualData.concepto}
                  onChange={(e) => setManualData({ ...manualData, concepto: e.target.value })}
                  placeholder="Ej: Pago de renta mes de junio..."
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Vincular a Expediente CRM (Opcional)
                </label>
                <select
                  value={manualData.expediente_id}
                  onChange={(e) => setManualData({ ...manualData, expediente_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-medium text-slate-700 bg-white"
                >
                  <option value="">-- No vincular --</option>
                  {todosLosExpedientes.map((exp) => (
                    <option key={exp.id} value={exp.id}>
                      {exp.cliente} (Folio: {exp.id})
                    </option>
                  ))}
                </select>
              </div>

              {!isEditingChildTransaction && (
                <div className="flex items-center gap-2 py-1.5">
                  <input
                    type="checkbox"
                    id="es_recurrente"
                    checked={manualData.es_recurrente}
                    onChange={(e) => setManualData({ ...manualData, es_recurrente: e.target.checked })}
                    className="rounded text-[#2D4A2B] focus:ring-[#2D4A2B] h-4 w-4 cursor-pointer"
                  />
                  <label htmlFor="es_recurrente" className="text-xs font-semibold text-slate-700 cursor-pointer select-none">
                    🔁 Movimiento recurrente (se repetirá mensualmente)
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowManualModal(false);
                    setEditingId(null);
                    setManualData({
                      fecha: new Date().toISOString().split("T")[0],
                      tipo: "gasto",
                      categoria: "otro",
                      concepto: "",
                      monto: "",
                      expediente_id: "",
                      es_recurrente: false
                    });
                    setIsCustomCategory(false);
                    setCustomCategoryName("");
                  }}
                  className="w-1/2 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingManual}
                  className="w-1/2 rounded-xl bg-[#2D4A2B] py-2.5 text-xs font-semibold text-[#F5F1E8] hover:bg-[#5C7A52] transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loadingManual ? "Registrando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REGISTRO MANUAL DE MÉTRICAS ORGÁNICAS */}
      {showOrganicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
                📊 Registrar Métricas Orgánicas
              </h3>
              <button 
                onClick={() => setShowOrganicModal(false)}
                className="text-slate-400 hover:text-[#2D4A2B] text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarMetricaOrganica} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Fecha de Registro
                  </label>
                  <input
                    type="date"
                    value={organicData.fecha}
                    onChange={(e) => setOrganicData({ ...organicData, fecha: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-semibold text-slate-700 bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Plataforma
                  </label>
                  <select
                    value={organicData.plataforma}
                    onChange={(e) => setOrganicData({ ...organicData, plataforma: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-semibold text-slate-700 bg-white"
                  >
                    <option value="facebook">🔵 Facebook</option>
                    <option value="instagram">📸 Instagram</option>
                    <option value="tiktok">🎵 TikTok</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Seguidores Totales
                  </label>
                  <input
                    type="number"
                    value={organicData.seguidores}
                    onChange={(e) => setOrganicData({ ...organicData, seguidores: e.target.value })}
                    placeholder="Ej: 15400"
                    min="0"
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Publicaciones Orgánicas (periodo)
                  </label>
                  <input
                    type="number"
                    value={organicData.publicaciones}
                    onChange={(e) => setOrganicData({ ...organicData, publicaciones: e.target.value })}
                    placeholder="Ej: 4"
                    min="0"
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Visualizaciones (Views / Impresiones)
                  </label>
                  <input
                    type="number"
                    value={organicData.visualizaciones}
                    onChange={(e) => setOrganicData({ ...organicData, visualizaciones: e.target.value })}
                    placeholder="Ej: 25000"
                    min="0"
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Interacciones (Likes/Comentarios)
                  </label>
                  <input
                    type="number"
                    value={organicData.interacciones}
                    onChange={(e) => setOrganicData({ ...organicData, interacciones: e.target.value })}
                    placeholder="Ej: 850"
                    min="0"
                    className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOrganicModal(false)}
                  className="w-1/2 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingOrganic}
                  className="w-1/2 rounded-xl bg-[#2D4A2B] py-2.5 text-xs font-semibold text-[#F5F1E8] hover:bg-[#5C7A52] transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loadingOrganic ? "Registrando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPORTADOR DE EXCEL MASIVO (FINANZAS) */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-fraunces text-base font-bold text-[#2D4A2B] flex items-center gap-2">
                📋 Importar Movimientos desde Excel
              </h3>
              <button 
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-[#2D4A2B] text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleImportarExcel} className="space-y-4">
              <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                Copia las columnas de tu Excel y pégalas directamente abajo. El formato debe ser de 5 columnas separadas por tabulaciones (como lo copia Excel por defecto) o por comas:
                <br />
                <span className="font-mono bg-slate-100 text-slate-800 p-1 rounded mt-1.5 block font-bold">
                  Fecha (AAAA-MM-DD) | Tipo (ingreso/gasto) | Categoría | Concepto | Monto
                </span>
                <br />
                Categorías permitidas: <span className="font-mono bg-slate-50 text-[#2D4A2B] p-0.5 rounded">nomina, renta, servicios, marketing, impuestos, venta, comision, otro</span>
              </p>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Datos de Excel (Copia y Pega)
                </label>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="2026-06-01&#9;gasto&#9;renta&#9;Renta Oficina de Junio&#9;12000&#10;2026-06-05&#9;ingreso&#9;comision&#9;Comision Casa Fracc. Ramos&#9;45000"
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-[#2D4A2B] focus:outline-none font-mono h-40 resize-none"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="w-1/2 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingImport}
                  className="w-1/2 rounded-xl bg-[#2D4A2B] py-2.5 text-xs font-semibold text-[#F5F1E8] hover:bg-[#5C7A52] transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loadingImport ? "Procesando importación..." : "Procesar e Importar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DRILL-DOWN DE P&L (CONSULTA DETALLADA) */}
      {drillDownConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="font-fraunces text-lg font-bold text-[#2D4A2B] flex items-center gap-2">
                  🔍 Desglose: {drillDownConfig.titulo}
                </h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  Visualizando e integrando movimientos para el período:{" "}
                  <span className="font-semibold text-slate-600">
                    {drillDownConfig.mes ? formatearMes(drillDownConfig.mes) : "Consolidado total"}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setDrillDownConfig(null)}
                className="text-slate-400 hover:text-[#2D4A2B] text-sm font-bold p-1 hover:bg-slate-100 rounded-lg transition"
              >
                ✕ Cerrar
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pr-1 scrollbar-sutil">
              {/* Resumen o Totalizador */}
              <div className="mb-4 bg-[#F5F1E8] rounded-xl p-4 border border-[#E6DEC9] flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-extrabold text-[#5C7A52] tracking-wider block">Monto Total Sumado</span>
                  <span className="text-xl font-bold font-mono text-[#2D4A2B] block sm:inline">
                    ${(
                      transaccionesDrillDown.reduce((acc, curr) => acc + curr.monto, 0) +
                      marketingMetricasDrillDown.reduce((acc, curr) => acc + (curr.gasto_publicitario || 0), 0)
                    ).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
                  </span>
                </div>
                <div className="text-right text-[11px] text-[#5C7A52] font-semibold">
                  {transaccionesDrillDown.length} movimientos de caja / factura
                  {marketingMetricasDrillDown.length > 0 && ` + ${marketingMetricasDrillDown.length} logs de publicidad`}
                </div>
              </div>

              {/* Sección de Publicidad Directa (Meta/TikTok Ads) */}
              {marketingMetricasDrillDown.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-bold text-slate-700 text-xs mb-2 uppercase tracking-wide">
                    📈 Consumo diario publicitario sincronizado
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[9px] tracking-wider">
                          <th className="px-4 py-2">Fecha</th>
                          <th className="px-4 py-2">Canal / Plataforma</th>
                          <th className="px-4 py-2">Leads Registrados</th>
                          <th className="px-4 py-2 text-right">Impresiones</th>
                          <th className="px-4 py-2 text-right">Clics</th>
                          <th className="px-4 py-2 text-right">Gasto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {marketingMetricasDrillDown.map((m, idx) => (
                          <tr key={idx} className="border-b border-slate-100 font-medium hover:bg-slate-50/50">
                            <td className="px-4 py-2 font-mono text-slate-500">{m.fecha}</td>
                            <td className="px-4 py-2">
                              <span
                                className="inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold text-white uppercase"
                                style={{ backgroundColor: PALETA_CANALES[m.canal.toLowerCase() as keyof typeof PALETA_CANALES] || COLORES.gris }}
                              >
                                {m.canal}
                              </span>
                              {m.campana_nombre && (
                                <span className="text-[10px] text-slate-400 ml-1.5 font-normal">
                                  ({m.campana_nombre})
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-slate-600">{m.leads_registrados_crm} leads</td>
                            <td className="px-4 py-2 text-right font-mono text-slate-600">{m.impresiones.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right font-mono text-slate-600">{m.clics.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right font-mono font-bold text-rose-600">
                              -${(m.gasto_publicitario || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 italic">
                    * Los consumos publicitarios son sincronizados diariamente desde las APIs correspondientes.
                  </p>
                </div>
              )}

              {/* Sección de Movimientos Contables (Transacciones Ledger) */}
              <div>
                <h4 className="font-bold text-slate-700 text-xs mb-2 uppercase tracking-wide">
                  💵 Transacciones del Libro Mayor / Caja
                </h4>
                {transaccionesDrillDown.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No hay transacciones manuales registradas en esta cuenta para el período seleccionado.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-xs text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[9px] tracking-wider">
                          <th className="px-4 py-2.5">Fecha</th>
                          <th className="px-4 py-2.5">Concepto</th>
                          <th className="px-4 py-2.5">Monto</th>
                          <th className="px-4 py-2.5">Cuenta / Categoría (Mover Cuenta)</th>
                          <th className="px-4 py-2.5 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transaccionesDrillDown.map((t) => {
                          const tAny = t as any;
                          return (
                            <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">{t.fecha}</td>
                              <td className="px-4 py-2.5">
                                <div className="font-bold text-slate-800">{t.concepto}</div>
                                {t.expediente_id && tAny.cliente && (
                                  <div className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1 mt-0.5">
                                    <span>👤 CRM:</span>
                                    <span>{tAny.cliente} (Folio: {t.expediente_id})</span>
                                  </div>
                                )}
                                {t.es_recurrente && (
                                  <span className="inline-block bg-[#F5F1E8] text-[#2D4A2B] text-[8px] px-1 py-0.2 rounded mt-0.5 font-extrabold uppercase tracking-wide">
                                    Recurrente 🔁
                                  </span>
                                )}
                              </td>
                              <td className={`px-4 py-2.5 font-mono font-bold whitespace-nowrap ${
                                t.tipo === "ingreso" ? "text-emerald-600" : "text-rose-600"
                              }`}>
                                {t.tipo === "ingreso" ? "+" : "-"}${t.monto.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-2.5">
                                <select
                                  value={t.categoria}
                                  disabled={updatingTxId === t.id}
                                  onChange={(e) => handleCambiarCategoriaDrillDown(t.id!, e.target.value)}
                                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-semibold focus:outline-none focus:border-[#2D4A2B] w-full"
                                >
                                  {(t.tipo === "ingreso" ? categoriasIngreso : categoriasGasto).map((cat) => (
                                    <option key={cat} value={cat}>
                                      {cat.toUpperCase()}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <button
                                  onClick={() => handleEliminarTransaccionDrillDown(t.id!)}
                                  disabled={updatingTxId === t.id}
                                  className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 p-1.5 rounded-lg transition"
                                  title="Eliminar registro"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 mt-4 text-right">
              <button
                onClick={() => setDrillDownConfig(null)}
                className="bg-slate-100 hover:bg-slate-200 text-[#0F172A] font-bold text-xs px-5 py-2.5 rounded-xl transition shadow-sm"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

