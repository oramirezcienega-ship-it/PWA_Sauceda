"use client";

import { useEffect, useState, useTransition } from "react";
import {
  obtenerCampanasDeContacto,
  inscribirContactoEnCampanaMautic,
  desuscribirContactoDeCampanaMautic,
} from "@/app/actions/mautic";
import { EnrolamientoMautic, MauticCampana } from "@/lib/types";

interface WidgetCampanasMauticProps {
  prospectoId?: string | null;
  expedienteId?: string | null;
  telefono?: string | null;
  correo?: string | null;
  nombreDefault?: string | null;
}

export function WidgetCampanasMautic({
  prospectoId,
  expedienteId,
  telefono,
  correo,
  nombreDefault,
}: WidgetCampanasMauticProps) {
  const [cargando, setCargando] = useState(true);
  const [enrolamientos, setEnrolamientos] = useState<EnrolamientoMautic[]>([]);
  const [campanasDisponibles, setCampanasDisponibles] = useState<MauticCampana[]>([]);
  const [mostrarModalAgregar, setMostrarModalAgregar] = useState(false);
  const [campanaSeleccionadaId, setCampanaSeleccionadaId] = useState("");
  const [notasEnrolamiento, setNotasEnrolamiento] = useState("");
  const [isPending, startTransition] = useTransition();
  const [mensajeToast, setMensajeToast] = useState<{
    tipo: "exito" | "error";
    texto: string;
  } | null>(null);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const res = await obtenerCampanasDeContacto({
        prospectoId,
        expedienteId,
        telefono,
        correo,
      });

      if (res.success && res.data) {
        setEnrolamientos(res.data.enrolamientos);
        setCampanasDisponibles(res.data.campanasDisponibles);
        if (res.data.campanasDisponibles.length > 0 && !campanaSeleccionadaId) {
          setCampanaSeleccionadaId(res.data.campanasDisponibles[0].id);
        }
      } else if (res.error) {
        console.warn("Aviso al cargar campañas Mautic:", res.error);
      }
    } catch (err) {
      console.error("Error al cargar campañas Mautic:", err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarDatos();
  }, [prospectoId, expedienteId, telefono, correo]);

  const mostrarAviso = (tipo: "exito" | "error", texto: string) => {
    setMensajeToast({ tipo, texto });
    setTimeout(() => setMensajeToast(null), 4500);
  };

  const handleInscribir = () => {
    if (!campanaSeleccionadaId) {
      mostrarAviso("error", "Por favor selecciona una campaña.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await inscribirContactoEnCampanaMautic({
          campanaId: campanaSeleccionadaId,
          prospectoId,
          expedienteId,
          telefono: telefono || "",
          correo: correo || "",
          nombre: nombreDefault || "",
          notas: notasEnrolamiento,
        });

        if (res.success) {
          mostrarAviso("exito", res.aviso || "Contacto inscrito en la campaña.");
          setMostrarModalAgregar(false);
          setNotasEnrolamiento("");
          await cargarDatos();
        } else {
          mostrarAviso("error", res.error || "No se pudo inscribir en la campaña.");
        }
      } catch (err: any) {
        mostrarAviso("error", err?.message || "Error al procesar inscripción.");
      }
    });
  };

  const handleDesuscribir = (enrolamiento: EnrolamientoMautic) => {
    const confirmar = window.confirm(
      `¿Deseas retirar a este contacto de la campaña "${enrolamiento.campanaNombre}"?\n\nDejará de recibir mensajes y secuencias de esta automatización.`
    );
    if (!confirmar) return;

    startTransition(async () => {
      try {
        const res = await desuscribirContactoDeCampanaMautic({
          enrolamientoId: enrolamiento.id,
          campanaId: enrolamiento.campanaId,
          prospectoId,
          expedienteId,
          telefono: enrolamiento.telefono || telefono || "",
          correo: enrolamiento.correo || correo || "",
          motivo: "Retirado manualmente desde CRM",
        });

        if (res.success) {
          mostrarAviso("exito", "Contacto retirado de la campaña.");
          await cargarDatos();
        } else {
          mostrarAviso("error", res.error || "No se pudo retirar de la campaña.");
        }
      } catch (err: any) {
        mostrarAviso("error", err?.message || "Error al desuscribir.");
      }
    });
  };

  const campanasActivas = enrolamientos.filter((e) => e.estado === "activo");
  const campanasInactivas = enrolamientos.filter((e) => e.estado !== "activo");

  const formatearFecha = (fechaIso?: string | null) => {
    if (!fechaIso) return "";
    try {
      const d = new Date(fechaIso);
      return d.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return fechaIso;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-carbon/10 shadow-xs p-4 sm:p-5 transition">
      {/* Header del Widget */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-gray-100 pb-3.5 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-600 border border-orange-500/20 flex items-center justify-center text-lg font-bold shadow-2xs">
            🟠
          </div>
          <div>
            <h3 className="font-titular text-sm font-bold text-carbon flex items-center gap-2">
              Campañas Mautic & Automatizaciones
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-bold border border-orange-200">
                {campanasActivas.length} activa{campanasActivas.length !== 1 ? "s" : ""}
              </span>
            </h3>
            <p className="text-[11px] text-carbon/50">
              Nutrición de leads, boletines y campañas masivas activas
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMostrarModalAgregar(!mostrarModalAgregar)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
        >
          <span>+</span> Inscribir en Campaña
        </button>
      </div>

      {/* Alerta / Toast flotante dentro del widget */}
      {mensajeToast && (
        <div
          className={`mb-3 p-2.5 rounded-xl text-xs font-medium flex items-center justify-between border ${
            mensajeToast.tipo === "exito"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          <span>{mensajeToast.texto}</span>
          <button
            type="button"
            onClick={() => setMensajeToast(null)}
            className="text-carbon/40 hover:text-carbon font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Panel Desplegable: Agregar a Campaña */}
      {mostrarModalAgregar && (
        <div className="mb-4 p-4 rounded-xl bg-orange-50/60 border border-orange-200/80 shadow-inner animate-fadeIn">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-orange-950 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎯</span> Seleccionar Campaña de Mautic
            </h4>
            <button
              type="button"
              onClick={() => setMostrarModalAgregar(false)}
              className="text-xs text-orange-900/50 hover:text-orange-950"
            >
              Cancelar ✕
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-carbon/70 mb-1">
                Campaña disponible:
              </label>
              <select
                value={campanaSeleccionadaId}
                onChange={(e) => setCampanaSeleccionadaId(e.target.value)}
                className="w-full text-xs font-medium rounded-xl border border-orange-300 bg-white p-2.5 text-carbon shadow-2xs focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
              >
                {campanasDisponibles.map((camp) => (
                  <option key={camp.id} value={camp.id}>
                    {camp.nombre} ({camp.canal.toUpperCase()})
                  </option>
                ))}
              </select>
              {campanaSeleccionadaId && (
                <p className="mt-1 text-[11px] text-carbon/60 italic">
                  {campanasDisponibles.find((c) => c.id === campanaSeleccionadaId)?.descripcion}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-carbon/70 mb-1">
                Notas o motivo de inscripción (opcional):
              </label>
              <input
                type="text"
                value={notasEnrolamiento}
                onChange={(e) => setNotasEnrolamiento(e.target.value)}
                placeholder="Ej. Interesado en 3 MSI tras llamada con asesor..."
                className="w-full text-xs rounded-xl border border-orange-300 bg-white p-2 text-carbon focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMostrarModalAgregar(false)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-carbon hover:bg-gray-100"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleInscribir}
                disabled={isPending}
                className="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isPending ? "Inscribiendo..." : "Confirmar Inscripción"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Listado de Enrolamientos */}
      {cargando ? (
        <div className="py-8 text-center text-xs text-carbon/40 flex items-center justify-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          Cargando campañas de Mautic...
        </div>
      ) : enrolamientos.length === 0 ? (
        <div className="py-6 text-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
          <p className="text-xs text-carbon/50 mb-2">
            Este contacto no está inscrito en ninguna campaña de Mautic actualmente.
          </p>
          <button
            type="button"
            onClick={() => setMostrarModalAgregar(true)}
            className="inline-flex items-center gap-1 text-xs text-orange-600 font-bold hover:underline"
          >
            + Inscribir a su primera campaña ahora
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Campañas Activas */}
          {campanasActivas.map((enrol) => (
            <div
              key={enrol.id}
              className="p-3.5 rounded-xl border border-orange-200/80 bg-orange-50/30 hover:bg-orange-50/60 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-titular text-xs font-bold text-carbon">
                    {enrol.campanaNombre}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      enrol.canal === "whatsapp"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : enrol.canal === "email"
                        ? "bg-sky-50 text-sky-800 border-sky-200"
                        : "bg-purple-50 text-purple-800 border-purple-200"
                    }`}
                  >
                    {enrol.canal === "whatsapp" ? "💬 WhatsApp" : enrol.canal === "email" ? "✉️ Correo" : "🌐 Omnicanal"}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    Activo
                  </span>
                </div>

                {enrol.campanaDescripcion && (
                  <p className="text-[11px] text-carbon/60 line-clamp-1">
                    {enrol.campanaDescripcion}
                  </p>
                )}

                {/* Trazabilidad de entrega y lectura del mensaje */}
                <div className="flex items-center gap-3 pt-1 text-[11px] text-carbon/50 flex-wrap">
                  <span>📅 Inscrito: {formatearFecha(enrol.enroladoAt)}</span>

                  {enrol.leidoAt ? (
                    <span className="inline-flex items-center gap-1 text-indigo-700 font-semibold bg-indigo-50 border border-indigo-200/70 px-2 py-0.5 rounded-md">
                      <span className="text-blue-600 font-bold">✓✓</span> Abierto: {formatearFecha(enrol.leidoAt)}
                    </span>
                  ) : enrol.entregadoAt ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 rounded-md">
                      <span className="text-emerald-600 font-bold">✓</span> Entregado: {formatearFecha(enrol.entregadoAt)}
                    </span>
                  ) : enrol.ultimoMensajeAt ? (
                    <span className="text-carbon/60">
                      Último envío: {formatearFecha(enrol.ultimoMensajeAt)}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Botón de Retiro */}
              <div className="flex items-center gap-2 shrink-0 sm:self-center">
                <button
                  type="button"
                  onClick={() => handleDesuscribir(enrol)}
                  disabled={isPending}
                  className="px-2.5 py-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 text-xs font-semibold transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-2xs"
                  title="Sacar a este contacto de la campaña"
                >
                  Quitar de Campaña
                </button>
              </div>
            </div>
          ))}

          {/* Historial de Campañas Desuscritas / Completadas */}
          {campanasInactivas.length > 0 && (
            <div className="pt-2">
              <details className="group">
                <summary className="text-[11px] font-semibold text-carbon/50 hover:text-carbon cursor-pointer flex items-center gap-1 select-none">
                  <span className="transition group-open:rotate-90">▸</span>
                  Ver historial de campañas anteriores ({campanasInactivas.length})
                </summary>
                <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-gray-100">
                  {campanasInactivas.map((enrol) => (
                    <div
                      key={enrol.id}
                      className="p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs flex items-center justify-between gap-2"
                    >
                      <div>
                        <span className="font-semibold text-carbon/70 line-through">
                          {enrol.campanaNombre}
                        </span>
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 uppercase font-mono">
                          {enrol.estado}
                        </span>
                        <p className="text-[10px] text-carbon/40 mt-0.5">
                          Desuscrito: {formatearFecha(enrol.desuscritoAt || enrol.enroladoAt)}
                          {enrol.notas ? ` · Motivo: ${enrol.notas}` : ""}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setCampanaSeleccionadaId(enrol.campanaId);
                          setMostrarModalAgregar(true);
                        }}
                        className="text-[11px] text-orange-600 hover:underline font-semibold"
                      >
                        Re-inscribir
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
