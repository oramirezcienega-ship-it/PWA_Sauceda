"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatoPesos } from "@/lib/formato";
import type { DocumentoProveedor, MetricaProductoProveedor, Proveedor } from "@/lib/types";
import { actualizarProveedor, eliminarDocumentoProveedor } from "@/app/actions/proveedores";
import { ModalRegistrarDocumentoProveedor } from "./ModalRegistrarDocumentoProveedor";

interface DetalleProveedorProps {
  proveedorInicial: Proveedor;
  documentosIniciales: DocumentoProveedor[];
}

type TabProveedor = "documentos" | "catalogo_precios" | "evolucion_costos";

export function DetalleProveedor({ proveedorInicial, documentosIniciales }: DetalleProveedorProps) {
  const router = useRouter();
  const [proveedor, setProveedor] = useState<Proveedor>(proveedorInicial);
  const [documentos, setDocumentos] = useState<DocumentoProveedor[]>(documentosIniciales);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [documentoEnEdicion, setDocumentoEnEdicion] = useState<DocumentoProveedor | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [tabActual, setTabActual] = useState<TabProveedor>("documentos");

  // Filtros de tabla
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "remision" | "factura">("todos");
  const [filtroProductoEvolucion, setFiltroProductoEvolucion] = useState<string>("todos");

  // Métricas acumuladas calculadas en vivo
  const { montoTotal, totalMetros, costoPromedioPonderado, metricasProductos } = useMemo(() => {
    let mTotal = 0;
    let tMetros = 0;

    const agrupados: Record<
      string,
      {
        productoId: string | null;
        productoNombre: string;
        unidad: string;
        historial: Array<{
          id: string;
          fecha: string;
          costoUnitario: number;
          cantidad: number;
          monto: number;
          folio: string;
          ordenTrabajoFolio?: string | null;
          cotizacionId?: string | null;
          tipo: "remision" | "factura";
        }>;
      }
    > = {};

    for (const d of documentos) {
      const mont = Number(d.monto) || 0;
      mTotal += mont;

      const cant = d.cantidad !== null && d.cantidad !== undefined ? Number(d.cantidad) : 0;
      if (cant > 0) {
        tMetros += cant;
      }

      // Desglose de partidas si las tiene
      const partidas = Array.isArray(d.partidas) && d.partidas.length > 0 ? d.partidas : null;

      if (partidas) {
        for (const p of partidas) {
          const nombreProd = (p.descripcion || "Partida general").trim();
          const key = nombreProd.toLowerCase();
          if (!agrupados[key]) {
            agrupados[key] = {
              productoId: p.productoId || null,
              productoNombre: nombreProd,
              unidad: p.unidad || "m2",
              historial: [],
            };
          }
          const cUnit = Number(p.costoUnitario || 0);
          const pCant = Number(p.cantidad || 0);
          const pMont = Number(p.importe || (cUnit * pCant) || 0);

          agrupados[key].historial.push({
            id: d.id,
            fecha: d.fecha,
            costoUnitario: cUnit,
            cantidad: pCant,
            monto: pMont,
            folio: d.folio,
            ordenTrabajoFolio: d.ordenTrabajoFolio || null,
            cotizacionId: d.cotizacionId || null,
            tipo: d.tipo,
          });
        }
      } else {
        const nombreProd = (d.productoNombre || d.concepto || "Trabajo general").trim();
        const key = nombreProd.toLowerCase();
        if (!agrupados[key]) {
          agrupados[key] = {
            productoId: d.productoId || null,
            productoNombre: nombreProd,
            unidad: d.unidad || "m2",
            historial: [],
          };
        }

        let cUnit = d.costoUnitario !== null && d.costoUnitario !== undefined ? Number(d.costoUnitario) : 0;
        if (cUnit <= 0 && cant > 0 && mont > 0) {
          cUnit = Math.round((mont / cant) * 100) / 100;
        }

        agrupados[key].historial.push({
          id: d.id,
          fecha: d.fecha,
          costoUnitario: cUnit,
          cantidad: cant,
          monto: mont,
          folio: d.folio,
          ordenTrabajoFolio: d.ordenTrabajoFolio || null,
          cotizacionId: d.cotizacionId || null,
          tipo: d.tipo,
        });
      }
    }

    const cPromPond = tMetros > 0 ? Math.round((mTotal / tMetros) * 100) / 100 : 0;

    const metricas: MetricaProductoProveedor[] = Object.values(agrupados).map((item) => {
      const hist = item.historial.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      const ultimosPreciosValidos = hist.filter((h) => h.costoUnitario > 0);

      const ultimo = ultimosPreciosValidos[ultimosPreciosValidos.length - 1];
      const penultimo = ultimosPreciosValidos[ultimosPreciosValidos.length - 2];

      const precios = ultimosPreciosValidos.map((h) => h.costoUnitario);
      const ultimoPrecio = ultimo ? ultimo.costoUnitario : 0;
      const penultimoPrecio = penultimo ? penultimo.costoUnitario : ultimoPrecio;

      const precioPromedio =
        precios.length > 0
          ? Math.round((precios.reduce((acc, p) => acc + p, 0) / precios.length) * 100) / 100
          : 0;
      const precioMinimo = precios.length > 0 ? Math.min(...precios) : 0;
      const precioMaximo = precios.length > 0 ? Math.max(...precios) : 0;
      const totalCantidad = hist.reduce((acc, h) => acc + h.cantidad, 0);

      let tendencia: "subio" | "bajo" | "mantuvo" | "unico" = "unico";
      let diferenciaUltima = 0;

      if (penultimo && ultimo) {
        diferenciaUltima = Math.round((ultimoPrecio - penultimoPrecio) * 100) / 100;
        if (diferenciaUltima > 0.01) tendencia = "subio";
        else if (diferenciaUltima < -0.01) tendencia = "bajo";
        else tendencia = "mantuvo";
      }

      return {
        productoId: item.productoId,
        productoNombre: item.productoNombre,
        unidad: item.unidad,
        ultimoPrecio,
        precioPromedio,
        precioMinimo,
        precioMaximo,
        totalCantidad: Math.round(totalCantidad * 100) / 100,
        totalDocumentos: hist.length,
        ultimaFecha: hist[hist.length - 1]?.fecha || "",
        tendencia,
        diferenciaUltima,
        historial: hist,
      };
    });

    return {
      montoTotal: mTotal,
      totalMetros: tMetros,
      costoPromedioPonderado: cPromPond,
      metricasProductos: metricas.sort((a, b) => b.totalDocumentos - a.totalDocumentos),
    };
  }, [documentos]);

  // Lista de documentos filtrados
  const documentosFiltrados = useMemo(() => {
    return documentos.filter((d) => {
      if (filtroTipo !== "todos" && d.tipo !== filtroTipo) return false;
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const texto = [
          d.folio,
          d.folioProveedor,
          d.concepto,
          d.productoNombre,
          d.ordenTrabajoFolio,
          d.cotizacionId,
          d.notas,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    });
  }, [documentos, filtroTipo, busqueda]);

  // Eventos de evolución cronológica
  const eventosEvolucion = useMemo(() => {
    const todosEventos: Array<{
      id: string;
      fecha: string;
      productoNombre: string;
      unidad: string;
      costoUnitario: number;
      cantidad: number;
      monto: number;
      folio: string;
      ordenTrabajoFolio?: string | null;
      cotizacionId?: string | null;
      tipo: "remision" | "factura";
    }> = [];

    metricasProductos.forEach((m) => {
      if (filtroProductoEvolucion !== "todos" && m.productoNombre !== filtroProductoEvolucion) return;
      m.historial.forEach((h) => {
        todosEventos.push({
          ...h,
          productoNombre: m.productoNombre,
          unidad: m.unidad,
        });
      });
    });

    return todosEventos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [metricasProductos, filtroProductoEvolucion]);

  function handleDocumentoRegistrado(doc: DocumentoProveedor) {
    setDocumentos((prev) => {
      const existe = prev.some((d) => d.id === doc.id);
      return existe ? prev.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...prev];
    });
    router.refresh();
  }

  function handleEditarDocumento(doc: DocumentoProveedor) {
    setDocumentoEnEdicion(doc);
    setModalAbierto(true);
  }

  async function handleEliminarDocumento(id: string) {
    if (!confirm("¿Eliminar este documento? Esta acción no se puede deshacer.")) return;
    try {
      await eliminarDocumentoProveedor(id);
      setDocumentos((prev) => prev.filter((d) => d.id !== id));
      router.refresh();
    } catch (err: any) {
      alert(err?.message || "No se pudo eliminar el documento.");
    }
  }

  async function handleToggleActivo() {
    setActualizando(true);
    try {
      await actualizarProveedor(proveedor.id, { activo: !proveedor.activo });
      setProveedor((prev) => ({ ...prev, activo: !prev.activo }));
      router.refresh();
    } catch (err: any) {
      alert(err?.message || "No se pudo actualizar el estatus del proveedor.");
    } finally {
      setActualizando(false);
    }
  }

  return (
    <div className="space-y-6 font-cuerpo">
      {/* HEADER PRINCIPAL */}
      <div className="bg-gradient-to-r from-verde-profundo via-[#1e3d30] to-sauce p-6 rounded-2xl text-white shadow-md flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs bg-crema/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              Expediente de Proveedor
            </span>
            {proveedor.categoria && (
              <span className="font-mono text-xs bg-white/15 px-2 py-0.5 rounded">{proveedor.categoria}</span>
            )}
            {!proveedor.activo && (
              <span className="font-mono text-xs bg-rojo/30 px-2 py-0.5 rounded">Inactivo</span>
            )}
          </div>
          <h2 className="font-titular text-2xl font-bold text-crema mt-1">{proveedor.nombre}</h2>
          {proveedor.razonSocial && <p className="text-xs text-crema/80 mt-0.5">{proveedor.razonSocial}</p>}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-crema/80 flex-wrap">
            {proveedor.contactoNombre && <span>👤 {proveedor.contactoNombre}</span>}
            {proveedor.telefono && <span>📞 {proveedor.telefono}</span>}
            {proveedor.email && <span>✉️ {proveedor.email}</span>}
            {proveedor.rfc && <span className="font-mono">RFC: {proveedor.rfc}</span>}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleToggleActivo}
            disabled={actualizando}
            className="rounded-xl bg-crema/15 hover:bg-crema/25 border border-crema/30 px-3.5 py-2.5 text-xs font-bold text-crema transition shadow-xs disabled:opacity-50"
          >
            {proveedor.activo ? "Marcar Inactivo" : "Marcar Activo"}
          </button>
          <div className="bg-white/10 px-4 py-3 rounded-xl border border-white/10 text-right">
            <div className="text-[10.5px] text-crema/70 uppercase font-bold tracking-wider">Total Acumulado Pagado</div>
            <div className="font-mono text-2xl font-bold text-dorado">{formatoPesos(montoTotal)}</div>
            <div className="text-[10px] text-crema/70 mt-0.5 uppercase font-medium">
              {documentos.length} documento(s) registrados
            </div>
          </div>
        </div>
      </div>

      {/* TARJETAS DE INDICADORES / MÉTRICAS DE EXPEDIENTE */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white border border-carbon/10 p-3.5 shadow-2xs">
          <div className="text-[10px] uppercase font-bold text-carbon/50 tracking-wider">Metros Instalados</div>
          <div className="font-mono text-xl font-bold text-verde-profundo mt-0.5">
            {totalMetros.toLocaleString("es-MX", { maximumFractionDigits: 1 })}{" "}
            <span className="text-xs font-normal text-carbon/60">m²</span>
          </div>
          <div className="text-[10px] text-carbon/50 mt-1">Superficie total trabajada</div>
        </div>

        <div className="rounded-xl bg-white border border-carbon/10 p-3.5 shadow-2xs">
          <div className="text-[10px] uppercase font-bold text-carbon/50 tracking-wider">Costo Promedio m²</div>
          <div className="font-mono text-xl font-bold text-sauce mt-0.5">
            {costoPromedioPonderado > 0 ? `$${costoPromedioPonderado.toFixed(2)}` : "—"}{" "}
            <span className="text-xs font-normal text-carbon/60">/m²</span>
          </div>
          <div className="text-[10px] text-carbon/50 mt-1">Promedio ponderado global</div>
        </div>

        <div className="rounded-xl bg-white border border-carbon/10 p-3.5 shadow-2xs">
          <div className="text-[10px] uppercase font-bold text-carbon/50 tracking-wider">Partidas / Productos</div>
          <div className="font-mono text-xl font-bold text-carbon mt-0.5">{metricasProductos.length}</div>
          <div className="text-[10px] text-carbon/50 mt-1">Variedades o conceptos trabajados</div>
        </div>

        <div className="rounded-xl bg-white border border-carbon/10 p-3.5 shadow-2xs">
          <div className="text-[10px] uppercase font-bold text-carbon/50 tracking-wider">Folios Registrados</div>
          <div className="font-mono text-xl font-bold text-indigo-700 mt-0.5">
            {documentos.length}{" "}
            <span className="text-xs font-normal text-carbon/50">
              ({documentos.filter((d) => d.tipo === "factura").length} fact / {documentos.filter((d) => d.tipo === "remision").length} rem)
            </span>
          </div>
          <div className="text-[10px] text-carbon/50 mt-1">Historial contable y fiscal</div>
        </div>
      </div>

      {proveedor.notas && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-carbon/80">
          <span className="font-bold uppercase text-[10px] text-amber-800">Notas del Proveedor: </span>
          {proveedor.notas}
        </div>
      )}

      {/* PANELES Y PESTAÑAS DEL EXPEDIENTE */}
      <div className="bg-white rounded-2xl border border-carbon/10 shadow-sm overflow-hidden">
        {/* BARRA DE PESTAÑAS */}
        <div className="flex border-b border-carbon/10 bg-slate-50/70 px-4 pt-3 gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setTabActual("documentos")}
            className={`pb-3 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              tabActual === "documentos"
                ? "border-sauce text-verde-profundo bg-white rounded-t-lg shadow-2xs"
                : "border-transparent text-carbon/60 hover:text-carbon"
            }`}
          >
            <span>📄</span> Facturas y Remisiones
            <span className="ml-1 rounded-full bg-carbon/10 px-1.5 py-0.2 text-[10px] font-mono">
              {documentos.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTabActual("catalogo_precios")}
            className={`pb-3 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              tabActual === "catalogo_precios"
                ? "border-sauce text-verde-profundo bg-white rounded-t-lg shadow-2xs"
                : "border-transparent text-carbon/60 hover:text-carbon"
            }`}
          >
            <span>🏷️</span> Precios por Partida / Producto
            <span className="ml-1 rounded-full bg-carbon/10 px-1.5 py-0.2 text-[10px] font-mono">
              {metricasProductos.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTabActual("evolucion_costos")}
            className={`pb-3 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
              tabActual === "evolucion_costos"
                ? "border-sauce text-verde-profundo bg-white rounded-t-lg shadow-2xs"
                : "border-transparent text-carbon/60 hover:text-carbon"
            }`}
          >
            <span>📈</span> Evolución de Costos y Trazabilidad
          </button>
        </div>

        <div className="p-6">
          {/* TAB 1: FACTURAS Y REMISIONES */}
          {tabActual === "documentos" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
                <div>
                  <h3 className="font-titular text-base font-bold text-verde-profundo">
                    Historial de Facturas y Remisiones
                  </h3>
                  <p className="text-xs text-carbon/60">
                    Documentos entregados con producto estructurado, cantidad en m² y costo unitario pactado.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    placeholder="Buscar folio, producto o cliente..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce w-56"
                  />
                  <select
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value as any)}
                    className="rounded-lg border border-carbon/20 px-2.5 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                  >
                    <option value="todos">Todos los tipos</option>
                    <option value="remision">Solo Remisiones</option>
                    <option value="factura">Solo Facturas</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setDocumentoEnEdicion(null);
                      setModalAbierto(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sauce px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-verde-profundo transition shrink-0"
                  >
                    <span>📄</span> + Registrar Documento
                  </button>
                </div>
              </div>

              {documentosFiltrados.length === 0 ? (
                <div className="rounded-xl border border-dashed border-carbon/20 p-10 text-center">
                  <div className="text-3xl mb-2">📄</div>
                  <p className="text-xs text-carbon/60">
                    {busqueda || filtroTipo !== "todos"
                      ? "No se encontraron documentos con los filtros seleccionados."
                      : "Este proveedor aún no tiene facturas ni remisiones registradas."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-carbon/10">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-carbon/10 bg-slate-50 text-carbon/70 uppercase tracking-wider font-semibold">
                        <th className="py-3 px-3">Tipo & Folio</th>
                        <th className="py-3 px-3">Fecha</th>
                        <th className="py-3 px-3">Orden / Cotización</th>
                        <th className="py-3 px-3">Producto / Partida</th>
                        <th className="py-3 px-3 text-right">Cantidad</th>
                        <th className="py-3 px-3 text-right">Costo Unitario</th>
                        <th className="py-3 px-3 text-right">Total ($ MXN)</th>
                        <th className="py-3 px-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-carbon/10">
                      {documentosFiltrados.map((d) => {
                        const cant = d.cantidad !== null && d.cantidad !== undefined ? Number(d.cantidad) : null;
                        const cUnit =
                          d.costoUnitario !== null && d.costoUnitario !== undefined
                            ? Number(d.costoUnitario)
                            : cant && cant > 0 && d.monto > 0
                            ? Math.round((d.monto / cant) * 100) / 100
                            : null;

                        return (
                          <tr key={d.id} className="hover:bg-sauce/5 transition-colors">
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`inline-block rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase ${
                                    d.tipo === "factura"
                                      ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                                      : "bg-amber-100 text-amber-800 border border-amber-200"
                                  }`}
                                >
                                  {d.tipo}
                                </span>
                                {d.origen === "automatico" && (
                                  <span
                                    className="rounded-full bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700"
                                    title="Generado automáticamente al concluir la orden de trabajo"
                                  >
                                    ⚡ auto
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-carbon/90 font-semibold mt-0.5">{d.folio || "—"}</div>
                              {d.tipo === "factura" && d.folioProveedor && (
                                <div className="text-[10px] text-carbon/50 font-mono">Prov: {d.folioProveedor}</div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-carbon/70 whitespace-nowrap">
                              {new Date(d.fecha).toLocaleDateString("es-MX")}
                            </td>
                            <td className="py-3 px-3">
                              {d.ordenTrabajoId ? (
                                <span className="font-mono font-semibold text-carbon/80 text-xs">
                                  {d.ordenTrabajoFolio || d.ordenTrabajoId}
                                </span>
                              ) : d.cotizacionId ? (
                                <Link
                                  href={`/construccion/${d.cotizacionId}`}
                                  className="text-sauce font-semibold hover:underline font-mono"
                                >
                                  {d.cotizacionId}
                                </Link>
                              ) : (
                                <span className="text-carbon/40 italic text-[11px]">Sin vincular</span>
                              )}
                            </td>
                            <td className="py-3 px-3 max-w-[240px]">
                              <div className="font-semibold text-carbon line-clamp-1" title={d.productoNombre || d.concepto}>
                                {d.productoNombre || d.concepto || "Trabajo general"}
                              </div>
                              {d.notas && (
                                <div className="text-[10px] text-carbon/50 line-clamp-1 italic">{d.notas}</div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                              {cant !== null && cant > 0 ? (
                                <span className="font-semibold text-carbon">
                                  {cant} <span className="text-[10px] text-carbon/50">{d.unidad || "m²"}</span>
                                </span>
                              ) : (
                                <span className="text-carbon/40 text-[10px]">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                              {cUnit !== null && cUnit > 0 ? (
                                <span className="text-emerald-800 font-semibold">
                                  ${cUnit.toFixed(2)}
                                  <span className="text-[10px] text-carbon/50">/{d.unidad || "m²"}</span>
                                </span>
                              ) : (
                                <span className="text-carbon/40 text-[10px]">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-rojo whitespace-nowrap">
                              {formatoPesos(d.monto)}
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {d.archivoUrl && (
                                  <a
                                    href={d.archivoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-md bg-white border border-carbon/20 px-2 py-1 text-[11px] font-semibold text-carbon/70 hover:border-sauce hover:text-sauce transition"
                                    title="Ver factura/remisión adjunta"
                                  >
                                    📎
                                  </a>
                                )}
                                <button
                                  onClick={() => handleEditarDocumento(d)}
                                  className="rounded-md bg-white border border-carbon/20 px-2 py-1 text-[11px] font-semibold text-carbon/70 hover:border-sauce hover:text-sauce transition"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleEliminarDocumento(d.id)}
                                  className="rounded-md bg-white border border-rojo/30 px-2 py-1 text-[11px] font-semibold text-rojo hover:bg-rojo/5 transition"
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CATÁLOGO DE PRECIOS POR PARTIDA */}
          {tabActual === "catalogo_precios" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-titular text-base font-bold text-verde-profundo">
                    Catálogo de Productos y Precios del Proveedor
                  </h3>
                  <p className="text-xs text-carbon/60">
                    Rastreo consolidado de cada partida trabajada, últimos precios pactados, promedios y rangos.
                  </p>
                </div>
                <span className="text-xs font-semibold text-carbon/60 bg-carbon/5 px-2.5 py-1 rounded-lg">
                  {metricasProductos.length} productos rastreados
                </span>
              </div>

              {metricasProductos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-carbon/20 p-10 text-center">
                  <div className="text-3xl mb-2">🏷️</div>
                  <p className="text-xs text-carbon/60">
                    Aún no hay partidas ni productos registrados con este proveedor. Registra una remisión o concluye una orden de trabajo para iniciar el expediente.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {metricasProductos.map((m) => (
                    <div
                      key={m.productoNombre}
                      className="rounded-xl border border-carbon/15 bg-white p-4 shadow-2xs hover:border-sauce/60 transition space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-carbon/70 px-2 py-0.5 rounded">
                              Partida
                            </span>
                            {m.tendencia === "subio" && (
                              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded flex items-center gap-0.5">
                                🔺 +${m.diferenciaUltima.toFixed(2)}/{m.unidad} vs previa
                              </span>
                            )}
                            {m.tendencia === "bajo" && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-0.5">
                                🟢 -${Math.abs(m.diferenciaUltima).toFixed(2)}/{m.unidad} vs previa
                              </span>
                            )}
                            {m.tendencia === "mantuvo" && (
                              <span className="text-[10px] font-semibold text-carbon/60 bg-carbon/5 px-2 py-0.5 rounded">
                                ➖ Precio estable
                              </span>
                            )}
                          </div>
                          <h4 className="font-titular font-bold text-sm text-carbon mt-1">{m.productoNombre}</h4>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[10px] uppercase font-bold text-carbon/50">Último Precio</div>
                          <div className="font-mono text-lg font-bold text-verde-profundo">
                            {m.ultimoPrecio > 0 ? `$${m.ultimoPrecio.toFixed(2)}` : "—"}
                            <span className="text-[10px] font-normal text-carbon/50">/{m.unidad}</span>
                          </div>
                        </div>
                      </div>

                      {/* Métricas del producto */}
                      <div className="grid grid-cols-3 gap-2 bg-slate-50/70 p-2.5 rounded-lg border border-carbon/10 text-xs">
                        <div>
                          <span className="block text-[10px] text-carbon/50 uppercase font-semibold">Promedio</span>
                          <span className="font-mono font-bold text-carbon">
                            {m.precioPromedio > 0 ? `$${m.precioPromedio.toFixed(2)}` : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-carbon/50 uppercase font-semibold">Rango Mín - Máx</span>
                          <span className="font-mono text-[11px] text-carbon/80 font-medium">
                            ${m.precioMinimo.toFixed(2)} - ${m.precioMaximo.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-carbon/50 uppercase font-semibold">Volumen Total</span>
                          <span className="font-mono font-bold text-carbon">
                            {m.totalCantidad} {m.unidad}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-carbon/60 pt-1 border-t border-carbon/10">
                        <span>
                          {m.totalDocumentos} orden(es) registrada(s) · Última: {new Date(m.ultimaFecha).toLocaleDateString("es-MX")}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setFiltroProductoEvolucion(m.productoNombre);
                            setTabActual("evolucion_costos");
                          }}
                          className="text-sauce font-semibold hover:underline"
                        >
                          Ver evolución →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: EVOLUCIÓN DE COSTOS Y TRAZABILIDAD */}
          {tabActual === "evolucion_costos" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
                <div>
                  <h3 className="font-titular text-base font-bold text-verde-profundo">
                    Evolución Cronológica de Precios
                  </h3>
                  <p className="text-xs text-carbon/60">
                    Traza cómo han variado los precios por m² que ofrece este proveedor a través de las órdenes concluidas.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-carbon/70">Filtrar por Partida:</label>
                  <select
                    value={filtroProductoEvolucion}
                    onChange={(e) => setFiltroProductoEvolucion(e.target.value)}
                    className="rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                  >
                    <option value="todos">Todos los productos</option>
                    {metricasProductos.map((m) => (
                      <option key={m.productoNombre} value={m.productoNombre}>
                        {m.productoNombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {eventosEvolucion.length === 0 ? (
                <div className="rounded-xl border border-dashed border-carbon/20 p-10 text-center">
                  <div className="text-3xl mb-2">📈</div>
                  <p className="text-xs text-carbon/60">
                    No hay suficientes datos de precios para trazar la evolución histórica.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {eventosEvolucion.map((ev, index) => {
                    // Comparar con el evento anterior del mismo producto para calcular variación
                    const eventoPrevio = eventosEvolucion
                      .slice(index + 1)
                      .find((p) => p.productoNombre === ev.productoNombre && p.costoUnitario > 0);

                    let variacion = 0;
                    let variacionPct = 0;
                    if (eventoPrevio && eventoPrevio.costoUnitario > 0 && ev.costoUnitario > 0) {
                      variacion = Math.round((ev.costoUnitario - eventoPrevio.costoUnitario) * 100) / 100;
                      variacionPct = Math.round((variacion / eventoPrevio.costoUnitario) * 1000) / 10;
                    }

                    return (
                      <div
                        key={`${ev.id}-${index}`}
                        className="rounded-xl border border-carbon/15 bg-white p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 hover:border-sauce/50 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-carbon/70 font-mono font-bold text-xs">
                            {new Date(ev.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-sm text-carbon">{ev.productoNombre}</span>
                              <span className="font-mono text-[10px] bg-carbon/5 px-2 py-0.5 rounded text-carbon/70">
                                {ev.folio}
                              </span>
                              {ev.ordenTrabajoFolio && (
                                <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                                  OT: {ev.ordenTrabajoFolio}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-carbon/50 mt-0.5">
                              {new Date(ev.fecha).toLocaleDateString("es-MX", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}{" "}
                              · Cantidad: <span className="font-mono font-semibold">{ev.cantidad} {ev.unidad}</span> · Monto:{" "}
                              <span className="font-mono font-semibold">{formatoPesos(ev.monto)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-mono text-base font-bold text-verde-profundo">
                            {ev.costoUnitario > 0 ? `$${ev.costoUnitario.toFixed(2)}` : "—"}
                            <span className="text-[10px] font-normal text-carbon/50">/{ev.unidad}</span>
                          </div>
                          {variacion !== 0 && (
                            <div
                              className={`text-[10px] font-bold font-mono ${
                                variacion > 0 ? "text-rose-600" : "text-emerald-600"
                              }`}
                            >
                              {variacion > 0 ? `🔺 +$${variacion.toFixed(2)}` : `🟢 -$${Math.abs(variacion).toFixed(2)}`}{" "}
                              ({variacionPct > 0 ? `+${variacionPct}%` : `${variacionPct}%`})
                            </div>
                          )}
                          {eventoPrevio && variacion === 0 && (
                            <div className="text-[10px] text-carbon/50 font-medium">➖ Sin cambio</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ModalRegistrarDocumentoProveedor
        abierto={modalAbierto}
        onCerrar={() => {
          setModalAbierto(false);
          setDocumentoEnEdicion(null);
        }}
        onRegistrado={handleDocumentoRegistrado}
        proveedorId={proveedor.id}
        proveedorNombre={proveedor.nombre}
        documentoExistente={documentoEnEdicion}
      />
    </div>
  );
}
