"use client";

import { useState, useEffect } from "react";
import {
  listarProcesosMaestros,
  obtenerProcesoCompleto,
  crearProceso,
  duplicarProceso,
  actualizarProceso,
  guardarEtapasProceso,
  guardarEscalaciones,
  guardarAutomatizaciones,
  testearReglasProceso,
} from "@/app/actions/procesos-configuracion";
import type {
  ProcesoMaestro,
  EtapaConfiguracion,
  ReglaValidacion,
  EscalacionConfiguracion,
  AutomatizacionConfiguracion,
} from "@/lib/types";

export function obtenerModulosPorTipoNegocio(tipoNegocio: string) {
  const esImpermeabilizacion =
    tipoNegocio === "impermeabilizacion" || tipoNegocio === "construccion-impermeabilizacion";

  return [
    {
      zona: "ZONA 1",
      nombre: "👤 1. ENTIDAD PROSPECTO (Datos del Cliente / Contacto)",
      descripcion: "Información de la persona o cliente registrada en la entidad Prospecto",
      color: "bg-emerald-50/70 border-emerald-200 text-emerald-950",
      badge: "Entidad Prospecto",
      campos: [
        { clave: "telefono", etiqueta: "Teléfono de Contacto" },
        { clave: "prospectoCorreo", etiqueta: "Correo Electrónico" },
        { clave: "calificacion", etiqueta: "Calificación Comercial (Caliente/Templado/Frío)" },
        { clave: "origen", etiqueta: "Origen del Prospecto" },
      ],
    },
    {
      zona: "ZONA 2",
      nombre: `📁 2. WIDGETS DEL EXPEDIENTE (${esImpermeabilizacion ? "Sauceda Construye - Impermeabilización" : "Traspaso y Compra de Casas"})`,
      descripcion: "Información específica y exclusiva de la naturaleza de este modelo de negocio",
      color: "bg-indigo-50/70 border-indigo-200 text-indigo-950",
      badge: "Widgets Expediente",
      campos: esImpermeabilizacion
        ? [
            { clave: "direccionPropiedad", etiqueta: "Dirección del Inmueble" },
            { clave: "fraccionamiento", etiqueta: "Fraccionamiento / Zona" },
            { clave: "estadoFisico", etiqueta: "Estado Físico de Azotea / Losa" },
            { clave: "m2Superficie", etiqueta: "Metros Cuadrados de Losa (m²)" },
          ]
        : [
            { clave: "direccionPropiedad", etiqueta: "Dirección de la Propiedad" },
            { clave: "fraccionamiento", etiqueta: "Fraccionamiento / Zona" },
            { clave: "valorEstimado", etiqueta: "Valor Estimado / Avalúo ($)" },
            { clave: "habitada", etiqueta: "Propiedad Habitada (Sí/No)" },
            { clave: "estadoFisico", etiqueta: "Estado Físico del Inmueble" },
            { clave: "nss", etiqueta: "Número de Seguro Social (NSS)" },
            { clave: "curp", etiqueta: "CURP del Habiente" },
            { clave: "tipoCredito", etiqueta: "Tipo de Crédito (Infonavit/Bancario)" },
            { clave: "saldoDeuda", etiqueta: "Saldo de Deuda Hipotecaria ($)" },
            { clave: "sinPagos", etiqueta: "Estatus de Adeudo / Retraso" },
          ],
    },
    {
      zona: "ZONA 3",
      nombre: "⚙️ 3. MÓDULOS SISTÉMICOS VINCULADOS (Operaciones & Finanzas)",
      descripcion: "Órdenes de trabajo del equipo técnico y registros financieros vinculados al expediente",
      color: "bg-amber-50/70 border-amber-200 text-amber-950",
      badge: "Módulos Sistémicos",
      campos: [
        { clave: "montoCotizado", etiqueta: "Monto de Cotización Comercial ($)" },
        { clave: "anticipoRecibido", etiqueta: "Anticipo Registrado ($)" },
        { clave: "saldoPendienteCobro", etiqueta: "Saldo Pendiente por Cobrar ($)" },
        { clave: "remisionFolio", etiqueta: "Folio de Remisión / Factura" },
        { clave: "vigenciaGarantia", etiqueta: "Años de Garantía (3, 5, 10 años)" },
        { clave: "tareasBpmCompletas", etiqueta: "Todas las Tareas BPM Completadas" },
      ],
    },
  ];
}

interface Props {
  procesosIniciales?: ProcesoMaestro[];
  procesoInicialCompleto?: ProcesoMaestro | null;
}

