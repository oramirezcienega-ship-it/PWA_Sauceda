"use client";

import { useState, useRef, useEffect } from "react";
import { aceptarCotizacionCliente } from "@/app/actions/cotizaciones";
import type { Cotizacion, VisitaReporte, CotizacionConcepto, ServicioConstruccionTipo } from "@/lib/types";

interface VisualizadorCotizacionClienteProps {
  cotizacion: Omit<Cotizacion, "notasInternas" | "costoEstimado">;
  conceptos: Omit<CotizacionConcepto, "costoUnitario">[];
  reporteVisita: Omit<VisitaReporte, "inspectorId"> | null;
}

export function VisualizadorCotizacionCliente({
  cotizacion,
  conceptos,
  reporteVisita,
}: VisualizadorCotizacionClienteProps) {
  const [estatus, setEstatus] = useState(cotizacion.estatus);
  const [nombreFirma, setNombreFirma] = useState("");
  const [firmaVacia, setFirmaVacia] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [errorFirma, setErrorFirma] = useState("");
  const [exito, setExito] = useState(false);
  const [slideActivo, setSlideActivo] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);

  // Inicializar el canvas de firma
  useEffect(() => {
    if (estatus !== "aceptada" && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#2D4A2B"; // Verde Profundo
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
      }
    }
  }, [estatus, exito]);

  // Dibujar en el Canvas (Móvil y Escritorio)
  const empezarDibujo = (e: React.MouseEvent | React.TouchEvent) => {
    dibujando.current = true;
    dibujar(e);
  };

  const terminarDibujo = () => {
    dibujando.current = false;
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      // Si el canvas tiene trazos, consideramos firma no vacía
      // Validación básica: comprobar si hay píxeles pintados
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
      setErrorFirma("Por favor, dibuja tu firma en el recuadro.");
      return;
    }

    try {
      setCargando(true);
      setErrorFirma("");
      const res = await aceptarCotizacionCliente(cotizacion.token, nombreFirma.trim());
      if (res.ok) {
        setExito(true);
        setEstatus("aceptada");
      }
    } catch (err) {
      setErrorFirma(err instanceof Error ? err.message : "Error al procesar la aceptación.");
    } finally {
      setCargando(false);
    }
  };

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);
  };

  const getServicioLabel = (tipo: ServicioConstruccionTipo) => {
    switch (tipo) {
      case "pintura": return "Pintura";
      case "impermeabilizacion": return "Impermeabilización";
      case "losa": return "Construcción de Losa (Techo)";
      case "remodelacion": return "Remodelación";
      case "otro": return "Servicios de Construcción";
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 font-cuerpo text-carbon">
      
      {/* Encabezado Logo */}
      <div className="text-center mb-8 print:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="SAUCEDA" className="mx-auto h-16 w-16 mb-2" />
        <h1 className="font-display text-2xl font-bold tracking-tight text-verde-profundo">SAUCEDA</h1>
        <p className="font-mono text-[10px] tracking-[0.2em] text-dorado uppercase">Construye</p>
      </div>

      {exito || estatus === "aceptada" ? (
        /* --- VISTA ÉXITO / YA ACEPTADA --- */
        <div className="bg-white p-8 rounded-3xl border border-green-200 shadow-xl text-center space-y-4 max-w-lg mx-auto animate-in fade-in duration-300">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 text-3xl">
            ✓
          </div>
          <h2 className="font-titular text-2xl font-bold text-verde-profundo">¡Propuesta Autorizada!</h2>
          <p className="text-sm text-carbon/75 leading-relaxed">
            Muchas gracias. Hemos registrado tu aceptación para la propuesta <span className="font-mono font-semibold text-sauce">{cotizacion.id}</span>.
          </p>
          <div className="bg-slate-50 p-4 rounded-xl border border-carbon/5 text-xs text-carbon/60 font-mono text-left">
            <div>Folio: {cotizacion.id}</div>
            <div>Servicio: {getServicioLabel(cotizacion.servicioTipo)}</div>
            <div>Inversión Autorizada: {formatMoneda(cotizacion.precioFinal)}</div>
            <div className="mt-2 text-green-700 font-bold uppercase">Estado: Orden de Trabajo en Proceso</div>
          </div>
          <p className="text-xs text-carbon/50 pt-2">
            Nuestro equipo técnico se pondrá en contacto contigo a la brevedad para agendar la fecha de inicio del servicio.
          </p>
        </div>
      ) : (
        /* --- FORMULARIO / DETALLE CLIENTE --- */
        <div className="bg-white rounded-3xl border border-carbon/10 shadow-xl overflow-hidden">
          
          {/* Banner Principal */}
          <div className="bg-gradient-to-r from-verde-profundo to-sauce p-8 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:bg-none print:text-carbon print:p-6 print:border-b print:border-carbon/10">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap print:mb-1">
                <span className="font-mono text-xs bg-crema/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider text-crema print:text-sauce print:bg-transparent print:px-0">Propuesta Técnica Comercial</span>
                <span className="font-mono text-sm font-bold text-dorado">{cotizacion.id}</span>
              </div>
              <h2 className="font-titular text-2xl font-bold text-crema print:text-verde-profundo">Cotización de {getServicioLabel(cotizacion.servicioTipo)}</h2>
              <p className="text-xs text-crema/80 mt-1 print:text-carbon/60">Preparada especialmente para: <span className="font-semibold">{cotizacion.prospectoNombre}</span></p>
            </div>
            
            <button
              onClick={() => window.print()}
              className="rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2 text-xs font-semibold flex items-center gap-1.5 transition print:hidden shadow-sm self-start sm:self-center"
            >
              🖨️ Guardar PDF / Imprimir
            </button>

            {/* Logo exclusivo para impresión a la derecha */}
            <div className="hidden print:flex flex-col items-center self-center shrink-0 ml-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="SAUCEDA" className="h-10 w-10" />
              <div className="font-display text-[10px] font-bold tracking-tight text-verde-profundo leading-none mt-1">SAUCEDA</div>
              <div className="font-mono text-[6px] tracking-[0.15em] text-dorado uppercase leading-none mt-0.5">Construye</div>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-8">
            
            {/* Datos del Cliente */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-carbon/5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs print-break-inside-avoid shadow-sm/5">
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-carbon/40 uppercase tracking-wider">Datos del Cliente</div>
                <div className="text-base font-extrabold text-verde-profundo font-titular leading-tight">{cotizacion.prospectoNombre}</div>
                <div className="flex items-center gap-1.5 text-carbon/70">
                  <span className="font-semibold text-carbon/50">Número de Cliente:</span>
                  <span className="font-mono bg-slate-200/60 px-2 py-0.5 rounded text-[10px] font-bold text-carbon/80">{cotizacion.prospectoId}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-carbon/40 uppercase tracking-wider">Contacto y Ubicación</div>
                <div className="space-y-1 text-carbon/70">
                  <div className="flex items-start gap-1.5">
                    <span className="font-semibold text-carbon/50 w-16">Teléfono:</span>
                    <span>{cotizacion.prospectoTelefono || "—"}</span>
                  </div>
                  {cotizacion.prospectoCorreo && (
                    <div className="flex items-start gap-1.5">
                      <span className="font-semibold text-carbon/50 w-16">Correo:</span>
                      <span className="break-all">{cotizacion.prospectoCorreo}</span>
                    </div>
                  )}
                  {cotizacion.prospectoDireccion && (
                    <div className="flex items-start gap-1.5">
                      <span className="font-semibold text-carbon/50 w-16">Dirección:</span>
                      <span className="leading-relaxed">{cotizacion.prospectoDireccion}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 1. Desglose de Conceptos */}
            <div className="space-y-4">
              {/* Desglose de inversión */}
              <h3 className="font-titular text-lg font-bold text-verde-profundo border-b pb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sauce/10 text-sauce text-xs font-bold">1</span>
                Desglose e Importe de la Inversión
              </h3>
              <div className="overflow-x-auto rounded-xl border border-carbon/5">
                {(() => {
                  const tieneDescuento = conceptos.some((c) => (c.descuento || 0) > 0);
                  return (
                    <table className="w-full border-collapse text-left text-xs min-w-[550px]">
                      <thead className="bg-slate-50 border-b font-semibold text-carbon/50">
                        <tr>
                          <th className="px-4 py-3">Descripción del Concepto / Insumo</th>
                          <th className="px-4 py-3 text-center">Cantidad</th>
                          <th className="px-4 py-3 text-center">Unidad</th>
                          <th className="px-4 py-3 text-right font-mono">P. Unitario</th>
                          {tieneDescuento && <th className="px-4 py-3 text-center">Desc..</th>}
                          <th className="px-4 py-3 text-right">Importe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-carbon/5">
                        {conceptos.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50/20">
                            <td className="px-4 py-3 font-medium">{c.descripcion}</td>
                            <td className="px-4 py-3 text-center font-mono">{c.cantidad}</td>
                            <td className="px-4 py-3 text-center">{c.unidad}</td>
                            <td className="px-4 py-3 text-right font-mono">{formatMoneda(c.precioUnitario)}</td>
                            {tieneDescuento && (
                              <td className="px-4 py-3 text-center text-rose-600 font-semibold font-mono">
                                {c.descuento ? `-${c.descuento}%` : "—"}
                              </td>
                            )}
                            <td className="px-4 py-3 text-right font-mono font-semibold">{formatMoneda(c.importe)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>

              {/* Total Callout */}
              <div className="bg-slate-50 p-6 rounded-2xl border border-carbon/5 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                  <div className="text-sm font-bold text-carbon/80">Presupuesto Cerrado Llave en Mano</div>
                  <div className="text-xs text-carbon/40 mt-0.5">Incluye materiales de alta calidad, mano de obra y supervisión técnica. Precios más IVA.</div>
                </div>
                <div className="text-center sm:text-right">
                  <div className="text-xs text-carbon/40 uppercase font-semibold">Total de Inversión (Antes de IVA)</div>
                  <div className="font-mono text-3xl font-extrabold text-verde-profundo mt-1">
                    {formatMoneda(cotizacion.precioFinal)}
                  </div>
                  <div className="text-[10px] text-carbon/40 font-bold block mt-0.5">+ IVA (Antes de Impuestos)</div>
                </div>
              </div>
            </div>

            {/* 2. Reporte de Inspección */}
            {reporteVisita && (
              <div className="space-y-4 print-break-before">
                <h3 className="font-titular text-lg font-bold text-verde-profundo border-b pb-2 flex items-center justify-between gap-2 flex-wrap">
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sauce/10 text-sauce text-xs font-bold">2</span>
                    Levantamiento y Diagnóstico Técnico
                  </span>
                  <a
                    href={`/reporte-visita/${cotizacion.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs bg-sauce/15 text-sauce hover:bg-sauce hover:text-white px-2.5 py-1 rounded font-semibold transition flex items-center gap-1 font-titular print:hidden"
                  >
                    📄 Ver Reporte Independiente ↗
                  </a>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-3">
                    <p className="text-sm text-carbon/80 leading-relaxed font-cuerpo">
                      Tras la visita física realizada por nuestro inspector, se diagnosticaron las siguientes condiciones en el domicilio:
                    </p>
                    <div className="bg-slate-50 p-4 rounded-xl border border-carbon/5 text-sm text-carbon/80 whitespace-pre-line italic">
                      "{reporteVisita.observacionesTecnicas}"
                    </div>
                    {reporteVisita.condicionesSitio && (
                      <div className="text-xs text-carbon/60">
                        <span className="font-semibold text-carbon/70">Condiciones detectadas:</span> {reporteVisita.condicionesSitio}
                      </div>
                    )}
                  </div>
                  
                  {/* Ficha de Medidas */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-carbon/5 h-fit text-sm">
                    <table className="w-full text-xs">
                      <tbody>
                        <tr className="border-b"><td className="py-1.5 text-carbon/50">Largo</td><td className="py-1.5 font-mono text-right">{reporteVisita.medidas.largo || 0} m</td></tr>
                        <tr className="border-b"><td className="py-1.5 text-carbon/50">Ancho</td><td className="py-1.5 font-mono text-right">{reporteVisita.medidas.ancho || 0} m</td></tr>
                        <tr><td className="py-1.5 text-carbon/50 font-bold">Área Estimada</td><td className="py-1.5 font-mono font-bold text-verde-profundo text-right">{reporteVisita.medidas.areaCalculada || 0} m²</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Carrusel de Fotos */}
                {reporteVisita.fotos && reporteVisita.fotos.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="text-xs font-semibold text-carbon/40 uppercase">Evidencia Fotográfica del Diagnóstico</div>
                    <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video max-w-lg mx-auto">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={reporteVisita.fotos[slideActivo]} 
                        alt="Evidencia de diagnóstico" 
                        className="object-contain w-full h-full transition-transform duration-200" 
                        style={{ transform: `rotate(${reporteVisita.medidas?.rotaciones?.[reporteVisita.fotos[slideActivo]] || 0}deg)` }}
                      />
                      {reporteVisita.fotos.length > 1 && (
                        <>
                          <button
                            onClick={() => setSlideActivo(prev => (prev === 0 ? reporteVisita.fotos.length - 1 : prev - 1))}
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-2 hover:bg-black/60 transition"
                          >
                            ◀
                          </button>
                          <button
                            onClick={() => setSlideActivo(prev => (prev === reporteVisita.fotos.length - 1 ? 0 : prev + 1))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-2 hover:bg-black/60 transition"
                          >
                            ▶
                          </button>
                        </>
                      )}
                      
                      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded font-mono">
                        {slideActivo + 1} / {reporteVisita.fotos.length}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Nota Técnica Específica de Impermeabilización */}
            {cotizacion.servicioTipo === "impermeabilizacion" && (
              <div className="bg-amber-50/50 border border-amber-200/60 p-5 rounded-2xl space-y-3 font-cuerpo">
                <div className="flex items-center gap-2 text-amber-700 font-titular font-bold text-sm">
                  <span>⚠️</span>
                  <h4>NOTA IMPORTANTE:</h4>
                </div>
                <div className="text-xs text-carbon/70 space-y-2 leading-relaxed">
                  <p>
                    Las cotizaciones que te envié están basadas en los metros que mencionaste.
                  </p>
                  <p className="font-semibold text-carbon/80">
                    PERO la inspección técnica EN SITIO es ESENCIAL porque:
                  </p>
                  <ul className="space-y-1 pl-1">
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-600 font-bold">✓</span>
                      <span>Confirmamos los metros exactos (muchas veces varían).</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-600 font-bold">✓</span>
                      <span>Identificamos bordes, cornisas y áreas anexas que también necesitan impermeabilización.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-600 font-bold">✓</span>
                      <span>Evaluamos el estado de muros, drenajes y bajadas de agua.</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-600 font-bold">✓</span>
                      <span>Detectamos trabajos adicionales que pudieran ser necesarios.</span>
                    </li>
                  </ul>
                  <p>
                    En ocasiones, lo que parece 30m² en realidad son 35-40m² cuando se incluyen todos los lados y áreas adyacentes.
                  </p>
                  <p className="font-medium text-carbon/80">
                    Por eso la visita técnica es <span className="font-bold text-verde-profundo">GRATUITA y SIN COMPROMISO</span>. Te damos la cotización final exacta después de inspeccionarlo.
                  </p>
                  <p className="text-sauce font-semibold pt-1 text-xs">
                    ¿Agendamos para que nuestro técnico confirme todos los detalles?
                  </p>
                </div>
              </div>
            )}

            {/* 3. Condiciones de Servicio & Firma */}
            <div className="print-break-before space-y-8">
              {/* 3. Condiciones de Servicio */}
              <div className="space-y-3 print-break-inside-avoid">
                <h3 className="font-titular text-sm font-bold text-verde-profundo uppercase tracking-wider">Condiciones Comerciales y Garantía</h3>
                <ul className="list-disc pl-4 text-xs text-carbon/60 space-y-1">
                  <li><span className="font-semibold text-carbon/75">Precios:</span> Todos los precios expresados son más IVA (16% de Impuesto al Valor Agregado).</li>
                  <li><span className="font-semibold text-carbon/75">Vigencia:</span> Esta cotización cuenta con una vigencia de 15 días a partir de su envío.</li>
                  <li><span className="font-semibold text-carbon/75">Forma de pago:</span> {cotizacion.condicionesPago}</li>
                  <li><span className="font-semibold text-carbon/75">Garantía:</span> {cotizacion.garantia}</li>
                </ul>
              </div>

              {/* 4. Firma y Autorización */}
              <div className="border-t pt-6 space-y-4 print-break-inside-avoid">
                <h3 className="font-titular text-lg font-bold text-verde-profundo flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sauce/10 text-sauce text-xs font-bold">3</span>
                  Firma y Autorización de Orden de Trabajo
                </h3>
                
                <form onSubmit={handleAutorizar} className="space-y-4 max-w-lg">
                  {errorFirma && (
                    <div className="p-3 text-xs bg-rose-50 border border-rojo/30 rounded-lg text-rojo">
                      {errorFirma}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Nombre Completo del Cliente Autorizador</label>
                    <input
                      type="text"
                      required
                      value={nombreFirma}
                      onChange={(e) => setNombreFirma(e.target.value)}
                      placeholder="Escribe tu nombre completo"
                      className="w-full rounded-lg border border-carbon/20 px-3 py-2.5 text-sm focus:border-sauce focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Firma Digital (Dibuja en el recuadro)</label>
                    <div className="border border-carbon/20 rounded-xl overflow-hidden bg-slate-50 relative">
                      <canvas
                        ref={canvasRef}
                        width={400}
                        height={150}
                        onMouseDown={empezarDibujo}
                        onMouseMove={dibujar}
                        onMouseUp={terminarDibujo}
                        onMouseLeave={terminarDibujo}
                        onTouchStart={empezarDibujo}
                        onTouchMove={dibujar}
                        onTouchEnd={terminarDibujo}
                        className="w-full h-[150px] touch-none cursor-crosshair bg-white"
                      />
                      <button
                        type="button"
                        onClick={limpiarCanvas}
                        className="absolute bottom-2 right-2 text-[10px] bg-slate-200 hover:bg-slate-300 text-carbon/60 px-2.5 py-1 rounded font-semibold transition"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={cargando}
                      className="w-full rounded-xl bg-verde-profundo text-crema py-3 font-semibold hover:bg-verde-profundo/90 transition shadow-md disabled:opacity-50 text-sm"
                    >
                      {cargando ? "Autorizando Propuesta..." : "Autorizar e Iniciar Proyecto"}
                    </button>
                  </div>
                </form>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Pie de Página */}
      <div className="text-center text-xs text-carbon/40 mt-8 font-cuerpo print:hidden">
        SAUCEDA · Este es un portal seguro para la aprobación técnica de servicios de construcción. León, Gto.
      </div>

      <style>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          .print-break-before {
            break-before: page !important;
            page-break-before: always !important;
          }
          .print-break-inside-avoid {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .print\:hidden, button, form, nav, footer, .border-green-200 {
            display: none !important;
          }
          .bg-white, .bg-slate-50 {
            background-color: transparent !important;
            border-color: #e2e8f0 !important;
          }
          .shadow-xl, .shadow-md, .shadow-sm {
            box-shadow: none !important;
          }
          .max-w-4xl {
            max-width: 100% !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
