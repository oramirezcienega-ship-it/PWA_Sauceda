"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  obtenerCoordinacionesPendientesAction,
  enviarReporteCoordinacionesTelegramAction,
} from "@/app/actions/inspecciones-coordinacion";
import type { CoordinacionPendiente } from "@/lib/coordinaciones-pendientes";

function textoAntiguedad(c: CoordinacionPendiente): string {
  if (c.diasAntiguedad >= 1) return `${c.diasAntiguedad} día${c.diasAntiguedad === 1 ? "" : "s"}`;
  if (c.horasAntiguedad >= 1) return `${c.horasAntiguedad} h`;
  return "menos de 1 h";
}

/**
 * Relación de coordinaciones de inspección pendientes, de la más antigua a la más reciente.
 * El administrador puede compartir el reporte por Telegram al grupo o a cada asesor.
 */
export function CoordinacionesPendientesWidget() {
  const [lista, setLista] = useState<CoordinacionPendiente[]>([]);
  const [esAdmin, setEsAdmin] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"grupo" | "asesores" | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await obtenerCoordinacionesPendientesAction();
    setCargando(false);
    if (!r.ok) {
      setError(r.error ?? "No se pudieron cargar las coordinaciones.");
      return;
    }
    setError(null);
    setLista(r.coordinaciones);
    setEsAdmin(r.esAdmin);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function compartir(destino: "grupo" | "asesores") {
    const pregunta =
      destino === "grupo"
        ? "¿Enviar el reporte completo al grupo de Telegram?"
        : "¿Enviar a cada asesor, por Telegram, el recordatorio de sus coordinaciones pendientes?";
    if (!confirm(pregunta)) return;
    setEnviando(destino);
    setMensaje(null);
    const r = await enviarReporteCoordinacionesTelegramAction(destino);
    setEnviando(null);
    if (!r.ok) {
      setMensaje({ tipo: "error", texto: r.error ?? "No se pudo enviar el reporte." });
      return;
    }
    const faltan = r.sinEntrega.length > 0 ? ` No se pudo avisar a: ${r.sinEntrega.join(", ")} (sin Telegram vinculado).` : "";
    setMensaje({
      tipo: r.sinEntrega.length > 0 ? "error" : "ok",
      texto:
        destino === "grupo"
          ? `Reporte enviado al grupo de Telegram.${faltan}`
          : `Recordatorio enviado a ${r.enviados} asesor${r.enviados === 1 ? "" : "es"}.${faltan}`,
    });
  }

  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-carbon/5 pb-2.5">
        <div>
          <h2 className="font-titular text-lg font-semibold text-verde-profundo">
            🔎 Coordinaciones de inspección pendientes{!cargando && ` (${lista.length})`}
          </h2>
          <p className="text-[11px] text-carbon/50">De la más antigua a la más reciente</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando}
            className="rounded-md border border-carbon/15 px-2 py-1 text-[11px] font-semibold text-carbon/60 hover:border-sauce hover:text-sauce disabled:opacity-50"
          >
            ↻ Actualizar
          </button>
          {esAdmin && (
            <>
              <button
                type="button"
                onClick={() => void compartir("asesores")}
                disabled={enviando !== null || lista.length === 0}
                className="rounded-md bg-[#229ED9] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#1c86b8] disabled:opacity-50"
                title="Cada asesor recibe en su Telegram solo sus pendientes"
              >
                {enviando === "asesores" ? "Enviando…" : "✈️ Recordar a asesores"}
              </button>
              <button
                type="button"
                onClick={() => void compartir("grupo")}
                disabled={enviando !== null}
                className="rounded-md border border-[#229ED9] px-2.5 py-1 text-[11px] font-bold text-[#229ED9] hover:bg-[#229ED9]/10 disabled:opacity-50"
                title="Envía el reporte completo al grupo operativo de Telegram"
              >
                {enviando === "grupo" ? "Enviando…" : "✈️ Enviar al grupo"}
              </button>
            </>
          )}
        </div>
      </div>

      {mensaje && (
        <p
          className={`mt-3 rounded-md px-3 py-2 text-xs ${
            mensaje.tipo === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rojo/10 text-rojo"
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      {cargando ? (
        <p className="py-8 text-center text-sm text-carbon/40">Cargando coordinaciones…</p>
      ) : error ? (
        <p className="mt-3 rounded-md bg-rojo/10 px-3 py-2 text-xs text-rojo">{error}</p>
      ) : lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-carbon/40">✅ No hay coordinaciones de inspección pendientes.</p>
      ) : (
        <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1 scrollbar-sutil">
          {lista.map((c, i) => {
            const color =
              c.diasAntiguedad >= 3
                ? "border-l-rojo bg-rojo/[0.03]"
                : c.diasAntiguedad >= 1
                  ? "border-l-dorado bg-dorado/[0.04]"
                  : "border-l-emerald-500 bg-white";
            return (
              <div key={c.id} className={`rounded-lg border border-carbon/10 border-l-4 ${color} p-3`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-carbon">
                      <span className="text-carbon/40">{i + 1}.</span> {c.clienteNombre}
                    </p>
                    <p className="text-xs text-carbon/60">
                      🛠️ {c.servicioNombre}
                      {c.ubicacion && <> · 📍 {c.ubicacion}</>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        c.diasAntiguedad >= 3
                          ? "bg-rojo/15 text-rojo"
                          : c.diasAntiguedad >= 1
                            ? "bg-dorado/20 text-[#8a6508]"
                            : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      hace {textoAntiguedad(c)}
                    </span>
                    <p className="mt-0.5 text-[10px] font-mono text-carbon/40">
                      {new Date(c.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-carbon/70">
                  <span className="font-semibold">
                    📌 {c.estadoLabel}
                    {c.slaVencido && <span className="ml-1 text-rojo">· SLA vencido</span>}
                  </span>
                  {c.clienteTelefono && <span className="font-mono">📞 {c.clienteTelefono}</span>}
                </div>

                {c.asesores.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.asesores.map((a) => (
                      <span
                        key={a.id}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          a.respondio
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : a.enterado
                              ? "border-sky-300 bg-sky-50 text-sky-800"
                              : "border-carbon/15 bg-carbon/5 text-carbon/60"
                        }`}
                        title={a.respondio ? "Ya respondió" : a.enterado ? "Enterado, sin respuesta" : "Sin respuesta"}
                      >
                        {a.respondio ? "✅" : a.enterado ? "👀" : "⏳"} {a.nombre}
                      </span>
                    ))}
                  </div>
                )}

                {c.prospectoId && (
                  <div className="mt-2 flex justify-end">
                    <Link
                      href={`/prospectos/${c.prospectoId}`}
                      className="text-[11px] font-bold text-sauce hover:underline"
                    >
                      Abrir cabina de coordinación →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
