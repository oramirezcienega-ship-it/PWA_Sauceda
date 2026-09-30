"use client";

import { useEffect, useState } from "react";
import {
  actualizarReciboPago,
  listarReceptoresRecibo,
  type ReciboPago,
} from "@/app/actions/ordenes-trabajo";

interface Props {
  recibo: ReciboPago;
  alCerrar: () => void;
  alGuardado: () => void;
}

/** Edita un recibo ya emitido (para adecuar los generados anteriormente). */
export function ModalEditarRecibo({ recibo, alCerrar, alGuardado }: Props) {
  const [monto, setMonto] = useState(String(recibo.monto));
  const [metodoPago, setMetodoPago] = useState<string>(
    ["transferencia", "efectivo", "tarjeta", "otro"].includes(String(recibo.metodoPago))
      ? String(recibo.metodoPago)
      : "otro"
  );
  const [concepto, setConcepto] = useState(recibo.concepto || "");
  const [referencia, setReferencia] = useState(recibo.referenciaPago || "");
  const [fecha, setFecha] = useState((recibo.fechaPago || "").slice(0, 10));
  const [notas, setNotas] = useState(recibo.notas || "");
  const [recibidoPorId, setRecibidoPorId] = useState(recibo.recibidoPor || "");
  const [receptores, setReceptores] = useState<{ id: string; nombre: string; rol: string }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listarReceptoresRecibo().then(setReceptores).catch(() => setReceptores([]));
  }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = parseFloat(monto);
    if (isNaN(m) || m <= 0) {
      setError("Ingresa un monto válido mayor a $0.");
      return;
    }
    setGuardando(true);
    setError("");
    const r = await actualizarReciboPago(recibo.id, {
      monto: m,
      metodoPago: metodoPago as any,
      concepto,
      referenciaPago: referencia,
      fechaPago: fecha || undefined,
      notas,
      recibidoPorId: recibidoPorId || null,
    });
    setGuardando(false);
    if (r.ok) alGuardado();
    else setError(r.error || "No se pudo guardar el recibo.");
  };

  const campo =
    "w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none";
  const etiqueta = "block font-semibold text-carbon/80 mb-1 text-xs";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-carbon/10 my-8 font-cuerpo">
        <div className="flex items-center justify-between border-b border-carbon/10 pb-3 mb-4">
          <h3 className="font-titular text-lg font-bold text-verde-profundo">
            Editar recibo <span className="font-mono text-sauce">{recibo.folio}</span>
          </h3>
          <button type="button" onClick={alCerrar} className="text-carbon/40 hover:text-carbon text-lg font-bold p-1">
            ✕
          </button>
        </div>

        {error && <div className="mb-3 rounded-xl bg-rojo/10 border border-rojo/20 p-3 text-xs text-rojo">⚠️ {error}</div>}

        <form onSubmit={enviar} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={etiqueta}>Monto ($ MXN) *</label>
              <input type="number" step="0.01" required value={monto} onChange={(e) => setMonto(e.target.value)} className={`${campo} font-mono font-bold`} />
            </div>
            <div>
              <label className={etiqueta}>Método de pago</label>
              <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className={`${campo} bg-white`}>
                <option value="transferencia">Transferencia SPEI</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta (Terminal / Débito / Crédito)</option>
                <option value="otro">Cheque / Otro</option>
              </select>
            </div>
          </div>

          <div>
            <label className={etiqueta}>Concepto *</label>
            <input required value={concepto} onChange={(e) => setConcepto(e.target.value)} className={campo} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={etiqueta}>Recibe el dinero</label>
              <select value={recibidoPorId} onChange={(e) => setRecibidoPorId(e.target.value)} className={`${campo} bg-white`}>
                <option value="">{recibo.recibidoPorNombre ? `${recibo.recibidoPorNombre} (actual)` : "Sin cambio"}</option>
                {receptores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {p.rol === "admin" ? "Administrador" : p.rol === "asesor" ? "Asesor" : p.rol === "operaciones" ? "Operaciones / Instalador" : p.rol}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={etiqueta}>Fecha del pago</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
            </div>
          </div>

          <div>
            <label className={etiqueta}>Referencia / clave de rastreo</label>
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={`${campo} font-mono`} />
          </div>

          <div>
            <label className={etiqueta}>Notas</label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} className={campo} />
          </div>

          <p className="text-[10px] text-carbon/50">
            Al guardar se recalculan el saldo anterior y restante de todos los recibos de esta orden.
          </p>

          <div className="flex justify-end gap-2 pt-2 border-t border-carbon/10">
            <button type="button" onClick={alCerrar} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-carbon">
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
