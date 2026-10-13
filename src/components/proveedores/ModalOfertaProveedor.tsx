"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatoPesos } from "@/lib/formato";
import type { DatosOfertaProveedorProducto, FotoOfertaProveedor, OfertaProveedorProducto, TarifaCapacidad } from "@/lib/types";
import { CAPACIDADES_COMUNES_LITROS } from "@/lib/tarifas-capacidad";
import { guardarOfertaProveedor, listarProductosParaOferta } from "@/app/actions/proveedor-productos";
import { listarProveedoresMin } from "@/app/actions/proveedores";
import {
  crearProductoServicio,
  obtenerCentrosCosto,
  subirFichaTecnicaProducto,
  subirImagenProducto,
} from "@/app/actions/productos";

interface ModalOfertaProveedorProps {
  /** Oferta a editar; null para dar de alta una nueva. */
  oferta: OfertaProveedorProducto | null;
  /** Fija el proveedor (al abrir desde la ficha del proveedor). */
  proveedorIdFijo?: string;
  /** Fija el producto (al abrir desde la ficha del producto). */
  productoIdFijo?: string;
  /** Productos que el proveedor ya tiene, para no repetirlos en el selector. */
  productosExcluidos?: string[];
  /** Proveedores que ya ofrecen el producto, para no repetirlos en el selector. */
  proveedoresExcluidos?: string[];
  onCerrar: () => void;
  onGuardada: (oferta: OfertaProveedorProducto) => void;
}

type ProductoOpcion = {
  id: string;
  nombre: string;
  unidad: string;
  precioUnitario: number;
  categoria: string;
  tarifasCapacidad: TarifaCapacidad[];
};

/** Servicios que normalmente se cobran por tamaño del depósito. */
const RE_POR_CAPACIDAD = /tinaco|aljib|cisterna/i;

const inputCls =
  "w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white";
const labelCls = "block font-semibold text-carbon/80 mb-1 text-xs";

