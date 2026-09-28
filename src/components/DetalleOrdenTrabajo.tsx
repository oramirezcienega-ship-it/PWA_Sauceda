"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  actualizarEstatusOrdenTrabajo,
  eliminarOrdenTrabajo,
  asignarAsesorEjecutor,
  agregarEvidenciaFotoOT,
  eliminarEvidenciaFotoOT,
  obtenerOrdenTrabajoPorId,
  enviarReciboPorWhatsApp,
  type OrdenTrabajo,
  type ReciboPago,
  type CartaGarantiaOT,
} from "@/app/actions/ordenes-trabajo";
import { ModalRegistrarRecibo } from "./ModalRegistrarRecibo";
import { ModalGestionarGarantia } from "./ModalGestionarGarantia";
import { ModalGenerarRemisionOT } from "./ModalGenerarRemisionOT";
import { ModalNotificarEntregaOT } from "./ModalNotificarEntregaOT";
import { ModalAsignarProveedorOT } from "./ModalAsignarProveedorOT";
import type { RemisionFactura, DocumentoProveedor } from "@/lib/types";

interface DetalleOrdenTrabajoProps {
  ordenInicial: OrdenTrabajo;
  recibosIniciales?: ReciboPago[];
  garantiaInicial?: CartaGarantiaOT | null;
  remisionInicial?: RemisionFactura | null;
  documentoProveedorInicial?: DocumentoProveedor | null;
  asesores?: Array<{ id: string; nombre: string }>;
  soloLectura?: boolean;
}

