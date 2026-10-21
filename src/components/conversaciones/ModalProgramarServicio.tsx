"use client";

import { useEffect, useMemo, useState } from "react";
import { horasDeTexto, mencionaMonto, mensajeServicioCliente, mensajeServicioProveedor } from "@/lib/mensajes-servicio";
import {
  prepararProgramacionServicio,
  programarServicioSolicitud,
  type DatosProgramacionServicio,
  type ResultadoProgramacionServicio,
} from "@/app/actions/programacion-servicio";

/**
 * El cliente eligió horario: se programa el servicio (OT con fecha, visita en la agenda)
 * y se le confirma por WhatsApp al cliente y al proveedor.
 */
export function ModalProgramarServicio({
  solicitudId,
  opcion,
  telefono,
  fechaInicial,
  horarioInicial,
  onCerrar,
  onProgramado,
}: {
  solicitudId: string;
  /** Horario que propuso el proveedor y eligió el cliente. */
  opcion: string;
  telefono: string;
  /** Si ya se conoce (acordado por WhatsApp): YYYY-MM-DD y el horario en texto ("2:30 a 3 pm"). */
  fechaInicial?: string;
  horarioInicial?: string;
  onCerrar: () => void;
  onProgramado: () => void;
}) {
  const [datos, setDatos] = useState<DatosProgramacionServicio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [costo, setCosto] = useState("");
  const [notas, setNotas] = useState("");
  const [avisarCliente, setAvisarCliente] = useState(true);
  const [avisarProveedor, setAvisarProveedor] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoProgramacionServicio | null>(null);
  // Vista previa: se arma con los datos del formulario hasta que el asesor la edita.
  const [textoCliente, setTextoCliente] = useState<string | null>(null);
  const [textoProveedor, setTextoProveedor] = useState<string | null>(null);
  const costoNum = Number(costo.replace(/[^\d.]/g, "")) || null;
  const datosMensaje = useMemo(
    () =>
      datos
        ? {
            clienteNombre: datos.clienteNombre,
            trabajo: datos.trabajo,
            fecha,
            horaInicio,
            horaFin: horaFin && horaFin > horaInicio ? horaFin : "",
            direccion: datos.direccion,
            linkMaps: datos.linkMaps,
            ordenFolio: datos.ordenFolio,
            solicitudFolio: datos.folio,
            costo: costoNum,
            notas,
          }
        : null,
    [datos, fecha, horaInicio, horaFin, costoNum, notas]
  );
  const previaCliente = textoCliente ?? (datosMensaje ? mensajeServicioCliente(datosMensaje) : "");
  const previaProveedor = textoProveedor ?? (datosMensaje ? mensajeServicioProveedor(datosMensaje) : "");
  const clienteConMonto = avisarCliente && mencionaMonto(previaCliente, costoNum);

  useEffect(() => {
    prepararProgramacionServicio(solicitudId, opcion).then((r) => {
      if (!r.ok || !r.datos) return setError(r.error || "No se pudieron cargar los datos.");
      setDatos(r.datos);
      const [ini, fin] = horarioInicial ? horasDeTexto(horarioInicial) : ["", ""];
      setFecha(fechaInicial || r.datos.fecha);
      setHoraInicio(ini || r.datos.horaInicio);
      setHoraFin(fin || r.datos.horaFin);
      setCosto(r.datos.costo ? String(r.datos.costo) : "");
    });
  }, [solicitudId, opcion, fechaInicial, horarioInicial]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !guardando && onCerrar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guardando, onCerrar]);

  async function programar() {
    setGuardando(true);
    setError(null);
    try {
      const r = await programarServicioSolicitud({
        solicitudId,
        telefono,
        opcion,
        fecha,
        horaInicio,
        horaFin,
        costo: costoNum,
        notas,
        avisarCliente,
        avisarProveedor,
        mensajeCliente: previaCliente,
        mensajeProveedor: previaProveedor,
      });
      if (!r.ok) return setError(r.error || "No se pudo programar.");
      setResultado(r);
      onProgramado();
    } finally {
      setGuardando(false);
    }
  }

  const campo = "w-full rounded border border-carbon/15 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-carbon/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={() => !guardando && onCerrar()}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-carbon/10 flex flex-col max-h-[92vh] overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-carbon/10 flex items-center justify-between bg-emerald-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl p-1.5 bg-emerald-100 rounded-lg shrink-0">📅</span>
            <div>
              <h3 className="font-titular text-sm sm:text-base font-bold text-emerald-900">Programar servicio</h3>
              <p className="text-[11px] text-carbon/50">
                El cliente eligió: <b>{opcion}</b>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="text-carbon/40 hover:text-carbon p-1.5 rounded-lg hover:bg-carbon/5 transition text-lg leading-none cursor-pointer"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>

        {!datos ? (
          <div className="p-6 text-center text-sm text-carbon/60">{error || "Cargando…"}</div>
        ) : resultado ? (
          <div className="p-4 space-y-2 text-sm">
            <p className="rounded bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-2 font-semibold">
              ✅ Servicio programado{resultado.ordenFolio ? ` · orden de trabajo ${resultado.ordenFolio}` : ""}. Ya aparece en Actividades de la semana.
            </p>
            {resultado.cliente && (
              <p className={resultado.cliente.enviado ? "text-emerald-800" : "text-rojo"}>
                {resultado.cliente.enviado
                  ? "📲 Confirmación enviada al cliente: la ves en su conversación con las palomitas de entregado y leído."
                  : `No se pudo enviar al cliente: ${resultado.cliente.error}`}
              </p>
            )}
            {resultado.proveedor &&
              (resultado.proveedor.enviado ? (
                <p className="text-emerald-800">
                  📲 Confirmación enviada a {datos.proveedorNombre} por {resultado.proveedor.canal === "telegram" ? "Telegram" : "WhatsApp"}.
                </p>
              ) : resultado.proveedor.urlWhatsApp ? (
                <p className="text-amber-800">
                  No se pudo enviar en automático a {datos.proveedorNombre}.{" "}
                  <a href={resultado.proveedor.urlWhatsApp} target="_blank" rel="noopener noreferrer" className="font-bold underline">
                    Mandarla desde tu WhatsApp
                  </a>
                </p>
              ) : (
                <p className="text-rojo">{resultado.proveedor.error}</p>
              ))}
            <div className="flex justify-end pt-2">
              <button type="button" onClick={onCerrar} className="rounded bg-verde-profundo text-white px-4 py-1.5 text-xs font-bold cursor-pointer">
                Listo
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 space-y-3 overflow-y-auto text-sm">
              <div className="rounded-lg bg-slate-50 border border-carbon/10 px-3 py-2 text-[12px] text-carbon/75 space-y-0.5">
                <div>
                  <b>{datos.trabajo}</b> · {datos.clienteNombre || "Cliente"} · con <b>{datos.proveedorNombre}</b>
                </div>
                {datos.direccion && <div>📍 {datos.direccion}</div>}
                <div>
                  Solicitud {datos.folio}
                  {datos.ordenFolio ? ` · orden de trabajo ${datos.ordenFolio}` : " · se creará la orden de trabajo"}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block col-span-3 sm:col-span-1">
                  <span className="block text-[11px] font-bold text-carbon/70 mb-0.5">Fecha</span>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-bold text-carbon/70 mb-0.5">Llega</span>
                  <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className={campo} />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-bold text-carbon/70 mb-0.5">Termina aprox.</span>
                  <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className={campo} />
                </label>
              </div>
              <label className="block">
                <span className="block text-[11px] font-bold text-carbon/70 mb-0.5">Costo acordado con el proveedor</span>
                <input type="text" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="$" className={campo} />
                {datos.origenCosto && (
                  <span className="mt-0.5 block text-[10.5px] text-carbon/50">Del catálogo del proveedor, según {datos.origenCosto}</span>
                )}
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold text-carbon/70 mb-0.5">Indicaciones (van en la confirmación y en la OT)</span>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={2}
                  placeholder="Ej. tocar en la puerta de atrás, llevar llave de paso de 1/2"
                  className={`${campo} resize-y`}
                />
              </label>
              <div className="space-y-3">
                <div className="rounded-lg border border-carbon/10 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-[12px] font-bold">
                      <input type="checkbox" checked={avisarCliente} onChange={(e) => setAvisarCliente(e.target.checked)} />
                      Mensaje al cliente (WhatsApp, queda en su conversación)
                    </label>
                    {textoCliente !== null && (
                      <button type="button" onClick={() => setTextoCliente(null)} className="text-[11px] text-sky-700 underline cursor-pointer">
                        ↺ Rehacer
                      </button>
                    )}
                  </div>
                  {avisarCliente && (
                    <textarea
                      value={previaCliente}
                      onChange={(e) => setTextoCliente(e.target.value)}
                      rows={9}
                      className={`${campo} resize-y font-sans text-[12.5px] leading-relaxed bg-[#e7ffdb]/40`}
                    />
                  )}
                  {clienteConMonto && (
                    <p className="text-[11px] rounded bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1">
                      ⚠️ El mensaje al cliente menciona un monto. El costo del proveedor no debe ir aquí.
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-carbon/10 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-[12px] font-bold">
                      <input type="checkbox" checked={avisarProveedor} onChange={(e) => setAvisarProveedor(e.target.checked)} />
                      Mensaje a {datos.proveedorNombre} (incluye el costo acordado)
                    </label>
                    {textoProveedor !== null && (
                      <button type="button" onClick={() => setTextoProveedor(null)} className="text-[11px] text-sky-700 underline cursor-pointer">
                        ↺ Rehacer
                      </button>
                    )}
                  </div>
                  {avisarProveedor && (
                    <textarea
                      value={previaProveedor}
                      onChange={(e) => setTextoProveedor(e.target.value)}
                      rows={11}
                      className={`${campo} resize-y font-sans text-[12.5px] leading-relaxed`}
                    />
                  )}
                </div>
                {!datos.ordenFolio && (
                  <p className="text-[11px] text-carbon/50">“[folio OT]” se cambia por el folio de la orden de trabajo al programar.</p>
                )}
              </div>
              {error && <p className="text-[11px] rounded bg-rojo/10 text-rojo px-2 py-1.5">{error}</p>}
            </div>
            <div className="px-4 py-3 border-t border-carbon/10 flex justify-end gap-2 bg-crema/20 shrink-0">
              <button
                type="button"
                onClick={onCerrar}
                disabled={guardando}
                className="rounded border border-carbon/20 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void programar()}
                disabled={guardando || !fecha || !horaInicio || clienteConMonto}
                className="rounded bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                {guardando ? "Programando…" : "📅 Programar y confirmar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
