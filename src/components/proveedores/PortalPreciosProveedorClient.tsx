"use client";

import { useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/cliente-navegador";
import { formatoPesos } from "@/lib/formato";
import { MEDIDAS_TARIFA, formatoEscalon, medidaSugeridaPorNombre } from "@/lib/tarifas-capacidad";
import {
  guardarOfertaPortal,
  prepararSubidaFotoPortal,
  type OfertaPortalProveedor,
  type SolicitudPortal,
} from "@/app/actions/portal-precios-proveedor";
import { SolicitudesPortalProveedor } from "./SolicitudesPortalProveedor";
import type { FotoOfertaProveedor } from "@/lib/types";

interface Props {
  token: string;
  proveedorNombre: string;
  ofertasIniciales: OfertaPortalProveedor[];
  solicitudesIniciales?: SolicitudPortal[];
}

const inputCls =
  "w-full min-w-0 rounded-lg border border-carbon/20 bg-white px-3 py-2.5 text-sm text-carbon outline-none focus:border-sauce";
const labelCls = "mb-1 block text-xs font-semibold text-carbon/70";

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

/** Datos que le faltan a una oferta para que podamos cotizar con ella. */
function faltantesOferta(o: OfertaPortalProveedor): string[] {
  const f: string[] = [];
  if (!(o.costoUnitario > 0) && o.tarifasCapacidad.length === 0) f.push("costo");
  if (!(o.garantiaAnios > 0) && !o.garantiaCondiciones.trim()) f.push("garantía");
  if (!o.tiempoEjecucion.trim()) f.push("tiempo");
  if (!o.descripcionProceso.trim()) f.push("proceso");
  if (!o.zonasCobertura.trim()) f.push("zonas");
  if (o.fotos.length === 0) f.push("fotos");
  return f;
}

export function PortalPreciosProveedorClient({ token, proveedorNombre, ofertasIniciales, solicitudesIniciales = [] }: Props) {
  const [ofertas, setOfertas] = useState(ofertasIniciales);
  const [editando, setEditando] = useState<string | null>(
    ofertasIniciales.length === 1 && faltantesOferta(ofertasIniciales[0]).includes("costo") ? ofertasIniciales[0].id : null
  );
  const completas = ofertas.filter((o) => faltantesOferta(o).length === 0).length;
  const pct = ofertas.length ? Math.round((completas / ofertas.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 font-cuerpo">
      <header className="rounded-2xl bg-gradient-to-r from-verde-profundo to-sauce p-5 text-white shadow-md">
        <div className="text-[11px] font-bold uppercase tracking-wider text-crema/80">SAUCEDA · Proveedores</div>
        <h1 className="mt-1 font-titular text-2xl font-bold text-crema">{proveedorNombre}</h1>
        <p className="mt-1 text-sm text-crema/85">
          Tu ficha de servicios: costos, garantía, tiempos y fotos. Toca <b>Editar</b> en un servicio para actualizarlo;
          revisamos los cambios antes de usarlos.
        </p>
        {ofertas.length > 0 && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-xs text-crema/90">
              <span>
                <b className="text-base text-white">{completas}</b> de {ofertas.length} servicios con ficha completa
              </span>
              <span>{pct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-dorado transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </header>

      <SolicitudesPortalProveedor token={token} iniciales={solicitudesIniciales} />

      {ofertas.length > 0 && (
        <div className="mt-7 flex items-end justify-between gap-3">
          <h2 className="font-titular text-lg font-bold text-verde-profundo">🏷️ Tus servicios</h2>
          <span className="text-xs text-carbon/50">{ofertas.length} en total</span>
        </div>
      )}

      {ofertas.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-carbon/20 bg-white p-8 text-center text-sm text-carbon/60">
          Aún no tienes productos asignados. Pide a SAUCEDA que los registre.
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {ofertas.map((o) => (
            <TarjetaOferta
              key={o.id}
              token={token}
              oferta={o}
              editando={editando === o.id}
              onEditar={(v) => setEditando(v ? o.id : null)}
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

/** Tarjeta de un servicio: ficha de solo lectura con lo importante; el formulario se abre con "Editar". */
function TarjetaOferta({
  token,
  oferta,
  editando,
  onEditar,
  onGuardada,
}: {
  token: string;
  oferta: OfertaPortalProveedor;
  editando: boolean;
  onEditar: (v: boolean) => void;
  onGuardada: (o: OfertaPortalProveedor) => void;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const faltan = faltantesOferta(oferta);
  const medida = oferta.productoTarifaMedida;
  const sinCosto = faltan.includes("costo");
  const vencido = oferta.vigenciaPrecio ? new Date(`${oferta.vigenciaPrecio}T23:59:59`) < new Date() : false;

  const hitos: { icono: string; etiqueta: string; valor: string }[] = [
    {
      icono: "🛡️",
      etiqueta: "Garantía",
      valor:
        oferta.garantiaAnios > 0
          ? `${oferta.garantiaAnios} ${oferta.garantiaAnios === 1 ? "año" : "años"}`
          : oferta.garantiaCondiciones.trim(),
    },
    { icono: "⏱️", etiqueta: "Tiempo", valor: oferta.tiempoEjecucion.trim() },
    {
      icono: "💳",
      etiqueta: "Anticipo",
      valor: oferta.anticipoPct > 0 ? `${oferta.anticipoPct}%` : oferta.condicionesPago.trim(),
    },
    { icono: "📍", etiqueta: "Zonas", valor: oferta.zonasCobertura.trim() },
  ];

  return (
    <section
      className={`rounded-2xl border bg-white shadow-sm transition ${
        editando ? "border-sauce ring-2 ring-sauce/20" : "border-carbon/10"
      }`}
    >
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-carbon/45">{oferta.productoCategoria}</div>
          <h3 className="font-titular text-lg font-bold leading-snug text-verde-profundo">{oferta.productoNombre}</h3>
        </div>
        {faltan.length === 0 ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
            ✓ Completa
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
            {faltan.length === 1 ? "Falta 1 dato" : `Faltan ${faltan.length} datos`}
          </span>
        )}
      </div>

      {editando ? (
        <FormularioOferta
          token={token}
          oferta={oferta}
          onCancelar={() => onEditar(false)}
          onGuardada={(nueva) => {
            onGuardada(nueva);
            onEditar(false);
            setAviso("✓ Guardado. Gracias, revisaremos tus cambios.");
          }}
        />
      ) : (
        <div className="space-y-4 px-4 pb-4 pt-3 sm:px-5">
          {/* Precios */}
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-carbon/45">Tu costo para SAUCEDA</div>
            {sinCosto ? (
              <button
                type="button"
                onClick={() => onEditar(true)}
                className="w-full rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-3 py-3 text-left text-sm font-semibold text-amber-800 hover:bg-amber-50"
              >
                Aún no capturas tu costo · <span className="underline">Agregarlo</span>
              </button>
            ) : oferta.tarifasCapacidad.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {oferta.tarifasCapacidad.map((t) => (
                  <div key={t.hastaLitros} className="rounded-xl border border-sauce/20 bg-sauce/5 px-3 py-1.5">
                    <div className="text-[11px] text-carbon/55">Hasta {formatoEscalon(t.hastaLitros, medida)}</div>
                    <div className="font-titular text-base font-bold text-verde-profundo">{formatoPesos(t.costo)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-titular text-2xl font-bold text-verde-profundo">
                  {formatoPesos(oferta.costoUnitario)}
                  <span className="text-sm font-semibold text-carbon/50"> / {oferta.productoUnidad}</span>
                </span>
                {oferta.costosVolumen.length > 0 && (
                  <span className="text-xs text-carbon/60">
                    + {oferta.costosVolumen.length} {oferta.costosVolumen.length === 1 ? "precio" : "precios"} por volumen
                  </span>
                )}
              </div>
            )}
            {(oferta.montoMinimo > 0 || oferta.vigenciaPrecio) && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-carbon/60">
                {oferta.montoMinimo > 0 && <span>Mínimo {formatoPesos(oferta.montoMinimo)}</span>}
                {oferta.vigenciaPrecio && (
                  <span className={vencido ? "font-semibold text-rojo" : ""}>
                    {vencido ? "⚠️ Precio vencido el " : "Vigente hasta "}
                    {formatoFecha(`${oferta.vigenciaPrecio}T12:00:00`)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Hitos */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {hitos.map((h) => (
              <div
                key={h.etiqueta}
                className={`min-w-0 rounded-xl px-3 py-2 ${h.valor ? "bg-slate-50" : "border border-dashed border-carbon/15"}`}
              >
                <div className="text-[11px] text-carbon/50">
                  {h.icono} {h.etiqueta}
                </div>
                <div className={`truncate text-sm font-semibold ${h.valor ? "text-carbon" : "text-carbon/35"}`} title={h.valor}>
                  {h.valor || "Sin capturar"}
                </div>
              </div>
            ))}
          </div>

          {/* Fotos */}
          {oferta.fotos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {oferta.fotos.slice(0, 6).map((f, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={f.url}
                  src={f.url}
                  alt={f.titulo || `Foto ${i + 1}`}
                  className="h-16 w-16 shrink-0 rounded-lg border border-carbon/10 object-cover"
                />
              ))}
              {oferta.fotos.length > 6 && (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-carbon/60">
                  +{oferta.fotos.length - 6}
                </div>
              )}
            </div>
          )}

          {faltan.length > 0 && <p className="text-xs text-amber-700">Te falta: {faltan.join(", ")}.</p>}
          {aviso && <div className="rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-800">{aviso}</div>}

          {/* Pie */}
          <div className="flex items-center justify-between gap-3 border-t border-carbon/10 pt-3">
            <span className="text-[11px] text-carbon/45">
              {oferta.actualizadoPorProveedorAt
                ? `Actualizado ${formatoFecha(oferta.actualizadoPorProveedorAt)}`
                : "Nunca actualizado"}
              {oferta.fotos.length > 0 && ` · ${oferta.fotos.length} ${oferta.fotos.length === 1 ? "foto" : "fotos"}`}
            </span>
            <button
              type="button"
              onClick={() => {
                setAviso(null);
                onEditar(true);
              }}
              className="shrink-0 rounded-lg bg-sauce px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-verde-profundo"
            >
              ✎ Editar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Formulario de edición; se monta solo al editar, así "Cancelar" descarta los cambios. */
function FormularioOferta({
  token,
  oferta,
  onCancelar,
  onGuardada,
}: {
  token: string;
  oferta: OfertaPortalProveedor;
  onCancelar: () => void;
  onGuardada: (o: OfertaPortalProveedor) => void;
}) {
  const unidad = oferta.productoUnidad;
  const medida = oferta.productoTarifaMedida;
  const infoMedida = MEDIDAS_TARIFA[medida];
  const [costoUnitario, setCostoUnitario] = useState(oferta.costoUnitario ? String(oferta.costoUnitario) : "");
  const [porCapacidad, setPorCapacidad] = useState(
    oferta.tarifasCapacidad.length > 0 || medidaSugeridaPorNombre(oferta.productoNombre) !== null
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
        ...infoMedida.comunes.filter((l) => !existentes.has(l)).map((l) => ({ hastaLitros: String(l), costo: "" })),
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
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo guardar. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setGuardando(false);
    }
  }

  return (
        <div className="mt-3 space-y-5 border-t border-carbon/10 p-4 sm:p-5">
          {oferta.productoDescripcion && (
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-carbon/70">{oferta.productoDescripcion}</p>
          )}

          {/* Costo */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-verde-profundo">💲 Tu costo para SAUCEDA</h3>
            <label className="flex items-center gap-2 text-sm text-carbon/80">
              <input type="checkbox" checked={porCapacidad} onChange={(e) => setPorCapacidad(e.target.checked)} />
              Cobro por escalones de {infoMedida.etiqueta.toLowerCase()} ({infoMedida.ejemplos})
            </label>

            {porCapacidad ? (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-[11px] font-bold uppercase text-carbon/50">
                  <span>Hasta ({infoMedida.etiqueta.toLowerCase()})</span>
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
                      placeholder={infoMedida.etiqueta}
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
                    + Agregar escalón
                  </button>
                  <button type="button" onClick={cargarCapacidadesComunes} className="font-semibold text-sauce">
                    + Medidas comunes
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

          <div className="sticky bottom-0 -mx-4 flex gap-2 rounded-b-2xl border-t border-carbon/10 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
            <button
              type="button"
              onClick={onCancelar}
              disabled={guardando}
              className="rounded-xl border border-carbon/20 px-4 py-3 text-sm font-semibold text-carbon/70 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || subiendo > 0}
              className="flex-1 rounded-xl bg-sauce py-3 text-sm font-bold text-white shadow-sm hover:bg-verde-profundo disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
  );
}
