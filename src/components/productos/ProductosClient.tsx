"use client";

import { useState, useTransition } from "react";
import type { 
  ProductoServicio, 
  Insumo, 
  FotoProducto, 
  ConceptoApuComposicion,
  InsumoHistorialPrecio 
} from "@/lib/types";
import {
  crearProductoServicio,
  editarProductoServicio,
  eliminarProductoServicio,
  obtenerProductoDetalleConApu,
  guardarComposicionApu,
  crearInsumo,
  editarInsumo,
  eliminarInsumo,
  obtenerHistorialPreciosInsumo,
  subirImagenProducto,
  subirFichaTecnicaProducto,
  type MetricaVentaProducto,
} from "@/app/actions/productos";

interface Props {
  productosIniciales: ProductoServicio[];
  insumosIniciales: Insumo[];
  centrosCosto: Array<{ id: string; nombre: string; descripcion: string }>;
  metricasVenta: {
    metricas: MetricaVentaProducto[];
    resumen: {
      totalUnidades: number;
      totalIngresos: number;
      totalCosto: number;
      totalUtilidad: number;
      margenPromedioPct: number;
    };
  };
}

export function ProductosClient({
  productosIniciales,
  insumosIniciales,
  centrosCosto,
  metricasVenta,
}: Props) {
  const [tabActiva, setTabActiva] = useState<"productos" | "insumos" | "reporte">("productos");

  // Estado Catálogo Productos
  const [productos, setProductos] = useState<ProductoServicio[]>(productosIniciales);
  const [busquedaProd, setBusquedaProd] = useState("");
  const [filtroTipoProd, setFiltroTipoProd] = useState("todos");
  const [filtroCentroCosto, setFiltroCentroCosto] = useState("todos");
  const [modoVistaProd, setModoVistaProd] = useState<"tabla" | "cuadricula">("tabla");
  const [modalProdAbierto, setModalProdAbierto] = useState(false);
  const [tabModalProd, setTabModalProd] = useState<"general" | "fotos" | "sofia" | "apu">("general");
  const [prodEditando, setProdEditando] = useState<ProductoServicio | null>(null);

  // Form Producto
  const [formNombre, setFormNombre] = useState("");
  const [formDescripcion, setFormDescripcion] = useState("");
  const [formTipo, setFormTipo] = useState<"servicio" | "producto" | "concepto_obra" | "insumo">("servicio");
  const [formCentroCostoId, setFormCentroCostoId] = useState("");
  const [formCategoria, setFormCategoria] = useState("General");
  const [formUnidad, setFormUnidad] = useState("m2");
  const [formCostoUnitario, setFormCostoUnitario] = useState("");
  const [formPrecioUnitario, setFormPrecioUnitario] = useState("");
  const [formPorcentajeComision, setFormPorcentajeComision] = useState("5.0");
  const [formGama, setFormGama] = useState<"economica" | "media" | "premium" | "estandar">("estandar");
  const [formDescripcionValor, setFormDescripcionValor] = useState("");
  const [formEspecificaciones, setFormEspecificaciones] = useState("");
  const [formAptoParaIa, setFormAptoParaIa] = useState(true);
  const [formFotos, setFormFotos] = useState<FotoProducto[]>([]);
  const [formTarifas, setFormTarifas] = useState<{ hastaLitros: string; precio: string }[]>([]);
  const [formFichaUrl, setFormFichaUrl] = useState("");
  const [formFichaNombre, setFormFichaNombre] = useState("");
  const [subiendoFicha, setSubiendoFicha] = useState(false);
  const [formComposicionApu, setFormComposicionApu] = useState<Array<{
    insumoId: string;
    insumoNombre: string;
    unidad: string;
    tipo: string;
    cantidad: number;
    desperdicioPct: number;
    rendimiento: number;
    costoUnitarioInsumo: number;
    importeCosto: number;
  }>>([]);

  // Subida de foto
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [tipoFotoNueva, setTipoFotoNueva] = useState<"producto" | "aplicacion">("aplicacion");
  const [tituloFotoNueva, setTituloFotoNueva] = useState("");

  // Estado Catálogo Insumos
  const [insumos, setInsumos] = useState<Insumo[]>(insumosIniciales);
  const [busquedaInsumo, setBusquedaInsumo] = useState("");
  const [filtroTipoInsumo, setFiltroTipoInsumo] = useState("todos");
  const [modalInsumoAbierto, setModalInsumoAbierto] = useState(false);
  const [insumoEditando, setInsumoEditando] = useState<Insumo | null>(null);

  // Form Insumo
  const [insCodigo, setInsCodigo] = useState("");
  const [insNombre, setInsNombre] = useState("");
  const [insTipo, setInsTipo] = useState<"material" | "mano_obra" | "herramienta_equipo" | "flete" | "subcontrato">("material");
  const [insUnidad, setInsUnidad] = useState("pza");
  const [insCostoProveedor, setInsCostoProveedor] = useState("");
  const [insPrecioInterno, setInsPrecioInterno] = useState("");
  const [insOficio, setInsOficio] = useState("");
  const [insNotas, setInsNotas] = useState("");
  const [insMotivoCambio, setInsMotivoCambio] = useState("");

  // Historial Insumo
  const [historialInsumo, setHistorialInsumo] = useState<InsumoHistorialPrecio[] | null>(null);
  const [modalHistorialAbierto, setModalHistorialAbierto] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);
  };

  // ============================================================
  // HANDLERS PRODUCTOS
  // ============================================================

  const handleOpenCrearProd = () => {
    setProdEditando(null);
    setFormNombre("");
    setFormDescripcion("");
    setFormTipo("servicio");
    setFormCentroCostoId(centrosCosto[0]?.id || "");
    setFormCategoria("General");
    setFormUnidad("m2");
    setFormCostoUnitario("");
    setFormPrecioUnitario("");
    setFormPorcentajeComision("5.0");
    setFormGama("estandar");
    setFormDescripcionValor("");
    setFormEspecificaciones("");
    setFormAptoParaIa(true);
    setFormFotos([]);
    setFormFichaUrl("");
    setFormFichaNombre("");
    setFormTarifas([]);
    setFormComposicionApu([]);
    setTabModalProd("general");
    setErrorMsg("");
    setModalProdAbierto(true);
  };

  const handleOpenEditarProd = async (p: ProductoServicio) => {
    setProdEditando(p);
    setFormNombre(p.nombre);
    setFormDescripcion(p.descripcion);
    setFormTipo(p.tipo || "servicio");
    setFormCentroCostoId(p.centroCostoId || "");
    setFormCategoria(p.categoria || "General");
    setFormUnidad(p.unidad);
    setFormCostoUnitario(String(p.costoUnitario));
    setFormPrecioUnitario(String(p.precioUnitario));
    setFormPorcentajeComision(String(p.porcentajeComision ?? 5.0));
    setFormGama(p.gama || "estandar");
    setFormDescripcionValor(p.descripcionValor || "");
    setFormEspecificaciones(p.especificaciones || "");
    setFormAptoParaIa(p.aptoParaIa !== false);
    setFormFotos(p.fotos || []);
    setFormFichaUrl(p.fichaTecnicaUrl || "");
    setFormTarifas((p.tarifasCapacidad || []).map((t) => ({ hastaLitros: String(t.hastaLitros), precio: t.precio === null ? "" : String(t.precio) })));
    setFormFichaNombre(p.fichaTecnicaNombre || "");
    setTabModalProd("general");
    setErrorMsg("");
    setModalProdAbierto(true);

    // Cargar receta APU si existe
    try {
      const detalle = await obtenerProductoDetalleConApu(p.id);
      if (detalle?.composicionApu) {
        setFormComposicionApu(
          detalle.composicionApu.map((item) => ({
            insumoId: item.insumoId,
            insumoNombre: item.insumo?.nombre || "Insumo",
            unidad: item.insumo?.unidad || "pza",
            tipo: item.insumo?.tipo || "material",
            cantidad: item.cantidad,
            desperdicioPct: item.desperdicioPct,
            rendimiento: item.rendimiento,
            costoUnitarioInsumo: item.costoUnitarioInsumo,
            importeCosto: item.importeCosto,
          }))
        );
      }
    } catch {
      // Ignorar si no tiene APU
    }
  };

  const handleGuardarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNombre.trim()) {
      setErrorMsg("El nombre del producto/servicio es obligatorio.");
      return;
    }

    try {
      setGuardando(true);
      setErrorMsg("");

      const payload = {
        nombre: formNombre.trim(),
        descripcion: formDescripcion.trim(),
        tipo: formTipo,
        centroCostoId: formCentroCostoId || null,
        categoria: formCategoria.trim(),
        unidad: formUnidad.trim(),
        costoUnitario: Number(formCostoUnitario || 0),
        precioUnitario: Number(formPrecioUnitario || 0),
        porcentajeComision: Number(formPorcentajeComision || 5.0),
        gama: formGama,
        descripcionValor: formDescripcionValor.trim(),
        especificaciones: formEspecificaciones.trim(),
        aptoParaIa: formAptoParaIa,
        fotos: formFotos,
        tarifasCapacidad: formTarifas
          .filter((t) => Number(t.hastaLitros) > 0)
          .map((t) => ({ hastaLitros: Math.round(Number(t.hastaLitros)), precio: t.precio.trim() === "" ? null : Number(t.precio) })),
        fichaTecnicaUrl: formFichaUrl || null,
        fichaTecnicaNombre: formFichaNombre || null,
      };

      let guardado: ProductoServicio;

      if (prodEditando) {
        guardado = await editarProductoServicio(prodEditando.id, payload);
        // Si hay receta APU, guardarla
        if (formTipo === "concepto_obra" && formComposicionApu.length > 0) {
          await guardarComposicionApu(
            guardado.id,
            formComposicionApu.map((it) => ({
              insumoId: it.insumoId,
              cantidad: it.cantidad,
              desperdicioPct: it.desperdicioPct,
              rendimiento: it.rendimiento,
              costoUnitarioInsumo: it.costoUnitarioInsumo,
              importeCosto: it.importeCosto,
            }))
          );
        }
        setProductos((prev) => prev.map((item) => (item.id === guardado.id ? guardado : item)));
      } else {
        guardado = await crearProductoServicio(payload);
        if (formTipo === "concepto_obra" && formComposicionApu.length > 0) {
          await guardarComposicionApu(
            guardado.id,
            formComposicionApu.map((it) => ({
              insumoId: it.insumoId,
              cantidad: it.cantidad,
              desperdicioPct: it.desperdicioPct,
              rendimiento: it.rendimiento,
              costoUnitarioInsumo: it.costoUnitarioInsumo,
              importeCosto: it.importeCosto,
            }))
          );
        }
        setProductos((prev) => [guardado, ...prev]);
      }

      setModalProdAbierto(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al guardar el producto.");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminarProducto = async (id: string) => {
    if (!window.confirm("¿Estás seguro de eliminar este producto del catálogo?")) return;
    try {
      await eliminarProductoServicio(id);
      setProductos((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      alert("Error al eliminar: " + err.message);
    }
  };

  const handleSubirArchivoFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSubiendoFoto(true);
      const fd = new FormData();
      fd.append("archivo", file);
      const res = await subirImagenProducto(fd);

      if (res.ok && res.url) {
        const nuevaFoto: FotoProducto = {
          url: res.url,
          tipo: tipoFotoNueva,
          titulo: tituloFotoNueva.trim() || (tipoFotoNueva === "aplicacion" ? "Obra terminada" : "Ficha de producto"),
        };
        setFormFotos((prev) => [...prev, nuevaFoto]);
        setTituloFotoNueva("");
      } else {
        alert("Error al subir imagen: " + (res.error || "Falla desconocida"));
      }
    } catch (err: any) {
      alert("Error al subir archivo: " + err.message);
    } finally {
      setSubiendoFoto(false);
      e.target.value = "";
    }
  };

  const handleSubirFichaTecnica = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setSubiendoFicha(true);
      const fd = new FormData();
      fd.append("archivo", file);
      const res = await subirFichaTecnicaProducto(fd);
      if (res.ok && res.url) {
        setFormFichaUrl(res.url);
        setFormFichaNombre(res.nombre || file.name);
      } else {
        alert("Error al subir la ficha técnica: " + (res.error || "Falla desconocida"));
      }
    } catch (err: any) {
      alert("Error al subir la ficha técnica: " + err.message);
    } finally {
      setSubiendoFicha(false);
      e.target.value = "";
    }
  };

  const handleEliminarFoto = (idx: number) => {
    setFormFotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // APU Receta Helpers
  const handleAgregarInsumoApu = (insumoId: string) => {
    const ins = insumos.find((i) => i.id === insumoId);
    if (!ins) return;

    // Verificar si ya está
    if (formComposicionApu.some((it) => it.insumoId === insumoId)) {
      alert("Este insumo ya está en la receta.");
      return;
    }

    const cUnit = ins.precioInterno > 0 ? ins.precioInterno : ins.costoProveedor;
    const nuevoItem = {
      insumoId: ins.id,
      insumoNombre: ins.nombre,
      unidad: ins.unidad,
      tipo: ins.tipo,
      cantidad: 1,
      desperdicioPct: ins.tipo === "material" ? 5 : 0,
      rendimiento: 1,
      costoUnitarioInsumo: cUnit,
      importeCosto: cUnit * (ins.tipo === "material" ? 1.05 : 1),
    };

    setFormComposicionApu((prev) => [...prev, nuevoItem]);
  };

  const handleUpdateItemApu = (
    index: number,
    campo: "cantidad" | "desperdicioPct" | "rendimiento" | "costoUnitarioInsumo",
    valor: number
  ) => {
    setFormComposicionApu((prev) => {
      const copy = [...prev];
      const it = { ...copy[index], [campo]: valor };
      const factorDesp = 1 + (Number(it.desperdicioPct || 0) / 100);
      const rend = Number(it.rendimiento || 1) <= 0 ? 1 : Number(it.rendimiento || 1);
      it.importeCosto = Math.round(((Number(it.cantidad || 1) / rend) * factorDesp * Number(it.costoUnitarioInsumo || 0)) * 100) / 100;
      copy[index] = it;

      // Recalcular costo unitario total en el form
      const totalCostoApu = copy.reduce((acc, curr) => acc + curr.importeCosto, 0);
      setFormCostoUnitario(String(Math.round(totalCostoApu * 100) / 100));

      return copy;
    });
  };

  const handleEliminarItemApu = (index: number) => {
    setFormComposicionApu((prev) => {
      const copy = prev.filter((_, i) => i !== index);
      const totalCostoApu = copy.reduce((acc, curr) => acc + curr.importeCosto, 0);
      setFormCostoUnitario(String(Math.round(totalCostoApu * 100) / 100));
      return copy;
    });
  };

  // ============================================================
  // HANDLERS INSUMOS
  // ============================================================

  const handleOpenCrearInsumo = () => {
    setInsumoEditando(null);
    setInsCodigo("");
    setInsNombre("");
    setInsTipo("material");
    setInsUnidad("pza");
    setInsCostoProveedor("");
    setInsPrecioInterno("");
    setInsOficio("");
    setInsNotas("");
    setInsMotivoCambio("");
    setErrorMsg("");
    setModalInsumoAbierto(true);
  };

  const handleOpenEditarInsumo = (ins: Insumo) => {
    setInsumoEditando(ins);
    setInsCodigo(ins.codigo || "");
    setInsNombre(ins.nombre);
    setInsTipo(ins.tipo);
    setInsUnidad(ins.unidad);
    setInsCostoProveedor(String(ins.costoProveedor));
    setInsPrecioInterno(String(ins.precioInterno));
    setInsOficio(ins.oficio || "");
    setInsNotas(ins.notas || "");
    setInsMotivoCambio("");
    setErrorMsg("");
    setModalInsumoAbierto(true);
  };

  const handleGuardarInsumo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insNombre.trim()) {
      setErrorMsg("El nombre del insumo es obligatorio.");
      return;
    }

    try {
      setGuardando(true);
      setErrorMsg("");

      const payload = {
        codigo: insCodigo.trim() || undefined,
        nombre: insNombre.trim(),
        tipo: insTipo,
        unidad: insUnidad.trim(),
        costoProveedor: Number(insCostoProveedor || 0),
        precioInterno: Number(insPrecioInterno || 0),
        oficio: insTipo === "mano_obra" ? insOficio || "albañil" : null,
        notas: insNotas.trim() || null,
        motivoCambio: insMotivoCambio.trim() || undefined,
      };

      if (insumoEditando) {
        const editado = await editarInsumo(insumoEditando.id, payload);
        setInsumos((prev) => prev.map((item) => (item.id === editado.id ? editado : item)));
      } else {
        const nuevo = await crearInsumo(payload);
        setInsumos((prev) => [nuevo, ...prev]);
      }

      setModalInsumoAbierto(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al guardar el insumo.");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminarInsumo = async (id: string) => {
    if (!window.confirm("¿Estás seguro de eliminar este insumo del catálogo base?")) return;
    try {
      await eliminarInsumo(id);
      setInsumos((prev) => prev.filter((i) => i.id !== id));
    } catch (err: any) {
      alert("Error al eliminar: " + err.message);
    }
  };

  const handleVerHistorialInsumo = async (ins: Insumo) => {
    try {
      setInsumoEditando(ins);
      const hist = await obtenerHistorialPreciosInsumo(ins.id);
      setHistorialInsumo(hist);
      setModalHistorialAbierto(true);
    } catch (err: any) {
      alert("Error al cargar historial: " + err.message);
    }
  };

  // Filtros Productos
  const productosFiltrados = productos.filter((p) => {
    const matchBusqueda =
      p.nombre.toLowerCase().includes(busquedaProd.toLowerCase()) ||
      p.id.toLowerCase().includes(busquedaProd.toLowerCase()) ||
      p.descripcion.toLowerCase().includes(busquedaProd.toLowerCase()) ||
      (p.categoria && p.categoria.toLowerCase().includes(busquedaProd.toLowerCase()));

    const matchTipo = filtroTipoProd === "todos" || p.tipo === filtroTipoProd;
    const matchCC = filtroCentroCosto === "todos" || p.centroCostoId === filtroCentroCosto;

    return matchBusqueda && matchTipo && matchCC;
  });

  // Filtros Insumos
  const insumosFiltrados = insumos.filter((i) => {
    const matchBusqueda =
      i.nombre.toLowerCase().includes(busquedaInsumo.toLowerCase()) ||
      (i.codigo && i.codigo.toLowerCase().includes(busquedaInsumo.toLowerCase())) ||
      (i.oficio && i.oficio.toLowerCase().includes(busquedaInsumo.toLowerCase()));

    const matchTipo = filtroTipoInsumo === "todos" || i.tipo === filtroTipoInsumo;

    return matchBusqueda && matchTipo;
  });

  return (
    <div className="space-y-6">
      {/* Selector de Pestañas Principales */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-carbon/10 pb-4">
        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-carbon/5 font-cuerpo text-xs font-semibold">
          <button
            onClick={() => setTabActiva("productos")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              tabActiva === "productos"
                ? "bg-white text-sauce shadow-sm font-bold"
                : "text-carbon/60 hover:text-carbon"
            }`}
          >
            <span>📦</span> Catálogo de Productos y Servicios
            <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-carbon/70">
              {productos.length}
            </span>
          </button>

          <button
            onClick={() => setTabActiva("insumos")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              tabActiva === "insumos"
                ? "bg-white text-sauce shadow-sm font-bold"
                : "text-carbon/60 hover:text-carbon"
            }`}
          >
            <span>🧱</span> Insumos Base (Materiales, Mano de Obra, Subcontratos)
            <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-carbon/70">
              {insumos.length}
            </span>
          </button>

          <button
            onClick={() => setTabActiva("reporte")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              tabActiva === "reporte"
                ? "bg-white text-sauce shadow-sm font-bold"
                : "text-carbon/60 hover:text-carbon"
            }`}
          >
            <span>📊</span> Ventas & Centros de Costo
          </button>
        </div>

        {tabActiva === "productos" && (
          <button
            onClick={handleOpenCrearProd}
            className="flex items-center gap-1.5 rounded-lg bg-sauce px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-verde-profundo transition font-cuerpo"
          >
            <span>+</span> Nuevo Producto / Concepto
          </button>
        )}

        {tabActiva === "insumos" && (
          <button
            onClick={handleOpenCrearInsumo}
            className="flex items-center gap-1.5 rounded-lg bg-verde-profundo px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sauce transition font-cuerpo"
          >
            <span>+</span> Nuevo Insumo Base
          </button>
        )}
      </div>

      {/* ============================================================ */}
      {/* PESTAÑA 1: CATÁLOGO DE PRODUCTOS Y SERVICIOS */}
      {/* ============================================================ */}
      {tabActiva === "productos" && (
        <div className="space-y-4">
          {/* Barra de Filtros y Selector de Modo de Vista */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-carbon/10 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar por código, nombre, categoría o beneficios..."
                  value={busquedaProd}
                  onChange={(e) => setBusquedaProd(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none font-cuerpo"
                />
                <span className="absolute left-3 top-2.5 text-xs text-carbon/40">🔍</span>
              </div>

              <div>
                <select
                  value={filtroCentroCosto}
                  onChange={(e) => setFiltroCentroCosto(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none font-cuerpo bg-white"
                >
                  <option value="todos">Todos los Centros de Costo</option>
                  {centrosCosto.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={filtroTipoProd}
                  onChange={(e) => setFiltroTipoProd(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none font-cuerpo bg-white"
                >
                  <option value="todos">Todos los Tipos</option>
                  <option value="servicio">Servicios (Impermeabilización, etc.)</option>
                  <option value="concepto_obra">Conceptos de Obra (APU)</option>
                  <option value="producto">Productos y Acabados</option>
                  <option value="insumo">Insumos de Venta Directa</option>
                </select>
              </div>
            </div>

            {/* Alternador de Modo de Vista: Filas (Excel) vs Cuadrícula (Tarjetas) */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-carbon/10 shrink-0 self-end lg:self-auto">
              <button
                type="button"
                onClick={() => setModoVistaProd("tabla")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  modoVistaProd === "tabla"
                    ? "bg-white text-sauce shadow-xs font-bold"
                    : "text-carbon/60 hover:text-carbon"
                }`}
                title="Vista estructurada en filas y columnas tipo Excel"
              >
                <span>📊</span>
                <span>Filas / Excel</span>
              </button>
              <button
                type="button"
                onClick={() => setModoVistaProd("cuadricula")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  modoVistaProd === "cuadricula"
                    ? "bg-white text-sauce shadow-xs font-bold"
                    : "text-carbon/60 hover:text-carbon"
                }`}
                title="Vista en cuadrícula de tarjetas"
              >
                <span>🎴</span>
                <span>Tarjetas</span>
              </button>
            </div>
          </div>

          {/* Visualización de Productos */}
          {productosFiltrados.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-xl border border-carbon/10 text-carbon/40 font-cuerpo text-sm">
              No se encontraron productos o servicios que coincidan con la búsqueda.
            </div>
          ) : modoVistaProd === "tabla" ? (
            /* Vista Retícula / Tabla tipo Excel */
            <div className="bg-white rounded-xl border border-carbon/10 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-100/90 border-b border-carbon/15 font-titular font-bold text-carbon/70 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-3 py-3 text-center w-14">Foto</th>
                      <th className="px-3.5 py-3 w-24">Código</th>
                      <th className="px-3.5 py-3 min-w-[240px]">Producto / Concepto</th>
                      <th className="px-3.5 py-3 min-w-[150px]">Centro de Costo / Cat.</th>
                      <th className="px-3.5 py-3 text-center min-w-[120px]">Gama & Sofía</th>
                      <th className="px-3.5 py-3 text-center w-16">Unidad</th>
                      <th className="px-3.5 py-3 text-right w-28">Costo Base</th>
                      <th className="px-3.5 py-3 text-center w-24">Margen</th>
                      <th className="px-3.5 py-3 text-right w-32">Precio Venta</th>
                      <th className="px-3.5 py-3 text-center w-20">Comisión</th>
                      <th className="px-3.5 py-3 text-center w-28">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-carbon/5 font-cuerpo text-carbon">
                    {productosFiltrados.map((p) => {
                      const fotoPrincipal = p.fotos?.[0]?.url;
                      const margen = p.precioUnitario > 0 
                        ? Math.round(((p.precioUnitario - p.costoUnitario) / p.precioUnitario) * 100) 
                        : 0;

                      return (
                        <tr 
                          key={p.id} 
                          className="hover:bg-sauce/5 transition-colors group"
                        >
                          {/* Foto miniatura */}
                          <td className="px-3 py-2 text-center">
                            {fotoPrincipal ? (
                              <img
                                src={fotoPrincipal}
                                alt={p.nombre}
                                className="h-10 w-10 rounded-lg object-cover mx-auto border border-carbon/10 shadow-2xs group-hover:scale-105 transition"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center mx-auto text-carbon/30 border border-carbon/5 text-sm" title="Sin foto">
                                🏗️
                              </div>
                            )}
                          </td>

                          {/* Código */}
                          <td className="px-3.5 py-2 font-mono font-bold text-sauce whitespace-nowrap">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs">
                              {p.id}
                            </span>
                          </td>

                          {/* Producto / Concepto */}
                          <td className="px-3.5 py-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEditarProd(p)}
                              className="font-bold text-carbon text-left hover:text-sauce transition leading-snug line-clamp-1 block text-[13px]"
                            >
                              {p.nombre}
                            </button>
                            <p className="text-[11px] text-carbon/50 line-clamp-1 font-cuerpo mt-0.5">
                              {p.descripcionValor || p.descripcion || "Sin descripción registrada"}
                            </p>
                          </td>

                          {/* Centro de Costo / Categoría */}
                          <td className="px-3.5 py-2 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5 items-start">
                              {p.centroCostoNombre ? (
                                <span className="rounded-md bg-verde-profundo/10 text-verde-profundo px-2 py-0.5 text-[10px] font-semibold">
                                  {p.centroCostoNombre}
                                </span>
                              ) : (
                                <span className="text-[10px] text-carbon/40 italic">General</span>
                              )}
                              {p.categoria && p.categoria !== "General" && (
                                <span className="rounded-md bg-slate-100 text-carbon/70 px-1.5 py-0.5 text-[10px]">
                                  {p.categoria}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Gama & Sofía (IA) */}
                          <td className="px-3.5 py-2 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase shadow-2xs ${
                                  p.gama === "premium"
                                    ? "bg-purple-100 text-purple-700 border border-purple-200"
                                    : p.gama === "media"
                                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                                    : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                }`}
                              >
                                {p.gama || "estándar"}
                              </span>
                              {p.aptoParaIa && (
                                <span
                                  className="rounded-md bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold flex items-center gap-0.5"
                                  title="Sofía (IA) puede consultar esta ficha para recomendarla a clientes"
                                >
                                  ✨ Sofía
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Unidad */}
                          <td className="px-3.5 py-2 text-center font-mono text-xs text-carbon/70 whitespace-nowrap">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5">
                              {p.unidad || "m2"}
                            </span>
                          </td>

                          {/* Costo Base */}
                          <td className="px-3.5 py-2 text-right font-mono text-xs text-carbon/70 whitespace-nowrap">
                            {formatMoneda(p.costoUnitario)}
                          </td>

                          {/* Margen */}
                          <td className="px-3.5 py-2 text-center whitespace-nowrap">
                            <span
                              className={`inline-block font-mono font-bold text-[11px] px-2 py-0.5 rounded-full ${
                                margen >= 30
                                  ? "bg-emerald-100 text-emerald-800"
                                  : margen > 0
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {margen}%
                            </span>
                          </td>

                          {/* Precio Venta */}
                          <td className="px-3.5 py-2 text-right font-mono font-bold text-sauce text-[13px] whitespace-nowrap">
                            {formatMoneda(p.precioUnitario)}
                          </td>

                          {/* Comisión Asesor */}
                          <td className="px-3.5 py-2 text-center font-mono text-xs text-carbon/60 whitespace-nowrap">
                            {p.porcentajeComision ? `${p.porcentajeComision}%` : "5%"}
                          </td>

                          {/* Acciones */}
                          <td className="px-3.5 py-2 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditarProd(p)}
                                className="rounded-lg bg-slate-100 hover:bg-sauce hover:text-white px-2.5 py-1 text-xs font-semibold text-carbon transition flex items-center gap-1 font-cuerpo"
                                title="Editar Ficha técnica y Análisis de Precios Unitarios (APU)"
                              >
                                <span>✏️</span>
                                <span>Ficha & APU</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEliminarProducto(p.id)}
                                className="rounded-lg bg-red-50 hover:bg-red-100 p-1 text-xs text-rojo transition"
                                title="Eliminar producto"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Resumen al pie de la tabla tipo Excel */}
                  <tfoot className="bg-slate-50/90 border-t border-carbon/10 font-mono text-xs text-carbon/70">
                    <tr>
                      <td colSpan={3} className="px-3.5 py-2.5 font-bold font-cuerpo">
                        Total: {productosFiltrados.length} concepto{productosFiltrados.length === 1 ? "" : "s"}
                      </td>
                      <td colSpan={3} className="px-3.5 py-2.5 text-center font-cuerpo text-[11px] text-carbon/50">
                        Estructura reticular tipo Excel
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-bold text-carbon/80 whitespace-nowrap">
                        {formatMoneda(
                          productosFiltrados.length > 0
                            ? productosFiltrados.reduce((acc, p) => acc + (p.costoUnitario || 0), 0) / productosFiltrados.length
                            : 0
                        )} <span className="text-[10px] text-carbon/40 font-normal">prom.</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-center font-bold text-emerald-700 whitespace-nowrap">
                        {productosFiltrados.length > 0
                          ? Math.round(
                              productosFiltrados.reduce((acc, p) => {
                                const m = p.precioUnitario > 0 ? ((p.precioUnitario - p.costoUnitario) / p.precioUnitario) * 100 : 0;
                                return acc + m;
                              }, 0) / productosFiltrados.length
                            )
                          : 0}% <span className="text-[10px] text-carbon/40 font-normal">prom.</span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-bold text-sauce whitespace-nowrap">
                        {formatMoneda(
                          productosFiltrados.length > 0
                            ? productosFiltrados.reduce((acc, p) => acc + (p.precioUnitario || 0), 0) / productosFiltrados.length
                            : 0
                        )} <span className="text-[10px] text-carbon/40 font-normal">prom.</span>
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {productosFiltrados.map((p) => {
                const fotoPrincipal = p.fotos?.[0]?.url;
                const margen = p.precioUnitario > 0 
                  ? Math.round(((p.precioUnitario - p.costoUnitario) / p.precioUnitario) * 100) 
                  : 0;

                return (
                  <div
                    key={p.id}
                    className="flex flex-col justify-between bg-white rounded-xl border border-carbon/10 shadow-xs hover:shadow-md transition overflow-hidden group"
                  >
                    <div>
                      {/* Imagen o Placeholder */}
                      <div className="relative h-40 w-full bg-slate-100 overflow-hidden border-b border-carbon/5">
                        {fotoPrincipal ? (
                          <img
                            src={fotoPrincipal}
                            alt={p.nombre}
                            className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        ) : (
                          <div className="h-full w-full flex flex-col items-center justify-center text-carbon/30 bg-slate-50">
                            <span className="text-3xl">🏗️</span>
                            <span className="text-[11px] font-mono mt-1 text-carbon/40">Sin fotos</span>
                          </div>
                        )}

                        {/* Badges superiores */}
                        <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
                          <span className="rounded-md bg-white/95 backdrop-blur-xs px-2 py-0.5 text-[10px] font-mono font-bold text-sauce shadow-xs">
                            {p.id}
                          </span>
                          {p.centroCostoNombre && (
                            <span className="rounded-md bg-verde-profundo/90 backdrop-blur-xs px-2 py-0.5 text-[10px] font-semibold text-white shadow-xs">
                              {p.centroCostoNombre}
                            </span>
                          )}
                        </div>

                        <div className="absolute top-2 right-2 flex gap-1">
                          {p.aptoParaIa && (
                            <span
                              className="rounded-md bg-amber-400 text-slate-900 px-1.5 py-0.5 text-[10px] font-bold shadow-xs flex items-center gap-1"
                              title="Sofía (IA) puede consultar esta ficha para recomendar y responder a clientes"
                            >
                              <span>✨</span> Sofía
                            </span>
                          )}
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase shadow-xs ${
                              p.gama === "premium"
                                ? "bg-purple-600 text-white"
                                : p.gama === "media"
                                ? "bg-blue-600 text-white"
                                : "bg-emerald-600 text-white"
                            }`}
                          >
                            {p.gama}
                          </span>
                        </div>
                      </div>

                      {/* Contenido */}
                      <div className="p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-titular font-bold text-base text-carbon leading-snug line-clamp-2">
                            {p.nombre}
                          </h3>
                        </div>

                        <p className="text-xs text-carbon/60 line-clamp-2 font-cuerpo">
                          {p.descripcionValor || p.descripcion || "Sin descripción registrada."}
                        </p>

                        <div className="flex items-center gap-2 pt-1">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-carbon/70 font-mono">
                            Unidad: {p.unidad}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-carbon/70 font-cuerpo">
                            {p.categoria || "General"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Precios y Acciones */}
                    <div className="p-4 pt-0">
                      <div className="flex items-center justify-between border-t border-carbon/5 pt-3 mb-3 font-mono text-xs">
                        <div>
                          <span className="text-[10px] text-carbon/40 block">Costo Base</span>
                          <span className="font-semibold text-carbon/70">
                            {formatMoneda(p.costoUnitario)}
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="text-[10px] text-carbon/40 block">Margen</span>
                          <span
                            className={`font-bold ${
                              margen >= 30 ? "text-emerald-600" : "text-amber-600"
                            }`}
                          >
                            {margen}%
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-carbon/40 block">Precio Venta</span>
                          <span className="font-bold text-sauce text-sm">
                            {formatMoneda(p.precioUnitario)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEditarProd(p)}
                          className="flex-1 rounded-lg bg-slate-100 hover:bg-slate-200 py-1.5 text-xs font-semibold text-carbon transition text-center font-cuerpo"
                        >
                          ✏️ Ficha & APU
                        </button>
                        <button
                          onClick={() => handleEliminarProducto(p.id)}
                          className="rounded-lg bg-red-50 hover:bg-red-100 px-2.5 py-1.5 text-xs text-rojo transition"
                          title="Eliminar del catálogo"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* PESTAÑA 2: INSUMOS BASE (APU) */}
      {/* ============================================================ */}
      {tabActiva === "insumos" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3.5 rounded-xl border border-carbon/10 shadow-xs">
            <div className="relative sm:col-span-2">
              <input
                type="text"
                placeholder="Buscar insumo por nombre, código de material u oficio..."
                value={busquedaInsumo}
                onChange={(e) => setBusquedaInsumo(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none font-cuerpo"
              />
              <span className="absolute left-3 top-2.5 text-xs text-carbon/40">🔍</span>
            </div>

            <div>
              <select
                value={filtroTipoInsumo}
                onChange={(e) => setFiltroTipoInsumo(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none font-cuerpo bg-white"
              >
                <option value="todos">Todos los Tipos de Insumo</option>
                <option value="material">Materiales</option>
                <option value="mano_obra">Mano de Obra (Jornales)</option>
                <option value="herramienta_equipo">Herramienta y Equipo</option>
                <option value="subcontrato">Subcontratos y Destajos</option>
                <option value="flete">Fletes y Acarreos</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-carbon/10 shadow-xs overflow-hidden">
            {insumosFiltrados.length === 0 ? (
              <div className="p-12 text-center text-carbon/40 font-cuerpo text-sm">
                No hay insumos registrados que coincidan con la búsqueda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 border-b border-carbon/10 font-titular font-semibold text-carbon/60 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Insumo</th>
                      <th className="px-4 py-3">Tipo / Oficio</th>
                      <th className="px-4 py-3 text-center">Unidad</th>
                      <th className="px-4 py-3 text-right">Costo Proveedor</th>
                      <th className="px-4 py-3 text-right">Precio Interno</th>
                      <th className="px-4 py-3 text-center">Historial</th>
                      <th className="px-4 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-carbon/5 font-cuerpo text-carbon">
                    {insumosFiltrados.map((ins) => (
                      <tr key={ins.id} className="hover:bg-slate-50/60 transition">
                        <td className="px-4 py-3 font-mono font-bold text-sauce">
                          {ins.codigo || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-carbon">{ins.nombre}</p>
                          {ins.notas && (
                            <p className="text-[11px] text-carbon/50 line-clamp-1">{ins.notas}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              ins.tipo === "mano_obra"
                                ? "bg-amber-100 text-amber-800"
                                : ins.tipo === "material"
                                ? "bg-emerald-100 text-emerald-800"
                                : ins.tipo === "subcontrato"
                                ? "bg-indigo-100 text-indigo-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {ins.tipo.replace("_", " ")}
                            {ins.oficio ? ` (${ins.oficio})` : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono">{ins.unidad}</td>
                        <td className="px-4 py-3 text-right font-mono text-carbon/80">
                          {formatMoneda(ins.costoProveedor)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-verde-profundo">
                          {formatMoneda(ins.precioInterno)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleVerHistorialInsumo(ins)}
                            className="text-[11px] text-sauce hover:underline font-semibold"
                          >
                            Ver Variaciones
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditarInsumo(ins)}
                              className="rounded-md bg-slate-100 hover:bg-slate-200 px-2 py-1 text-xs text-carbon transition"
                              title="Editar insumo"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleEliminarInsumo(ins.id)}
                              className="rounded-md bg-red-50 hover:bg-red-100 px-2 py-1 text-xs text-rojo transition"
                              title="Eliminar insumo"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* PESTAÑA 3: REPORTE DE VENTAS POR PRODUCTO Y CENTRO DE COSTOS */}
      {/* ============================================================ */}
      {tabActiva === "reporte" && (
        <div className="space-y-6">
          {/* Tarjetas KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-carbon/10 shadow-xs">
              <span className="text-xs text-carbon/50 font-cuerpo block">Unidades Desplazadas</span>
              <span className="text-2xl font-bold font-mono text-verde-profundo mt-1 block">
                {metricasVenta.resumen.totalUnidades.toLocaleString()}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-carbon/10 shadow-xs">
              <span className="text-xs text-carbon/50 font-cuerpo block">Ingresos Totales</span>
              <span className="text-2xl font-bold font-mono text-sauce mt-1 block">
                {formatMoneda(metricasVenta.resumen.totalIngresos)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-carbon/10 shadow-xs">
              <span className="text-xs text-carbon/50 font-cuerpo block">Costo de Insumos / Obra</span>
              <span className="text-2xl font-bold font-mono text-carbon/70 mt-1 block">
                {formatMoneda(metricasVenta.resumen.totalCosto)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-carbon/10 shadow-xs">
              <span className="text-xs text-carbon/50 font-cuerpo block">Utilidad Bruta Generada</span>
              <span className="text-2xl font-bold font-mono text-emerald-600 mt-1 block">
                {formatMoneda(metricasVenta.resumen.totalUtilidad)}
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 font-mono">
                {metricasVenta.resumen.margenPromedioPct}% margen promedio
              </span>
            </div>
          </div>

          {/* Tabla de Desplazamiento por Producto */}
          <div className="bg-white rounded-xl border border-carbon/10 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-carbon/10 flex items-center justify-between">
              <div>
                <h3 className="font-titular font-semibold text-base text-carbon">
                  Desplazamiento por Producto & Centro de Costos
                </h3>
                <p className="text-xs text-carbon/60 font-cuerpo mt-0.5">
                  Ventas confirmadas en cotizaciones aprobadas y aceptadas, cruzadas con su rentabilidad directa.
                </p>
              </div>
            </div>

            {metricasVenta.metricas.length === 0 ? (
              <div className="p-12 text-center text-carbon/40 font-cuerpo text-sm">
                Aún no hay cotizaciones aprobadas con conceptos vinculados al catálogo maestro.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 border-b border-carbon/10 font-titular font-semibold text-carbon/60 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Producto / Servicio</th>
                      <th className="px-4 py-3">Centro de Costo</th>
                      <th className="px-4 py-3 text-center">Unidades</th>
                      <th className="px-4 py-3 text-right">Ingresos</th>
                      <th className="px-4 py-3 text-right">Costo</th>
                      <th className="px-4 py-3 text-right">Utilidad Bruta</th>
                      <th className="px-4 py-3 text-center">Margen %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-carbon/5 font-cuerpo text-carbon">
                    {metricasVenta.metricas.map((m) => (
                      <tr key={m.productoId} className="hover:bg-slate-50/60 transition">
                        <td className="px-4 py-3 font-mono font-bold text-sauce">
                          {m.productoId}
                        </td>
                        <td className="px-4 py-3 font-semibold text-carbon">
                          {m.productoNombre}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-carbon font-semibold">
                            {m.centroCosto}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-bold">
                          {m.unidadesDesplazadas}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-verde-profundo">
                          {formatMoneda(m.ingresosTotales)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-carbon/60">
                          {formatMoneda(m.costoTotal)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                          {formatMoneda(m.utilidadBruta)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-mono font-bold ${
                              m.margenPct >= 30
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {m.margenPct}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL FICHA DE PRODUCTO ENRIQUECIDA */}
      {/* ============================================================ */}
      {modalProdAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Cabecera Modal */}
            <div className="px-6 py-4 bg-slate-50 border-b border-carbon/10 flex items-center justify-between">
              <div>
                <h2 className="font-titular text-lg font-bold text-verde-profundo">
                  {prodEditando ? `Editar Ficha: ${prodEditando.id}` : "Nuevo Producto o Concepto de Obra"}
                </h2>
                <p className="text-xs text-carbon/60 font-cuerpo mt-0.5">
                  Parametriza costos, galería de aplicaciones, argumentos de venta y receta APU.
                </p>
              </div>
              <button
                onClick={() => setModalProdAbierto(false)}
                className="text-carbon/40 hover:text-carbon p-1 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Pestañas del Modal */}
            <div className="flex border-b border-carbon/10 px-6 bg-slate-50/50 font-cuerpo text-xs font-semibold">
              <button
                onClick={() => setTabModalProd("general")}
                className={`py-3 px-4 border-b-2 transition ${
                  tabModalProd === "general"
                    ? "border-sauce text-sauce font-bold"
                    : "border-transparent text-carbon/60 hover:text-carbon"
                }`}
              >
                📋 Datos Generales & Precios
              </button>
              <button
                onClick={() => setTabModalProd("fotos")}
                className={`py-3 px-4 border-b-2 transition flex items-center gap-1.5 ${
                  tabModalProd === "fotos"
                    ? "border-sauce text-sauce font-bold"
                    : "border-transparent text-carbon/60 hover:text-carbon"
                }`}
              >
                🖼️ Fotos y Ejemplos de Obra
                {formFotos.length > 0 && (
                  <span className="rounded-full bg-sauce/15 px-1.5 py-0.2 text-[10px] text-sauce">
                    {formFotos.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTabModalProd("sofia")}
                className={`py-3 px-4 border-b-2 transition flex items-center gap-1.5 ${
                  tabModalProd === "sofia"
                    ? "border-sauce text-sauce font-bold"
                    : "border-transparent text-carbon/60 hover:text-carbon"
                }`}
              >
                ✨ Argumentos de Venta & Sofía
              </button>
              {formTipo === "concepto_obra" && (
                <button
                  onClick={() => setTabModalProd("apu")}
                  className={`py-3 px-4 border-b-2 transition flex items-center gap-1.5 ${
                    tabModalProd === "apu"
                      ? "border-sauce text-sauce font-bold"
                      : "border-transparent text-carbon/60 hover:text-carbon"
                  }`}
                >
                  🧱 Receta APU (Composición)
                  {formComposicionApu.length > 0 && (
                    <span className="rounded-full bg-verde-profundo/15 px-1.5 py-0.2 text-[10px] text-verde-profundo font-bold">
                      {formComposicionApu.length}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Formulario */}
            <form onSubmit={handleGuardarProducto} className="flex-1 overflow-y-auto p-6 space-y-4 font-cuerpo text-xs">
              {errorMsg && (
                <div className="rounded-lg bg-red-50 p-3 text-rojo border border-red-200">
                  {errorMsg}
                </div>
              )}

              {/* TAB GENERAL */}
              {tabModalProd === "general" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-carbon mb-1">
                        Nombre del Producto / Concepto *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Colocación de porcelanato rectificado 60x60"
                        value={formNombre}
                        onChange={(e) => setFormNombre(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-carbon mb-1">
                        Tipo de Entidad
                      </label>
                      <select
                        value={formTipo}
                        onChange={(e) => setFormTipo(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none bg-white"
                      >
                        <option value="servicio">Servicio (Impermeabilización, techado, etc.)</option>
                        <option value="concepto_obra">Concepto de Obra (con Receta APU)</option>
                        <option value="producto">Producto / Acabado Suministrado</option>
                        <option value="insumo">Insumo Ferretería</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-carbon mb-1">
                        Centro de Costos (Finanzas)
                      </label>
                      <select
                        value={formCentroCostoId}
                        onChange={(e) => setFormCentroCostoId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none bg-white"
                      >
                        <option value="">Sin centro asignado</option>
                        {centrosCosto.map((cc) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-carbon mb-1">
                        Categoría / Partida Típica
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Recubrimientos, Albañilería, Cancelería"
                        value={formCategoria}
                        onChange={(e) => setFormCategoria(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-carbon mb-1">
                        Unidad de Medida
                      </label>
                      <input
                        type="text"
                        placeholder="m2, ml, pza, salida, lote"
                        value={formUnidad}
                        onChange={(e) => setFormUnidad(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-carbon/10">
                    <div>
                      <label className="block font-semibold text-carbon mb-1">
                        Costo Directo Unitario ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formCostoUnitario}
                        onChange={(e) => setFormCostoUnitario(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none font-mono"
                      />
                      {formTipo === "concepto_obra" && formComposicionApu.length > 0 && (
                        <span className="text-[10px] text-sauce mt-1 block">
                          ⚡ Alimentado por receta APU
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block font-semibold text-carbon mb-1">
                        Precio Venta Sugerido ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formPrecioUnitario}
                        onChange={(e) => setFormPrecioUnitario(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none font-mono font-bold text-verde-profundo"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-carbon mb-1">
                        % Comisión Asesor
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={formPorcentajeComision}
                        onChange={(e) => setFormPorcentajeComision(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-carbon mb-1">
                        Gama de Acabado
                      </label>
                      <select
                        value={formGama}
                        onChange={(e) => setFormGama(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none bg-white font-semibold"
                      >
                        <option value="economica">Económica</option>
                        <option value="media">Media (Estándar)</option>
                        <option value="premium">Premium</option>
                        <option value="estandar">Sin gama específica</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-carbon mb-1">
                      Descripción Operativa
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Detalles sobre alcance, preparación de superficie o condiciones de instalación..."
                      value={formDescripcion}
                      onChange={(e) => setFormDescripcion(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* TAB FOTOS Y APLICACIONES */}
              {tabModalProd === "fotos" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-carbon/10 space-y-3">
                    <h4 className="font-semibold text-carbon">Subir Nueva Foto / Evidencia</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-carbon/60 text-[11px] mb-1">Tipo de Foto</label>
                        <select
                          value={tipoFotoNueva}
                          onChange={(e) => setTipoFotoNueva(e.target.value as any)}
                          className="w-full px-3 py-1.5 rounded-lg border border-carbon/20 bg-white"
                        >
                          <option value="aplicacion">Ejemplo de Obra Terminada</option>
                          <option value="producto">Foto de Producto / Muestra</option>
                          <option value="antes_despues">Antes y Después</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-carbon/60 text-[11px] mb-1">Título / Pie de Foto</label>
                        <input
                          type="text"
                          placeholder="Ej. Baño en Casa Campestre"
                          value={tituloFotoNueva}
                          onChange={(e) => setTituloFotoNueva(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-carbon/20"
                        >
                        </input>
                      </div>

                      <div>
                        <label className="block text-carbon/60 text-[11px] mb-1">Seleccionar Archivo</label>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={subiendoFoto}
                          onChange={handleSubirArchivoFoto}
                          className="w-full text-xs text-carbon/60 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-sauce file:text-white hover:file:bg-verde-profundo cursor-pointer"
                        />
                      </div>
                    </div>
                    {subiendoFoto && (
                      <p className="text-xs text-sauce animate-pulse">Subiendo imagen al servidor...</p>
                    )}
                  </div>

                  {/* Galería de Fotos del Producto */}
                  <div>
                    <h4 className="font-semibold text-carbon mb-2">Galería Actual ({formFotos.length})</h4>
                    {formFotos.length === 0 ? (
                      <div className="p-8 text-center text-carbon/40 bg-slate-50 rounded-xl border border-dashed border-carbon/20">
                        No hay fotos cargadas. Agrega fotos para que los asesores y Sofía puedan mostrarlas a los prospectos.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {formFotos.map((f, idx) => (
                          <div key={idx} className="relative rounded-lg overflow-hidden border border-carbon/15 group">
                            <img src={f.url} alt={f.titulo || "Foto"} className="h-28 w-full object-cover" />
                            <div className="p-2 bg-white text-[11px]">
                              <p className="font-semibold text-carbon truncate">{f.titulo || "Foto"}</p>
                              <span className="text-[10px] text-carbon/50 capitalize">{f.tipo}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleEliminarFoto(idx)}
                              className="absolute top-1 right-1 bg-red-600 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition shadow-sm"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB SOFIA Y VALOR */}
              {tabModalProd === "sofia" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
                    <div>
                      <span className="font-bold text-amber-900 block text-xs">
                        ✨ Apto para consulta de Sofía (IA)
                      </span>
                      <p className="text-[11px] text-amber-800 font-cuerpo mt-0.5">
                        Si está activado, Sofía podrá utilizar los argumentos, precios y fotos de este producto al responder a clientes.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formAptoParaIa}
                      onChange={(e) => setFormAptoParaIa(e.target.checked)}
                      className="h-5 w-5 text-sauce rounded-md cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-carbon mb-1">
                      Propuesta de Valor Comercial (Pitch para Cliente y Sofía)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Explica por qué le conviene este producto al cliente, problemas que resuelve, beneficios estéticos y ahorros..."
                      value={formDescripcionValor}
                      onChange={(e) => setFormDescripcionValor(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-carbon mb-1">
                      Ficha Técnica, Facts y Términos de Garantía
                    </label>
                    <textarea
                      rows={7}
                      placeholder="Un dato por línea. Ej.: Espesor 3.5 mm · Gravilla roja o gris · Garantía de 5 años por escrito. Sofía los usa para responder dudas técnicas."
                      value={formEspecificaciones}
                      onChange={(e) => setFormEspecificaciones(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none"
                    />
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-carbon/10 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-semibold text-carbon block">📏 Tarifas por capacidad (litros)</span>
                        <p className="text-[11px] text-carbon/60 mt-0.5">
                          Para servicios cuyo precio depende del tamaño (tinacos, cisternas). Sofía cotiza el primer escalón cuya capacidad
                          cubra los litros del cliente. Escalones sin precio se ignoran; si no hay tarifas usa el precio base.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFormTarifas((prev) => {
                            const existentes = new Set(prev.map((t) => Number(t.hastaLitros)));
                            const comunes = [450, 750, 1100, 1500, 2500, 5000].filter((l) => !existentes.has(l));
                            return [...prev, ...comunes.map((l) => ({ hastaLitros: String(l), precio: "" }))].sort((a, b) => Number(a.hastaLitros) - Number(b.hastaLitros));
                          })
                        }
                        className="shrink-0 rounded-lg border border-carbon/20 bg-white px-2.5 py-1 text-[11px] font-bold text-carbon/70 hover:text-sauce"
                      >
                        Cargar capacidades comunes
                      </button>
                    </div>
                    {formTarifas.length > 0 && (
                      <div className="space-y-1.5">
                        {formTarifas.map((t, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-[11px] text-carbon/60 w-14">Hasta</span>
                            <input
                              type="number"
                              min={1}
                              value={t.hastaLitros}
                              onChange={(e) => setFormTarifas((prev) => prev.map((x, i) => (i === idx ? { ...x, hastaLitros: e.target.value } : x)))}
                              className="w-28 px-2 py-1.5 rounded-lg border border-carbon/20 bg-white"
                            />
                            <span className="text-[11px] text-carbon/60">litros →  $</span>
                            <input
                              type="number"
                              min={0}
                              placeholder="Precio"
                              value={t.precio}
                              onChange={(e) => setFormTarifas((prev) => prev.map((x, i) => (i === idx ? { ...x, precio: e.target.value } : x)))}
                              className="w-32 px-2 py-1.5 rounded-lg border border-carbon/20 bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => setFormTarifas((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-[11px] font-bold text-rojo hover:underline"
                            >
                              Quitar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setFormTarifas((prev) => [...prev, { hastaLitros: "", precio: "" }])}
                      className="text-[11px] font-bold text-sauce hover:underline"
                    >
                      + Agregar escalón
                    </button>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-carbon/10 space-y-2">
                    <div>
                      <span className="font-semibold text-carbon block">📄 Ficha técnica en PDF</span>
                      <p className="text-[11px] text-carbon/60 mt-0.5">
                        Sofía solo la envía por WhatsApp si el cliente la pide y ya eligió (o preguntó por) este producto.
                      </p>
                    </div>
                    {formFichaUrl ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-white border border-carbon/15 px-3 py-2">
                        <a href={formFichaUrl} target="_blank" rel="noopener noreferrer" className="truncate font-semibold text-sauce hover:underline">
                          📎 {formFichaNombre || "Ficha técnica.pdf"}
                        </a>
                        <div className="flex items-center gap-3 shrink-0">
                          <label className="cursor-pointer text-[11px] font-bold text-carbon/70 hover:text-sauce">
                            Reemplazar
                            <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={subiendoFicha} onChange={handleSubirFichaTecnica} />
                          </label>
                          <button
                            type="button"
                            onClick={() => { setFormFichaUrl(""); setFormFichaNombre(""); }}
                            className="text-[11px] font-bold text-rojo hover:underline"
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={subiendoFicha}
                        onChange={handleSubirFichaTecnica}
                        className="block w-full text-xs text-carbon/70 file:mr-3 file:rounded-lg file:border-0 file:bg-sauce file:px-3 file:py-1.5 file:text-white file:font-semibold"
                      />
                    )}
                    {subiendoFicha && <p className="text-xs text-sauce animate-pulse">Subiendo PDF al servidor...</p>}
                  </div>
                </div>
              )}

              {/* TAB RECETA APU */}
              {tabModalProd === "apu" && formTipo === "concepto_obra" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-carbon/10">
                    <div>
                      <h4 className="font-semibold text-carbon">Desglose de Insumos Base (Receta APU)</h4>
                      <p className="text-[11px] text-carbon/60">
                        Define materiales (+ desperdicio) y mano de obra (+ rendimiento).
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAgregarInsumoApu(e.target.value);
                            e.target.value = "";
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg border border-carbon/20 bg-white font-cuerpo text-xs"
                      >
                        <option value="">+ Agregar Insumo...</option>
                        {insumos.map((i) => (
                          <option key={i.id} value={i.id}>
                            [{i.tipo}] {i.nombre} ({formatMoneda(i.precioInterno || i.costoProveedor)}/{i.unidad})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {formComposicionApu.length === 0 ? (
                    <div className="p-8 text-center text-carbon/40 bg-slate-50 rounded-xl border border-dashed border-carbon/20">
                      Este concepto aún no tiene insumos en su receta. Selecciona uno en el menú superior para armar el APU.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead className="bg-slate-100 font-semibold text-carbon/70 uppercase">
                          <tr>
                            <th className="px-3 py-2">Insumo</th>
                            <th className="px-3 py-2 text-center">Unidad</th>
                            <th className="px-3 py-2 text-right">Cant. Base</th>
                            <th className="px-3 py-2 text-right">% Desp.</th>
                            <th className="px-3 py-2 text-right">Rend. (U/J)</th>
                            <th className="px-3 py-2 text-right">Costo Unit.</th>
                            <th className="px-3 py-2 text-right">Importe</th>
                            <th className="px-3 py-2 text-center">Quitar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-carbon/5">
                          {formComposicionApu.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-medium text-carbon">
                                {item.insumoNombre}
                              </td>
                              <td className="px-3 py-2 text-center font-mono text-carbon/60">
                                {item.unidad}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  step="0.001"
                                  value={item.cantidad}
                                  onChange={(e) => handleUpdateItemApu(idx, "cantidad", Number(e.target.value))}
                                  className="w-20 px-2 py-1 text-right border rounded font-mono"
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  step="1"
                                  value={item.desperdicioPct}
                                  onChange={(e) => handleUpdateItemApu(idx, "desperdicioPct", Number(e.target.value))}
                                  className="w-16 px-2 py-1 text-right border rounded font-mono"
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  step="0.1"
                                  value={item.rendimiento}
                                  onChange={(e) => handleUpdateItemApu(idx, "rendimiento", Number(e.target.value))}
                                  className="w-20 px-2 py-1 text-right border rounded font-mono"
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {formatMoneda(item.costoUnitarioInsumo)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-sauce">
                                {formatMoneda(item.importeCosto)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleEliminarItemApu(idx)}
                                  className="text-rojo hover:text-red-800 p-1"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-100 font-bold border-t border-carbon/10">
                            <td colSpan={6} className="px-3 py-2 text-right">
                              Costo Unitario APU Resultante:
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-verde-profundo text-sm">
                              {formatMoneda(formComposicionApu.reduce((acc, c) => acc + c.importeCosto, 0))}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Botones de Acción */}
              <div className="pt-4 border-t border-carbon/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalProdAbierto(false)}
                  className="px-4 py-2 rounded-lg border border-carbon/20 font-semibold text-carbon/70 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 rounded-lg bg-sauce font-semibold text-white shadow-sm hover:bg-verde-profundo transition disabled:opacity-50"
                >
                  {guardando ? "Guardando..." : "Guardar Producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL CREAR / EDITAR INSUMO BASE */}
      {/* ============================================================ */}
      {modalInsumoAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-carbon/10 flex items-center justify-between">
              <h3 className="font-titular font-bold text-base text-verde-profundo">
                {insumoEditando ? `Editar Insumo: ${insumoEditando.nombre}` : "Nuevo Insumo Base"}
              </h3>
              <button
                onClick={() => setModalInsumoAbierto(false)}
                className="text-carbon/40 hover:text-carbon p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarInsumo} className="p-6 space-y-4 font-cuerpo text-xs">
              {errorMsg && (
                <div className="rounded-lg bg-red-50 p-3 text-rojo border border-red-200">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-carbon mb-1">Nombre del Insumo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Cemento Tolteca 50kg, Jornal Albañil oficial"
                    value={insNombre}
                    onChange={(e) => setInsNombre(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-carbon mb-1">Código Único</label>
                  <input
                    type="text"
                    placeholder="MAT-CEM-01"
                    value={insCodigo}
                    onChange={(e) => setInsCodigo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-carbon mb-1">Tipo de Insumo</label>
                  <select
                    value={insTipo}
                    onChange={(e) => setInsTipo(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none bg-white"
                  >
                    <option value="material">Material</option>
                    <option value="mano_obra">Mano de Obra</option>
                    <option value="herramienta_equipo">Herramienta y Equipo</option>
                    <option value="subcontrato">Subcontrato / Destajo</option>
                    <option value="flete">Flete / Acarreo</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-carbon mb-1">Unidad</label>
                  <input
                    type="text"
                    placeholder="bulto, m3, jornada, pza"
                    value={insUnidad}
                    onChange={(e) => setInsUnidad(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none font-mono"
                  />
                </div>

                {insTipo === "mano_obra" && (
                  <div>
                    <label className="block font-semibold text-carbon mb-1">Oficio</label>
                    <select
                      value={insOficio}
                      onChange={(e) => setInsOficio(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none bg-white"
                    >
                      <option value="albañil">Albañil</option>
                      <option value="ayudante">Ayudante General</option>
                      <option value="plomero">Plomero / Fontanero</option>
                      <option value="electricista">Electricista</option>
                      <option value="yesero">Yesero / Tablarroquero</option>
                      <option value="pintor">Pintor</option>
                      <option value="herrero">Herrero</option>
                      <option value="carpintero">Carpintero</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-carbon mb-1">Costo Proveedor ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={insCostoProveedor}
                    onChange={(e) => setInsCostoProveedor(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-carbon mb-1">Precio Interno ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={insPrecioInterno}
                    onChange={(e) => setInsPrecioInterno(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none font-mono font-bold text-verde-profundo"
                  />
                </div>

                {insumoEditando && (
                  <div className="col-span-2">
                    <label className="block font-semibold text-carbon mb-1">
                      Motivo del Cambio de Precio (Historial)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Alza de precio del proveedor Cemex"
                      value={insMotivoCambio}
                      onChange={(e) => setInsMotivoCambio(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none"
                    />
                  </div>
                )}

                <div className="col-span-2">
                  <label className="block font-semibold text-carbon mb-1">Notas / Rendimiento</label>
                  <textarea
                    rows={2}
                    placeholder="Notas técnicas o proveedor habitual..."
                    value={insNotas}
                    onChange={(e) => setInsNotas(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-carbon/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalInsumoAbierto(false)}
                  className="px-4 py-2 rounded-lg border border-carbon/20 font-semibold text-carbon/70 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 rounded-lg bg-verde-profundo font-semibold text-white shadow-sm hover:bg-sauce transition disabled:opacity-50"
                >
                  {guardando ? "Guardando..." : "Guardar Insumo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL HISTORIAL DE VARIACIONES DE PRECIO DE INSUMO */}
      {/* ============================================================ */}
      {modalHistorialAbierto && insumoEditando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-carbon/10 flex items-center justify-between">
              <div>
                <h3 className="font-titular font-bold text-sm text-verde-profundo">
                  Historial de Precios: {insumoEditando.nombre}
                </h3>
                <span className="text-[10px] text-carbon/50 font-mono">
                  {insumoEditando.codigo || "S/C"}
                </span>
              </div>
              <button
                onClick={() => setModalHistorialAbierto(false)}
                className="text-carbon/40 hover:text-carbon p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {!historialInsumo || historialInsumo.length === 0 ? (
                <div className="p-6 text-center text-carbon/40 font-cuerpo text-xs">
                  No hay registros de variación de precio para este insumo.
                </div>
              ) : (
                <div className="space-y-3 font-cuerpo text-xs">
                  {historialInsumo.map((h) => (
                    <div key={h.id} className="p-3 rounded-lg border border-carbon/10 bg-slate-50/50 space-y-1">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-carbon/50">
                          {new Date(h.fecha).toLocaleDateString()} {new Date(h.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="flex gap-2">
                          <span className="text-carbon/40 line-through">
                            {formatMoneda(h.costoAnterior)}
                          </span>
                          <span className="font-bold text-verde-profundo">
                            → {formatMoneda(h.costoNuevo)}
                          </span>
                        </div>
                      </div>
                      {h.motivo && (
                        <p className="text-[11px] text-carbon/70 italic">"{h.motivo}"</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-carbon/10 text-right">
              <button
                onClick={() => setModalHistorialAbierto(false)}
                className="px-4 py-1.5 rounded-lg bg-carbon/10 hover:bg-carbon/20 text-carbon text-xs font-semibold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
