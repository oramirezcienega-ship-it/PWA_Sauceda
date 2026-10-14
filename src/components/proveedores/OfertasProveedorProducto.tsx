"use client";

import { useEffect, useState } from "react";
import { formatoPesos } from "@/lib/formato";
import { formatoEscalon, MEDIDAS_TARIFA } from "@/lib/tarifas-capacidad";
import type { HistorialOfertaProveedor, OfertaProveedorProducto } from "@/lib/types";
import {
  eliminarOfertaProveedor,
  listarOfertasPorProducto,
  listarOfertasPorProveedor,
  marcarOfertaPreferida,
  marcarOfertaRevisada,
  obtenerHistorialOferta,
  obtenerLinkPreciosProveedor,
} from "@/app/actions/proveedor-productos";
import { obtenerFichaProveedorAdmin } from "@/app/actions/portal-precios-proveedor";
import { ModalOfertaProveedor } from "./ModalOfertaProveedor";

interface OfertasProveedorProductoProps {
  /** "proveedor": productos que ofrece un proveedor. "producto": comparativa de proveedores de un producto. */
  modo: "proveedor" | "producto";
  /** Id del proveedor o del producto, según el modo. */
  id: string;
  /**
   * Se llama tras guardar una oferta o marcar preferido: el producto pudo cambiar de precio
   * de venta (capturado en la oferta) o de costo (si la oferta es la preferida).
   */
  onProductoActualizado?: (oferta: OfertaProveedorProducto) => void;
}

/** Columnas en escritorio: producto, costo/venta/margen, proceso, condiciones, acciones. */
const COLUMNAS_OFERTA =
  "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.7fr)_minmax(0,1.5fr)_9.5rem]";

function vencida(fecha: string | null): boolean {
  if (!fecha) return false;
  return fecha < new Date().toISOString().slice(0, 10);
}

