"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { aceptarCotizacionCliente } from "@/app/actions/cotizaciones";
import { formatoPesos } from "@/lib/formato";
import type { Cotizacion, CotizacionModularData, OpcionesSeleccionadasModular } from "@/lib/types";

interface VisualizadorCotizacionModularProps {
  cotizacion: Omit<Cotizacion, "notasInternas" | "costoEstimado">;
}

export function VisualizadorCotizacionModular({
  cotizacion,
}: VisualizadorCotizacionModularProps) {
  const datosModulares: CotizacionModularData = useMemo(() => {
    return (
      cotizacion.datosModulares || {
        titulo: "Propuesta Modular de Construcción",
        descripcion: "Configuración interactiva de proyecto.",
        estructuraBase: {
          titulo: "Estructura Base",
          precio: cotizacion.precioFinal || 0,
          detalles: ["Incluye materiales, mano de obra y supervisión técnica."],
        },
        gruposOpciones: [],
        complementos: [],
      }
    );
  }, [cotizacion]);

  // Selección inicial (si ya fue aceptada, usar las opciones seleccionadas guardadas; sino, usar recomendado o default)
  const [opcionesRadio, setOpcionesRadio] = useState<Record<string, string>>(() => {
    if (cotizacion.opcionesSeleccionadas?.opciones) {
      return cotizacion.opcionesSeleccionadas.opciones;
    }
    const inicial: Record<string, string> = {};
    for (const grupo of datosModulares.gruposOpciones || []) {
      const rec = grupo.opciones.find((o) => o.recomendado) || grupo.opciones[0];
      if (rec) inicial[grupo.id] = rec.id;
    }
    return inicial;
  });

  const [complementos, setComplementos] = useState<string[]>(() => {
    return cotizacion.opcionesSeleccionadas?.complementos || [];
  });

  const [incluirIva, setIncluirIva] = useState<boolean>(() => {
    return cotizacion.opcionesSeleccionadas?.incluirIva ?? false;
  });

  const [estatus, setEstatus] = useState(cotizacion.estatus);
  const [nombreFirma, setNombreFirma] = useState("");
  const [firmaVacia, setFirmaVacia] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [errorFirma, setErrorFirma] = useState("");
  const [exito, setExito] = useState(cotizacion.estatus === "aceptada");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);

  // Cálculos reactivos
  const calculos = useMemo(() => {
    const base = datosModulares.estructuraBase?.precio || 0;
    let sumaOpciones = 0;

    for (const grupo of datosModulares.gruposOpciones || []) {
      const elegidaId = opcionesRadio[grupo.id];
      const op = grupo.opciones.find((o) => o.id === elegidaId);
      if (op) {
        sumaOpciones += op.precio;
      }
    }

    for (const compId of complementos) {
      const c = datosModulares.complementos.find((item) => item.id === compId);
      if (c) {
        sumaOpciones += c.precio;
      }
    }

    const subtotal = base + sumaOpciones;
    const montoIva = incluirIva ? subtotal * 0.16 : 0;
    const totalFinal = subtotal + montoIva;

    const m2 = datosModulares.dimensiones?.superficieM2 || 0;
    const precioPorM2 = m2 > 0 ? Math.round(subtotal / m2) : 0;

    return {
      precioBase: base,
      sumaOpciones,
      subtotal,
      montoIva,
      totalFinal,
      precioPorM2,
    };
  }, [datosModulares, opcionesRadio, complementos, incluirIva]);

  // Verificar en qué preset coincide la selección actual
  const presetActivoId = useMemo(() => {
    for (const preset of datosModulares.presets || []) {
      const coincideOpciones = Object.entries(preset.opciones).every(
        ([grupoId, opId]) => opcionesRadio[grupoId] === opId
      );
      const mismosComplementos =
        preset.complementos.length === complementos.length &&
        preset.complementos.every((c) => complementos.includes(c));

      if (coincideOpciones && mismosComplementos) {
        return preset.id;
      }
    }
    return null;
  }, [datosModulares.presets, opcionesRadio, complementos]);

  // Aplicar un preset
  const aplicarPreset = (presetId: string) => {
    if (estatus === "aceptada") return;
    const p = datosModulares.presets?.find((item) => item.id === presetId);
    if (!p) return;

    setOpcionesRadio((prev) => ({
      ...prev,
      ...p.opciones,
    }));
    setComplementos([...p.complementos]);
  };

  const toggleComplemento = (id: string) => {
    if (estatus === "aceptada") return;
    setComplementos((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const setGrupoOpcion = (grupoId: string, opcionId: string) => {
    if (estatus === "aceptada") return;
    setOpcionesRadio((prev) => ({ ...prev, [grupoId]: opcionId }));
  };

  // Inicializar canvas de firma
  useEffect(() => {
    if (estatus !== "aceptada" && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#1E3A2F";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
      }
    }
  }, [estatus, exito]);

  const empezarDibujo = (e: React.MouseEvent | React.TouchEvent) => {
    dibujando.current = true;
    dibujar(e);
  };

  const terminarDibujo = () => {
    dibujando.current = false;
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
      if (imgData) {
        let pintado = false;
        for (let i = 3; i < imgData.data.length; i += 4) {
          if (imgData.data[i] > 0) {
            pintado = true;
            break;
          }
        }
        setFirmaVacia(!pintado);
      }
    }
  };

  const dibujar = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dibujando.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (e.type === "mousedown" || e.type === "touchstart") {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const limpiarCanvas = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setFirmaVacia(true);
      }
    }
  };

  const handleAutorizar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreFirma.trim()) {
      setErrorFirma("Por favor, ingresa tu nombre completo.");
      return;
    }
    if (firmaVacia) {
      setErrorFirma("Por favor, dibuja tu firma digital en el recuadro.");
      return;
    }

    try {
      setCargando(true);
      setErrorFirma("");

      const opcionesFinales: OpcionesSeleccionadasModular = {
        opciones: opcionesRadio,
        complementos,
        incluirIva,
        precioCalculado: calculos.subtotal,
        precioM2: calculos.precioPorM2,
        presetActivo: presetActivoId,
      };

      const res = await aceptarCotizacionCliente(
        cotizacion.token,
        nombreFirma.trim(),
        opcionesFinales,
        calculos.subtotal
      );

      if (res.ok) {
        setEstatus("aceptada");
        setExito(true);
      }
    } catch (err) {
      setErrorFirma(
        err instanceof Error ? err.message : "Error al registrar la autorización."
      );
    } finally {
      setCargando(false);
    }
  };

  const fechaFormateada = new Date().toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 font-sans text-slate-800">
      {/* Banner de éxito */}
      {exito && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm print:hidden">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-2xl text-white shadow-sm">
              ✓
            </div>
            <div className="space-y-1">
              <h3 className="font-titular text-lg font-bold text-emerald-950">
                ¡Propuesta Autorizada con Éxito!
              </h3>
              <p className="text-sm text-emerald-800">
                Tu configuración ha sido registrada y guardada formalmente. Nuestro equipo de
                operaciones de SAUCEDA se pondrá en contacto contigo para coordinar el inicio de los
                trabajos y adquisición de materiales.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tarjeta Principal de la Cotización */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-200/40 print:border-none print:shadow-none">
        {/* Cabecera Superior */}
        <div className="border-b border-slate-100 bg-slate-50/60 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold tracking-widest text-[#D4AF37] uppercase">
                  SAUCEDA CONSTRUYE
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                  Cotización Modular Dinámica
                </span>
              </div>
              <h1 className="font-titular text-2xl sm:text-3xl font-extrabold text-[#1E3A2F]">
                {datosModulares.titulo}
              </h1>
              <p className="max-w-2xl text-xs sm:text-sm text-slate-600 leading-relaxed">
                {datosModulares.descripcion}
              </p>
            </div>

            <div className="shrink-0 text-left sm:text-right">
              <div className="font-mono text-xs font-bold text-slate-400">Folio:</div>
              <div className="font-mono text-base font-bold text-[#1E3A2F]">{cotizacion.id}</div>
              <div className="mt-1 text-[11px] text-slate-500">{fechaFormateada}</div>
              <div className="text-[11px] font-semibold text-slate-400">Vigencia: 14 días naturales</div>
            </div>
          </div>

          {/* Ficha Técnica de Dimensiones */}
          {datosModulares.dimensiones && (
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5 text-center">
              <div className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Superficie</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-800">
                  {datosModulares.dimensiones.superficieM2?.toFixed(2)} m²
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Altura Libre</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-800">
                  {datosModulares.dimensiones.alturaLibreM?.toFixed(2)} m
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Postes</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-800">
                  {datosModulares.dimensiones.postes}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white p-3 shadow-xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Plazo</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-800">
                  {datosModulares.dimensiones.plazoDiasHabiles} días hábiles
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200/60 bg-white p-3 shadow-xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Garantía</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-800">
                  {datosModulares.dimensiones.garantiaMeses} meses
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cuerpo de Partidas */}
        <div className="space-y-8 p-6 sm:p-8">
          {/* PARTIDA 1 — ESTRUCTURA BASE (OBLIGATORIA) */}
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/40 p-5 sm:p-6 transition">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="rounded-md bg-[#1E3A2F] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Obligatoria
                </span>
                <h3 className="font-titular text-base sm:text-lg font-bold text-[#1E3A2F]">
                  {datosModulares.estructuraBase.titulo}
                </h3>
              </div>
              <div className="font-mono text-xl sm:text-2xl font-black text-[#1E3A2F]">
                {formatoPesos(datosModulares.estructuraBase.precio)}
              </div>
            </div>

            <ul className="mt-4 space-y-2 text-xs sm:text-sm text-slate-600">
              {datosModulares.estructuraBase.detalles.map((d, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D4AF37]" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>

            {datosModulares.estructuraBase.nota && (
              <p className="mt-4 border-t border-slate-200/60 pt-3 text-xs italic text-slate-500">
                {datosModulares.estructuraBase.nota}
              </p>
            )}
          </div>

          {/* PARTIDAS OPCIONALES */}
          <div className="space-y-6">
            <div className="border-b border-slate-200/80 pb-2">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                Personalización de Acabados
              </div>
              <h2 className="font-titular text-lg font-bold text-[#1E3A2F]">
                Partidas Opcionales y Acabados
              </h2>
              <p className="text-xs text-slate-500">
                Selecciona las opciones deseadas para ver el presupuesto actualizado en tiempo real.
              </p>
            </div>

            {/* Grupos de Radios (Cubierta, Plafón, etc.) */}
            {datosModulares.gruposOpciones.map((grupo) => (
              <div key={grupo.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    {grupo.titulo} <span className="font-normal text-slate-400">(Elija una)</span>
                  </h4>
                </div>

                <div className="space-y-2.5">
                  {grupo.opciones.map((op) => {
                    const seleccionada = opcionesRadio[grupo.id] === op.id;
                    return (
                      <label
                        key={op.id}
                        onClick={() => setGrupoOpcion(grupo.id, op.id)}
                        className={`group relative flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-4 transition-all ${
                          seleccionada
                            ? "border-[#1E3A2F] bg-emerald-50/30 shadow-xs ring-1 ring-[#1E3A2F]"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                        } ${estatus === "aceptada" ? "pointer-events-none" : ""}`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name={grupo.id}
                            checked={seleccionada}
                            onChange={() => setGrupoOpcion(grupo.id, op.id)}
                            className="mt-1 h-4 w-4 text-[#1E3A2F] focus:ring-[#1E3A2F]"
                          />
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {op.nombre}
                              </span>
                              {op.recomendado && (
                                <span className="rounded-full bg-[#D4AF37]/15 px-2 py-0.5 text-[10px] font-bold text-[#997A15]">
                                  ★ Recomendado
                                </span>
                              )}
                              {op.incluido && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                  Base
                                </span>
                              )}
                            </div>
                            {op.descripcion && (
                              <p className="text-xs text-slate-500 leading-relaxed">
                                {op.descripcion}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <span className="font-mono text-sm font-bold text-slate-900">
                            {op.precio === 0 ? "Incluido" : `+${formatoPesos(op.precio)}`}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {grupo.notaPie && (
                  <p className="text-[11px] text-slate-400 italic pl-1">{grupo.notaPie}</p>
                )}
              </div>
            ))}

            {/* Complementos Combinables (Checkboxes) */}
            {datosModulares.complementos.length > 0 && (
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Complementos <span className="font-normal text-slate-400">(Combinables, se suman)</span>
                </h4>

                <div className="space-y-2.5">
                  {datosModulares.complementos.map((comp) => {
                    const activa = complementos.includes(comp.id);
                    return (
                      <label
                        key={comp.id}
                        onClick={() => toggleComplemento(comp.id)}
                        className={`group relative flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-4 transition-all ${
                          activa
                            ? "border-[#1E3A2F] bg-emerald-50/30 shadow-xs ring-1 ring-[#1E3A2F]"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                        } ${estatus === "aceptada" ? "pointer-events-none" : ""}`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={activa}
                            onChange={() => toggleComplemento(comp.id)}
                            className="mt-1 h-4 w-4 rounded text-[#1E3A2F] focus:ring-[#1E3A2F]"
                          />
                          <div className="space-y-0.5">
                            <span className="text-sm font-semibold text-slate-900">
                              {comp.nombre}
                            </span>
                            {comp.descripcion && (
                              <p className="text-xs text-slate-500 leading-relaxed">
                                {comp.descripcion}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <span className="font-mono text-sm font-bold text-slate-900">
                            +{formatoPesos(comp.precio)}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Selector de Presets Rápidos de 1 Clic */}
          {datosModulares.presets && datosModulares.presets.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                Configuraciones Rápidas Recomendadas:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {datosModulares.presets.map((preset) => {
                  const esActivo = presetActivoId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={estatus === "aceptada"}
                      onClick={() => aplicarPreset(preset.id)}
                      className={`flex flex-col items-center justify-center rounded-xl p-3 text-xs font-bold transition ${
                        esActivo
                          ? "bg-[#1E3A2F] text-white shadow-md ring-2 ring-[#D4AF37]"
                          : "border border-slate-300 bg-white text-slate-700 hover:border-[#1E3A2F] hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{preset.nombre}</span>
                        {preset.recomendado && <span>★</span>}
                      </div>
                      <span className="text-[10px] font-normal opacity-80 mt-0.5">
                        {preset.id === "esencial"
                          ? "Funcional & Económico"
                          : preset.id === "recomendado"
                          ? "Aislante Térmico + WPC"
                          : "Acabado Total Llave en Mano"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* CAJA TOTAL / RESUMEN EN VIVO */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Estructura base:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {formatoPesos(calculos.precioBase)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Opciones seleccionadas:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    +{formatoPesos(calculos.sumaOpciones)}
                  </span>
                </div>
                <label className="flex items-center gap-2 pt-1 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={incluirIva}
                    onChange={(e) => setIncluirIva(e.target.checked)}
                    className="h-4 w-4 rounded text-[#1E3A2F] focus:ring-[#1E3A2F]"
                  />
                  <span>Agregar IVA (16%) {incluirIva && `(+${formatoPesos(calculos.montoIva)})`}</span>
                </label>
              </div>

              <div className="text-left sm:text-right">
                <div className="text-xs uppercase font-bold tracking-wider text-slate-400">
                  {incluirIva ? "Total con IVA" : "Total Neto (Antes de IVA)"}
                </div>
                <div className="font-mono text-3xl sm:text-4xl font-black text-[#1E3A2F]">
                  {formatoPesos(calculos.totalFinal)}
                </div>
                {calculos.precioPorM2 > 0 && (
                  <div className="font-mono text-xs font-semibold text-slate-500 mt-0.5">
                    ({formatoPesos(calculos.precioPorM2)} por m²)
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TABLA COMPARATIVA DE PAQUETES SUGERIDOS */}
          <div className="space-y-3 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Comparativa de Paquetes Sugeridos
            </h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-500">
                  <tr>
                    <th className="px-3.5 py-2.5">Paquete</th>
                    <th className="px-3.5 py-2.5">Cubierta</th>
                    <th className="px-3.5 py-2.5">Plafón</th>
                    <th className="px-3.5 py-2.5">Complementos</th>
                    <th className="px-3.5 py-2.5 text-right font-mono">Total s/IVA</th>
                    <th className="px-3.5 py-2.5 text-right font-mono">Por m²</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className={presetActivoId === "esencial" ? "bg-emerald-50/50 font-semibold" : ""}>
                    <td className="px-3.5 py-2.5">
                      <div className="font-bold text-slate-800">Esencial</div>
                      {presetActivoId === "esencial" && (
                        <span className="text-[9px] font-bold text-emerald-700 uppercase">
                          Tu selección
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5">Lámina pintro</td>
                    <td className="px-3.5 py-2.5">Sin plafón</td>
                    <td className="px-3.5 py-2.5 text-slate-400">—</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold">$31,000</td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-slate-500">$3,444</td>
                  </tr>

                  <tr className={presetActivoId === "recomendado" ? "bg-emerald-50/50 font-semibold" : ""}>
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-slate-800">Recomendado</span>
                        <span className="text-[10px] text-[#D4AF37]">★</span>
                      </div>
                      {presetActivoId === "recomendado" && (
                        <span className="text-[9px] font-bold text-emerald-700 uppercase">
                          Tu selección
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5">Multipanel 1"</td>
                    <td className="px-3.5 py-2.5">Plafón WPC madera</td>
                    <td className="px-3.5 py-2.5 text-slate-400">—</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold">$47,600</td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-slate-500">$5,289</td>
                  </tr>

                  <tr className={presetActivoId === "premium" ? "bg-emerald-50/50 font-semibold" : ""}>
                    <td className="px-3.5 py-2.5">
                      <div className="font-bold text-slate-800">Premium</div>
                      {presetActivoId === "premium" && (
                        <span className="text-[9px] font-bold text-emerald-700 uppercase">
                          Tu selección
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5">Multipanel 1"</td>
                    <td className="px-3.5 py-2.5">Plafón WPC madera</td>
                    <td className="px-3.5 py-2.5">Iluminación + Pintura electrostática</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold">$57,800</td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-slate-500">$6,422</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 italic">
              Esta pérgola cotizada se ubica en el rango medio del mercado local para estructura
              metálica. El paquete recomendado y premium destacan por incluir aislamiento térmico y
              acabado de plafón que garantizan durabilidad y confort térmico.
            </p>
          </div>

          {/* CONDICIONES COMERCIALES */}
          {datosModulares.condiciones && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1E3A2F]">
                Condiciones Comerciales y Garantía
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <div className="font-bold text-slate-700">Anticipo:</div>
                  <div className="text-slate-600 mt-0.5">{datosModulares.condiciones.anticipo}</div>
                </div>
                <div>
                  <div className="font-bold text-slate-700">Plazo de Entrega:</div>
                  <div className="text-slate-600 mt-0.5">{datosModulares.condiciones.plazo}</div>
                </div>
                <div>
                  <div className="font-bold text-slate-700">Garantía Técnica:</div>
                  <div className="text-slate-600 mt-0.5">{datosModulares.condiciones.garantia}</div>
                </div>
              </div>
              {datosModulares.condiciones.notaLegal && (
                <div className="border-t border-slate-200/80 pt-3 text-[11px] text-slate-500 italic">
                  * {datosModulares.condiciones.notaLegal}
                </div>
              )}
            </div>
          )}

          {/* FIRMA Y AUTORIZACIÓN DIGITAL */}
          {estatus !== "aceptada" ? (
            <div className="rounded-2xl border-2 border-emerald-600/30 bg-white p-6 space-y-4 shadow-sm print:hidden">
              <div className="space-y-1">
                <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Paso Final
                </span>
                <h3 className="font-titular text-lg font-bold text-[#1E3A2F]">
                  Firma y Autorización de la Configuración Seleccionada
                </h3>
                <p className="text-xs text-slate-500">
                  Al autorizar, se congelan las opciones elegidas ({formatoPesos(calculos.subtotal)}{" "}
                  más IVA si aplica) y se genera tu orden de fabricación oficial.
                </p>
              </div>

              <form onSubmit={handleAutorizar} className="space-y-4 max-w-lg">
                {errorFirma && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                    {errorFirma}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Nombre Completo del Cliente Autorizador
                  </label>
                  <input
                    type="text"
                    required
                    value={nombreFirma}
                    onChange={(e) => setNombreFirma(e.target.value)}
                    placeholder="Escribe tu nombre y apellido"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-[#1E3A2F] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Firma Digital (Dibuja con el dedo o ratón)
                  </label>
                  <div className="relative rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                    <canvas
                      ref={canvasRef}
                      width={400}
                      height={140}
                      onMouseDown={empezarDibujo}
                      onMouseMove={dibujar}
                      onMouseUp={terminarDibujo}
                      onMouseLeave={terminarDibujo}
                      onTouchStart={empezarDibujo}
                      onTouchMove={dibujar}
                      onTouchEnd={terminarDibujo}
                      className="w-full h-[140px] touch-none cursor-crosshair bg-white"
                    />
                    <button
                      type="button"
                      onClick={limpiarCanvas}
                      className="absolute bottom-2 right-2 rounded-lg bg-slate-200 hover:bg-slate-300 px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={cargando}
                  className="w-full rounded-xl bg-[#1E3A2F] hover:bg-[#1E3A2F]/90 py-3 text-sm font-bold text-white shadow-md transition disabled:opacity-50"
                >
                  {cargando ? "Registrando Autorización..." : "Autorizar Proyecto con esta Configuración"}
                </button>
              </form>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 text-center text-xs text-emerald-800 font-semibold">
              Propuesta formalmente autorizada y congelada. Documento válido para orden de producción.
            </div>
          )}
        </div>

        {/* Pie de página con datos fiscales */}
        <div className="border-t border-slate-100 bg-slate-50/60 p-6 text-center text-xs text-slate-400">
          Sauceda Construye · Blvd. Paseo de los Insurgentes, León, Gto. · Portal seguro de
          autorizaciones técnicas y comerciales.
        </div>
      </div>
    </div>
  );
}
