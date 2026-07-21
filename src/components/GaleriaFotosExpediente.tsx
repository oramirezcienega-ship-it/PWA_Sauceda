"use client";

import { useState, useEffect, useCallback } from "react";
import {
  obtenerFotosExpediente,
  subirFotosExpediente,
  rotarFotoExpediente,
  eliminarFotoExpediente,
  type FotoExpediente,
} from "@/app/actions/expedientes";

interface Props {
  expedienteId: string;
  readonly?: boolean;
}

export function GaleriaFotosExpediente({ expedienteId, readonly = false }: Props) {
  const [fotos, setFotos] = useState<FotoExpediente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<FotoExpediente | null>(null);

  const cargarFotos = useCallback(async () => {
    try {
      setCargando(true);
      const res = await obtenerFotosExpediente(expedienteId);
      setFotos(res);
    } catch (err: any) {
      console.error("Error al cargar fotos:", err);
    } finally {
      setCargando(false);
    }
  }, [expedienteId]);

  useEffect(() => {
    void cargarFotos();
  }, [cargarFotos]);

  async function handleSubirFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setSubiendo(true);
    setError(null);

    const formData = new FormData();
    formData.append("expedienteId", expedienteId);
    Array.from(files).forEach((file) => {
      formData.append("archivos", file);
    });

    try {
      const res = await subirFotosExpediente(formData);
      if (!res.ok) {
        setError(res.error || "Error al subir las fotografías.");
      } else {
        await cargarFotos();
      }
    } catch (err: any) {
      setError(err.message || "Error al subir fotografías.");
    } finally {
      setSubiendo(false);
      e.target.value = "";
    }
  }

  async function handleRotar(foto: FotoExpediente) {
    const nueva = (foto.rotacion + 90) % 360;
    setFotos((prev) =>
      prev.map((f) => (f.id === foto.id ? { ...f, rotacion: nueva } : f))
    );
    try {
      await rotarFotoExpediente(foto.id, nueva);
    } catch (err) {
      console.error("Error al rotar foto:", err);
    }
  }

  async function handleEliminar(fotoId: string) {
    if (!confirm("¿Deseas eliminar esta fotografía?")) return;
    setFotos((prev) => prev.filter((f) => f.id !== fotoId));
    try {
      await eliminarFotoExpediente(fotoId);
    } catch (err) {
      console.error("Error al eliminar foto:", err);
      void cargarFotos();
    }
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h4 className="font-bold text-verde-profundo text-xs uppercase tracking-wider flex items-center gap-2">
            <span>📸</span> Galería de Fotos de la Propiedad ({fotos.length})
          </h4>
          <p className="text-[11px] text-carbon/60 mt-0.5">
            Fotografías tomadas en la inspección o enviadas por el cliente
          </p>
        </div>

        {!readonly && (
          <label className="inline-flex items-center gap-1.5 bg-sauce hover:bg-verde-profundo text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition shadow-xs">
            <span>{subiendo ? "⏳ Subiendo..." : "📷 + Subir Fotos"}</span>
            <input
              type="file"
              multiple
              accept="image/*"
              disabled={subiendo}
              onChange={handleSubirFotos}
              className="hidden"
            />
          </label>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {error}
        </div>
      )}

      {cargando ? (
        <div className="py-6 text-center text-xs text-carbon/40 animate-pulse">
          Cargando fotos del inmueble...
        </div>
      ) : fotos.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-slate-200 rounded-lg bg-white">
          <p className="text-xs text-carbon/50 mb-1">Aún no hay fotos adjuntas a este expediente.</p>
          {!readonly && (
            <p className="text-[11px] text-carbon/40">
              Haz clic en "+ Subir Fotos" para adjuntar imágenes de la propiedad.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {fotos.map((foto) => (
            <div
              key={foto.id}
              className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col"
            >
              <div
                onClick={() => setFotoAmpliada(foto)}
                className="relative aspect-4/3 w-full bg-slate-100 overflow-hidden cursor-pointer flex items-center justify-center"
              >
                <img
                  src={foto.url}
                  alt={foto.nombre_archivo || "Foto propiedad"}
                  className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                  style={{ transform: `rotate(${foto.rotacion}deg)` }}
                />
              </div>

              {!readonly && (
                <div className="p-1.5 bg-white border-t border-slate-100 flex items-center justify-between gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => handleRotar(foto)}
                    className="flex-1 py-1 rounded bg-slate-100 hover:bg-slate-200 text-carbon/80 font-bold transition flex items-center justify-center gap-1"
                    title="Rotar 90°"
                  >
                    <span>🔄</span> 90°
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEliminar(foto.id)}
                    className="p-1 rounded hover:bg-red-50 text-red-600 font-bold transition"
                    title="Eliminar foto"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal / Lightbox de Foto Ampliada */}
      {fotoAmpliada && (
        <div
          onClick={() => setFotoAmpliada(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-carbon rounded-2xl p-2 overflow-hidden shadow-2xl flex flex-col items-center"
          >
            <button
              onClick={() => setFotoAmpliada(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 text-white font-bold flex items-center justify-center text-sm backdrop-blur-xs transition"
            >
              ✕
            </button>
            <div className="p-4 overflow-auto flex items-center justify-center">
              <img
                src={fotoAmpliada.url}
                alt="Foto ampliada"
                className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-lg"
                style={{ transform: `rotate(${fotoAmpliada.rotacion}deg)` }}
              />
            </div>
            <div className="w-full px-4 py-2 border-t border-white/10 flex items-center justify-between text-xs text-white/70">
              <span className="truncate">{fotoAmpliada.nombre_archivo || "Fotografía de la propiedad"}</span>
              <button
                type="button"
                onClick={() => handleRotar(fotoAmpliada)}
                className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg font-bold transition flex items-center gap-1"
              >
                🔄 Rotar 90°
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
