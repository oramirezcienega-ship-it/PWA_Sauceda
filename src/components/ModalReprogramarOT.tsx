"use client";

import { useState, useEffect } from "react";
import { reprogramarFechaOrdenTrabajo, type OrdenTrabajo } from "@/app/actions/ordenes-trabajo";

interface ModalReprogramarOTProps {
  orden: OrdenTrabajo | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (nuevaFecha: string) => void;
}

export function ModalReprogramarOT({
  orden,
  isOpen,
  onClose,
  onSuccess,
}: ModalReprogramarOTProps) {
  const [nuevaFecha, setNuevaFecha] = useState("");
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [horaFin, setHoraFin] = useState("13:00");
  const [moverCierreFinanciero, setMoverCierreFinanciero] = useState(true);
  const [moverCitas, setMoverCitas] = useState(true);
  const [moverExpediente, setMoverExpediente] = useState(true);
  const [moverGarantia, setMoverGarantia] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orden && isOpen) {
      const fechaBase =
        orden.fechaProgramada ||
        (orden.fechaConclusion ? orden.fechaConclusion.split("T")[0] : "") ||
        new Date().toISOString().split("T")[0];
      setNuevaFecha(fechaBase);
      setMotivo("");
      setError(null);
    }
  }, [orden, isOpen]);

  if (!isOpen || !orden) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaFecha) {
      setError("Por favor selecciona una fecha válida.");
      return;
    }

    try {
      setGuardando(true);
      setError(null);

      const res = await reprogramarFechaOrdenTrabajo(orden.id, nuevaFecha, {
        horaInicio,
        horaFin,
        moverCierreFinanciero,
        moverCitas,
        moverExpediente,
        moverGarantia,
        motivo,
      });

      if (!res.ok) {
        setError(res.error || "Error al reprogramar la orden de trabajo.");
        return;
      }

      onSuccess?.(nuevaFecha);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error inesperado al reprogramar.");
    } finally {
      setGuardando(false);
    }
  };

  const fechaActualLegible = orden.fechaProgramada
    ? orden.fechaProgramada
    : orden.fechaConclusion
    ? `Concluida el ${orden.fechaConclusion.split("T")[0]}`
    : "Sin fecha definida";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-carbon/10 space-y-5">
        {/* Encabezado */}
        <div className="flex items-start justify-between border-b border-carbon/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🗓️</span>
              <h3 className="font-titular text-lg font-bold text-carbon">
                Reprogramar Orden de Trabajo
              </h3>
            </div>
            <p className="text-xs text-carbon/60 font-cuerpo mt-1">
              Mueve la fecha operativa y el periodo de cierre contable de la orden.
            </p>
          </div>
          <span className="font-mono text-xs font-bold bg-sauce/10 text-sauce px-2.5 py-1 rounded-full border border-sauce/20">
            {orden.folio}
          </span>
        </div>

        {/* Resumen actual */}
        <div className="rounded-2xl bg-slate-50 p-3.5 border border-carbon/10 text-xs space-y-1.5">
          <div className="flex justify-between items-center text-carbon/70">
            <span>Trabajo:</span>
            <span className="font-semibold text-carbon truncate max-w-[240px]">
              {orden.titulo}
            </span>
          </div>
          <div className="flex justify-between items-center text-carbon/70">
            <span>Fecha actual registrada:</span>
            <span className="font-mono font-bold text-carbon bg-white px-2 py-0.5 rounded border border-carbon/10">
              {fechaActualLegible}
            </span>
          </div>
          <div className="flex justify-between items-center text-carbon/70">
            <span>Estatus operativo:</span>
            <span className="font-semibold capitalize text-sauce">
              {orden.estatus.replace(/_/g, " ")}
            </span>
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Selector de nueva fecha y horario */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-carbon/70 uppercase mb-1">
                Nueva Fecha de Operación / Cierre *
              </label>
              <input
                type="date"
                required
                value={nuevaFecha}
                onChange={(e) => setNuevaFecha(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 p-2 text-xs font-mono font-semibold text-carbon outline-none focus:border-sauce focus:ring-1 focus:ring-sauce bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-carbon/70 uppercase mb-1">
                Horario Sugerido de Obra
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className="w-1/2 rounded-xl border border-carbon/20 p-2 text-xs font-mono text-carbon outline-none focus:border-sauce bg-white"
                />
                <span className="text-carbon/40 text-xs">a</span>
                <input
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  className="w-1/2 rounded-xl border border-carbon/20 p-2 text-xs font-mono text-carbon outline-none focus:border-sauce bg-white"
                />
              </div>
            </div>
          </div>

          {/* Sincronización Integral (Checkboxes) */}
          <div className="rounded-2xl border border-sauce/20 bg-sauce/5 p-3.5 space-y-2.5">
            <span className="text-[10px] font-bold text-sauce uppercase tracking-wider block">
              Sincronización Integral del Ecosistema
            </span>

            <label className="flex items-start gap-2.5 text-xs text-carbon/80 cursor-pointer">
              <input
                type="checkbox"
                checked={moverCierreFinanciero}
                onChange={(e) => setMoverCierreFinanciero(e.target.checked)}
                className="mt-0.5 rounded text-sauce focus:ring-sauce cursor-pointer"
              />
              <div>
                <span className="font-semibold text-carbon block">
                  Mover Cierre Financiero (Remisiones / Facturas y Gastos)
                </span>
                <span className="text-[11px] text-carbon/60 block">
                  Reubica la fecha contable de la remisión y costos de proveedor para que caiga en este nuevo periodo/mes.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-carbon/80 cursor-pointer">
              <input
                type="checkbox"
                checked={moverCitas}
                onChange={(e) => setMoverCitas(e.target.checked)}
                className="mt-0.5 rounded text-sauce focus:ring-sauce cursor-pointer"
              />
              <div>
                <span className="font-semibold text-carbon block">
                  Mover Cita en la Agenda Técnica
                </span>
                <span className="text-[11px] text-carbon/60 block">
                  Actualiza el calendario de los técnicos y cuadrillas operativas en la agenda.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-carbon/80 cursor-pointer">
              <input
                type="checkbox"
                checked={moverExpediente}
                onChange={(e) => setMoverExpediente(e.target.checked)}
                className="mt-0.5 rounded text-sauce focus:ring-sauce cursor-pointer"
              />
              <div>
                <span className="font-semibold text-carbon block">
                  Actualizar Expediente del Cliente
                </span>
                <span className="text-[11px] text-carbon/60 block">
                  Sincroniza el campo <code>fecha_instalacion</code> en el expediente comercial.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-carbon/80 cursor-pointer">
              <input
                type="checkbox"
                checked={moverGarantia}
                onChange={(e) => setMoverGarantia(e.target.checked)}
                className="mt-0.5 rounded text-sauce focus:ring-sauce cursor-pointer"
              />
              <div>
                <span className="font-semibold text-carbon block">
                  Recalibrar Vigencia de Póliza de Garantía
                </span>
                <span className="text-[11px] text-carbon/60 block">
                  Ajusta la fecha de inicio y vencimiento de la carta garantía a partir del nuevo día.
                </span>
              </div>
            </label>
          </div>

          {/* Motivo opcional */}
          <div>
            <label className="block text-[11px] font-bold text-carbon/70 uppercase mb-1">
              Motivo o Justificación del Cambio (Opcional)
            </label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Lluvia, petición del cliente, reprogramación de cuadrilla..."
              className="w-full rounded-xl border border-carbon/20 p-2 text-xs text-carbon outline-none focus:border-sauce bg-white"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
              ⚠️ {error}
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex justify-end gap-2.5 pt-2 border-t border-carbon/10">
            <button
              type="button"
              disabled={guardando}
              onClick={onClose}
              className="rounded-xl border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon hover:bg-slate-100 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-xl bg-sauce hover:bg-sauce/90 text-crema px-5 py-2 text-xs font-bold transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              {guardando ? (
                <>
                  <span className="animate-spin text-sm">⏳</span> Guardando...
                </>
              ) : (
                <>
                  <span>🗓️</span> Confirmar y Reprogramar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
