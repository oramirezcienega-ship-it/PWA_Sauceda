"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatoPesos } from "@/lib/formato";
import { guardarSlaAutorizacionAction, type AutorizacionProveedor } from "@/app/actions/cotizaciones-telegram";

type Filtro = "esperando" | "vencidas" | "respondidas" | "error" | "todas";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "esperando", label: "⏳ Esperando" },
  { id: "vencidas", label: "🚨 SLA vencido" },
  { id: "respondidas", label: "Respondidas" },
  { id: "error", label: "No entregadas" },
  { id: "todas", label: "Todas" },
];

const ETIQUETA_ESTADO: Record<AutorizacionProveedor["estado"], { texto: string; clase: string }> = {
  esperando: { texto: "⏳ Esperando", clase: "bg-amber-100 text-amber-800" },
  autorizado: { texto: "✅ Autorizó", clase: "bg-green-100 text-green-800" },
  rechazado: { texto: "❌ Rechazó", clase: "bg-rose-100 text-rose-800" },
  cotizado: { texto: "💲 Cotizó", clase: "bg-green-100 text-green-800" },
  visita: { texto: "🔎 Pide visita", clase: "bg-sky-100 text-sky-800" },
  error: { texto: "—", clase: "text-carbon/40" },
};

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "3 h", "1 d 4 h", "25 min" */
function duracion(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

const respondida = (a: AutorizacionProveedor) => a.estado !== "esperando" && a.estado !== "error";

const vencida = (a: AutorizacionProveedor, ahora: number) =>
  a.estado === "esperando" && new Date(a.slaVenceAt).getTime() < ahora;

/** Seguimiento global de las cotizaciones enviadas a proveedores por Telegram para autorizar costo. */
export function PanelAutorizacionesProveedores({
  autorizaciones,
  slaHoras,
}: {
  autorizaciones: AutorizacionProveedor[];
  slaHoras: number;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("esperando");
  const [editandoSla, setEditandoSla] = useState(false);
  const [slaInput, setSlaInput] = useState(String(slaHoras));
  const [guardando, setGuardando] = useState(false);
  const [ahora] = useState(() => Date.now());

  const coincide = (a: AutorizacionProveedor, f: Filtro) =>
    f === "todas"
      ? true
      : f === "vencidas"
        ? vencida(a, ahora)
        : f === "respondidas"
          ? respondida(a)
          : a.estado === f;

  const conteo = useMemo(
    () => Object.fromEntries(FILTROS.map((f) => [f.id, autorizaciones.filter((a) => coincide(a, f.id)).length])) as Record<Filtro, number>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autorizaciones, ahora]
  );

  const visibles = useMemo(() => {
    const lista = autorizaciones.filter((a) => coincide(a, filtro));
    // Pendientes: la más antigua primero. Resto: lo más reciente primero.
    return filtro === "esperando" || filtro === "vencidas" ? lista : [...lista].reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autorizaciones, filtro, ahora]);

  async function guardarSla() {
    setGuardando(true);
    const r = await guardarSlaAutorizacionAction(Number(slaInput));
    setGuardando(false);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    setEditandoSla(false);
    router.refresh();
  }

  function celdaSla(a: AutorizacionProveedor) {
    const vence = new Date(a.slaVenceAt).getTime();
    if (a.estado === "error") return <span className="text-carbon/40">—</span>;
    if (a.estado === "esperando") {
      return vence < ahora ? (
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rojo">
          🚨 Vencido hace {duracion(ahora - vence)}
        </span>
      ) : (
        <span className={`font-semibold ${vence - ahora < 4 * 3_600_000 ? "text-amber-700" : "text-carbon/60"}`}>
          Quedan {duracion(vence - ahora)}
        </span>
      );
    }
    const resp = a.respondidoAt ? new Date(a.respondidoAt).getTime() : 0;
    const tardo = duracion(resp - new Date(a.enviadoAt).getTime());
    return resp <= vence ? (
      <span className="text-green-700">A tiempo · {tardo}</span>
    ) : (
      <span className="text-rojo">Fuera de SLA · {tardo}</span>
    );
  }

  return (
    <section className="mb-6 rounded-xl border border-carbon/10 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="font-titular text-lg font-bold text-verde-profundo">✈️ Cotizaciones enviadas a proveedores</h2>
          <p className="text-xs text-carbon/60">
            Autorizaciones de costo y cotizaciones especiales enviadas por Telegram: entrega, si la abrió, respuesta y SLA.
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="text-carbon/60">SLA de autorizaciones de costo:</span>
            {editandoSla ? (
              <>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={slaInput}
                  onChange={(e) => setSlaInput(e.target.value)}
                  className="w-16 rounded border border-carbon/20 px-1.5 py-0.5 text-xs"
                />
                <span className="text-carbon/60">horas</span>
                <button type="button" onClick={guardarSla} disabled={guardando} className="font-semibold text-sauce hover:underline disabled:opacity-50">
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
                <button type="button" onClick={() => { setEditandoSla(false); setSlaInput(String(slaHoras)); }} className="text-carbon/50 hover:underline">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span className="font-bold text-carbon">{slaHoras} horas</span>
                <span className="text-carbon/40">· las especiales usan el plazo que se fijó al enviarlas</span>
                <button type="button" onClick={() => setEditandoSla(true)} className="font-semibold text-sauce hover:underline">
                  Cambiar
                </button>
              </>
            )}
          </div>
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
                <th className="py-2 pr-3">Cliente / Trabajo</th>
                <th className="py-2 pr-3">Proveedor</th>
                <th className="py-2 pr-3 text-right" title="Autorizaciones: precio al cliente. Especiales: precio que cotizó el proveedor.">
                  Precio
                </th>
                <th className="py-2 pr-3">Enviada</th>
                <th className="py-2 pr-3">Entrega</th>
                <th className="py-2 pr-3" title="Abrió el botón 'Ver cotización' o respondió. Telegram no informa lecturas a los bots.">
                  Visto
                </th>
                <th className="py-2 pr-3">Respuesta</th>
                <th className="py-2 pr-3">SLA</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => {
                const etiqueta = ETIQUETA_ESTADO[a.estado];
                return (
                  <tr key={`${a.cotizacionId}-${a.proveedor}-${a.enviadoAt}`} className="border-t border-carbon/5 align-top">
                    <td className="py-2 pr-3">
                      <Link href={a.href} className="font-mono font-semibold text-sauce hover:underline">
                        {a.folio}
                      </Link>
                      <div className="text-[10px] text-carbon/50">{a.tipo === "especial" ? "💡 Especial" : "Autorización de costo"}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-carbon/80">{a.cliente}</div>
                      <div className="text-carbon/50">{a.servicio}</div>
                    </td>
                    <td className="py-2 pr-3 font-semibold text-carbon/80">{a.proveedor}</td>
                    <td className="py-2 pr-3 text-right font-mono">{a.precioFinal > 0 ? formatoPesos(a.precioFinal) : "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{fechaCorta(a.enviadoAt)}</td>
                    <td className="py-2 pr-3">
                      {a.entrega === "entregado" ? (
                        <span className="text-green-700">✓ Entregado</span>
                      ) : (
                        <>
                          <span className="font-semibold text-rojo">✗ No entregado</span>
                          {a.error && <div className="mt-0.5 max-w-[14rem] text-carbon/50">{a.error}</div>}
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {a.entrega !== "entregado" ? (
                        <span className="text-carbon/40">—</span>
                      ) : a.vistoAt ? (
                        <>
                          <span className="text-green-700">👁️ Visto</span>
                          <div className="text-carbon/50">{fechaCorta(a.vistoAt)}</div>
                        </>
                      ) : (
                        <span className="text-carbon/50">No abierto</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${etiqueta.clase}`}>{etiqueta.texto}</span>
                      {a.respondidoAt && <div className="mt-1 text-carbon/50">{fechaCorta(a.respondidoAt)}</div>}
                      {a.detalleRespuesta && <div className="text-carbon/50">{a.detalleRespuesta}</div>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{celdaSla(a)}</td>
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
