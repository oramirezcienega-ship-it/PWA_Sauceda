"use client";

import { useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/cliente-navegador";
import { formatoPesos } from "@/lib/formato";
import { CAPACIDADES_COMUNES_LITROS } from "@/lib/tarifas-capacidad";
import {
  guardarOfertaPortal,
  prepararSubidaFotoPortal,
  type OfertaPortalProveedor,
} from "@/app/actions/portal-precios-proveedor";
import type { FotoOfertaProveedor } from "@/lib/types";

interface Props {
  token: string;
  proveedorNombre: string;
  ofertasIniciales: OfertaPortalProveedor[];
}

const inputCls =
  "w-full min-w-0 rounded-lg border border-carbon/20 bg-white px-3 py-2.5 text-sm text-carbon outline-none focus:border-sauce";
const labelCls = "mb-1 block text-xs font-semibold text-carbon/70";

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function PortalPreciosProveedorClient({ token, proveedorNombre, ofertasIniciales }: Props) {
  const [ofertas, setOfertas] = useState(ofertasIniciales);
  const [abierta, setAbierta] = useState<string | null>(ofertasIniciales.length === 1 ? ofertasIniciales[0].id : null);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 font-cuerpo">
      <header className="rounded-2xl bg-gradient-to-r from-verde-profundo to-sauce p-5 text-white shadow-md">
        <div className="text-[11px] font-bold uppercase tracking-wider text-crema/80">SAUCEDA · Proveedores</div>
        <h1 className="mt-1 font-titular text-xl font-bold text-crema">{proveedorNombre}</h1>
        <p className="mt-2 text-sm text-crema/90">
          Actualiza aquí tus costos, garantía, proceso y fotos de los servicios que nos ofreces. Guarda cada producto al
          terminar; nosotros revisamos los cambios antes de usarlos.
        </p>
      </header>

      {ofertas.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-carbon/20 bg-white p-8 text-center text-sm text-carbon/60">
          Aún no tienes productos asignados. Pide a SAUCEDA que los registre.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {ofertas.map((o) => (
            <TarjetaOferta
              key={o.id}
              token={token}
              oferta={o}
              abierta={abierta === o.id}
              onAlternar={() => setAbierta((x) => (x === o.id ? null : o.id))}
              onGuardada={(nueva) => setOfertas((prev) => prev.map((x) => (x.id === nueva.id ? nueva : x)))}
            />
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-[11px] text-carbon/40">
        Este link es personal. No lo compartas fuera de tu empresa.
      </p>
    </div>
  );
}

function TarjetaOferta({
  token,
  oferta,
  abierta,
  onAlternar,
  onGuardada,
}: {
  token: string;
  oferta: OfertaPortalProveedor;
  abierta: boolean;
  onAlternar: () => void;
  onGuardada: (o: OfertaPortalProveedor) => void;
}) {
  const unidad = oferta.productoUnidad;
  const [costoUnitario, setCostoUnitario] = useState(oferta.costoUnitario ? String(oferta.costoUnitario) : "");
  const [porCapacidad, setPorCapacidad] = useState(
    oferta.tarifasCapacidad.length > 0 || /tinaco|aljib|cisterna/i.test(oferta.productoNombre)
  );
  const [capacidades, setCapacidades] = useState<{ hastaLitros: string; costo: string }[]>(
    oferta.tarifasCapacidad.map((t) => ({ hastaLitros: String(t.hastaLitros), costo: String(t.costo) }))
  );
  const [rangos, setRangos] = useState<{ hasta: string; costo: string }[]>(
    oferta.costosVolumen.map((r) => ({ hasta: String(r.hasta), costo: String(r.costo) }))
  );
  const [cantidadMinima, setCantidadMinima] = useState(oferta.cantidadMinima ? String(oferta.cantidadMinima) : "");
  const [montoMinimo, setMontoMinimo] = useState(oferta.montoMinimo ? String(oferta.montoMinimo) : "");
  const [descripcionProceso, setDescripcionProceso] = useState(oferta.descripcionProceso);
  const [garantiaAnios, setGarantiaAnios] = useState(oferta.garantiaAnios ? String(oferta.garantiaAnios) : "");
  const [garantiaCondiciones, setGarantiaCondiciones] = useState(oferta.garantiaCondiciones);
  const [tiempoEjecucion, setTiempoEjecucion] = useState(oferta.tiempoEjecucion);
  const [anticipoPct, setAnticipoPct] = useState(oferta.anticipoPct ? String(oferta.anticipoPct) : "");
  const [condicionesPago, setCondicionesPago] = useState(oferta.condicionesPago);
  const [zonasCobertura, setZonasCobertura] = useState(oferta.zonasCobertura);
  const [vigenciaPrecio, setVigenciaPrecio] = useState(oferta.vigenciaPrecio || "");
  const [fotos, setFotos] = useState<FotoOfertaProveedor[]>(oferta.fotos);

  const [subiendo, setSubiendo] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const inputFotos = useRef<HTMLInputElement>(null);

  // Resumen visible con la tarjeta cerrada
  const resumenCosto =
    porCapacidad && capacidades.some((c) => c.costo !== "")
      ? capacidades
          .filter((c) => c.costo !== "")
          .slice(0, 2)
          .map((c) => `${Number(c.hastaLitros).toLocaleString("es-MX")} L ${formatoPesos(Number(c.costo))}`)
          .join(" · ")
      : costoUnitario
      ? `${formatoPesos(Number(costoUnitario))}/${unidad}`
      : "Sin costo capturado";

  async function subirFotos(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setMensaje(null);
    const lista = Array.from(archivos).slice(0, Math.max(0, 12 - fotos.length));
    setSubiendo(lista.length);
    const nuevas: FotoOfertaProveedor[] = [];
    for (const archivo of lista) {
      try {
        const prep = await prepararSubidaFotoPortal(token, archivo.name);
        if (!prep.ok || !prep.ruta || !prep.token || !prep.url) throw new Error(prep.error || "No se pudo preparar.");
        const { error } = await supabaseNavegador()
          .storage.from("expedientes-fotos")
          .uploadToSignedUrl(prep.ruta, prep.token, archivo, { contentType: archivo.type || "image/jpeg" });
        if (error) throw new Error(error.message);
        nuevas.push({ url: prep.url, titulo: "" });
      } catch (err: any) {
        setMensaje({ tipo: "error", texto: `No se pudo subir ${archivo.name}: ${err?.message || "error"}` });
      } finally {
        setSubiendo((n) => n - 1);
      }
    }
    setFotos((prev) => [...prev, ...nuevas]);
    if (inputFotos.current) inputFotos.current.value = "";
  }

  function cargarCapacidadesComunes() {
    setCapacidades((prev) => {
      const existentes = new Set(prev.map((c) => Number(c.hastaLitros)));
      return [
        ...prev,
        ...CAPACIDADES_COMUNES_LITROS.filter((l) => !existentes.has(l)).map((l) => ({ hastaLitros: String(l), costo: "" })),
      ].sort((a, b) => Number(a.hastaLitros) - Number(b.hastaLitros));
    });
  }

  async function guardar() {
    setMensaje(null);
    setGuardando(true);
    try {
      const res = await guardarOfertaPortal(token, oferta.id, {
        costoUnitario: Number(costoUnitario || 0),
        costosVolumen: porCapacidad
          ? []
          : rangos.filter((r) => r.hasta !== "" && r.costo !== "").map((r) => ({ hasta: Number(r.hasta), costo: Number(r.costo) })),
        tarifasCapacidad: porCapacidad
          ? capacidades
              .filter((c) => c.hastaLitros !== "" && c.costo !== "")
              .map((c) => ({ hastaLitros: Number(c.hastaLitros), costo: Number(c.costo) }))
          : [],
        cantidadMinima: Number(cantidadMinima || 0),
        montoMinimo: Number(montoMinimo || 0),
        descripcionProceso,
        garantiaAnios: Number(garantiaAnios || 0),
        garantiaCondiciones,
        tiempoEjecucion,
        anticipoPct: Number(anticipoPct || 0),
        condicionesPago,
        zonasCobertura,
        fotos,
        vigenciaPrecio: vigenciaPrecio || null,
      });
      if (!res.ok || !res.oferta) {
        setMensaje({ tipo: "error", texto: res.mensaje || "No se pudo guardar." });
        return;
      }
      onGuardada(res.oferta);
      setMensaje({ tipo: "ok", texto: "✓ Guardado. Gracias, revisaremos tus cambios." });
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo guardar. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-carbon/10 bg-white shadow-sm">
      <button type="button" onClick={onAlternar} className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-carbon/50">{oferta.productoCategoria}</div>
          <div className="font-titular text-base font-bold text-verde-profundo">{oferta.productoNombre}</div>
          <div className="mt-0.5 text-sm text-carbon/70">{resumenCosto}</div>
          {oferta.actualizadoPorProveedorAt && (
            <div className="mt-0.5 text-[11px] text-carbon/40">
              Última actualización: {formatoFecha(oferta.actualizadoPorProveedorAt)}
            </div>
          )}
        </div>
        <span className="shrink-0 text-carbon/40">{abierta ? "▲" : "▼"}</span>
      </button>

      {abierta && (
        <div className="space-y-5 border-t border-carbon/10 p-4">
          {oferta.productoDescripcion && (
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-carbon/70">{oferta.productoDescripcion}</p>
          )}

          {/* Costo */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-verde-profundo">💲 Tu costo para SAUCEDA</h3>
            <label className="flex items-center gap-2 text-sm text-carbon/80">
              <input type="checkbox" checked={porCapacidad} onChange={(e) => setPorCapacidad(e.target.checked)} />
              Cobro según la capacidad en litros (tinacos, aljibes, cisternas)
            </label>

            {porCapacidad ? (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[11px] font-bold uppercase text-carbon/50">
                  <span>Capacidad (litros)</span>
                  <span>Tu costo ($)</span>
                  <span className="w-6" />
                </div>
                {capacidades.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={c.hastaLitros}
                      onChange={(e) =>
                        setCapacidades((prev) => prev.map((x, j) => (j === i ? { ...x, hastaLitros: e.target.value } : x)))
                      }
                      className={inputCls}
                      placeholder="Litros"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={c.costo}
                      onChange={(e) =>
                        setCapacidades((prev) => prev.map((x, j) => (j === i ? { ...x, costo: e.target.value } : x)))
                      }
                      className={inputCls}
                      placeholder="$"
                    />
                    <button
                      type="button"
                      onClick={() => setCapacidades((prev) => prev.filter((_, j) => j !== i))}
                      className="w-6 text-rojo"
                      aria-label="Quitar capacidad"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => setCapacidades((prev) => [...prev, { hastaLitros: "", costo: "" }])}
                    className="font-semibold text-sauce"
                  >
                    + Agregar capacidad
                  </button>
                  <button type="button" onClick={cargarCapacidadesComunes} className="font-semibold text-sauce">
                    + Capacidades comunes
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Costo por {unidad} ($)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={costoUnitario}
                    onChange={(e) => setCostoUnitario(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-carbon/70">¿Precio especial por volumen? (opcional)</div>
                  {rangos.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        value={r.hasta}
                        onChange={(e) => setRangos((prev) => prev.map((x, j) => (j === i ? { ...x, hasta: e.target.value } : x)))}
                        className={inputCls}
                        placeholder={`Hasta ${unidad}`}
                      />
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={r.costo}
                        onChange={(e) => setRangos((prev) => prev.map((x, j) => (j === i ? { ...x, costo: e.target.value } : x)))}
                        className={inputCls}
                        placeholder={`$ por ${unidad}`}
                      />
                      <button
                        type="button"
                        onClick={() => setRangos((prev) => prev.filter((_, j) => j !== i))}
                        className="w-6 text-rojo"
                        aria-label="Quitar rango"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setRangos((prev) => [...prev, { hasta: "", costo: "" }])}
                    className="text-sm font-semibold text-sauce"
                  >
                    + Agregar rango
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Cobras mínimo ({porCapacidad ? "servicios" : unidad})</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={cantidadMinima}
                  onChange={(e) => setCantidadMinima(e.target.value)}
                  className={inputCls}
                  placeholder="0 = sin mínimo"
                />
              </div>
              <div>
                <label className={labelCls}>Monto mínimo ($)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={montoMinimo}
                  onChange={(e) => setMontoMinimo(e.target.value)}
                  className={inputCls}
                  placeholder="0 = sin mínimo"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Respetas este precio hasta</label>
              <input type="date" value={vigenciaPrecio} onChange={(e) => setVigenciaPrecio(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Garantía y proceso */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-verde-profundo">🛡️ Garantía y proceso</h3>
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <div>
                <label className={labelCls}>Garantía (años)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={garantiaAnios}
                  onChange={(e) => setGarantiaAnios(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>¿Qué cubre la garantía?</label>
                <input
                  value={garantiaCondiciones}
                  onChange={(e) => setGarantiaCondiciones(e.target.value)}
                  className={inputCls}
                  placeholder="Qué cubre y qué la invalida"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Describe tu proceso de trabajo</label>
              <textarea
                rows={5}
                value={descripcionProceso}
                onChange={(e) => setDescripcionProceso(e.target.value)}
                className={inputCls}
                placeholder="Preparación, materiales que usas, pasos, limpieza al terminar…"
              />
            </div>
          </div>

          {/* Logística y pago */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-verde-profundo">🚚 Tiempos, pago y zonas</h3>
            <div>
              <label className={labelCls}>Tiempo de ejecución</label>
              <input
                value={tiempoEjecucion}
                onChange={(e) => setTiempoEjecucion(e.target.value)}
                className={inputCls}
                placeholder="Ej. 1 día por tinaco, 2 días por cada 100 m²"
              />
            </div>
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <div>
                <label className={labelCls}>Anticipo (%)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  value={anticipoPct}
                  onChange={(e) => setAnticipoPct(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Condiciones de pago</label>
                <input
                  value={condicionesPago}
                  onChange={(e) => setCondicionesPago(e.target.value)}
                  className={inputCls}
                  placeholder="Ej. 50% al iniciar, 50% al terminar"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Zonas donde trabajas</label>
              <input
                value={zonasCobertura}
                onChange={(e) => setZonasCobertura(e.target.value)}
                className={inputCls}
                placeholder="Ej. León, Silao, Purísima"
              />
            </div>
          </div>

          {/* Fotos */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-verde-profundo">📷 Fotos de tus trabajos</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {fotos.map((f, i) => (
                <div key={f.url} className="space-y-1">
                  <div className="relative aspect-square overflow-hidden rounded-lg border border-carbon/10 bg-carbon/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={f.titulo || `Foto ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white"
                      aria-label="Quitar foto"
                    >
                      ×
                    </button>
                  </div>
                  <input
                    value={f.titulo}
                    onChange={(e) => setFotos((prev) => prev.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))}
                    className="w-full rounded border border-carbon/15 px-2 py-1 text-[11px]"
                    placeholder="Descripción"
                  />
                </div>
              ))}
              {fotos.length < 12 && (
                <button
                  type="button"
                  onClick={() => inputFotos.current?.click()}
                  disabled={subiendo > 0}
                  className="flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-dashed border-carbon/20 text-carbon/50 hover:border-sauce hover:text-sauce"
                >
                  <span className="text-2xl leading-none">＋</span>
                  <span className="text-[11px]">{subiendo > 0 ? "Subiendo…" : "Fotos"}</span>
                </button>
              )}
            </div>
            <input
              ref={inputFotos}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => subirFotos(e.target.files)}
            />
          </div>

          {mensaje && (
            <div
              className={`rounded-lg p-3 text-sm ${
                mensaje.tipo === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-rojo"
              }`}
            >
              {mensaje.texto}
            </div>
          )}

          <button
            type="button"
            onClick={guardar}
            disabled={guardando || subiendo > 0}
            className="w-full rounded-xl bg-sauce py-3 text-sm font-bold text-white shadow-sm hover:bg-verde-profundo disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      )}
    </section>
  );
}
