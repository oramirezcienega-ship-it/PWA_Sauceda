"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { aceptarCotizacionCliente } from "@/app/actions/cotizaciones";
import { cambiarGamaEspacioCliente } from "@/app/actions/presupuestos";
import { formatoPesos } from "@/lib/formato";
import type {
  Cotizacion,
  VisitaReporte,
  CotizacionConcepto,
  CotizacionPartida,
  CotizacionEspacio,
  EsquemaPagoHito,
} from "@/lib/types";

interface VisualizadorCotizacionApuProps {
  cotizacion: Omit<Cotizacion, "notasInternas" | "costoEstimado">;
  conceptos: Omit<CotizacionConcepto, "costoUnitario">[];
  partidas: CotizacionPartida[];
  espacios: CotizacionEspacio[];
  reporteVisita: Omit<VisitaReporte, "inspectorId"> | null;
}

export function VisualizadorCotizacionApu({
  cotizacion,
  conceptos: initialConceptos,
  partidas: initialPartidas,
  espacios: initialEspacios,
  reporteVisita,
}: VisualizadorCotizacionApuProps) {
  const [estatus, setEstatus] = useState(cotizacion.estatus);
  const [nombreFirma, setNombreFirma] = useState("");
  const [firmaVacia, setFirmaVacia] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [errorFirma, setErrorFirma] = useState("");
  const [exito, setExito] = useState(cotizacion.estatus === "aceptada");

  // Estados interactivos para gamas
  const [espacios, setEspacios] = useState<CotizacionEspacio[]>(initialEspacios);
  const conceptos = initialConceptos;
  const partidas = initialPartidas;
  const [precioFinal, setPrecioFinal] = useState<number>(cotizacion.precioFinal);
  const [isPendingGama, startTransitionGama] = useTransition();
  const [gamaCambiandoId, setGamaCambiandoId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);

  // Inicializar canvas de firma
  useEffect(() => {
    if (estatus !== "aceptada" && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#1b382b";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
      }
    }
  }, [estatus, exito]);

  // Manejadores de dibujo para firma digital
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

  // Cambio interactivo de gama por el cliente
  const handleCambiarGama = (espacioId: string, nuevaGama: "economica" | "media" | "premium") => {
    if (estatus === "aceptada") return;
    setGamaCambiandoId(espacioId);

    // Optimista en UI
    setEspacios((prev) =>
      prev.map((e) => (e.id === espacioId ? { ...e, gamaSeleccionada: nuevaGama } : e))
    );

    startTransitionGama(async () => {
      try {
        const res = await cambiarGamaEspacioCliente(cotizacion.token, espacioId, nuevaGama);
        if (res.ok) {
          setPrecioFinal(res.precioFinal);
          // Recargar la página suavemente para sincronizar partidas y conceptos actualizados
          window.location.reload();
        }
      } catch (err: any) {
        console.error("Error al actualizar acabados:", err);
      } finally {
        setGamaCambiandoId(null);
      }
    });
  };

  // Enviar autorización y firma
  const handleAceptar = async () => {
    if (!nombreFirma.trim()) {
      setErrorFirma("Por favor, ingresa tu nombre completo.");
      return;
    }
    if (firmaVacia) {
      setErrorFirma("Por favor, dibuja tu firma en el recuadro.");
      return;
    }

    setCargando(true);
    setErrorFirma("");

    try {
      const res = await aceptarCotizacionCliente(cotizacion.token, nombreFirma.trim());
      if (res.ok) {
        setEstatus("aceptada");
        setExito(true);
      } else {
        setErrorFirma("Ocurrió un error al procesar tu autorización. Intenta de nuevo.");
      }
    } catch (e: any) {
      setErrorFirma(e.message || "Error al autorizar la propuesta.");
    } finally {
      setCargando(false);
    }
  };

  // Esquema de Pagos por defecto si no viene configurado
  const hitosPagos: EsquemaPagoHito[] =
    Array.isArray(cotizacion.esquemaPagos) && cotizacion.esquemaPagos.length > 0
      ? cotizacion.esquemaPagos
      : [
          {
            etapa: "Anticipo de Obra",
            porcentaje: 50,
            monto: Math.round(precioFinal * 0.5),
            condicion: "A la firma de contrato para adquisición y programación de materiales.",
          },
          {
            etapa: "Avance de Albañilería e Instalaciones",
            porcentaje: 35,
            monto: Math.round(precioFinal * 0.35),
            condicion: "Al concluir obra negra, canalizaciones eléctricas y red hidrosanitaria.",
          },
          {
            etapa: "Finiquito y Entrega",
            porcentaje: 15,
            monto: Math.round(precioFinal * 0.15),
            condicion: "Recepción de obra terminada a entera satisfacción y póliza de garantía.",
          },
        ];

  // Agrupar conceptos por partida
  const partidasConConceptos = partidas.map((p) => {
    const concs = conceptos.filter((c) => c.partidaId === p.id);
    const subtotal = concs.reduce((sum, c) => sum + (c.importe || 0), 0);
    return {
      ...p,
      conceptos: concs,
      subtotalCalculado: subtotal > 0 ? subtotal : p.subtotalPrecioCliente || 0,
    };
  });

  // Conceptos sin partida asignada
  const conceptosSueltos = conceptos.filter((c) => !c.partidaId);

  // Cálculos de IVA y Totales
  const ivaPct = cotizacion.ivaPct ?? 16;
  const incluyeIva = cotizacion.incluyeIva === true;
  const montoIva = cotizacion.ivaMonto || (incluyeIva ? Math.round(precioFinal * (ivaPct / 100)) : 0);
  const subtotalNeto = incluyeIva ? Math.max(0, precioFinal - montoIva) : precioFinal;
  const granTotal = incluyeIva ? precioFinal : precioFinal + montoIva;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 font-cuerpo text-carbon print:p-0 print:max-w-none">
      {/* Banner de Confirmación si ya fue autorizada */}
      {estatus === "aceptada" && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-4 text-emerald-900 print:hidden shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <div className="font-titular font-bold text-sm">¡Propuesta Autorizada y Programada!</div>
              <div className="text-xs text-emerald-700">
                Tu proyecto ha sido confirmado. Nuestro equipo de construcción se comunicará contigo para el acta de inicio.
              </div>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="text-xs bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg hover:bg-emerald-800 transition shrink-0"
          >
            🖨️ Imprimir / Guardar PDF
          </button>
        </div>
      )}

      {/* Tarjeta Principal de la Propuesta */}
      <div className="bg-white rounded-3xl border border-carbon/10 shadow-xl overflow-hidden print:border-none print:shadow-none">
        {/* Cabecera de Marca */}
        <div className="bg-gradient-to-r from-verde-profundo to-verde-pino p-6 sm:p-8 text-white relative">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-dorado/20 text-dorado text-[11px] font-mono font-bold uppercase tracking-wider border border-dorado/30">
                  Sauceda Construye
                </span>
                <span className="text-white/60 text-xs font-mono">Folio: {cotizacion.id}</span>
                {cotizacion.versionNumero && cotizacion.versionNumero > 1 && (
                  <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-white/80 font-mono">
                    v{cotizacion.versionNumero}.0
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold font-titular tracking-tight mt-2 text-white">
                Presupuesto de Remodelación & Obra
              </h1>
              <p className="text-xs sm:text-sm text-white/70 mt-1 max-w-xl">
                Propuesta técnica detallada con desglose por partidas, especificación de acabados y programa de obra.
              </p>
            </div>

            <div className="flex items-center gap-2 print:hidden self-end sm:self-auto">
              <a
                href={`/api/cotizaciones/${cotizacion.token}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/20"
              >
                📥 Descargar PDF Oficial
              </a>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-8 print:p-4 print:space-y-4">
          {/* Ficha de Datos del Cliente y Ubicación de Obra */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-carbon/5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs shadow-sm/5">
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-carbon/40 uppercase tracking-wider">
                {cotizacion.empresaNombre ? "Datos de la Empresa / Cuenta" : "Datos del Cliente"}
              </div>
              <div className="text-base font-extrabold text-verde-profundo font-titular leading-tight">
                {cotizacion.prospectoNombre || "Cliente Sauceda"}
              </div>
              <div className="flex items-center gap-1.5 text-carbon/70">
                <span className="font-semibold text-carbon/50">Expediente de Obra:</span>
                <span className="font-mono bg-slate-200/60 px-2 py-0.5 rounded text-[10px] font-bold text-carbon/80">
                  {cotizacion.prospectoId}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-bold text-carbon/40 uppercase tracking-wider">
                Ubicación del Proyecto & Contacto
              </div>
              <div className="space-y-1 text-carbon/70">
                <div className="flex items-start gap-1.5">
                  <span className="font-semibold text-carbon/50 w-24">Dirección de Obra:</span>
                  <span className="leading-relaxed font-medium text-carbon/90">
                    {cotizacion.prospectoDireccion || "León, Guanajuato (Por confirmar en levantamiento)"}
                  </span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="font-semibold text-carbon/50 w-24">Teléfono:</span>
                  <span>{cotizacion.prospectoTelefono || "—"}</span>
                </div>
                {cotizacion.prospectoCorreo && (
                  <div className="flex items-start gap-1.5">
                    <span className="font-semibold text-carbon/50 w-24">Correo:</span>
                    <span className="break-all">{cotizacion.prospectoCorreo}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SELECTOR INTERACTIVO DE GAMAS Y ACABADOS POR ESPACIO */}
          {espacios.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b pb-2">
                <h3 className="font-titular text-lg font-bold text-verde-profundo flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sauce/10 text-sauce text-xs font-bold">
                    1
                  </span>
                  Espacios de Intervención & Selección de Acabados
                </h3>
                {estatus !== "aceptada" && (
                  <span className="text-[11px] font-medium text-carbon/50 print:hidden bg-amber-50 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200/60">
                    💡 Puedes cambiar de gama en cualquier momento para ver acabados e inversión
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {espacios.map((esp) => {
                  const m2Piso = Number(esp.m2Piso || 0);
                  const m2Muros = Number(esp.m2Muros || 0);
                  const gamaActiva = esp.gamaSeleccionada || "media";
                  const cambiando = gamaCambiandoId === esp.id && isPendingGama;

                  return (
                    <div
                      key={esp.id}
                      className={`p-5 rounded-2xl border transition-all ${
                        cambiando
                          ? "opacity-60 pointer-events-none bg-slate-50"
                          : "bg-white border-carbon/10 shadow-sm"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="text-sm font-bold text-verde-profundo font-titular flex items-center gap-2">
                            <span>🏠</span> {esp.nombre}
                          </div>
                          <div className="text-xs text-carbon/60 mt-0.5">
                            Superficie: <span className="font-bold text-carbon">{m2Piso} m² piso</span>
                            {m2Muros > 0 && (
                              <span> · <span className="font-bold text-carbon">{m2Muros} m² muros</span></span>
                            )}
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            gamaActiva === "premium"
                              ? "bg-amber-100 text-amber-900 border border-amber-300"
                              : gamaActiva === "media"
                              ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                              : "bg-slate-100 text-slate-700 border border-slate-300"
                          }`}
                        >
                          Gama {gamaActiva}
                        </span>
                      </div>

                      {/* Botones de Selección de Gama para el Cliente */}
                      {estatus !== "aceptada" ? (
                        <div className="space-y-2 mt-4 print:hidden">
                          <div className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider">
                            Elige el nivel de acabados para este espacio:
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => handleCambiarGama(esp.id, "economica")}
                              className={`p-2 rounded-xl border text-center transition ${
                                gamaActiva === "economica"
                                  ? "bg-slate-800 text-white border-slate-900 font-bold shadow"
                                  : "bg-slate-50 hover:bg-slate-100 border-carbon/10 text-carbon/70 text-xs"
                              }`}
                            >
                              <div className="text-xs">🥉 Básica</div>
                              <div className="text-[10px] opacity-80 mt-0.5 leading-tight">Económica</div>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCambiarGama(esp.id, "media")}
                              className={`p-2 rounded-xl border text-center transition ${
                                gamaActiva === "media"
                                  ? "bg-emerald-700 text-white border-emerald-800 font-bold shadow"
                                  : "bg-emerald-50/50 hover:bg-emerald-50 border-emerald-200 text-emerald-900 text-xs"
                              }`}
                            >
                              <div className="text-xs">🥈 Estándar</div>
                              <div className="text-[10px] opacity-80 mt-0.5 leading-tight">Recomendada</div>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCambiarGama(esp.id, "premium")}
                              className={`p-2 rounded-xl border text-center transition ${
                                gamaActiva === "premium"
                                  ? "bg-amber-600 text-white border-amber-700 font-bold shadow"
                                  : "bg-amber-50/50 hover:bg-amber-50 border-amber-200 text-amber-900 text-xs"
                              }`}
                            >
                              <div className="text-xs">🥇 Alta Gama</div>
                              <div className="text-[10px] opacity-80 mt-0.5 leading-tight">Premium</div>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-carbon/60 italic mt-2">
                          Acabados fijados en contrato bajo la especificación {gamaActiva}.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* DESGLOSE POR PARTIDAS DE OBRA */}
          <div className="space-y-6">
            <h3 className="font-titular text-lg font-bold text-verde-profundo border-b pb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sauce/10 text-sauce text-xs font-bold">
                  2
                </span>
                Desglose de Partidas de Obra & Especificaciones
              </span>
              <span className="text-xs font-normal text-carbon/40 print:hidden">
                Incluye suministro de materiales, mano de obra especializada y dirección técnica
              </span>
            </h3>

            {partidasConConceptos.map((partida, idx) => (
              <div
                key={partida.id}
                className="rounded-2xl border border-carbon/10 overflow-hidden shadow-sm"
              >
                {/* Cabecera de Partida */}
                <div className="bg-slate-50 px-5 py-3 border-b border-carbon/10 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold bg-white border px-2 py-0.5 rounded text-carbon/60">
                      0{idx + 1}
                    </span>
                    <span className="font-titular font-extrabold text-sm text-verde-profundo uppercase tracking-wide">
                      {partida.nombre}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-carbon/70 font-mono">
                    Subtotal Partida:{" "}
                    <span className="text-verde-profundo font-extrabold">
                      {formatoPesos(partida.subtotalCalculado)}
                    </span>
                  </div>
                </div>

                {/* Tabla de Conceptos Comerciales */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[500px]">
                    <thead className="bg-white border-b text-[11px] font-semibold text-carbon/50">
                      <tr>
                        <th className="px-4 py-2.5">Concepto / Especificación de Trabajo</th>
                        <th className="px-4 py-2.5 text-center">Unidad</th>
                        <th className="px-4 py-2.5 text-center">Cantidad</th>
                        <th className="px-4 py-2.5 text-right font-mono">P. Unitario</th>
                        <th className="px-4 py-2.5 text-right font-mono">Importe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-carbon/5 bg-white">
                      {partida.conceptos.length > 0 ? (
                        partida.conceptos.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50/40">
                            <td className="px-4 py-3 font-medium text-carbon/90">
                              <div>{c.descripcion}</div>
                              {c.gama && (
                                <span className="text-[10px] text-carbon/40 font-mono">
                                  Línea {c.gama}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center text-carbon/60 uppercase">{c.unidad}</td>
                            <td className="px-4 py-3 text-center font-mono font-bold">{c.cantidad}</td>
                            <td className="px-4 py-3 text-right font-mono text-carbon/70">
                              {formatoPesos(c.precioUnitario)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-verde-profundo">
                              {formatoPesos(c.importe)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-3 text-center text-carbon/40 italic">
                            Sin conceptos desglosados en esta partida.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* Conceptos Adicionales sin partida fija */}
            {conceptosSueltos.length > 0 && (
              <div className="rounded-2xl border border-carbon/10 overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-5 py-3 border-b border-carbon/10 font-titular font-extrabold text-sm text-verde-profundo">
                  Trabajos Complementarios
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-carbon/5 bg-white">
                      {conceptosSueltos.map((c) => (
                        <tr key={c.id}>
                          <td className="px-4 py-3 font-medium text-carbon/90">{c.descripcion}</td>
                          <td className="px-4 py-3 text-center text-carbon/60 uppercase">{c.unidad}</td>
                          <td className="px-4 py-3 text-center font-mono font-bold">{c.cantidad}</td>
                          <td className="px-4 py-3 text-right font-mono text-carbon/70">
                            {formatoPesos(c.precioUnitario)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-verde-profundo">
                            {formatoPesos(c.importe)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TOTAL CALLOUT Y CASCADA DE PRECIO */}
            <div className="bg-gradient-to-br from-slate-900 to-verde-profundo text-white p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-1.5 max-w-md">
                <div className="text-xs font-bold text-dorado uppercase tracking-wider">
                  Presupuesto Integral Llave en Mano
                </div>
                <div className="text-sm text-white/80 leading-relaxed">
                  Incluye suministro de materiales de primera línea, retiro de escombro, mano de obra asegurada y dirección técnica por arquitecto/ingeniero residente.
                </div>
                <div className="text-[11px] text-white/50 pt-1">
                  Vigencia de precios: 15 días naturales a partir de la emisión.
                </div>
              </div>

              <div className="text-left md:text-right shrink-0 bg-white/5 p-4 rounded-2xl border border-white/10 w-full md:w-auto">
                <div className="text-xs text-white/60 uppercase font-semibold">Inversión Total de Obra</div>
                <div className="font-mono text-3xl sm:text-4xl font-extrabold text-white mt-1">
                  {formatoPesos(granTotal)}
                </div>
                <div className="text-xs text-dorado/90 font-medium mt-1">
                  {incluyeIva ? "IVA incluido (16%) · Facturación fiscal completa" : "+ IVA en caso de requerir comprobante fiscal"}
                </div>
              </div>
            </div>
          </div>

          {/* ESQUEMA DE PAGOS POR HITOS DE OBRA */}
          <div className="space-y-4">
            <h3 className="font-titular text-lg font-bold text-verde-profundo border-b pb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sauce/10 text-sauce text-xs font-bold">
                3
              </span>
              Programa y Esquema de Pagos por Hitos de Avance
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {hitosPagos.map((hito, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 p-5 rounded-2xl border border-carbon/10 relative overflow-hidden flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold text-carbon/40 uppercase">
                        Hito 0{idx + 1}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-verde-profundo/10 text-verde-profundo font-mono font-bold text-xs">
                        {hito.porcentaje}%
                      </span>
                    </div>
                    <div className="font-titular font-extrabold text-sm text-verde-profundo">
                      {hito.etapa}
                    </div>
                    <p className="text-xs text-carbon/70 leading-relaxed">{hito.condicion}</p>
                  </div>

                  <div className="pt-4 border-t border-carbon/5 mt-4">
                    <div className="text-[10px] text-carbon/40 uppercase font-bold">Monto del Hito</div>
                    <div className="font-mono text-base font-extrabold text-carbon/90 mt-0.5">
                      {formatoPesos(Math.round(granTotal * (hito.porcentaje / 100)))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ALCANCES Y EXCLUSIONES */}
          {(cotizacion.alcances || cotizacion.exclusiones) && (
            <div className="space-y-4">
              <h3 className="font-titular text-lg font-bold text-verde-profundo border-b pb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sauce/10 text-sauce text-xs font-bold">
                  4
                </span>
                Alcances de Obra & Exclusiones Claras
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cotizacion.alcances && (
                  <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-200/80 space-y-2">
                    <div className="font-titular font-bold text-sm text-emerald-900 flex items-center gap-1.5">
                      <span>✅</span> Lo que incluye tu proyecto
                    </div>
                    <p className="text-xs text-emerald-950/80 whitespace-pre-line leading-relaxed">
                      {cotizacion.alcances}
                    </p>
                  </div>
                )}

                {cotizacion.exclusiones && (
                  <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-200/80 space-y-2">
                    <div className="font-titular font-bold text-sm text-amber-900 flex items-center gap-1.5">
                      <span>⚠️</span> Exclusiones del presupuesto
                    </div>
                    <p className="text-xs text-amber-950/80 whitespace-pre-line leading-relaxed">
                      {cotizacion.exclusiones}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* LEVANTAMIENTO TÉCNICO SI EXISTE */}
          {reporteVisita && (
            <div className="space-y-4">
              <h3 className="font-titular text-lg font-bold text-verde-profundo border-b pb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sauce/10 text-sauce text-xs font-bold">
                    5
                  </span>
                  Levantamiento Técnico & Diagnóstico en Sitio
                </span>
                <a
                  href={`/reporte-visita/${cotizacion.token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sauce hover:underline font-semibold print:hidden"
                >
                  Ver Ficha de Inspección ↗
                </a>
              </h3>

              <div className="bg-slate-50 p-5 rounded-2xl border border-carbon/5 space-y-3">
                <p className="text-xs text-carbon/80 leading-relaxed italic">
                  "{reporteVisita.observacionesTecnicas}"
                </p>

                {reporteVisita.fotos && reporteVisita.fotos.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[11px] font-bold text-carbon/40 uppercase tracking-wider mb-2">
                      Evidencia Fotográfica de la Visita
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {reporteVisita.fotos.slice(0, 4).map((f: any, i: number) => (
                        <div key={i} className="aspect-square rounded-xl overflow-hidden border bg-slate-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={typeof f === "string" ? f : f.url}
                            alt={`Foto ${i + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* GARANTÍA Y POLÍTICAS */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-carbon/5 space-y-2">
            <div className="font-titular font-bold text-xs text-verde-profundo flex items-center gap-1.5 uppercase tracking-wide">
              <span>🛡️</span> Garantía de Ejecución & Vicios Ocultos
            </div>
            <p className="text-xs text-carbon/70 leading-relaxed">
              {cotizacion.garantia ||
                "Todos los trabajos de remodelación y edificación cuentan con póliza de garantía escrita contra defectos y vicios ocultos de 12 meses."}
            </p>
          </div>

          {/* SECCIÓN DE AUTORIZACIÓN Y FIRMA DIGITAL */}
          <div className="border-t pt-8 space-y-4 print:hidden">
            <h3 className="font-titular text-xl font-extrabold text-verde-profundo flex items-center gap-2">
              <span>✍️</span> Autorización y Contratación en Línea
            </h3>

            {estatus === "aceptada" ? (
              <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-2">
                <div className="text-3xl">🎉</div>
                <div className="text-base font-bold text-emerald-950 font-titular">
                  Propuesta Formalmente Autorizada
                </div>
                <p className="text-xs text-emerald-800 max-w-md mx-auto">
                  Este documento tiene validez contractual. Tu asesor comercial de Sauceda Construye te entregará la programación oficial de obra.
                </p>
              </div>
            ) : (
              <div className="space-y-4 bg-slate-50 p-6 rounded-3xl border border-carbon/10">
                <p className="text-xs text-carbon/70 leading-relaxed">
                  Para autorizar el presupuesto y proceder con la programación de tu obra, ingresa tu nombre completo y dibuja tu firma a continuación:
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-carbon/70 mb-1">
                      Nombre completo del titular que autoriza:
                    </label>
                    <input
                      type="text"
                      value={nombreFirma}
                      onChange={(e) => setNombreFirma(e.target.value)}
                      placeholder="Ej. Ing. Juan Pérez Gómez"
                      className="w-full px-4 py-2.5 rounded-xl border border-carbon/20 text-sm focus:outline-none focus:ring-2 focus:ring-verde-profundo/20 font-medium"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-carbon/70">
                        Firma digital (Usa tu dedo en celular o el ratón en computadora):
                      </label>
                      <button
                        type="button"
                        onClick={limpiarCanvas}
                        className="text-[11px] text-rose-600 hover:underline font-semibold"
                      >
                        Limpiar firma
                      </button>
                    </div>

                    <div className="border-2 border-dashed border-carbon/20 rounded-2xl overflow-hidden bg-white touch-none">
                      <canvas
                        ref={canvasRef}
                        width={600}
                        height={180}
                        onMouseDown={empezarDibujo}
                        onMouseUp={terminarDibujo}
                        onMouseMove={dibujar}
                        onTouchStart={empezarDibujo}
                        onTouchEnd={terminarDibujo}
                        onTouchMove={dibujar}
                        className="w-full h-36 cursor-crosshair block"
                      />
                    </div>
                  </div>

                  {errorFirma && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                      {errorFirma}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleAceptar}
                    disabled={cargando}
                    className="w-full py-3.5 px-6 rounded-2xl bg-verde-profundo hover:bg-verde-pino text-white font-titular font-extrabold text-sm sm:text-base shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {cargando ? (
                      <span>Procesando autorización...</span>
                    ) : (
                      <>
                        <span>🖋️</span>
                        <span>Autorizar Presupuesto & Iniciar Proyecto</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
