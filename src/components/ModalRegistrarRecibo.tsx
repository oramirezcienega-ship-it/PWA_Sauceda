"use client";

import { useEffect, useState } from "react";
import {
  crearReciboPago,
  emitirRecibosEnPartes,
  listarReceptoresRecibo,
  enviarReciboPorWhatsApp,
  type ReciboPago,
} from "@/app/actions/ordenes-trabajo";

interface ModalRegistrarReciboProps {
  abierto: boolean;
  alCerrar: () => void;
  alCrear: (recibo: ReciboPago) => void;
  ordenId: string;
  ordenFolio: string;
  clienteNombre: string;
  clienteTelefono?: string;
  totalCotizado: number;
  totalPagado: number;
  saldoRestante: number;
}

export function ModalRegistrarRecibo({
  abierto,
  alCerrar,
  alCrear,
  ordenId,
  ordenFolio,
  clienteNombre,
  clienteTelefono,
  totalCotizado,
  totalPagado,
  saldoRestante,
}: ModalRegistrarReciboProps) {
  const [monto, setMonto] = useState<string>(
    saldoRestante > 0 ? String(saldoRestante) : ""
  );
  const [metodoPago, setMetodoPago] = useState<
    "transferencia" | "efectivo" | "tarjeta" | "otro"
  >("transferencia");
  const [concepto, setConcepto] = useState(
    saldoRestante > 0 && totalPagado > 0
      ? "Liquidación final de orden de trabajo"
      : totalPagado === 0
      ? "Anticipo para inicio de trabajos"
      : "Abono a orden de trabajo"
  );
  const [referenciaPago, setReferenciaPago] = useState("");
  const [fechaPago, setFechaPago] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notas, setNotas] = useState("");
  const [recibidoPorId, setRecibidoPorId] = useState("");
  const [numRecibos, setNumRecibos] = useState(1);
  const [receptores, setReceptores] = useState<{ id: string; nombre: string; rol: string }[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [reciboCreado, setReciboCreado] = useState<ReciboPago | null>(null);
  const [enviandoMeta, setEnviandoMeta] = useState(false);
  const [resultadoMeta, setResultadoMeta] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    if (!abierto) return;
    listarReceptoresRecibo().then(setReceptores).catch(() => setReceptores([]));
  }, [abierto]);

  if (!abierto) return null;

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(val);
  };

  const handleLiquidarRestante = () => {
    setMonto(String(saldoRestante));
    setConcepto("Liquidación total de orden de trabajo");
  };

  const handleMitad = () => {
    if (totalCotizado > 0) {
      setMonto(String(Math.round(totalCotizado * 0.5)));
      setConcepto("Anticipo del 50% para inicio de obra");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setError("Por favor ingresa un monto válido mayor a $0.");
      return;
    }

    try {
      setCargando(true);
      setError("");

      if (numRecibos > 1) {
        const resVarios = await emitirRecibosEnPartes({
          ordenTrabajoId: ordenId,
          montoTotal: montoNum,
          numRecibos,
          metodoPago,
          recibidoPorId: recibidoPorId || null,
          fechaPago,
          concepto: concepto.trim() || "Pago de servicios",
          referenciaPago,
          notas,
        });
        // Se agregan a la lista los que sí se emitieron, aunque alguno falle
        resVarios.recibos.forEach((r) => alCrear(r));
        if (resVarios.ok) {
          alCerrar();
        } else {
          setError(resVarios.error || "No se pudieron emitir todos los recibos.");
        }
        return;
      }

      const res = await crearReciboPago({
        ordenTrabajoId: ordenId,
        monto: montoNum,
        metodoPago,
        referenciaPago,
        concepto: concepto.trim() || "Pago de servicios",
        fechaPago,
        notas,
        recibidoPorId: recibidoPorId || null,
      });

      if (res.ok && res.recibo) {
        setReciboCreado(res.recibo);
        alCrear(res.recibo);
      } else {
        setError(res.error || "No se pudo registrar el recibo.");
      }
    } catch (err: any) {
      setError(err?.message || "Error al procesar el pago.");
    } finally {
      setCargando(false);
    }
  };

  const handleEnviarReciboMeta = async () => {
    if (!reciboCreado) return;
    try {
      setEnviandoMeta(true);
      setResultadoMeta(null);
      const res = await enviarReciboPorWhatsApp(reciboCreado.id);
      if (res.ok) {
        setResultadoMeta({
          tipo: "ok",
          texto: "¡Recibo entregado exitosamente al cliente por WhatsApp Cloud API de Meta!",
        });
      } else {
        setResultadoMeta({
          tipo: "error",
          texto: res.error || "No se pudo entregar por Meta API. Prueba abrir WhatsApp Web.",
        });
      }
    } catch (e: any) {
      setResultadoMeta({
        tipo: "error",
        texto: e?.message || "Error al contactar el servidor de Meta.",
      });
    } finally {
      setEnviandoMeta(false);
    }
  };

  const urlReciboPublico = reciboCreado
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/recibo/${reciboCreado.token}`
    : "";

  const mensajeWhatsApp = reciboCreado
    ? encodeURIComponent(
        `¡Hola ${clienteNombre}! 👋 Le compartimos su *Recibo Oficial de Pago* (${reciboCreado.folio}) por un monto de ${formatMoneda(
          reciboCreado.monto
        )} referente a su orden de trabajo *${ordenFolio}*.\n\nPuede consultar y descargar su recibo oficial aquí:\n${urlReciboPublico}\n\n¡Muchas gracias por su confianza! 🏗️✨`
      )
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-carbon/10">
        <div className="flex items-center justify-between border-b border-carbon/10 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-xl text-emerald-700 border border-emerald-500/20">
              💵
            </span>
            <div>
              <h3 className="font-titular text-lg font-bold text-verde-profundo">
                {reciboCreado ? "¡Recibo Generado con Éxito!" : "Registrar Recibo de Pago"}
              </h3>
              <p className="text-xs text-carbon/60 font-cuerpo">
                Orden: <span className="font-mono font-bold text-sauce">{ordenFolio}</span> · Cliente: {clienteNombre}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            className="text-carbon/40 hover:text-carbon text-lg font-bold p-1"
          >
            ✕
          </button>
        </div>

        {/* Si el recibo ya fue creado, mostrar pantalla de confirmación y compartir */}
        {reciboCreado ? (
          <div className="space-y-4 text-xs font-cuerpo">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
              <span className="text-3xl block mb-2">🎉</span>
              <p className="text-sm font-bold text-emerald-900">
                Recibo Oficial Folio: <span className="font-mono">{reciboCreado.folio}</span>
              </p>
              <p className="text-2xl font-mono font-bold text-emerald-700 my-1">
                {formatMoneda(reciboCreado.monto)}
              </p>
              <p className="text-[11px] text-emerald-800 font-mono italic">
                "{reciboCreado.montoLetra}"
              </p>
              <div className="mt-3 pt-3 border-t border-emerald-200/60 flex justify-around text-left">
                <div>
                  <span className="text-[10px] text-emerald-700/70 uppercase block font-semibold">
                    Saldo Restante
                  </span>
                  <span className="text-sm font-bold text-emerald-900 font-mono">
                    {formatMoneda(reciboCreado.saldoRestante)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-700/70 uppercase block font-semibold">
                    Método
                  </span>
                  <span className="text-sm font-bold text-emerald-900 capitalize">
                    {reciboCreado.metodoPago}
                  </span>
                </div>
              </div>
            </div>

            {resultadoMeta && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold animate-fade-in ${
                  resultadoMeta.tipo === "ok"
                    ? "bg-emerald-100/80 text-emerald-900 border border-emerald-300"
                    : "bg-rose-100/80 text-rose-900 border border-rose-300"
                }`}
              >
                {resultadoMeta.texto}
              </div>
            )}

            <div className="space-y-2 pt-2">
              {clienteTelefono && (
                <button
                  type="button"
                  onClick={handleEnviarReciboMeta}
                  disabled={enviandoMeta}
                  className="w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold py-2.5 px-4 text-center transition flex items-center justify-center gap-2 shadow-sm"
                >
                  <span>⚡</span>
                  <span>{enviandoMeta ? "Enviando vía Meta..." : "Enviar por Meta Cloud API (WhatsApp)"}</span>
                </button>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <a
                  href={urlReciboPublico}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-4 text-center transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <span>🖨️</span> Ver / Imprimir
                </a>
                {clienteTelefono && (
                  <a
                    href={`https://wa.me/${clienteTelefono.replace(/[^0-9]/g, "")}?text=${mensajeWhatsApp}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 text-center transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>📲</span> Abrir WhatsApp Web
                  </a>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={alCerrar}
              className="w-full mt-2 rounded-xl border border-carbon/20 py-2 text-xs text-carbon/70 hover:bg-carbon/5 font-semibold transition"
            >
              Cerrar y Volver a la Orden
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-cuerpo">
            {error && (
              <div className="rounded-xl bg-rojo/10 border border-rojo/20 p-3 text-xs text-rojo font-medium flex items-center gap-2">
                <span>⚠️</span> {error}
              </div>
            )}

            {/* Resumen de Cuenta de la OT */}
            <div className="grid grid-cols-3 gap-2 bg-carbon/5 p-3 rounded-xl text-center border border-carbon/10">
              <div>
                <span className="text-[10px] text-carbon/50 uppercase block font-semibold">Total Obra</span>
                <span className="font-mono text-xs font-bold text-carbon">
                  {formatMoneda(totalCotizado)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-carbon/50 uppercase block font-semibold">Cobrado</span>
                <span className="font-mono text-xs font-bold text-emerald-700">
                  {formatMoneda(totalPagado)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-carbon/50 uppercase block font-semibold">Por Cobrar</span>
                <span className="font-mono text-xs font-bold text-amber-700">
                  {formatMoneda(saldoRestante)}
                </span>
              </div>
            </div>

            {/* Atajos de montos */}
            <div className="flex gap-2">
              {totalPagado === 0 && totalCotizado > 0 && (
                <button
                  type="button"
                  onClick={handleMitad}
                  className="rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold transition"
                >
                  💰 Anticipo 50% ({formatMoneda(totalCotizado * 0.5)})
                </button>
              )}
              {saldoRestante > 0 && (
                <button
                  type="button"
                  onClick={handleLiquidarRestante}
                  className="rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 text-[11px] font-semibold transition"
                >
                  🎯 Liquidar Saldo ({formatMoneda(saldoRestante)})
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-carbon/80 mb-1">
                  Monto Recibido ($ MXN) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-sm font-mono font-bold text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-carbon/80 mb-1">
                  Método de Pago
                </label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as any)}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none bg-white"
                >
                  <option value="transferencia">Transferencia SPEI</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta (Terminal / Débito / Crédito)</option>
                  <option value="otro">Cheque / Otro</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-carbon/80 mb-1">
                Concepto del Pago *
              </label>
              <input
                type="text"
                required
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej. Anticipo del 50% para arranque de obra"
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-carbon/80 mb-1">
                  Recibe el dinero *
                </label>
                <select
                  value={recibidoPorId}
                  onChange={(e) => setRecibidoPorId(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none bg-white"
                >
                  <option value="">Yo (usuario en sesión)</option>
                  {receptores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} · {p.rol === "admin" ? "Administrador" : p.rol === "asesor" ? "Asesor" : p.rol === "operaciones" ? "Operaciones / Instalador" : p.rol}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-carbon/80 mb-1">
                  Cantidad de recibos
                </label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={numRecibos}
                  onChange={(e) => setNumRecibos(Math.max(1, Math.min(12, Math.floor(Number(e.target.value) || 1))))}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-sm font-mono font-bold text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
                />
              </div>
            </div>

            {numRecibos > 1 && parseFloat(monto) > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 text-[11px] text-emerald-900">
                El monto de {formatMoneda(parseFloat(monto))} se reparte en {numRecibos} recibos de{" "}
                <strong>{formatMoneda(Math.floor((parseFloat(monto) / numRecibos) * 100) / 100)}</strong> (el último absorbe el redondeo), todos a nombre de quien recibe el dinero.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-carbon/80 mb-1">
                  Referencia / Clave de Rastreo
                </label>
                <input
                  type="text"
                  value={referenciaPago}
                  onChange={(e) => setReferenciaPago(e.target.value)}
                  placeholder="Ej. SPEI 482910 o Folio voucher"
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-carbon/80 mb-1">
                  Fecha del Pago
                </label>
                <input
                  type="date"
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-carbon/80 mb-1">
                Notas adicionales (Opcional)
              </label>
              <input
                type="text"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observaciones de entrega o saldo convenido..."
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-carbon/10">
              <button
                type="button"
                onClick={alCerrar}
                disabled={cargando}
                className="rounded-xl border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon/70 hover:bg-carbon/5 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={cargando}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-xs font-bold transition shadow-md flex items-center gap-1.5 disabled:opacity-50"
              >
                {cargando ? "Registrando Pago..." : "✓ Emitir Recibo Oficial"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
