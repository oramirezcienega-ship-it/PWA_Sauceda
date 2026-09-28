"use client";

import { useEffect, useState } from "react";
import {
  obtenerOrdenesTrabajo,
  actualizarEstatusOrdenTrabajo,
  eliminarOrdenTrabajo,
  asignarAsesorEjecutor,
  agregarEvidenciaFotoOT,
  obtenerOrdenTrabajoPorId,
  type OrdenTrabajo,
  type ReciboPago,
  type CartaGarantiaOT,
} from "@/app/actions/ordenes-trabajo";
import { listarAsesoresActivos } from "@/app/actions/usuarios";
import { ModalCrearOrdenTrabajo } from "./ModalCrearOrdenTrabajo";
import { ModalRegistrarRecibo } from "./ModalRegistrarRecibo";
import { ModalGestionarGarantia } from "./ModalGestionarGarantia";
import { ModalGenerarRemisionOT } from "./ModalGenerarRemisionOT";
import { ModalNotificarEntregaOT } from "./ModalNotificarEntregaOT";
import type { RemisionFactura } from "@/lib/types";

interface ModuloOrdenesTrabajoProps {
  expedienteId?: string | null;
  prospectoId?: string | null;
  cotizacionId?: string | null;
  clienteNombreDefault?: string;
  clienteTelefonoDefault?: string;
  tipoNegocioDefault?: string;
  soloLectura?: boolean;
  alEliminarOrden?: (ordenId: string) => void;
  alCrearOrden?: () => void;
  filtroEstatus?: string;
  filtroTipo?: string;
  filtroAsesor?: string;
  busqueda?: string;
}

