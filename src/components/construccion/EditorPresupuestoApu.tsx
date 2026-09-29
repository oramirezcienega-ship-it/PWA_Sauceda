"use client";

import { useEffect, useState, useTransition } from "react";
import type { 
  PresupuestoApuCompleto,
  CotizacionPartida, 
  CotizacionEspacio, 
  CotizacionConcepto,
  PlantillaEspacio,
  EsquemaPagoHito,
  ItemExplosionInsumo
} from "@/lib/types";
import {
  obtenerPresupuestoApuCompleto,
  listarPlantillasEspacios,
  generarEspacioDesdePlantilla,
  crearPartidaPresupuesto,
  agregarConceptoPresupuesto,
  actualizarConceptoPresupuesto,
  eliminarConceptoPresupuesto,
  cambiarGamaEspacio,
  guardarConfiguracionPresupuesto,
  obtenerExplosionInsumos,
} from "@/app/actions/presupuestos";
import { listarProductosServicios } from "@/app/actions/productos";

interface Props {
  cotizacionId: string;
  puedeEditar?: boolean;
  onActualizado?: (cot: any) => void;
}

export function EditorPresupuestoApu({ cotizacionId, puedeEditar = true, onActualizado }: Props) {
  const [cargando, setCargando] = useState(true);
  const [datosPresupuesto, setDatosPresupuesto] = useState<PresupuestoApuCompleto | null>(null);
  const [plantillas, setPlantillas] = useState<PlantillaEspacio[]>([]);
  const [catalogoConceptos, setCatalogoConceptos] = useState<any[]>([]);

  // Modales
  const [modalPlantillaAbierto, setModalPlantillaAbierto] = useState(false);
  const [modalPartidaAbierto, setModalPartidaAbierto] = useState(false);
  const [modalCascadaAbierto, setModalCascadaAbierto] = useState(false);
  const [modalExplosionAbierto, setModalExplosionAbierto] = useState(false);
  const [modalPagosAbierto, setModalPagosAbierto] = useState(false);

  // Form Plantilla
  const [slugPlantillaSeleccionada, setSlugPlantillaSeleccionada] = useState("bano_completo");
  const [nombreEspacioNuevo, setNombreEspacioNuevo] = useState("Baño Principal");
  const [largoEspacio, setLargoEspacio] = useState("2.40");
  const [anchoEspacio, setAnchoEspacio] = useState("1.80");
  const [altoEspacio, setAltoEspacio] = useState("2.40");
  const [gamaEspacio, setGamaEspacio] = useState<"economica" | "media" | "premium">("media");
  const [parametrosPlantilla, setParametrosPlantilla] = useState<Record<string, any>>({});

  // Form Nueva Partida
  const [nombrePartidaNueva, setNombrePartidaNueva] = useState("");

  // Form Cascada
  const [cascadaIndPct, setCascadaIndPct] = useState("5.0");
  const [cascadaImpPct, setCascadaImpPct] = useState("5.0");
  const [cascadaUtPct, setCascadaUtPct] = useState("20.0");
  const [cascadaIvaPct, setCascadaIvaPct] = useState("16.0");
  const [cascadaIncluyeIva, setCascadaIncluyeIva] = useState(false);
  const [cascadaAlcances, setCascadaAlcances] = useState("");
  const [cascadaExclusiones, setCascadaExclusiones] = useState("");

  // Esquema de Pagos Form
  const [esquemaPagosForm, setEsquemaPagosForm] = useState<EsquemaPagoHito[]>([]);

  // Explosión de Insumos Data
  const [explosionData, setExplosionData] = useState<{
    materiales: ItemExplosionInsumo[];
    manoDeObra: ItemExplosionInsumo[];
    herramientas: ItemExplosionInsumo[];
    subcontratos: ItemExplosionInsumo[];
    costoDirectoTotal: number;
  } | null>(null);

  const [procesando, setProcesando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);
  };

  const cargarDatos = async () => {
    try {
      setCargando(true);
      const [resPres, resPlant, resCat] = await Promise.all([
        obtenerPresupuestoApuCompleto(cotizacionId),
        listarPlantillasEspacios(),
        listarProductosServicios({ soloActivos: true }),
      ]);

      setDatosPresupuesto(resPres);
      setPlantillas(resPlant);
      setCatalogoConceptos(resCat);

      if (resPres) {
        setCascadaIndPct(String(resPres.cascada.indirectosPct));
        setCascadaImpPct(String(resPres.cascada.imprevistosPct));
        setCascadaUtPct(String(resPres.cascada.utilidadPct));
        setCascadaIvaPct(String(resPres.cascada.ivaPct));
        setCascadaIncluyeIva(resPres.cascada.incluyeIva);
        setCascadaAlcances(resPres.cotizacion.alcances || "");
        setCascadaExclusiones(resPres.cotizacion.exclusiones || "");
        setEsquemaPagosForm(resPres.esquemaPagos);
        if (onActualizado) onActualizado(resPres.cotizacion);
      }
    } catch (err: any) {
      setErrorMsg("Error al cargar presupuesto APU: " + err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [cotizacionId]);

  // Actualizar parámetros por defecto al cambiar la plantilla seleccionada
  useEffect(() => {
    const pl = plantillas.find((p) => p.slug === slugPlantillaSeleccionada);
    if (pl) {
      const initParams: Record<string, any> = {};
      for (const p of pl.parametrosSchema) {
        initParams[p.key] = p.default !== undefined ? p.default : (p.tipo === "boolean" ? false : 0);
      }
      setParametrosPlantilla(initParams);
      if (pl.slug === "bano_completo") setNombreEspacioNuevo("Baño Completo");
      if (pl.slug === "cocina") setNombreEspacioNuevo("Cocina Integral");
      if (pl.slug === "medio_bano") setNombreEspacioNuevo("Medio Baño Visitas");
      if (pl.slug === "cochera") setNombreEspacioNuevo("Cochera Techada");
    }
  }, [slugPlantillaSeleccionada, plantillas]);

  // ============================================================
  // HANDLERS
  // ============================================================

  const handleCrearEspacioPlantilla = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setProcesando(true);
      setErrorMsg("");

      await generarEspacioDesdePlantilla({
        cotizacionId,
        slugPlantilla: slugPlantillaSeleccionada,
        nombreEspacio: nombreEspacioNuevo,
        largo: parseFloat(largoEspacio) || 0,
        ancho: parseFloat(anchoEspacio) || 0,
        alto: parseFloat(altoEspacio) || 2.4,
        parametros: parametrosPlantilla,
        gama: gamaEspacio,
      });

      setModalPlantillaAbierto(false);
      await cargarDatos();
    } catch (err: any) {
      setErrorMsg(err.message || "Error al generar espacio desde plantilla.");
    } finally {
      setProcesando(false);
    }
  };

  const handleCrearPartida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombrePartidaNueva.trim()) return;

    try {
      setProcesando(true);
      await crearPartidaPresupuesto(cotizacionId, nombrePartidaNueva);
      setNombrePartidaNueva("");
      setModalPartidaAbierto(false);
      await cargarDatos();
    } catch (err: any) {
      alert("Error al crear partida: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleAgregarConceptoAPartida = async (partidaId: string, productoId?: string) => {
    try {
      const prod = catalogoConceptos.find((p) => p.id === productoId);
      const desc = prod ? prod.nombre : "Nuevo concepto de obra";
      const cUnit = prod ? prod.costoUnitario : 100;
      const pUnit = prod ? prod.precioUnitario : 150;
      const uni = prod ? prod.unidad : "m2";

      await agregarConceptoPresupuesto({
        cotizacionId,
        partidaId,
        productoServicioId: prod ? prod.id : null,
        descripcion: desc,
        cantidad: 1,
        unidad: uni,
        costoUnitario: cUnit,
        precioUnitario: pUnit,
      });

      await cargarDatos();
    } catch (err: any) {
      alert("Error al agregar concepto: " + err.message);
    }
  };

  const handleUpdateConceptoInline = async (
    conceptoId: string,
    campo: "cantidad" | "precioUnitario" | "costoUnitario" | "descripcion",
    valor: any
  ) => {
    try {
      await actualizarConceptoPresupuesto(conceptoId, {
        [campo]: valor,
      });
      // Actualizar estado local rápido
      await cargarDatos();
    } catch (err: any) {
      console.error("Error al actualizar concepto:", err);
    }
  };

  const handleEliminarConcepto = async (conceptoId: string) => {
    if (!window.confirm("¿Seguro de quitar este concepto del presupuesto?")) return;
    try {
      await eliminarConceptoPresupuesto(conceptoId);
      await cargarDatos();
    } catch (err: any) {
      alert("Error al eliminar concepto: " + err.message);
    }
  };

  const handleCambiarGamaEspacio = async (espacioId: string, nuevaGama: "economica" | "media" | "premium") => {
    try {
      setProcesando(true);
      await cambiarGamaEspacio(espacioId, nuevaGama);
      await cargarDatos();
    } catch (err: any) {
      alert("Error al cambiar gama: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleGuardarCascada = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setProcesando(true);
      await guardarConfiguracionPresupuesto(cotizacionId, {
        indirectosPct: parseFloat(cascadaIndPct) || 0,
        imprevistosPct: parseFloat(cascadaImpPct) || 0,
        utilidadPct: parseFloat(cascadaUtPct) || 0,
        ivaPct: parseFloat(cascadaIvaPct) || 0,
        incluyeIva: cascadaIncluyeIva,
        alcances: cascadaAlcances,
        exclusiones: cascadaExclusiones,
      });
      setModalCascadaAbierto(false);
      await cargarDatos();
    } catch (err: any) {
      alert("Error al guardar cascada: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  const handleAbrirExplosion = async () => {
    try {
      setProcesando(true);
      const res = await obtenerExplosionInsumos(cotizacionId);
      setExplosionData(res);
      setModalExplosionAbierto(true);
    } catch (err: any) {
      alert("Error al generar explosión de insumos: " + err.message);
    } finally {
      setProcesando(false);
    }
  };

  if (cargando && !datosPresupuesto) {
    return (
      <div className="p-12 text-center text-carbon/40 font-cuerpo text-sm animate-pulse">
        Cargando módulo de presupuestos APU...
      </div>
    );
  }

  if (!datosPresupuesto) {
    return (
      <div className="p-8 text-center text-rojo font-cuerpo text-sm">
        {errorMsg || "No se pudo cargar el presupuesto de obra."}
      </div>
    );
  }

  const { partidas, espacios, conceptos, cascada } = datosPresupuesto;

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/* BARRA SUPERIOR DE ACCIONES */}
      {/* ============================================================ */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-carbon/10 shadow-xs">
        <div>
          <span className="rounded-md bg-verde-profundo/10 text-verde-profundo font-mono text-xs font-bold px-2 py-0.5">
            Presupuestador Matricial APU
          </span>
          <h3 className="font-titular text-base font-bold text-carbon mt-1">
            Estructura por Espacios y Partidas de Obra
          </h3>
        </div>

        {puedeEditar && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setModalPlantillaAbierto(true)}
              className="flex items-center gap-1.5 rounded-xl bg-verde-profundo px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-sauce transition"
            >
              <span>📐</span> + Agregar Espacio (Plantilla)
            </button>

            <button
              onClick={() => setModalPartidaAbierto(true)}
              className="flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-2 text-xs font-semibold text-carbon transition"
            >
              <span>📁</span> + Nueva Partida Manual
            </button>

            <button
              onClick={() => setModalCascadaAbierto(true)}
              className="flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-2 text-xs font-semibold text-carbon transition"
            >
              <span>⚖️</span> Cascada & Márgenes
            </button>

            <button
              onClick={handleAbrirExplosion}
              className="flex items-center gap-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-3 py-2 text-xs font-bold transition shadow-xs"
              title="Ver listado consolidado de compras: materiales, jornales y subcontratos"
            >
              <span>💥</span> Explosión de Insumos
            </button>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* ESPACIOS LEVANTADOS & SELECTOR DE GAMAS */}
      {/* ============================================================ */}
      {espacios.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-titular text-xs uppercase tracking-wider font-bold text-carbon/60">
              Espacios Levantados ({espacios.length})
            </h4>
            <span className="text-[11px] text-carbon/50 font-cuerpo">
              Cambia la gama de acabado para ver el impacto en tiempo real
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {espacios.map((esp) => (
              <div
                key={esp.id}
                className="bg-white p-4 rounded-xl border border-carbon/10 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h5 className="font-titular font-bold text-carbon text-sm">{esp.nombre}</h5>
                    <span className="text-[10px] text-carbon/40 capitalize font-mono block">
                      {esp.tipoEspacio.replace("_", " ")}
                    </span>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-carbon/70">
                    {esp.largo}m × {esp.ancho}m
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-50 p-2 rounded-lg">
                  <div>
                    <span className="text-carbon/50 text-[10px] block">Piso</span>
                    <span className="font-bold text-carbon">{esp.m2Piso} m²</span>
                  </div>
                  <div>
                    <span className="text-carbon/50 text-[10px] block">Muros</span>
                    <span className="font-bold text-carbon">{esp.m2Muros} m²</span>
                  </div>
                </div>

                {/* Selector de Gama */}
                <div>
                  <span className="text-[10px] text-carbon/50 font-semibold block mb-1">
                    Gama de Acabados
                  </span>
                  <div className="flex rounded-lg bg-slate-100 p-0.5 border border-carbon/5 text-xs font-semibold">
                    {(["economica", "media", "premium"] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => handleCambiarGamaEspacio(esp.id, g)}
                        className={`flex-1 py-1 text-center rounded-md transition capitalize text-[11px] ${
                          esp.gamaSeleccionada === g
                            ? g === "premium"
                              ? "bg-purple-600 text-white font-bold shadow-xs"
                              : g === "media"
                              ? "bg-blue-600 text-white font-bold shadow-xs"
                              : "bg-emerald-600 text-white font-bold shadow-xs"
                            : "text-carbon/60 hover:text-carbon"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* HOJA DE CÁLCULO MATRICIAL AGRUPADA POR PARTIDAS */}
      {/* ============================================================ */}
      {partidas.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-carbon/10 shadow-xs">
          <p className="text-carbon/40 font-cuerpo text-sm mb-3">
            El presupuesto aún no tiene partidas registradas.
          </p>
          <button
            onClick={() => setModalPlantillaAbierto(true)}
            className="rounded-xl bg-verde-profundo px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-sauce transition"
          >
            ⚡ Generar Primer Espacio con Plantilla
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {partidas.map((partida, idxPartida) => {
            const conceptosPartida = conceptos.filter((c) => c.partidaId === partida.id);

            return (
              <div
                key={partida.id}
                className="bg-white rounded-2xl border border-carbon/10 shadow-xs overflow-hidden"
              >
                {/* Cabecera de Partida */}
                <div className="bg-slate-50/80 px-4 py-3 border-b border-carbon/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-carbon/10 text-carbon text-xs font-mono font-bold">
                      {idxPartida + 1}
                    </span>
                    <h4 className="font-titular font-bold text-sm text-verde-profundo">
                      {partida.nombre}
                    </h4>
                    <span className="text-[11px] text-carbon/40 font-mono">
                      ({conceptosPartida.length} conceptos)
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-right">
                      <span className="text-[10px] text-carbon/40 block">Costo Directo</span>
                      <span className="font-semibold text-carbon/70">
                        {formatMoneda(partida.subtotalCostoDirecto)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-carbon/40 block">Precio Cliente</span>
                      <span className="font-bold text-sauce">
                        {formatMoneda(partida.subtotalPrecioCliente)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tabla de Conceptos tipo Hoja de Cálculo */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-titular font-semibold text-carbon/50 uppercase tracking-wider border-b border-carbon/5">
                      <tr>
                        <th className="px-3 py-2 w-[35%]">Concepto / Unidad de Trabajo</th>
                        <th className="px-3 py-2 text-center w-[12%]">Espacio</th>
                        <th className="px-3 py-2 text-right w-[10%]">Cantidad</th>
                        <th className="px-3 py-2 text-center w-[6%]">Unidad</th>
                        <th className="px-3 py-2 text-right w-[11%]">Costo Unit.</th>
                        <th className="px-3 py-2 text-right w-[11%]">Precio Venta</th>
                        <th className="px-3 py-2 text-right w-[11%]">Importe Cliente</th>
                        <th className="px-3 py-2 text-center w-[4%]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-carbon/5 font-cuerpo">
                      {conceptosPartida.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-4 text-center text-carbon/40 italic">
                            Sin conceptos en esta partida. Agrega uno abajo.
                          </td>
                        </tr>
                      ) : (
                        conceptosPartida.map((c) => {
                          const espNombre = espacios.find((e) => e.id === c.espacioId)?.nombre || "General";
                          const margen = c.precioUnitario > 0 
                            ? Math.round(((c.precioUnitario - c.costoUnitario) / c.precioUnitario) * 100) 
                            : 0;

                          return (
                            <tr key={c.id} className="hover:bg-slate-50/60 transition group">
                              <td className="px-3 py-2.5">
                                <input
                                  type="text"
                                  disabled={!puedeEditar}
                                  defaultValue={c.descripcion}
                                  onBlur={(e) => {
                                    if (e.target.value !== c.descripcion) {
                                      handleUpdateConceptoInline(c.id, "descripcion", e.target.value);
                                    }
                                  }}
                                  className="w-full bg-transparent border-0 border-b border-transparent hover:border-carbon/20 focus:border-sauce focus:outline-none py-0.5 font-medium text-carbon text-xs"
                                />
                                {c.productoServicioId && (
                                  <span className="text-[10px] text-sauce font-mono">
                                    Ref: {c.productoServicioId}
                                  </span>
                                )}
                              </td>

                              <td className="px-3 py-2.5 text-center">
                                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-carbon/70 font-semibold truncate max-w-[120px] inline-block">
                                  {espNombre}
                                </span>
                              </td>

                              <td className="px-3 py-2.5 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  disabled={!puedeEditar}
                                  defaultValue={c.cantidad}
                                  onBlur={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    if (val !== c.cantidad) {
                                      handleUpdateConceptoInline(c.id, "cantidad", val);
                                    }
                                  }}
                                  className="w-20 bg-slate-50 border border-carbon/15 rounded px-1.5 py-0.5 text-right font-mono text-xs font-semibold focus:border-sauce focus:outline-none"
                                />
                              </td>

                              <td className="px-3 py-2.5 text-center font-mono text-carbon/60 text-[11px]">
                                {c.unidad}
                              </td>

                              <td className="px-3 py-2.5 text-right font-mono text-carbon/70">
                                {formatMoneda(c.costoUnitario)}
                              </td>

                              <td className="px-3 py-2.5 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  disabled={!puedeEditar}
                                  defaultValue={c.precioUnitario}
                                  onBlur={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    if (val !== c.precioUnitario) {
                                      handleUpdateConceptoInline(c.id, "precioUnitario", val);
                                    }
                                  }}
                                  className="w-24 bg-slate-50 border border-carbon/15 rounded px-1.5 py-0.5 text-right font-mono text-xs font-bold text-verde-profundo focus:border-sauce focus:outline-none"
                                />
                              </td>

                              <td className="px-3 py-2.5 text-right font-mono font-bold text-sauce text-xs">
                                {formatMoneda(c.importe)}
                              </td>

                              <td className="px-3 py-2.5 text-center">
                                {puedeEditar && (
                                  <button
                                    onClick={() => handleEliminarConcepto(c.id)}
                                    className="text-carbon/20 hover:text-rojo transition p-1 text-xs"
                                    title="Quitar concepto"
                                  >
                                    ✕
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pie de Partida con Selector Rápido */}
                {puedeEditar && (
                  <div className="p-3 bg-slate-50/50 border-t border-carbon/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAgregarConceptoAPartida(partida.id, e.target.value);
                            e.target.value = "";
                          }
                        }}
                        className="rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs text-carbon/70 outline-none focus:border-sauce font-cuerpo"
                      >
                        <option value="">📦 Agregar concepto desde Catálogo...</option>
                        {catalogoConceptos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre} ({formatMoneda(p.precioUnitario)}/{p.unidad})
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => handleAgregarConceptoAPartida(partida.id)}
                        className="rounded-lg bg-slate-200/70 hover:bg-slate-200 px-3 py-1.5 text-xs font-semibold text-carbon transition"
                      >
                        + Concepto Libre
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* CASCADA DE PRECIOS Y TOTALES */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-carbon/10 shadow-sm p-6 space-y-4">
        <h4 className="font-titular font-bold text-base text-carbon border-b border-carbon/10 pb-3 flex items-center justify-between">
          <span>Cascada de Precio y Cierre de Presupuesto</span>
          <span className="text-xs font-mono font-normal text-carbon/50">
            Fórmula Estándar de Obra en México
          </span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Desglose de Cascada */}
          <div className="space-y-2 text-xs font-cuerpo">
            <div className="flex justify-between py-1.5 border-b border-carbon/5">
              <span className="text-carbon/70">1. Costo Directo de Obra (Materiales + Mano de Obra)</span>
              <span className="font-mono font-semibold text-carbon">
                {formatMoneda(cascada.costoDirecto)}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-carbon/5">
              <span className="text-carbon/70">
                2. (+) Gastos Indirectos ({cascada.indirectosPct}%): Gasolina, viáticos, supervisión
              </span>
              <span className="font-mono text-carbon/80">
                + {formatMoneda(cascada.indirectosMonto)}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-carbon/5">
              <span className="text-carbon/70">
                3. (+) Imprevistos de Obra Existente ({cascada.imprevistosPct}%): Vicios ocultos
              </span>
              <span className="font-mono text-carbon/80">
                + {formatMoneda(cascada.imprevistosMonto)}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-carbon/5 font-semibold text-carbon">
              <span>(=) Costo Total Estimado de Obra</span>
              <span className="font-mono">
                {formatMoneda(cascada.costoDirecto + cascada.indirectosMonto + cascada.imprevistosMonto)}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-carbon/5 text-emerald-700 font-semibold">
              <span>4. (+) Utilidad Bruta Sauceda ({cascada.utilidadPct}%)</span>
              <span className="font-mono">
                + {formatMoneda(cascada.utilidadMonto)}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-carbon/5 font-bold text-carbon">
              <span>(=) Subtotal Presupuesto al Cliente</span>
              <span className="font-mono">
                {formatMoneda(cascada.subtotal)}
              </span>
            </div>

            {cascada.incluyeIva && (
              <div className="flex justify-between py-1.5 border-b border-carbon/5 text-carbon/70">
                <span>5. (+) IVA ({cascada.ivaPct}%)</span>
                <span className="font-mono">
                  + {formatMoneda(cascada.ivaMonto)}
                </span>
              </div>
            )}

            <div className="flex justify-between py-3 rounded-xl bg-verde-profundo text-crema px-4 text-sm font-bold shadow-xs mt-3">
              <span>PRECIO FINAL COTIZADO</span>
              <span className="font-mono text-base text-dorado">
                {formatMoneda(cascada.precioFinal)}
              </span>
            </div>
          </div>

          {/* Esquema de Pagos y Alcances */}
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-carbon/10 space-y-2">
              <h5 className="font-titular font-semibold text-xs text-carbon uppercase tracking-wider">
                Esquema de Pagos por Hitos
              </h5>
              <div className="space-y-2 pt-1 font-mono text-xs">
                {datosPresupuesto.esquemaPagos.map((h, i) => (
                  <div key={i} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-carbon/5">
                    <div>
                      <span className="font-bold text-carbon block">{h.etapa} ({h.porcentaje}%)</span>
                      <span className="text-[10px] text-carbon/50 font-cuerpo">{h.condicion}</span>
                    </div>
                    <span className="font-bold text-sauce">
                      {formatMoneda(Math.round(cascada.precioFinal * (h.porcentaje / 100)))}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {(datosPresupuesto.cotizacion.alcances || datosPresupuesto.cotizacion.exclusiones) && (
              <div className="grid grid-cols-2 gap-3 text-xs font-cuerpo">
                {datosPresupuesto.cotizacion.alcances && (
                  <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200">
                    <span className="font-bold text-emerald-900 block mb-1">✓ Qué incluye:</span>
                    <p className="text-carbon/70 text-[11px] whitespace-pre-line">
                      {datosPresupuesto.cotizacion.alcances}
                    </p>
                  </div>
                )}
                {datosPresupuesto.cotizacion.exclusiones && (
                  <div className="p-3 rounded-xl bg-red-50/50 border border-red-200">
                    <span className="font-bold text-red-900 block mb-1">✗ Qué no incluye:</span>
                    <p className="text-carbon/70 text-[11px] whitespace-pre-line">
                      {datosPresupuesto.cotizacion.exclusiones}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL PLANTILLA PARAMÉTRICA */}
      {/* ============================================================ */}
      {modalPlantillaAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 font-cuerpo">
            <div className="px-6 py-4 bg-slate-50 border-b border-carbon/10 flex items-center justify-between">
              <div>
                <h3 className="font-titular font-bold text-base text-verde-profundo">
                  Agregar Espacio Paramétrico
                </h3>
                <p className="text-[11px] text-carbon/50">
                  Calcula m² de piso, muro, demoliciones y salidas a partir de medidas.
                </p>
              </div>
              <button
                onClick={() => setModalPlantillaAbierto(false)}
                className="text-carbon/40 hover:text-carbon p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCrearEspacioPlantilla} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-carbon mb-1">Tipo de Plantilla</label>
                <div className="grid grid-cols-2 gap-2">
                  {plantillas.map((pl) => (
                    <button
                      key={pl.slug}
                      type="button"
                      onClick={() => setSlugPlantillaSeleccionada(pl.slug)}
                      className={`p-3 rounded-xl border text-left transition ${
                        slugPlantillaSeleccionada === pl.slug
                          ? "border-sauce bg-sauce/5 text-sauce font-bold shadow-xs"
                          : "border-carbon/15 hover:border-carbon/30 text-carbon"
                      }`}
                    >
                      <span className="block text-sm mb-0.5">
                        {pl.slug === "bano_completo" ? "🚿" : pl.slug === "cocina" ? "🍳" : "📐"}{" "}
                        {pl.nombre}
                      </span>
                      <span className="text-[10px] text-carbon/60 font-normal line-clamp-1">
                        {pl.descripcion}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-carbon mb-1">Nombre del Espacio</label>
                <input
                  type="text"
                  required
                  value={nombreEspacioNuevo}
                  onChange={(e) => setNombreEspacioNuevo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none"
                />
              </div>

              {/* Medidas */}
              <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 border border-carbon/10">
                <div>
                  <label className="block text-carbon/60 text-[10px] font-semibold mb-1">Largo (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={largoEspacio}
                    onChange={(e) => setLargoEspacio(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-carbon/20 font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-carbon/60 text-[10px] font-semibold mb-1">Ancho (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={anchoEspacio}
                    onChange={(e) => setAnchoEspacio(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-carbon/20 font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-carbon/60 text-[10px] font-semibold mb-1">Altura (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={altoEspacio}
                    onChange={(e) => setAltoEspacio(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-carbon/20 font-mono text-center"
                  />
                </div>
              </div>

              {/* Gama Inicial */}
              <div>
                <label className="block font-semibold text-carbon mb-1">Gama Inicial de Acabados</label>
                <div className="flex rounded-lg bg-slate-100 p-1 border border-carbon/10">
                  {(["economica", "media", "premium"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGamaEspacio(g)}
                      className={`flex-1 py-1.5 text-center rounded-md transition capitalize font-semibold ${
                        gamaEspacio === g
                          ? "bg-white text-sauce shadow-xs font-bold"
                          : "text-carbon/60 hover:text-carbon"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Parámetros Específicos de la Plantilla */}
              {plantillas.find((p) => p.slug === slugPlantillaSeleccionada)?.parametrosSchema.map((param) => (
                <div key={param.key} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-carbon/5">
                  <span className="font-medium text-carbon">{param.label}</span>
                  {param.tipo === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={!!parametrosPlantilla[param.key]}
                      onChange={(e) =>
                        setParametrosPlantilla((prev) => ({ ...prev, [param.key]: e.target.checked }))
                      }
                      className="h-4 w-4 text-sauce rounded"
                    />
                  ) : (
                    <input
                      type="number"
                      step="0.1"
                      value={parametrosPlantilla[param.key] || 0}
                      onChange={(e) =>
                        setParametrosPlantilla((prev) => ({ ...prev, [param.key]: parseFloat(e.target.value) || 0 }))
                      }
                      className="w-20 px-2 py-1 rounded border border-carbon/20 text-right font-mono"
                    />
                  )}
                </div>
              ))}

              <div className="pt-4 border-t border-carbon/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalPlantillaAbierto(false)}
                  className="px-4 py-2 rounded-lg border border-carbon/20 font-semibold text-carbon/70 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesando}
                  className="px-5 py-2 rounded-lg bg-verde-profundo font-semibold text-white shadow-xs hover:bg-sauce transition disabled:opacity-50"
                >
                  {procesando ? "Generando..." : "⚡ Generar Espacio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL NUEVA PARTIDA */}
      {/* ============================================================ */}
      {modalPartidaAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs font-cuerpo">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="font-titular font-bold text-base text-carbon">Nueva Partida Manual</h3>
            <form onSubmit={handleCrearPartida} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-carbon mb-1">Nombre de la Partida</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Herrería y Cancelería, Carpintería"
                  value={nombrePartidaNueva}
                  onChange={(e) => setNombrePartidaNueva(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalPartidaAbierto(false)}
                  className="px-3 py-1.5 rounded-lg border text-carbon/60 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesando}
                  className="px-4 py-1.5 rounded-lg bg-sauce font-semibold text-white hover:bg-verde-profundo"
                >
                  Guardar Partida
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL CONFIGURACIÓN DE CASCADA */}
      {/* ============================================================ */}
      {modalCascadaAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs font-cuerpo">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-carbon/10 flex items-center justify-between">
              <h3 className="font-titular font-bold text-base text-carbon">
                Configurar Cascada de Precios & Alcances
              </h3>
              <button onClick={() => setModalCascadaAbierto(false)} className="text-carbon/40">✕</button>
            </div>

            <form onSubmit={handleGuardarCascada} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-carbon mb-1">
                    % Indirectos (Supervisión, Gasolina)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={cascadaIndPct}
                    onChange={(e) => setCascadaIndPct(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-carbon mb-1">
                    % Imprevistos (Obra Existente)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={cascadaImpPct}
                    onChange={(e) => setCascadaImpPct(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-carbon mb-1">
                    % Utilidad Sauceda
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={cascadaUtPct}
                    onChange={(e) => setCascadaUtPct(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border font-mono font-bold text-verde-profundo"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-carbon mb-1">
                    % IVA Facturación
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={cascadaIvaPct}
                    onChange={(e) => setCascadaIvaPct(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border">
                <input
                  type="checkbox"
                  id="chkIva"
                  checked={cascadaIncluyeIva}
                  onChange={(e) => setCascadaIncluyeIva(e.target.checked)}
                  className="h-4 w-4 text-sauce rounded"
                />
                <label htmlFor="chkIva" className="font-semibold text-carbon cursor-pointer">
                  Desglosar y sumar IVA al presupuesto final
                </label>
              </div>

              <div>
                <label className="block font-semibold text-carbon mb-1">Alcances (Qué sí incluye)</label>
                <textarea
                  rows={2}
                  value={cascadaAlcances}
                  onChange={(e) => setCascadaAlcances(e.target.value)}
                  placeholder="Detalla qué materiales, traslados y trabajos quedan cubiertos..."
                  className="w-full px-3 py-2 rounded-lg border"
                />
              </div>

              <div>
                <label className="block font-semibold text-carbon mb-1">Exclusiones (Qué no incluye)</label>
                <textarea
                  rows={2}
                  value={cascadaExclusiones}
                  onChange={(e) => setCascadaExclusiones(e.target.value)}
                  placeholder="Permisos municipales, reparación de tuberías principales ocultas dañadas, etc."
                  className="w-full px-3 py-2 rounded-lg border"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setModalCascadaAbierto(false)}
                  className="px-3 py-1.5 rounded-lg border text-carbon/60 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesando}
                  className="px-4 py-1.5 rounded-lg bg-sauce font-semibold text-white hover:bg-verde-profundo"
                >
                  Guardar Cascada
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL EXPLOSIÓN DE INSUMOS */}
      {/* ============================================================ */}
      {modalExplosionAbierto && explosionData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs font-cuerpo">
          <div className="w-full max-w-4xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-carbon/10 flex items-center justify-between">
              <div>
                <h3 className="font-titular font-bold text-base text-verde-profundo">
                  💥 Explosión Consolidada de Insumos para Compras & Destajos
                </h3>
                <p className="text-[11px] text-carbon/50">
                  Cantidades totales netas para abastecimiento agrupadas por tipo.
                </p>
              </div>
              <button onClick={() => setModalExplosionAbierto(false)} className="text-carbon/40">✕</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Materiales */}
              <div className="space-y-2">
                <h4 className="font-titular font-bold text-xs uppercase text-emerald-800 tracking-wider">
                  📦 Materiales Requeridos ({explosionData.materiales.length})
                </h4>
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-emerald-50 text-[10px] uppercase text-emerald-900 font-semibold">
                    <tr>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Material</th>
                      <th className="px-3 py-2 text-right">Cant. Total</th>
                      <th className="px-3 py-2 text-center">Unidad</th>
                      <th className="px-3 py-2 text-right">Costo Unit.</th>
                      <th className="px-3 py-2 text-right">Importe Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-carbon/5 font-mono">
                    {explosionData.materiales.map((m) => (
                      <tr key={m.insumoId}>
                        <td className="px-3 py-2 text-sauce font-bold">{m.codigo}</td>
                        <td className="px-3 py-2 font-cuerpo font-semibold text-carbon">{m.nombre}</td>
                        <td className="px-3 py-2 text-right font-bold">{m.cantidadTotal}</td>
                        <td className="px-3 py-2 text-center text-carbon/60">{m.unidad}</td>
                        <td className="px-3 py-2 text-right">{formatMoneda(m.costoUnitario)}</td>
                        <td className="px-3 py-2 text-right font-bold text-verde-profundo">{formatMoneda(m.importeTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mano de Obra */}
              <div className="space-y-2">
                <h4 className="font-titular font-bold text-xs uppercase text-amber-800 tracking-wider">
                  👷 Mano de Obra por Oficio ({explosionData.manoDeObra.length})
                </h4>
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-amber-50 text-[10px] uppercase text-amber-900 font-semibold">
                    <tr>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Oficio / Jornal</th>
                      <th className="px-3 py-2 text-right">Jornadas Estimadas</th>
                      <th className="px-3 py-2 text-right">Costo Jornal</th>
                      <th className="px-3 py-2 text-right">Importe Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-carbon/5 font-mono">
                    {explosionData.manoDeObra.map((mo) => (
                      <tr key={mo.insumoId}>
                        <td className="px-3 py-2 text-sauce font-bold">{mo.codigo}</td>
                        <td className="px-3 py-2 font-cuerpo font-semibold text-carbon">{mo.nombre}</td>
                        <td className="px-3 py-2 text-right font-bold">{mo.cantidadTotal} jor</td>
                        <td className="px-3 py-2 text-right">{formatMoneda(mo.costoUnitario)}</td>
                        <td className="px-3 py-2 text-right font-bold text-verde-profundo">{formatMoneda(mo.importeTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Subcontratos */}
              {explosionData.subcontratos.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-titular font-bold text-xs uppercase text-indigo-800 tracking-wider">
                    🤝 Subcontratos y Destajos ({explosionData.subcontratos.length})
                  </h4>
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-indigo-50 text-[10px] uppercase text-indigo-900 font-semibold">
                      <tr>
                        <th className="px-3 py-2">Código</th>
                        <th className="px-3 py-2">Subcontrato</th>
                        <th className="px-3 py-2 text-right">Cantidad</th>
                        <th className="px-3 py-2 text-center">Unidad</th>
                        <th className="px-3 py-2 text-right">Costo Estimado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-carbon/5 font-mono">
                      {explosionData.subcontratos.map((s) => (
                        <tr key={s.insumoId}>
                          <td className="px-3 py-2 text-sauce font-bold">{s.codigo}</td>
                          <td className="px-3 py-2 font-cuerpo font-semibold text-carbon">{s.nombre}</td>
                          <td className="px-3 py-2 text-right font-bold">{s.cantidadTotal}</td>
                          <td className="px-3 py-2 text-center text-carbon/60">{s.unidad}</td>
                          <td className="px-3 py-2 text-right font-bold text-verde-profundo">{formatMoneda(s.importeTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-carbon/10 text-right">
              <button
                onClick={() => setModalExplosionAbierto(false)}
                className="px-4 py-2 rounded-lg bg-carbon/10 hover:bg-carbon/20 text-carbon font-semibold text-xs"
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
