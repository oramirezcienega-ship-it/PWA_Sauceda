"use client";

import { useState } from "react";
import {
  crearProductoServicio,
  editarProductoServicio,
  eliminarProductoServicio,
} from "@/app/actions/productos";
import type { ProductoServicio } from "@/lib/types";

interface TableroProductosProps {
  productosIniciales: ProductoServicio[];
}

const DEFAULT_WARRANTY_TEMPLATE = `SAUCEDA CONSTRUYE
CARTA DE GARANTÍA · IMPERMEABILIZACIÓN

Por la presente garantizamos los trabajos de impermeabilización que hemos instalado en la siguiente propiedad:

Obra: [NOMBRE DE LA PROPIEDAD / CLIENTE]
Ubicación: [DOMICILIO COMPLETO]
Fecha de aplicación: [DÍA] de [MES] de [AÑO]

Considerando que SAUCEDA Construye ha contratado para los trabajos de impermeabilización en esta propiedad, garantizamos que todos los trabajos realizados con impermeabilizante de la calidad especificada se mantendrán absolutamente impermeables durante el período de garantía establecido.

CONDICIONES DE GARANTÍA:

Período de cobertura
Los trabajos de impermeabilización se mantendrán absolutamente impermeables durante 10 años a partir de la fecha de aplicación.

Cobertura de defectos
Si se detecta cualquier defecto de mano de obra o material relacionado con los trabajos de impermeabilización, SAUCEDA Construye se compromete a rectificar dichas fallas sin cargo extra por servicios, mano de obra y materiales. Esto incluye trabajos de reparación de la superficie, limpieza y pruebas de humedad, de forma completa.

Decisión del cliente
El cliente tiene derecho a autorizar reparaciones o rectificaciones. Dichas reparaciones restablecerán la zona absolutamente impermeable y seca, sin signos de humedad en interiores de la construcción.

Tramitación de reclamaciones
SAUCEDA Construye se compromete a tramitar cualquier reclamación bajo garantía de forma rápida y justa. Para reportar un problema, contáctanos al +52 477 465 4700 o a través de WhatsApp.

Limitaciones de la garantía
SAUCEDA Construye no será responsable si:
- El trabajo es manipulado o la estructura es dañada deliberadamente.
- El sistema de impermeabilización se daña por contratación, agrietamiento por peso adicional, rasgaduras en trabajos externos, o cualquier calamidad natural fuera de nuestro control.
- En caso de infiltraciones por manipulación de la carpeta, SAUCEDA Construye se obliga a reparar la zona afectada con un cargo económico determinado según el daño provocado.

Mantenimiento preventivo
Para garantizar la cobertura completa de esta garantía, recomendamos realizar mantenimiento preventivo a los 6 años después de su aplicación. Consiste en la aplicación de resinas, sellado de traslapés, limpieza y destape de caídas pluviales libres de hojas y basura.

Profesionalismo
La instalación fue realizada por un aplicador previamente calificado y capacitado en técnicas de impermeabilización.

Esta garantía es válida únicamente en la propiedad especificada y no es transferible.

SAUCEDA Construye · Tradición con tecnología · +52 477 465 4700 · saucedamx.com`;

