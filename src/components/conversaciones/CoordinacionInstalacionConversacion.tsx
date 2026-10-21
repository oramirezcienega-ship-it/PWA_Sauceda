"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cancelarSolicitudProveedor,
  confirmarSolicitudProveedor,
  coordinacionConversacion,
  ofrecerOpcionesSolicitudCliente,
  type SolicitudProveedor,
} from "@/app/actions/solicitudes-proveedor";
import { ModalNuevaSolicitud, TarjetaSolicitud } from "@/components/proveedores/PanelSolicitudesProveedor";
import { ModalProgramarServicio } from "@/components/conversaciones/ModalProgramarServicio";

/**
 * Coordinar la instalación de una cotización aceptada desde la conversación del cliente:
 * solicitud al proveedor (Telegram) → el proveedor propone opciones → se ofrecen al cliente →
 * se confirma la que elige (avisa al proveedor y crea la orden de trabajo).
 */
export function CoordinacionInstalacionConversacion({
  telefono,
  prospectoId,
  expedienteId,
  onEnviada,
}: {
  telefono: string;
  prospectoId: string | null;
  expedienteId: string | null;
  onEnviada: () => void;
}) {
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof coordinacionConversacion>> | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [nuevaPara, setNuevaPara] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [programando, setProgramando] = useState<{ solicitudId: string; opcion: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await coordinacionConversacion(prospectoId, expedienteId));
    } catch {
      setDatos({ cotizaciones: [], solicitudes: [] });
    }
  }, [prospectoId, expedienteId]);

  useEffect(() => {
    setAbierto(false);
    setAviso(null);
    cargar();
    // La respuesta del proveedor llega por Telegram: se refresca cada 30 s.
    const t = setInterval(cargar, 30000);
    return () => clearInterval(t);
  }, [cargar]);

  if (!datos || (datos.cotizaciones.length === 0 && datos.solicitudes.length === 0)) return null;

  const activas = datos.solicitudes.filter((s) => s.estado === "abierta" || s.estado === "asignada");
  const porConfirmar = datos.solicitudes.filter((s) => s.estado === "asignada");
  const sinSolicitud = datos.cotizaciones.filter(
    (c) => !datos.solicitudes.some((s) => s.cotizacionId === c.id && s.estado !== "sin_proveedor")
  );
  const mostrar = abierto || porConfirmar.length > 0;

  async function confirmar(s: SolicitudProveedor, fecha: string) {
    const r = await confirmarSolicitudProveedor(s.id, fecha);
    setAviso(r.ok ? r.mensaje || "Confirmada." : r.error || "No se pudo confirmar.");
    await cargar();
  }

  async function ofrecer(s: SolicitudProveedor) {
    const r = await ofrecerOpcionesSolicitudCliente(s.id, telefono);
    setAviso(r.ok ? "Opciones enviadas al cliente por WhatsApp." : r.error || "No se pudo enviar.");
    if (r.ok) onEnviada();
    await cargar();
  }

  async function cancelar(s: SolicitudProveedor) {
    if (!confirm(`¿Cancelar la solicitud ${s.folio}?`)) return;
    const r = await cancelarSolicitudProveedor(s.id);
    if (!r.ok) setAviso(r.error || "No se pudo cancelar.");
    await cargar();
  }

  return (
    <div className={`border-b px-3 py-1.5 text-xs ${porConfirmar.length ? "border-emerald-300 bg-emerald-50/60" : "border-carbon/10 bg-white/60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setAbierto((v) => !v)} className="flex items-center gap-1.5 font-semibold text-carbon/75">
          🗓 {datos.cotizaciones.length ? "Coordinar instalación" : "Coordinar servicio"}
          {activas.length > 0 && <span className="rounded-full bg-sauce px-1.5 py-0.5 text-[10px] font-bold text-white">{activas.length}</span>}
          {porConfirmar.length > 0 && (
            <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              proveedor propuso fechas
            </span>
          )}
          <span className="text-carbon/40">{mostrar ? "▲" : "▼"}</span>
        </button>
        {sinSolicitud.length > 0 && (
          <button
            type="button"
            onClick={() => setNuevaPara(sinSolicitud[0].id)}
            className="rounded-md border border-sauce/40 bg-white px-2 py-0.5 text-[11px] font-bold text-sauce hover:bg-sauce hover:text-white"
            title={`Pedir al proveedor que tome el servicio de la cotización ${sinSolicitud[0].id}`}
          >
            + Solicitar a proveedor
          </button>
        )}
      </div>

      {mostrar && (
        <div className="mt-2 max-h-[45vh] space-y-2 overflow-y-auto pb-1">
          {aviso && <div className="rounded-md bg-white px-2.5 py-1.5 text-carbon/80 ring-1 ring-carbon/10">{aviso}</div>}
          {datos.solicitudes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-carbon/20 bg-white p-3 text-center text-carbon/50">
              Cotización aceptada sin solicitud al proveedor. Usa “+ Solicitar a proveedor”.
            </p>
          ) : (
            datos.solicitudes.map((s) => (
              <div key={s.id} className="bg-white rounded-xl">
                <TarjetaSolicitud
                  s={s}
                  onConfirmar={confirmar}
                  onCancelar={cancelar}
                  onOfrecer={ofrecer}
                  onProgramar={(sol, opcion) => setProgramando({ solicitudId: sol.id, opcion })}
                />
              </div>
            ))
          )}
        </div>
      )}

      {programando && (
        <ModalProgramarServicio
          solicitudId={programando.solicitudId}
          opcion={programando.opcion}
          telefono={telefono}
          onCerrar={() => setProgramando(null)}
          onProgramado={async () => {
            onEnviada();
            await cargar();
          }}
        />
      )}

      {nuevaPara && (
        <ModalNuevaSolicitud
          cotizacionId={nuevaPara}
          onCerrar={() => setNuevaPara(null)}
          onCreada={async () => {
            setNuevaPara(null);
            setAbierto(true);
            setAviso("Solicitud enviada al proveedor.");
            await cargar();
          }}
        />
      )}
    </div>
  );
}
