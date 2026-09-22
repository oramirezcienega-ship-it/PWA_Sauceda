"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { MARCA } from "@/lib/marca";
import {
  CATALOGO_MODELOS,
  ACCESORIOS,
  calcularPresupuestoEstimado,
  type ResultadoPresupuesto,
} from "@/lib/cotizador/motor-precios";
import {
  generarSvgArquitectonicoPerspectiva,
  obtenerGeometriaInicial,
  type GeometriaVano3D,
} from "@/lib/ia/generador-visual-fachada";
import type { AnalisisVanoVision } from "@/lib/ia/estimador-vision";

// Fachadas de muestra pre-cargadas para pruebas inmediatas
const EJEMPLOS_FACHADAS = [
  {
    id: "cochera_doble",
    tipo: "porton" as const,
    titulo: "Cochera Doble Residencial",
    descripcion: "Fachada contemporánea 2 autos",
    anchoM: 5.10,
    altoM: 2.40,
    geo: {
      p_techo_izq: { x: 0.12, y: 0.24 },
      p_techo_der: { x: 0.88, y: 0.24 },
      p_piso_izq: { x: 0.12, y: 0.88 },
      p_piso_der: { x: 0.88, y: 0.88 },
    },
    svgPlaceholder: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
      <defs>
        <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="%2393C5FD"/><stop offset="100%" stop-color="%23E2E8F0"/></linearGradient>
        <linearGradient id="muro" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="%23F1F5F9"/><stop offset="100%" stop-color="%23E2E8F0"/></linearGradient>
        <linearGradient id="piso" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="%2394A3B8"/><stop offset="100%" stop-color="%2364748B"/></linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(%23cielo)"/>
      <rect x="0" y="320" width="800" height="180" fill="url(%23piso)"/>
      <rect x="50" y="80" width="700" height="260" fill="url(%23muro)" stroke="%23CBD5E1" stroke-width="2"/>
      <rect x="70" y="100" width="100" height="180" fill="%23475569" rx="3"/>
      <rect x="96" y="120" width="608" height="200" fill="%231E293B" rx="4"/>
      <text x="400" y="220" fill="%2394A3B8" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">COCHERA ABIERTA (5.10m x 2.40m)</text>
      <text x="400" y="250" fill="%2364748B" font-family="sans-serif" font-size="14" text-anchor="middle">Vano para portón contemporáneo</text>
    </svg>`,
  },
  {
    id: "patio_terraza",
    tipo: "pergola" as const,
    titulo: "Patio / Terraza Jardín",
    descripcion: "Jardín abierto para pérgola",
    anchoM: 4.60,
    altoM: 2.70,
    geo: {
      p_techo_izq: { x: 0.15, y: 0.22 },
      p_techo_der: { x: 0.85, y: 0.18 },
      p_piso_izq: { x: 0.18, y: 0.82 },
      p_piso_der: { x: 0.82, y: 0.78 },
    },
    svgPlaceholder: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
      <defs>
        <linearGradient id="cielo2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="%2360A5FA"/><stop offset="100%" stop-color="%23BFDBFE"/></linearGradient>
        <linearGradient id="pasto" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="%2316A34A"/><stop offset="100%" stop-color="%2315803D"/></linearGradient>
      </defs>
      <rect width="800" height="500" fill="url(%23cielo2)"/>
      <rect x="0" y="340" width="800" height="160" fill="url(%23pasto)"/>
      <rect x="60" y="100" width="680" height="250" fill="%23FEF3C7" stroke="%23FDE68A" stroke-width="2"/>
      <text x="400" y="210" fill="%2392400E" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle">ESPACIO DE TERRAZA (4.60m x 2.70m)</text>
      <text x="400" y="240" fill="%23B45309" font-family="sans-serif" font-size="14" text-anchor="middle">Área para Pérgola Estructural o Cristal</text>
    </svg>`,
  },
];