export function TableroProductos({ productosIniciales }: TableroProductosProps) {
  const [productos, setProductos] = useState<ProductoServicio[]>(productosIniciales);
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  // Form State
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [unidad, setUnidad] = useState("m2");
  const [costoUnitario, setCostoUnitario] = useState("");
  const [precioUnitario, setPrecioUnitario] = useState("");
  const [plantillaGarantia, setPlantillaGarantia] = useState("");
  const [cargando, setCargando] = useState(false);
  const [errorForm, setErrorForm] = useState("");

  const handleOpenCrear = () => {
    setEditandoId(null);
    setNombre("");
    setDescripcion("");
    setUnidad("m2");
    setCostoUnitario("");
    setPrecioUnitario("");
    setPlantillaGarantia(DEFAULT_WARRANTY_TEMPLATE);
    setErrorForm("");
    setModalAbierto(true);
  };

  const handleOpenEditar = (p: ProductoServicio) => {
    setEditandoId(p.id);
    setNombre(p.nombre);
    setDescripcion(p.descripcion);
    setUnidad(p.unidad);
    setCostoUnitario(String(p.costoUnitario));
    setPrecioUnitario(String(p.precioUnitario));
    setPlantillaGarantia(p.plantillaGarantia || DEFAULT_WARRANTY_TEMPLATE);
    setErrorForm("");
    setModalAbierto(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setErrorForm("El nombre es requerido.");
      return;
    }

    const cUnit = Number(costoUnitario) || 0;
    const pUnit = Number(precioUnitario) || 0;

    try {
      setCargando(true);
      setErrorForm("");

      if (editandoId) {
        // Editar
        const editado = await editarProductoServicio(editandoId, {
          nombre: nombre.trim(),
          descripcion: descripcion.trim(),
          unidad,
          costoUnitario: cUnit,
          precioUnitario: pUnit,
          plantillaGarantia: plantillaGarantia.trim(),
        });

        setProductos((prev) =>
          prev.map((p) => (p.id === editandoId ? editado : p))
        );
      } else {
        // Crear
        const nuevo = await crearProductoServicio({
          nombre: nombre.trim(),
          descripcion: descripcion.trim(),
          unidad,
          costoUnitario: cUnit,
          precioUnitario: pUnit,
          plantillaGarantia: plantillaGarantia.trim(),
        });

        setProductos((prev) => [nuevo, ...prev]);
      }

      setModalAbierto(false);
    } catch (err) {
      setErrorForm(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setCargando(false);
    }
  };

  const handleEliminar = async (id: string) => {
    const ok = window.confirm("¿Seguro que deseas eliminar este producto/servicio del catálogo?");
    if (!ok) return;

    try {
      const res = await eliminarProductoServicio(id);
      if (res.ok) {
        setProductos((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  const productosFiltrados = productos.filter(
    (p) =>
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.id.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.descripcion.toLowerCase().includes(busqueda.toLowerCase())
  );

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Barra de Herramientas */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-carbon/10 shadow-sm">
        <div className="flex flex-1 min-w-[280px] max-w-md relative">
          <input
            type="text"
            placeholder="Buscar por código, nombre o descripción..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none focus:ring-1 focus:ring-sauce font-cuerpo"
          />
          <svg
            className="w-5 h-5 absolute left-3 top-2.5 text-carbon/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <button
          onClick={handleOpenCrear}
          className="rounded-lg bg-sauce px-4 py-2 text-sm font-semibold text-white transition hover:bg-verde-profundo shadow-sm font-cuerpo"
        >
          + Nuevo Concepto
        </button>
      </div>

      {/* Tabla del Catálogo */}
      <div className="bg-white rounded-xl border border-carbon/10 shadow-sm overflow-hidden">
        {productosFiltrados.length === 0 ? (
          <div className="p-12 text-center text-carbon/40 font-cuerpo">
            No se encontraron productos o servicios en el catálogo.
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-250px)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10 border-b border-carbon/10 font-titular font-semibold text-carbon/60 text-xs uppercase tracking-wider shadow-sm">
                <tr>
                  <th className="px-6 py-4 w-[12%]">Código</th>
                  <th className="px-6 py-4 w-[30%]">Concepto / Nombre</th>
                  <th className="px-6 py-4 w-[25%]">Descripción</th>
                  <th className="px-6 py-4 text-center w-[8%]">Unidad</th>
                  <th className="px-6 py-4 text-right w-[10%]">Costo Int.</th>
                  <th className="px-6 py-4 text-right w-[10%]">Precio Venta</th>
                  <th className="px-6 py-4 text-center w-[5%]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon/5 font-cuerpo text-carbon">
                {productosFiltrados.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-mono font-bold text-sauce">{p.id}</td>
                    <td className="px-6 py-4 font-semibold text-verde-profundo">{p.nombre}</td>
                    <td className="px-6 py-4 text-xs text-carbon/60 truncate max-w-[200px]" title={p.descripcion}>
                      {p.descripcion || "—"}
                    </td>
                    <td className="px-6 py-4 text-center">{p.unidad}</td>
                    <td className="px-6 py-4 text-right font-mono text-carbon/75">{formatMoneda(p.costoUnitario)}</td>
                    <td className="px-6 py-4 text-right font-mono font-semibold text-verde-profundo">
                      {formatMoneda(p.precioUnitario)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenEditar(p)}
                          className="text-cielo hover:text-blue-800 text-xs font-semibold"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleEliminar(p.id)}
                          className="text-rojo hover:text-rose-800 text-xs font-semibold"
                          title="Eliminar"
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

      {/* Modal Agregar / Editar */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden border border-carbon/10 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-verde-profundo px-6 py-4 text-white flex justify-between items-center">
              <h3 className="font-titular text-lg font-semibold text-crema">
                {editandoId ? "Editar Concepto del Catálogo" : "Nuevo Concepto del Catálogo"}
              </h3>
              <button
                onClick={() => setModalAbierto(false)}
                className="text-crema/80 hover:text-crema text-xl"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleGuardar} className="p-6 space-y-4 font-cuerpo">
              {errorForm && (
                <div className="p-3 text-xs bg-rose-50 border border-rojo/30 rounded-lg text-rojo">
                  {errorForm}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">
                  Nombre del Producto / Servicio
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Impermeabilizante Fester 5 años rojo"
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">
                  Descripción Corta
                </label>
                <textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={2}
                  placeholder="Describa el rendimiento, materiales incluidos..."
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">
                    Unidad
                  </label>
                  <select
                    value={unidad}
                    onChange={(e) => setUnidad(e.target.value)}
                    className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                  >
                    <option value="m2">m²</option>
                    <option value="ml">ml</option>
                    <option value="pza">pza</option>
                    <option value="lote">lote</option>
                    <option value="m3">m³</option>
                    <option value="servicio">servicio</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">
                    Costo Int. Unit.
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={costoUnitario}
                    onChange={(e) => setCostoUnitario(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">
                    Precio Venta Unit.
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={precioUnitario}
                    onChange={(e) => setPrecioUnitario(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">
                  Plantilla de Carta de Garantía (Opcional)
                </label>
                <textarea
                  value={plantillaGarantia}
                  onChange={(e) => setPlantillaGarantia(e.target.value)}
                  rows={6}
                  placeholder={`Ej: CARTA DE GARANTÍA
Obra: [NOMBRE DE LA PROPIEDAD / CLIENTE]
Ubicación: [DOMICILIO COMPLETO]
Fecha: [DÍA] de [MES] de [AÑO]

Garantizamos este producto por 10 años...`}
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs focus:border-sauce focus:outline-none font-mono leading-relaxed"
                />
                <p className="text-[10px] text-carbon/40 mt-1">
                  Placeholders soportados: <strong>[NOMBRE DE LA PROPIEDAD / CLIENTE]</strong>, <strong>[DOMICILIO COMPLETO]</strong>, <strong>[DÍA]</strong>, <strong>[MES]</strong>, <strong>[AÑO]</strong>.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="rounded-lg border border-carbon/15 bg-white px-4 py-2 text-sm font-semibold text-carbon/70 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={cargando}
                  className="rounded-lg bg-sauce px-5 py-2 text-sm font-semibold text-white transition hover:bg-verde-profundo disabled:opacity-50"
                >
                  {cargando ? "Guardando..." : "Guardar Producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
