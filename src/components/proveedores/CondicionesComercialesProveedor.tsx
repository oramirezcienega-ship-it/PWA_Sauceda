"use client";

import { useState } from "react";
import { guardarCondicionesProveedor } from "@/app/actions/proveedores";
import { zonasDeTexto } from "@/lib/condiciones-proveedor";
import type { Proveedor } from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-carbon/20 bg-white px-2.5 py-1.5 text-xs text-carbon outline-none focus:border-sauce";

function fecha(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Condiciones comerciales del proveedor (aplican a todos sus servicios): anticipo, condiciones
 * de pago, zonas donde trabaja y hasta cuándo respeta sus precios. El proveedor también las
 * edita desde su link.
 */
export function CondicionesComercialesProveedor({
  proveedor,
  onGuardado,
}: {
  proveedor: Proveedor;
  onGuardado: (p: Proveedor) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [anticipo, setAnticipo] = useState(proveedor.anticipoPct ? String(proveedor.anticipoPct) : "");
  const [pago, setPago] = useState(proveedor.condicionesPago || "");
  const [zonas, setZonas] = useState((proveedor.zonasCobertura || []).join(", "));
  const [vigencia, setVigencia] = useState(proveedor.vigenciaPrecios || "");
  const [canal, setCanal] = useState<"whatsapp" | "telegram">(proveedor.canalPreferido || "whatsapp");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vencida = !!proveedor.vigenciaPrecios && proveedor.vigenciaPrecios < new Date().toISOString().slice(0, 10);
  const pagoTexto = [proveedor.anticipoPct ? `${proveedor.anticipoPct}% de anticipo` : "", proveedor.condicionesPago || ""]
    .filter(Boolean)
    .join(" · ");

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const datos = {
        anticipoPct: Number(anticipo || 0),
        condicionesPago: pago.trim(),
        zonas: zonasDeTexto(zonas),
        vigenciaPrecios: vigencia || null,
        canalPreferido: canal,
      };
      const r = await guardarCondicionesProveedor(proveedor.id, datos);
      if (!r.ok) {
        setError(r.error || "No se pudo guardar.");
        return;
      }
      onGuardado({
        ...proveedor,
        anticipoPct: datos.anticipoPct,
        condicionesPago: datos.condicionesPago,
        zonasCobertura: datos.zonas,
        vigenciaPrecios: datos.vigenciaPrecios,
        canalPreferido: datos.canalPreferido,
      });
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-3.5 text-xs shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-titular text-sm font-bold text-verde-profundo">🤝 Condiciones comerciales</span>
          <span className="ml-2 text-[11px] text-carbon/50">Aplican a todos sus servicios · el proveedor también las edita en su link</span>
        </div>
        {!editando && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="rounded-md border border-carbon/20 px-2.5 py-1 text-[11px] font-semibold text-carbon/70 hover:border-sauce hover:text-sauce"
          >
            ✎ Editar
          </button>
        )}
      </div>

      {!editando ? (
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              "📲 Le avisamos por",
              proveedor.canalPreferido === "telegram"
                ? proveedor.telegramLigado
                  ? "Telegram"
                  : "Telegram (sin ligar: se usa WhatsApp)"
                : "WhatsApp (responde en su portal)",
              proveedor.canalPreferido === "telegram" && !proveedor.telegramLigado,
            ],
            ["💳 Anticipo y pago", pagoTexto, false],
            ["📍 Zonas donde trabaja", (proveedor.zonasCobertura || []).join(", "), false],
            ["🗓 Respeta sus precios hasta", proveedor.vigenciaPrecios ? `${fecha(proveedor.vigenciaPrecios)}${vencida ? " · vencido" : ""}` : "", vencida],
          ].map(([k, v, alerta]) => (
            <div key={String(k)} className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-[10.5px] text-carbon/50">{k}</dt>
              <dd className={`font-semibold ${alerta ? "text-rojo" : v ? "text-carbon" : "text-carbon/35"}`}>{v || "Sin capturar"}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_7rem_1fr_1fr_10rem]">
            <label>
              <span className="mb-0.5 block font-semibold text-carbon/70">Avisarle por</span>
              <select value={canal} onChange={(e) => setCanal(e.target.value as "whatsapp" | "telegram")} className={inputCls}>
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram{proveedor.telegramLigado ? "" : " (sin ligar)"}</option>
              </select>
            </label>
            <label>
              <span className="mb-0.5 block font-semibold text-carbon/70">Anticipo (%)</span>
              <input type="number" min={0} max={100} value={anticipo} onChange={(e) => setAnticipo(e.target.value)} className={inputCls} />
            </label>
            <label>
              <span className="mb-0.5 block font-semibold text-carbon/70">Condiciones de pago</span>
              <input value={pago} onChange={(e) => setPago(e.target.value)} className={inputCls} placeholder="Ej. 50% al iniciar, 50% al terminar" />
            </label>
            <label>
              <span className="mb-0.5 block font-semibold text-carbon/70">Zonas (separadas por coma)</span>
              <input value={zonas} onChange={(e) => setZonas(e.target.value)} className={inputCls} placeholder="León, Silao, Purísima" />
            </label>
            <label>
              <span className="mb-0.5 block font-semibold text-carbon/70">Precios vigentes hasta</span>
              <input type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} className={inputCls} />
            </label>
          </div>
          {error && <div className="rounded-md bg-rojo/10 px-2 py-1 text-rojo">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditando(false)} className="rounded-md border border-carbon/20 px-3 py-1 font-semibold text-carbon/70">
              Cancelar
            </button>
            <button
              type="button"
              disabled={guardando}
              onClick={guardar}
              className="rounded-md bg-sauce px-3 py-1 font-bold text-white hover:bg-verde-profundo disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
