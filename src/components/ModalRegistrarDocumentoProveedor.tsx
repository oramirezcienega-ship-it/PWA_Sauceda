"use client";

import { useEffect, useState } from "react";
import {
  registrarDocumentoProveedor,
  actualizarDocumentoProveedor,
  subirArchivoDocumentoProveedor,
  listarCotizacionesMinParaProveedor,
  listarProveedoresMin,
  obtenerConceptosDeCotizacionParaProveedor,
  listarProductosParaProveedor,
} from "@/app/actions/proveedores";
import type { DatosDocumentoProveedor, DocumentoProveedor, TipoDocumentoProveedor } from "@/lib/types";

interface ModalRegistrarDocumentoProveedorProps {
  abierto: boolean;
  onCerrar: () => void;
  onRegistrado: (documento: DocumentoProveedor) => void;
  /** Si se fija, no se muestra el selector de proveedor. */
  proveedorId?: string;
  proveedorNombre?: string;
  /** Si se fija, no se muestra el selector de cotización (orden de trabajo). */
  cotizacionId?: string;
  expedienteId?: string | null;
  /** Si se pasa, el modal edita este documento existente en lugar de crear uno nuevo. */
  documentoExistente?: DocumentoProveedor | null;
}

interface PartidaOT {
  id: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  costoUnitario: number;
  precioUnitario: number;
  productoServicioId: string | null;
}