function formatoFecha(fecha: string): string {
  return new Date(fecha.length === 10 ? `${fecha}T12:00:00` : fecha).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function OfertasProveedorProducto({ modo, id, onProductoActualizado }: OfertasProveedorProductoProps) {
  const [ofertas, setOfertas] = useState<OfertaProveedorProducto[] | null>(null);
  const [modal, setModal] = useState<{ oferta: OfertaProveedorProducto | null } | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Record<string, HistorialOfertaProveedor[]>>({});

  async function cargar() {
    const lista = modo === "proveedor" ? await listarOfertasPorProveedor(id) : await listarOfertasPorProducto(id);
    setOfertas(lista);
  }

  useEffect(() => {
    setOfertas(null);
    cargar().catch(() => setOfertas([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, id]);

  async function handleExpandir(o: OfertaProveedorProducto) {
    if (expandida === o.id) return setExpandida(null);
    setExpandida(o.id);
    if (!historial[o.id]) {
      const h = await obtenerHistorialOferta(o.id).catch(() => []);
      setHistorial((prev) => ({ ...prev, [o.id]: h }));
    }
  }

  async function handlePreferido(o: OfertaProveedorProducto) {
    const res = await marcarOfertaPreferida(o.id);
    if (!res.ok || !res.oferta) return alert(res.error || "No se pudo marcar como preferido.");
    onProductoActualizado?.(res.oferta);
    await cargar();
  }

  async function handleRevisada(o: OfertaProveedorProducto) {
    const res = await marcarOfertaRevisada(o.id);
    if (!res.ok || !res.oferta) return alert(res.error || "No se pudo marcar como revisada.");
    onProductoActualizado?.(res.oferta);
    setHistorial((prev) => {
      const { [o.id]: _, ...resto } = prev;
      return resto;
    });
    await cargar();
  }

  async function handleEliminar(o: OfertaProveedorProducto) {
    const nombre = modo === "proveedor" ? o.productoNombre : o.proveedorNombre;
    if (!confirm(`¿Quitar "${nombre}" de esta lista? El historial de costos de esta oferta también se borra.`)) return;
    const res = await eliminarOfertaProveedor(o.id);
    if (!res.ok) return alert(res.error || "No se pudo eliminar.");
    setOfertas((prev) => (prev ? prev.filter((x) => x.id !== o.id) : prev));
  }

  async function handleGuardada(o: OfertaProveedorProducto) {
    setModal(null);
    onProductoActualizado?.(o);
    setHistorial((prev) => {
      const { [o.id]: _, ...resto } = prev;
      return resto;
    });
    await cargar();
  }

  // En la comparativa, el costo más bajo entre ofertas activas se resalta.
  const costoMinimo =
    modo === "producto" && ofertas
      ? Math.min(...ofertas.filter((o) => o.activo && o.costoUnitario > 0).map((o) => o.costoUnitario))
      : null;

  return (
    <div className="space-y-4 font-cuerpo text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-titular text-base font-bold text-verde-profundo">
            {modo === "proveedor" ? "Productos y servicios que ofrece" : "Proveedores que lo ofrecen"}
          </h3>
          <p className="text-xs text-carbon/60">
            {modo === "proveedor"
              ? "Su costo, mínimos, garantía y proceso por producto. El precio de venta es el del catálogo."
              : "Compara costo, margen y condiciones. El ⭐ preferido define el costo del producto en el catálogo."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {modo === "proveedor" && <LinkPreciosProveedor proveedorId={id} />}
          <button
            type="button"
            onClick={() => setModal({ oferta: null })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sauce px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-verde-profundo transition shrink-0"
          >
            + {modo === "proveedor" ? "Agregar producto" : "Agregar proveedor"}
          </button>
        </div>
      </div>

      {ofertas && ofertas.some((o) => o.pendienteRevision) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          🔔 El proveedor actualizó {ofertas.filter((o) => o.pendienteRevision).length} producto(s) desde su link.
          Revisa los cambios (renglones en amarillo) y da clic en <b>Aprobar cambios</b>; hasta entonces su costo no
          se usa en el catálogo.
        </div>
      )}

      {ofertas === null ? (
        <div className="p-8 text-center text-carbon/50">Cargando…</div>
      ) : ofertas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-carbon/20 p-10 text-center">
          <div className="text-3xl mb-2">🏷️</div>
          <p className="text-xs text-carbon/60">
            {modo === "proveedor"
              ? "Aún no registras qué productos ofrece este proveedor."
              : "Aún no hay proveedores registrados para este producto."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-carbon/10 bg-white shadow-2xs">
          <div
            className={`hidden gap-5 rounded-t-xl border-b border-carbon/10 bg-slate-50 px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-carbon/55 lg:grid ${COLUMNAS_OFERTA}`}
          >
            <span>{modo === "proveedor" ? "Producto" : "Proveedor"}</span>
            <span>Costo · venta · margen</span>
            <span>Proceso</span>
            <span>Condiciones</span>
            <span className="text-right">Acciones</span>
          </div>
          <div className="divide-y divide-carbon/10">
            {ofertas.map((o) => {
              const esMasBarato = costoMinimo !== null && o.activo && o.costoUnitario === costoMinimo;
              const unir = (...p: string[]) => p.map((x) => (x || "").trim()).filter(Boolean).join(" · ");
              const condiciones: [string, string][] = [
                [
                  "🛡️ Garantía",
                  unir(o.garantiaAnios > 0 ? `${o.garantiaAnios} ${o.garantiaAnios === 1 ? "año" : "años"}` : "", o.garantiaCondiciones),
                ],
                ["⏱️ Tiempo", o.tiempoEjecucion],
                ["💳 Pago", unir(o.anticipoPct > 0 ? `${o.anticipoPct}% anticipo` : "", o.condicionesPago)],
                ["📍 Zonas", o.zonasCobertura],
                [
                  "↧ Mínimo",
                  unir(o.cantidadMinima > 0 ? `${o.cantidadMinima} ${o.productoUnidad}` : "", o.montoMinimo > 0 ? formatoPesos(o.montoMinimo) : ""),
                ],
              ];
              const abierta = expandida === o.id;
              return (
                <div
                  key={o.id}
                  className={`border-l-4 ${o.pendienteRevision ? "border-l-amber-400 bg-amber-50/30" : o.preferido ? "border-l-dorado" : "border-l-transparent"} ${
                    !o.activo ? "opacity-50" : ""
                  }`}
                >
                  <div className={`grid gap-4 px-4 py-4 lg:items-start lg:gap-5 ${COLUMNAS_OFERTA}`}>
                    {/* Producto / proveedor */}
                    <div className="min-w-0 space-y-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-carbon/45">
                        {modo === "proveedor" ? o.productoCategoria : o.zonasCobertura || "Sin zonas"}
                      </div>
                      <div className="font-titular text-sm font-bold leading-snug text-verde-profundo">
                        {modo === "proveedor" ? o.productoNombre : o.proveedorNombre}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {o.preferido && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">⭐ Preferido</span>
                        )}
                        {o.pendienteRevision && (
                          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                            🔔 Cambios del proveedor
                            {o.actualizadoPorProveedorAt ? ` · ${formatoFecha(o.actualizadoPorProveedorAt)}` : ""}
                          </span>
                        )}
                        {!o.activo && <span className="rounded-full bg-carbon/10 px-2 py-0.5 text-[10px]">Inactiva</span>}
                        {modo === "producto" && !o.proveedorActivo && (
                          <span className="rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Proveedor inactivo</span>
                        )}
                        {o.vigenciaPrecio && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] ${
                              vencida(o.vigenciaPrecio) ? "bg-rojo/10 font-bold text-rojo" : "bg-slate-100 text-carbon/60"
                            }`}
                          >
                            {vencida(o.vigenciaPrecio) ? "Precio vencido " : "Vigente hasta "}
                            {formatoFecha(o.vigenciaPrecio)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Costo vs venta */}
                    <div className="min-w-0">
                      <TablaCostos o={o} resaltar={esMasBarato} />
                    </div>

                    {/* Proceso */}
                    <div className="min-w-0">
                      <div className="mb-1 text-[10px] font-bold uppercase text-carbon/45 lg:hidden">Proceso</div>
                      {o.descripcionProceso.trim() ? (
                        <p className="whitespace-pre-line break-words leading-relaxed text-carbon/80">{o.descripcionProceso.trim()}</p>
                      ) : (
                        <p className="text-carbon/35">Sin describir</p>
                      )}
                    </div>

                    {/* Condiciones */}
                    <dl className="min-w-0 space-y-1.5 rounded-lg bg-slate-50 p-2.5">
                      {condiciones.map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-2">
                          <dt className="text-carbon/50">{k}</dt>
                          <dd className={`break-words ${v ? "font-semibold text-carbon" : "text-carbon/30"}`}>{v || "—"}</dd>
                        </div>
                      ))}
                    </dl>

                    {/* Acciones */}
                    <div className="flex flex-wrap items-center gap-1.5 lg:flex-col lg:items-stretch">
                      {o.pendienteRevision && (
                        <button
                          type="button"
                          onClick={() => handleRevisada(o)}
                          title="Aceptar lo que capturó el proveedor"
                          className="rounded-md bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-600"
                        >
                          ✓ Aprobar cambios
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setModal({ oferta: o })}
                        className="rounded-md border border-carbon/20 bg-white px-3 py-1.5 text-[11px] font-semibold text-carbon/75 hover:border-sauce hover:text-sauce"
                      >
                        ✎ Editar
                      </button>
                      {!o.preferido && (
                        <button
                          type="button"
                          onClick={() => handlePreferido(o)}
                          title="Usar su costo en el catálogo"
                          className="rounded-md border border-carbon/20 bg-white px-3 py-1.5 text-[11px] font-semibold text-carbon/70 hover:border-dorado hover:text-amber-700"
                        >
                          ⭐ Preferir
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleExpandir(o)}
                        className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-sauce hover:bg-sauce/10"
                      >
                        {abierta ? "Ocultar ▲" : `Fotos (${o.fotos.length}) e historial ▼`}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEliminar(o)}
                        className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-rojo/70 hover:bg-rojo/5 hover:text-rojo"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>

                  {abierta && (
                    <div className="grid grid-cols-1 gap-5 border-t border-carbon/10 bg-slate-50/60 px-4 py-4 md:grid-cols-[2fr_1fr]">
                      <div className="space-y-3">
                        {o.fotos.length > 0 ? (
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                            {o.fotos.map((f) => (
                              <a key={f.url} href={f.url} target="_blank" rel="noreferrer" title={f.titulo}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={f.url}
                                  alt={f.titulo || "Foto del trabajo"}
                                  className="h-24 w-full rounded-lg border object-cover"
                                />
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="text-carbon/40">Sin fotos de trabajos.</div>
                        )}
                        <Detalle titulo="Notas internas" texto={o.notas} />
                        {o.fichaTecnicaUrl && (
                          <a
                            href={o.fichaTecnicaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-block font-semibold text-sauce hover:underline"
                          >
                            📄 {o.fichaTecnicaNombre || "Ficha técnica"}
                          </a>
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-carbon/50">Historial de costo</div>
                        {!historial[o.id] ? (
                          <div className="text-carbon/40">Cargando…</div>
                        ) : historial[o.id].length === 0 ? (
                          <div className="text-carbon/40">Sin cambios desde el alta.</div>
                        ) : (
                          historial[o.id].map((h) => (
                            <div key={h.id} className="flex flex-wrap gap-2">
                              <span className="text-carbon/50">{formatoFecha(h.fecha)}</span>
                              <span className="font-mono">
                                {formatoPesos(h.costoAnterior)} → {formatoPesos(h.costoNuevo)}
                              </span>
                              {h.motivo && <span className="text-carbon/60">({h.motivo})</span>}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modal && (
        <ModalOfertaProveedor
          oferta={modal.oferta}
          proveedorIdFijo={modo === "proveedor" ? id : undefined}
          productoIdFijo={modo === "producto" ? id : undefined}
          productosExcluidos={modo === "proveedor" ? (ofertas || []).map((o) => o.productoId) : []}
          proveedoresExcluidos={modo === "producto" ? (ofertas || []).map((o) => o.proveedorId) : []}
          onCerrar={() => setModal(null)}
          onGuardada={handleGuardada}
        />
      )}
    </div>
  );
}

/**
 * Costo del proveedor contra nuestro precio de venta, con margen.
 * Si cobra por escalones (litros/tubos) se compara escalón por escalón; el costo unitario no aplica.
 */
function TablaCostos({ o, resaltar }: { o: OfertaProveedorProducto; resaltar: boolean }) {
  const pct = (venta: number, costo: number) => (venta > 0 ? `${(((venta - costo) / venta) * 100).toFixed(0)}%` : "");
  const colorMargen = (m: number) => (m >= 0 ? "text-emerald-700" : "text-rojo");

  if (o.tarifasCapacidad.length > 0) {
    return (
      <table className="w-full font-mono text-[11px]">
        <thead>
          <tr className="text-left font-cuerpo text-[10px] text-carbon/45">
            <th className="pb-1 font-semibold">{MEDIDAS_TARIFA[o.productoTarifaMedida].etiqueta}</th>
            <th className="pb-1 text-right font-semibold">Costo</th>
            <th className="pb-1 text-right font-semibold">Venta</th>
            <th className="pb-1 text-right font-semibold">Margen</th>
          </tr>
        </thead>
        <tbody>
          {o.tarifasCapacidad.map((t) => {
            const venta = o.productoTarifasCapacidad.find((v) => v.hastaLitros === t.hastaLitros)?.precio ?? null;
            const m = venta !== null ? venta - t.costo : null;
            return (
              <tr key={t.hastaLitros}>
                <td className="py-0.5 pr-2 text-carbon/70">{formatoEscalon(t.hastaLitros, o.productoTarifaMedida)}</td>
                <td className={`py-0.5 pr-2 text-right ${resaltar ? "font-bold text-emerald-700" : "text-carbon"}`}>
                  {formatoPesos(t.costo)}
                </td>
                <td className="py-0.5 pr-2 text-right text-carbon/70">{venta !== null ? formatoPesos(venta) : "—"}</td>
                <td className={`py-0.5 text-right ${m === null ? "text-carbon/35" : colorMargen(m)}`}>
                  {m === null || venta === null ? "sin precio" : `${formatoPesos(m)} · ${pct(venta, t.costo)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (!(o.costoUnitario > 0)) {
    return (
      <div className="space-y-1">
        <span className="inline-block rounded-md border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
          Sin costo capturado
        </span>
        <div className="font-mono text-[11px] text-carbon/55">
          Venta {formatoPesos(o.productoPrecioUnitario)}/{o.productoUnidad}
        </div>
      </div>
    );
  }

  const m = o.productoPrecioUnitario - o.costoUnitario;
  return (
    <div className="font-mono text-[11px]">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="font-cuerpo text-[10px] text-carbon/45">Costo</div>
          <div className={`text-sm ${resaltar ? "font-bold text-emerald-700" : "font-semibold text-carbon"}`}>
            {formatoPesos(o.costoUnitario)}
          </div>
          <div className="text-carbon/45">/{o.productoUnidad}</div>
        </div>
        <div>
          <div className="font-cuerpo text-[10px] text-carbon/45">Venta</div>
          <div className="text-sm text-carbon/75">{formatoPesos(o.productoPrecioUnitario)}</div>
        </div>
        <div>
          <div className="font-cuerpo text-[10px] text-carbon/45">Margen</div>
          <div className={`text-sm font-semibold ${colorMargen(m)}`}>{formatoPesos(m)}</div>
          <div className={colorMargen(m)}>{pct(o.productoPrecioUnitario, o.costoUnitario)}</div>
        </div>
      </div>
      {o.costosVolumen.length > 0 && (
        <div className="mt-1.5 space-y-0.5 text-carbon/60">
          {o.costosVolumen.map((r) => (
            <div key={r.hasta}>
              hasta {r.hasta} {o.productoUnidad}: {formatoPesos(r.costo)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Detalle({ titulo, texto, multilinea }: { titulo: string; texto: string; multilinea?: boolean }) {
  if (!texto) return null;
  return (
    <div>
      <div className="text-[10px] uppercase font-bold text-carbon/50">{titulo}</div>
      <div className={`text-carbon/80 ${multilinea ? "whitespace-pre-line" : ""}`}>{texto}</div>
    </div>
  );
}

/** Link para que el proveedor actualice sus precios sin usuario: copiar, enviar por WhatsApp o regenerar. */
function LinkPreciosProveedor({ proveedorId }: { proveedorId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [telefono, setTelefono] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function obtener(regenerar = false) {
    if (regenerar && !confirm("El link anterior dejará de funcionar. ¿Generar uno nuevo?")) return;
    setCargando(true);
    const res = await obtenerLinkPreciosProveedor(proveedorId, regenerar);
    setCargando(false);
    if (!res.ok || !res.link) return alert(res.error || "No se pudo obtener el link.");
    setLink(res.link);
    setTelefono(res.telefono || "");
    setAbierto(true);
  }

  const [generandoPdf, setGenerandoPdf] = useState(false);
  async function descargarPdf() {
    setGenerandoPdf(true);
    try {
      const res = await obtenerFichaProveedorAdmin(proveedorId);
      if (!res.ok) return alert(res.mensaje || "No se pudo generar el PDF.");
      const { descargarFichaProveedorPdf } = await import("@/lib/fichaProveedorPdf");
      descargarFichaProveedorPdf(res.proveedorNombre || "Proveedor", res.ofertas || []);
    } finally {
      setGenerandoPdf(false);
    }
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      prompt("Copia el link:", link);
    }
  }

  const digitos = telefono.replace(/\D/g, "");
  const telWa = digitos.length === 10 ? `52${digitos}` : digitos;
  const textoWa = link
    ? `Hola, te comparto tu link de SAUCEDA para actualizar tus costos, garantía, proceso y fotos de los servicios que nos ofreces: ${link}`
    : "";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (abierto ? setAbierto(false) : obtener())}
        disabled={cargando}
        className="inline-flex items-center gap-1.5 rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs font-semibold text-carbon/80 hover:border-sauce hover:text-sauce disabled:opacity-50"
      >
        🔗 Link para el proveedor
      </button>
      {abierto && link && (
        <div className="absolute right-0 z-20 mt-2 w-80 max-w-[90vw] space-y-2 rounded-xl border border-carbon/15 bg-white p-3 shadow-lg">
          <p className="text-[11px] text-carbon/60">
            El proveedor abre este link sin usuario ni contraseña, desde el celular o la computadora. Ve y edita solo su
            costo, garantía, proceso, tiempos y fotos; nunca nuestro precio de venta.
          </p>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            className="w-full rounded border border-carbon/20 px-2 py-1 font-mono text-[10.5px]"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copiar}
              className="rounded-md bg-sauce px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              {copiado ? "✓ Copiado" : "Copiar"}
            </button>
            <a
              href={`https://wa.me/${telWa}?text=${encodeURIComponent(textoWa)}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              WhatsApp
            </a>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-carbon/20 px-2.5 py-1 text-[11px] font-semibold text-carbon/70"
            >
              Ver como proveedor
            </a>
            <button
              type="button"
              onClick={descargarPdf}
              disabled={generandoPdf}
              className="rounded-md border border-sauce/40 px-2.5 py-1 text-[11px] font-semibold text-sauce disabled:opacity-50"
            >
              {generandoPdf ? "Generando…" : "📄 PDF"}
            </button>
            <button
              type="button"
              onClick={() => obtener(true)}
              className="rounded-md border border-rojo/30 px-2.5 py-1 text-[11px] font-semibold text-rojo"
            >
              Regenerar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
