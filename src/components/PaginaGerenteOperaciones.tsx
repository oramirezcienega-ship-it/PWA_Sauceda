"use client";

import React, { useState, useEffect, useTransition } from "react";
import Head from "next/head";
import { Shell } from "@/components/Shell";
import {
  obtenerAlertasOperaciones,
  actualizarEstatusAlerta,
  obtenerOptimizacionesBacklog,
  actualizarEstatusOptimizacion,
  aplicarOptimizacionParche,
  ejecutarAuditoriaServidor,
  type AlertaOperacion,
  type OptimizacionBacklog,
} from "@/app/actions/gerente";
import { listarFlujosBPM, guardarFlujoBPM } from "@/app/actions/bpm";

export default function PaginaGerenteOperaciones() {
  const [pestana, setPestana] = useState<"alertas" | "backlog" | "procesos">("alertas");
  const [alertas, setAlertas] = useState<AlertaOperacion[]>([]);
  const [backlog, setBacklog] = useState<OptimizacionBacklog[]>([]);
  const [flujosBpm, setFlujosBpm] = useState<any[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [exitoMsg, setExitoMsg] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  // Estados para el editor BPM
  const [editandoFlujo, setEditandoFlujo] = useState<string | null>(null); // 'nuevo' o flujo_id
  const [tipoNegocioEdit, setTipoNegocioEdit] = useState("");
  const [pasosEdit, setPasosEdit] = useState<any[]>([]);
  const [guardandoFlujo, setGuardandoFlujo] = useState(false);

  // Filtros
  const [filtroAlertaEstatus, setFiltroAlertaEstatus] = useState<string>("todos");
  const [filtroAlertaPrioridad, setFiltroAlertaPrioridad] = useState<string>("todos");
  const [filtroBacklogEstatus, setFiltroBacklogEstatus] = useState<string>("todos");
  const [modalCodigo, setModalCodigo] = useState<OptimizacionBacklog | null>(null);

  // Helpers para manipulación de pasos BPM
  const handleAgregarPaso = () => {
    setPasosEdit((prev) => [
      ...prev,
      {
        etapa: "visita",
        tituloTarea: "",
        descripcion: "",
        rolResponsable: "asesor",
        diasVencimiento: 3,
        condicionActivacion: "inmediato"
      }
    ]);
  };

  const handleMoverPaso = (index: number, direccion: number) => {
    const nuevosPasos = [...pasosEdit];
    const temp = nuevosPasos[index];
    nuevosPasos[index] = nuevosPasos[index + direccion];
    nuevosPasos[index + direccion] = temp;
    setPasosEdit(nuevosPasos);
  };

  const handleEliminarPaso = (index: number) => {
    setPasosEdit((prev) => prev.filter((_, i) => i !== index));
  };

  const handleActualizarPaso = (index: number, campo: string, valor: any) => {
    setPasosEdit((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [campo]: valor } : p))
    );
  };

  const handleEditarFlujoClick = (flujo: any) => {
    setEditandoFlujo(flujo.id);
    setTipoNegocioEdit(flujo.tipoNegocio);
    setPasosEdit(flujo.pasos);
  };

  const handleNuevoFlujoClick = () => {
    setEditandoFlujo("nuevo");
    setTipoNegocioEdit("");
    setPasosEdit([]);
  };

  const handleGuardarFlujo = async () => {
    setGuardandoFlujo(true);
    setErrorMsg("");
    setExitoMsg("");
    try {
      await guardarFlujoBPM(tipoNegocioEdit, pasosEdit);
      setExitoMsg("Flujo de trabajo guardado exitosamente.");
      setEditandoFlujo(null);
      await cargarDatos();
    } catch (err: any) {
      setErrorMsg("Error al guardar el flujo: " + err.message);
    } finally {
      setGuardandoFlujo(false);
    }
  };

  const cargarDatos = async () => {
    setCargando(true);
    setErrorMsg("");
    try {
      const [resAlertas, resBacklog, resFlujos] = await Promise.all([
        obtenerAlertasOperaciones(),
        obtenerOptimizacionesBacklog(),
        listarFlujosBPM(),
      ]);
      setAlertas(resAlertas);
      setBacklog(resBacklog);
      setFlujosBpm(resFlujos);
    } catch (err: any) {
      console.error("Error al cargar datos del Gerente de Operaciones:", err);
      setErrorMsg(err.message || "No se pudieron obtener los datos de operaciones.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const handleEjecutarAuditoria = () => {
    startTransition(async () => {
      try {
        setErrorMsg("");
        setExitoMsg("");
        const res = await ejecutarAuditoriaServidor();
        setExitoMsg(`Auditoria completada. ${res.alertasGeneradas} nuevas alertas detectadas.`);
        await cargarDatos();
      } catch (err: any) {
        setErrorMsg(`Error en auditoria: ${err.message}`);
      }
    });
  };

  const handleCambiarEstatusAlerta = (id: string, nuevoEstatus: "pendiente" | "en_revision" | "resuelta" | "descartada") => {
    startTransition(async () => {
      try {
        await actualizarEstatusAlerta(id, nuevoEstatus);
        setAlertas((prev) =>
          prev.map((a) => (a.id === id ? { ...a, estatus: nuevoEstatus } : a))
        );
        setExitoMsg(`Estatus de alerta actualizado a '${nuevoEstatus}'.`);
      } catch (err: any) {
        setErrorMsg(`Error actualizando alerta: ${err.message}`);
      }
    });
  };

  const handleCambiarEstatusOptimizacion = (id: string, nuevoEstatus: "propuesto" | "aprobado" | "rechazado") => {
    startTransition(async () => {
      try {
        await actualizarEstatusOptimizacion(id, nuevoEstatus);
        setBacklog((prev) =>
          prev.map((b) => (b.id === id ? { ...b, estatus: nuevoEstatus } : b))
        );
        setExitoMsg(`Propuesta ${nuevoEstatus === "aprobado" ? "APROBADA" : "RECHAZADA"} exitosamente.`);
      } catch (err: any) {
        setErrorMsg(`Error al cambiar estatus: ${err.message}`);
      }
    });
  };

  const handleAplicarParche = (id: string) => {
    startTransition(async () => {
      try {
        setErrorMsg("");
        setExitoMsg("Aplicando parche de código...");
        const res = await aplicarOptimizacionParche(id);
        setExitoMsg(res.mensaje);
        await cargarDatos();
      } catch (err: any) {
        setErrorMsg(`Error al aplicar parche: ${err.message}`);
      }
    });
  };

  // Filtrado de alertas
  const alertasFiltradas = alertas.filter((a) => {
    if (filtroAlertaEstatus !== "todos" && a.estatus !== filtroAlertaEstatus) return false;
    if (filtroAlertaPrioridad !== "todos" && a.prioridad !== filtroAlertaPrioridad) return false;
    return true;
  });

  // Filtrado de backlog
  const backlogFiltrado = backlog.filter((b) => {
    if (filtroBacklogEstatus !== "todos" && b.estatus !== filtroBacklogEstatus) return false;
    return true;
  });

  // Métricas rápidas
  const alertasCriticas = alertas.filter((a) => a.prioridad === "critica" || a.prioridad === "alta").length;
  const alertasPendientes = alertas.filter((a) => a.estatus === "pendiente").length;
  const propuestasPendientes = backlog.filter((b) => b.estatus === "propuesto").length;
  const parchesAplicados = backlog.filter((b) => b.estatus === "aplicado").length;

  return (
    <Shell>
      <Head>
        <title>Agente Gerente de Operaciones | SAUCEDA</title>
      </Head>

      <div className="min-h-screen bg-[#0F172A] text-slate-100 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Header Superior */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/80 backdrop-blur border border-slate-700/60 p-6 rounded-2xl shadow-2xl">
            <div>
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-2xl">
                  🤖
                </span>
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                    Agente Gerente de Operaciones
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      Activo ⚡
                    </span>
                  </h1>
                  <p className="text-sm text-slate-400 mt-1">
                    Auditoría continua de base de datos, resolución de cuellos de botella y generación autónoma de parches de código.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={cargarDatos}
                disabled={cargando || isPending}
                className="px-4 py-2.5 bg-slate-700/60 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-2 border border-slate-600/50"
              >
                <span>🔄</span> Actualizar
              </button>
              <button
                onClick={handleEjecutarAuditoria}
                disabled={cargando || isPending}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 disabled:opacity-50"
              >
                {isPending ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <span>🚀</span>
                )}
                Ejecutar Auditoría Ahora
              </button>
            </div>
          </div>

          {/* Mensajes de notificación */}
          {exitoMsg && (
            <div className="p-4 bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 rounded-xl text-sm flex items-center justify-between shadow-lg">
              <span className="flex items-center gap-2">
                <span>✅</span> {exitoMsg}
              </span>
              <button onClick={() => setExitoMsg("")} className="text-xs text-emerald-400 hover:underline">
                Cerrar
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-4 bg-rose-950/80 border border-rose-500/40 text-rose-200 rounded-xl text-sm flex items-center justify-between shadow-lg">
              <span className="flex items-center gap-2">
                <span>⚠️</span> {errorMsg}
              </span>
              <button onClick={() => setErrorMsg("")} className="text-xs text-rose-400 hover:underline">
                Cerrar
              </button>
            </div>
          )}

          {/* Tarjetas de Métricas / KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl shadow-lg">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Alertas Pendientes</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-extrabold text-amber-400">{alertasPendientes}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-semibold border border-amber-500/30">
                  En cola
                </span>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl shadow-lg">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prioridad Crítica / Alta</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-extrabold text-rose-400">{alertasCriticas}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 font-semibold border border-rose-500/30">
                  Atención urgente
                </span>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl shadow-lg">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Propuestas por Aprobar</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-extrabold text-cyan-400">{propuestasPendientes}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-semibold border border-cyan-500/30">
                  Backlog IA
                </span>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-2xl shadow-lg">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Parches Aplicados</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-extrabold text-emerald-400">{parchesAplicados}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-semibold border border-emerald-500/30">
                  Código optimizado
                </span>
              </div>
            </div>
          </div>

          {/* Navegación por pestañas */}
          <div className="flex border-b border-slate-700/80 gap-4">
            <button
              onClick={() => setPestana("alertas")}
              className={`pb-3 px-2 text-sm font-bold transition border-b-2 flex items-center gap-2 ${
                pestana === "alertas"
                  ? "border-emerald-400 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>🚨</span> Alertas de Operaciones ({alertas.length})
            </button>
            <button
              onClick={() => setPestana("backlog")}
              className={`pb-3 px-2 text-sm font-bold transition border-b-2 flex items-center gap-2 ${
                pestana === "backlog"
                  ? "border-emerald-400 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>🛠️</span> Backlog de Optimizaciones ({backlog.length})
            </button>
            <button
              onClick={() => setPestana("procesos")}
              className={`pb-3 px-2 text-sm font-bold transition border-b-2 flex items-center gap-2 ${
                pestana === "procesos"
                  ? "border-emerald-400 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>📋</span> Procesos por Producto ({flujosBpm.length})
            </button>
          </div>

          {/* Seccion 1: Alertas Operativas */}
          {pestana === "alertas" && (
            <div className="space-y-4">
              {/* Filtros Alertas */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400 uppercase">Estatus:</span>
                  <select
                    value={filtroAlertaEstatus}
                    onChange={(e) => setFiltroAlertaEstatus(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="todos">Todos</option>
                    <option value="pendiente">Pendientes</option>
                    <option value="en_revision">En Revisión</option>
                    <option value="resuelta">Resueltas</option>
                    <option value="descartada">Descartadas</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400 uppercase">Prioridad:</span>
                  <select
                    value={filtroAlertaPrioridad}
                    onChange={(e) => setFiltroAlertaPrioridad(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="todos">Todas</option>
                    <option value="critica">Crítica</option>
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
              </div>

              {cargando ? (
                <div className="p-12 text-center text-slate-400">
                  <span className="animate-spin text-2xl inline-block mb-2">⏳</span>
                  <p className="text-xs">Cargando alertas de operaciones...</p>
                </div>
              ) : alertasFiltradas.length === 0 ? (
                <div className="p-12 text-center bg-slate-800/30 border border-slate-700/40 rounded-2xl">
                  <span className="text-3xl">🎉</span>
                  <h3 className="text-base font-bold text-slate-200 mt-2">Sin alertas activas</h3>
                  <p className="text-xs text-slate-400 mt-1">No hay alertas con los filtros seleccionados.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {alertasFiltradas.map((alerta) => (
                    <div
                      key={alerta.id}
                      className="bg-slate-800/80 border border-slate-700/70 hover:border-slate-600 p-5 rounded-2xl shadow-xl transition space-y-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                                alerta.prioridad === "critica"
                                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                  : alerta.prioridad === "alta"
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                              }`}
                            >
                              {alerta.prioridad}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 uppercase">
                              {alerta.tipo}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-white">{alerta.titulo}</h3>
                        </div>

                        <span
                          className={`text-xs font-bold px-3 py-1 rounded-full border ${
                            alerta.estatus === "pendiente"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              : alerta.estatus === "en_revision"
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                              : alerta.estatus === "resuelta"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-slate-700 text-slate-400 border-slate-600"
                          }`}
                        >
                          {alerta.estatus.replace("_", " ").toUpperCase()}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">{alerta.descripcion}</p>

                      {alerta.sugerencia_ia && (
                        <div className="p-3 bg-slate-900/80 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-start gap-2">
                          <span>💡</span>
                          <div>
                            <strong className="block text-emerald-400 text-[11px]">Sugerencia del Agente IA:</strong>
                            {alerta.sugerencia_ia}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                        <span className="text-[11px] text-slate-500 font-mono">
                          {new Date(alerta.created_at).toLocaleString("es-MX")}
                        </span>

                        <div className="flex items-center gap-2">
                          {alerta.estatus !== "en_revision" && (
                            <button
                              onClick={() => handleCambiarEstatusAlerta(alerta.id, "en_revision")}
                              className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 rounded-lg text-xs font-semibold transition"
                            >
                              En Revisión
                            </button>
                          )}
                          {alerta.estatus !== "resuelta" && (
                            <button
                              onClick={() => handleCambiarEstatusAlerta(alerta.id, "resuelta")}
                              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold transition"
                            >
                              Resolver
                            </button>
                          )}
                          {alerta.estatus !== "descartada" && (
                            <button
                              onClick={() => handleCambiarEstatusAlerta(alerta.id, "descartada")}
                              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-semibold transition"
                            >
                              Descartar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Seccion 2: Backlog de Optimizaciones */}
          {pestana === "backlog" && (
            <div className="space-y-4">
              {/* Filtros Backlog */}
              <div className="flex items-center justify-between bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400 uppercase">Estatus:</span>
                  <select
                    value={filtroBacklogEstatus}
                    onChange={(e) => setFiltroBacklogEstatus(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="todos">Todos</option>
                    <option value="propuesto">Propuestos</option>
                    <option value="aprobado">Aprobados</option>
                    <option value="aplicado">Aplicados</option>
                    <option value="rechazado">Rechazados</option>
                    <option value="fallido">Fallidos</option>
                  </select>
                </div>
              </div>

              {cargando ? (
                <div className="p-12 text-center text-slate-400">
                  <span className="animate-spin text-2xl inline-block mb-2">⏳</span>
                  <p className="text-xs">Cargando backlog de optimizaciones...</p>
                </div>
              ) : backlogFiltrado.length === 0 ? (
                <div className="p-12 text-center bg-slate-800/30 border border-slate-700/40 rounded-2xl">
                  <span className="text-3xl">📦</span>
                  <h3 className="text-base font-bold text-slate-200 mt-2">Backlog Limpio</h3>
                  <p className="text-xs text-slate-400 mt-1">No hay propuestas con los filtros seleccionados.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {backlogFiltrado.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-800/80 border border-slate-700/70 hover:border-slate-600 p-5 rounded-2xl shadow-xl transition space-y-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono bg-slate-900 px-2 py-0.5 rounded text-cyan-400 border border-cyan-500/30">
                              📄 {item.archivo_destino}
                            </span>
                            <span className="text-[10px] uppercase font-bold text-slate-400">
                              {item.categoria}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-white">{item.titulo}</h3>
                        </div>

                        <span
                          className={`text-xs font-bold px-3 py-1 rounded-full border ${
                            item.estatus === "propuesto"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              : item.estatus === "aprobado"
                              ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                              : item.estatus === "aplicado"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : item.estatus === "rechazado"
                              ? "bg-slate-700 text-slate-400 border-slate-600"
                              : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                          }`}
                        >
                          {item.estatus.toUpperCase()}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">{item.descripcion}</p>

                      {/* Vista previa de código */}
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto relative">
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
                          <span className="text-[10px] text-slate-500">Propuesta de Parche de Código</span>
                          <button
                            onClick={() => setModalCodigo(item)}
                            className="text-[10px] text-emerald-400 hover:underline"
                          >
                            Expandir Código
                          </button>
                        </div>
                        <pre className="text-emerald-300/90 whitespace-pre-wrap max-h-36 overflow-y-auto text-[11px]">
                          {item.codigo_propuesto}
                        </pre>
                      </div>

                      {item.resultado_aplicacion && (
                        <div className="p-3 bg-slate-900 border border-slate-700/80 rounded-xl text-xs font-mono text-slate-300">
                          <strong>Resultado:</strong> {item.resultado_aplicacion}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                        <span className="text-[11px] text-slate-500 font-mono">
                          Creado por {item.creado_por} • {new Date(item.created_at).toLocaleDateString("es-MX")}
                        </span>

                        <div className="flex items-center gap-2">
                          {item.estatus === "propuesto" && (
                            <>
                              <button
                                onClick={() => handleCambiarEstatusOptimizacion(item.id, "aprobado")}
                                className="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-semibold transition"
                              >
                                Aprobar
                              </button>
                              <button
                                onClick={() => handleCambiarEstatusOptimizacion(item.id, "rechazado")}
                                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-semibold transition"
                              >
                                Rechazar
                              </button>
                            </>
                          )}

                          {item.estatus === "aprobado" && (
                            <button
                              onClick={() => handleAplicarParche(item.id)}
                              disabled={isPending}
                              className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-bold transition shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
                            >
                              <span>⚡</span> Aplicar Parche Ahora
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Seccion 3: Procesos por Producto (BPM) */}
          {pestana === "procesos" && (
            <div className="space-y-6">
              {editandoFlujo !== null ? (
                /* VISTA EDITOR DE FLUJO */
                <div className="bg-slate-800/80 border border-slate-700/70 p-6 rounded-2xl shadow-xl space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <span>⚙️</span> {editandoFlujo === "nuevo" ? "Crear Nuevo Proceso" : "Editar Proceso"}
                    </h3>
                    <button
                      onClick={() => setEditandoFlujo(null)}
                      className="px-3.5 py-1.5 bg-slate-750 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition border border-slate-600/55"
                    >
                      ✕ Cancelar
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Servicio / Tipo de Negocio:
                      </label>
                      <select
                        value={tipoNegocioEdit}
                        disabled={editandoFlujo !== "nuevo"}
                        onChange={(e) => setTipoNegocioEdit(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl p-3 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                      >
                        <option value="">Selecciona un producto...</option>
                        <option value="traspaso_compra">Traspaso / Compra</option>
                        <option value="promocion_venta">Promoción de Venta</option>
                        <option value="solo_tramite">Solo Trámite</option>
                        <option value="construccion-remodelacion">Remodelación</option>
                        <option value="construccion-impermeabilizacion">Impermeabilización</option>
                        <option value="construccion">Construcción / Obra (General)</option>
                      </select>
                    </div>

                    <div className="space-y-4 pt-4">
                      <div className="flex items-center justify-between border-t border-slate-700/60 pt-4">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pasos del Flujo:</span>
                        <button
                          type="button"
                          onClick={handleAgregarPaso}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1"
                        >
                          ➕ Agregar Paso
                        </button>
                      </div>

                      {pasosEdit.length === 0 ? (
                        <p className="text-xs text-slate-500 italic text-center py-4">No hay pasos creados en este flujo. Agrega uno nuevo arriba.</p>
                      ) : (
                        <div className="space-y-4">
                          {pasosEdit.map((paso, idx) => (
                            <div key={idx} className="bg-slate-900/50 border border-slate-700/50 p-4 rounded-xl space-y-3 relative">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <span className="text-xs font-bold text-indigo-400">Paso #{idx + 1}</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => handleMoverPaso(idx, -1)}
                                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-xs disabled:opacity-30"
                                    title="Subir"
                                  >
                                    ⬆️
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === pasosEdit.length - 1}
                                    onClick={() => handleMoverPaso(idx, 1)}
                                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-xs disabled:opacity-30"
                                    title="Bajar"
                                  >
                                    ⬇️
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEliminarPaso(idx)}
                                    className="p-1 hover:bg-rose-950/40 text-rose-400 rounded text-xs border border-rose-500/20 hover:border-rose-500/40 transition px-2"
                                    title="Eliminar paso"
                                  >
                                    🗑️ Eliminar
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Título de la Tarea:</label>
                                  <input
                                    type="text"
                                    value={paso.tituloTarea}
                                    onChange={(e) => handleActualizarPaso(idx, "tituloTarea", e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500"
                                    placeholder="Ej: Subir presupuesto técnico"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Etapa del CRM Asociada:</label>
                                  <select
                                    value={paso.etapa}
                                    onChange={(e) => handleActualizarPaso(idx, "etapa", e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500"
                                  >
                                    <option value="captacion">Captación</option>
                                    <option value="analisis">Análisis y Validación</option>
                                    <option value="documentacion">Integración de Expediente</option>
                                    <option value="visita">Visita Técnica</option>
                                    <option value="cotizacion">Cotización en preparación</option>
                                    <option value="propuesta-aceptada">Propuesta Aceptada</option>
                                    <option value="firma">Firma de Contrato</option>
                                    <option value="pago">Trámite de Pago</option>
                                    <option value="entregado">Entregado</option>
                                  </select>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Rol Responsable:</label>
                                  <select
                                    value={paso.rolResponsable}
                                    onChange={(e) => handleActualizarPaso(idx, "rolResponsable", e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500"
                                  >
                                    <option value="asesor">Asesor</option>
                                    <option value="operaciones">Operaciones</option>
                                    <option value="tecnico">Técnico</option>
                                    <option value="admin">Administrador</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Días Límite:</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={paso.diasVencimiento}
                                    onChange={(e) => handleActualizarPaso(idx, "diasVencimiento", parseInt(e.target.value, 10) || 3)}
                                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Desencadenante de Activación:</label>
                                  <select
                                    value={paso.condicionActivacion}
                                    onChange={(e) => handleActualizarPaso(idx, "condicionActivacion", e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500"
                                  >
                                    <option value="inmediato">Inmediato (Al entrar a la etapa)</option>
                                    <option value="visita_tecnica_concluida">Al concluir reporte de visita técnica</option>
                                    <option value="cotizacion_conceptos_guardada">Al guardar conceptos de cotización</option>
                                    {pasosEdit.slice(0, idx).map((prev: any, prevIdx: number) => (
                                      <option key={prevIdx} value={prev.tituloTarea}>
                                        Al completar Paso #{prevIdx + 1}: "{prev.tituloTarea}"
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Descripción de la Tarea:</label>
                                <textarea
                                  value={paso.descripcion || ""}
                                  onChange={(e) => handleActualizarPaso(idx, "descripcion", e.target.value)}
                                  rows={2}
                                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500"
                                  placeholder="Describe brevemente de qué trata esta tarea operativa..."
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-slate-700/60">
                      <button
                        type="button"
                        onClick={() => setEditandoFlujo(null)}
                        className="px-4 py-2.5 bg-slate-750 hover:bg-slate-700 border border-slate-600/50 text-slate-300 rounded-xl text-xs font-bold transition"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={guardandoFlujo || !tipoNegocioEdit || pasosEdit.length === 0}
                        onClick={handleGuardarFlujo}
                        className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition"
                      >
                        {guardandoFlujo ? "Guardando..." : "💾 Guardar Flujo de Trabajo"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* VISTA LISTADO DE FLUJOS */
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Flujos BPM Registrados</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Define los pasos operacionales automáticos para cada tipo de servicio.</p>
                    </div>
                    <button
                      onClick={handleNuevoFlujoClick}
                      className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition flex items-center gap-2"
                    >
                      ➕ Crear Nuevo Proceso
                    </button>
                  </div>

                  {cargando ? (
                    <div className="p-12 text-center text-slate-400">
                      <span className="animate-spin text-2xl inline-block mb-2">⏳</span>
                      <p className="text-xs">Cargando flujos de procesos...</p>
                    </div>
                  ) : flujosBpm.length === 0 ? (
                    <div className="p-12 text-center bg-slate-800/30 border border-slate-700/40 rounded-2xl">
                      <span className="text-3xl">📋</span>
                      <h3 className="text-base font-bold text-slate-200 mt-2">Sin Procesos Configurados</h3>
                      <p className="text-xs text-slate-400 mt-1">No se encontraron flujos de trabajo en la base de datos.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {flujosBpm.map((flujo) => (
                        <div key={flujo.id} className="bg-slate-800/60 border border-slate-700/60 p-6 rounded-2xl shadow-xl space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                            <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                              <span>📁</span> {flujo.tipoNegocio}
                            </h3>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEditarFlujoClick(flujo)}
                                className="text-xs font-bold px-3 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 transition"
                              >
                                ✏️ Editar
                              </button>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                Activo ⚡
                              </span>
                            </div>
                          </div>

                          <div className="space-y-4 relative pl-4 before:content-[''] before:absolute before:left-[21px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-700">
                            {flujo.pasos.map((paso: any) => (
                              <div key={paso.id} className="relative flex items-start gap-4">
                                {/* Orden Circle */}
                                <div className="z-10 flex items-center justify-center h-5 w-5 rounded-full bg-indigo-500 border-2 border-slate-800 text-[9px] font-black text-white shrink-0 mt-0.5">
                                  {paso.orden}
                                </div>

                                <div className="bg-slate-900/50 border border-slate-700/50 p-4 rounded-xl flex-1 space-y-2">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <h4 className="text-sm font-bold text-slate-200">{paso.tituloTarea}</h4>
                                    <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                      {paso.rolResponsable}
                                    </span>
                                  </div>
                                  {paso.descripcion && (
                                    <p className="text-xs text-slate-400 leading-relaxed">{paso.descripcion}</p>
                                  )}
                                  <div className="flex items-center gap-4 text-[10px] text-slate-500 font-medium">
                                    <span>⏳ Límite: {paso.diasVencimiento} días</span>
                                    {paso.condicionActivacion !== "inmediato" && (
                                      <span className="text-amber-500/80">🔒 Espera a: "{paso.condicionActivacion}"</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Modal de Código Completo */}
          {modalCodigo && (
            <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">{modalCodigo.titulo}</h3>
                    <p className="text-xs font-mono text-cyan-400 mt-0.5">{modalCodigo.archivo_destino}</p>
                  </div>
                  <button
                    onClick={() => setModalCodigo(null)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg text-lg"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs max-h-[400px] overflow-y-auto">
                  <pre className="text-emerald-300 leading-relaxed whitespace-pre-wrap">
                    {modalCodigo.codigo_propuesto}
                  </pre>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setModalCodigo(null)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-700"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </Shell>
  );
}