export function ConfiguradorProcesosClient({
  procesosIniciales = [],
  procesoInicialCompleto = null,
}: Props) {
  const [procesos, setProcesos] = useState<ProcesoMaestro[]>(procesosIniciales);
  const [procesoSel, setProcesoSel] = useState<ProcesoMaestro | null>(procesoInicialCompleto);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [tabActiva, setTabActiva] = useState<"etapas" | "escalaciones" | "webhooks" | "simulador">("etapas");
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  // Form Nuevo / Duplicar
  const [mostrarModalNuevo, setMostrarModalNuevo] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoTipoNegocio, setNuevoTipoNegocio] = useState("");
  const [nuevoEntidadTarget, setNuevoEntidadTarget] = useState<"expediente" | "prospecto">("expediente");
  const [nuevoDescripcion, setNuevoDescripcion] = useState("");

  const [mostrarModalDuplicar, setMostrarModalDuplicar] = useState(false);
  const [duplicarNombre, setDuplicarNombre] = useState("");
  const [duplicarTipo, setDuplicarTipo] = useState("");
  const [duplicarEntidadTarget, setDuplicarEntidadTarget] = useState<"expediente" | "prospecto">("expediente");

  // Modificación en vivo de Etapas
  const [etapasEditables, setEtapasEditables] = useState<EtapaConfiguracion[]>(
    procesoInicialCompleto?.etapas || []
  );
  const [escalacionesEditables, setEscalacionesEditables] = useState<EscalacionConfiguracion[]>(
    procesoInicialCompleto?.escalaciones || []
  );
  const [automatizacionesEditables, setAutomatizacionesEditables] = useState<AutomatizacionConfiguracion[]>(
    procesoInicialCompleto?.automatizaciones || []
  );

  // Simulador
  const [simEtapa, setSimEtapa] = useState(
    procesoInicialCompleto?.etapas && procesoInicialCompleto.etapas.length > 0
      ? procesoInicialCompleto.etapas[0].claveEtapa
      : ""
  );
  const [simDatos, setSimDatos] = useState<Record<string, any>>({
    telefono: "4771234567",
    valorEstimado: 850000,
    saldoDeuda: 0,
    direccionPropiedad: "Av. Universidad 102",
  });
  const [resSimulacion, setResSimulacion] = useState<{ valido: boolean; errores: string[] } | null>(null);

  async function cargarLista() {
    setCargando(true);
    try {
      const lista = await listarProcesosMaestros();
      setProcesos(lista);
      const imp = lista.find((p) => p.tipoNegocio === "impermeabilizacion");
      const defaultProc = imp || lista[0];
      if (defaultProc && (!procesoSel || !lista.find((p) => p.id === procesoSel.id))) {
        await seleccionarProceso(defaultProc.id);
      }
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: `Error al cargar procesos: ${err.message}` });
    } finally {
      setCargando(false);
    }
  }

  async function seleccionarProceso(id: string) {
    setCargando(true);
    try {
      const pComp = await obtenerProcesoCompleto(id);
      if (pComp) {
        setProcesoSel(pComp);
        setEtapasEditables(pComp.etapas || []);
        setEscalacionesEditables(pComp.escalaciones || []);
        setAutomatizacionesEditables(pComp.automatizaciones || []);
        if (pComp.etapas && pComp.etapas.length > 0) {
          setSimEtapa(pComp.etapas[0].claveEtapa);
        }
      }
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err.message });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (procesosIniciales.length === 0) {
      void cargarLista();
    }
  }, []);

  async function handleCrearProceso() {
    if (!nuevoNombre || !nuevoTipoNegocio) return;
    setGuardando(true);
    try {
      const nProc = await crearProceso({
        nombre: nuevoNombre,
        descripcion: nuevoDescripcion,
        tipoNegocio: nuevoTipoNegocio.toLowerCase().replace(/\s+/g, "_"),
        entidadTarget: nuevoEntidadTarget,
      });
      setMostrarModalNuevo(false);
      setNuevoNombre("");
      setNuevoTipoNegocio("");
      setNuevoDescripcion("");
      await cargarLista();
      await seleccionarProceso(nProc.id);
      setMensaje({ tipo: "ok", texto: `¡Proceso de entidad "${nuevoEntidadTarget === 'expediente' ? '📁 Expediente' : '👤 Prospecto'}" creado exitosamente!` });
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err.message });
    } finally {
      setGuardando(false);
    }
  }

  async function handleDuplicarProceso() {
    if (!procesoSel || !duplicarNombre || !duplicarTipo) return;
    setGuardando(true);
    try {
      const nProc = await duplicarProceso(
        procesoSel.id,
        duplicarNombre,
        duplicarTipo.toLowerCase().replace(/\s+/g, "_"),
        duplicarEntidadTarget
      );
      setMostrarModalDuplicar(false);
      setDuplicarNombre("");
      setDuplicarTipo("");
      await cargarLista();
      await seleccionarProceso(nProc.id);
      setMensaje({ tipo: "ok", texto: `Proceso duplicado correctamente como "${nProc.nombre}".` });
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err.message });
    } finally {
      setGuardando(false);
    }
  }

  async function handleGuardarConfiguracion() {
    if (!procesoSel) return;
    setGuardando(true);
    setMensaje(null);
    try {
      await guardarEtapasProceso(procesoSel.id, etapasEditables);
      await guardarEscalaciones(procesoSel.id, escalacionesEditables);
      await guardarAutomatizaciones(procesoSel.id, automatizacionesEditables);
      
      await seleccionarProceso(procesoSel.id);
      setMensaje({ tipo: "ok", texto: "¡Configuración de etapas, SLAs y reglas guardada sin redeploy!" });
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: `Error al guardar: ${err.message}` });
    } finally {
      setGuardando(false);
    }
  }

  function handleAgregarEtapa() {
    const num = etapasEditables.length + 1;
    const nueva: EtapaConfiguracion = {
      id: `temp-${Date.now()}`,
      procesoId: procesoSel?.id || "",
      claveEtapa: `etapa-${num}`,
      nombre: `Nueva Etapa ${num}`,
      orden: num,
      slaDias: 7,
      camposRequeridos: [],
      validaciones: [],
    };
    setEtapasEditables([...etapasEditables, nueva]);
  }

  function handleEliminarEtapa(index: number) {
    const nuevaLista = etapasEditables.filter((_, i) => i !== index);
    setEtapasEditables(nuevaLista);
  }

  function handleMoverEtapa(index: number, direccion: "up" | "down") {
    if (
      (direccion === "up" && index === 0) ||
      (direccion === "down" && index === etapasEditables.length - 1)
    ) {
      return;
    }
    const lista = [...etapasEditables];
    const targetIdx = direccion === "up" ? index - 1 : index + 1;
    const temp = lista[index];
    lista[index] = lista[targetIdx];
    lista[targetIdx] = temp;

    setEtapasEditables(lista);
  }

  function handleToggleCampoRequerido(etapaIdx: number, campoClave: string) {
    const lista = [...etapasEditables];
    const e = { ...lista[etapaIdx] };
    const reqs = new Set(e.camposRequeridos || []);
    if (reqs.has(campoClave)) {
      reqs.delete(campoClave);
    } else {
      reqs.add(campoClave);
    }
    e.camposRequeridos = Array.from(reqs);
    lista[etapaIdx] = e;
    setEtapasEditables(lista);
  }

  function handleAgregarReglaValidacion(etapaIdx: number) {
    const lista = [...etapasEditables];
    const e = { ...lista[etapaIdx] };
    const nRegla: ReglaValidacion = {
      id: `regla-${Date.now()}`,
      campo: "valorEstimado",
      operador: "mayor_que",
      valor: "0",
      mensajeError: "Debe ingresar un valor estimado mayor a 0",
    };
    e.validaciones = [...(e.validaciones || []), nRegla];
    lista[etapaIdx] = e;
    setEtapasEditables(lista);
  }

  function handleEliminarReglaValidacion(etapaIdx: number, reglaIdx: number) {
    const lista = [...etapasEditables];
    const e = { ...lista[etapaIdx] };
    e.validaciones = (e.validaciones || []).filter((_, i) => i !== reglaIdx);
    lista[etapaIdx] = e;
    setEtapasEditables(lista);
  }

  async function handleEjecutarSimulador() {
    if (!procesoSel || !simEtapa) return;
    try {
      const res = await testearReglasProceso(procesoSel.id, simEtapa, simDatos);
      setResSimulacion(res);
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: `Error simulador: ${err.message}` });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-carbon/10 bg-white p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚙️</span>
            <h1 className="font-titular text-xl sm:text-2xl font-bold text-verde-profundo">
              Configurador de Procesos Parametrizable
            </h1>
          </div>
          <p className="text-xs text-carbon/60 mt-1 max-w-2xl">
            Edita SLAs, reglas IF/THEN, campos requeridos y webhooks de n8n sin redeploy.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setMostrarModalNuevo(true)}
            className="rounded-lg bg-sauce hover:bg-verde-profundo text-white font-bold px-3.5 py-2 text-xs transition flex items-center gap-1 shadow-xs cursor-pointer"
          >
            + Nuevo Proceso
          </button>
          {procesoSel && (
            <button
              type="button"
              onClick={() => {
                setDuplicarNombre(`${procesoSel.nombre} (Copia)`);
                setDuplicarTipo(`${procesoSel.tipoNegocio}_copia`);
                setMostrarModalDuplicar(true);
              }}
              className="rounded-lg border border-carbon/20 bg-carbon/5 hover:bg-carbon/10 text-carbon font-bold px-3 py-2 text-xs transition flex items-center gap-1 cursor-pointer"
            >
              📋 Duplicar Proceso
            </button>
          )}
        </div>
      </div>

      {mensaje && (
        <div
          className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            mensaje.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span>{mensaje.texto}</span>
          <button type="button" onClick={() => setMensaje(null)} className="text-carbon/40 hover:text-carbon font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Selector y Metadatos de la Entidad del Proceso Activo */}
      <div className="rounded-xl border border-carbon/10 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 flex-wrap">
            <label className="text-xs font-bold uppercase tracking-wider text-carbon/60 shrink-0">
              Proceso Activo:
            </label>
            <select
              value={procesoSel?.id || ""}
              onChange={(e) => void seleccionarProceso(e.target.value)}
              disabled={cargando}
              className="w-full sm:w-auto min-w-[240px] rounded-lg border border-carbon/20 bg-slate-50 px-3 py-2 text-xs font-bold text-verde-profundo outline-none focus:border-sauce"
            >
              {procesos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.entidadTarget === "prospecto" ? "👤 Prospecto" : "📁 Expediente"} - {p.nombre} ({p.tipoNegocio})
                </option>
              ))}
            </select>

            {/* Selector INTERNO para cambiar la Entidad del Proceso activo */}
            {procesoSel && (
              <div className="flex items-center gap-2 bg-slate-100 border border-slate-300 px-3 py-1.5 rounded-lg shadow-2xs">
                <span className="text-xs font-bold text-carbon/70 uppercase shrink-0">
                  Entidad del Proceso:
                </span>
                <select
                  value={procesoSel.entidadTarget || "expediente"}
                  onChange={async (e) => {
                    const nuevaEntidad = e.target.value as "expediente" | "prospecto";
                    try {
                      await actualizarProceso(procesoSel.id, { entidadTarget: nuevaEntidad });
                      setProcesoSel({ ...procesoSel, entidadTarget: nuevaEntidad });
                      const nLista = procesos.map((p) =>
                        p.id === procesoSel.id ? { ...p, entidadTarget: nuevaEntidad } : p
                      );
                      setProcesos(nLista);
                      setMensaje({
                        tipo: "ok",
                        texto: `Entidad del proceso cambiada exitosamente a: ${
                          nuevaEntidad === "expediente" ? "📁 Entidad EXPEDIENTE" : "👤 Entidad PROSPECTO"
                        }`,
                      });
                    } catch (err: any) {
                      setMensaje({ tipo: "error", texto: `Error al cambiar entidad: ${err.message}` });
                    }
                  }}
                  className="bg-white border border-carbon/20 rounded px-2 py-1 text-xs font-bold text-verde-profundo outline-none cursor-pointer hover:border-sauce"
                >
                  <option value="expediente">📁 Entidad EXPEDIENTE (Proyecto / Casa / Obra)</option>
                  <option value="prospecto">👤 Entidad PROSPECTO (Lead / Contacto Comercial)</option>
                </select>
              </div>
            )}
          </div>

          {procesoSel && (
            <button
              type="button"
              onClick={handleGuardarConfiguracion}
              disabled={guardando}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 text-xs transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5 justify-center shrink-0"
            >
              {guardando ? "Guardando..." : "💾 Guardar Todos los Cambios"}
            </button>
          )}
        </div>
      </div>

      {/* Pestañas de Configuración */}
      {procesoSel && (
        <div className="space-y-4">
          <div className="flex rounded-xl border border-carbon/10 bg-white p-1 shadow-xs text-xs font-bold flex-wrap">
            <button
              type="button"
              onClick={() => setTabActiva("etapas")}
              className={`flex-1 py-2 px-3 rounded-lg transition ${
                tabActiva === "etapas" ? "bg-sauce text-white shadow-2xs" : "text-carbon/60 hover:text-carbon"
              }`}
            >
              📊 1. Etapas, SLAs y Validaciones ({etapasEditables.length})
            </button>
            <button
              type="button"
              onClick={() => setTabActiva("escalaciones")}
              className={`flex-1 py-2 px-3 rounded-lg transition ${
                tabActiva === "escalaciones" ? "bg-sauce text-white shadow-2xs" : "text-carbon/60 hover:text-carbon"
              }`}
            >
              ⏰ 2. Escalaciones Automáticas ({escalacionesEditables.length})
            </button>
            <button
              type="button"
              onClick={() => setTabActiva("webhooks")}
              className={`flex-1 py-2 px-3 rounded-lg transition ${
                tabActiva === "webhooks" ? "bg-sauce text-white shadow-2xs" : "text-carbon/60 hover:text-carbon"
              }`}
            >
              🔗 3. Webhooks n8n ({automatizacionesEditables.length})
            </button>
            <button
              type="button"
              onClick={() => setTabActiva("simulador")}
              className={`flex-1 py-2 px-3 rounded-lg transition ${
                tabActiva === "simulador" ? "bg-sauce text-white shadow-2xs" : "text-carbon/60 hover:text-carbon"
              }`}
            >
              🧪 4. Probador / Simulador
            </button>
          </div>

          {/* Tab 1: Etapas, SLAs y Validaciones */}
          {tabActiva === "etapas" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-titular text-sm font-bold text-verde-profundo uppercase tracking-wider">
                  Etapas Secuenciales del Proceso
                </h3>
                <button
                  type="button"
                  onClick={handleAgregarEtapa}
                  className="rounded-lg border border-sauce/30 bg-sauce/10 text-sauce hover:bg-sauce hover:text-white font-bold px-3 py-1.5 text-xs transition cursor-pointer"
                >
                  + Agregar Etapa
                </button>
              </div>

              <div className="space-y-4">
                {etapasEditables.map((etapa, idx) => (
                  <div key={etapa.id || idx} className="rounded-xl border border-carbon/10 bg-white p-4 sm:p-5 shadow-xs space-y-4">
                    {/* Header Etapa */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-carbon/5 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-verde-profundo/10 text-xs font-bold font-mono text-verde-profundo">
                          #{idx + 1}
                        </span>
                        <input
                          type="text"
                          value={etapa.nombre}
                          onChange={(e) => {
                            const lista = [...etapasEditables];
                            lista[idx].nombre = e.target.value;
                            setEtapasEditables(lista);
                          }}
                          className="font-titular text-sm font-bold text-carbon border-b border-dashed border-carbon/30 focus:border-sauce outline-none px-1 py-0.5"
                          placeholder="Nombre de la etapa"
                        />
                        <span className="text-[10px] font-mono text-carbon/40 bg-carbon/5 px-2 py-0.5 rounded">
                          clave: {etapa.claveEtapa}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* SLA en Días Editable */}
                        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                          <span className="text-[10px] font-bold text-amber-800 uppercase">SLA (Días):</span>
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={etapa.slaDias}
                            onChange={(e) => {
                              const lista = [...etapasEditables];
                              lista[idx].slaDias = parseInt(e.target.value) || 1;
                              setEtapasEditables(lista);
                            }}
                            className="w-12 text-center text-xs font-bold text-amber-900 bg-white border border-amber-300 rounded outline-none"
                          />
                        </div>

                        {/* Botones Mover / Eliminar */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoverEtapa(idx, "up")}
                            disabled={idx === 0}
                            className="p-1 text-xs rounded hover:bg-carbon/5 disabled:opacity-30"
                            title="Mover arriba"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoverEtapa(idx, "down")}
                            disabled={idx === etapasEditables.length - 1}
                            className="p-1 text-xs rounded hover:bg-carbon/5 disabled:opacity-30"
                            title="Mover abajo"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEliminarEtapa(idx)}
                            className="p-1 text-xs text-rose-600 rounded hover:bg-rose-50"
                            title="Eliminar etapa"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Campos Obligatorios para avanzar organizados por Módulo del Proceso */}
                    {(() => {
                      const modulosCampos = obtenerModulosPorTipoNegocio(procesoSel?.tipoNegocio || "");
                      return (
                        <div className="space-y-3">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-carbon/60">
                            📌 Campos Obligatorios por Módulo ({procesoSel?.nombre}):
                          </label>

                          <div className="space-y-2.5">
                            {modulosCampos.map((mod) => (
                              <div key={mod.nombre} className={`p-3 rounded-xl border ${mod.color}`}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[11px] font-bold uppercase tracking-wider">
                                    {mod.nombre}
                                  </span>
                                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-white/60">
                                    {mod.badge}
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {mod.campos.map((c) => {
                                    const seleccionado = (etapa.camposRequeridos || []).includes(c.clave);
                                    return (
                                      <button
                                        key={c.clave}
                                        type="button"
                                        onClick={() => handleToggleCampoRequerido(idx, c.clave)}
                                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition border ${
                                          seleccionado
                                            ? "bg-verde-profundo text-white border-verde-profundo shadow-2xs"
                                            : "bg-white text-carbon/80 border-carbon/20 hover:bg-slate-50"
                                        }`}
                                      >
                                        {c.etiqueta} {seleccionado && "✓"}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Constructor Visual de Reglas IF/THEN */}
                    <div className="space-y-2 pt-2 border-t border-carbon/5">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-carbon/60">
                          ⚡ Validaciones Avanzadas (Constructor Visual IF/THEN):
                        </label>
                        <button
                          type="button"
                          onClick={() => handleAgregarReglaValidacion(idx)}
                          className="text-[11px] font-bold text-sauce hover:underline"
                        >
                          + Agregar Regla IF/THEN
                        </button>
                      </div>

                      {(etapa.validaciones || []).length === 0 ? (
                        <p className="text-[11px] text-carbon/40 italic">No hay reglas complejas configuradas para esta etapa.</p>
                      ) : (
                        <div className="space-y-2">
                          {(etapa.validaciones || []).map((regla, rIdx) => (
                            <div key={regla.id || rIdx} className="p-2.5 rounded-lg border border-carbon/15 bg-slate-50 flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
                              <span className="font-bold text-sauce">SI</span>

                              <select
                                value={regla.campo}
                                onChange={(e) => {
                                  const lista = [...etapasEditables];
                                  lista[idx].validaciones[rIdx].campo = e.target.value;
                                  setEtapasEditables(lista);
                                }}
                                className="rounded border border-carbon/20 bg-white px-2 py-1 outline-none font-semibold"
                              >
                                {obtenerModulosPorTipoNegocio(procesoSel?.tipoNegocio || "").map((mod) => (
                                  <optgroup key={mod.nombre} label={mod.nombre}>
                                    {mod.campos.map((c) => (
                                      <option key={c.clave} value={c.clave}>
                                        [{mod.badge}] {c.etiqueta}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>

                              <select
                                value={regla.operador}
                                onChange={(e) => {
                                  const lista = [...etapasEditables];
                                  lista[idx].validaciones[rIdx].operador = e.target.value as any;
                                  setEtapasEditables(lista);
                                }}
                                className="rounded border border-carbon/20 bg-white px-2 py-1 outline-none font-bold"
                              >
                                <option value="mayor_que">es mayor que &gt;</option>
                                <option value="menor_que">es menor que &lt;</option>
                                <option value="es_igual">es igual a =</option>
                                <option value="no_es_igual">no es igual a ≠</option>
                                <option value="esta_vacio">está vacío</option>
                                <option value="no_esta_vacio">no está vacío</option>
                              </select>

                              <input
                                type="text"
                                value={regla.valor}
                                onChange={(e) => {
                                  const lista = [...etapasEditables];
                                  lista[idx].validaciones[rIdx].valor = e.target.value;
                                  setEtapasEditables(lista);
                                }}
                                placeholder="Valor a comparar"
                                className="rounded border border-carbon/20 bg-white px-2 py-1 outline-none flex-1"
                              />

                              <span className="font-bold text-rose-700">ENTONCES Error:</span>

                              <input
                                type="text"
                                value={regla.mensajeError}
                                onChange={(e) => {
                                  const lista = [...etapasEditables];
                                  lista[idx].validaciones[rIdx].mensajeError = e.target.value;
                                  setEtapasEditables(lista);
                                }}
                                placeholder="Mensaje de error para el usuario"
                                className="rounded border border-carbon/20 bg-white px-2 py-1 outline-none flex-1"
                              />

                              <button
                                type="button"
                                onClick={() => handleEliminarReglaValidacion(idx, rIdx)}
                                className="text-rose-600 font-bold px-1 hover:bg-rose-100 rounded"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 2: Escalaciones Automáticas */}
          {tabActiva === "escalaciones" && (
            <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-carbon/5 pb-3">
                <div>
                  <h3 className="font-titular text-sm font-bold text-verde-profundo uppercase tracking-wider">
                    Escalaciones Automáticas por SLA
                  </h3>
                  <p className="text-xs text-carbon/50">
                    Acciones que el sistema ejecuta automáticamente cuando se excede el plazo en días.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nueva: EscalacionConfiguracion = {
                      id: `esc-${Date.now()}`,
                      procesoId: procesoSel.id,
                      nombreRegla: "Notificar a Gerencia por SLA Vencido",
                      condicion: { dias_vencidos: 1 },
                      accionTipo: "notificar_gerente",
                      parametros: {},
                      activo: true,
                    };
                    setEscalacionesEditables([...escalacionesEditables, nueva]);
                  }}
                  className="rounded-lg border border-sauce/30 bg-sauce/10 text-sauce hover:bg-sauce hover:text-white font-bold px-3 py-1.5 text-xs transition cursor-pointer"
                >
                  + Nueva Escalación
                </button>
              </div>

              {escalacionesEditables.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-carbon/15 rounded-lg bg-carbon/[0.01]">
                  <p className="text-xs text-carbon/40">No hay reglas de escalación configuradas.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {escalacionesEditables.map((esc, eIdx) => (
                    <div key={esc.id || eIdx} className="p-3.5 rounded-xl border border-carbon/10 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <input
                          type="text"
                          value={esc.nombreRegla}
                          onChange={(e) => {
                            const lista = [...escalacionesEditables];
                            lista[eIdx].nombreRegla = e.target.value;
                            setEscalacionesEditables(lista);
                          }}
                          className="font-bold text-xs text-carbon border-b border-dashed border-carbon/20 outline-none w-full sm:w-auto"
                        />
                        <div className="flex items-center gap-2 text-xs text-carbon/60">
                          <span>Acción:</span>
                          <select
                            value={esc.accionTipo}
                            onChange={(e) => {
                              const lista = [...escalacionesEditables];
                              lista[eIdx].accionTipo = e.target.value as any;
                              setEscalacionesEditables(lista);
                            }}
                            className="rounded border border-carbon/20 bg-white px-2 py-0.5 font-semibold text-carbon"
                          >
                            <option value="notificar_gerente">Notificar a Gerencia</option>
                            <option value="reasignar_operador">Reasignar a Operador</option>
                            <option value="marcar_frio">Marcar Expediente como Frío</option>
                            <option value="webhook_n8n">Enviar Webhook n8n</option>
                          </select>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const lista = escalacionesEditables.filter((_, i) => i !== eIdx);
                          setEscalacionesEditables(lista);
                        }}
                        className="text-xs text-rose-600 font-bold hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Webhooks n8n */}
          {tabActiva === "webhooks" && (
            <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-carbon/5 pb-3">
                <div>
                  <h3 className="font-titular text-sm font-bold text-verde-profundo uppercase tracking-wider">
                    Integración con Webhooks n8n
                  </h3>
                  <p className="text-xs text-carbon/50">
                    Dispara flujos externos en n8n ante eventos clave del proceso.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nueva: AutomatizacionConfiguracion = {
                      id: `aut-${Date.now()}`,
                      procesoId: procesoSel.id,
                      eventoTipo: "al_entrar_etapa",
                      webhookUrlN8n: "https://n8n.sauceda.com/webhook/ejemplo",
                      payloadTemplate: {},
                      activo: true,
                    };
                    setAutomatizacionesEditables([...automatizacionesEditables, nueva]);
                  }}
                  className="rounded-lg border border-sauce/30 bg-sauce/10 text-sauce hover:bg-sauce hover:text-white font-bold px-3 py-1.5 text-xs transition cursor-pointer"
                >
                  + Nuevo Webhook n8n
                </button>
              </div>

              {automatizacionesEditables.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-carbon/15 rounded-lg bg-carbon/[0.01]">
                  <p className="text-xs text-carbon/40">No hay webhooks de n8n configurados para este proceso.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {automatizacionesEditables.map((aut, aIdx) => (
                    <div key={aut.id || aIdx} className="p-4 rounded-xl border border-carbon/10 bg-slate-50/50 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-carbon/60 mb-1">Evento Detonador</label>
                          <select
                            value={aut.eventoTipo}
                            onChange={(e) => {
                              const lista = [...automatizacionesEditables];
                              lista[aIdx].eventoTipo = e.target.value as any;
                              setAutomatizacionesEditables(lista);
                            }}
                            className="w-full rounded border border-carbon/20 bg-white px-2 py-1 text-xs font-semibold"
                          >
                            <option value="al_entrar_etapa">Al Entrar a Etapa</option>
                            <option value="al_salir_etapa">Al Salir de Etapa</option>
                            <option value="al_vencer_sla">Al Vencer SLA</option>
                            <option value="al_detectar_pago">Al Detectar Pago</option>
                            <option value="al_cambiar_calificacion">Al Cambiar Calificación</option>
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold uppercase text-carbon/60 mb-1">Webhook URL n8n</label>
                          <input
                            type="url"
                            value={aut.webhookUrlN8n}
                            onChange={(e) => {
                              const lista = [...automatizacionesEditables];
                              lista[aIdx].webhookUrlN8n = e.target.value;
                              setAutomatizacionesEditables(lista);
                            }}
                            placeholder="https://n8n.tu-servidor.com/webhook/..."
                            className="w-full rounded border border-carbon/20 bg-white px-3 py-1 text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const lista = automatizacionesEditables.filter((_, i) => i !== aIdx);
                            setAutomatizacionesEditables(lista);
                          }}
                          className="text-xs text-rose-600 font-bold hover:underline"
                        >
                          Eliminar Webhook
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Probador / Simulador */}
          {tabActiva === "simulador" && (
            <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-xs space-y-4">
              <div className="border-b border-carbon/5 pb-3">
                <h3 className="font-titular text-sm font-bold text-verde-profundo uppercase tracking-wider">
                  Probador e Inspector de Reglas (Simulador)
                </h3>
                <p className="text-xs text-carbon/50">
                  Prueba si un expediente dummy pasaría las validaciones antes de guardarlo en producción.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-carbon/70 mb-1">Etapa a Simular:</label>
                  <select
                    value={simEtapa}
                    onChange={(e) => setSimEtapa(e.target.value)}
                    className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-bold text-verde-profundo outline-none"
                  >
                    {etapasEditables.map((e) => (
                      <option key={e.claveEtapa} value={e.claveEtapa}>
                        {e.nombre} ({e.claveEtapa})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleEjecutarSimulador}
                    className="w-full rounded-lg bg-sauce hover:bg-verde-profundo text-white font-bold py-2 px-4 text-xs transition cursor-pointer"
                  >
                    ⚡ Ejecutar Prueba de Reglas
                  </button>
                </div>
              </div>

              {/* Editor de Datos Dummy */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-carbon/70">Datos de Entrada de Prueba (JSON / Atributos):</label>
                <textarea
                  rows={6}
                  value={JSON.stringify(simDatos, null, 2)}
                  onChange={(e) => {
                    try {
                      setSimDatos(JSON.parse(e.target.value));
                    } catch {
                      // Permite escribir mientras edita
                    }
                  }}
                  className="w-full font-mono text-xs p-3 rounded-lg border border-carbon/20 bg-slate-900 text-emerald-400 outline-none"
                />
              </div>

              {/* Resultado de la simulación */}
              {resSimulacion && (
                <div
                  className={`p-4 rounded-xl border space-y-2 text-xs ${
                    resSimulacion.valido ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    <span className="text-base">{resSimulacion.valido ? "✅ PASS" : "❌ FAIL"}</span>
                    <span className={resSimulacion.valido ? "text-emerald-800" : "text-rose-800"}>
                      {resSimulacion.valido
                        ? "El expediente cumple todas las validaciones para avanzar."
                        : "El expediente fue bloqueado por no cumplir las siguientes reglas:"}
                    </span>
                  </div>

                  {!resSimulacion.valido && (
                    <ul className="list-disc list-inside space-y-1 text-rose-700 pl-2">
                      {resSimulacion.errores.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal Nuevo Proceso */}
      {mostrarModalNuevo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="font-titular text-lg font-bold text-verde-profundo">Crear Nuevo Proceso Maestro</h3>

            <div>
              <label className="block text-xs font-bold text-carbon/70 mb-1">Nombre del Proceso *</label>
              <input
                type="text"
                placeholder="Ej. Sauceda Construye - Remodelación"
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 p-2 text-xs outline-none focus:border-sauce"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-carbon/70 mb-1">Clave Tipo Negocio *</label>
              <input
                type="text"
                placeholder="Ej. remodelacion"
                value={nuevoTipoNegocio}
                onChange={(e) => setNuevoTipoNegocio(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 p-2 text-xs outline-none focus:border-sauce font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-carbon/70 mb-1">Entidad Target del Proceso *</label>
              <select
                value={nuevoEntidadTarget}
                onChange={(e) => setNuevoEntidadTarget(e.target.value as any)}
                className="w-full rounded-lg border border-carbon/20 p-2 text-xs font-bold text-verde-profundo outline-none focus:border-sauce"
              >
                <option value="expediente">📁 Entidad EXPEDIENTE (Proyecto / Casa / Obra / Traspaso)</option>
                <option value="prospecto">👤 Entidad PROSPECTO (Lead / Contacto Comercial)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-carbon/70 mb-1">Descripción</label>
              <textarea
                rows={2}
                placeholder="Propósito del flujo comercial o de obra..."
                value={nuevoDescripcion}
                onChange={(e) => setNuevoDescripcion(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 p-2 text-xs outline-none focus:border-sauce"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMostrarModalNuevo(false)}
                className="px-3 py-1.5 rounded-lg border text-xs text-carbon/70 hover:bg-carbon/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCrearProceso}
                disabled={!nuevoNombre || !nuevoTipoNegocio || guardando}
                className="px-4 py-1.5 rounded-lg bg-sauce hover:bg-verde-profundo text-white text-xs font-bold transition disabled:opacity-50"
              >
                {guardando ? "Creando..." : "Crear Proceso"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Duplicar Proceso */}
      {mostrarModalDuplicar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="font-titular text-lg font-bold text-verde-profundo">Duplicar Proceso Maestro</h3>

            <div>
              <label className="block text-xs font-bold text-carbon/70 mb-1">Nuevo Nombre del Proceso *</label>
              <input
                type="text"
                value={duplicarNombre}
                onChange={(e) => setDuplicarNombre(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 p-2 text-xs outline-none focus:border-sauce"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-carbon/70 mb-1">Nueva Clave Tipo Negocio *</label>
              <input
                type="text"
                value={duplicarTipo}
                onChange={(e) => setDuplicarTipo(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 p-2 text-xs outline-none focus:border-sauce font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-carbon/70 mb-1">Entidad Target del Proceso *</label>
              <select
                value={duplicarEntidadTarget}
                onChange={(e) => setDuplicarEntidadTarget(e.target.value as any)}
                className="w-full rounded-lg border border-carbon/20 p-2 text-xs font-bold text-verde-profundo outline-none focus:border-sauce"
              >
                <option value="expediente">📁 Entidad EXPEDIENTE (Proyecto / Casa / Obra / Traspaso)</option>
                <option value="prospecto">👤 Entidad PROSPECTO (Lead / Contacto Comercial)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMostrarModalDuplicar(false)}
                className="px-3 py-1.5 rounded-lg border text-xs text-carbon/70 hover:bg-carbon/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDuplicarProceso}
                disabled={!duplicarNombre || !duplicarTipo || guardando}
                className="px-4 py-1.5 rounded-lg bg-sauce hover:bg-verde-profundo text-white text-xs font-bold transition disabled:opacity-50"
              >
                {guardando ? "Duplicando..." : "Duplicar Proceso"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
