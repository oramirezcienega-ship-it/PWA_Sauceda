"use client";

import { useEffect, useState } from "react";
import {
  obtenerEstadoAutorizacionCostosAction,
  enviarAutorizacionCostosAction,
  type EstadoAutorizacionCostos,
} from "@/app/actions/cotizaciones-telegram";

/**
 * Comparte la cotización (PDF del cliente + resumen de valores) por Telegram con el
 * proveedor y el asesor comercial para que autoricen el costo con un botón.
 */
export function PanelAutorizacionCostosTelegram({ cotizacionId }: { cotizacionId: string }) {
  const [estado, setEstado] = useState<EstadoAutorizacionCostos | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [verMensaje, setVerMensaje] = useState(false);

  const cargar = async () => setEstado(await obtenerEstadoAutorizacionCostosAction(cotizacionId));
  useEffect(() => { cargar(); }, [cotizacionId]);

  const alternar = (clave: string) =>
    setSeleccion((s) => (s.includes(clave) ? s.filter((c) => c !== clave) : [...s, clave]));

  const copiar = async (enlace: string, nombre: string) => {
    try {
      await navigator.clipboard.writeText(enlace);
      setMensaje({ tipo: "ok", texto: `Enlace de ${nombre} copiado. Compártelo para que vincule su Telegram.` });
    } catch {
      window.prompt("Copia este enlace:", enlace);
    }
  };

  const enviar = async () => {
    setEnviando(true);
    setMensaje(null);
    const r = await enviarAutorizacionCostosAction(cotizacionId, seleccion);
    const ok = r.enviados.filter((e) => e.ok).map((e) => e.nombre);
    const fallos = r.enviados.filter((e) => !e.ok).map((e) => `${e.nombre} (${e.error})`);
    setMensaje({
      tipo: r.ok ? "ok" : "error",
      texto: [ok.length ? `Enviado a ${ok.join(", ")}.` : "", fallos.length ? `No se pudo enviar a: ${fallos.join("; ")}.` : "", !r.ok && !fallos.length ? r.error || "" : ""]
        .filter(Boolean).join(" "),
    });
    if (r.ok) setSeleccion([]);
    setEnviando(false);
    cargar();
  };

  if (!estado) return <div className="text-xs text-carbon/50">Cargando envío por Telegram…</div>;
  if (!estado.ok) return <div className="text-xs text-rojo">{estado.error}</div>;

  const grupos: { titulo: string; tipo: "proveedor" | "asesor" }[] = [
    { titulo: "Proveedores", tipo: "proveedor" },
    { titulo: "Asesor comercial / equipo", tipo: "asesor" },
  ];

  return (
    <div className="border-t pt-6 space-y-4">
      <div>
        <h4 className="font-titular font-semibold text-sm text-carbon/80">✈️ Autorización de costo por Telegram</h4>
        <p className="text-xs text-carbon/50 mt-0.5">
          Envía el PDF de la cotización con un resumen de los valores clave y botones para autorizar o rechazar el costo.
        </p>
      </div>

      {mensaje && (
        <div className={`p-3 text-xs border rounded-lg ${mensaje.tipo === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-rose-50 border-rojo/20 text-rojo"}`}>
          {mensaje.texto}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {grupos.map((g) => (
          <div key={g.tipo} className="rounded-xl border border-carbon/10 bg-slate-50/50 p-3 space-y-1.5 max-h-72 overflow-y-auto">
            <p className="text-[10px] font-bold uppercase text-carbon/50">{g.titulo}</p>
            {estado.destinatarios.filter((d) => d.tipo === g.tipo).map((d) => {
              const reg = estado.registros[d.clave];
              const enlace = estado.enlaces[d.clave];
              return (
                <div key={d.clave} className="flex items-center justify-between gap-2 text-xs">
                  <label className={`flex items-center gap-2 ${d.telegramChatId ? "cursor-pointer" : "opacity-60"}`}>
                    <input
                      type="checkbox"
                      disabled={!d.telegramChatId}
                      checked={seleccion.includes(d.clave)}
                      onChange={() => alternar(d.clave)}
                      className="rounded text-sauce"
                    />
                    <span className="font-semibold text-carbon/80">{d.nombre}</span>
                    <span className="text-carbon/40">{d.detalle}</span>
                  </label>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {reg?.respuesta === "autorizado" && <span className="rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-[10px] font-bold">✅ Autorizó</span>}
                    {reg?.respuesta === "rechazado" && <span className="rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 text-[10px] font-bold">❌ Rechazó</span>}
                    {reg?.ok && !reg.respuesta && <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">⏳ Esperando</span>}
                    {!d.telegramChatId && enlace && (
                      <button type="button" onClick={() => copiar(enlace, d.nombre)} className="text-[10px] font-bold text-sauce hover:underline">
                        🔗 Vincular
                      </button>
                    )}
                    {!d.telegramChatId && !enlace && <span className="text-[10px] text-carbon/40">Sin Telegram</span>}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={enviar}
          disabled={enviando || seleccion.length === 0}
          className="rounded-lg bg-[#229ED9] text-white px-4 py-2 text-xs font-semibold hover:opacity-90 transition disabled:opacity-50"
        >
          {enviando ? "Enviando…" : `✈️ Enviar por Telegram${seleccion.length ? ` (${seleccion.length})` : ""}`}
        </button>
        <button type="button" onClick={() => setVerMensaje((v) => !v)} className="text-xs font-semibold text-sauce hover:underline">
          {verMensaje ? "Ocultar vista previa" : "Ver mensaje que recibirán"}
        </button>
      </div>

      {verMensaje && estado.html && (
        <div
          className="rounded-xl border border-carbon/10 bg-white p-4 text-xs leading-relaxed whitespace-pre-wrap max-w-md"
          dangerouslySetInnerHTML={{ __html: estado.html }}
        />
      )}
    </div>
  );
}
