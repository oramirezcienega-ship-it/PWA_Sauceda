"use client";

import { useEffect, useRef, useState } from "react";
import { PublicacionProgramada } from "@/app/actions/marketing";
import {
  MetadatosVideo,
  ResultadoPrevalidacionVideo,
  extraerMetadatosVideoCliente,
  prevalidarVideoParaPlataforma,
  obtenerReglaPlataforma,
} from "@/lib/video-validador";

interface ModalSubirVideoProps {
  publicacion: PublicacionProgramada | null;
  isOpen: boolean;
  onClose: () => void;
  onVideoSubido: (pubActualizada: PublicacionProgramada) => void;
}

export default function ModalSubirVideo({
  publicacion,
  isOpen,
  onClose,
  onVideoSubido,
}: ModalSubirVideoProps) {
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [metadatos, setMetadatos] = useState<MetadatosVideo | null>(null);
  const [prevalidacion, setPrevalidacion] = useState<ResultadoPrevalidacionVideo | null>(null);
  const [leyendoMetadatos, setLeyendoMetadatos] = useState(false);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [progresoSubida, setProgresoSubida] = useState<number>(0);
  const [tipoFormatoElegido, setTipoFormatoElegido] = useState<"reel" | "video">("reel");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Limpiar estado al cerrar o cambiar publicación
  useEffect(() => {
    if (!isOpen) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setArchivoSeleccionado(null);
      setPreviewUrl(null);
      setMetadatos(null);
      setPrevalidacion(null);
      setErrorLectura(null);
      setSubiendo(false);
      setProgresoSubida(0);
    } else if (publicacion) {
      const esReelInicial =
        publicacion.plataforma === "tiktok" ||
        publicacion.tipo_formato === "reel" ||
        publicacion.plataforma === "instagram";
      setTipoFormatoElegido(esReelInicial ? "reel" : "video");
    }
  }, [isOpen, publicacion]);

  if (!isOpen || !publicacion) return null;

  const plataforma = publicacion.plataforma;
  const regla = obtenerReglaPlataforma(plataforma, tipoFormatoElegido);

  const getIconoPlataforma = (p: string) => {
    switch (p) {
      case "instagram":
        return "🟣";
      case "facebook":
        return "🔵";
      case "tiktok":
        return "⚫";
      case "whatsapp":
        return "🟢";
      case "mautic":
        return "🟠";
      default:
        return "📱";
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorLectura(null);
    setLeyendoMetadatos(true);
    setArchivoSeleccionado(file);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const newPreview = URL.createObjectURL(file);
    setPreviewUrl(newPreview);

    try {
      const meta = await extraerMetadatosVideoCliente(file);
      setMetadatos(meta);

      const val = prevalidarVideoParaPlataforma(meta, plataforma, tipoFormatoElegido);
      setPrevalidacion(val);
      if (val.formatoRecomendado) {
        setTipoFormatoElegido(val.formatoRecomendado);
      }
    } catch (err: any) {
      console.error("Error al extraer metadatos de video:", err);
      setErrorLectura(err?.message || "No se pudo leer la información del video.");
      setMetadatos(null);
      setPrevalidacion(null);
    } finally {
      setLeyendoMetadatos(false);
    }
  };

  const handleSubirVideo = async () => {
    if (!archivoSeleccionado || !publicacion.id) return;
    if (prevalidacion && !prevalidacion.puedePublicar) {
      alert("Corrige los requisitos críticos antes de subir el video.");
      return;
    }

    setSubiendo(true);
    setProgresoSubida(20);

    try {
      const formData = new FormData();
      formData.append("id", publicacion.id);
      formData.append("file", archivoSeleccionado);
      formData.append("tipo_formato", tipoFormatoElegido);
      if (metadatos) {
        formData.append("metadatos", JSON.stringify(metadatos));
      }

      setProgresoSubida(50);
      const res = await fetch("/api/marketing/subir-arte", {
        method: "POST",
        body: formData,
      });

      setProgresoSubida(90);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Fallo en el servidor al guardar el video.");
      }

      setProgresoSubida(100);
      onVideoSubido(json.data as PublicacionProgramada);
      onClose();
    } catch (err: any) {
      console.error("Error al subir video:", err);
      alert("Error al subir video: " + (err.message || String(err)));
      setSubiendo(false);
      setProgresoSubida(0);
    }
  };

  return (
    <div className="fixed inset-0 bg-carbon/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-dorado/30 my-auto flex flex-col max-h-[92vh]">
        {/* Encabezado */}
        <div className="px-6 py-4 bg-verde-profundo text-crema flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getIconoPlataforma(plataforma)}</span>
            <div>
              <h3 className="font-bold text-base sm:text-lg leading-tight flex items-center gap-2">
                <span>Subir y Validar Video para {regla.nombrePlataforma}</span>
              </h3>
              <p className="text-xs text-crema/75 mt-0.5 line-clamp-1">
                Post: <span className="text-crema font-semibold">{publicacion.titulo}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={subiendo}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold cursor-pointer transition disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo con Scroll */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Tarjeta de Requisitos de la Plataforma */}
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3.5 text-xs text-carbon/80">
            <div className="flex items-center justify-between font-bold text-amber-900 mb-1.5">
              <span className="flex items-center gap-1.5">
                <span>📋 Requisitos Oficiales para {regla.nombrePlataforma}:</span>
              </span>
              <span className="text-[10px] bg-amber-200/70 text-amber-950 px-2 py-0.5 rounded-full font-mono">
                {regla.aspectRatioRequerido === "9:16" ? "Vertical 9:16" : "Feed Estándar"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] mt-2">
              <div className="bg-white/70 p-2 rounded-xl border border-amber-200/50">
                <span className="text-carbon/50 block text-[9px] font-bold uppercase">Duración</span>
                <span className="font-semibold text-carbon">
                  {regla.duracionMinimaSeg}s - {regla.duracionMaximaSeg}s
                </span>
                <span className="text-[9px] text-carbon/50 block mt-0.5">Rec: {regla.duracionRecomendada}</span>
              </div>
              <div className="bg-white/70 p-2 rounded-xl border border-amber-200/50">
                <span className="text-carbon/50 block text-[9px] font-bold uppercase">Proporción</span>
                <span className="font-semibold text-carbon">{regla.aspectRatioRequerido.toUpperCase()}</span>
                <span className="text-[9px] text-carbon/50 block mt-0.5">Rec: {regla.resolucionRecomendada}</span>
              </div>
              <div className="bg-white/70 p-2 rounded-xl border border-amber-200/50">
                <span className="text-carbon/50 block text-[9px] font-bold uppercase">Peso Máximo</span>
                <span className="font-semibold text-carbon">Hasta {regla.pesoMaximoMb} MB</span>
                <span className="text-[9px] text-carbon/50 block mt-0.5">Carga en nube</span>
              </div>
              <div className="bg-white/70 p-2 rounded-xl border border-amber-200/50">
                <span className="text-carbon/50 block text-[9px] font-bold uppercase">Formato</span>
                <span className="font-semibold text-carbon">
                  {regla.formatoContenedor.map((f) => `.${f}`).join(", ")}
                </span>
                <span className="text-[9px] text-carbon/50 block mt-0.5">{regla.codecsRequeridos.split("/")[0]}</span>
              </div>
            </div>
          </div>

          {/* Selector de Archivo / Dropzone */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
            className="hidden"
          />

          {!archivoSeleccionado ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-dorado/40 hover:border-verde-profundo bg-crema/10 hover:bg-crema/20 rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 group"
            >
              <div className="w-14 h-14 rounded-full bg-verde-profundo/10 group-hover:bg-verde-profundo/20 text-verde-profundo flex items-center justify-center text-3xl transition">
                📹
              </div>
              <div>
                <p className="font-bold text-sm text-carbon">
                  Haz clic para seleccionar el video o arrástralo aquí
                </p>
                <p className="text-xs text-carbon/60 mt-1">
                  Formatos aceptados: MP4, MOV, WebM (Máx. {regla.pesoMaximoMb} MB)
                </p>
              </div>
              <button
                type="button"
                className="bg-verde-profundo text-crema text-xs font-bold px-4 py-2 rounded-xl shadow-xs hover:bg-verde-profundo/90 transition cursor-pointer mt-1"
              >
                📁 Explorar en mi equipo
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Vista Previa del Video y Controles */}
              <div className="bg-carbon/5 rounded-2xl p-3 border border-carbon/10 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-full sm:w-48 aspect-[9/16] max-h-56 bg-black rounded-xl overflow-hidden shadow-md flex items-center justify-center relative shrink-0">
                  {previewUrl && (
                    <video
                      src={previewUrl}
                      controls
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  )}
                  {leyendoMetadatos && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white text-xs gap-2">
                      <div className="w-5 h-5 border-2 border-dorado border-t-transparent rounded-full animate-spin" />
                      <span>Analizando video...</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 w-full space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-carbon truncate max-w-[280px]" title={archivoSeleccionado.name}>
                        {archivoSeleccionado.name}
                      </p>
                      <p className="text-xs text-carbon/60 font-mono">
                        {(archivoSeleccionado.size / (1024 * 1024)).toFixed(2)} MB • {archivoSeleccionado.type || "video/mp4"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={subiendo}
                      className="text-xs font-bold text-dorado hover:underline cursor-pointer shrink-0"
                    >
                      🔄 Cambiar
                    </button>
                  </div>

                  {/* Selector de tipo de formato destino */}
                  <div className="pt-2 border-t border-carbon/10">
                    <label className="text-[11px] font-bold text-carbon/70 block mb-1">
                      Destino en la plataforma:
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTipoFormatoElegido("reel");
                          if (metadatos) {
                            setPrevalidacion(prevalidarVideoParaPlataforma(metadatos, plataforma, "reel"));
                          }
                        }}
                        className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                          tipoFormatoElegido === "reel"
                            ? "bg-verde-profundo text-crema border-verde-profundo shadow-2xs"
                            : "bg-white text-carbon/70 border-carbon/20 hover:bg-gray-50"
                        }`}
                      >
                        📱 Reel / TikTok (Vertical)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTipoFormatoElegido("video");
                          if (metadatos) {
                            setPrevalidacion(prevalidarVideoParaPlataforma(metadatos, plataforma, "video"));
                          }
                        }}
                        className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold border transition cursor-pointer text-center ${
                          tipoFormatoElegido === "video"
                            ? "bg-verde-profundo text-crema border-verde-profundo shadow-2xs"
                            : "bg-white text-carbon/70 border-carbon/20 hover:bg-gray-50"
                        }`}
                      >
                        🎥 Video Feed (Estándar)
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error al leer el video */}
              {errorLectura && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3.5 text-xs text-red-700 flex items-start gap-2">
                  <span className="text-base shrink-0">❌</span>
                  <div>
                    <span className="font-bold block">Error al decodificar el archivo</span>
                    <p className="mt-0.5">{errorLectura}</p>
                  </div>
                </div>
              )}

              {/* Diagnóstico y Checklist de Pre-Validación Técnica */}
              {prevalidacion && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-carbon/80 uppercase">
                      Diagnóstico Técnico de Aceptación ({regla.nombrePlataforma}):
                    </span>
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        prevalidacion.puedePublicar
                          ? "bg-emerald-500/15 text-emerald-800"
                          : "bg-red-500/15 text-red-800"
                      }`}
                    >
                      {prevalidacion.puedePublicar ? "✓ Aprobado para programar" : "✕ Requiere Ajustes"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {prevalidacion.items.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                          item.estado === "valido"
                            ? "bg-emerald-50/50 border-emerald-500/20 text-emerald-950"
                            : item.estado === "advertencia"
                            ? "bg-amber-50/60 border-amber-500/30 text-amber-950"
                            : "bg-red-50/70 border-red-500/30 text-red-950"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-sm shrink-0">
                            {item.estado === "valido" ? "✅" : item.estado === "advertencia" ? "⚠️" : "❌"}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold">{item.criterio}:</span>
                              <span className="font-mono text-[11px] bg-white/60 px-1 rounded">
                                {item.valorDetectado}
                              </span>
                            </div>
                            <p className="text-[11px] opacity-80 mt-0.5 leading-snug">{item.mensaje}</p>
                          </div>
                        </div>
                        <span className="text-[10px] opacity-60 font-mono shrink-0 hidden sm:inline">
                          Req: {item.requisitoEsperado}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Resumen o Sugerencia */}
                  {prevalidacion.sugerenciaOptimizacion && (
                    <div
                      className={`p-3 rounded-xl border text-xs leading-relaxed ${
                        prevalidacion.esValido
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800"
                          : "bg-red-500/10 border-red-500/30 text-red-800 font-medium"
                      }`}
                    >
                      {prevalidacion.sugerenciaOptimizacion}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Barra de Progreso de Subida */}
          {subiendo && (
            <div className="space-y-1.5 p-3 bg-verde-profundo/5 border border-verde-profundo/20 rounded-2xl animate-in fade-in">
              <div className="flex justify-between text-xs font-bold text-verde-profundo">
                <span>Subiendo video y optimizando para la nube...</span>
                <span>{progresoSubida}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-verde-profundo h-full transition-all duration-300"
                  style={{ width: `${progresoSubida}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Pie del Modal con Botones */}
        <div className="px-6 py-4 bg-gray-50 border-t border-carbon/10 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={subiendo}
            className="px-4 py-2 rounded-xl text-xs font-bold text-carbon/70 hover:bg-gray-200 transition cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSubirVideo}
            disabled={
              !archivoSeleccionado ||
              leyendoMetadatos ||
              subiendo ||
              Boolean(prevalidacion && !prevalidacion.puedePublicar)
            }
            className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition cursor-pointer flex items-center gap-2 ${
              prevalidacion && !prevalidacion.puedePublicar
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-verde-profundo hover:bg-verde-profundo/90 text-crema"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {subiendo ? (
              <>
                <div className="w-4 h-4 border-2 border-crema border-t-transparent rounded-full animate-spin" />
                <span>Guardando Video...</span>
              </>
            ) : (
              <>
                <span>🚀</span>
                <span>Subir y Asignar Video a la Publicación</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
