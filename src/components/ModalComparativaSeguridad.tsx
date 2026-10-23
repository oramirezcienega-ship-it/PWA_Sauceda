"use client";

import React, { useEffect, useState } from "react";
import {
  crearComboSeguridad,
  generarComparativaSeguridad,
  listarFamiliasSeguridad,
  type FamiliaSeguridadResumen,
} from "@/app/actions/comparativa-seguridad";
import { COMPLEMENTOS_FAMILIA } from "@/lib/ia/catalogo-seguridad";

const COMPLEMENTO_MOTIVO: Record<string, string> = Object.fromEntries(
  Object.entries(COMPLEMENTOS_FAMILIA).map(([clave, c]) => [clave, c.motivo])
);

// Comparativa de Seguridad: una imagen con las opciones de una familia del catálogo
// (videoporteros, cerraduras…) con foto y precio de venta. La misma imagen que envía Sofía.

export interface ModalComparativaSeguridadProps {
  abierto: boolean;
  onCerrar: () => void;
  nombreCliente?: string;
  /** Teléfono de la conversación: para armar el combo como cotización del cliente. */
  telefono?: string;
  onEnviarImagenDirecta?: (file: File, caption?: string) => Promise<boolean | void>;
}

function formatearDinero(monto: number) {
  return monto.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

type RolCombo = "incluido" | "opcional" | "fuera";

export function ModalComparativaSeguridad({ abierto, onCerrar, nombreCliente, telefono, onEnviarImagenDirecta }: ModalComparativaSeguridadProps) {
  const [familias, setFamilias] = useState<FamiliaSeguridadResumen[]>([]);
  const [cargando, setCargando] = useState(false);
  const [clave, setClave] = useState<string | null>(null);
  const [imagen, setImagen] = useState<{ base64: string; nombre: string } | null>(null);
  const [generando, setGenerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviandoFotos, setEnviandoFotos] = useState<string | null>(null);
  const [vistaCombo, setVistaCombo] = useState(false);
  const [rolesCombo, setRolesCombo] = useState<Record<string, RolCombo>>({});
  const [creandoCombo, setCreandoCombo] = useState(false);
  const [comboCreado, setComboCreado] = useState<string | null>(null);

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

  /** Envía al chat las fotos del producto que eligió el cliente (una imagen por foto). */
  async function enviarFotos(p: FamiliaSeguridadResumen["productos"][number]) {
    if (!onEnviarImagenDirecta) return;
    setEnviandoFotos(p.id);
    let enviadas = 0;
    try {
      for (let i = 0; i < p.fotos.length; i++) {
        const foto = p.fotos[i];
        const res = await fetch(foto.url);
        if (!res.ok) continue;
        const blob = await res.blob();
        const ext = blob.type.includes("png") ? "png" : "jpg";
        const file = new File([blob], `${p.id}-${i + 1}.${ext}`, { type: blob.type || "image/jpeg" });
        const ok = await onEnviarImagenDirecta(file, `${p.nombre}${foto.titulo ? ` — ${foto.titulo}` : ""}`);
        if (ok !== false) enviadas++;
      }
      setAviso(enviadas > 0 ? `${enviadas} foto(s) enviadas al chat` : "No se pudieron enviar las fotos");
      setTimeout(() => setAviso(null), 2000);
    } catch (e) {
      console.error("Error al enviar las fotos del producto:", e);
      alert("Hubo un detalle al enviar las fotos al chat.");
    } finally {
      setEnviandoFotos(null);
    }
  }

  /** Abre el armado del combo con todo en "No va"; el asesor marca lo incluido y lo opcional. */
  function abrirCombo() {
    setRolesCombo({});
    setComboCreado(null);
    setError(null);
    setVistaCombo(true);
  }

  async function crearCombo() {
    if (!telefono) return;
    const fijos = Object.keys(rolesCombo).filter((id) => rolesCombo[id] === "incluido");
    const opcionales = Object.keys(rolesCombo).filter((id) => rolesCombo[id] === "opcional");
    setCreandoCombo(true);
    setError(null);
    try {
      const r = await crearComboSeguridad(telefono, { fijos, opcionales });
      if (r.ok && r.cotizacionId) setComboCreado(r.cotizacionId);
      else setError(r.error || "No se pudo crear la cotización.");
    } catch {
      setError("No se pudo crear la cotización.");
    } finally {
      setCreandoCombo(false);
    }
  }

  const todosLosProductos = familias.flatMap((f) => f.productos.map((p) => ({ ...p, familia: f.nombre })));
  const totalIncluido = todosLosProductos.filter((p) => rolesCombo[p.id] === "incluido").reduce((s, p) => s + p.precio, 0);
  const totalOpcional = todosLosProductos.filter((p) => rolesCombo[p.id] === "opcional").reduce((s, p) => s + p.precio, 0);

  const familia = familias.find((f) => f.clave === clave);
  const claveComplemento = familia ? COMPLEMENTOS_FAMILIA[familia.clave]?.familia : undefined;
  const complemento = familias.find((f) => f.clave === claveComplemento) || null;

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
            {familia && (
              <div className="mt-2 border-t border-carbon/10 pt-2 space-y-1.5">
                <p className="text-[10px] font-bold text-carbon/60 uppercase tracking-wide">Si ya eligió una opción</p>
                {familia.productos.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-carbon/10 px-2 py-1.5">
                    <div className="min-w-0">
                      <span className="block text-[11px] font-bold text-carbon truncate" title={p.nombre}>{p.nombre}</span>
                      <span className="block text-[10px] text-carbon/60">{formatearDinero(p.precio)}</span>
                    </div>
                    {p.fotos.length > 0 ? (
                      onEnviarImagenDirecta && (
                        <button
                          type="button"
                          onClick={() => enviarFotos(p)}
                          disabled={enviandoFotos !== null}
                          title="Enviar al chat las fotos de este producto"
                          className="shrink-0 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-carbon cursor-pointer disabled:opacity-50"
                        >
                          {enviandoFotos === p.id ? "⏳" : `📷 ${p.fotos.length}`}
                        </button>
                      )
                    ) : (
                      <span className="shrink-0 text-[10px] text-amber-700">Sin foto</span>
                    )}
                  </div>
                ))}
                {complemento && (
                  <button
                    type="button"
                    onClick={() => setClave(complemento.clave)}
                    className="w-full text-left text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2 cursor-pointer hover:bg-emerald-100"
                  >
                    💡 Ofrécele también <b>{complemento.nombre}</b>, para {COMPLEMENTO_MOTIVO[familia.clave]}. Ver comparativa →
                  </button>
                )}
              </div>
            )}
          </div>

          {vistaCombo ? (
            /* Armado del combo (cotización modular) */
            <div className="p-3 sm:p-4 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-carbon">🧩 Combo como cotización</h3>
                <p className="text-[11px] text-carbon/60">
                  Marca lo que el cliente ya eligió como <b>Incluido</b> y lo que quieras sugerirle como <b>Opcional</b>. En su enlace
                  podrá prender o apagar los opcionales y ver el total al momento.
                </p>
              </div>
              {comboCreado ? (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-2">
                  <p>
                    ✓ Cotización <b>{comboCreado}</b> creada y pendiente de aprobación. Revísala, apruébala y envíale el enlace al
                    cliente desde Construcción.
                  </p>
                  <a
                    href={`/construccion/${comboCreado}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  >
                    Abrir cotización ↗
                  </a>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-carbon/10 bg-white divide-y divide-carbon/10">
                    {todosLosProductos.map((p) => {
                      const rol = rolesCombo[p.id] || "fuera";
                      return (
                        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <div className="min-w-0">
                            <span className="block text-xs font-bold text-carbon">{p.nombre}</span>
                            <span className="block text-[10px] text-carbon/60">
                              {p.familia} · {formatearDinero(p.precio)}
                            </span>
                          </div>
                          <div className="flex rounded-lg border border-carbon/15 overflow-hidden text-[10px] font-bold">
                            {(["incluido", "opcional", "fuera"] as const).map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setRolesCombo((prev) => ({ ...prev, [p.id]: r }))}
                                className={`px-2.5 py-1 cursor-pointer ${
                                  rol !== r
                                    ? "bg-white text-carbon/60 hover:bg-slate-50"
                                    : r === "incluido"
                                      ? "bg-verde-profundo text-white"
                                      : r === "opcional"
                                        ? "bg-amber-400 text-carbon"
                                        : "bg-slate-200 text-carbon"
                                }`}
                              >
                                {r === "incluido" ? "Incluido" : r === "opcional" ? "Opcional" : "No va"}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-carbon">
                    Incluido: <b>{formatearDinero(totalIncluido)}</b>
                    {totalOpcional > 0 && (
                      <>
                        {" "}
                        · Con todos los opcionales: <b>{formatearDinero(totalIncluido + totalOpcional)}</b>
                      </>
                    )}
                  </p>
                  {!telefono && <p className="text-[11px] text-red-700">Abre este cotizador desde una conversación para ligar la cotización al cliente.</p>}
                  {error && <p className="text-[11px] text-red-700">{error}</p>}
                </>
              )}
            </div>
          ) : (
          /* Vista previa */
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
          )}
        </div>

        <div className="border-t border-carbon/10 bg-white p-3 flex flex-wrap justify-end gap-2 shrink-0">
          {vistaCombo ? (
            <>
              <button
                type="button"
                onClick={() => setVistaCombo(false)}
                className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-carbon font-bold text-xs transition cursor-pointer"
              >
                ← Volver a la comparativa
              </button>
              {!comboCreado && (
                <button
                  type="button"
                  onClick={crearCombo}
                  disabled={!telefono || totalIncluido === 0 || creandoCombo}
                  className="px-4 py-2 rounded-lg bg-verde-profundo hover:bg-verde-profundo/90 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {creandoCombo ? "⏳ Creando cotización..." : "🧩 Crear cotización del combo"}
                </button>
              )}
            </>
          ) : (
          <>
          <button
            type="button"
            onClick={abrirCombo}
            disabled={familias.length === 0}
            className="mr-auto px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-carbon font-bold text-xs transition cursor-pointer disabled:opacity-50"
          >
            🧩 Armar combo
          </button>
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
          </>
          )}
        </div>
      </div>
    </div>
  );
}
