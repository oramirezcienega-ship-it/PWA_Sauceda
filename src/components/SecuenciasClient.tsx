"use client";

import { useEffect, useState, useMemo } from "react";
import {
  listarSecuencias,
  obtenerSecuencia,
  crearSecuencia,
  actualizarSecuencia,
  cambiarEstadoSecuencia,
  eliminarSecuencia,
  listarEnrollments,
  enrolarLead,
  cambiarEstadoEnrollment,
  listarAsesores,
  listarTareasAsesor,
  resolverTareaAsesor,
  obtenerTrazabilidadLead,
  obtenerAnalytics,
  ejecutarOrquestadorManual,
  type DatosPaso,
} from "@/app/actions/secuencias";
import { obtenerUsuarioActual } from "@/app/actions/usuarios";

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
  grisLuz: "#F1F5F9",
};

export function SecuenciasClient() {
  // Navegación
  const [vistaActiva, setVistaActiva] = useState<"panel" | "tareas" | "constructor" | "trazabilidad" | "analytics">("panel");

  // Estados generales
  const [secuencias, setSecuencias] = useState<any[]>([]);
  const [asesores, setAsesores] = useState<any[]>([]);
  const [tareas, setTareas] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [usuario, setUsuario] = useState<any | null>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refrescar, setRefrescar] = useState(0);

  // Estado para Enrolar Lead Quick Modal
  const [mostrarModalEnrolar, setMostrarModalEnrolar] = useState(false);
  const [secuenciaParaEnrolar, setSecuenciaParaEnrolar] = useState<string>("");
  const [leadFormData, setLeadFormData] = useState({
    nombre: "",
    phone: "",
    email: "",
    prospectoId: "",
    expedienteId: "",
  });

  // Estado para el Constructor de Secuencias
  const [constructorId, setConstructorId] = useState<string | null>(null);
  const [constructorData, setConstructorData] = useState({
    nombre: "",
    descripcion: "",
    status: "activa" as "activa" | "pausada" | "archivada",
    segmento: "todos" as string,
    steps: [] as DatosPaso[],
  });

  // Estado para la Trazabilidad por Lead
  const [busquedaTrazabilidad, setBusquedaTrazabilidad] = useState("");
  const [trazabilidadLead, setTrazabilidadLead] = useState<any | null>(null);
  const [loadingTrazabilidad, setLoadingTrazabilidad] = useState(false);

  // Estado para el Monitoreo en Tiempo Real (Analytics)
  const [filtroEstadoMonitoreo, setFiltroEstadoMonitoreo] = useState<"todos" | "activo" | "respondio" | "otros">("todos");
  const [filtroNegocioMonitoreo, setFiltroNegocioMonitoreo] = useState<"todos" | "traspaso_compra" | "promocion_venta" | "solo_tramite" | "construccion-impermeabilizacion">("todos");
  const [busquedaLeadMonitoreo, setBusquedaLeadMonitoreo] = useState("");

  const enrollmentsFiltrados = useMemo(() => {
    return enrollments.filter((en) => {
      // 1. Filtrar por estado
      if (filtroEstadoMonitoreo === "activo" && en.status !== "activo") return false;
      if (filtroEstadoMonitoreo === "respondio" && !(en.status === "salido" && en.razon_salida === "respondio")) return false;
      if (filtroEstadoMonitoreo === "otros") {
        const esActivo = en.status === "activo";
        const esRespondio = en.status === "salido" && en.razon_salida === "respondio";
        if (esActivo || esRespondio) return false;
      }

      // 1b. Filtrar por tipo de negocio
      if (filtroNegocioMonitoreo !== "todos") {
        const negocioExp = en.expediente?.tipo_negocio || "no_definido";
        if (negocioExp !== filtroNegocioMonitoreo) return false;
      }

      // 2. Filtrar por búsqueda
      if (busquedaLeadMonitoreo.trim() !== "") {
        const query = busquedaLeadMonitoreo.toLowerCase();
        const nombreMatch = en.nombre?.toLowerCase().includes(query);
        const telefonoMatch = en.phone?.includes(query);
        const seqMatch = en.sequence?.nombre?.toLowerCase().includes(query);
        if (!nombreMatch && !telefonoMatch && !seqMatch) return false;
      }

      return true;
    });
  }, [enrollments, filtroEstadoMonitoreo, filtroNegocioMonitoreo, busquedaLeadMonitoreo]);

  // Carga inicial de datos
  useEffect(() => {
    async function cargarDatos() {
      setLoading(true);
      try {
        const [listaSec, listaAsesores, listaTareas, dataAnalitica, userObj, listaEnrollments] = await Promise.all([
          listarSecuencias(),
          listarAsesores(),
          listarTareasAsesor().catch(() => []),
          obtenerAnalytics(),
          obtenerUsuarioActual(),
          listarEnrollments().catch(() => []),
        ]);
        setSecuencias(listaSec);
        setAsesores(listaAsesores);
        setTareas(listaTareas);
        setAnalytics(dataAnalitica);
        setUsuario(userObj);
        setEnrollments(listaEnrollments);
      } catch (err) {
        console.error("Error al cargar datos del módulo:", err);
      } finally {
        setLoading(false);
      }
    }
    cargarDatos();
  }, [refrescar, vistaActiva]);

  // Manejar cambio a modo edición en Constructor
  const editarSecuenciaClick = async (id: string) => {
    setLoading(true);
    try {
      const sec = await obtenerSecuencia(id);
      if (sec) {
        setConstructorId(id);
        setConstructorData({
          nombre: sec.nombre,
          descripcion: sec.descripcion || "",
          status: sec.status as any,
          segmento: sec.segmento as any,
          steps: (sec.steps || []).map((s: any) => ({
            id: s.id,
            orden: s.orden,
            canal: s.canal,
            delay_horas: s.delay_horas,
            mensaje: s.mensaje || "",
            asunto_email: s.asunto_email || "",
            asignar_a: s.asignar_a || "",
            condicion_salida: s.condicion_salida || "respondio",
          })),
        });
        setVistaActiva("constructor");
      }
    } catch (err) {
      alert("No se pudo cargar la secuencia.");
    } finally {
      setLoading(false);
    }
  };

  // Crear o actualizar secuencia
  const guardarSecuenciaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!constructorData.nombre.trim()) {
      alert("Por favor ingresa un nombre para la secuencia.");
      return;
    }

    setLoading(true);
    try {
      if (constructorId) {
        await actualizarSecuencia(constructorId, {
          nombre: constructorData.nombre,
          descripcion: constructorData.descripcion,
          status: constructorData.status,
          segmento: constructorData.segmento,
          steps: constructorData.steps,
        });
        alert("Secuencia actualizada exitosamente.");
      } else {
        await crearSecuencia({
          nombre: constructorData.nombre,
          descripcion: constructorData.descripcion,
          status: constructorData.status,
          segmento: constructorData.segmento,
          steps: constructorData.steps,
        });
        alert("Secuencia creada exitosamente.");
      }
      // Resetear formulario
      setConstructorId(null);
      setConstructorData({
        nombre: "",
        descripcion: "",
        status: "activa",
        segmento: "todos",
        steps: [],
      });
      setRefrescar((prev) => prev + 1);
      setVistaActiva("panel");
    } catch (err: any) {
      alert(`Error al guardar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Agregar paso vacío al Constructor
  const agregarPaso = () => {
    const nuevosPasos = [...constructorData.steps];
    nuevosPasos.push({
      orden: nuevosPasos.length + 1,
      canal: "whatsapp",
      delay_horas: 24,
      mensaje: "",
      asunto_email: "",
      asignar_a: asesores[0]?.id || "",
      condicion_salida: "respondio",
    });
    setConstructorData({ ...constructorData, steps: nuevosPasos });
  };

  // Remover paso del Constructor
  const removerPaso = (idx: number) => {
    const nuevosPasos = constructorData.steps
      .filter((_, i) => i !== idx)
      .map((step, i) => ({ ...step, orden: i + 1 }));
    setConstructorData({ ...constructorData, steps: nuevosPasos });
  };

  // Modificar un paso específico
  const editarPaso = (idx: number, campo: keyof DatosPaso, valor: any) => {
    const nuevosPasos = [...constructorData.steps];
    nuevosPasos[idx] = { ...nuevosPasos[idx], [campo]: valor };
    setConstructorData({ ...constructorData, steps: nuevosPasos });
  };

  // Reordenar pasos en Constructor (Up/Down)
  const moverPaso = (idx: number, direccion: "arriba" | "abajo") => {
    if (direccion === "arriba" && idx === 0) return;
    if (direccion === "abajo" && idx === constructorData.steps.length - 1) return;

    const nuevosPasos = [...constructorData.steps];
    const targetIdx = direccion === "arriba" ? idx - 1 : idx + 1;
    const temp = nuevosPasos[idx];
    nuevosPasos[idx] = nuevosPasos[targetIdx];
    nuevosPasos[targetIdx] = temp;

    // Reasignar el orden secuencial
    const ordenado = nuevosPasos.map((s, i) => ({ ...s, orden: i + 1 }));
    setConstructorData({ ...constructorData, steps: ordenado });
  };

  // Enrolar Lead Submit
  const enrolarLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadFormData.nombre.trim() || !leadFormData.phone.trim()) {
      alert("Nombre y Teléfono son requeridos.");
      return;
    }

    setLoading(true);
    try {
      await enrolarLead({
        sequenceId: secuenciaParaEnrolar,
        nombre: leadFormData.nombre,
        phone: leadFormData.phone,
        email: leadFormData.email,
        prospectoId: leadFormData.prospectoId || undefined,
        expedienteId: leadFormData.expedienteId || undefined,
      });
      alert("Lead enrolado exitosamente.");
      setMostrarModalEnrolar(false);
      setLeadFormData({ nombre: "", phone: "", email: "", prospectoId: "", expedienteId: "" });
      setRefrescar((prev) => prev + 1);
    } catch (err: any) {
      alert(`Error al enrolar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Alternar estado de secuencia
  const toggleSecuenciaEstado = async (id: string, estadoActual: string) => {
    const nuevoEstado = estadoActual === "activa" ? "pausada" : "activa";
    try {
      await cambiarEstadoSecuencia(id, nuevoEstado);
      setRefrescar((prev) => prev + 1);
    } catch (err) {
      alert("Error al cambiar estado.");
    }
  };

  // Ejecutar orquestador manual
  const forzarCron = async () => {
    setLoading(true);
    try {
      const res = await ejecutarOrquestadorManual();
      alert(`Cron ejecutado.\nLeads procesados: ${res.procesados}\nAcciones: ${res.accionesEjecutadas}\nErrores: ${res.errores.length}`);
      setRefrescar((prev) => prev + 1);
    } catch (err: any) {
      alert(`Error en ejecución manual: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Buscar Trazabilidad
  const buscarTrazabilidad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busquedaTrazabilidad.trim()) return;

    setLoadingTrazabilidad(true);
    try {
      const res = await obtenerTrazabilidadLead(busquedaTrazabilidad.trim());
      setTrazabilidadLead(res);
      if (!res) {
        alert("No se encontró historial para este lead.");
      }
    } catch (err: any) {
      alert(`Error al buscar trazabilidad: ${err.message}`);
    } finally {
      setLoadingTrazabilidad(false);
    }
  };

  // Ver historial de lead y redirigir
  const verHistorialLead = async (telefono: string) => {
    setBusquedaTrazabilidad(telefono);
    setVistaActiva("trazabilidad");
    setLoadingTrazabilidad(true);
    try {
      const res = await obtenerTrazabilidadLead(telefono);
      setTrazabilidadLead(res);
    } catch (err: any) {
      alert(`Error al buscar trazabilidad: ${err.message}`);
    } finally {
      setLoadingTrazabilidad(false);
    }
  };

  // Resolver Tarea de Asesor
  const resolverTarea = async (
    taskId: string,
    resultado: "respondio" | "no_contesto" | "numero_invalido" | "agendo_cita",
    reagendaPara?: string
  ) => {
    const notas = prompt("Añade una nota de seguimiento (opcional):") || "";
    setLoading(true);
    try {
      await resolverTareaAsesor(taskId, resultado, notas, reagendaPara);
      alert("Tarea completada exitosamente.");
      setRefrescar((prev) => prev + 1);
    } catch (err: any) {
      alert(`Error al completar la tarea: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Contar tareas pendientes para la insignia del menú
  const tareasPendientesCount = useMemo(() => {
    return tareas.filter((t) => t.status === "pendiente").length;
  }, [tareas]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 font-cuerpo">
      {/* Encabezado Principal */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-titular text-3xl font-bold text-[#2D4A2B]">
            Secuencias Multicanal
          </h1>
          <p className="text-sm text-slate-500">
            Marketing Automation y contactabilidad automática.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={forzarCron}
            className="flex items-center gap-1.5 rounded-lg border border-[#C9A961]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#2D4A2B] shadow-sm transition hover:bg-slate-50"
            title="Gatilla el orquestador de fondo de inmediato para pruebas."
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            Correr Orquestador
          </button>
          <button
            onClick={() => {
              setConstructorId(null);
              setConstructorData({
                nombre: "Secuencia de Captación y Reactivación",
                descripcion: "Secuencia omnicanal inicial con Sofía y asignación de llamadas para calificar el interés.",
                status: "activa",
                segmento: "todos",
                steps: [
                  {
                    orden: 1,
                    canal: "whatsapp",
                    delay_horas: 0,
                    mensaje: "Hola {nombre}, gusto en saludarte. Soy Sofía, el asistente virtual de SAUCEDA Bienes Raíces en León, Gto. 🏠 ¿Te interesa vender tu casa directamente (incluso si tienes adeudo), que la promovamos a un tercero, o necesitas ayuda con el armado de expediente y trámites de INFONAVIT?",
                    asunto_email: "",
                    asignar_a: "",
                    condicion_salida: "respondio"
                  },
                  {
                    orden: 2,
                    canal: "email",
                    delay_horas: 24,
                    mensaje: "Hola {nombre},\n\nTe escribí ayer por WhatsApp sobre tu interés en nuestros servicios de bienes raíces en León (compra directa de casas con adeudo, promoción de venta o armado de expediente INFONAVIT).\n\nSi sigues interesado, por favor respóndeme este correo o envíame un WhatsApp para asesorarte.\n\nSaludos,\nSofía - SAUCEDA",
                    asunto_email: "¿Sigues interesado en vender o tramitar tu casa?",
                    asignar_a: "",
                    condicion_salida: "respondio"
                  },
                  {
                    orden: 3,
                    canal: "llamada",
                    delay_horas: 48,
                    mensaje: "Llamada de seguimiento por asesor. Lead sin respuesta a contacto automático de Sofía sobre compra directa / promoción / trámites.",
                    asunto_email: "",
                    asignar_a: asesores[0]?.id || "",
                    condicion_salida: "respondio"
                  },
                  {
                    orden: 4,
                    canal: "whatsapp",
                    delay_horas: 96,
                    mensaje: "Hola {nombre}, soy Oscar de SAUCEDA Bienes Raíces. Te busqué hace unos días por llamada pero no coincidimos. ¿Sigues interesado en vender o tramitar tu casa en {fraccionamiento}?",
                    asunto_email: "",
                    asignar_a: "",
                    condicion_salida: "respondio"
                  },
                  {
                    orden: 5,
                    canal: "email",
                    delay_horas: 192,
                    mensaje: "Hola {nombre},\n\nHemos intentado contactarte por WhatsApp y llamada para apoyarte con tu casa en {fraccionamiento}. Si aún te interesa vender o realizar trámites, puedes responder a este correo o escribirnos por WhatsApp.\n\nDe lo contrario, daremos de baja tu solicitud en nuestro sistema.\n\nAtentamente,\nSAUCEDA Bienes Raíces",
                    asunto_email: "Último contacto - SAUCEDA Bienes Raíces",
                    asignar_a: "",
                    condicion_salida: "respondio"
                  }
                ],
              });
              setVistaActiva("constructor");
            }}
            className="rounded-lg bg-[#2D4A2B] px-3.5 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-[#5C7A52]"
          >
            + Nueva Secuencia
          </button>
        </div>
      </div>

      {/* Tabs / Menú de navegación del módulo (Responsive & Móvil-first) */}
      <div className="mb-6 border-b border-slate-200">
        <nav className="flex -mb-px space-x-4 overflow-x-auto scrollbar-none" aria-label="Tabs">
          {[
            { id: "panel", label: "Panel" },
            { id: "tareas", label: "Tareas", count: tareasPendientesCount },
            { id: "constructor", label: "Constructor" },
            { id: "trazabilidad", label: "Historial/Lead" },
            { id: "analytics", label: "Analytics" },
          ].map((tab) => {
            const activo = vistaActiva === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setVistaActiva(tab.id as any)}
                className={`relative py-3.5 px-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                  activo
                    ? "border-[#2D4A2B] text-[#2D4A2B]"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {tab.label}
                  {!!tab.count && (
                    <span className="rounded-full bg-[#C44A4A] px-2 py-0.5 text-[10px] font-bold text-white">
                      {tab.count}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {loading && (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2D4A2B] border-t-transparent"></div>
        </div>
      )}

      {/* CONTENIDO DE LAS VISTAS */}
      {!loading && (
        <div className="space-y-6">
          {/* Vista 2: Panel de Control */}
          {vistaActiva === "panel" && (
            <div className="space-y-4">
              {/* Resumen de analíticos siempre visible al cargar */}
              {analytics && (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm text-center">
                    <p className="text-xl font-bold text-[#2D4A2B]">{analytics.global.totalLeads}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Leads Totales</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm text-center">
                    <p className="text-xl font-bold text-amber-600">{analytics.global.activos}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Activos</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm text-center">
                    <p className="text-xl font-bold text-emerald-600">{analytics.global.salidosRespondio}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Respondieron</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm text-center">
                    <p className="text-xl font-bold text-[#C9A961]">{analytics.global.tasaRespuestaGlobal}%</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Conversión</p>
                  </div>
                </div>
              )}

              {secuencias.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                  No hay secuencias creadas todavía. Abre el Constructor para crear tu primera secuencia.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {secuencias.map((sec) => (
                    <div
                      key={sec.id}
                      className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#C9A961]/40"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              sec.status === "activa"
                                ? "bg-emerald-100 text-emerald-800"
                                : sec.status === "pausada"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {sec.status.toUpperCase()}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">
                            Segmento: <strong className="text-slate-700">{sec.segmento}</strong>
                          </span>
                        </div>
                        <h3 className="mt-3 font-titular text-lg font-bold text-[#2D4A2B]">{sec.nombre}</h3>
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2">{sec.descripcion || "Sin descripción."}</p>
                        
                        <div className="mt-4 flex items-center justify-around rounded-lg bg-slate-50 p-2.5 text-center">
                          <div>
                            <p className="text-lg font-bold text-slate-800">{sec.leads_activos}</p>
                            <p className="text-[10px] text-slate-500">Activos</p>
                          </div>
                          <div className="h-6 w-px bg-slate-200"></div>
                          <div>
                            <p className="text-lg font-bold text-slate-800">{sec.steps?.length || 0}</p>
                            <p className="text-[10px] text-slate-500">Pasos</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                        <button
                          onClick={() => {
                            setSecuenciaParaEnrolar(sec.id);
                            setMostrarModalEnrolar(true);
                          }}
                          className="flex-1 rounded-lg bg-[#5C7A52] py-2 text-center text-xs font-semibold text-white shadow-sm transition hover:bg-[#2D4A2B]"
                        >
                          Enrolar Lead
                        </button>
                        <button
                          onClick={() => toggleSecuenciaEstado(sec.id, sec.status)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {sec.status === "activa" ? "Pausar" : "Reanudar"}
                        </button>
                        <button
                          onClick={() => editarSecuenciaClick(sec.id)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#2D4A2B] hover:bg-slate-50"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("¿Estás seguro de que quieres eliminar esta secuencia?")) {
                              eliminarSecuencia(sec.id).then(() => setRefrescar((prev) => prev + 1));
                            }
                          }}
                          className="rounded-lg border border-transparent p-2 text-slate-400 hover:text-red-600"
                          title="Eliminar secuencia"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Vista 3: Bandeja de Tareas del Asesor */}
          {vistaActiva === "tareas" && (
            <div className="space-y-4">
              <h2 className="font-titular text-xl font-bold text-[#2D4A2B]">Llamadas y Tareas Pendientes</h2>
              
              {tareas.filter((t) => t.status === "pendiente").length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                  ¡Excelente! No tienes llamadas pendientes programadas por secuencias para el día de hoy.
                </div>
              ) : (
                <div className="space-y-3">
                  {tareas
                    .filter((t) => t.status === "pendiente")
                    .map((tarea) => (
                      <div
                        key={tarea.id}
                        className="rounded-xl border-l-4 border-[#C9A961] bg-[#F5F1E8]/35 border border-slate-200 p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                              📞 LLAMADA PROGRAMADA
                            </p>
                            <h3 className="mt-1 font-titular text-lg font-bold text-[#2D4A2B]">
                              {tarea.enrollment?.nombre || "María González"}
                            </h3>
                            <p className="mt-0.5 text-sm font-semibold text-slate-800">
                              {tarea.enrollment?.phone || "477 123 4567"}
                            </p>
                            
                            <div className="mt-3 rounded bg-white border border-slate-100 p-2.5 text-xs text-slate-600">
                              <p className="font-bold text-slate-700">Contexto:</p>
                              <p className="mt-0.5">{tarea.contexto}</p>
                            </div>
                          </div>
                          
                          <span className="shrink-0 text-xs text-slate-400 font-medium">
                            {new Date(tarea.agendada_para).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200/50 pt-3">
                          <a
                            href={`tel:${tarea.enrollment?.phone}`}
                            onClick={() => {
                              // Registrar que llamó
                              console.log("Llamando a", tarea.enrollment?.phone);
                            }}
                            className="flex-1 min-w-[120px] rounded-lg bg-[#2D4A2B] py-2 text-center text-xs font-bold text-white shadow-sm hover:bg-[#5C7A52]"
                          >
                            Llamar ahora
                          </a>
                          
                          <button
                            onClick={() => resolverTarea(tarea.id, "no_contesto")}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            No contestó
                          </button>
                          
                          <button
                            onClick={() => resolverTarea(tarea.id, "respondio")}
                            className="rounded-lg border border-emerald-600 bg-emerald-50 text-emerald-800 px-3 py-2 text-xs font-semibold hover:bg-emerald-100"
                          >
                            Respondió / Contacto
                          </button>

                          <button
                            onClick={() => {
                              const dt = prompt("Ingresa fecha/hora en formato AAAA-MM-DD HH:MM:");
                              if (dt) {
                                resolverTarea(tarea.id, "no_contesto", new Date(dt).toISOString());
                              }
                            }}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                          >
                            Reagendar
                          </button>
                          
                          <button
                            onClick={() => resolverTarea(tarea.id, "numero_invalido")}
                            className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-xs font-semibold hover:bg-red-100"
                          >
                            Inválido
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Vista 1: Constructor de Secuencias */}
          {vistaActiva === "constructor" && (
            <form onSubmit={guardarSecuenciaSubmit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-6">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-titular text-xl font-bold text-[#2D4A2B]">
                  {constructorId ? "Editar Secuencia" : "Nueva Secuencia de Automatización"}
                </h3>
                <p className="text-xs text-slate-500">Construye el flujo y los delays paso a paso.</p>
              </div>

              {/* Datos de Secuencia */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Nombre de la secuencia</label>
                  <input
                    type="text"
                    required
                    value={constructorData.nombre}
                    onChange={(e) => setConstructorData({ ...constructorData, nombre: e.target.value })}
                    placeholder="Ej. Seguimiento Inicial de Facebook"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-[#2D4A2B] focus:ring-1 focus:ring-[#2D4A2B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Segmento del Lead</label>
                  <select
                    value={constructorData.segmento}
                    onChange={(e) => setConstructorData({ ...constructorData, segmento: e.target.value as any })}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-[#2D4A2B]"
                  >
                    <option value="todos">Todos (Genérico)</option>
                    <option value="sin_contactar">Sin contactar</option>
                    <option value="sin_respuesta">Sin respuesta</option>
                    <option value="rojo">Semáforo Rojo</option>
                    <option value="construccion-impermeabilizacion">Construcción: Impermeabilización</option>
                    <option value="traspaso_compra">Bienes Raíces: Compra Directa</option>
                    <option value="promocion_venta">Bienes Raíces: Promoción Venta</option>
                    <option value="solo_tramite">Bienes Raíces: Solo Trámite</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Descripción o Notas</label>
                  <textarea
                    rows={2}
                    value={constructorData.descripcion}
                    onChange={(e) => setConstructorData({ ...constructorData, descripcion: e.target.value })}
                    placeholder="Escribe brevemente el propósito de esta secuencia..."
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-[#2D4A2B]"
                  />
                </div>
              </div>

              {/* Pasos */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                  <h4 className="font-titular text-md font-bold text-[#2D4A2B]">Pasos de la Secuencia</h4>
                  <button
                    type="button"
                    onClick={agregarPaso}
                    className="rounded bg-[#5C7A52] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#2D4A2B]"
                  >
                    + Agregar Paso
                  </button>
                </div>

                {constructorData.steps.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    Aún no hay pasos creados. Añade pasos con el botón "+ Agregar Paso".
                  </p>
                ) : (
                  <div className="space-y-4">
                    {constructorData.steps.map((step, idx) => (
                      <div key={idx} className="relative rounded-lg border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/50 pb-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2D4A2B] text-[10px] font-bold text-white">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-700">Configuración del Paso</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {/* Ordenadores */}
                            <button
                              type="button"
                              onClick={() => moverPaso(idx, "arriba")}
                              disabled={idx === 0}
                              className="p-1 rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                              title="Subir orden"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => moverPaso(idx, "abajo")}
                              disabled={idx === constructorData.steps.length - 1}
                              className="p-1 rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30"
                              title="Bajar orden"
                            >
                              ▼
                            </button>
                            <button
                              type="button"
                              onClick={() => removerPaso(idx)}
                              className="p-1 rounded text-slate-400 hover:bg-red-100 hover:text-red-600"
                              title="Borrar paso"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-500">Canal de comunicación</label>
                            <select
                              value={step.canal}
                              onChange={(e) => editarPaso(idx, "canal", e.target.value)}
                              className="mt-1 block w-full rounded border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-[#2D4A2B]"
                            >
                              <option value="whatsapp">WhatsApp automático (Sofía)</option>
                              <option value="email">Email</option>
                              <option value="sms">SMS</option>
                              <option value="messenger">Messenger</option>
                              <option value="llamada">Llamada (Asesor)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-500">Delay (en horas)</label>
                            <input
                              type="number"
                              min="0"
                              value={step.delay_horas}
                              onChange={(e) => editarPaso(idx, "delay_horas", parseInt(e.target.value) || 0)}
                              className="mt-1 block w-full rounded border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                            />
                          </div>

                          {step.canal === "llamada" ? (
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-500">Asignar llamada a</label>
                              <select
                                value={step.asignar_a || ""}
                                onChange={(e) => editarPaso(idx, "asignar_a", e.target.value)}
                                className="mt-1 block w-full rounded border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                              >
                                <option value="">Cualquier asesor libre</option>
                                {asesores.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.nombre}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-500">Condición de salida</label>
                              <select
                                value={step.condicion_salida}
                                onChange={(e) => editarPaso(idx, "condicion_salida", e.target.value)}
                                className="mt-1 block w-full rounded border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                              >
                                <option value="respondio">Si el lead responde (Recomendado)</option>
                                <option value="califico">Si califica (etapa calificada)</option>
                                <option value="manual">Solo salida manual</option>
                              </select>
                            </div>
                          )}

                          {step.canal === "email" && (
                            <div className="md:col-span-3">
                              <label className="block text-[11px] font-semibold text-slate-500">Asunto del Email</label>
                              <input
                                type="text"
                                placeholder="Ingresa el asunto del correo..."
                                value={step.asunto_email || ""}
                                onChange={(e) => editarPaso(idx, "asunto_email", e.target.value)}
                                className="mt-1 block w-full rounded border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                              />
                            </div>
                          )}

                          {step.canal !== "llamada" && (
                            <div className="md:col-span-3">
                              <label className="block text-[11px] font-semibold text-slate-500">
                                Cuerpo del Mensaje (Variables: {"{nombre}"}, {"{fraccionamiento}"})
                              </label>
                              <textarea
                                rows={3}
                                placeholder="Escribe el mensaje aquí..."
                                value={step.mensaje || ""}
                                onChange={(e) => editarPaso(idx, "mensaje", e.target.value)}
                                className="mt-1 block w-full rounded border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                              />
                              
                              {/* Preview de sustitución */}
                              <div className="mt-1.5 rounded bg-amber-50 p-2 text-[10px] text-amber-800">
                                <strong>Preview:</strong>{" "}
                                {step.mensaje
                                  ? step.mensaje
                                      .replace(/{nombre}/gi, "María")
                                      .replace(/{fraccionamiento}/gi, "Villas San Juan")
                                  : "(Vacío)"}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botones de Envío */}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setVistaActiva("panel")}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#2D4A2B] px-5 py-2 text-xs font-semibold text-white shadow hover:bg-[#5C7A52]"
                >
                  {constructorId ? "Guardar Cambios" : "Crear Secuencia"}
                </button>
              </div>
            </form>
          )}

          {/* Vista 4: Trazabilidad por Lead */}
          {vistaActiva === "trazabilidad" && (
            <div className="space-y-4">
              <form onSubmit={buscarTrazabilidad} className="flex gap-2">
                <input
                  type="text"
                  required
                  value={busquedaTrazabilidad}
                  onChange={(e) => setBusquedaTrazabilidad(e.target.value)}
                  placeholder="Ingresa el teléfono o Prospecto ID (ej. 4771234567 o PRO-001)"
                  className="block flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-[#2D4A2B] focus:ring-1 focus:ring-[#2D4A2B]"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#2D4A2B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#5C7A52]"
                >
                  Buscar Historial
                </button>
              </form>

              {loadingTrazabilidad && (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2D4A2B] border-t-transparent"></div>
                </div>
              )}

              {!loadingTrazabilidad && trazabilidadLead && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-6">
                  {/* Info Enrollment */}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="font-titular text-lg font-bold text-[#2D4A2B]">
                        {trazabilidadLead.enrollment.nombre}
                      </h4>
                      <p className="text-xs text-slate-500">
                        Teléfono: {trazabilidadLead.enrollment.phone} · Enrolado en:{" "}
                        <strong>{trazabilidadLead.enrollment.sequence?.nombre}</strong>
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        trazabilidadLead.enrollment.status === "activo"
                          ? "bg-emerald-100 text-emerald-800"
                          : trazabilidadLead.enrollment.status === "completado"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {trazabilidadLead.enrollment.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Timeline */}
                  <div>
                    <h5 className="mb-4 text-xs font-bold text-slate-700 uppercase tracking-wider">Línea de tiempo de la secuencia</h5>
                    {trazabilidadLead.historial.length === 0 ? (
                      <p className="text-center text-xs text-slate-400 py-6">
                        No hay acciones ejecutadas para este lead todavía en la secuencia.
                      </p>
                    ) : (
                      <div className="relative border-l-2 border-slate-200 pl-4 ml-2 space-y-6">
                        {trazabilidadLead.historial.map((ac: any, idx: number) => {
                          const esLlamada = ac.canal === "llamada";
                          const esExito = ac.status === "enviado" || ac.status === "llamada_completada" || ac.status === "sms_enviado";
                          return (
                            <div key={ac.id} className="relative">
                              {/* Círculo indicador del timeline */}
                              <span className={`absolute -left-[23px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white ${
                                esExito ? "bg-emerald-500" : "bg-amber-500"
                              }`} />
                              
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-800 capitalize">
                                    {ac.canal === "whatsapp" ? "💬 WhatsApp" : ac.canal === "email" ? "✉️ Correo" : ac.canal === "sms" ? "📱 SMS" : "📞 Llamada"}
                                  </span>
                                  <span className={`rounded-full px-1.5 py-0.1 text-[9px] font-bold ${
                                    esExito ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                  }`}>
                                    {ac.status.toUpperCase()}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {new Date(ac.enviado_at).toLocaleString()}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                                  {ac.contenido_enviado}
                                </p>
                                {ac.error_detalle && (
                                  <p className="mt-1 text-[10px] text-red-600 bg-red-50 p-1.5 rounded">
                                    Error: {ac.error_detalle}
                                  </p>
                                )}
                                {ac.notas_asesor && (
                                  <p className="mt-1 text-[10px] text-slate-500 italic">
                                    Nota Asesor: "{ac.notas_asesor}"
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Vista 5: Analytics de Rendimiento */}
          {vistaActiva === "analytics" && analytics && (
            <div className="space-y-6">
              {/* KPIs Globales */}
              <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-center">
                  <p className="text-2xl font-bold text-[#2D4A2B]">{analytics.global.totalLeads}</p>
                  <p className="text-xs text-slate-500 mt-1">Leads Totales</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-center">
                  <p className="text-2xl font-bold text-amber-600">{analytics.global.activos}</p>
                  <p className="text-xs text-slate-500 mt-1">Leads Activos</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-center">
                  <p className="text-2xl font-bold text-emerald-600">{analytics.global.salidosRespondio}</p>
                  <p className="text-xs text-slate-500 mt-1">Respondieron</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-center">
                  <p className="text-2xl font-bold text-[#C9A961]">{analytics.global.tasaRespuestaGlobal}%</p>
                  <p className="text-xs text-slate-500 mt-1">Conversión Total</p>
                </div>
              </div>

              {/* Tasa por canal */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="font-titular text-lg font-bold text-[#2D4A2B]">Efectividad por Canal</h3>
                <div className="space-y-3.5">
                  {Object.entries(analytics.canales).map(([canal, stat]: any) => (
                    <div key={canal} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-slate-700 capitalize">{canal}</span>
                        <span className="text-slate-500">
                          {stat.respuestas} respuestas de {stat.enviados} intentos ({stat.tasa}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div
                          className="bg-[#C9A961] h-2 rounded-full transition-all duration-500"
                          style={{ width: `${stat.tasa}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comparador de rendimiento */}
              <div className="rounded-xl bg-[#2D4A2B] text-white p-5 shadow space-y-2">
                <h3 className="font-titular text-md font-bold text-[#C9A961]">💡 Canal más Efectivo</h3>
                <p className="text-sm">
                  De acuerdo con el historial de secuencias cargado, el canal con mayor tasa de interacción para el segmento{" "}
                  <strong>todos</strong> es el canal de{" "}
                  <strong className="text-[#C9A961] capitalize">
                    {
                      Object.entries(analytics.canales).reduce(
                        (max: any, entry: any) => (entry[1].tasa > max[1].tasa ? entry : max),
                        ["ninguno", { tasa: 0 }]
                      )[0]
                    }
                  </strong>{" "}
                  con un índice de contacto promedio.
                </p>
              </div>

              {/* Monitoreo de Leads en Tiempo Real */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-3 gap-3">
                  <div>
                    <h3 className="font-titular text-sm font-bold text-[#2D4A2B] flex items-center gap-2">
                      <span className="text-emerald-600 text-md">📊</span> Monitoreo de Leads en Tiempo Real
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Visualiza de forma instantánea el progreso y trazabilidad paso a paso de cada prospecto.
                    </p>
                  </div>
                  
                  {/* Buscador y Filtros */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="text"
                      placeholder="Buscar por lead o secuencia..."
                      value={busquedaLeadMonitoreo}
                      onChange={(e) => setBusquedaLeadMonitoreo(e.target.value)}
                      className="rounded border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-[#2D4A2B] w-full md:w-48 placeholder-slate-400 bg-white"
                    />

                    <select
                      value={filtroNegocioMonitoreo}
                      onChange={(e) => setFiltroNegocioMonitoreo(e.target.value as any)}
                      className="rounded border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-[#2D4A2B] bg-white text-slate-700 font-semibold"
                    >
                      <option value="todos">Todos los Negocios</option>
                      <option value="traspaso_compra">Compra Directa (Traspaso)</option>
                      <option value="promocion_venta">Promoción de Viviendas</option>
                      <option value="solo_tramite">Armado de Expediente</option>
                      <option value="construccion-impermeabilizacion">Impermeabilización (Construcción)</option>
                    </select>
                    
                    <div className="flex rounded border border-slate-200 p-0.5 bg-slate-50 shrink-0 text-xs">
                      {(
                        [
                          ["todos", "Todos"],
                          ["activo", "Activos"],
                          ["respondio", "Respondieron"],
                          ["otros", "Otros"],
                        ] as const
                      ).map(([tipo, label]) => (
                        <button
                          key={tipo}
                          onClick={() => setFiltroEstadoMonitoreo(tipo)}
                          className={`px-3 py-1 rounded-sm font-semibold transition ${
                            filtroEstadoMonitoreo === tipo
                              ? "bg-white shadow-sm text-[#2D4A2B]"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tabla de Monitoreo */}
                <div className="overflow-auto max-h-[calc(100vh-250px)]">
                  {enrollmentsFiltrados.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs">
                      No se encontraron enrolamientos que coincidan con la búsqueda o filtro.
                    </div>
                  ) : (
                    <table className="w-full text-xs min-w-[700px]">
                      <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                        <tr className="border-b border-slate-100 text-slate-400 font-semibold text-left bg-white">
                          <th className="py-2.5 w-1/4">Lead y Secuencia</th>
                          <th className="py-2.5 w-1/6">Ingreso</th>
                          <th className="py-2.5 w-1/6">Último Contacto</th>
                          <th className="py-2.5">Progreso y Línea de Tiempo</th>
                          <th className="py-2.5 text-right w-1/6">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {enrollmentsFiltrados.map((en) => {
                          const steps = [...(en.sequence?.steps || [])].sort((a: any, b: any) => a.orden - b.orden);
                          
                          // Obtener última acción para fecha y canal
                          const ultAccion = en.actions && en.actions.length > 0
                            ? [...en.actions].sort((a: any, b: any) => new Date(b.enviado_at).getTime() - new Date(a.enviado_at).getTime())[0]
                            : null;

                          return (
                            <tr key={en.id} className="hover:bg-slate-50/50 transition">
                              <td className="py-3 pr-2">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`h-2 w-2 rounded-full shrink-0 ${
                                      en.status === 'activo'
                                        ? 'bg-amber-500 animate-pulse'
                                        : en.status === 'salido' && en.razon_salida === 'respondio'
                                        ? 'bg-emerald-500'
                                        : 'bg-slate-400'
                                    }`} />
                                    <span className="font-bold text-slate-800 text-[13px]">{en.nombre}</span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-mono">{en.phone}</p>
                                  <p className="text-[10px] text-slate-600 font-medium">
                                    Secuencia: <span className="text-slate-800 font-bold">{en.sequence?.nombre || "N/A"}</span>
                                  </p>
                                  {en.expediente?.tipo_negocio && (
                                    <div className="mt-1">
                                      <span className={`inline-block px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider ${
                                        en.expediente.tipo_negocio === "construccion-impermeabilizacion"
                                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                          : en.expediente.tipo_negocio === "traspaso_compra"
                                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                                          : en.expediente.tipo_negocio === "promocion_venta"
                                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                                          : "bg-slate-50 text-slate-700 border border-slate-200"
                                      }`}>
                                        {en.expediente.tipo_negocio === "construccion-impermeabilizacion" ? "Impermeabilización" :
                                         en.expediente.tipo_negocio === "traspaso_compra" ? "Compra Directa" :
                                         en.expediente.tipo_negocio === "promocion_venta" ? "Promoción" :
                                         en.expediente.tipo_negocio === "solo_tramite" ? "Trámite" : en.expediente.tipo_negocio}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 text-slate-600 pr-2">
                                <p className="font-medium">{new Date(en.enrolled_at).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' })}</p>
                                <p className="text-[10px] text-slate-400 font-medium">
                                  {(() => {
                                    const diff = Math.floor((new Date().getTime() - new Date(en.enrolled_at).getTime()) / (1000 * 60 * 60 * 24));
                                    if (diff === 0) return "hoy";
                                    if (diff === 1) return "hace 1 día";
                                    return `hace ${diff} días`;
                                  })()}
                                </p>
                              </td>
                              <td className="py-3 text-slate-600 pr-2">
                                {ultAccion ? (
                                  <div>
                                    <p className="font-bold text-slate-700 capitalize flex items-center gap-1">
                                      {ultAccion.canal === "whatsapp" && <span className="text-emerald-600">💬</span>}
                                      {ultAccion.canal === "email" && <span className="text-cielo">✉️</span>}
                                      {ultAccion.canal === "sms" && <span className="text-amber-500">📱</span>}
                                      {ultAccion.canal === "messenger" && <span className="text-blue-500">🔵</span>}
                                      {ultAccion.canal === "llamada" && <span className="text-slate-500">📞</span>}
                                      {ultAccion.canal}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                      {new Date(ultAccion.enviado_at).toLocaleDateString([], { day: '2-digit', month: '2-digit' })} a las {new Date(ultAccion.enviado_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic">—</span>
                                )}
                              </td>
                              <td className="py-3 pr-2">
                                {/* Línea de Tiempo del Lead */}
                                <div className="flex items-center gap-1">
                                  {steps.map((step, idx) => {
                                    // Buscar acción para este step
                                    const action = en.actions?.find((ac: any) => ac.step_id === step.id);
                                    
                                    let nodeClass = "bg-slate-100 border-slate-200 text-slate-400";
                                    let statusText = "Pendiente";
                                    
                                    const isCurrent = en.status === 'activo' && en.step_actual === step.orden;
                                    const isRespondedStep = en.status === 'salido' && en.razon_salida === 'respondio' && en.actions?.some((ac: any) => ac.step_id === step.id && (ac.status === 'respondido' || ac.respondido_at !== null));
                                    const isLastAttemptBeforeResponse = en.status === 'salido' && en.razon_salida === 'respondio' && !isRespondedStep && en.actions?.length > 0 && idx === steps.findIndex(s => s.id === ultAccion?.step_id);

                                    if (action) {
                                      if (action.status === "respondido" || action.respondido_at || isRespondedStep) {
                                        nodeClass = "bg-emerald-600 border-emerald-700 text-white animate-pulse ring-2 ring-emerald-200 ring-offset-1";
                                        statusText = "Respondido";
                                      } else if (action.status === "fallido") {
                                        nodeClass = "bg-rose-500 border-rose-600 text-white";
                                        statusText = "Fallido";
                                      } else if (action.status === "llamada_completada") {
                                        nodeClass = "bg-amber-500 border-amber-600 text-white";
                                        statusText = "Completado";
                                      } else {
                                        // enviado, sms_enviado, entregado, llamada_agendada
                                        nodeClass = "bg-[#2D4A2B] border-[#5C7A52] text-white";
                                        statusText = "Enviado";
                                      }
                                    } else if (isCurrent) {
                                      nodeClass = "bg-sky-500 border-sky-600 text-white animate-pulse ring-2 ring-sky-200 ring-offset-1";
                                      statusText = "En Curso";
                                    }

                                    // Si no hubo acción registrada de respuesta directa pero salieron por respuesta en este último paso
                                    if (isLastAttemptBeforeResponse) {
                                      nodeClass = "bg-emerald-600 border-emerald-700 text-white animate-pulse ring-2 ring-emerald-200 ring-offset-1";
                                      statusText = "Respondido";
                                    }

                                    return (
                                      <div key={step.id} className="flex items-center group relative">
                                        {/* Nodo Conector */}
                                        {idx > 0 && (
                                          <div className={`h-0.5 w-4 shrink-0 ${
                                            action ? "bg-[#2D4A2B]" : "bg-slate-100"
                                          }`} />
                                        )}

                                        {/* Círculo del Nodo */}
                                        <div
                                          className={`h-7 w-7 rounded-full border flex items-center justify-center font-bold text-[10px] cursor-help shadow-sm transition-all duration-300 hover:scale-110 ${nodeClass}`}
                                          title={`Paso ${step.orden}: ${step.canal.toUpperCase()} - ${statusText}`}
                                        >
                                          {step.canal === "whatsapp" && "WA"}
                                          {step.canal === "email" && "EM"}
                                          {step.canal === "sms" && "SM"}
                                          {step.canal === "messenger" && "ME"}
                                          {step.canal === "llamada" && "LL"}

                                          {/* Tooltip Detallado */}
                                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10 w-48 bg-slate-800 text-white text-[10px] rounded p-2 shadow-lg space-y-1">
                                            <p className="font-bold border-b border-slate-700 pb-0.5 flex justify-between">
                                              <span>Paso {step.orden}: {step.canal.toUpperCase()}</span>
                                              <span className="text-amber-400 font-semibold">{statusText}</span>
                                            </p>
                                            {action ? (
                                              <>
                                                <p className="text-slate-300">Enviado: {new Date(action.enviado_at).toLocaleDateString()} {new Date(action.enviado_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                                {action.respondido_at && (
                                                  <p className="text-emerald-400 font-medium">Respondido: {new Date(action.respondido_at).toLocaleDateString()} {new Date(action.respondido_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                                )}
                                                {action.error_detalle && (
                                                  <p className="text-rose-400 italic">Error: {action.error_detalle}</p>
                                                )}
                                              </>
                                            ) : isCurrent ? (
                                              <p className="text-slate-300">Lead actualmente esperando o ejecutándose en este paso.</p>
                                            ) : (
                                              <p className="text-slate-400 italic">Paso pendiente de ejecución.</p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="py-3 text-right">
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => verHistorialLead(en.phone)}
                                    className="rounded bg-white border border-slate-200 hover:border-[#2D4A2B] hover:text-[#2D4A2B] text-slate-600 font-semibold px-2 py-1 transition text-[10px] shadow-sm shrink-0"
                                  >
                                    Historial
                                  </button>
                                  {en.prospecto_id && (
                                    <a
                                      href={`/prospectos/${en.prospecto_id}`}
                                      className="rounded bg-[#F5F1E8] border border-slate-200 hover:border-[#C9A961] hover:text-[#C9A961] text-[#2D4A2B] font-semibold px-2 py-1 transition text-[10px] shadow-sm shrink-0 flex items-center justify-center"
                                    >
                                      Ficha
                                    </a>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* QUICK DIALOG: ENROLAR LEAD EN SECUENCIA */}
      {mostrarModalEnrolar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-titular text-md font-bold text-[#2D4A2B]">Enrolar Lead en Secuencia</h3>
              <button onClick={() => setMostrarModalEnrolar(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={enrolarLeadSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={leadFormData.nombre}
                  onChange={(e) => setLeadFormData({ ...leadFormData, nombre: e.target.value })}
                  placeholder="Ej. Juan Pérez"
                  className="mt-1 block w-full rounded border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase">Teléfono (10 dígitos)</label>
                <input
                  type="tel"
                  required
                  value={leadFormData.phone}
                  onChange={(e) => setLeadFormData({ ...leadFormData, phone: e.target.value })}
                  placeholder="Ej. 4771234567"
                  className="mt-1 block w-full rounded border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase">Email (Opcional)</label>
                <input
                  type="email"
                  value={leadFormData.email}
                  onChange={(e) => setLeadFormData({ ...leadFormData, email: e.target.value })}
                  placeholder="Ej. juan@correo.com"
                  className="mt-1 block w-full rounded border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase">ID Prospecto (Opcional)</label>
                  <input
                    type="text"
                    value={leadFormData.prospectoId}
                    onChange={(e) => setLeadFormData({ ...leadFormData, prospectoId: e.target.value })}
                    placeholder="PRO-001"
                    className="mt-1 block w-full rounded border-slate-300 px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase">ID Expediente (Opcional)</label>
                  <input
                    type="text"
                    value={leadFormData.expedienteId}
                    onChange={(e) => setLeadFormData({ ...leadFormData, expedienteId: e.target.value })}
                    placeholder="EXP-001"
                    className="mt-1 block w-full rounded border-slate-300 px-3 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 mt-4">
                <button
                  type="button"
                  onClick={() => setMostrarModalEnrolar(false)}
                  className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#2D4A2B] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#5C7A52]"
                >
                  Aceptar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
