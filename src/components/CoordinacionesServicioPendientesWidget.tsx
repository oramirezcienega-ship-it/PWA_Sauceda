"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  listarCoordinacionesServicioPendientes,
  type CoordinacionServicioPendiente,
} from "@/app/actions/programacion-servicio";

function antiguedad(horas: number): string {
  if (horas >= 24) {
    const d = Math.floor(horas / 24);
    return `${d} día${d === 1 ? "" : "s"}`;
  }
  return horas >= 1 ? `${horas} h` : "menos de 1 h";
}

/**
 * Servicios e instalaciones con proveedor que aún no se programan: esperando al proveedor,
 * o ya aceptó y falta que el cliente elija horario. Se programan desde la conversación.
 */
export function CoordinacionesServicioPendientesWidget() {
  const [lista, setLista] = useState<CoordinacionServicioPendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setLista(await listarCoordinacionesServicioPendientes());
      setError(null);
    } catch (err: any) {
      setError(err?.message || "No se pudieron cargar las coordinaciones.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-carbon/5 pb-2.5">
        <div>
          <h2 className="font-titular text-lg font-semibold text-verde-profundo">
            🔧 Servicios por programar{!cargando && ` (${lista.length})`}
          </h2>
          <p className="text-[11px] text-carbon/50">Coordinaciones con proveedor sin fecha programada, de la más antigua a la más reciente</p>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={cargando}
          className="rounded-md border border-carbon/15 px-2 py-1 text-[11px] font-semibold text-carbon/60 hover:border-sauce hover:text-sauce disabled:opacity-50"
        >
          ↻ Actualizar
        </button>
      </div>

      {cargando ? (
        <p className="py-8 text-center text-sm text-carbon/40">Cargando…</p>
      ) : error ? (
        <p className="mt-3 rounded-md bg-rojo/10 px-3 py-2 text-xs text-rojo">{error}</p>
      ) : lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-carbon/40">✅ No hay servicios por programar.</p>
      ) : (
        <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1 scrollbar-sutil">
          {lista.map((c) => {
            const color =
              c.estado === "asignada"
                ? "border-l-emerald-500 bg-emerald-50/40"
                : c.estado === "sin_proveedor" || c.horas >= 48
                ? "border-l-rojo bg-rojo/[0.03]"
                : "border-l-dorado bg-dorado/[0.04]";
            return (
              <div key={c.id} className={`rounded-lg border border-carbon/10 border-l-4 ${color} p-3`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-carbon">{c.clienteNombre}</p>
                    <p className="text-xs text-carbon/60">
                      🛠️ {c.trabajo} · con <b>{c.proveedorNombre}</b> · <span className="font-mono">{c.folio}</span>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-carbon/5 px-2 py-0.5 text-[10px] font-bold text-carbon/60">hace {antiguedad(c.horas)}</span>
                </div>
                <p className="mt-1.5 text-[11px] font-semibold text-carbon/70">📌 {c.estadoLabel}</p>
                {c.opciones.length > 0 && <p className="text-[11px] text-carbon/60">Horarios propuestos: {c.opciones.join(" · ")}</p>}
                {c.telefono && (
                  <div className="mt-2 flex justify-end">
                    <Link href={`/conversaciones?tel=${encodeURIComponent(c.telefono)}`} className="text-[11px] font-bold text-sauce hover:underline">
                      {c.estado === "asignada" ? "Programar desde la conversación →" : "Abrir conversación →"}
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
