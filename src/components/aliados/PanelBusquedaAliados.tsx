"use client";

import { useCallback, useEffect, useState } from "react";
import {
  aliadosParaExpediente,
  lanzarBusqueda,
  listarBusquedasExpediente,
  type AliadoParaBusqueda,
  type BusquedaAliado,
} from "@/app/actions/aliados";
import { ETIQUETA_ESTADO_BUSQUEDA, formatoFechaLimite, type EstadoBusqueda } from "@/lib/asesoria/aliados";

const COLOR_ESTADO: Record<EstadoBusqueda, string> = {
  enviada: "bg-sky-50 text-sky-900 border-sky-300",
  vista: "bg-violet-50 text-violet-900 border-violet-300",
  respondida: "bg-emerald-50 text-emerald-900 border-emerald-300",
  sin_resultados: "bg-slate-100 text-slate-700 border-slate-300",
  vencida: "bg-amber-50 text-amber-900 border-amber-300",
};

/**
 * Panel del expediente comprador: "Lanzar búsqueda" a aliados (preselecciona
 * los de la zona; bloquea a los que no tienen convenio firmado) y estado de
 * cada solicitud.
 */
export function PanelBusquedaAliados({ expedienteId }: { expedienteId: string }) {
  const [aliados, setAliados] = useState<AliadoParaBusqueda[]>([]);
  const [busquedas, setBusquedas] = useState<BusquedaAliado[]>([]);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [nuevaRonda, setNuevaRonda] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([aliadosParaExpediente(expedienteId), listarBusquedasExpediente(expedienteId)]);
    setAliados(a);
    setBusquedas(b);
    setNuevaRonda(b.length > 0);
    setSeleccion(new Set(a.filter((x) => x.sugerido).map((x) => x.id)));
  }, [expedienteId]);

  useEffect(() => {
    cargar().catch((e) => setAviso(e?.message || "No se pudo cargar."));
  }, [cargar]);

  async function lanzar() {
    setEnviando(true);
    const r = await lanzarBusqueda(expedienteId, Array.from(seleccion), { nuevaRonda });
    setEnviando(false);
    setAviso(
      r.ok
        ? `Solicitud enviada a ${r.enviadas} aliado${r.enviadas === 1 ? "" : "s"} (${r.porTelegram} por Telegram).${
            r.manuales.length ? ` Comparte el mensaje a mano con: ${r.manuales.join(", ")}.` : ""
          }`
        : r.mensaje || "No se pudo lanzar la búsqueda.",
    );
    if (r.ok) setAbierto(false);
    await cargar();
  }

  return (
    <section className="rounded-xl border border-orange-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-orange-900">🤝 Búsqueda con aliados</p>
          <p className="text-[11px] text-carbon/50">El mensaje al aliado nunca incluye el nombre ni el teléfono del cliente.</p>
        </div>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700"
        >
          📨 Lanzar búsqueda
        </button>
      </div>

      {aviso && (
        <p className="mb-3 flex justify-between gap-2 rounded-md bg-orange-50 px-3 py-2 text-xs text-orange-900">
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso(null)}>×</button>
        </p>
      )}

      {abierto && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50/40 p-3">
          {aliados.length === 0 ? (
            <p className="text-xs text-carbon/60">No hay aliados activos. Da de alta aliados en el menú Aliados.</p>
          ) : (
            <ul className="space-y-1.5">
              {aliados.map((a) => (
                <li key={a.id}>
                  <label className={`flex items-start gap-2 text-sm ${a.habilitado ? "" : "opacity-50"}`}>
                    <input
                      type="checkbox"
                      disabled={!a.habilitado}
                      checked={seleccion.has(a.id)}
                      onChange={(e) => {
                        const s = new Set(seleccion);
                        if (e.target.checked) s.add(a.id);
                        else s.delete(a.id);
                        setSeleccion(s);
                      }}
                      className="mt-1"
                    />
                    <span>
                      <strong>{a.nombre}</strong>
                      {a.sugerido && <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-[10px] text-emerald-900">cubre la zona</span>}
                      {a.calificacion != null && <span className="ml-1 text-[10px] text-carbon/50">· {a.calificacion}/100</span>}
                      {!a.telegramVinculado && a.habilitado && <span className="ml-1 text-[10px] text-carbon/50">· sin Telegram (compartir a mano)</span>}
                      <span className="block text-[11px] text-carbon/50">
                        {a.motivo ? `🔒 ${a.motivo}` : a.zonasCobertura.join(", ") || "Sin zonas registradas"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <label className="mt-3 flex items-center gap-2 text-xs text-carbon/70">
            <input type="checkbox" checked={nuevaRonda} onChange={(e) => setNuevaRonda(e.target.checked)} />
            Abrir una nueva ronda de búsqueda
          </label>
          <button
            type="button"
            disabled={enviando || seleccion.size === 0}
            onClick={lanzar}
            className="mt-3 w-full rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {enviando ? "Enviando…" : `Enviar solicitud a ${seleccion.size} aliado${seleccion.size === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {busquedas.length === 0 ? (
        <p className="text-xs text-carbon/50">Aún no se ha enviado la búsqueda a aliados.</p>
      ) : (
        <ul className="divide-y divide-carbon/5 text-xs">
          {busquedas.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="font-semibold text-carbon">{b.aliadoNombre}</p>
                <p className="text-carbon/50">
                  Ronda {b.ronda} · {b.canal === "telegram" ? "Telegram" : "Manual"} · límite {formatoFechaLimite(b.fechaLimite)} ·{" "}
                  {b.inmueblesRecibidos} casa{b.inmueblesRecibidos === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${COLOR_ESTADO[b.estado]}`}>
                  {ETIQUETA_ESTADO_BUSQUEDA[b.estado]}
                </span>
                {b.mensajeTexto && b.canal !== "telegram" && b.whatsappAliado && (
                  <a
                    href={`https://wa.me/${b.whatsappAliado}?text=${encodeURIComponent(b.mensajeTexto)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sauce underline"
                  >
                    Enviar por WhatsApp
                  </a>
                )}
                {b.mensajeTexto && (
                  <button
                    type="button"
                    className="text-sauce underline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(b.mensajeTexto!);
                        setAviso(`Mensaje para ${b.aliadoNombre} copiado.`);
                      } catch {
                        window.prompt("Copia el mensaje:", b.mensajeTexto!);
                      }
                    }}
                  >
                    Copiar mensaje
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