export function ModuloOrdenesTrabajo({
  expedienteId,
  prospectoId,
  cotizacionId,
  clienteNombreDefault = "Cliente",
  clienteTelefonoDefault = "",
  tipoNegocioDefault = "construccion",
  soloLectura = false,
  alEliminarOrden,
  alCrearOrden,
  filtroEstatus,
  filtroTipo,
  filtroAsesor,
  busqueda,
}: ModuloOrdenesTrabajoProps) {
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [asesores, setAsesores] = useState<Array<{ id: string; nombre: string }>>([]);

  // Modales
  const [modalCrearOT, setModalCrearOT] = useState(false);
  const [ordenParaRecibo, setOrdenParaRecibo] = useState<OrdenTrabajo | null>(null);
  const [ordenParaGarantia, setOrdenParaGarantia] = useState<{
    orden: OrdenTrabajo;
    garantia: CartaGarantiaOT | null;
  } | null>(null);
  const [ordenParaRemision, setOrdenParaRemision] = useState<OrdenTrabajo | null>(null);
  const [ordenParaNotificar, setOrdenParaNotificar] = useState<OrdenTrabajo | null>(null);
  const [ordenParaEliminar, setOrdenParaEliminar] = useState<OrdenTrabajo | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  // Foto en proceso de subida
  const [subiendoFotoOrdenId, setSubiendoFotoOrdenId] = useState<string | null>(null);
  const [fotoEtapa, setFotoEtapa] = useState<"inicio" | "proceso" | "entrega">("proceso");

  // Orden expandida para ver detalles/recibos
  const [otExpandidaId, setOtExpandidaId] = useState<string | null>(null);
  const [detalleOT, setDetalleOT] = useState<{
    recibos: ReciboPago[];
    garantia: CartaGarantiaOT | null;
    remisionFactura: RemisionFactura | null;
  }>({ recibos: [], garantia: null, remisionFactura: null });
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Modal para concluir orden
  const [ordenParaConcluir, setOrdenParaConcluir] = useState<OrdenTrabajo | null>(null);
  const [notasConclusion, setNotasConclusion] = useState("");
  const [concluyendo, setConcluyendo] = useState(false);

  const cargarDatos = async () => {
    try {
      setCargando(true);
      const [lista, listaAsesores] = await Promise.all([
        obtenerOrdenesTrabajo({
          expedienteId: expedienteId || undefined,
          prospectoId: prospectoId || undefined,
          cotizacionId: cotizacionId || undefined,
        }),
        listarAsesoresActivos().catch(() => []),
      ]);
      setOrdenes(lista);
      setAsesores(listaAsesores);

      if (lista.length > 0 && !otExpandidaId) {
        cargarDetalle(lista[0].id);
      }
    } catch (e) {
      console.error("Error al cargar ordenes de trabajo:", e);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [expedienteId, prospectoId, cotizacionId]);

  const cargarDetalle = async (id: string) => {
    try {
      setOtExpandidaId(id);
      setCargandoDetalle(true);
      const res = await obtenerOrdenTrabajoPorId(id);
      setDetalleOT({
        recibos: res.recibos,
        garantia: res.garantia,
        remisionFactura: res.remisionFactura,
      });
    } catch (e) {
      console.error("Error al cargar detalle de OT:", e);
    } finally {
      setCargandoDetalle(false);
    }
  };

  const handleCambiarEstatus = async (
    ot: OrdenTrabajo,
    nuevoEstatus: "pendiente" | "en_proceso" | "completada" | "cancelada"
  ) => {
    if (nuevoEstatus === "completada") {
      setOrdenParaConcluir(ot);
      setNotasConclusion(ot.notasConclusion || "");
      return;
    }

    try {
      await actualizarEstatusOrdenTrabajo(ot.id, nuevoEstatus);
      setOrdenes((prev) =>
        prev.map((o) => (o.id === ot.id ? { ...o, estatus: nuevoEstatus } : o))
      );
    } catch (e) {
      alert("Error al actualizar el estado de la orden de trabajo.");
    }
  };

  const handleConfirmarConclusion = async () => {
    if (!ordenParaConcluir) return;
    try {
      setConcluyendo(true);
      await actualizarEstatusOrdenTrabajo(ordenParaConcluir.id, "completada", {
        notasConclusion,
      });
      const otConcluida = ordenParaConcluir;
      setOrdenes((prev) =>
        prev.map((o) =>
          o.id === otConcluida.id
            ? {
                ...o,
                estatus: "completada",
                notasConclusion,
                fechaConclusion: new Date().toISOString(),
              }
            : o
        )
      );
      setOrdenParaConcluir(null);

      // Si tiene cotización y aún no tiene remisión generada, sugerir generarla; de lo contrario sugerir notificar
      if (!otConcluida.remisionFactura && otConcluida.cotizacionId) {
        setTimeout(() => {
          setOrdenParaRemision(otConcluida);
        }, 250);
      } else {
        setTimeout(() => {
          setOrdenParaNotificar(otConcluida);
        }, 250);
      }
    } catch (e) {
      alert("Error al concluir la orden.");
    } finally {
      setConcluyendo(false);
    }
  };

  const handleConfirmarEliminar = async () => {
    if (!ordenParaEliminar) return;
    try {
      setEliminando(true);
      setErrorEliminar(null);
      const res = await eliminarOrdenTrabajo(ordenParaEliminar.id);
      if (!res.ok) {
        setErrorEliminar(res.error || "No se pudo eliminar la orden de trabajo.");
        return;
      }
      const idEliminado = ordenParaEliminar.id;
      setOrdenes((prev) => prev.filter((o) => o.id !== idEliminado));
      if (otExpandidaId === idEliminado) {
        setOtExpandidaId(null);
        setDetalleOT({ recibos: [], garantia: null, remisionFactura: null });
      }
      setOrdenParaEliminar(null);
      alEliminarOrden?.(idEliminado);
    } catch (err: any) {
      setErrorEliminar(err?.message || "Error al eliminar la orden de trabajo.");
    } finally {
      setEliminando(false);
    }
  };

  const handleCambiarAsesor = async (ordenId: string, nuevoAsesorId: string) => {
    try {
      await asignarAsesorEjecutor(ordenId, nuevoAsesorId || null);
      const asesorObj = asesores.find((a) => a.id === nuevoAsesorId);
      setOrdenes((prev) =>
        prev.map((o) =>
          o.id === ordenId
            ? {
                ...o,
                asesorEjecutorId: nuevoAsesorId || null,
                asesorEjecutorNombre: asesorObj?.nombre || "Sin asignar",
              }
            : o
        )
      );
    } catch (e) {
      alert("Error al asignar asesor.");
    }
  };

  const handleSubirFoto = async (ordenId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setSubiendoFotoOrdenId(ordenId);
      const fd = new FormData();
      fd.append("foto", file);
      fd.append("etapa", fotoEtapa);
      fd.append("descripcion", `Evidencia de etapa ${fotoEtapa}`);

      const res = await agregarEvidenciaFotoOT(ordenId, fd);
      if (res.ok && res.foto) {
        setOrdenes((prev) =>
          prev.map((o) =>
            o.id === ordenId
              ? { ...o, fotosEvidencia: [...o.fotosEvidencia, res.foto!] }
              : o
          )
        );
      } else {
        alert(res.error || "No se pudo subir la foto.");
      }
    } catch (err: any) {
      alert(err?.message || "Error al subir foto.");
    } finally {
      setSubiendoFotoOrdenId(null);
      e.target.value = "";
    }
  };

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(val);
  };

  const renderBadgeEstatus = (estatus: string) => {
    switch (estatus) {
      case "pendiente":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-800 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold">
            ⏳ Pendiente
          </span>
        );
      case "en_proceso":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 text-blue-800 border border-blue-500/30 px-2.5 py-0.5 text-[11px] font-bold">
            ⚙️ En Proceso
          </span>
        );
      case "completada":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-800 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold">
            ✓ Completada
          </span>
        );
      case "cancelada":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rojo/15 text-rojo border border-rojo/30 px-2.5 py-0.5 text-[11px] font-bold">
            ✕ Cancelada
          </span>
        );
      default:
        return null;
    }
  };

  const ordenesFiltradas = ordenes.filter((o) => {
    if (filtroEstatus && filtroEstatus !== "todos" && o.estatus !== filtroEstatus) {
      return false;
    }
    if (filtroTipo && filtroTipo !== "todos" && o.tipoNegocio !== filtroTipo) {
      return false;
    }
    if (filtroAsesor && o.asesorEjecutorId !== filtroAsesor) {
      return false;
    }
    if (busqueda && busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      const match =
        o.folio.toLowerCase().includes(q) ||
        o.titulo.toLowerCase().includes(q) ||
        (o.clienteNombre && o.clienteNombre.toLowerCase().includes(q)) ||
        (o.asesorEjecutorNombre && o.asesorEjecutorNombre.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="rounded-2xl border border-carbon/10 bg-white p-5 shadow-sm space-y-5">
      {/* Encabezado del Módulo */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-carbon/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sauce/15 text-xl text-sauce border border-sauce/20">
            🛠️
          </div>
          <div>
            <h2 className="font-titular text-lg font-bold text-verde-profundo flex items-center gap-2">
              Órdenes de Trabajo y Entrega
              <span className="text-xs bg-carbon/5 text-carbon/60 font-mono px-2 py-0.5 rounded-full font-bold">
                {ordenes.length}
              </span>
            </h2>
            <p className="text-xs text-carbon/60 font-cuerpo">
              Ejecución técnica en sitio, recibos de pago y pólizas de garantía
            </p>
          </div>
        </div>

        {!soloLectura && (
          <button
            type="button"
            onClick={() => setModalCrearOT(true)}
            className="rounded-xl bg-sauce hover:bg-verde-profundo text-white px-3.5 py-2 text-xs font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <span>+</span> Nueva Orden de Trabajo
          </button>
        )}
      </div>

      {cargando ? (
        <div className="py-10 text-center text-xs text-carbon/50">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-sauce border-t-transparent mb-2"></div>
          <p>Cargando órdenes de trabajo...</p>
        </div>
      ) : ordenes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-carbon/15 p-8 text-center space-y-2">
          <span className="text-3xl block">📋</span>
          <p className="font-titular font-semibold text-carbon/80 text-sm">
            No hay órdenes de trabajo activas para este registro
          </p>
          <p className="text-xs text-carbon/50 max-w-md mx-auto">
            Puedes generar una orden de trabajo cuando el cliente acepte una cotización para programar cuadrillas, técnicos y documentos de entrega.
          </p>
          {!soloLectura && (
            <button
              type="button"
              onClick={() => setModalCrearOT(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-sauce px-4 py-2 text-xs font-bold text-white hover:bg-verde-profundo transition shadow-xs"
            >
              <span>+</span> Crear Primera Orden de Trabajo
            </button>
          )}
        </div>
      ) : ordenesFiltradas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-carbon/15 p-8 text-center space-y-2">
          <span className="text-2xl block">🔍</span>
          <p className="font-titular font-semibold text-carbon/80 text-sm">
            No se encontraron órdenes con los filtros seleccionados
          </p>
          <p className="text-xs text-carbon/50 max-w-md mx-auto">
            Intenta cambiar los términos de búsqueda o el filtro de estado/asesor.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {ordenesFiltradas.map((ot) => {
            const estaExpandida = otExpandidaId === ot.id;
            const porcentajeCobrado =
              (ot.totalCotizado || 0) > 0
                ? Math.min(100, Math.round(((ot.totalPagado || 0) / (ot.totalCotizado || 1)) * 100))
                : 0;

            return (
              <div
                key={ot.id}
                className={`rounded-2xl border transition-all ${
                  estaExpandida
                    ? "border-sauce/50 shadow-md bg-white"
                    : "border-carbon/10 hover:border-carbon/25 bg-slate-50/50"
                }`}
              >
                {/* Cabecera de la Tarjeta */}
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold bg-sauce/15 text-sauce px-2.5 py-0.5 rounded-md border border-sauce/20">
                          {ot.folio}
                        </span>
                        {renderBadgeEstatus(ot.estatus)}
                        <span className="text-[11px] font-semibold text-carbon/50 capitalize bg-carbon/5 px-2 py-0.5 rounded">
                          {ot.tipoNegocio.replace("_", " ")}
                        </span>
                      </div>
                      <h3 className="font-titular text-base font-bold text-carbon mt-1.5">
                        {ot.titulo}
                      </h3>
                      {ot.descripcion && (
                        <p className="text-xs text-carbon/60 font-cuerpo mt-1 line-clamp-2">
                          {ot.descripcion}
                        </p>
                      )}
                    </div>

                    {/* Selector rápido de estatus y botón de eliminar */}
                    {!soloLectura && (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={ot.estatus}
                          onChange={(e) =>
                            handleCambiarEstatus(ot, e.target.value as any)
                          }
                          className="rounded-lg border border-carbon/20 px-2.5 py-1 text-xs font-semibold text-carbon focus:border-sauce outline-none bg-white shadow-2xs"
                        >
                          <option value="pendiente">⏳ Pendiente</option>
                          <option value="en_proceso">⚙️ En Proceso</option>
                          <option value="completada">✓ Completada</option>
                          <option value="cancelada">✕ Cancelada</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            setOrdenParaEliminar(ot);
                            setErrorEliminar(null);
                          }}
                          className="p-1 rounded-lg border border-carbon/20 text-carbon/40 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition shadow-2xs"
                          title="Eliminar orden de trabajo"
                          aria-label="Eliminar orden de trabajo"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Asignación y Fechas */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-carbon/5 pt-3 text-xs">
                    <div>
                      <span className="text-[10px] text-carbon/40 uppercase block font-semibold">
                        Técnico / Asesor Ejecutor
                      </span>
                      {!soloLectura ? (
                        <select
                          value={ot.asesorEjecutorId || ""}
                          onChange={(e) => handleCambiarAsesor(ot.id, e.target.value)}
                          className="mt-0.5 w-full rounded-md border border-carbon/15 px-2 py-1 text-xs text-carbon font-medium bg-white outline-none focus:border-sauce"
                        >
                          <option value="">-- Sin Asignar --</option>
                          {asesores.map((a) => (
                            <option key={a.id} value={a.id}>
                              👤 {a.nombre}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-medium text-carbon mt-0.5 block">
                          👤 {ot.asesorEjecutorNombre}
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-[10px] text-carbon/40 uppercase block font-semibold">
                        Programación / Inicio
                      </span>
                      <span className="font-mono text-carbon/80 mt-0.5 block">
                        📅 {ot.fechaProgramada || "Sin fecha pactada"}
                        {ot.fechaInicio && (
                          <span className="text-emerald-700 block text-[11px]">
                            Inició: {ot.fechaInicio}
                          </span>
                        )}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-carbon/40 uppercase block font-semibold">
                        Conclusión Técnica
                      </span>
                      <span className="font-mono text-carbon/80 mt-0.5 block">
                        {ot.fechaConclusion ? (
                          <span className="text-emerald-700 font-bold">
                            ✓ {new Date(ot.fechaConclusion).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-carbon/40 italic">En ejecución</span>
                        )}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-carbon/40 uppercase block font-semibold">
                        Aviso al Cliente
                      </span>
                      <span className="font-mono text-xs mt-0.5 block">
                        {ot.notificadoClienteAt ? (
                          <span className="text-emerald-700 font-bold inline-flex items-center gap-1">
                            <span>✓</span>
                            <span>{ot.canalNotificacion || "Enviado"} ({new Date(ot.notificadoClienteAt).toLocaleDateString()})</span>
                          </span>
                        ) : (
                          <span className="text-amber-700/70 italic text-[11px]">Sin notificar</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Barra Financiera de Cobranza */}
                  {(ot.totalCotizado || 0) > 0 && (
                    <div className="mt-3.5 bg-carbon/5 p-3 rounded-xl border border-carbon/10">
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <span className="font-semibold text-carbon/70">
                          Avance de Cobranza ({porcentajeCobrado}%)
                        </span>
                        <div className="font-mono text-xs space-x-3">
                          <span className="text-carbon/60">
                            Total: <strong>{formatMoneda(ot.totalCotizado || 0)}</strong>
                          </span>
                          <span className="text-emerald-700">
                            Cobrado: <strong>{formatMoneda(ot.totalPagado || 0)}</strong>
                          </span>
                          <span className="text-amber-800 font-bold">
                            Resta: {formatMoneda(ot.saldoRestante || 0)}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-carbon/15 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 rounded-full ${
                            porcentajeCobrado >= 100
                              ? "bg-emerald-600"
                              : porcentajeCobrado > 0
                              ? "bg-amber-500"
                              : "bg-carbon/20"
                          }`}
                          style={{ width: `${porcentajeCobrado}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Acciones principales de la Orden */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-carbon/5 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (estaExpandida) {
                            setOtExpandidaId(null);
                          } else {
                            cargarDetalle(ot.id);
                          }
                        }}
                        className="rounded-lg bg-carbon/5 hover:bg-carbon/10 px-3 py-1.5 text-xs font-bold text-carbon transition flex items-center gap-1"
                      >
                        <span>{estaExpandida ? "▲ Ocultar Documentos" : "▼ Ver Documentos & Recibos"}</span>
                        <span className="text-[10px] bg-carbon/10 px-1.5 py-0.2 rounded-full">
                          {ot.fotosEvidencia?.length || 0} fotos
                        </span>
                      </button>

                      {!soloLectura && (
                        <button
                          type="button"
                          onClick={() => setOrdenParaRecibo(ot)}
                          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                        >
                          <span>💵</span> + Registrar Recibo
                        </button>
                      )}

                      {!soloLectura && (
                        <button
                          type="button"
                          onClick={() =>
                            setOrdenParaGarantia({
                              orden: ot,
                              garantia: estaExpandida ? detalleOT.garantia : null,
                            })
                          }
                          className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                        >
                          <span>🛡️</span> Póliza de Garantía
                        </button>
                      )}

                      {!soloLectura && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!estaExpandida) cargarDetalle(ot.id);
                            setOrdenParaNotificar(ot);
                          }}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition flex items-center gap-1 shadow-2xs ${
                            ot.estatus === "completada"
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                              : "bg-white border border-carbon/20 text-carbon hover:bg-carbon/5"
                          }`}
                        >
                          <span>📢</span> {ot.notificadoClienteAt ? "Re-notificar" : "Notificar Entrega"}
                        </button>
                      )}
                    </div>

                    {/* Subida rápida de fotos */}
                    {!soloLectura && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <select
                          value={fotoEtapa}
                          onChange={(e) => setFotoEtapa(e.target.value as any)}
                          className="rounded-lg border border-carbon/20 px-2 py-1 text-[11px] text-carbon outline-none bg-white"
                        >
                          <option value="inicio">Foto: Inicio</option>
                          <option value="proceso">Foto: Proceso</option>
                          <option value="entrega">Foto: Entrega</option>
                        </select>
                        <label className="cursor-pointer rounded-lg border border-carbon/20 bg-white hover:bg-carbon/5 px-2.5 py-1 text-xs font-bold text-carbon/70 transition flex items-center gap-1 shadow-2xs">
                          <span>📷</span>
                          <span>
                            {subiendoFotoOrdenId === ot.id
                              ? "Subiendo..."
                              : "+ Foto"}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={subiendoFotoOrdenId === ot.id}
                            onChange={(e) => handleSubirFoto(ot.id, e)}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sección Expandible: Documentos de Entrega, Recibos y Fotos */}
                {estaExpandida && (
                  <div className="border-t border-carbon/10 bg-white p-4 sm:p-5 rounded-b-2xl space-y-5 animate-fade-in">
                    {cargandoDetalle ? (
                      <p className="text-center text-xs text-carbon/40 py-4">
                        Cargando documentos de entrega...
                      </p>
                    ) : (
                      <>
                        {/* Enlace al Portal Público de Entrega del Cliente */}
                        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 border border-carbon/10 shadow-2xs">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xl">🌐</span>
                            <div>
                              <p className="text-xs font-bold text-carbon">
                                Portal de Entrega del Cliente ({ot.folio})
                              </p>
                              <p className="text-[11px] text-carbon/50">
                                Enlace público único con reporte técnico, evidencias fotográficas y descarga de documentos.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={`/orden-trabajo/entrega/${ot.token}`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-xl bg-white border border-carbon/20 px-3.5 py-1.5 text-xs font-bold text-verde-profundo hover:bg-carbon/5 transition shadow-2xs inline-flex items-center gap-1"
                            >
                              <span>Abrir Portal</span>
                              <span>↗</span>
                            </a>
                            {!soloLectura && (
                              <button
                                type="button"
                                onClick={() => setOrdenParaNotificar(ot)}
                                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 text-xs font-bold transition shadow-2xs inline-flex items-center gap-1"
                              >
                                <span>📢 Enviar al Cliente</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 1. Recibos de Pago Emitidos */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-titular text-xs font-bold uppercase tracking-wider text-verde-profundo flex items-center gap-1.5">
                              <span>💵</span> Recibos Oficiales de Pago ({detalleOT.recibos.length})
                            </h4>
                            {!soloLectura && (
                              <button
                                type="button"
                                onClick={() => setOrdenParaRecibo(ot)}
                                className="text-[11px] text-emerald-700 hover:underline font-bold"
                              >
                                + Emitir nuevo recibo
                              </button>
                            )}
                          </div>

                          {detalleOT.recibos.length === 0 ? (
                            <p className="text-xs text-carbon/50 italic py-2">
                              Aún no se han emitido recibos para esta orden de trabajo.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {detalleOT.recibos.map((rec) => {
                                const urlRec = `/recibo/${rec.token}`;
                                const msjWa = encodeURIComponent(
                                  `¡Hola ${rec.clienteNombre}! 👋 Le compartimos su *Recibo Oficial de Pago* (${rec.folio}) por ${formatMoneda(
                                    rec.monto
                                  )} de su orden *${ot.folio}*.\n\nConsúltelo aquí:\n${
                                    typeof window !== "undefined"
                                      ? window.location.origin
                                      : ""
                                  }${urlRec}`
                                );

                                return (
                                  <div
                                    key={rec.id}
                                    className="rounded-xl border border-carbon/10 p-3 bg-emerald-50/40 hover:bg-emerald-50/70 transition flex flex-col justify-between"
                                  >
                                    <div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-mono font-bold text-emerald-900">
                                          {rec.folio}
                                        </span>
                                        <span className="text-[11px] text-carbon/50 font-mono">
                                          {rec.fechaPago}
                                        </span>
                                      </div>
                                      <p className="text-base font-mono font-bold text-emerald-800 my-1">
                                        {formatMoneda(rec.monto)}
                                      </p>
                                      <p className="text-[11px] text-carbon/70 font-medium">
                                        {rec.concepto}
                                      </p>
                                      <div className="mt-1 text-[10px] text-carbon/50 flex justify-between">
                                        <span>Método: {rec.metodoPago}</span>
                                        <span>Resta: {formatMoneda(rec.saldoRestante)}</span>
                                      </div>
                                    </div>

                                    <div className="mt-3 pt-2 border-t border-emerald-200/50 flex items-center justify-end gap-2">
                                      <a
                                        href={urlRec}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-md bg-white border border-carbon/15 hover:bg-carbon/5 px-2.5 py-1 text-[11px] font-bold text-carbon flex items-center gap-1 shadow-2xs"
                                      >
                                        🖨️ Ver / Imprimir
                                      </a>
                                      {rec.clienteTelefono && (
                                        <a
                                          href={`https://wa.me/${rec.clienteTelefono.replace(
                                            /[^0-9]/g,
                                            ""
                                          )}?text=${msjWa}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[11px] font-bold flex items-center gap-1 shadow-2xs"
                                        >
                                          📲 WhatsApp
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* 2. Póliza de Garantía */}
                        <div className="border-t border-carbon/10 pt-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-titular text-xs font-bold uppercase tracking-wider text-verde-profundo flex items-center gap-1.5">
                              <span>🛡️</span> Póliza de Garantía Oficial
                            </h4>
                            {!soloLectura && (
                              <button
                                type="button"
                                onClick={() =>
                                  setOrdenParaGarantia({
                                    orden: ot,
                                    garantia: detalleOT.garantia,
                                  })
                                }
                                className="text-[11px] text-amber-800 hover:underline font-bold"
                              >
                                {detalleOT.garantia ? "✏️ Editar póliza" : "+ Emitir póliza"}
                              </button>
                            )}
                          </div>

                          {detalleOT.garantia ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-amber-900">
                                    {detalleOT.garantia.titulo}
                                  </span>
                                  <span className="bg-amber-200 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {detalleOT.garantia.anosGarantia} Años de Vigencia
                                  </span>
                                </div>
                                <p className="text-[11px] text-carbon/60 font-mono mt-1">
                                  Vence: {detalleOT.garantia.fechaVencimiento || "Indefinida"}
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                <a
                                  href={`/garantia/${detalleOT.garantia.token}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg bg-white border border-carbon/20 px-3 py-1.5 text-xs font-bold text-carbon hover:bg-carbon/5 transition shadow-2xs"
                                >
                                  🖨️ Ver Documento
                                </a>
                                {ot.clienteTelefono && (
                                  <a
                                    href={`https://wa.me/${ot.clienteTelefono.replace(
                                      /[^0-9]/g,
                                      ""
                                    )}?text=${encodeURIComponent(
                                      `¡Hola ${ot.clienteNombre}! 🛡️ Le compartimos su *Póliza de Garantía por Servicio* de la orden *${ot.folio}*.\n\nConsúltela aquí:\n${
                                        typeof window !== "undefined"
                                          ? window.location.origin
                                          : ""
                                      }/garantia/${detalleOT.garantia.token}`
                                    )}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold transition shadow-2xs"
                                  >
                                    📲 WhatsApp
                                  </a>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-carbon/50 italic py-1">
                              No se ha generado póliza de garantía para esta orden.
                            </p>
                          )}
                        </div>

                        {/* 3. Remisión de Entrega / Factura Fiscal */}
                        <div className="border-t border-carbon/10 pt-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-titular text-xs font-bold uppercase tracking-wider text-verde-profundo flex items-center gap-1.5">
                              <span>🧾</span> Remisión de Entrega / Factura Fiscal
                            </h4>
                            {!soloLectura && ot.cotizacionId && (
                              <button
                                type="button"
                                onClick={() => setOrdenParaRemision(ot)}
                                className="text-[11px] text-sauce hover:underline font-bold"
                              >
                                {detalleOT.remisionFactura ? "✏️ Editar / Refacturar" : "+ Generar Remisión / Factura"}
                              </button>
                            )}
                          </div>

                          {detalleOT.remisionFactura ? (
                            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-blue-950 font-mono">
                                    {detalleOT.remisionFactura.folio}
                                  </span>
                                  <span className="bg-blue-200 text-blue-900 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                    {detalleOT.remisionFactura.tipo}
                                  </span>
                                  <span className="text-xs font-bold text-blue-900">
                                    ${detalleOT.remisionFactura.montoTotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
                                  </span>
                                </div>
                                <p className="text-[11px] text-carbon/60 font-mono mt-1">
                                  Fecha de emisión: {detalleOT.remisionFactura.fecha || "N/A"}
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                {ot.cotizacionToken && (
                                  <a
                                    href={`/cotizacion/remision/${ot.cotizacionToken}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg bg-white border border-carbon/20 px-3 py-1.5 text-xs font-bold text-carbon hover:bg-carbon/5 transition shadow-2xs"
                                  >
                                    🖨️ Ver Remisión
                                  </a>
                                )}
                                {ot.cotizacionToken && ot.clienteTelefono && (
                                  <a
                                    href={`https://wa.me/${ot.clienteTelefono.replace(
                                      /[^0-9]/g,
                                      ""
                                    )}?text=${encodeURIComponent(
                                      `¡Hola ${ot.clienteNombre}! 📦 Le compartimos su *${detalleOT.remisionFactura.tipo === 'factura' ? 'Factura Fiscal' : 'Remisión Oficial de Entrega'}* con folio *${detalleOT.remisionFactura.folio}* correspondiente a los trabajos concluidos en su orden *${ot.folio}*.\n\nPuede consultarla y descargarla en el siguiente enlace:\n${
                                        typeof window !== "undefined"
                                          ? window.location.origin
                                          : ""
                                      }/cotizacion/remision/${ot.cotizacionToken}`
                                    )}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold transition shadow-2xs"
                                  >
                                    📲 WhatsApp
                                  </a>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between py-1 bg-amber-50/50 border border-dashed border-amber-200 rounded-xl px-3">
                              <p className="text-xs text-amber-900/80 italic">
                                {ot.estatus === "completada"
                                  ? "Orden concluida: Lista para generar remisión de entrega y cierre fiscal."
                                  : "Sin remisión generada. Puede emitirse en cualquier momento antes o después de la entrega."}
                              </p>
                              {!soloLectura && ot.cotizacionId && (
                                <button
                                  type="button"
                                  onClick={() => setOrdenParaRemision(ot)}
                                  className="text-xs font-bold text-sauce hover:underline ml-2"
                                >
                                  Generar ahora
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 4. Galería de Evidencia Fotográfica */}
                        <div className="border-t border-carbon/10 pt-4">
                          <h4 className="font-titular text-xs font-bold uppercase tracking-wider text-verde-profundo mb-2 flex items-center gap-1.5">
                            <span>📷</span> Evidencias Fotográficas de Ejecución ({ot.fotosEvidencia?.length || 0})
                          </h4>

                          {ot.fotosEvidencia && ot.fotosEvidencia.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                              {ot.fotosEvidencia.map((f, idx) => (
                                <a
                                  key={idx}
                                  href={f.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="group relative rounded-xl overflow-hidden border border-carbon/15 bg-carbon/5 aspect-square block shadow-2xs hover:shadow-md transition"
                                >
                                  <img
                                    src={f.url}
                                    alt={f.descripcion || "Evidencia OT"}
                                    className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                                  />
                                  <span className="absolute bottom-1 left-1 rounded-md bg-carbon/70 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 capitalize">
                                    {f.etapa}
                                  </span>
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-carbon/50 italic py-1">
                              Sin fotos de evidencia cargadas. Usa el botón "+ Foto" arriba para subir antes, durante o después.
                            </p>
                          )}
                        </div>

                        {/* 4. Notas de Conclusión */}
                        {ot.notasConclusion && (
                          <div className="border-t border-carbon/10 pt-3">
                            <span className="text-[10px] text-carbon/40 uppercase block font-semibold">
                              Notas de Conclusión y Entrega
                            </span>
                            <p className="text-xs text-carbon/80 mt-1 italic bg-carbon/5 p-3 rounded-xl border border-carbon/10">
                              "{ot.notasConclusion}"
                            </p>
                          </div>
                        )}

                        {/* 5. Acciones de Gestión / Eliminar */}
                        {!soloLectura && (
                          <div className="flex justify-end pt-3 border-t border-carbon/10">
                            <button
                              type="button"
                              onClick={() => {
                                setOrdenParaEliminar(ot);
                                setErrorEliminar(null);
                              }}
                              className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1.5 hover:underline py-1 px-2 rounded-lg hover:bg-red-50 transition"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                              <span>Eliminar esta orden de trabajo</span>
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Crear OT */}
      <ModalCrearOrdenTrabajo
        abierto={modalCrearOT}
        alCerrar={() => setModalCrearOT(false)}
        alCrear={() => {
          cargarDatos();
          alCrearOrden?.();
        }}
        expedienteId={expedienteId}
        prospectoId={prospectoId}
        cotizacionId={cotizacionId}
        tituloDefault={`Orden de Trabajo · ${clienteNombreDefault}`}
        tipoNegocioDefault={tipoNegocioDefault}
        asesores={asesores}
      />

      {/* Modal Registrar Recibo */}
      {ordenParaRecibo && (
        <ModalRegistrarRecibo
          abierto={!!ordenParaRecibo}
          alCerrar={() => {
            setOrdenParaRecibo(null);
            if (otExpandidaId) cargarDetalle(otExpandidaId);
          }}
          alCrear={(nuevoRecibo) => {
            setOrdenes((prev) =>
              prev.map((o) => {
                if (o.id === ordenParaRecibo.id) {
                  const nuevoPagado = (o.totalPagado || 0) + nuevoRecibo.monto;
                  return {
                    ...o,
                    totalPagado: nuevoPagado,
                    saldoRestante: Math.max(0, (o.totalCotizado || 0) - nuevoPagado),
                  };
                }
                return o;
              })
            );
            setDetalleOT((prev) => ({
              ...prev,
              recibos: [nuevoRecibo, ...prev.recibos],
            }));
          }}
          ordenId={ordenParaRecibo.id}
          ordenFolio={ordenParaRecibo.folio}
          clienteNombre={ordenParaRecibo.clienteNombre || clienteNombreDefault}
          clienteTelefono={ordenParaRecibo.clienteTelefono || clienteTelefonoDefault}
          totalCotizado={ordenParaRecibo.totalCotizado || 0}
          totalPagado={ordenParaRecibo.totalPagado || 0}
          saldoRestante={ordenParaRecibo.saldoRestante || 0}
        />
      )}

      {/* Modal Gestionar Garantía */}
      {ordenParaGarantia && (
        <ModalGestionarGarantia
          abierto={!!ordenParaGarantia}
          alCerrar={() => {
            setOrdenParaGarantia(null);
            if (otExpandidaId) cargarDetalle(otExpandidaId);
          }}
          alGuardar={(nuevaGarantia) => {
            setDetalleOT((prev) => ({
              ...prev,
              garantia: nuevaGarantia,
            }));
          }}
          ordenId={ordenParaGarantia.orden.id}
          ordenFolio={ordenParaGarantia.orden.folio}
          clienteNombre={ordenParaGarantia.orden.clienteNombre || clienteNombreDefault}
          clienteTelefono={ordenParaGarantia.orden.clienteTelefono || clienteTelefonoDefault}
          garantiaActual={ordenParaGarantia.garantia}
          tipoNegocio={ordenParaGarantia.orden.tipoNegocio}
        />
      )}

      {/* Modal Confirmar Conclusión */}
      {ordenParaConcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-carbon/10">
            <h3 className="font-titular text-lg font-bold text-verde-profundo mb-2">
              Concluir Orden de Trabajo ({ordenParaConcluir.folio})
            </h3>
            <p className="text-xs text-carbon/60 font-cuerpo mb-4">
              Ingresa los comentarios finales o acuerdos de entrega técnica con el cliente.
            </p>
            <textarea
              rows={4}
              value={notasConclusion}
              onChange={(e) => setNotasConclusion(e.target.value)}
              placeholder="Ej. Trabajos finalizados a entera satisfacción. Se realizaron pruebas de hermeticidad y se entregó área limpia..."
              className="w-full rounded-xl border border-carbon/20 p-3 text-xs text-carbon focus:border-sauce outline-none mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOrdenParaConcluir(null)}
                disabled={concluyendo}
                className="rounded-xl border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon/70 hover:bg-carbon/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarConclusion}
                disabled={concluyendo}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-xs font-bold transition shadow-xs flex items-center gap-1.5"
              >
                {concluyendo ? "Guardando..." : "✓ Confirmar y Finalizar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Generar Remisión / Factura */}
      {ordenParaRemision && (
        <ModalGenerarRemisionOT
          abierto={!!ordenParaRemision}
          alCerrar={() => {
            setOrdenParaRemision(null);
            if (otExpandidaId) cargarDetalle(otExpandidaId);
            cargarDatos();
          }}
          alGenerar={(nuevaRemision) => {
            setDetalleOT((prev) => ({
              ...prev,
              remisionFactura: nuevaRemision,
            }));
            setOrdenes((prev) =>
              prev.map((o) =>
                o.id === ordenParaRemision.id
                  ? { ...o, remisionFactura: nuevaRemision }
                  : o
              )
            );
          }}
          ordenId={ordenParaRemision.id}
          ordenFolio={ordenParaRemision.folio}
          cotizacionId={ordenParaRemision.cotizacionId}
          cotizacionToken={ordenParaRemision.cotizacionToken}
          clienteNombre={ordenParaRemision.clienteNombre || clienteNombreDefault}
          clienteTelefono={ordenParaRemision.clienteTelefono || clienteTelefonoDefault}
          remisionExistente={detalleOT.remisionFactura}
        />
      )}

      {/* Modal Notificar Entrega al Cliente (WhatsApp API, Web y Correo) */}
      {ordenParaNotificar && (
        <ModalNotificarEntregaOT
          abierto={!!ordenParaNotificar}
          alCerrar={() => setOrdenParaNotificar(null)}
          alNotificar={() => {
            cargarDatos();
            if (otExpandidaId) cargarDetalle(otExpandidaId);
          }}
          orden={ordenParaNotificar}
          garantia={detalleOT.garantia}
          remisionFactura={detalleOT.remisionFactura}
        />
      )}

      {/* Modal Confirmar Eliminación de Orden */}
      {ordenParaEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-carbon/10 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </div>
              <div>
                <h3 className="font-titular text-lg font-bold text-carbon">
                  ¿Eliminar Orden de Trabajo?
                </h3>
                <p className="text-xs font-mono font-bold text-sauce">
                  {ordenParaEliminar.folio} · {ordenParaEliminar.titulo}
                </p>
              </div>
            </div>

            <p className="text-xs text-carbon/70 leading-relaxed">
              ¿Estás seguro de que deseas eliminar permanentemente esta orden de trabajo? 
              Esta acción no se puede deshacer y desvinculará o removerá los recibos de pago y registros asociados a esta orden.
            </p>

            {errorEliminar && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                {errorEliminar}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={eliminando}
                onClick={() => {
                  setOrdenParaEliminar(null);
                  setErrorEliminar(null);
                }}
                className="rounded-xl border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon hover:bg-carbon/5 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={eliminando}
                onClick={handleConfirmarEliminar}
                className="rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {eliminando ? "Eliminando..." : "Sí, eliminar orden"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