export function DetalleOrdenTrabajo({
  ordenInicial,
  recibosIniciales = [],
  garantiaInicial = null,
  remisionInicial = null,
  documentoProveedorInicial = null,
  asesores = [],
  soloLectura = false,
}: DetalleOrdenTrabajoProps) {
  const router = useRouter();
  const [orden, setOrden] = useState<OrdenTrabajo>(ordenInicial);
  const [recibos, setRecibos] = useState<ReciboPago[]>(recibosIniciales);
  const [garantia, setGarantia] = useState<CartaGarantiaOT | null>(garantiaInicial);
  const [remisionFactura, setRemisionFactura] = useState<RemisionFactura | null>(remisionInicial);
  const [documentoProveedor, setDocumentoProveedor] = useState<DocumentoProveedor | null>(documentoProveedorInicial);

  const [cargando, setCargando] = useState(false);

  // Modales
  const [modalRecibo, setModalRecibo] = useState(false);
  const [modalGarantia, setModalGarantia] = useState(false);
  const [modalRemision, setModalRemision] = useState(false);
  const [modalNotificar, setModalNotificar] = useState(false);
  const [modalProveedor, setModalProveedor] = useState(false);
  const [modalEliminar, setModalEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  // Conclusión
  const [modalConcluir, setModalConcluir] = useState(false);
  const [notasConclusion, setNotasConclusion] = useState("");
  const [concluyendo, setConcluyendo] = useState(false);

  // Fotos
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [progresoFotos, setProgresoFotos] = useState<{ actual: number; total: number } | null>(null);
  const [fotoEtapa, setFotoEtapa] = useState<"inicio" | "proceso" | "entrega">("proceso");
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  // Envío rápido de recibo por WhatsApp
  const [enviandoReciboId, setEnviandoReciboId] = useState<string | null>(null);

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(val);
  };

  const formatearFecha = (fechaStr?: string | null) => {
    if (!fechaStr) return "—";
    try {
      const d = new Date(fechaStr);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });
    } catch {
      return "—";
    }
  };

  const recargarDetalle = async () => {
    try {
      setCargando(true);
      const res = await obtenerOrdenTrabajoPorId(orden.id);
      if (res.orden) {
        setOrden(res.orden);
      }
      setRecibos(res.recibos || []);
      setGarantia(res.garantia || null);
      setRemisionFactura(res.remisionFactura || null);
      setDocumentoProveedor(res.documentoProveedor || null);
    } catch (e) {
      console.error("Error al recargar detalle:", e);
    } finally {
      setCargando(false);
    }
  };

  const handleCambiarEstatus = async (nuevoEstatus: "pendiente" | "en_proceso" | "completada" | "cancelada") => {
    if (nuevoEstatus === "completada") {
      setModalConcluir(true);
      return;
    }
    try {
      await actualizarEstatusOrdenTrabajo(orden.id, nuevoEstatus);
      setOrden((prev) => ({ ...prev, estatus: nuevoEstatus }));
    } catch (e) {
      alert("Error al actualizar el estado de la orden.");
    }
  };

  const handleConfirmarConclusion = async () => {
    try {
      setConcluyendo(true);
      await actualizarEstatusOrdenTrabajo(orden.id, "completada", {
        notasConclusion,
      });
      setOrden((prev) => ({
        ...prev,
        estatus: "completada",
        notasConclusion,
        fechaConclusion: new Date().toISOString(),
      }));
      setModalConcluir(false);
      await recargarDetalle();

      // Sugerir notificación o remisión
      if (!remisionFactura && orden.cotizacionId) {
        setTimeout(() => setModalRemision(true), 300);
      } else {
        setTimeout(() => setModalNotificar(true), 300);
      }
    } catch (e) {
      alert("Error al concluir la orden de trabajo.");
    } finally {
      setConcluyendo(false);
    }
  };

  const handleCambiarAsesor = async (nuevoAsesorId: string) => {
    try {
      await asignarAsesorEjecutor(orden.id, nuevoAsesorId || null);
      const asesorObj = asesores.find((a) => a.id === nuevoAsesorId);
      setOrden((prev) => ({
        ...prev,
        asesorEjecutorId: nuevoAsesorId || null,
        asesorEjecutorNombre: asesorObj?.nombre || "Sin asignar",
      }));
    } catch (e) {
      alert("Error al asignar técnico ejecutor.");
    }
  };

  const handleConfirmarEliminar = async () => {
    try {
      setEliminando(true);
      setErrorEliminar(null);
      const res = await eliminarOrdenTrabajo(orden.id);
      if (!res.ok) {
        setErrorEliminar(res.error || "No se pudo eliminar la orden.");
        return;
      }
      router.push("/ordenes-trabajo");
      router.refresh();
    } catch (err: any) {
      setErrorEliminar(err?.message || "Error al eliminar la orden.");
    } finally {
      setEliminando(false);
    }
  };

  const handleSubirFotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setSubiendoFoto(true);
      const total = files.length;
      for (let i = 0; i < total; i++) {
        setProgresoFotos({ actual: i + 1, total });
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("ordenTrabajoId", orden.id);
        formData.append("etapa", fotoEtapa);

        const res = await fetch("/api/ordenes-trabajo/fotos", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          throw new Error("Fallo al subir la fotografía");
        }
        const data = await res.json();
        await agregarEvidenciaFotoOT(orden.id, {
          url: data.url,
          fecha: new Date().toISOString(),
          etapa: fotoEtapa,
        });
      }
      await recargarDetalle();
    } catch (err) {
      alert("Error al subir una o más imágenes.");
    } finally {
      setSubiendoFoto(false);
      setProgresoFotos(null);
      e.target.value = "";
    }
  };

  const handleEliminarFoto = async (fotoUrl: string) => {
    if (!confirm("¿Deseas eliminar esta fotografía de evidencia?")) return;
    try {
      await eliminarEvidenciaFotoOT(orden.id, fotoUrl);
      setOrden((prev) => ({
        ...prev,
        fotosEvidencia: prev.fotosEvidencia.filter((f) => f.url !== fotoUrl),
      }));
    } catch (e) {
      alert("Error al eliminar la fotografía.");
    }
  };

  const handleEnviarReciboWA = async (reciboId: string) => {
    try {
      setEnviandoReciboId(reciboId);
      const res = await enviarReciboPorWhatsApp(reciboId);
      if (res.ok) {
        alert("Recibo enviado exitosamente por WhatsApp al cliente.");
      } else {
        alert(res.error || "No se pudo enviar el recibo.");
      }
    } catch (e: any) {
      alert(e?.message || "Error al enviar recibo.");
    } finally {
      setEnviandoReciboId(null);
    }
  };

  const porcentajeCobrado =
    (orden.totalCotizado || 0) > 0
      ? Math.min(100, Math.round(((orden.totalPagado || 0) / (orden.totalCotizado || 1)) * 100))
      : 0;

  const urlPortalEntrega =
    typeof window !== "undefined"
      ? `${window.location.origin}/orden-trabajo/entrega/${orden.token}`
      : `/orden-trabajo/entrega/${orden.token}`;

  return (
    <div className="space-y-6">
      {/* 1. Encabezado Principal y Resumen */}
      <div className="rounded-2xl border border-carbon/10 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold bg-sauce/15 text-sauce px-3 py-1 rounded-md border border-sauce/20">
                {orden.folio}
              </span>
              <span className="text-xs font-semibold text-carbon/60 uppercase tracking-wider bg-carbon/5 px-2.5 py-0.5 rounded">
                {(orden.tipoNegocio || "general").replace(/_/g, " ")}
              </span>
              {orden.expedienteId && (
                <Link
                  href={`/expediente/${orden.expedienteId}`}
                  className="text-xs font-semibold text-verde-profundo bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 px-2.5 py-0.5 rounded-md flex items-center gap-1 transition shadow-2xs"
                  title="Abrir expediente completo del cliente"
                >
                  <span>📁</span> Expediente
                </Link>
              )}
              {orden.prospectoId && (
                <Link
                  href={`/prospectos/${orden.prospectoId}`}
                  className="text-xs font-semibold text-carbon/80 bg-slate-100 hover:bg-slate-200 border border-carbon/15 px-2.5 py-0.5 rounded-md flex items-center gap-1 transition shadow-2xs"
                  title="Abrir ficha del prospecto en CRM"
                >
                  <span>👤</span> Prospecto
                </Link>
              )}
              {orden.notificadoClienteAt && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span>✓</span> Notificado por {orden.canalNotificacion || "WhatsApp"}
                </span>
              )}
            </div>
            <h1 className="font-titular text-2xl font-bold text-carbon mt-1">
              {orden.titulo}
            </h1>
            {orden.descripcion && (
              <p className="text-xs sm:text-sm text-carbon/70 font-cuerpo max-w-2xl">
                {orden.descripcion}
              </p>
            )}
          </div>

          {/* Selector de estado y botón eliminar */}
          {!soloLectura && (
            <div className="flex items-center gap-2">
              <select
                value={orden.estatus}
                onChange={(e) => handleCambiarEstatus(e.target.value as any)}
                className="rounded-xl border border-carbon/20 px-3 py-2 text-xs font-bold text-carbon bg-white focus:border-sauce outline-none shadow-2xs cursor-pointer"
              >
                <option value="pendiente">⏳ Pendiente</option>
                <option value="en_proceso">⚙️ En Proceso</option>
                <option value="completada">✓ Completada</option>
                <option value="cancelada">✕ Cancelada</option>
              </select>

              <button
                type="button"
                onClick={() => setModalEliminar(true)}
                className="p-2 rounded-xl border border-carbon/20 text-carbon/40 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition shadow-2xs"
                title="Eliminar orden de trabajo"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Datos Clave: Cliente, Fechas, Asesor, Proveedor */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 border-t border-carbon/5 pt-4 text-xs font-cuerpo">
          <div>
            <span className="text-[10px] text-carbon/40 uppercase font-bold block mb-1">
              Cliente Beneficiario
            </span>
            <div className="font-bold text-carbon text-sm">
              {orden.clienteNombre || "Cliente General"}
            </div>
            {orden.clienteTelefono && (
              <div className="font-mono text-carbon/60 mt-0.5">
                📱 {orden.clienteTelefono}
              </div>
            )}
            {orden.clienteDireccion && (
              <div className="text-[11px] text-carbon/50 mt-0.5 truncate" title={orden.clienteDireccion}>
                📍 {orden.clienteDireccion}
              </div>
            )}

            {/* Accesos directos a Expediente y Prospecto */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-carbon/10">
              {orden.expedienteId && (
                <Link
                  href={`/expediente/${orden.expedienteId}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-sauce/10 hover:bg-sauce hover:text-white px-2.5 py-1 text-[11px] font-bold text-sauce border border-sauce/20 transition shadow-2xs"
                  title="Ver expediente del cliente"
                >
                  <span>📁</span> Ver Expediente
                </Link>
              )}
              {orden.prospectoId && (
                <Link
                  href={`/prospectos/${orden.prospectoId}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-[11px] font-bold text-carbon/80 border border-carbon/15 transition shadow-2xs"
                  title="Ver ficha del prospecto en CRM"
                >
                  <span>👤</span> Ver Prospecto
                </Link>
              )}
              {!orden.expedienteId && !orden.prospectoId && (
                <span className="text-[10px] text-carbon/40 italic">Sin expediente ni prospecto vinculado</span>
              )}
            </div>
          </div>

          <div>
            <span className="text-[10px] text-carbon/40 uppercase font-bold block mb-1">
              Técnico / Asesor Ejecutor
            </span>
            {!soloLectura ? (
              <select
                value={orden.asesorEjecutorId || ""}
                onChange={(e) => handleCambiarAsesor(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 px-2.5 py-1.5 text-xs text-carbon font-semibold bg-white outline-none focus:border-sauce"
              >
                <option value="">-- Sin Asignar --</option>
                {asesores.map((a) => (
                  <option key={a.id} value={a.id}>
                    👤 {a.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <div className="font-semibold text-carbon text-xs mt-1">
                👤 {orden.asesorEjecutorNombre || "Sin asignar"}
              </div>
            )}
          </div>

          <div>
            <span className="text-[10px] text-carbon/40 uppercase font-bold block mb-1">
              Fechas de Obra
            </span>
            <div className="font-mono text-carbon/80">
              📅 Prog: {orden.fechaProgramada || "Sin definir"}
            </div>
            {orden.fechaConclusion ? (
              <div className="font-mono text-emerald-700 font-bold mt-0.5">
                ✓ Concluyó: {formatearFecha(orden.fechaConclusion)}
              </div>
            ) : (
              <div className="text-carbon/40 italic text-[11px] mt-0.5">
                ⚙️ En proceso técnico
              </div>
            )}
          </div>

          <div>
            <span className="text-[10px] text-carbon/40 uppercase font-bold block mb-1">
              Subcontratista / Proveedor
            </span>
            {orden.proveedorId ? (
              <div className="space-y-0.5">
                <div className="font-semibold text-carbon flex items-center gap-1">
                  <span>🧾</span>
                  <span>{orden.proveedorNombre}</span>
                </div>
                {orden.costoProveedor != null && (
                  <div className="font-mono text-xs text-purple-700 font-bold">
                    Costo: {formatMoneda(orden.costoProveedor)}
                  </div>
                )}
                {!soloLectura && (
                  <button
                    type="button"
                    onClick={() => setModalProveedor(true)}
                    className="text-[11px] text-sauce hover:underline font-semibold"
                  >
                    Editar asignación
                  </button>
                )}
              </div>
            ) : !soloLectura ? (
              <button
                type="button"
                onClick={() => setModalProveedor(true)}
                className="rounded-lg bg-sauce/10 text-sauce hover:bg-sauce hover:text-white px-2.5 py-1 text-xs font-semibold transition"
              >
                + Asignar Proveedor
              </button>
            ) : (
              <span className="text-carbon/40 italic">Sin proveedor asignado</span>
            )}
          </div>
        </div>

        {/* Barra Financiera de Cobranza */}
        {(orden.totalCotizado || 0) > 0 && (
          <div className="bg-carbon/5 p-4 rounded-xl border border-carbon/10 space-y-2">
            <div className="flex flex-wrap justify-between items-center text-xs">
              <span className="font-bold text-carbon/70">
                Avance de Cobranza de la Orden ({porcentajeCobrado}%)
              </span>
              <div className="font-mono text-xs space-x-3">
                <span className="text-carbon/60">
                  Total: <strong>{formatMoneda(orden.totalCotizado || 0)}</strong>
                </span>
                <span className="text-emerald-700">
                  Cobrado: <strong>{formatMoneda(orden.totalPagado || 0)}</strong>
                </span>
                <span className="text-amber-800 font-bold">
                  Resta: {formatMoneda(orden.saldoRestante || 0)}
                </span>
              </div>
            </div>
            <div className="h-2.5 w-full rounded-full bg-carbon/15 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  porcentajeCobrado >= 100
                    ? "bg-emerald-600"
                    : porcentajeCobrado > 0
                    ? "bg-amber-500"
                    : "bg-carbon/20"
                }`}
                style={{ width: `${porcentajeCobrado}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. Barra de Acciones Operativas Rápidas */}
      {!soloLectura && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-carbon/10 shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setModalRecibo(true)}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
            >
              <span>💵</span> + Registrar Recibo
            </button>

            <button
              type="button"
              onClick={() => setModalGarantia(true)}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
            >
              <span>🛡️</span> Póliza de Garantía
            </button>

            <button
              type="button"
              onClick={() => setModalNotificar(true)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                orden.estatus === "completada"
                  ? "bg-emerald-700 hover:bg-emerald-800 text-white"
                  : "bg-white border border-carbon/20 text-carbon hover:bg-carbon/5"
              }`}
            >
              <span>📢</span> {orden.notificadoClienteAt ? "Re-notificar Entrega" : "Notificar Entrega"}
            </button>

            <button
              type="button"
              onClick={() => setModalRemision(true)}
              className="rounded-xl bg-sauce hover:bg-verde-profundo text-white px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
            >
              <span>🧾</span> {remisionFactura ? "Ver/Editar Remisión" : "+ Remisión Fiscal"}
            </button>

            {orden.expedienteId && (
              <Link
                href={`/expediente/${orden.expedienteId}`}
                className="rounded-xl border border-carbon/20 bg-white hover:bg-slate-50 text-carbon px-3 py-2 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                title="Abrir expediente completo"
              >
                <span>📁</span> Expediente
              </Link>
            )}

            {orden.prospectoId && (
              <Link
                href={`/prospectos/${orden.prospectoId}`}
                className="rounded-xl border border-carbon/20 bg-white hover:bg-slate-50 text-carbon px-3 py-2 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                title="Abrir ficha del prospecto en CRM"
              >
                <span>👤</span> Prospecto
              </Link>
            )}
          </div>

          {/* Subida rápida de fotos */}
          <div className="flex items-center gap-2 text-xs">
            <select
              value={fotoEtapa}
              onChange={(e) => setFotoEtapa(e.target.value as any)}
              className="rounded-xl border border-carbon/20 px-2.5 py-1.5 text-xs text-carbon bg-white outline-none"
            >
              <option value="inicio">Foto: Inicio</option>
              <option value="proceso">Foto: Proceso</option>
              <option value="entrega">Foto: Entrega</option>
            </select>

            <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-carbon/20 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 text-xs font-bold text-carbon transition shadow-2xs">
              <span>📷</span>
              <span>{subiendoFoto ? "Subiendo..." : "+ Subir Fotos"}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={subiendoFoto}
                onChange={handleSubirFotos}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      {/* 3. Portal de Entrega del Cliente (Público) */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌐</span>
            <span className="font-titular font-bold text-blue-950 text-sm">
              Portal Digital de Entrega al Cliente
            </span>
          </div>
          <p className="text-xs text-blue-900/80 font-cuerpo max-w-xl">
            Enlace web seguro y público para que el cliente consulte su reporte de obra, fotos de evidencia, recibos de pago y póliza de garantía.
          </p>
          <div className="font-mono text-xs text-blue-800 break-all select-all pt-1">
            {urlPortalEntrega}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/orden-trabajo/entrega/${orden.token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-blue-300 bg-white hover:bg-blue-50 text-blue-900 font-bold px-3.5 py-2 text-xs transition shadow-2xs inline-flex items-center gap-1.5"
          >
            <span>↗</span> Abrir Portal
          </a>

          {orden.clienteTelefono && (
            <button
              type="button"
              onClick={() => setModalNotificar(true)}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 text-xs transition shadow-2xs inline-flex items-center gap-1.5"
            >
              <span>💬</span> Enviar por WhatsApp
            </button>
          )}
        </div>
      </div>

      {/* 4. Grid de Módulos: Recibos Oficiales & Póliza de Garantía */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recibos de Pago */}
        <div className="rounded-2xl border border-carbon/10 bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-carbon/5 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">💳</span>
              <h2 className="font-titular font-bold text-carbon text-sm">
                Recibos Oficiales de Pago ({recibos.length})
              </h2>
            </div>
            {!soloLectura && (
              <button
                type="button"
                onClick={() => setModalRecibo(true)}
                className="text-xs text-emerald-700 hover:underline font-bold"
              >
                + Emitir Recibo
              </button>
            )}
          </div>

          {recibos.length === 0 ? (
            <div className="py-8 text-center text-xs text-carbon/40 italic">
              Aún no se han emitido recibos oficiales de pago para esta orden.
            </div>
          ) : (
            <div className="divide-y divide-carbon/5 max-h-80 overflow-y-auto pr-1">
              {recibos.map((r) => (
                <div key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/50">
                        {r.folio}
                      </span>
                      <span className="font-mono font-bold text-carbon">
                        {formatMoneda(r.monto)}
                      </span>
                    </div>
                    <div className="text-[11px] text-carbon/50 mt-0.5">
                      {formatearFecha(r.fechaPago || r.createdAt)} • {((r.metodoPago || (r as any).formaPago) || "Pago").replace(/_/g, " ")} {r.concepto ? `(${r.concepto})` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={`/recibo/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-carbon/15 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-carbon transition"
                      title="Ver e imprimir recibo PDF"
                    >
                      PDF
                    </a>
                    {r.clienteTelefono && (
                      <button
                        type="button"
                        disabled={enviandoReciboId === r.id}
                        onClick={() => handleEnviarReciboWA(r.id)}
                        className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50"
                        title="Enviar recibo por WhatsApp"
                      >
                        {enviandoReciboId === r.id ? "Enviando..." : "WA"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Póliza de Garantía */}
        <div className="rounded-2xl border border-carbon/10 bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-carbon/5 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🛡️</span>
              <h2 className="font-titular font-bold text-carbon text-sm">
                Póliza de Garantía Oficial
              </h2>
            </div>
            {!soloLectura && (
              <button
                type="button"
                onClick={() => setModalGarantia(true)}
                className="text-xs text-amber-700 hover:underline font-bold"
              >
                {garantia ? "Editar Póliza" : "+ Emitir Póliza"}
              </button>
            )}
          </div>

          {!garantia ? (
            <div className="py-8 text-center text-xs text-carbon/40 italic">
              No se ha emitido póliza de garantía para esta orden.
            </div>
          ) : (
            <div className="space-y-2 text-xs font-cuerpo bg-amber-50/40 p-4 rounded-xl border border-amber-200/50">
              <div className="flex justify-between items-center">
                <span className="font-bold text-amber-900 text-sm">
                  {garantia.titulo || "Póliza de Garantía"}
                </span>
                <span className="font-mono text-xs font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                  {garantia.anosGarantia} año(s) vigencia
                </span>
              </div>
              <div className="text-carbon/60 text-[11px]">
                {garantia.fechaInicio && (
                  <span>Vigencia: {formatearFecha(garantia.fechaInicio)} hasta {garantia.fechaVencimiento ? formatearFecha(garantia.fechaVencimiento) : "conclusión"}</span>
                )}
              </div>
              {garantia.token && (
                <div className="pt-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-amber-900/60">
                    Token: {garantia.token.slice(0, 12)}...
                  </span>
                  <a
                    href={`/garantia/${garantia.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 font-bold text-xs transition"
                  >
                    Ver Póliza Digital
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 5. Grid de Documentos Fiscales y Proveedor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Remisión de Entrega / Factura Fiscal */}
        <div className="rounded-2xl border border-carbon/10 bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-carbon/5 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧾</span>
              <h2 className="font-titular font-bold text-carbon text-sm">
                Remisión / Factura Fiscal
              </h2>
            </div>
            {!soloLectura && (
              <button
                type="button"
                onClick={() => setModalRemision(true)}
                className="text-xs text-sauce hover:underline font-bold"
              >
                {remisionFactura ? "Editar Remisión" : "+ Generar Remisión"}
              </button>
            )}
          </div>

          {!remisionFactura ? (
            <div className="py-8 text-center text-xs text-carbon/40 italic">
              No se ha generado remisión de entrega o factura para esta orden.
            </div>
          ) : (
            <div className="space-y-2 text-xs font-cuerpo bg-emerald-50/40 p-4 rounded-xl border border-emerald-200/50">
              <div className="flex justify-between items-center">
                <span className="font-mono font-bold text-emerald-900 text-sm">
                  {remisionFactura.folio}
                </span>
                <span className="uppercase font-bold text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  {remisionFactura.tipo}
                </span>
              </div>
              <div className="flex justify-between text-carbon/70 text-xs">
                <span>Fecha: {remisionFactura.fecha}</span>
                <span className="font-mono font-bold text-carbon">
                  Total: {formatMoneda(remisionFactura.montoTotal)}
                </span>
              </div>
              {(orden.entregaToken || orden.cotizacionToken) && (
                <div className="pt-2 text-right">
                  <a
                    href={
                      orden.entregaToken
                        ? `/orden-trabajo/remision/${orden.entregaToken}`
                        : `/cotizacion/remision/${orden.cotizacionToken}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded-lg bg-sauce hover:bg-verde-profundo text-white px-3 py-1 font-bold text-xs transition"
                  >
                    Ver Remisión PDF
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Costo de Proveedor / Subcontratista */}
        <div className="rounded-2xl border border-carbon/10 bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-carbon/5 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🚚</span>
              <h2 className="font-titular font-bold text-carbon text-sm">
                Costo de Proveedor / Subcontratista
              </h2>
            </div>
            {!soloLectura && (
              <button
                type="button"
                onClick={() => setModalProveedor(true)}
                className="text-xs text-purple-700 hover:underline font-bold"
              >
                {orden.proveedorId ? "Editar Asignación" : "+ Asignar Proveedor"}
              </button>
            )}
          </div>

          {!orden.proveedorId ? (
            <div className="py-8 text-center text-xs text-carbon/40 italic">
              No hay subcontratista o proveedor asignado a esta orden.
            </div>
          ) : (
            <div className="space-y-2 text-xs font-cuerpo bg-purple-50/40 p-4 rounded-xl border border-purple-200/50">
              <div className="flex justify-between items-center">
                <span className="font-bold text-purple-950 text-sm">
                  {orden.proveedorNombre}
                </span>
                {orden.costoProveedor != null && (
                  <span className="font-mono font-bold text-purple-800 text-sm">
                    {formatMoneda(orden.costoProveedor)}
                  </span>
                )}
              </div>
              {orden.proveedorConcepto && (
                <div className="text-carbon/60 text-xs">
                  Concepto: {orden.proveedorConcepto}
                </div>
              )}
              {documentoProveedor && (
                <div className="pt-2 text-[11px] text-purple-900 border-t border-purple-200/40 flex justify-between">
                  <span>Documento: <strong>{documentoProveedor.folio}</strong></span>
                  <span className="font-semibold text-emerald-700 capitalize">{documentoProveedor.estatus}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 6. Evidencias Fotográficas de Ejecución */}
      <div className="rounded-2xl border border-carbon/10 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-carbon/5 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📸</span>
            <h2 className="font-titular font-bold text-carbon text-base">
              Evidencias Fotográficas ({orden.fotosEvidencia?.length || 0})
            </h2>
          </div>

          {!soloLectura && (
            <div className="flex items-center gap-2">
              <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-sauce hover:bg-verde-profundo px-3.5 py-1.5 text-xs font-bold text-white transition shadow-2xs">
                <span>+</span>
                <span>{subiendoFoto ? `Subiendo (${progresoFotos?.actual || 0}/${progresoFotos?.total || 0})...` : "Cargar Fotos"}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={subiendoFoto}
                  onChange={handleSubirFotos}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        {(!orden.fotosEvidencia || orden.fotosEvidencia.length === 0) ? (
          <div className="py-12 text-center text-xs text-carbon/40 italic">
            No se han cargado fotografías de evidencia (antes, durante o después de la obra).
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {orden.fotosEvidencia.map((f, idx) => (
              <div
                key={f.url || idx}
                className="group relative rounded-xl overflow-hidden border border-carbon/10 bg-slate-100 aspect-square shadow-2xs"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url}
                  alt={`Evidencia ${idx + 1}`}
                  onClick={() => setFotoAmpliada(f.url)}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105 cursor-pointer"
                  loading="lazy"
                />
                <div className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-xs text-white px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider">
                  {f.etapa || "Obra"}
                </div>
                {!soloLectura && (
                  <button
                    type="button"
                    onClick={() => handleEliminarFoto(f.url)}
                    className="absolute top-1.5 right-1.5 bg-red-600/80 hover:bg-red-700 text-white rounded-md p-1 text-[10px] opacity-0 group-hover:opacity-100 transition shadow-sm"
                    title="Eliminar foto"
                  >
                    ✕
                  </button>
                )}
                {f.fecha && (
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-[9px] font-mono text-white/90">
                    {formatearFecha(f.fecha)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Foto Ampliada */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setFotoAmpliada(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fotoAmpliada}
              alt="Evidencia ampliada"
              className="max-h-[85vh] rounded-xl object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setFotoAmpliada(null)}
              className="absolute top-3 right-3 rounded-full bg-black/60 text-white p-2 text-xs hover:bg-black"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Modal Concluir Orden */}
      {modalConcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="font-titular text-lg font-bold text-carbon">
              Concluir Orden de Trabajo: {orden.folio}
            </h3>
            <p className="text-xs text-carbon/60 font-cuerpo">
              Al marcar como completada, se registrará la fecha actual de entrega y se generará automáticamente el registro contable del proveedor asignado (si aplica).
            </p>
            <div>
              <label className="block text-[11px] font-bold text-carbon/70 uppercase mb-1">
                Notas de Conclusión o Cierre Técnico
              </label>
              <textarea
                value={notasConclusion}
                onChange={(e) => setNotasConclusion(e.target.value)}
                placeholder="Detalles sobre los acabados entregados o conformidad del cliente..."
                rows={3}
                className="w-full rounded-xl border border-carbon/20 p-2.5 text-xs text-carbon outline-none focus:border-sauce"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalConcluir(false)}
                className="rounded-xl border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={concluyendo}
                onClick={handleConfirmarConclusion}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold transition shadow-xs disabled:opacity-50"
              >
                {concluyendo ? "Guardando..." : "Confirmar Conclusión ✓"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Eliminar Orden */}
      {modalEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="font-titular text-lg font-bold text-red-600">
              ¿Eliminar Orden de Trabajo?
            </h3>
            <p className="text-xs text-carbon/70 font-cuerpo">
              Se eliminará permanentemente la orden <strong>{orden.folio}</strong> y sus evidencias asociadas. Esta acción no se puede deshacer.
            </p>
            {errorEliminar && (
              <div className="text-xs text-red-600 font-semibold bg-red-50 p-2.5 rounded-lg border border-red-200">
                {errorEliminar}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalEliminar(false)}
                className="rounded-xl border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={eliminando}
                onClick={handleConfirmarEliminar}
                className="rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-xs font-bold transition shadow-xs disabled:opacity-50"
              >
                {eliminando ? "Eliminando..." : "Sí, Eliminar Orden"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modales de Gestión */}
      <ModalRegistrarRecibo
        abierto={modalRecibo}
        alCerrar={() => setModalRecibo(false)}
        alRegistrar={() => {
          setModalRecibo(false);
          recargarDetalle();
        }}
        ordenId={orden.id}
        ordenFolio={orden.folio}
        clienteNombre={orden.clienteNombre}
        clienteTelefono={orden.clienteTelefono}
        totalCotizado={orden.totalCotizado || 0}
        saldoRestante={orden.saldoRestante || 0}
      />

      <ModalGestionarGarantia
        abierto={modalGarantia}
        alCerrar={() => setModalGarantia(false)}
        alGuardar={(g) => {
          setGarantia(g);
          setModalGarantia(false);
          recargarDetalle();
        }}
        ordenId={orden.id}
        ordenFolio={orden.folio}
        clienteNombre={orden.clienteNombre}
        clienteTelefono={orden.clienteTelefono}
        garantiaActual={garantia}
        tipoNegocio={orden.tipoNegocio || "construccion"}
      />

      <ModalGenerarRemisionOT
        abierto={modalRemision}
        alCerrar={() => setModalRemision(false)}
        alGenerar={(r) => {
          setRemisionFactura(r);
          setModalRemision(false);
          recargarDetalle();
        }}
        ordenId={orden.id}
        ordenFolio={orden.folio}
        clienteNombre={orden.clienteNombre}
        clienteTelefono={orden.clienteTelefono}
        clienteDireccion={orden.clienteDireccion}
        totalCotizado={orden.totalCotizado || 0}
      />

      <ModalNotificarEntregaOT
        abierto={modalNotificar}
        alCerrar={() => setModalNotificar(false)}
        alNotificar={() => {
          setModalNotificar(false);
          recargarDetalle();
        }}
        orden={orden}
        garantia={garantia}
        remisionFactura={remisionFactura}
      />

      <ModalAsignarProveedorOT
        abierto={modalProveedor}
        alCerrar={() => setModalProveedor(false)}
        alAsignar={(p) => {
          setOrden((prev) => ({
            ...prev,
            proveedorId: p.proveedorId,
            proveedorNombre: p.proveedorNombre,
            costoProveedor: p.costoProveedor,
            proveedorConcepto: p.concepto,
          }));
          setModalProveedor(false);
          recargarDetalle();
        }}
        ordenId={orden.id}
        ordenFolio={orden.folio}
        proveedorIdActual={orden.proveedorId}
        costoProveedorActual={orden.costoProveedor}
        conceptoActual={orden.proveedorConcepto}
      />
    </div>
  );
}
