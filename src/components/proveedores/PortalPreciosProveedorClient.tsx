"use client";

import { useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/cliente-navegador";
import { formatoPesos } from "@/lib/formato";
import { MEDIDAS_TARIFA, formatoEscalon } from "@/lib/tarifas-capacidad";
import {
  guardarOfertaPortal,
  prepararSubidaFotoPortal,
  type OfertaPortalProveedor,
  type SolicitudPortal,
} from "@/app/actions/portal-precios-proveedor";
import { SolicitudesPortalProveedor } from "./SolicitudesPortalProveedor";
import type { FotoOfertaProveedor } from "@/lib/types";
import { textoGarantiaEstandar } from "@/lib/estandar-servicio";

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

/** Columnas de la tabla de servicios en escritorio: servicio, costo, proceso, condiciones, acción. */
const COLUMNAS_FILA =
  "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,2.4fr)_minmax(0,1.7fr)_6.5rem]";

/** Datos que le faltan a una oferta para que podamos cotizar con ella. */
function faltantesOferta(o: OfertaPortalProveedor): string[] {
  const f: string[] = [];
  if (!(o.costoUnitario > 0) && o.tarifasCapacidad.length === 0) f.push("costo");
  // Con estándar Sauceda, el proceso y la garantía son los nuestros: basta con que lo confirme.
  if (o.estandar) {
    if (!o.cumpleEstandar) f.push("confirmar estándar");
  } else {
    if (!(o.garantiaAnios > 0) && !o.garantiaCondiciones.trim()) f.push("garantía");
    if (!o.descripcionProceso.trim()) f.push("proceso");
  }
  if (!o.tiempoEjecucion.trim()) f.push("tiempo");
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
    <div className="mx-auto max-w-[1600px] px-4 pt-6 font-cuerpo lg:px-8">
      <header className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-verde-profundo to-sauce p-5 text-white shadow-md lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-crema/80">SAUCEDA · Proveedores</div>
          <h1 className="mt-1 font-titular text-2xl font-bold text-crema">{proveedorNombre}</h1>
          <p className="mt-1 max-w-xl text-sm text-crema/85">
            Tu ficha de servicios: costos, garantía, tiempos, proceso y fotos. Toca <b>Editar</b> en un servicio para
            actualizarlo; revisamos los cambios antes de usarlos.
          </p>
        </div>
        {ofertas.length > 0 && (
          <div className="w-full shrink-0 lg:w-72">
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
        <div className="mt-3 divide-y divide-carbon/10 rounded-2xl border border-carbon/10 bg-white shadow-sm">
          <div
            className={`hidden gap-4 rounded-t-2xl bg-slate-50 px-5 py-2 text-[11px] font-bold uppercase tracking-wide text-carbon/50 lg:grid ${COLUMNAS_FILA}`}
          >
            <span>Servicio</span>
            <span>Tu costo</span>
            <span>🛠️ Proceso de trabajo</span>
            <span>Condiciones</span>
            <span />
          </div>
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

      {ofertas.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <span className="text-xs text-carbon/50">¿Prefieres revisarlo en papel o compartirlo?</span>
          <button
            type="button"
            onClick={async () => {
              const { descargarFichaProveedorPdf } = await import("@/lib/fichaProveedorPdf");
              descargarFichaProveedorPdf(proveedorNombre, ofertas);
            }}
            className="rounded-lg border border-sauce/40 bg-white px-4 py-2 text-sm font-bold text-sauce shadow-sm hover:bg-sauce hover:text-white"
          >
            📄 Descargar resumen en PDF
          </button>
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

  const unir = (...partes: string[]) => partes.map((x) => x.trim()).filter(Boolean).join(" · ");
  const hitos: { icono: string; etiqueta: string; valor: string }[] = [
    {
      icono: "🛡️",
      etiqueta: "Garantía",
      valor: oferta.estandar
        ? textoGarantiaEstandar(oferta.estandar)
        : unir(
            oferta.garantiaAnios > 0 ? `${oferta.garantiaAnios} ${oferta.garantiaAnios === 1 ? "año" : "años"}` : "",
            oferta.garantiaCondiciones
          ),
    },
    { icono: "⏱️", etiqueta: "Tiempo", valor: oferta.tiempoEjecucion.trim() },
    {
      icono: "💳",
      etiqueta: "Pago",
      valor: unir(oferta.anticipoPct > 0 ? `${oferta.anticipoPct}% de anticipo` : "", oferta.condicionesPago),
    },
    { icono: "📍", etiqueta: "Zonas", valor: oferta.zonasCobertura.trim() },
  ];

  return (
    <div className={editando ? "bg-sauce/[0.03] ring-2 ring-inset ring-sauce/30" : ""}>
      <div
        className={`grid gap-4 p-4 lg:items-start lg:gap-6 lg:px-6 lg:py-5 ${COLUMNAS_FILA} ${
          editando ? "" : "hover:bg-slate-50/70"
        }`}
      >
        {/* Servicio */}
        <div className="flex min-w-0 items-start justify-between gap-3 lg:block">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-carbon/45">{oferta.productoCategoria}</div>
            <h3 className="font-titular text-base font-bold leading-snug text-verde-profundo">{oferta.productoNombre}</h3>
          </div>
          <span
            title={faltan.length ? `Te falta: ${faltan.join(", ")}` : undefined}
            className={`mt-1 inline-block shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              faltan.length === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {faltan.length === 0 ? "✓ Completa" : faltan.length === 1 ? "Falta 1 dato" : `Faltan ${faltan.length} datos`}
          </span>
        </div>

        {/* Costo */}
        <div className="min-w-0">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-carbon/45 lg:hidden">Tu costo</div>
          {sinCosto ? (
            <button
              type="button"
              onClick={() => onEditar(true)}
              className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-2.5 py-1.5 text-left text-xs font-semibold text-amber-800 hover:bg-amber-50"
            >
              Sin costo · <span className="underline">Agregar</span>
            </button>
          ) : oferta.tarifasCapacidad.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {oferta.tarifasCapacidad.map((t) => (
                <span key={t.hastaLitros} className="rounded-lg bg-sauce/10 px-2 py-1 text-xs text-carbon/70">
                  {formatoEscalon(t.hastaLitros, medida)}{" "}
                  <b className="font-titular text-sm text-verde-profundo">{formatoPesos(t.costo)}</b>
                </span>
              ))}
            </div>
          ) : (
            <div className="font-titular text-lg font-bold text-verde-profundo">
              {formatoPesos(oferta.costoUnitario)}
              <span className="text-xs font-semibold text-carbon/50"> / {oferta.productoUnidad}</span>
              {oferta.costosVolumen.length > 0 && (
                <span className="ml-2 font-cuerpo text-[11px] font-normal text-carbon/55">
                  +{oferta.costosVolumen.length} por volumen
                </span>
              )}
            </div>
          )}
          {(oferta.montoMinimo > 0 || oferta.vigenciaPrecio) && (
            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-carbon/55">
              {oferta.montoMinimo > 0 && <span>Mín. {formatoPesos(oferta.montoMinimo)}</span>}
              {oferta.vigenciaPrecio && (
                <span className={vencido ? "font-semibold text-rojo" : ""}>
                  {vencido ? "⚠️ Vencido " : "Hasta "}
                  {formatoFecha(`${oferta.vigenciaPrecio}T12:00:00`)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Proceso completo */}
        <div className="min-w-0">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-carbon/45 lg:hidden">🛠️ Proceso de trabajo</div>
          {oferta.estandar ? (
            <div className="space-y-2">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  oferta.cumpleEstandar ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"
                }`}
              >
                {oferta.cumpleEstandar ? "✓ Trabajas con el estándar SAUCEDA" : "⚠️ Confirma que trabajas con el estándar SAUCEDA"}
              </span>
              {oferta.estandar.proceso && (
                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-carbon/80">{oferta.estandar.proceso}</p>
              )}
              {oferta.estandar.incluye && (
                <p className="whitespace-pre-line break-words text-xs text-carbon/65">
                  <b className="text-carbon/80">Incluye: </b>
                  {oferta.estandar.incluye}
                </p>
              )}
              {oferta.excepcionesEstandar.trim() && (
                <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                  <b>Tus notas: </b>
                  {oferta.excepcionesEstandar.trim()}
                </p>
              )}
            </div>
          ) : oferta.descripcionProceso.trim() ? (
            <p className="whitespace-pre-line break-words text-sm leading-relaxed text-carbon/80">{oferta.descripcionProceso.trim()}</p>
          ) : (
            <p className="text-sm text-carbon/35">Sin describir</p>
          )}
        </div>

        {/* Condiciones completas */}
        <dl className="min-w-0 space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
          {hitos.map((h) => (
            <div key={h.etiqueta} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
              <dt className="text-xs text-carbon/50">
                {h.icono} {h.etiqueta}
              </dt>
              <dd className={`break-words ${h.valor ? "font-semibold text-carbon" : "text-carbon/30"}`}>{h.valor || "—"}</dd>
            </div>
          ))}
        </dl>

        {/* Acción */}
        <div className="flex items-center justify-between gap-3 border-t border-carbon/10 pt-3 lg:flex-col lg:items-end lg:gap-1 lg:border-0 lg:pt-0">
          <span className="text-[11px] text-carbon/45 lg:order-2 lg:text-right">
            {oferta.actualizadoPorProveedorAt ? formatoFecha(oferta.actualizadoPorProveedorAt) : "Sin actualizar"}
            {oferta.fotos.length > 0 && ` · 📷 ${oferta.fotos.length}`}
          </span>
          {!editando && (
            <button
              type="button"
              onClick={() => {
                setAviso(null);
                onEditar(true);
              }}
              className="shrink-0 rounded-lg bg-sauce px-3.5 py-1.5 text-sm font-bold text-white shadow-sm hover:bg-verde-profundo"
            >
              ✎ Editar
            </button>
          )}
        </div>
      </div>

      {aviso && !editando && (
        <div className="mx-4 mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 lg:mx-5">{aviso}</div>
      )}

      {editando && (
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
      )}
    </div>
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
  // Las capacidades las define SAUCEDA en el catálogo; el proveedor solo pone su costo a cada una.
  const porCapacidad = oferta.capacidades.length > 0;
  const [capacidades, setCapacidades] = useState<{ hastaLitros: string; costo: string }[]>(() =>
    oferta.capacidades.map((h) => {
      const previo = oferta.tarifasCapacidad.find((t) => t.hastaLitros === h);
      return { hastaLitros: String(h), costo: previo ? String(previo.costo) : "" };
    })
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
  const [cumpleEstandar, setCumpleEstandar] = useState(oferta.cumpleEstandar);
  const [excepcionesEstandar, setExcepcionesEstandar] = useState(oferta.excepcionesEstandar);

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
        cumpleEstandar,
        excepcionesEstandar,
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
            {porCapacidad && (
              <p className="text-xs text-carbon/60">
                Pon tu costo para cada capacidad que maneja SAUCEDA. Deja vacías las que no hagas.
              </p>
            )}

            {porCapacidad ? (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_1fr] gap-2 text-[11px] font-bold uppercase text-carbon/50">
                  <span>Capacidad ({infoMedida.etiqueta.toLowerCase()})</span>
                  <span>Tu costo ($)</span>
                </div>
                {capacidades.map((c, i) => (
                  <div key={c.hastaLitros} className="grid grid-cols-[1fr_1fr] items-center gap-2">
                    <span className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm font-semibold text-carbon">
                      Hasta {formatoEscalon(Number(c.hastaLitros), medida)}
                    </span>
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
                      placeholder="Sin costo = no lo hago"
                    />
                  </div>
                ))}
                <p className="text-[11px] text-carbon/50">
                  ¿Manejas otra capacidad? Anótala en “excepciones o mejoras” y la agregamos al catálogo.
                </p>
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

          {/* Estándar SAUCEDA (o garantía y proceso propios si el servicio aún no lo define) */}
          {oferta.estandar ? (
            <div className="space-y-3 rounded-xl border border-sauce/30 bg-sauce/5 p-4">
              <div>
                <h3 className="text-sm font-bold text-verde-profundo">✅ Estándar SAUCEDA para este servicio</h3>
                <p className="mt-0.5 text-xs text-carbon/60">
                  Así lo ofrecemos a nuestros clientes, sin importar qué proveedor lo realice.
                </p>
              </div>
              {oferta.estandar.proceso && (
                <div>
                  <div className={labelCls}>Proceso</div>
                  <p className="whitespace-pre-line text-sm text-carbon/85">{oferta.estandar.proceso}</p>
                </div>
              )}
              {oferta.estandar.incluye && (
                <div>
                  <div className={labelCls}>Incluye</div>
                  <p className="whitespace-pre-line text-sm text-carbon/85">{oferta.estandar.incluye}</p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {textoGarantiaEstandar(oferta.estandar) && (
                  <div>
                    <div className={labelCls}>Garantía al cliente</div>
                    <p className="text-sm font-semibold text-carbon">{textoGarantiaEstandar(oferta.estandar)}</p>
                  </div>
                )}
                {oferta.estandar.tiempo && (
                  <div>
                    <div className={labelCls}>Tiempo objetivo</div>
                    <p className="text-sm font-semibold text-carbon">{oferta.estandar.tiempo}</p>
                  </div>
                )}
              </div>
              <label className="flex items-start gap-2 rounded-lg bg-white p-3 text-sm font-semibold text-carbon ring-1 ring-carbon/10">
                <input
                  type="checkbox"
                  checked={cumpleEstandar}
                  onChange={(e) => setCumpleEstandar(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                Confirmo que trabajo con este proceso y respaldo esta garantía.
              </label>
              <div>
                <label className={labelCls}>¿Alguna excepción o mejora? (opcional)</label>
                <textarea
                  rows={2}
                  value={excepcionesEstandar}
                  onChange={(e) => setExcepcionesEstandar(e.target.value)}
                  className={inputCls}
                  placeholder="Ej. no incluye cambio de empaques; doy 1 año extra de garantía en mano de obra…"
                />
              </div>
            </div>
          ) : (
            <>
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

            </>
          )}

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
