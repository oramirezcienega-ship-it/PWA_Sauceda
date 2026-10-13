"use client";

import { Fragment, useEffect, useState } from "react";
import { formatoPesos } from "@/lib/formato";
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
          Revisa los cambios y da clic en <b>Revisado</b>; hasta entonces su costo no se usa en el catálogo.
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
        <div className="overflow-x-auto rounded-xl border border-carbon/10 shadow-2xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-carbon/10 bg-slate-50 text-carbon/70 uppercase tracking-wider font-semibold">
                <th className="py-3 px-3 min-w-[200px]">{modo === "proveedor" ? "Producto" : "Proveedor"}</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Costo</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Precio venta</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Margen</th>
                <th className="py-3 px-3 whitespace-nowrap">Mínimo</th>
                <th className="py-3 px-3 whitespace-nowrap">Garantía</th>
                <th className="py-3 px-3 whitespace-nowrap">Tiempo</th>
                <th className="py-3 px-3 whitespace-nowrap">Vigencia</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon/10">
              {ofertas.map((o) => {
                const margen = o.productoPrecioUnitario - o.costoUnitario;
                const margenPct = o.productoPrecioUnitario > 0 ? (margen / o.productoPrecioUnitario) * 100 : 0;
                const esMasBarato = costoMinimo !== null && o.activo && o.costoUnitario === costoMinimo;
                return (
                  <Fragment key={o.id}>
                    <tr className={`hover:bg-slate-50/60 ${!o.activo ? "opacity-50" : ""}`}>
                      <td className="py-2.5 px-3">
                        <button type="button" onClick={() => handleExpandir(o)} className="text-left">
                          <div className="font-semibold text-carbon flex items-center gap-1.5 flex-wrap">
                            {o.preferido && <span title="Proveedor preferido">⭐</span>}
                            {modo === "proveedor" ? o.productoNombre : o.proveedorNombre}
                            {!o.activo && <span className="text-[9px] rounded bg-carbon/10 px-1">inactiva</span>}
                            {o.pendienteRevision && (
                              <span
                                className="text-[9px] rounded bg-amber-100 text-amber-800 px-1 font-bold"
                                title={
                                  o.actualizadoPorProveedorAt
                                    ? `Actualizado por el proveedor el ${formatoFecha(o.actualizadoPorProveedorAt)}`
                                    : undefined
                                }
                              >
                                🔔 actualizado por proveedor
                              </span>
                            )}
                            {modo === "producto" && !o.proveedorActivo && (
                              <span className="text-[9px] rounded bg-rojo/10 text-rojo px-1">proveedor inactivo</span>
                            )}
                          </div>
                          <div className="text-[10.5px] text-carbon/50">
                            {modo === "proveedor" ? o.productoCategoria : o.zonasCobertura || "—"} ·{" "}
                            {expandida === o.id ? "ocultar detalle ▲" : "ver detalle ▼"}
                          </div>
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        <span className={esMasBarato ? "font-bold text-emerald-700" : ""}>
                          {formatoPesos(o.costoUnitario)}
                        </span>
                        <span className="text-carbon/50">/{o.productoUnidad}</span>
                        {o.costosVolumen.length > 0 && (
                          <div className="text-[10px] text-carbon/50">{o.costosVolumen.length} rango(s) por volumen</div>
                        )}
                        {o.tarifasCapacidad.length > 0 && (
                          <div className="text-[10px] text-carbon/60">
                            {o.tarifasCapacidad
                              .slice(0, 3)
                              .map((t) => `${t.hastaLitros.toLocaleString("es-MX")} L ${formatoPesos(t.costo)}`)
                              .join(" · ")}
                            {o.tarifasCapacidad.length > 3 ? " …" : ""}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                        {formatoPesos(o.productoPrecioUnitario)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono whitespace-nowrap ${
                          margen >= 0 ? "text-emerald-700" : "text-rojo"
                        }`}
                      >
                        {formatoPesos(margen)}
                        <div className="text-[10px]">{margenPct.toFixed(1)}%</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {o.cantidadMinima > 0 && (
                          <div>
                            {o.cantidadMinima} {o.productoUnidad}
                          </div>
                        )}
                        {o.montoMinimo > 0 && <div>{formatoPesos(o.montoMinimo)}</div>}
                        {!o.cantidadMinima && !o.montoMinimo && <span className="text-carbon/40">—</span>}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {o.garantiaAnios > 0 ? `${o.garantiaAnios} año(s)` : <span className="text-carbon/40">—</span>}
                      </td>
                      <td className="py-2.5 px-3">{o.tiempoEjecucion || <span className="text-carbon/40">—</span>}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {o.vigenciaPrecio ? (
                          <span className={vencida(o.vigenciaPrecio) ? "text-rojo font-semibold" : ""}>
                            {vencida(o.vigenciaPrecio) ? "Vencido " : ""}
                            {formatoFecha(o.vigenciaPrecio)}
                          </span>
                        ) : (
                          <span className="text-carbon/40">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                        {o.pendienteRevision && (
                          <button
                            type="button"
                            onClick={() => handleRevisada(o)}
                            title="Aceptar lo que capturó el proveedor"
                            className="rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-600"
                          >
                            ✓ Revisado
                          </button>
                        )}
                        {!o.preferido && (
                          <button
                            type="button"
                            onClick={() => handlePreferido(o)}
                            title="Usar su costo en el catálogo"
                            className="rounded-md bg-white border border-carbon/20 px-2 py-1 text-[11px] font-semibold text-carbon/70 hover:border-dorado hover:text-amber-700"
                          >
                            ⭐
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setModal({ oferta: o })}
                          className="rounded-md bg-white border border-carbon/20 px-2.5 py-1 text-[11px] font-semibold text-carbon/70 hover:border-sauce hover:text-sauce"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEliminar(o)}
                          className="rounded-md bg-white border border-rojo/30 px-2 py-1 text-[11px] font-semibold text-rojo hover:bg-rojo/5"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                    {expandida === o.id && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Detalle titulo="Proceso" texto={o.descripcionProceso} multilinea />
                              <Detalle titulo="Condiciones de garantía" texto={o.garantiaCondiciones} />
                              <Detalle
                                titulo="Pago"
                                texto={[o.anticipoPct > 0 ? `Anticipo ${o.anticipoPct}%` : "", o.condicionesPago]
                                  .filter(Boolean)
                                  .join(" · ")}
                              />
                              <Detalle titulo="Zonas" texto={o.zonasCobertura} />
                              <Detalle titulo="Notas" texto={o.notas} />
                              {o.tarifasCapacidad.length > 0 && (
                                <div>
                                  <div className="text-[10px] uppercase font-bold text-carbon/50">Costo por capacidad</div>
                                  <table className="mt-1 text-[11px]">
                                    <thead>
                                      <tr className="text-carbon/50">
                                        <th className="pr-4 text-left font-semibold">Capacidad</th>
                                        <th className="pr-4 text-right font-semibold">Costo</th>
                                        <th className="pr-4 text-right font-semibold">Venta</th>
                                        <th className="text-right font-semibold">Margen</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {o.tarifasCapacidad.map((t) => {
                                        const venta =
                                          o.productoTarifasCapacidad.find((v) => v.hastaLitros === t.hastaLitros)?.precio ?? null;
                                        const m = venta !== null ? venta - t.costo : null;
                                        return (
                                          <tr key={t.hastaLitros} className="font-mono">
                                            <td className="pr-4">{t.hastaLitros.toLocaleString("es-MX")} L</td>
                                            <td className="pr-4 text-right">{formatoPesos(t.costo)}</td>
                                            <td className="pr-4 text-right">{venta !== null ? formatoPesos(venta) : "—"}</td>
                                            <td
                                              className={`text-right ${
                                                m === null ? "text-carbon/40" : m >= 0 ? "text-emerald-700" : "text-rojo"
                                              }`}
                                            >
                                              {m === null ? "—" : formatoPesos(m)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {o.costosVolumen.length > 0 && (
                                <div>
                                  <div className="text-[10px] uppercase font-bold text-carbon/50">Costo por volumen</div>
                                  {o.costosVolumen.map((r) => (
                                    <div key={r.hasta} className="font-mono">
                                      hasta {r.hasta} {o.productoUnidad}: {formatoPesos(r.costo)}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {o.fichaTecnicaUrl && (
                                <a
                                  href={o.fichaTecnicaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-block text-sauce font-semibold hover:underline"
                                >
                                  📄 {o.fichaTecnicaNombre || "Ficha técnica"}
                                </a>
                              )}
                            </div>
                            <div className="space-y-3">
                              {o.fotos.length > 0 && (
                                <div className="grid grid-cols-3 gap-2">
                                  {o.fotos.map((f) => (
                                    <a key={f.url} href={f.url} target="_blank" rel="noreferrer" title={f.titulo}>
                                      <img
                                        src={f.url}
                                        alt={f.titulo || "Foto del trabajo"}
                                        className="h-20 w-full object-cover rounded-lg border"
                                      />
                                    </a>
                                  ))}
                                </div>
                              )}
                              <div>
                                <div className="text-[10px] uppercase font-bold text-carbon/50">Historial de costo</div>
                                {!historial[o.id] ? (
                                  <div className="text-carbon/40">Cargando…</div>
                                ) : historial[o.id].length === 0 ? (
                                  <div className="text-carbon/40">Sin cambios desde el alta.</div>
                                ) : (
                                  historial[o.id].map((h) => (
                                    <div key={h.id} className="flex gap-2">
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
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
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
