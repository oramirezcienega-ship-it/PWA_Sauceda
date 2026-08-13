"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ProyectoConsejo,
  AsesorConsejo,
  AlternativaConsejo,
  actualizarProyecto,
  eliminarProyecto,
  guardarAsesores,
  actualizarAlternativa,
  obtenerAlternativas,
} from "@/app/actions/consejo";

interface DetalleProyectoProps {
  proyecto: ProyectoConsejo;
  asesores: AsesorConsejo[];
  alternativasIniciales: AlternativaConsejo[];
}

export function DetalleProyecto({
  proyecto: proyectoInicial,
  asesores: asesoresIniciales,
  alternativasIniciales,
}: DetalleProyectoProps) {
  const router = useRouter();
  const [proyecto, setProyecto] = useState<ProyectoConsejo>(proyectoInicial);
  const [asesores, setAsesores] = useState<AsesorConsejo[]>(asesoresIniciales);
  const [alternativas, setAlternativas] = useState<AlternativaConsejo[]>(alternativasIniciales);

  // Edición del proyecto
  const [nombreProj, setNombreProj] = useState(proyecto.name);
  const [contextoProj, setContextoProj] = useState(proyecto.context);
  const [statusProj, setStatusProj] = useState(proyecto.status);
  const [isPendingProj, startTransitionProj] = useTransition();
  const [mensajeProj, setMensajeProj] = useState({ text: "", type: "" });

  // Edición de especialistas
  const [listaAsesores, setListaAsesores] = useState<AsesorConsejo[]>(asesores);
  const [isPendingAsesores, startTransitionAsesores] = useTransition();
  const [mensajeAsesores, setMensajeAsesores] = useState({ text: "", type: "" });

  // Estado de las notas administrativas
  const [notasAlt, setNotasAlt] = useState<Record<string, string>>({});
  const [isPendingNotes, setIsPendingNotes] = useState<Record<string, boolean>>({});

  // Modal de consulta
  const [modalConsulta, setModalConsulta] = useState(false);
  const [preguntaConsulta, setPreguntaConsulta] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [streamStatus, setStreamStatus] = useState("");

  // Detalle de streaming en vivo
  const [streamingAdvisors, setStreamingAdvisors] = useState<
    Record<string, { status: "esperando" | "analizando" | "completado" | "error"; opinion: string }>
  >({});
  const [streamingVerdict, setStreamingVerdict] = useState<{
    status: "esperando" | "analizando" | "completado" | "error";
    verdict: string;
  }>({ status: "esperando", verdict: "" });

  // Acordeones abiertos para alternativas
  const [alternativasAbiertas, setAlternativasAbiertas] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Inicializar notas administrativas de alternativas
    const initialNotes: Record<string, string> = {};
    alternativas.forEach((alt) => {
      initialNotes[alt.id] = alt.admin_notes || "";
    });
    setNotasAlt(initialNotes);
  }, [alternativas]);

  // Guardar cambios generales del proyecto
  const handleGuardarProyecto = (e: React.FormEvent) => {
    e.preventDefault();
    setMensajeProj({ text: "", type: "" });
    startTransitionProj(async () => {
      try {
        const actualizado = await actualizarProyecto(proyecto.id, {
          name: nombreProj,
          context: contextoProj,
          status: statusProj,
        });
        setProyecto(actualizado);
        setMensajeProj({ text: "Proyecto actualizado con éxito.", type: "success" });
      } catch (err) {
        setMensajeProj({
          text: err instanceof Error ? err.message : "Error al actualizar.",
          type: "error",
        });
      }
    });
  };

  // Eliminar proyecto
  const handleEliminarProyecto = async () => {
    if (confirm("¿Estás seguro de que deseas eliminar este proyecto y todas sus consultas? Esta acción es irreversible.")) {
      try {
        await eliminarProyecto(proyecto.id);
        router.push("/consejo");
      } catch (err) {
        alert(err instanceof Error ? err.message : "Error al eliminar proyecto.");
      }
    }
  };

  // Guardar especialistas
  const handleGuardarAsesores = (e: React.FormEvent) => {
    e.preventDefault();
    setMensajeAsesores({ text: "", type: "" });
    startTransitionAsesores(async () => {
      try {
        const datosAsesores = listaAsesores.map((a) => ({
          id: a.id,
          enabled: a.enabled,
          prompt: a.prompt,
        }));
        await guardarAsesores(proyecto.id, datosAsesores);
        setAsesores(listaAsesores);
        setMensajeAsesores({ text: "Consejo de especialistas guardado.", type: "success" });
      } catch (err) {
        setMensajeAsesores({
          text: err instanceof Error ? err.message : "Error al guardar.",
          type: "error",
        });
      }
    });
  };

  // Modificar habilitación de un asesor
  const toggleAsesor = (idx: number) => {
    setListaAsesores((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, enabled: !a.enabled } : a))
    );
  };

  // Modificar prompt de un asesor
  const changePromptAsesor = (idx: number, prompt: string) => {
    setListaAsesores((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, prompt } : a))
    );
  };

  // Cambiar estado de una alternativa
  const handleCambiarEstadoAlt = async (
    id: string,
    status: "Pendiente revisión" | "Descartada" | "Seleccionada"
  ) => {
    try {
      const actualizada = await actualizarAlternativa(id, { status });
      setAlternativas((prev) => prev.map((a) => (a.id === id ? actualizada : a)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al cambiar estado.");
    }
  };

  // Guardar nota administrativa
  const handleGuardarNotaAlt = async (id: string) => {
    setIsPendingNotes((prev) => ({ ...prev, [id]: true }));
    try {
      const nota = notasAlt[id] || "";
      const actualizada = await actualizarAlternativa(id, { admin_notes: nota });
      setAlternativas((prev) => prev.map((a) => (a.id === id ? actualizada : a)));
      alert("Notas de administración guardadas.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al guardar notas.");
    } finally {
      setIsPendingNotes((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Ejecutar consulta (streaming en vivo)
  const handleConvocarConsejo = async () => {
    if (!preguntaConsulta.trim()) {
      setStreamError("Por favor plantea una pregunta o hipótesis.");
      return;
    }

    setStreaming(true);
    setStreamError("");
    setStreamStatus("Conectando con el consejo...");

    // Inicializar estado de streaming
    const initAdvisors: Record<
      string,
      { status: "esperando" | "analizando" | "completado" | "error"; opinion: string }
    > = {};
    listaAsesores.forEach((a) => {
      if (a.enabled) {
        initAdvisors[a.name] = { status: "esperando", opinion: "" };
      }
    });
    setStreamingAdvisors(initAdvisors);
    setStreamingVerdict({ status: "esperando", verdict: "" });

    // Acumuladores locales para evitar cierres obsoletos (stale closures) en React
    const opinionesAcumuladas: Record<string, string> = {};
    let veredictoAcumulado = "";

    try {
      const response = await fetch("/api/consejo/consultar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: proyecto.id,
          question: preguntaConsulta.trim(),
          advisors: listaAsesores,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Error al procesar la consulta.");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No se pudo iniciar el flujo de datos del servidor.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            const data = JSON.parse(line);

            if (data.type === "status") {
              setStreamStatus(data.message);
            } else if (data.type === "advisor_start") {
              setStreamingAdvisors((prev) => ({
                ...prev,
                [data.name]: { ...prev[data.name], status: "analizando" },
              }));
            } else if (data.type === "advisor_done") {
              if (data.opinion) {
                opinionesAcumuladas[data.name] = data.opinion;
              }
              setStreamingAdvisors((prev) => ({
                ...prev,
                [data.name]: {
                  status: data.error ? "error" : "completado",
                  opinion: data.opinion,
                },
              }));
            } else if (data.type === "president_start") {
              setStreamingVerdict((prev) => ({ ...prev, status: "analizando" }));
            } else if (data.type === "verdict") {
              if (data.verdict) {
                veredictoAcumulado = data.verdict;
              }
              setStreamingVerdict({
                status: data.error ? "error" : "completado",
                verdict: data.verdict,
              });
            } else if (data.type === "error") {
              setStreamError(data.message);
            } else if (data.type === "done") {
              // Completado con éxito!
              setStreamStatus("¡Consulta finalizada y guardada!");

              const opinionesFinales = data.opinions || opinionesAcumuladas;
              const veredictoFinal = data.verdict || veredictoAcumulado;

              const nuevaAlt: AlternativaConsejo = data.alternative || {
                id: data.alternativeId,
                project_id: proyecto.id,
                question: preguntaConsulta.trim(),
                opinions: opinionesFinales,
                verdict: veredictoFinal,
                admin_notes: "",
                status: "Pendiente revisión",
                created_at: new Date().toISOString(),
              };

              // Intentar recargar directo desde Supabase mediante Server Action
              try {
                const altsActualizadas = await obtenerAlternativas(proyecto.id);
                if (altsActualizadas && altsActualizadas.length > 0) {
                  setAlternativas(altsActualizadas);
                } else {
                  setAlternativas((prev) => [nuevaAlt, ...prev]);
                }
              } catch (e) {
                setAlternativas((prev) => [nuevaAlt, ...prev]);
              }

              // Expandir la nueva alternativa
              setAlternativasAbiertas((prev) => ({ ...prev, [nuevaAlt.id]: true }));

              // Cerrar modal tras un breve retraso
              setTimeout(() => {
                setModalConsulta(false);
                setPreguntaConsulta("");
                setStreaming(false);
              }, 1500);
            }
          }
        }
      }
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : "Error crítico en la comunicación.");
      setStreaming(false);
    }
  };

  const toggleAcordeon = (id: string) => {
    setAlternativasAbiertas((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatearFechaHora = (fechaStr: string) => {
    const d = new Date(fechaStr);
    return `${d.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })} a las ${d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <div className="space-y-10">
      {/* Botón Volver y Nombre */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-carbon/5 pb-5">
        <div>
          <Link
            href="/consejo"
            className="text-xs font-bold text-[#E05A2B] hover:underline flex items-center gap-1 mb-2"
          >
            ← Volver a proyectos
          </Link>
          <h1 className="font-titular text-3xl font-black text-carbon tracking-tight">
            {proyecto.name}
          </h1>
          <p className="text-xs text-carbon/50 mt-1 font-mono">
            Creado el {formatearFechaHora(proyecto.created_at)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setModalConsulta(true)}
            className="bg-[#E05A2B] hover:bg-[#c54b21] text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center gap-2"
          >
            🗣️ Nueva Consulta
          </button>
          <button
            onClick={handleEliminarProyecto}
            className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Eliminar Proyecto
          </button>
        </div>
      </div>

      {/* Grid Central: Configuración / Contexto */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Columna Configuración y Contexto (2/3 de ancho en lg) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Tarjeta del Contexto */}
          <div className="bg-white border border-carbon/10 rounded-xl p-6 shadow-sm">
            <h2 className="font-titular text-lg font-bold text-carbon mb-4 flex items-center gap-2 border-b border-carbon/5 pb-2">
              📝 Contexto Estratégico y Datos del Proyecto
            </h2>

            <form onSubmit={handleGuardarProyecto} className="space-y-4">
              {mensajeProj.text && (
                <div
                  className={`p-3 rounded-lg text-xs font-semibold ${
                    mensajeProj.type === "success"
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                      : "bg-red-50 border border-red-200 text-red-600"
                  }`}
                >
                  {mensajeProj.text}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-carbon/70 uppercase">
                    Nombre del Proyecto
                  </label>
                  <input
                    type="text"
                    required
                    value={nombreProj}
                    onChange={(e) => setNombreProj(e.target.value)}
                    className="w-full border border-carbon/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E05A2B] focus:border-transparent transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-carbon/70 uppercase">
                    Estado del Proyecto
                  </label>
                  <select
                    value={statusProj}
                    onChange={(e) => setStatusProj(e.target.value as any)}
                    className="w-full border border-carbon/15 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E05A2B] focus:border-transparent transition-all"
                  >
                    <option value="borrador">Borrador</option>
                    <option value="cerrado">Cerrado</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-carbon/70 uppercase flex justify-between">
                  <span>Contexto de Background</span>
                  <span className="text-[10px] text-carbon/40 font-normal lowercase">
                    Obligatorio para guiar al consejo
                  </span>
                </label>
                <textarea
                  rows={8}
                  required
                  value={contextoProj}
                  onChange={(e) => setContextoProj(e.target.value)}
                  placeholder="Describe la situación actual de negocio..."
                  className="w-full border border-carbon/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E05A2B] focus:border-transparent transition-all font-cuerpo resize-none"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isPendingProj}
                  className="bg-[#E05A2B] hover:bg-[#c54b21] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm disabled:opacity-50"
                >
                  {isPendingProj ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>

          {/* Sección de Especialistas */}
          <div className="bg-white border border-carbon/10 rounded-xl p-6 shadow-sm">
            <h2 className="font-titular text-lg font-bold text-carbon mb-4 flex items-center gap-2 border-b border-carbon/5 pb-2">
              🎓 Especialistas del Consejo
            </h2>

            <form onSubmit={handleGuardarAsesores} className="space-y-6">
              {mensajeAsesores.text && (
                <div
                  className={`p-3 rounded-lg text-xs font-semibold ${
                    mensajeAsesores.type === "success"
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                      : "bg-red-50 border border-red-200 text-red-600"
                  }`}
                >
                  {mensajeAsesores.text}
                </div>
              )}

              <div className="space-y-4">
                {listaAsesores.map((a, idx) => (
                  <div
                    key={a.id}
                    className="border border-carbon/5 rounded-lg p-4 bg-slate-50/50 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-titular text-sm font-bold text-carbon">
                        {a.name}
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={a.enabled}
                          onChange={() => toggleAsesor(idx)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#E05A2B]"></div>
                        <span className="ml-2 text-xs font-semibold text-carbon/70">
                          {a.enabled ? "Habilitado" : "Inhabilitado"}
                        </span>
                      </label>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-carbon/50 uppercase">
                        Prompt de Rol (System Prompt)
                      </label>
                      <textarea
                        rows={2}
                        value={a.prompt}
                        onChange={(e) => changePromptAsesor(idx, e.target.value)}
                        className="w-full border border-carbon/15 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#E05A2B] focus:border-transparent transition-all font-cuerpo resize-none bg-white"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isPendingAsesores}
                  className="bg-carbon hover:bg-black text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {isPendingAsesores ? "Guardando..." : "Guardar Especialistas"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Historial de Alternativas (Consultas) (1/3 de ancho en lg) */}
        <div className="space-y-6">
          <div className="bg-white border border-carbon/10 rounded-xl p-6 shadow-sm">
            <h2 className="font-titular text-lg font-bold text-carbon mb-1 flex items-center gap-2">
              📜 Consultas Realizadas ({alternativas.length})
            </h2>
            <p className="text-xs text-carbon/40 mb-4">
              Historial de alternativas evaluadas en este proyecto.
            </p>

            {alternativas.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-carbon/5 rounded-xl bg-slate-50">
                <span className="text-2xl">⏳</span>
                <p className="text-xs text-carbon/50 mt-2">Sin alternativas evaluadas aún.</p>
                <button
                  onClick={() => setModalConsulta(true)}
                  className="mt-3 text-xs font-bold text-[#E05A2B] hover:underline"
                >
                  Realizar primera consulta →
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {alternativas.map((alt) => (
                  <div
                    key={alt.id}
                    className="border border-carbon/15 rounded-xl bg-white overflow-hidden shadow-sm hover:border-carbon/30 transition-all"
                  >
                    {/* Botón de Cabecera del Acordeón */}
                    <button
                      onClick={() => toggleAcordeon(alt.id)}
                      className="w-full text-left p-4 hover:bg-slate-50/50 transition-colors flex items-start justify-between gap-3 border-b border-carbon/5"
                    >
                      <div className="space-y-1 pr-2">
                        <span className="text-[9px] font-mono text-carbon/40 block">
                          {formatearFechaHora(alt.created_at)}
                        </span>
                        <h4 className="font-titular text-sm font-bold text-carbon leading-snug line-clamp-2">
                          {alt.question}
                        </h4>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase ${
                            alt.status === "Seleccionada"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : alt.status === "Descartada"
                              ? "bg-slate-100 text-slate-500 border border-slate-200"
                              : "bg-[#E05A2B]/10 text-[#E05A2B] border border-[#E05A2B]/20"
                          }`}
                        >
                          {alt.status}
                        </span>
                        <span className="text-[10px] text-carbon/40">
                          {alternativasAbiertas[alt.id] ? "▲" : "▼"}
                        </span>
                      </div>
                    </button>

                    {/* Contenido Desplegable */}
                    {alternativasAbiertas[alt.id] && (
                      <div className="p-4 bg-slate-50/50 space-y-4 text-xs font-cuerpo">
                        {/* Veredicto del Presidente */}
                        <div className="bg-[#E05A2B]/5 border border-[#E05A2B]/10 rounded-lg p-4">
                          <h5 className="font-titular text-xs font-bold text-[#E05A2B] mb-2 uppercase tracking-wide">
                            👑 Veredicto del Presidente
                          </h5>
                          <p className="text-carbon/80 leading-relaxed whitespace-pre-line">
                            {alt.verdict || "No disponible."}
                          </p>
                        </div>

                        {/* Opiniones de Especialistas */}
                        <div className="space-y-3">
                          <h5 className="font-titular text-xs font-bold text-carbon/50 uppercase tracking-wide">
                            Opiniones de Especialistas
                          </h5>
                          {Object.entries(alt.opinions).map(([name, opinion]) => (
                            <div key={name} className="border border-carbon/5 bg-white rounded-lg p-3">
                              <span className="font-titular text-[11px] font-bold text-carbon block border-b border-carbon/5 pb-1 mb-1">
                                🧑‍💼 {name}
                              </span>
                              <p className="text-carbon/75 leading-relaxed whitespace-pre-line">
                                {opinion}
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* Notas del Admin */}
                        <div className="border-t border-carbon/5 pt-4 space-y-2">
                          <label className="text-[10px] font-bold text-carbon/60 uppercase">
                            Notas del Administrador (Decisión)
                          </label>
                          <textarea
                            rows={3}
                            placeholder="Anota aquí qué decidiste hacer frente a esta alternativa..."
                            value={notasAlt[alt.id] ?? ""}
                            onChange={(e) =>
                              setNotasAlt((prev) => ({ ...prev, [alt.id]: e.target.value }))
                            }
                            className="w-full border border-carbon/15 bg-white rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-[#E05A2B] transition-all resize-none text-xs"
                          />
                          <div className="flex items-center justify-between">
                            {/* Cambiar Estado */}
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => handleCambiarEstadoAlt(alt.id, "Seleccionada")}
                                className={`px-2 py-1 rounded text-[9px] font-semibold transition-colors ${
                                  alt.status === "Seleccionada"
                                    ? "bg-emerald-600 text-white"
                                    : "bg-white hover:bg-slate-50 text-carbon border border-carbon/15"
                                }`}
                              >
                                Seleccionar
                              </button>
                              <button
                                onClick={() => handleCambiarEstadoAlt(alt.id, "Descartada")}
                                className={`px-2 py-1 rounded text-[9px] font-semibold transition-colors ${
                                  alt.status === "Descartada"
                                    ? "bg-slate-600 text-white"
                                    : "bg-white hover:bg-slate-50 text-carbon border border-carbon/15"
                                }`}
                              >
                                Descartar
                              </button>
                            </div>
                            <button
                              onClick={() => handleGuardarNotaAlt(alt.id)}
                              disabled={isPendingNotes[alt.id]}
                              className="bg-carbon hover:bg-black text-white px-3 py-1 rounded font-semibold text-[9px] transition-colors"
                            >
                              {isPendingNotes[alt.id] ? "Guardando..." : "Guardar Nota"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Simulador de Sala de Consejo (streaming en vivo) */}
      {modalConsulta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-carbon/50 backdrop-blur-sm transition-opacity"
            onClick={() => !streaming && setModalConsulta(false)}
          />

          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl p-6 overflow-hidden border border-carbon/10 transform transition-all z-10 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Cabecera */}
            <div className="flex items-center justify-between border-b border-carbon/5 pb-3 mb-4">
              <h2 className="font-titular text-xl font-bold text-carbon flex items-center gap-2">
                🏛️ Sala de Consejo Estratégico
              </h2>
              <button
                type="button"
                onClick={() => !streaming && setModalConsulta(false)}
                className="text-carbon/40 hover:text-carbon p-1"
                disabled={streaming}
              >
                ✕
              </button>
            </div>

            {/* Contenido Desplazable del Modal */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-sutil">
              {streamError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-semibold">
                  {streamError}
                </div>
              )}

              {/* Formulario de Pregunta si no estamos en streaming */}
              {!streaming && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-carbon/70 uppercase">
                      Pregunta o Hipótesis Comercial a Evaluar
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Plantea la decisión. Ej: ¿Conviene comprar la casa de Sauceda de 3 recámaras por $450k con adeudo de $200k si requiere $60k de remodelación?"
                      value={preguntaConsulta}
                      onChange={(e) => setPreguntaConsulta(e.target.value)}
                      className="w-full border border-carbon/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E05A2B] focus:border-transparent transition-all font-cuerpo resize-none"
                    />
                  </div>

                  {/* Asesores involucrados */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-carbon/70 uppercase">
                      Consejeros Convocados
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {listaAsesores.map((a) => (
                        <div
                          key={a.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border text-xs ${
                            a.enabled
                              ? "border-carbon/10 bg-slate-50/50"
                              : "border-carbon/5 bg-slate-100/50 opacity-40"
                          }`}
                        >
                          <span className={a.enabled ? "text-[#E05A2B]" : "text-carbon/20"}>
                            {a.enabled ? "●" : "○"}
                          </span>
                          <div className="flex-1">
                            <span className="font-bold text-carbon block">{a.name}</span>
                            <span className="text-[10px] text-carbon/50 line-clamp-1">
                              {a.enabled ? "Activo para consulta" : "Deshabilitado en configuraciones"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Panel de Streaming Activo */}
              {streaming && (
                <div className="space-y-6">
                  {/* Status superior */}
                  <div className="flex items-center gap-3 p-3 bg-[#E05A2B]/10 rounded-lg text-[#E05A2B] text-xs font-semibold animate-pulse">
                    <svg className="animate-spin h-4 w-4 text-[#E05A2B]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>{streamStatus}</span>
                  </div>

                  {/* Especialistas */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-carbon/60 uppercase border-b border-carbon/5 pb-1">
                      Opiniones de los Especialistas
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      {Object.entries(streamingAdvisors).map(([name, data]) => (
                        <div
                          key={name}
                          className={`border rounded-lg p-4 transition-all ${
                            data.status === "analizando"
                              ? "border-[#E05A2B]/40 bg-[#E05A2B]/5 shadow-sm"
                              : data.status === "completado"
                              ? "border-emerald-100 bg-emerald-50/20"
                              : "border-carbon/10 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between border-b border-carbon/5 pb-1 mb-2">
                            <span className="font-titular text-sm font-bold text-carbon">
                              🧑‍💼 {name}
                            </span>
                            <span
                              className={`text-[9px] font-bold uppercase tracking-wider ${
                                data.status === "analizando"
                                  ? "text-[#E05A2B]"
                                  : data.status === "completado"
                                  ? "text-emerald-600"
                                  : "text-carbon/30"
                              }`}
                            >
                              {data.status === "analizando" ? (
                                <span className="flex items-center gap-1">
                                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                  Analizando...
                                </span>
                              ) : data.status === "completado" ? (
                                "✓ Opinión Generada"
                              ) : (
                                "Esperando turno..."
                              )}
                            </span>
                          </div>

                          <div className="text-xs text-carbon/70 min-h-[4rem] leading-relaxed whitespace-pre-line font-cuerpo">
                            {data.opinion ? data.opinion : <span className="italic text-carbon/40">Esperando respuesta...</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Veredicto del Presidente */}
                  <div
                    className={`border rounded-lg p-5 transition-all ${
                      streamingVerdict.status === "analizando"
                        ? "border-[#E05A2B]/40 bg-[#E05A2B]/5 shadow-sm"
                        : streamingVerdict.status === "completado"
                        ? "border-[#E05A2B]/20 bg-[#E05A2B]/10"
                        : "border-carbon/10 bg-slate-50/50 opacity-50"
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-carbon/10 pb-2 mb-3">
                      <span className="font-titular text-sm font-bold text-carbon">
                        👑 Veredicto del Presidente (Consolidado)
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider ${
                          streamingVerdict.status === "analizando"
                            ? "text-[#E05A2B]"
                            : streamingVerdict.status === "completado"
                            ? "text-[#E05A2B] font-black"
                            : "text-carbon/30"
                        }`}
                      >
                        {streamingVerdict.status === "analizando" ? (
                          <span className="flex items-center gap-1">
                            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Consolidando debate...
                          </span>
                        ) : streamingVerdict.status === "completado" ? (
                          "✓ Veredicto Redactado"
                        ) : (
                          "Esperando opiniones de especialistas..."
                        )}
                      </span>
                    </div>

                    <div className="text-xs text-carbon/80 leading-relaxed whitespace-pre-line font-cuerpo">
                      {streamingVerdict.verdict ? (
                        streamingVerdict.verdict
                      ) : (
                        <span className="italic text-carbon/40">
                          El presidente se pronunciará una vez que todos los consejeros concluyan su análisis.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-3 border-t border-carbon/5 mt-4">
              {!streaming ? (
                <>
                  <button
                    type="button"
                    onClick={() => setModalConsulta(false)}
                    className="px-4 py-2 border border-carbon/10 hover:bg-carbon/5 rounded-lg text-sm text-carbon/70 font-semibold transition-colors"
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    onClick={handleConvocarConsejo}
                    className="bg-[#E05A2B] hover:bg-[#c54b21] text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm"
                  >
                    📢 Convocar al Consejo
                  </button>
                </>
              ) : (
                <div className="text-xs text-carbon/40 italic flex items-center gap-1.5">
                  <span>Reunión del consejo en curso. No cierres el simulador...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