export function ModalRegistrarDocumentoProveedor({
  abierto,
  onCerrar,
  onRegistrado,
  proveedorId,
  proveedorNombre,
  cotizacionId,
  expedienteId,
  documentoExistente,
}: ModalRegistrarDocumentoProveedorProps) {
  const editando = !!documentoExistente;

  const [proveedorSel, setProveedorSel] = useState(proveedorId || documentoExistente?.proveedorId || "");
  const [proveedoresOpciones, setProveedoresOpciones] = useState<{ id: string; nombre: string }[]>([]);
  const [cotizacionSel, setCotizacionSel] = useState(
    cotizacionId || documentoExistente?.cotizacionId || documentoExistente?.ordenTrabajoId || ""
  );
  const [cotizacionesOpciones, setCotizacionesOpciones] = useState<
    { id: string; prospectoNombre: string; estatus: string }[]
  >([]);

  // Estructura de producto, metros y costo por m2
  const [productoId, setProductoId] = useState<string | null>(documentoExistente?.productoId || null);
  const [productoNombre, setProductoNombre] = useState(
    documentoExistente?.productoNombre || documentoExistente?.concepto || ""
  );
  const [cantidad, setCantidad] = useState(
    documentoExistente?.cantidad !== null && documentoExistente?.cantidad !== undefined
      ? String(documentoExistente.cantidad)
      : ""
  );
  const [unidad, setUnidad] = useState(documentoExistente?.unidad || "m2");
  const [costoUnitario, setCostoUnitario] = useState(
    documentoExistente?.costoUnitario !== null && documentoExistente?.costoUnitario !== undefined
      ? String(documentoExistente.costoUnitario)
      : ""
  );

  // Partidas disponibles de la OT / Cotización seleccionada
  const [partidasOT, setPartidasOT] = useState<PartidaOT[]>([]);
  const [cargandoPartidas, setCargandoPartidas] = useState(false);

  // Catálogo maestro de productos para autocompletar
  const [catalogoProductos, setCatalogoProductos] = useState<
    Array<{ id: string; nombre: string; unidad: string; costoUnitario: number }>
  >([]);

  const [tipo, setTipo] = useState<TipoDocumentoProveedor>(documentoExistente?.tipo || "remision");
  const [folioProveedor, setFolioProveedor] = useState(documentoExistente?.folioProveedor || "");
  const [concepto, setConcepto] = useState(documentoExistente?.concepto || "");
  const [fecha, setFecha] = useState(
    documentoExistente?.fecha?.slice(0, 10) || new Date().toISOString().slice(0, 10)
  );
  const [monto, setMonto] = useState(documentoExistente ? String(documentoExistente.monto) : "");
  const [notas, setNotas] = useState(documentoExistente?.notas || "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar catálogo maestro una sola vez
  useEffect(() => {
    listarProductosParaProveedor().then(setCatalogoProductos).catch(() => setCatalogoProductos([]));
  }, []);

  // Inicializar campos cuando se abre o cambia el documento en edición
  useEffect(() => {
    if (!abierto) return;
    const initialCot = cotizacionId || documentoExistente?.cotizacionId || documentoExistente?.ordenTrabajoId || "";
    setProveedorSel(proveedorId || documentoExistente?.proveedorId || "");
    setCotizacionSel(initialCot);
    setTipo(documentoExistente?.tipo || "remision");
    setFolioProveedor(documentoExistente?.folioProveedor || "");
    setProductoId(documentoExistente?.productoId || null);
    setProductoNombre(documentoExistente?.productoNombre || documentoExistente?.concepto || "");
    setCantidad(
      documentoExistente?.cantidad !== null && documentoExistente?.cantidad !== undefined
        ? String(documentoExistente.cantidad)
        : ""
    );
    setUnidad(documentoExistente?.unidad || "m2");
    setCostoUnitario(
      documentoExistente?.costoUnitario !== null && documentoExistente?.costoUnitario !== undefined
        ? String(documentoExistente.costoUnitario)
        : ""
    );
    setConcepto(documentoExistente?.concepto || "");
    setFecha(documentoExistente?.fecha?.slice(0, 10) || new Date().toISOString().slice(0, 10));
    setMonto(documentoExistente ? String(documentoExistente.monto) : "");
    setNotas(documentoExistente?.notas || "");
    setArchivo(null);
    setError(null);

    if (!proveedorId) {
      listarProveedoresMin().then(setProveedoresOpciones).catch(() => setProveedoresOpciones([]));
    }
    if (!cotizacionId) {
      listarCotizacionesMinParaProveedor().then(setCotizacionesOpciones).catch(() => setCotizacionesOpciones([]));
    }
  }, [abierto, proveedorId, cotizacionId, documentoExistente]);

  // Cargar partidas de la cotización/OT cada vez que cambie cotizacionSel
  useEffect(() => {
    const cot = cotizacionId || cotizacionSel;
    if (!cot) {
      setPartidasOT([]);
      return;
    }
    setCargandoPartidas(true);
    obtenerConceptosDeCotizacionParaProveedor(cot)
      .then((res) => {
        setPartidasOT(res.conceptos);
        // Si no hay producto seleccionado y hay partidas, pre-seleccionar o sugerir la primera
        if (!productoNombre && res.conceptos.length > 0) {
          const primera = res.conceptos[0];
          setProductoNombre(primera.descripcion);
          setProductoId(primera.productoServicioId || null);
          setCantidad(String(primera.cantidad));
          setUnidad(primera.unidad || "m2");
          if (primera.costoUnitario > 0 && !costoUnitario) {
            setCostoUnitario(String(primera.costoUnitario));
          }
        }
      })
      .catch(() => setPartidasOT([]))
      .finally(() => setCargandoPartidas(false));
  }, [cotizacionId, cotizacionSel]);

  if (!abierto) return null;

  // Manejador reactivo: cuando cambia la cantidad de metros
  function handleCantidadChange(valor: string) {
    setCantidad(valor);
    const cantNum = parseFloat(valor);
    const cUnitNum = parseFloat(costoUnitario);
    if (!isNaN(cantNum) && cantNum > 0 && !isNaN(cUnitNum) && cUnitNum > 0) {
      const nuevoTotal = Math.round(cantNum * cUnitNum * 100) / 100;
      setMonto(String(nuevoTotal));
    } else {
      const montoNum = parseFloat(monto);
      if (!isNaN(cantNum) && cantNum > 0 && !isNaN(montoNum) && montoNum > 0 && (!cUnitNum || cUnitNum <= 0)) {
        const nuevoCostoUnit = Math.round((montoNum / cantNum) * 100) / 100;
        setCostoUnitario(String(nuevoCostoUnit));
      }
    }
  }

  // Manejador reactivo: cuando cambia el costo por m2
  function handleCostoUnitarioChange(valor: string) {
    setCostoUnitario(valor);
    const cUnitNum = parseFloat(valor);
    const cantNum = parseFloat(cantidad);
    if (!isNaN(cUnitNum) && cUnitNum >= 0 && !isNaN(cantNum) && cantNum > 0) {
      const nuevoTotal = Math.round(cantNum * cUnitNum * 100) / 100;
      setMonto(String(nuevoTotal));
    }
  }

  // Manejador reactivo: cuando cambia el monto total directamente
  function handleMontoChange(valor: string) {
    setMonto(valor);
    const montoNum = parseFloat(valor);
    const cantNum = parseFloat(cantidad);
    if (!isNaN(montoNum) && montoNum > 0 && !isNaN(cantNum) && cantNum > 0) {
      const nuevoCostoUnit = Math.round((montoNum / cantNum) * 100) / 100;
      setCostoUnitario(String(nuevoCostoUnit));
    }
  }

  // Seleccionar partida directa de la orden de trabajo
  function handleSeleccionarPartidaOT(p: PartidaOT) {
    setProductoNombre(p.descripcion);
    setProductoId(p.productoServicioId || null);
    setCantidad(String(p.cantidad));
    setUnidad(p.unidad || "m2");

    const montoNum = parseFloat(monto);
    if (!isNaN(montoNum) && montoNum > 0 && p.cantidad > 0) {
      // Si ya hay un monto pactado (como en la OT generada), calcular el costo real por m2
      const costoCalculado = Math.round((montoNum / p.cantidad) * 100) / 100;
      setCostoUnitario(String(costoCalculado));
    } else if (p.costoUnitario > 0) {
      setCostoUnitario(String(p.costoUnitario));
      setMonto(String(Math.round(p.cantidad * p.costoUnitario * 100) / 100));
    }

    if (!concepto.trim()) {
      setConcepto(`${p.cantidad} ${p.unidad || "m2"} - ${p.descripcion}`);
    }
  }

  // Seleccionar producto del catálogo maestro
  function handleSeleccionarProductoCatalogo(prodId: string) {
    const prod = catalogoProductos.find((p) => p.id === prodId);
    if (!prod) return;
    setProductoId(prod.id);
    setProductoNombre(prod.nombre);
    setUnidad(prod.unidad || "m2");
    if (prod.costoUnitario > 0) {
      setCostoUnitario(String(prod.costoUnitario));
      const cantNum = parseFloat(cantidad);
      if (!isNaN(cantNum) && cantNum > 0) {
        setMonto(String(Math.round(cantNum * prod.costoUnitario * 100) / 100));
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const provFinal = proveedorId || proveedorSel;
    if (!provFinal) {
      setError("Selecciona el proveedor que emitió el documento.");
      return;
    }
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) {
      setError("Ingresa un monto válido mayor a cero.");
      return;
    }

    const cantNum = parseFloat(cantidad);
    const cUnitNum = parseFloat(costoUnitario);

    // Concepto fallback si no se escribió
    const conceptoFinal = (
      concepto.trim() ||
      productoNombre.trim() ||
      (cantNum ? `${cantNum} ${unidad} de trabajo realizado` : "Trabajo realizado")
    ).trim();

    setGuardando(true);
    try {
      let archivoUrl: string | null | undefined = documentoExistente?.archivoUrl ?? null;
      let archivoNombre: string | null | undefined = documentoExistente?.archivoNombre ?? null;

      if (archivo) {
        const formData = new FormData();
        formData.append("archivo", archivo);
        const res = await subirArchivoDocumentoProveedor(formData);
        if (!res.ok) {
          setError(res.error || "No se pudo subir el archivo adjunto.");
          setGuardando(false);
          return;
        }
        archivoUrl = res.url;
        archivoNombre = res.nombre;
      }

      if (editando && documentoExistente) {
        await actualizarDocumentoProveedor(documentoExistente.id, {
          cotizacionId: cotizacionId || cotizacionSel || null,
          expedienteId: expedienteId ?? documentoExistente.expedienteId,
          tipo,
          folioProveedor: tipo === "factura" ? folioProveedor.trim() : null,
          concepto: conceptoFinal,
          productoId: productoId || null,
          productoNombre: productoNombre.trim() || null,
          cantidad: !isNaN(cantNum) && cantNum > 0 ? cantNum : null,
          unidad: unidad.trim() || "m2",
          costoUnitario: !isNaN(cUnitNum) && cUnitNum >= 0 ? cUnitNum : null,
          fecha,
          monto: montoNum,
          archivoUrl,
          archivoNombre,
          notas: notas.trim(),
        });
        onRegistrado({
          ...documentoExistente,
          tipo,
          folioProveedor: tipo === "factura" ? folioProveedor.trim() || null : null,
          concepto: conceptoFinal,
          productoId: productoId || null,
          productoNombre: productoNombre.trim() || null,
          cantidad: !isNaN(cantNum) && cantNum > 0 ? cantNum : null,
          unidad: unidad.trim() || "m2",
          costoUnitario: !isNaN(cUnitNum) && cUnitNum >= 0 ? cUnitNum : null,
          fecha,
          monto: montoNum,
          archivoUrl: archivoUrl ?? null,
          archivoNombre: archivoNombre ?? null,
          notas: notas.trim(),
        });
      } else {
        const datos: DatosDocumentoProveedor = {
          proveedorId: provFinal,
          cotizacionId: cotizacionId || cotizacionSel || null,
          expedienteId: expedienteId || null,
          ordenTrabajoId: null,
          tipo,
          folioProveedor: tipo === "factura" ? folioProveedor.trim() || null : null,
          concepto: conceptoFinal,
          productoId: productoId || null,
          productoNombre: productoNombre.trim() || null,
          cantidad: !isNaN(cantNum) && cantNum > 0 ? cantNum : null,
          unidad: unidad.trim() || "m2",
          costoUnitario: !isNaN(cUnitNum) && cUnitNum >= 0 ? cUnitNum : null,
          fecha,
          monto: montoNum,
          archivoUrl: archivoUrl || null,
          archivoNombre: archivoNombre || null,
          notas: notas.trim(),
        };

        const nuevo = await registrarDocumentoProveedor(datos);
        onRegistrado(nuevo);
      }

      onCerrar();
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error al guardar el documento.");
    } finally {
      setGuardando(false);
    }
  }

  const cantidadNum = parseFloat(cantidad) || 0;
  const costoUnitNum = parseFloat(costoUnitario) || 0;
  const montoNum = parseFloat(monto) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl transition-all border border-carbon/10 max-h-[92vh] overflow-y-auto font-cuerpo">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-carbon/10 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sauce/15 text-xl">📄</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-titular text-lg font-bold text-verde-profundo">
                  {editando ? "Editar Documento de Proveedor" : "Registrar Factura / Remisión de Proveedor"}
                </h2>
                {editando && documentoExistente?.origen === "automatico" && (
                  <span className="rounded-full bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    ⚡ Automático OT
                  </span>
                )}
              </div>
              <p className="text-xs text-carbon/60">
                {editando && documentoExistente ? (
                  <>
                    Folio interno: <span className="font-mono font-bold text-carbon">{documentoExistente.folio}</span>
                  </>
                ) : proveedorNombre ? (
                  `Proveedor: ${proveedorNombre}`
                ) : (
                  "Estructura el producto, metros cuadrados y costo pactado con el proveedor."
                )}
                {cotizacionId ? ` · Orden: ${cotizacionId}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="rounded-lg p-1 text-carbon/40 hover:bg-carbon/5 hover:text-carbon text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-rojo/10 p-3 text-xs text-rojo border border-rojo/20 font-medium">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Selector de Proveedor */}
          {!proveedorId && !editando && (
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Proveedor <span className="text-rojo">*</span>
              </label>
              <select
                value={proveedorSel}
                onChange={(e) => setProveedorSel(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              >
                <option value="">Selecciona un proveedor</option>
                {proveedoresOpciones.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Selector de Orden de Trabajo / Cotización */}
          {!cotizacionId && (
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Orden de Trabajo / Cotización relacionada
              </label>
              <select
                value={cotizacionSel}
                onChange={(e) => setCotizacionSel(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              >
                <option value="">Sin vincular a una orden específica</option>
                {cotizacionesOpciones.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — {c.prospectoNombre || "Sin cliente"} ({c.estatus})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Partidas de la Orden de Trabajo vinculada */}
          {partidasOT.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📦</span> Partidas de la Orden de Trabajo ({partidasOT.length})
                </span>
                <span className="text-[10px] text-emerald-700">Haz clic en una para vincular m² y producto</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {partidasOT.map((p) => {
                  const seleccionada = productoNombre.trim() === p.descripcion.trim();
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSeleccionarPartidaOT(p)}
                      className={`text-left rounded-lg px-2.5 py-1.5 text-xs transition border ${
                        seleccionada
                          ? "bg-emerald-600 text-white border-emerald-700 shadow-xs font-semibold"
                          : "bg-white text-carbon/80 border-emerald-200 hover:bg-emerald-100/60"
                      }`}
                    >
                      <span className="font-bold">{p.cantidad} {p.unidad || "m²"}</span> · {p.descripcion}
                      {p.costoUnitario > 0 && (
                        <span className={`ml-1 text-[10px] ${seleccionada ? "text-emerald-100" : "text-emerald-700 font-mono"}`}>
                          (${p.costoUnitario}/{p.unidad || "m²"})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tipo de Documento */}
          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">Tipo de Documento</label>
            <div className="flex rounded-xl border border-carbon/20 overflow-hidden text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTipo("remision")}
                className={`flex-1 px-3 py-2 transition ${
                  tipo === "remision" ? "bg-sauce text-white" : "bg-white text-carbon/60 hover:bg-carbon/5"
                }`}
              >
                Remisión
              </button>
              <button
                type="button"
                onClick={() => setTipo("factura")}
                className={`flex-1 px-3 py-2 transition border-l border-carbon/20 ${
                  tipo === "factura" ? "bg-sauce text-white" : "bg-white text-carbon/60 hover:bg-carbon/5"
                }`}
              >
                Factura
              </button>
            </div>
          </div>

          {/* Folio Proveedor si es factura */}
          {tipo === "factura" && (
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">Folio de la Factura del Proveedor</label>
              <input
                type="text"
                placeholder="Folio fiscal que trae la factura del proveedor"
                value={folioProveedor}
                onChange={(e) => setFolioProveedor(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              />
              <p className="mt-1 text-[10px] text-carbon/50">
                Además de este folio, el sistema mantiene su consecutivo interno anual.
              </p>
            </div>
          )}

          {/* SECCIÓN ESTRUCTURADA: Producto, Metros y Costo por m2 */}
          <div className="rounded-xl border border-carbon/15 bg-slate-50/70 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-verde-profundo uppercase tracking-wider flex items-center gap-1.5">
                <span>🏷️</span> Producto y Costos por Metro Cuadrado
              </span>
              {catalogoProductos.length > 0 && (
                <div className="relative">
                  <select
                    onChange={(e) => {
                      if (e.target.value) handleSeleccionarProductoCatalogo(e.target.value);
                    }}
                    value=""
                    className="text-[11px] rounded-lg border border-carbon/20 bg-white px-2 py-1 text-carbon/70 outline-none hover:border-sauce"
                  >
                    <option value="">+ Catálogo de productos...</option>
                    {catalogoProductos.map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        {prod.nombre} ({prod.unidad})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Nombre del producto / partida */}
            <div>
              <label className="block text-[11px] font-semibold text-carbon/70 mb-1">
                Producto / Partida enlazada <span className="text-rojo">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Impermeabilizante 3.5 gravilla roja, mano de obra, lámina, etc."
                value={productoNombre}
                onChange={(e) => setProductoNombre(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              />
            </div>

            {/* Grid: Cantidad (m2), Unidad, Costo Unitario ($/m2) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-carbon/70 mb-1">
                  Cantidad (Metros) <span className="text-rojo">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ej. 120"
                    value={cantidad}
                    onChange={(e) => handleCantidadChange(e.target.value)}
                    className="w-full rounded-xl border border-carbon/20 bg-white px-3 py-2 text-sm font-mono text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-carbon/40 font-semibold">{unidad}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Unidad</label>
                <select
                  value={unidad}
                  onChange={(e) => setUnidad(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
                >
                  <option value="m2">m² (Metro cuadrado)</option>
                  <option value="ml">ml (Metro lineal)</option>
                  <option value="pza">pza (Pieza)</option>
                  <option value="lote">lote (Lote / Global)</option>
                  <option value="kg">kg (Kilogramo)</option>
                  <option value="bulto">bulto</option>
                  <option value="jornada">jornada</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-carbon/70 mb-1">
                  Costo por {unidad} ($ MXN)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm text-carbon/40">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={costoUnitario}
                    onChange={(e) => handleCostoUnitarioChange(e.target.value)}
                    className="w-full rounded-xl border border-carbon/20 bg-white pl-7 pr-3 py-2 text-sm font-mono text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
                  />
                </div>
              </div>
            </div>

            {/* Banner reactivo de cálculo de costo y monto */}
            <div className="rounded-lg bg-emerald-50 border border-emerald-200/80 px-3 py-2 text-xs flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 font-medium text-emerald-950">
                <span>🧮</span>
                <span>
                  {cantidadNum > 0 ? `${cantidadNum} ${unidad}` : `0 ${unidad}`} ×{" "}
                  {costoUnitNum > 0 ? `$${costoUnitNum.toFixed(2)}/${unidad}` : `$0.00/${unidad}`} =
                </span>
                <span className="font-bold text-emerald-800 font-mono text-sm">
                  ${montoNum > 0 ? montoNum.toLocaleString("es-MX", { minimumFractionDigits: 2 }) : "0.00"} MXN
                </span>
              </div>
              {cantidadNum > 0 && montoNum > 0 && (
                <span className="text-[11px] text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200 font-mono">
                  Precio unitario efectivo: ${(montoNum / cantidadNum).toFixed(2)}/{unidad}
                </span>
              )}
            </div>
          </div>

          {/* Fecha y Monto Total */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Fecha del Documento <span className="text-rojo">*</span>
              </label>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Monto Total ($ MXN) <span className="text-rojo">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm text-carbon/40">$</span>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => handleMontoChange(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 bg-white pl-7 pr-3 py-2 text-sm font-mono font-bold text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
                />
              </div>
            </div>
          </div>

          {/* Concepto / Descripción extendida */}
          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">
              Descripción / Concepto en Factura o Remisión
            </label>
            <input
              type="text"
              placeholder={productoNombre ? `Ej. ${productoNombre}` : "Descripción detallada del trabajo"}
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              className="w-full rounded-xl border border-carbon/20 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
            />
          </div>

          {/* Adjuntar Archivo */}
          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">
              Adjuntar Factura / Remisión (PDF o imagen, opcional)
            </label>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setArchivo(e.target.files?.[0] || null)}
              className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none transition focus:border-sauce file:mr-3 file:rounded-lg file:border-0 file:bg-sauce/10 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-sauce"
            />
            {editando && documentoExistente?.archivoNombre && !archivo && (
              <p className="mt-1 text-[11px] text-carbon/60 flex items-center gap-1">
                <span>📎</span> Archivo actual: <span className="font-semibold">{documentoExistente.archivoNombre}</span>
              </p>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">Notas Internas</label>
            <textarea
              rows={2}
              placeholder="Notas adicionales (opcional)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce resize-none bg-white"
            />
          </div>

          {/* Botones de acción */}
          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-carbon/10">
            <button
              type="button"
              disabled={guardando}
              onClick={onCerrar}
              className="rounded-xl border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon/70 hover:bg-carbon/5 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-xl bg-sauce px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-verde-profundo transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {guardando ? (
                <>Guardando...</>
              ) : editando ? (
                <>Guardar Cambios</>
              ) : (
                <>Registrar Documento</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