export function ModalOfertaProveedor({
  oferta,
  proveedorIdFijo,
  productoIdFijo,
  productosExcluidos = [],
  proveedoresExcluidos = [],
  onCerrar,
  onGuardada,
}: ModalOfertaProveedorProps) {
  const [montado, setMontado] = useState(false);
  const [productos, setProductos] = useState<ProductoOpcion[]>([]);
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([]);

  const [proveedorId, setProveedorId] = useState(oferta?.proveedorId || proveedorIdFijo || "");
  const [productoId, setProductoId] = useState(oferta?.productoId || productoIdFijo || "");
  const [costoUnitario, setCostoUnitario] = useState(oferta ? String(oferta.costoUnitario) : "");
  const [costosVolumen, setCostosVolumen] = useState<{ hasta: string; costo: string }[]>(
    (oferta?.costosVolumen || []).map((r) => ({ hasta: String(r.hasta), costo: String(r.costo) }))
  );
  const [tarifasCapacidad, setTarifasCapacidad] = useState<{ hastaLitros: string; costo: string }[]>(
    (oferta?.tarifasCapacidad || []).map((t) => ({ hastaLitros: String(t.hastaLitros), costo: String(t.costo) }))
  );
  const [porCapacidad, setPorCapacidad] = useState(
    !!oferta &&
      (oferta.tarifasCapacidad.length > 0 ||
        oferta.productoTarifasCapacidad.length > 0 ||
        RE_POR_CAPACIDAD.test(oferta.productoNombre))
  );
  const [cantidadMinima, setCantidadMinima] = useState(oferta?.cantidadMinima ? String(oferta.cantidadMinima) : "");
  const [montoMinimo, setMontoMinimo] = useState(oferta?.montoMinimo ? String(oferta.montoMinimo) : "");
  const [descripcionProceso, setDescripcionProceso] = useState(oferta?.descripcionProceso || "");
  const [garantiaAnios, setGarantiaAnios] = useState(oferta?.garantiaAnios ? String(oferta.garantiaAnios) : "");
  const [garantiaCondiciones, setGarantiaCondiciones] = useState(oferta?.garantiaCondiciones || "");
  const [tiempoEjecucion, setTiempoEjecucion] = useState(oferta?.tiempoEjecucion || "");
  const [anticipoPct, setAnticipoPct] = useState(oferta?.anticipoPct ? String(oferta.anticipoPct) : "");
  const [condicionesPago, setCondicionesPago] = useState(oferta?.condicionesPago || "");
  const [zonasCobertura, setZonasCobertura] = useState(oferta?.zonasCobertura || "");
  const [fotos, setFotos] = useState<FotoOfertaProveedor[]>(oferta?.fotos || []);
  const [fichaUrl, setFichaUrl] = useState(oferta?.fichaTecnicaUrl || "");
  const [fichaNombre, setFichaNombre] = useState(oferta?.fichaTecnicaNombre || "");
  const [vigenciaPrecio, setVigenciaPrecio] = useState(oferta?.vigenciaPrecio || "");
  const [preferido, setPreferido] = useState(oferta?.preferido || false);
  const [activo, setActivo] = useState(oferta ? oferta.activo : true);
  const [notas, setNotas] = useState(oferta?.notas || "");
  const [motivoCambio, setMotivoCambio] = useState("");

  // Alta rápida de un producto que aún no existe en el catálogo
  const [creandoProducto, setCreandoProducto] = useState(false);
  const [centrosCosto, setCentrosCosto] = useState<{ id: string; nombre: string }[]>([]);
  const [npNombre, setNpNombre] = useState("");
  const [npTipo, setNpTipo] = useState<"servicio" | "producto">("servicio");
  const [npCategoria, setNpCategoria] = useState("");
  const [npUnidad, setNpUnidad] = useState("");
  const [npPrecio, setNpPrecio] = useState("");
  const [npCentroCostoId, setNpCentroCostoId] = useState("");
  const [guardandoProducto, setGuardandoProducto] = useState(false);

  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMontado(true);
    listarProductosParaOferta().then(setProductos).catch(() => setProductos([]));
    if (!proveedorIdFijo) listarProveedoresMin().then(setProveedores).catch(() => setProveedores([]));
  }, [proveedorIdFijo]);

  const producto = productos.find((p) => p.id === productoId);
  const categoriasExistentes = useMemo(
    () => Array.from(new Set(productos.map((p) => p.categoria).filter(Boolean))).sort(),
    [productos]
  );

  function abrirAltaProducto() {
    setCreandoProducto(true);
    if (centrosCosto.length === 0) obtenerCentrosCosto().then(setCentrosCosto).catch(() => setCentrosCosto([]));
  }

  async function handleCrearProducto() {
    setError("");
    if (!npNombre.trim()) return setError("Escribe el nombre del producto nuevo.");
    if (!npUnidad.trim()) return setError("Indica la unidad del producto nuevo (m2, pza, servicio…).");
    setGuardandoProducto(true);
    try {
      // Se crea sin costo (lo pone el proveedor preferido) y oculto para Sofía hasta completarlo en Productos.
      const nuevo = await crearProductoServicio({
        nombre: npNombre.trim(),
        tipo: npTipo,
        categoria: npCategoria.trim() || "General",
        unidad: npUnidad.trim(),
        precioUnitario: Number(npPrecio || 0),
        costoUnitario: 0,
        centroCostoId: npCentroCostoId || null,
        aptoParaIa: false,
      });
      setProductos((prev) =>
        [
          ...prev,
          {
            id: nuevo.id,
            nombre: nuevo.nombre,
            unidad: nuevo.unidad,
            precioUnitario: nuevo.precioUnitario,
            categoria: nuevo.categoria || "General",
            tarifasCapacidad: [],
          },
        ].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      );
      setProductoId(nuevo.id);
      setCreandoProducto(false);
      setNpNombre("");
      setNpCategoria("");
      setNpUnidad("");
      setNpPrecio("");
      setNpCentroCostoId("");
    } catch (err: any) {
      setError("No se pudo crear el producto: " + (err?.message || "falla desconocida"));
    } finally {
      setGuardandoProducto(false);
    }
  }
  const tarifasVenta = producto?.tarifasCapacidad ?? oferta?.productoTarifasCapacidad ?? [];

  // Al elegir un producto nuevo, activa el costo por capacidad si aplica y precarga sus escalones.
  useEffect(() => {
    if (oferta || !producto) return;
    const aplica = producto.tarifasCapacidad.length > 0 || RE_POR_CAPACIDAD.test(producto.nombre);
    setPorCapacidad(aplica);
    setTarifasCapacidad(
      aplica && producto.tarifasCapacidad.length > 0
        ? producto.tarifasCapacidad.map((t) => ({ hastaLitros: String(t.hastaLitros), costo: "" }))
        : []
    );
  }, [oferta, producto]);

  function cargarCapacidadesComunes() {
    setTarifasCapacidad((prev) => {
      const existentes = new Set(prev.map((t) => Number(t.hastaLitros)));
      const nuevas = CAPACIDADES_COMUNES_LITROS.filter((l) => !existentes.has(l)).map((l) => ({
        hastaLitros: String(l),
        costo: "",
      }));
      return [...prev, ...nuevas].sort((a, b) => Number(a.hastaLitros) - Number(b.hastaLitros));
    });
  }
  const unidad = producto?.unidad || oferta?.productoUnidad || "unidad";
  const precioVenta = producto?.precioUnitario ?? oferta?.productoPrecioUnitario ?? 0;
  const costoNum = Number(costoUnitario || 0);
  const margen = precioVenta - costoNum;
  const margenPct = precioVenta > 0 ? (margen / precioVenta) * 100 : 0;

  const productosOpciones = useMemo(
    () => productos.filter((p) => p.id === productoId || !productosExcluidos.includes(p.id)),
    [productos, productoId, productosExcluidos]
  );
  const proveedoresOpciones = useMemo(
    () => proveedores.filter((p) => p.id === proveedorId || !proveedoresExcluidos.includes(p.id)),
    [proveedores, proveedorId, proveedoresExcluidos]
  );

  const costoCambio =
    !!oferta &&
    (Number(oferta.costoUnitario) !== costoNum ||
      JSON.stringify(oferta.costosVolumen.map((r) => [r.hasta, r.costo])) !==
        JSON.stringify(
          costosVolumen
            .filter((r) => r.hasta && r.costo)
            .map((r) => [Number(r.hasta), Number(r.costo)])
            .sort((a, b) => a[0] - b[0])
        ) ||
      JSON.stringify(oferta.tarifasCapacidad.map((t) => [t.hastaLitros, t.costo])) !==
        JSON.stringify(
          (porCapacidad ? tarifasCapacidad : [])
            .filter((t) => t.hastaLitros !== "" && t.costo !== "")
            .map((t) => [Number(t.hastaLitros), Number(t.costo)])
            .sort((a, b) => a[0] - b[0])
        ));

  async function handleSubirFoto(archivo: File) {
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      const res = await subirImagenProducto(fd);
      if (!res.ok || !res.url) throw new Error(res.error || "Falla desconocida");
      setFotos((prev) => [...prev, { url: res.url!, titulo: "" }]);
    } catch (err: any) {
      setError("Error al subir la foto: " + err.message);
    } finally {
      setSubiendo(false);
    }
  }

  async function handleSubirFicha(archivo: File) {
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      const res = await subirFichaTecnicaProducto(fd);
      if (!res.ok || !res.url) throw new Error(res.error || "Falla desconocida");
      setFichaUrl(res.url);
      setFichaNombre(res.nombre || archivo.name);
    } catch (err: any) {
      setError("Error al subir la ficha técnica: " + err.message);
    } finally {
      setSubiendo(false);
    }
  }

  async function handleGuardar() {
    setError("");
    if (!proveedorId) return setError("Selecciona el proveedor.");
    if (!productoId) return setError("Selecciona el producto o servicio.");

    const datos: DatosOfertaProveedorProducto = {
      proveedorId,
      productoId,
      costoUnitario: costoNum,
      costosVolumen: costosVolumen
        .filter((r) => r.hasta !== "" && r.costo !== "")
        .map((r) => ({ hasta: Number(r.hasta), costo: Number(r.costo) })),
      tarifasCapacidad: porCapacidad
        ? tarifasCapacidad
            .filter((t) => t.hastaLitros !== "" && t.costo !== "")
            .map((t) => ({ hastaLitros: Number(t.hastaLitros), costo: Number(t.costo) }))
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
      fichaTecnicaUrl: fichaUrl || null,
      fichaTecnicaNombre: fichaNombre || null,
      vigenciaPrecio: vigenciaPrecio || null,
      preferido,
      activo,
      notas,
    };

    setGuardando(true);
    try {
      const res = await guardarOfertaProveedor(oferta?.id || null, datos, motivoCambio);
      if (!res.ok || !res.oferta) {
        setError(res.error || "No se pudo guardar.");
        return;
      }
      onGuardada(res.oferta);
    } catch (err: any) {
      setError(err?.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  if (!montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs font-cuerpo">
      <div className="w-full max-w-3xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-carbon/10 flex items-center justify-between">
          <div>
            <h3 className="font-titular text-base font-bold text-verde-profundo">
              {oferta ? "Editar oferta del proveedor" : "Agregar producto que ofrece"}
            </h3>
            <p className="text-xs text-carbon/60 mt-0.5">
              Costo, mínimos, garantía y proceso del proveedor. El precio al cliente se toma del catálogo.
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="text-carbon/40 hover:text-carbon p-1 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {error && <div className="rounded-lg bg-red-50 p-3 text-rojo border border-red-200">{error}</div>}

          {/* Proveedor y producto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!proveedorIdFijo && (
              <div>
                <label className={labelCls}>Proveedor *</label>
                <select
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  disabled={!!oferta}
                  className={inputCls}
                >
                  <option value="">Selecciona…</option>
                  {proveedoresOpciones.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!productoIdFijo && (
              <div className={proveedorIdFijo ? "sm:col-span-2" : ""}>
                <label className={labelCls}>Producto o servicio *</label>
                <select
                  value={productoId}
                  onChange={(e) => setProductoId(e.target.value)}
                  disabled={!!oferta}
                  className={inputCls}
                >
                  <option value="">Selecciona…</option>
                  {productosOpciones.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.categoria}] {p.nombre} — venta {formatoPesos(p.precioUnitario)}/{p.unidad}
                    </option>
                  ))}
                </select>
                {!oferta && !creandoProducto && (
                  <button
                    type="button"
                    onClick={abrirAltaProducto}
                    className="mt-1.5 text-sauce font-semibold hover:underline"
                  >
                    + ¿No está en el catálogo? Crear producto nuevo
                  </button>
                )}
              </div>
            )}
          </div>

          {creandoProducto && (
            <div className="rounded-xl border border-sauce/40 bg-sauce/5 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-verde-profundo">🆕 Producto nuevo en el catálogo</div>
                  <p className="text-[10.5px] text-carbon/60 mt-0.5">
                    Se crea con lo básico y queda <b>oculto para Sofía</b>. Completa fotos, argumentos de venta y tarifas
                    en Productos y ahí actívalo para Sofía.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCreandoProducto(false)}
                  className="text-carbon/40 hover:text-carbon text-sm leading-none"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Nombre *</label>
                  <input
                    value={npNombre}
                    onChange={(e) => setNpNombre(e.target.value)}
                    className={inputCls}
                    placeholder="Ej. Impermeabilizante prefabricado 3.5 mm"
                  />
                </div>
                <div>
                  <label className={labelCls}>Tipo</label>
                  <select value={npTipo} onChange={(e) => setNpTipo(e.target.value as any)} className={inputCls}>
                    <option value="servicio">Servicio</option>
                    <option value="producto">Producto</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Categoría</label>
                  <input
                    value={npCategoria}
                    onChange={(e) => setNpCategoria(e.target.value)}
                    list="oferta-categorias"
                    className={inputCls}
                    placeholder="General"
                  />
                  <datalist id="oferta-categorias">
                    {categoriasExistentes.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className={labelCls}>Unidad *</label>
                  <input
                    value={npUnidad}
                    onChange={(e) => setNpUnidad(e.target.value)}
                    list="oferta-unidades"
                    className={inputCls}
                    placeholder="m2, ml, pza, servicio, lote"
                  />
                  <datalist id="oferta-unidades">
                    {["m2", "ml", "pza", "servicio", "lote", "salida"].map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className={labelCls}>Precio de venta al cliente ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={npPrecio}
                    onChange={(e) => setNpPrecio(e.target.value)}
                    className={inputCls}
                    placeholder="Puedes dejarlo en 0 y definirlo después"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Centro de costo</label>
                  <select
                    value={npCentroCostoId}
                    onChange={(e) => setNpCentroCostoId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Sin asignar</option>
                    {centrosCosto.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCrearProducto}
                  disabled={guardandoProducto}
                  className="rounded-lg bg-sauce px-4 py-2 text-xs font-semibold text-white hover:bg-verde-profundo disabled:opacity-50"
                >
                  {guardandoProducto ? "Creando…" : "Crear y seleccionar"}
                </button>
              </div>
            </div>
          )}

          {/* Costo y margen */}
          <div className="rounded-xl border border-carbon/10 bg-slate-50/60 p-4 space-y-3">
            <div className="font-bold text-verde-profundo">💲 Costo del proveedor</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>{porCapacidad ? "Costo base (opcional)" : `Costo por ${unidad}`}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costoUnitario}
                  onChange={(e) => setCostoUnitario(e.target.value)}
                  className={inputCls}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className={labelCls}>Cobra mínimo ({unidad})</label>
                <input
                  type="number"
                  step="0.01"
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
                  step="0.01"
                  min="0"
                  value={montoMinimo}
                  onChange={(e) => setMontoMinimo(e.target.value)}
                  className={inputCls}
                  placeholder="0 = sin mínimo"
                />
              </div>
              <div>
                <label className={labelCls}>Precio vigente hasta</label>
                <input
                  type="date"
                  value={vigenciaPrecio}
                  onChange={(e) => setVigenciaPrecio(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {productoId && (
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-carbon/80">
                <input type="checkbox" checked={porCapacidad} onChange={(e) => setPorCapacidad(e.target.checked)} />
                Se cobra por capacidad en litros (tinacos, aljibes, cisternas)
              </label>
            )}

            {productoId && !porCapacidad && (
              <div className="flex flex-wrap gap-4 text-[11px] text-carbon/70">
                <span>
                  Precio de venta: <b className="font-mono text-carbon">{formatoPesos(precioVenta)}</b>/{unidad}
                </span>
                <span>
                  Margen:{" "}
                  <b className={`font-mono ${margen >= 0 ? "text-emerald-700" : "text-rojo"}`}>
                    {formatoPesos(margen)} ({margenPct.toFixed(1)}%)
                  </b>
                </span>
              </div>
            )}

            {porCapacidad && (
              <div className="rounded-lg border border-carbon/10 bg-white p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-semibold text-carbon/80">📏 Costo por capacidad (litros)</span>
                    <p className="text-[10.5px] text-carbon/50 mt-0.5">
                      Se aplica el primer escalón que cubre los litros del cliente. El precio de venta de cada escalón se
                      captura en el producto (pestaña Argumentos de Venta y Sofía).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={cargarCapacidadesComunes}
                    className="shrink-0 rounded-lg border border-carbon/20 px-2.5 py-1 text-[11px] font-bold text-carbon/70 hover:text-sauce"
                  >
                    Cargar capacidades comunes
                  </button>
                </div>
                {tarifasCapacidad.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-carbon/50">
                      <span className="w-28">Capacidad (L)</span>
                      <span className="w-28">Costo proveedor</span>
                      <span className="w-24 text-right">Precio venta</span>
                      <span className="w-28 text-right">Margen</span>
                    </div>
                    {tarifasCapacidad.map((t, i) => {
                      const venta = tarifasVenta.find((v) => v.hastaLitros === Number(t.hastaLitros))?.precio ?? null;
                      const costo = t.costo === "" ? null : Number(t.costo);
                      const margenEsc = venta !== null && costo !== null ? venta - costo : null;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            value={t.hastaLitros}
                            onChange={(e) =>
                              setTarifasCapacidad((prev) =>
                                prev.map((x, j) => (j === i ? { ...x, hastaLitros: e.target.value } : x))
                              )
                            }
                            className={`${inputCls} w-28`}
                            placeholder="Litros"
                          />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={t.costo}
                            onChange={(e) =>
                              setTarifasCapacidad((prev) => prev.map((x, j) => (j === i ? { ...x, costo: e.target.value } : x)))
                            }
                            className={`${inputCls} w-28`}
                            placeholder="$ costo"
                          />
                          <span className="w-24 text-right font-mono text-carbon/70">
                            {venta !== null ? formatoPesos(venta) : "—"}
                          </span>
                          <span
                            className={`w-28 text-right font-mono ${
                              margenEsc === null ? "text-carbon/40" : margenEsc >= 0 ? "text-emerald-700" : "text-rojo"
                            }`}
                          >
                            {margenEsc === null
                              ? "—"
                              : `${formatoPesos(margenEsc)} (${venta ? ((margenEsc / venta) * 100).toFixed(0) : 0}%)`}
                          </span>
                          <button
                            type="button"
                            onClick={() => setTarifasCapacidad((prev) => prev.filter((_, j) => j !== i))}
                            className="text-rojo px-2"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setTarifasCapacidad((prev) => [...prev, { hastaLitros: "", costo: "" }])}
                      className="text-sauce font-semibold hover:underline"
                    >
                      + Agregar capacidad
                    </button>
                  </div>
                )}
              </div>
            )}

            {!porCapacidad && (
            <div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-carbon/80">Costo por volumen (opcional)</span>
                <button
                  type="button"
                  onClick={() => setCostosVolumen((prev) => [...prev, { hasta: "", costo: "" }])}
                  className="text-sauce font-semibold hover:underline"
                >
                  + Agregar rango
                </button>
              </div>
              <p className="text-[10.5px] text-carbon/50 mt-0.5">
                Se usa el primer rango que cubre la cantidad; arriba del último rango se usa el último.
              </p>
              {costosVolumen.map((r, i) => (
                <div key={i} className="flex items-center gap-2 mt-2">
                  <span className="text-carbon/60 w-12">Hasta</span>
                  <input
                    type="number"
                    min="0"
                    value={r.hasta}
                    onChange={(e) =>
                      setCostosVolumen((prev) => prev.map((x, j) => (j === i ? { ...x, hasta: e.target.value } : x)))
                    }
                    className={`${inputCls} w-28`}
                    placeholder={unidad}
                  />
                  <span className="text-carbon/60">{unidad} →</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={r.costo}
                    onChange={(e) =>
                      setCostosVolumen((prev) => prev.map((x, j) => (j === i ? { ...x, costo: e.target.value } : x)))
                    }
                    className={`${inputCls} w-28`}
                    placeholder="$ costo"
                  />
                  <button
                    type="button"
                    onClick={() => setCostosVolumen((prev) => prev.filter((_, j) => j !== i))}
                    className="text-rojo px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            )}

            {costoCambio && (
              <div>
                <label className={labelCls}>Motivo del cambio de costo (queda en el historial)</label>
                <input
                  value={motivoCambio}
                  onChange={(e) => setMotivoCambio(e.target.value)}
                  className={inputCls}
                  placeholder="Ej. Aumento de material, negociación por volumen…"
                />
              </div>
            )}
          </div>

          {/* Proceso y garantía */}
          <div>
            <label className={labelCls}>Descripción del proceso</label>
            <textarea
              rows={4}
              value={descripcionProceso}
              onChange={(e) => setDescripcionProceso(e.target.value)}
              className={inputCls}
              placeholder="Preparación de superficie, materiales, capas, curado, limpieza…"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Garantía (años)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={garantiaAnios}
                onChange={(e) => setGarantiaAnios(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Condiciones de la garantía</label>
              <input
                value={garantiaCondiciones}
                onChange={(e) => setGarantiaCondiciones(e.target.value)}
                className={inputCls}
                placeholder="Qué cubre, qué la invalida, mantenimiento requerido…"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Tiempo de ejecución</label>
              <input
                value={tiempoEjecucion}
                onChange={(e) => setTiempoEjecucion(e.target.value)}
                className={inputCls}
                placeholder="Ej. 2 días por cada 100 m²"
              />
            </div>
            <div>
              <label className={labelCls}>Anticipo que pide (%)</label>
              <input
                type="number"
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
                placeholder="Ej. 50% anticipo, 50% al terminar"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Zonas que cubre</label>
            <input
              value={zonasCobertura}
              onChange={(e) => setZonasCobertura(e.target.value)}
              className={inputCls}
              placeholder="Ej. León, Silao, San Francisco del Rincón"
            />
          </div>

          {/* Fotos y ficha técnica */}
          <div className="rounded-xl border border-carbon/10 p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-verde-profundo">🖼️ Fotos de sus trabajos y ficha técnica</span>
              <div className="flex gap-2">
                <label className="cursor-pointer rounded-lg border border-carbon/20 px-3 py-1.5 font-semibold text-carbon/70 hover:border-sauce hover:text-sauce">
                  {subiendo ? "Subiendo…" : "+ Foto"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={subiendo}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleSubirFoto(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className="cursor-pointer rounded-lg border border-carbon/20 px-3 py-1.5 font-semibold text-carbon/70 hover:border-sauce hover:text-sauce">
                  {fichaUrl ? "Cambiar ficha PDF" : "+ Ficha PDF"}
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    disabled={subiendo}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleSubirFicha(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            {fichaUrl && (
              <div className="flex items-center gap-2">
                <a href={fichaUrl} target="_blank" rel="noreferrer" className="text-sauce font-semibold hover:underline">
                  📄 {fichaNombre || "Ficha técnica"}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setFichaUrl("");
                    setFichaNombre("");
                  }}
                  className="text-rojo"
                >
                  ✕
                </button>
              </div>
            )}
            {fotos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {fotos.map((f, i) => (
                  <div key={f.url} className="space-y-1">
                    <div className="relative">
                      <img src={f.url} alt={f.titulo || "Foto"} className="h-24 w-full object-cover rounded-lg border" />
                      <button
                        type="button"
                        onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 rounded-full bg-white/90 px-1.5 text-rojo shadow"
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      value={f.titulo}
                      onChange={(e) =>
                        setFotos((prev) => prev.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))
                      }
                      className="w-full rounded border border-carbon/15 px-2 py-1 text-[11px]"
                      placeholder="Descripción"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Notas internas</label>
            <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className={inputCls} />
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={preferido} onChange={(e) => setPreferido(e.target.checked)} className="mt-0.5" />
              <span>
                <b>⭐ Proveedor preferido para este producto</b>
                <span className="block text-[10.5px] text-carbon/50">
                  Su costo, rangos y mínimo se copian al producto del catálogo (cotizaciones y márgenes).
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              <b>Oferta activa</b>
            </label>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-carbon/10 bg-slate-50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon/70 hover:bg-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={guardando || subiendo || creandoProducto}
            className="rounded-lg bg-sauce px-4 py-2 text-xs font-semibold text-white hover:bg-verde-profundo disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar oferta"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
