"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatoPesos } from "@/lib/formato";
import type { AutorizacionProveedor } from "@/app/actions/cotizaciones-telegram";

type Filtro = "esperando" | "respondidas" | "error" | "todas";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "esperando", label: "⏳ Esperando" },
  { id: "respondidas", label: "Respondidas" },
  { id: "error", label: "No enviadas" },
  { id: "todas", label: "Todas" },
];

const ETIQUETA_ESTADO: Record<AutorizacionProveedor["estado"], { texto: string; clase: string }> = {
  esperando: { texto: "⏳ Esperando", clase: "bg-amber-100 text-amber-800" },
  autorizado: { texto: "✅ Autorizó", clase: "bg-green-100 text-green-800" },
  rechazado: { texto: "❌ Rechazó", clase: "bg-rose-100 text-rose-800" },
  error: { texto: "⚠️ No enviada", clase: "bg-slate-100 text-carbon/60" },
};

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/** Seguimiento global de las cotizaciones enviadas a proveedores por Telegram para autorizar costo. */
export function PanelAutorizacionesProveedores({ autorizaciones }: { autorizaciones: AutorizacionProveedor[] }) {
  const [filtro, setFiltro] = useState<Filtro>("esperando");

  const conteo = useMemo(
    () => ({
      esperando: autorizaciones.filter((a) => a.estado === "esperando").length,
      respondidas: autorizaciones.filter((a) => a.estado === "autorizado" || a.estado === "rechazado").length,
      error: autorizaciones.filter((a) => a.estado === "error").length,
      todas: autorizaciones.length,
    }),
    [autorizaciones]
  );

  const visibles = useMemo(() => {
    const lista = autorizaciones.filter((a) =>
      filtro === "todas"
        ? true
        : filtro === "respondidas"
          ? a.estado === "autorizado" || a.estado === "rechazado"
          : a.estado === filtro
    );
    // Pendientes: la más antigua primero. Resto: lo más reciente primero.
    return filtro === "esperando" ? lista : [...lista].reverse();
  }, [autorizaciones, filtro]);

  return (
    <section className="mb-6 rounded-xl border border-carbon/10 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="font-titular text-lg font-bold text-verde-profundo">✈️ Cotizaciones enviadas a proveedores</h2>
          <p className="text-xs text-carbon/60">
            Solicitudes de autorización de costo enviadas por Telegram y la respuesta de cada proveedor.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filtro === f.id ? "bg-sauce text-white" : "bg-carbon/5 text-carbon/70 hover:bg-carbon/10"
              }`}
            >
              {f.label} ({conteo[f.id]})
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="py-6 text-center text-xs text-carbon/50">
          {filtro === "esperando" ? "No hay proveedores pendientes de responder." : "Sin registros."}
        </p>
      ) : (
        <div className="mt-3 max-h-96 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white text-left text-[10px] uppercase text-carbon/50">
              <tr>
                <th className="py-2 pr-3">Cotización</th>
                <th className="py-2 pr-3">Cliente / Servicio</th>
                <th className="py-2 pr-3">Proveedor</th>
                <th className="py-2 pr-3 text-right">Precio</th>
                <th className="py-2 pr-3">Enviada</th>
                <th className="py-2 pr-3">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => {
                const etiqueta = ETIQUETA_ESTADO[a.estado];
                const dias = diasDesde(a.enviadoAt);
                return (
                  <tr key={`${a.cotizacionId}-${a.proveedor}-${a.enviadoAt}`} className="border-t border-carbon/5 align-top">
                    <td className="py-2 pr-3">
                      <Link href={`/construccion/${a.cotizacionId}`} className="font-mono font-semibold text-sauce hover:underline">
                        {a.cotizacionId}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-carbon/80">{a.cliente}</div>
                      <div className="text-carbon/50">{a.servicio}</div>
                    </td>
                    <td className="py-2 pr-3 font-semibold text-carbon/80">{a.proveedor}</td>
                    <td className="py-2 pr-3 text-right font-mono">{a.precioFinal > 0 ? formatoPesos(a.precioFinal) : "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <div>{fechaCorta(a.enviadoAt)}</div>
                      {a.estado === "esperando" && (
                        <div className={`font-semibold ${dias >= 3 ? "text-rojo" : "text-carbon/50"}`}>
                          {dias === 0 ? "hoy" : `hace ${dias} día${dias === 1 ? "" : "s"}`}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${etiqueta.clase}`}>{etiqueta.texto}</span>
                      {a.respondidoAt && <div className="mt-1 text-carbon/50">{fechaCorta(a.respondidoAt)}</div>}
                      {a.estado === "error" && a.error && <div className="mt-1 text-carbon/50">{a.error}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
