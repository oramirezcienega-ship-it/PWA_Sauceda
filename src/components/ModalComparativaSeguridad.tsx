"use client";

import React, { useEffect, useState } from "react";
import {
  generarComparativaSeguridad,
  listarFamiliasSeguridad,
  type FamiliaSeguridadResumen,
} from "@/app/actions/comparativa-seguridad";

// Comparativa de Seguridad: una imagen con las opciones de una familia del catálogo
// (videoporteros, cerraduras…) con foto y precio de venta. La misma imagen que envía Sofía.

export interface ModalComparativaSeguridadProps {
  abierto: boolean;
  onCerrar: () => void;
  nombreCliente?: string;
  onEnviarImagenDirecta?: (file: File, caption?: string) => Promise<boolean | void>;
}

function formatearDinero(monto: number) {
  return monto.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

export function ModalComparativaSeguridad({ abierto, onCerrar, nombreCliente, onEnviarImagenDirecta }: ModalComparativaSeguridadProps) {
  const [familias, setFamilias] = useState<FamiliaSeguridadResumen[]>([]);
  const [cargando, setCargando] = useState(false);
  const [clave, setClave] = useState<string | null>(null);
  const [imagen, setImagen] = useState<{ base64: string; nombre: string } | null>(null);
  const [generando, setGenerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setCargando(true);
    setError(null);
    listarFamiliasSeguridad()
      .then((fs) => {
        setFamilias(fs);
        if (fs.length > 0) setClave((c) => (c && fs.some((f) => f.clave === c) ? c : fs[0].clave));
      })
      .catch(() => setError("No se pudo cargar el catálogo de seguridad."))
      .finally(() => setCargando(false));
  }, [abierto]);

  useEffect(() => {
    if (!abierto || !clave) return;
    let vigente = true;
    setGenerando(true);
    setImagen(null);
    setError(null);
    generarComparativaSeguridad(clave)
      .then((r) => {
        if (!vigente) return;
        if (r.ok && r.base64) setImagen({ base64: r.base64, nombre: r.nombre || "" });
        else setError(r.error || "No se pudo generar la imagen.");
      })
      .catch(() => vigente && setError("No se pudo generar la imagen."))
      .finally(() => vigente && setGenerando(false));
    return () => {
      vigente = false;
    };
  }, [abierto, clave]);

  if (!abierto) return null;

  const archivo = () => {
    if (!imagen || !clave) return null;
    const bytes = Uint8Array.from(atob(imagen.base64), (c) => c.charCodeAt(0));
    return new File([bytes], `Opciones-${clave}.png`, { type: "image/png" });
  };

  function descargar() {
    const f = archivo();
    if (!f) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function enviar() {
    const f = archivo();
    if (!f || !onEnviarImagenDirecta || !imagen) return;
    setEnviando(true);
    try {
      const ok = await onEnviarImagenDirecta(f, `Opciones de ${imagen.nombre.toLowerCase()} — SAUCEDA. Precios sin factura (con factura se agrega IVA).`);
      if (ok !== false) {
        setAviso("¡Comparativa enviada al chat!");
        setTimeout(() => {
          setAviso(null);
          onCerrar();
        }, 1200);
      }
    } catch (e) {
      console.error("Error al enviar la comparativa de seguridad:", e);
      alert("Hubo un detalle al enviar la imagen al chat.");
    } finally {
      setEnviando(false);
    }
  }

  const familia = familias.find((f) => f.clave === clave);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-50 border border-carbon/15 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Cabecera */}
        <div className="bg-verde-profundo text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔐</span>
              <h2 className="text-lg sm:text-xl font-bold font-titular tracking-tight">Comparativa de Seguridad</h2>
            </div>
            <p className="text-xs text-crema/80 mt-0.5">
              Opciones del catálogo con foto y precio de venta para {nombreCliente || "el cliente"}.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition text-sm cursor-pointer"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {aviso && <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 text-center animate-pulse">✓ {aviso}</div>}

        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-[260px_1fr]">
          {/* Familias */}
          <div className="border-b md:border-b-0 md:border-r border-carbon/10 bg-white p-3 flex flex-col gap-1.5">
            {cargando && <p className="text-xs text-carbon/50 p-2">Cargando catálogo…</p>}
            {!cargando && familias.length === 0 && (
              <p className="text-xs text-carbon/60 p-2">
                Aún no hay productos de seguridad con precio de venta. Captúralo en Productos (tipo de negocio Seguridad); la
                Categoría define la familia.
              </p>
            )}
            {familias.map((f) => (
              <button
                key={f.clave}
                type="button"
                onClick={() => setClave(f.clave)}
                className={`text-left px-3 py-2 rounded-lg border transition cursor-pointer ${
                  f.clave === clave ? "bg-amber-50 border-amber-400" : "bg-white border-carbon/10 hover:bg-slate-50"
                }`}
              >
                <span className="block text-xs font-bold text-carbon">{f.nombre}</span>
                <span className="block text-[10px] text-carbon/60">
                  {f.productos.length} {f.productos.length === 1 ? "opción" : "opciones"} · desde {formatearDinero(f.productos[0]?.precio || 0)}
                </span>
              </button>
            ))}
            {familia && familia.productos.some((p) => !p.conFoto) && (
              <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-1">
                Sin foto: {familia.productos.filter((p) => !p.conFoto).map((p) => p.nombre).join(", ")}. Súbela en Productos.
              </p>
            )}
          </div>

          {/* Vista previa */}
          <div className="p-3 sm:p-4 flex items-center justify-center min-h-[260px]">
            {generando && <p className="text-xs text-carbon/50">Generando imagen…</p>}
            {!generando && error && <p className="text-xs text-red-700">{error}</p>}
            {!generando && imagen && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${imagen.base64}`}
                alt={`Opciones de ${imagen.nombre}`}
                className="w-full max-w-3xl rounded-lg border border-carbon/10 shadow-sm"
              />
            )}
          </div>
        </div>

        <div className="border-t border-carbon/10 bg-white p-3 flex flex-wrap justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={descargar}
            disabled={!imagen}
            className="px-3.5 py-2 rounded-lg bg-dorado hover:bg-dorado/90 text-carbon font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            📸 Descargar Imagen
          </button>
          {onEnviarImagenDirecta && (
            <button
              type="button"
              onClick={enviar}
              disabled={!imagen || enviando}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {enviando ? "⏳ Enviando imagen..." : "📤 Enviar Imagen al Chat"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