export function VisualizerAndEstimator() {
  // 1. Estados principales
  const [tipoProyecto, setTipoProyecto] = useState<"porton" | "pergola">("porton");
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [pasoAnalisis, setPasoAnalisis] = useState("");
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null);

  // 2. Geometría 3D y Perspectiva
  const [geo3D, setGeo3D] = useState<GeometriaVano3D>(obtenerGeometriaInicial("porton"));
  const [calibrandoPerspectiva, setCalibrandoPerspectiva] = useState(false);
  const [pinActivo, setPinActivo] = useState<string | null>(null);

  // 3. Medidas paramétricas
  const [analisis, setAnalisis] = useState<AnalisisVanoVision | null>(null);
  const [anchoManual, setAnchoManual] = useState<number>(5.0);
  const [altoManual, setAltoManual] = useState<number>(2.4);
  const [modoEdicionMedidas, setModoEdicionMedidas] = useState(false);

  // 4. Opciones de modelo y accesorios
  const [modeloSeleccionado, setModeloSeleccionado] = useState<string>("porton_duela");
  const [motorElectrico, setMotorElectrico] = useState<boolean>(false);
  const [cerraduraDigital, setCerraduraDigital] = useState<boolean>(false);

  // 5. Control del Split Slider Antes vs Después
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sincronizar tipo de proyecto con modelo por defecto y geometría
  useEffect(() => {
    if (tipoProyecto === "porton") {
      setModeloSeleccionado("porton_duela");
      setGeo3D(obtenerGeometriaInicial("porton", analisis?.bounding_box_normalized));
    } else {
      setModeloSeleccionado("pergola_cristal");
      setMotorElectrico(false);
      setGeo3D(obtenerGeometriaInicial("pergola"));
    }
  }, [tipoProyecto]);

  const modelosDisponibles = useMemo(() => {
    return Object.values(CATALOGO_MODELOS).filter((m) => m.tipo === tipoProyecto);
  }, [tipoProyecto]);

  const areaM2 = useMemo(() => {
    return Number((anchoManual * altoManual).toFixed(2));
  }, [anchoManual, altoManual]);

  const presupuesto: ResultadoPresupuesto = useMemo(() => {
    return calcularPresupuestoEstimado({
      area_sqm: areaM2,
      model_id: modeloSeleccionado,
      motor_electrico: motorElectrico,
      cerradura_digital: cerraduraDigital,
    });
  }, [areaM2, modeloSeleccionado, motorElectrico, cerraduraDigital]);

  // Procesar archivo cargado
  const procesarArchivoImagen = useCallback(
    async (file: File) => {
      setErrorAnalisis(null);
      setAnalizando(true);
      setPasoAnalisis("Optimizando imagen de alta resolución...");

      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const dataUrl = await base64Promise;
        setImagenUrl(dataUrl);

        setPasoAnalisis("IA Multimodal: extrayendo vano, líneas de fuga y escala...");
        const res = await fetch("/api/estimator/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: dataUrl,
            project_type: tipoProyecto,
          }),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || "No se pudo completar el análisis visual.");
        }

        const data: AnalisisVanoVision = await res.json();
        setAnalisis(data);
        setAnchoManual(data.estimated_width_m || (tipoProyecto === "porton" ? 5.0 : 4.5));
        setAltoManual(data.estimated_height_m || (tipoProyecto === "porton" ? 2.4 : 2.7));

        // Inicializar geometría espacial 3D según vano detectado
        setGeo3D(obtenerGeometriaInicial(tipoProyecto, data.bounding_box_normalized));

        if (data.error_user_friendly) {
          setErrorAnalisis(data.error_user_friendly);
        }
      } catch (err: any) {
        console.error("Error al procesar archivo:", err);
        setErrorAnalisis(err.message || "Error al procesar la fotografía.");
      } finally {
        setAnalizando(false);
      }
    },
    [tipoProyecto]
  );

  // Cargar ejemplo pre-cargado
  const cargarEjemplo = (ejemplo: (typeof EJEMPLOS_FACHADAS)[0]) => {
    setTipoProyecto(ejemplo.tipo);
    setImagenUrl(ejemplo.svgPlaceholder);
    setErrorAnalisis(null);
    setAnchoManual(ejemplo.anchoM);
    setAltoManual(ejemplo.altoM);
    setGeo3D(ejemplo.geo);
    setAnalisis({
      opening_detected: true,
      opening_type: ejemplo.tipo === "porton" ? "garage" : "patio",
      bounding_box_normalized: [0.15, 0.1, 0.85, 0.9],
      estimated_width_m: ejemplo.anchoM,
      estimated_height_m: ejemplo.altoM,
      estimated_area_sqm: Number((ejemplo.anchoM * ejemplo.altoM).toFixed(2)),
      confidence_score: 0.95,
      reference_anchors_used: ["car", "slab_height", "pedestrian_door"],
      notes: "Ejemplo pre-calibrado para simulación visual 3D.",
    });
  };

  // Movimiento del Slider
  const handleSliderMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(percentage);
  }, []);

  // Movimiento de los Pines de Perspectiva 3D
  const handlePinMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!pinActivo || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const normX = Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width));
      const normY = Math.max(0.02, Math.min(0.98, (clientY - rect.top) / rect.height));

      setGeo3D((prev) => {
        const next = { ...prev };
        if (pinActivo === "techo_izq") next.p_techo_izq = { x: normX, y: normY };
        if (pinActivo === "techo_der") next.p_techo_der = { x: normX, y: normY };
        if (pinActivo === "piso_izq") next.p_piso_izq = { x: normX, y: normY };
        if (pinActivo === "piso_der") next.p_piso_der = { x: normX, y: normY };
        return next;
      });
    },
    [pinActivo]
  );

  // Manejador unificado de puntero
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pinActivo) {
        handlePinMove(e.clientX, e.clientY);
      } else if (isDraggingSlider) {
        handleSliderMove(e.clientX);
      }
    },
    [pinActivo, isDraggingSlider, handlePinMove, handleSliderMove]
  );

  const onPointerUp = useCallback(() => {
    setPinActivo(null);
    setIsDraggingSlider(false);
  }, []);

  // SVG 3D generado en tiempo real según la geometría de anclaje
  const svgPerspectiva3D = useMemo(() => {
    return generarSvgArquitectonicoPerspectiva(modeloSeleccionado, geo3D, 1000, 700);
  }, [modeloSeleccionado, geo3D]);

  // Mensaje dinámico para WhatsApp
  const urlWhatsApp = useMemo(() => {
    const tel = MARCA.whatsapp || "524774654700";
    const mod = presupuesto.modelo.nombre;
    const precioRango = `$${presupuesto.total_estimado_min.toLocaleString("es-MX")} - $${presupuesto.total_estimado_max.toLocaleString("es-MX")} MXN`;
    const precioProm = `$${presupuesto.total_estimado_promedio.toLocaleString("es-MX")} MXN`;

    let extrasTxt = "";
    if (motorElectrico) extrasTxt += " + Motor Merik/LiftMaster";
    if (cerraduraDigital) extrasTxt += " + Cerradura Digital";

    const msg = `Hola SAUCEDA, acabo de cotizar un *${mod}* en su visualizador 3D.
📐 *Medidas estimadas:* ${anchoManual.toFixed(2)}m (Ancho) × ${altoManual.toFixed(2)}m (Alto) = *${areaM2} m²*
💵 *Presupuesto aprox:* ${precioProm} (Rango: ${precioRango})${extrasTxt ? `\n⚙️ *Adicionales:* ${extrasTxt}` : ""}
📍 Me gustaría agendar una visita técnica en León, Gto. para validar medidas físicas con láser y revisar acabados.`;

    return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
  }, [presupuesto, anchoManual, altoManual, areaM2, motorElectrico, cerraduraDigital]);

  return (
    <div className="w-full max-w-5xl mx-auto font-cuerpo text-carbon">
      {/* 1. Selector de Tipo de Proyecto */}
      <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-carbon/10 shadow-xs">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-sauce bg-sauce/10 px-2.5 py-1 rounded-full">
            Visualizador Arquitectónico 3D
          </span>
          <h2 className="text-xl sm:text-2xl font-titular font-bold text-verde-profundo mt-1">
            Simulador Espacial de Fachada y Terraza
          </h2>
          <p className="text-xs sm:text-sm text-carbon/70">
            Renderizado estructural con columnas, vigas en perspectiva, sombras reales y cotización paramétrica instantánea.
          </p>
        </div>

        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-carbon/5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setTipoProyecto("porton")}
            className={`flex-1 sm:flex-initial px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              tipoProyecto === "porton"
                ? "bg-verde-profundo text-white shadow-xs"
                : "text-carbon/60 hover:text-carbon"
            }`}
          >
            <span>🚗</span> Portones
          </button>
          <button
            type="button"
            onClick={() => setTipoProyecto("pergola")}
            className={`flex-1 sm:flex-initial px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              tipoProyecto === "pergola"
                ? "bg-verde-profundo text-white shadow-xs"
                : "text-carbon/60 hover:text-carbon"
            }`}
          >
            <span>🌿</span> Pérgolas
          </button>
        </div>
      </div>

      {/* 2. Área de Carga o Visualizador */}
      {!imagenUrl ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-carbon/20 p-6 sm:p-10 text-center shadow-xs">
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 bg-sauce/10 text-sauce rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
              📸
            </div>
            <h3 className="text-lg sm:text-xl font-bold font-titular text-carbon mb-2">
              Sube una foto de tu cochera, patio o terraza
            </h3>
            <p className="text-xs sm:text-sm text-carbon/60 mb-6">
              El motor detecta el vano, proyecta la estructura en perspectiva 3D sobre tu muro y terreno, y calcula el presupuesto exacto.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <label className="w-full sm:w-auto cursor-pointer bg-sauce hover:bg-sauce/90 text-white font-semibold px-5 py-3 rounded-xl shadow-md transition flex items-center justify-center gap-2 text-sm">
                <span>📷</span> Tomar foto con cámara
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) procesarArchivoImagen(file);
                  }}
                />
              </label>

              <label className="w-full sm:w-auto cursor-pointer bg-slate-100 hover:bg-slate-200 text-carbon font-semibold px-5 py-3 rounded-xl border border-carbon/10 transition flex items-center justify-center gap-2 text-sm">
                <span>📁</span> Elegir de galería
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) procesarArchivoImagen(file);
                  }}
                />
              </label>
            </div>

            {/* Ejemplos de prueba rápida */}
            <div className="mt-8 pt-6 border-t border-carbon/10">
              <span className="text-xs font-semibold text-carbon/50 uppercase tracking-wider block mb-3">
                O prueba al instante con una muestra pre-cargada:
              </span>
              <div className="flex flex-wrap justify-center gap-2">
                {EJEMPLOS_FACHADAS.map((ej) => (
                  <button
                    key={ej.id}
                    type="button"
                    onClick={() => cargarEjemplo(ej)}
                    className="text-xs bg-slate-50 hover:bg-slate-100 text-verde-profundo font-semibold px-3 py-2 rounded-lg border border-carbon/10 flex items-center gap-1.5 transition"
                  >
                    <span>{ej.tipo === "porton" ? "🏠" : "🏡"}</span>
                    {ej.titulo}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* SIMULADOR 3D INTERACTIVO CON SLIDER ANTES VS DESPUÉS */}
          <div className="bg-white rounded-3xl border border-carbon/15 p-4 sm:p-6 shadow-xs overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <h3 className="font-titular font-bold text-lg text-carbon">
                  Simulador de Fachada y Espacio Real
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {/* Botón para activar/desactivar calibración de perspectiva con 4 puntos */}
                <button
                  type="button"
                  onClick={() => setCalibrandoPerspectiva(!calibrandoPerspectiva)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
                    calibrandoPerspectiva
                      ? "bg-amber-100 text-amber-900 border-amber-300"
                      : "bg-slate-50 text-carbon/70 border-carbon/10 hover:bg-slate-100"
                  }`}
                >
                  <span>📐</span>
                  <span>{calibrandoPerspectiva ? "Fijar Anclajes" : "Calibrar Perspectiva 3D"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setImagenUrl(null);
                    setAnalisis(null);
                    setErrorAnalisis(null);
                  }}
                  className="text-xs font-semibold text-carbon/60 hover:text-rojo px-3 py-1.5 rounded-lg border border-carbon/10 hover:bg-rojo/5 transition"
                >
                  🔄 Cambiar foto
                </button>
              </div>
            </div>

            {/* Aviso de Calibración Activa */}
            {calibrandoPerspectiva && (
              <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs px-3.5 py-2 rounded-xl flex items-center justify-between">
                <span>
                  💡 <strong>Modo Calibración:</strong> Arrastra los 4 círculos blancos para alinear las columnas en el piso y anclar las vigas en el muro.
                </span>
                <button
                  type="button"
                  onClick={() => setCalibrandoPerspectiva(false)}
                  className="font-bold underline ml-2 cursor-pointer"
                >
                  Listo
                </button>
              </div>
            )}

            {/* CONTENEDOR DEL SLIDER & LIENZO 3D */}
            <div
              ref={containerRef}
              className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-carbon/5 rounded-2xl overflow-hidden select-none border border-carbon/10 shadow-inner"
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {/* CAPA DE FONDO: DESPUÉS (Render con Estructura 3D, Columnas, Sombras y Materiales) */}
              <div className="absolute inset-0 w-full h-full">
                <img
                  src={imagenUrl}
                  alt="Fachada base"
                  className="w-full h-full object-cover"
                />

                {/* SVG Tridimensional en perspectiva */}
                <div
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  dangerouslySetInnerHTML={{ __html: svgPerspectiva3D }}
                />

                <span className="absolute bottom-3 right-3 bg-verde-profundo/90 backdrop-blur-xs text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow pointer-events-none">
                  ✨ Propuesta SAUCEDA 3D
                </span>
              </div>

              {/* CAPA FRONTAL: ANTES (Foto Original del Cliente) recortada por el slider */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${sliderPos}%` }}
              >
                <img
                  src={imagenUrl}
                  alt="Antes"
                  className="absolute inset-0 w-full h-full object-cover max-w-none"
                  style={{
                    width: containerRef.current
                      ? `${containerRef.current.clientWidth}px`
                      : "100%",
                  }}
                />

                <span className="absolute bottom-3 left-3 bg-carbon/80 backdrop-blur-xs text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow pointer-events-none">
                  📷 Foto Actual
                </span>
              </div>

              {/* PINES INTERACTIVOS DE PERSPECTIVA 3D (Visibles en modo calibración) */}
              {calibrandoPerspectiva && (
                <div className="absolute inset-0 z-30">
                  {/* Pin 1: Anclaje Muro Izquierdo */}
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setPinActivo("techo_izq");
                    }}
                    className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 border-2 border-white shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center text-[10px] font-bold text-carbon"
                    style={{
                      left: `${geo3D.p_techo_izq.x * 100}%`,
                      top: `${geo3D.p_techo_izq.y * 100}%`,
                    }}
                    title="Anclaje Muro Izquierdo"
                  >
                    1
                  </div>

                  {/* Pin 2: Anclaje Muro Derecho */}
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setPinActivo("techo_der");
                    }}
                    className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 border-2 border-white shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center text-[10px] font-bold text-carbon"
                    style={{
                      left: `${geo3D.p_techo_der.x * 100}%`,
                      top: `${geo3D.p_techo_der.y * 100}%`,
                    }}
                    title="Anclaje Muro Derecho"
                  >
                    2
                  </div>

                  {/* Pin 3: Base Columna Piso Izquierda */}
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setPinActivo("piso_izq");
                    }}
                    className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 border-2 border-white shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center text-[10px] font-bold text-carbon"
                    style={{
                      left: `${geo3D.p_piso_izq.x * 100}%`,
                      top: `${geo3D.p_piso_izq.y * 100}%`,
                    }}
                    title="Base Columna Piso Izquierda"
                  >
                    3
                  </div>

                  {/* Pin 4: Base Columna Piso Derecha */}
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setPinActivo("piso_der");
                    }}
                    className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 border-2 border-white shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center text-[10px] font-bold text-carbon"
                    style={{
                      left: `${geo3D.p_piso_der.x * 100}%`,
                      top: `${geo3D.p_piso_der.y * 100}%`,
                    }}
                    title="Base Columna Piso Derecha"
                  >
                    4
                  </div>
                </div>
              )}

              {/* LÍNEA DIVISORIA Y CONTROLADOR DEL SLIDER */}
              {!calibrandoPerspectiva && (
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] cursor-ew-resize z-20"
                  style={{ left: `${sliderPos}%` }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setIsDraggingSlider(true);
                  }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 bg-white text-carbon rounded-full shadow-lg border-2 border-verde-profundo flex items-center justify-center font-bold text-xs select-none cursor-ew-resize">
                    ↔
                  </div>
                </div>
              )}

              {/* HUD Animado de Escaneo Láser */}
              {analizando && (
                <div className="absolute inset-0 bg-carbon/65 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-white z-40">
                  <div className="relative w-full max-w-xs h-40 border-2 border-sauce/50 rounded-xl overflow-hidden mb-4 bg-carbon/40">
                    <div className="absolute inset-x-0 h-1 bg-emerald-400 shadow-[0_0_15px_#10B981] animate-[bounce_2s_infinite]"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 border-4 border-sauce/30 border-t-sauce rounded-full animate-spin"></div>
                    </div>
                  </div>
                  <span className="text-sm font-bold tracking-wide uppercase text-emerald-400 mb-1">
                    Análisis Métrico y Espacial
                  </span>
                  <p className="text-xs text-slate-200 text-center max-w-xs animate-pulse">
                    {pasoAnalisis || "Detectando geometría y escala..."}
                  </p>
                </div>
              )}
            </div>

            <p className="mt-2 text-center text-xs text-carbon/50">
              👉 Desliza la barra horizontalmente para comparar la foto actual vs. el diseño en 3D.
            </p>
          </div>

          {/* Aviso si hubo advertencia */}
          {errorAnalisis && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-amber-800 text-xs sm:text-sm flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="font-semibold">{errorAnalisis}</p>
                <p className="mt-0.5 text-amber-700/90 text-xs">
                  Puedes calibrar los anclajes con el botón "Calibrar Perspectiva 3D" o ajustar las medidas en el panel inferior.
                </p>
              </div>
            </div>
          )}

          {/* 3. Selector de Variantes de Diseño */}
          <div className="bg-white rounded-3xl border border-carbon/15 p-4 sm:p-6 shadow-xs">
            <h4 className="font-titular font-bold text-lg text-carbon mb-3">
              Selecciona el Modelo de {tipoProyecto === "porton" ? "Portón" : "Pérgola"}
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {modelosDisponibles.map((m) => {
                const esActivo = modeloSeleccionado === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModeloSeleccionado(m.id)}
                    className={`text-left p-4 rounded-2xl border-2 transition-all relative flex flex-col justify-between ${
                      esActivo
                        ? "border-verde-profundo bg-verde-profundo/5 shadow-md"
                        : "border-carbon/10 hover:border-carbon/30 bg-slate-50/50"
                    }`}
                  >
                    {m.badge && (
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md self-start mb-2 ${
                          esActivo
                            ? "bg-verde-profundo text-white"
                            : "bg-carbon/10 text-carbon/70"
                        }`}
                      >
                        {m.badge}
                      </span>
                    )}

                    <div>
                      <h5 className="font-bold text-carbon text-base mb-1">{m.nombre}</h5>
                      <p className="text-xs text-carbon/60 line-clamp-2 mb-3">
                        {m.descripcionCorta}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-carbon/10 flex items-center justify-between text-xs">
                      <span className="font-bold text-sauce text-sm">
                        ${m.precioPromedioM2.toLocaleString("es-MX")}{" "}
                        <span className="text-[11px] font-normal text-carbon/60">/ m²</span>
                      </span>
                      <span className="text-carbon/60 text-[11px]">
                        Garantía {m.garantiaAnos} años
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Tarjeta de Medidas Métricas y Edición Manual */}
          <div className="bg-white rounded-3xl border border-carbon/15 p-4 sm:p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h4 className="font-titular font-bold text-lg text-carbon">
                  Dimensiones de Fabricación
                </h4>
                <p className="text-xs text-carbon/60">
                  {analisis?.confidence_score
                    ? `Nivel de calibración métrica: ${(analisis.confidence_score * 100).toFixed(0)}%`
                    : "Dimensiones estimadas paramétricamente"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModoEdicionMedidas(!modoEdicionMedidas)}
                className="text-xs font-semibold text-sauce hover:underline flex items-center gap-1"
              >
                ✏️ {modoEdicionMedidas ? "Ocultar ajuste" : "Ajustar medidas"}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-4 bg-slate-50 p-4 rounded-2xl border border-carbon/10 text-center">
              <div>
                <span className="text-xs text-carbon/50 uppercase font-semibold">Ancho</span>
                <p className="text-xl sm:text-2xl font-bold font-titular text-carbon">
                  {anchoManual.toFixed(2)} m
                </p>
              </div>
              <div className="border-x border-carbon/10">
                <span className="text-xs text-carbon/50 uppercase font-semibold">Alto / Saliente</span>
                <p className="text-xl sm:text-2xl font-bold font-titular text-carbon">
                  {altoManual.toFixed(2)} m
                </p>
              </div>
              <div>
                <span className="text-xs text-carbon/50 uppercase font-semibold">Superficie</span>
                <p className="text-xl sm:text-2xl font-bold font-titular text-verde-profundo">
                  {areaM2} m²
                </p>
              </div>
            </div>

            {modoEdicionMedidas && (
              <div className="mt-4 pt-4 border-t border-carbon/10 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/70 p-4 rounded-xl">
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span>Ancho: {anchoManual.toFixed(2)} m</span>
                    <span className="text-carbon/50">2.0m - 10.0m</span>
                  </div>
                  <input
                    type="range"
                    min="2.0"
                    max="10.0"
                    step="0.1"
                    value={anchoManual}
                    onChange={(e) => setAnchoManual(parseFloat(e.target.value))}
                    className="w-full accent-verde-profundo"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span>Alto / Fondo: {altoManual.toFixed(2)} m</span>
                    <span className="text-carbon/50">1.8m - 5.0m</span>
                  </div>
                  <input
                    type="range"
                    min="1.8"
                    max="5.0"
                    step="0.1"
                    value={altoManual}
                    onChange={(e) => setAltoManual(parseFloat(e.target.value))}
                    className="w-full accent-verde-profundo"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 5. Accesorios Opcionales */}
          <div className="bg-white rounded-3xl border border-carbon/15 p-4 sm:p-6 shadow-xs">
            <h4 className="font-titular font-bold text-lg text-carbon mb-3">
              Opciones y Accesorios
            </h4>

            <div className="space-y-3">
              {tipoProyecto === "porton" && (
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-carbon/10 hover:border-carbon/25 bg-slate-50/50 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={motorElectrico}
                    onChange={(e) => setMotorElectrico(e.target.checked)}
                    className="mt-1 w-5 h-5 rounded accent-verde-profundo cursor-pointer"
                  />
                  <div className="flex-1 text-xs sm:text-sm">
                    <div className="flex items-center justify-between font-bold text-carbon">
                      <span>{ACCESORIOS.motor_electrico.nombre}</span>
                      <span className="text-sauce">
                        +${ACCESORIOS.motor_electrico.precioPromedio.toLocaleString("es-MX")} MXN
                      </span>
                    </div>
                    <p className="text-carbon/60 text-xs mt-0.5">
                      {ACCESORIOS.motor_electrico.descripcion}
                    </p>
                  </div>
                </label>
              )}

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-carbon/10 hover:border-carbon/25 bg-slate-50/50 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={cerraduraDigital}
                  onChange={(e) => setCerraduraDigital(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded accent-verde-profundo cursor-pointer"
                />
                <div className="flex-1 text-xs sm:text-sm">
                  <div className="flex items-center justify-between font-bold text-carbon">
                    <span>{ACCESORIOS.cerradura_digital.nombre}</span>
                    <span className="text-sauce">
                      +${ACCESORIOS.cerradura_digital.precioPromedio.toLocaleString("es-MX")} MXN
                    </span>
                  </div>
                  <p className="text-carbon/60 text-xs mt-0.5">
                    {ACCESORIOS.cerradura_digital.descripcion}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* 6. Presupuesto y Cierre de Venta WhatsApp */}
          <div className="bg-gradient-to-br from-verde-profundo to-[#1E3A20] rounded-3xl p-6 sm:p-8 text-white shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/15">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 bg-white/10 px-3 py-1 rounded-full">
                  Presupuesto Estimado Llave en Mano
                </span>
                <h3 className="text-2xl sm:text-3xl font-titular font-bold mt-2">
                  ${presupuesto.total_estimado_promedio.toLocaleString("es-MX")} MXN
                </h3>
                <p className="text-xs sm:text-sm text-white/80 mt-1">
                  Rango estimado: ${presupuesto.total_estimado_min.toLocaleString("es-MX")} a $
                  {presupuesto.total_estimado_max.toLocaleString("es-MX")} MXN
                </p>
              </div>

              <div className="w-full md:w-auto">
                <a
                  href={urlWhatsApp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full md:w-auto inline-flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold px-6 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all text-sm sm:text-base text-center"
                >
                  <span className="text-xl">💬</span>
                  <span>Solicitar visita técnica para validar medidas</span>
                </a>
                <p className="text-[11px] text-white/60 text-center mt-2">
                  Visita técnica con perito herrero sin costo en León, Gto.
                </p>
              </div>
            </div>

            <div className="pt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs text-white/85">
              {presupuesto.beneficios_incluidos.map((b, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
