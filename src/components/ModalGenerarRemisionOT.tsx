"use client";

import { useState } from "react";
import { generarRemisionDesdeOrdenTrabajo } from "@/app/actions/ordenes-trabajo";
import type { RemisionFactura } from "@/lib/types";

interface ModalGenerarRemisionOTProps {
  abierto: boolean;
  alCerrar: () => void;
  alGenerar: (remision: RemisionFactura) => void;
  ordenId: string;
  ordenFolio: string;
  clienteNombre: string;
  clienteTelefono?: string;
  clienteDireccion?: string;
  totalCotizado: number;
}

export function ModalGenerarRemisionOT({
  abierto,
  alCerrar,
  alGenerar,
  ordenId,
  ordenFolio,
  clienteNombre,
  clienteDireccion = "",
  totalCotizado,
}: ModalGenerarRemisionOTProps) {
  const [tipo, setTipo] = useState<"remision" | "factura">("remision");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);

  // Datos Remisión
  const [direccionEntrega, setDireccionEntrega] = useState(
    clienteDireccion || "León, Guanajuato"
  );
  const [personaRecibe, setPersonaRecibe] = useState(clienteNombre || "");

  // Datos Factura
  const [rfc, setRfc] = useState("");
  const [razonSocial, setRazonSocial] = useState(clienteNombre || "");
  const [regimenFiscal, setRegimenFiscal] = useState("601");
  const [usoCfdi, setUsoCfdi] = useState("G03");

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  if (!abierto) return null;

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCargando(true);
      setError("");

      const res = await generarRemisionDesdeOrdenTrabajo({
        ordenTrabajoId: ordenId,
        tipo,
        fecha,
        direccionEntrega,
        personaRecibe,
        rfc,
        razonSocial,
        regimenFiscal,
        usoCfdi,
      });

      if (res.ok && res.remision) {
        alGenerar(res.remision);
        alCerrar();
      } else {
        setError(res.error || "No se pudo generar el documento.");
      }
    } catch (err: any) {
      setError(err?.message || "Error al procesar la solicitud.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-carbon/10">
        <div className="flex items-center justify-between border-b border-carbon/10 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-xl text-blue-700 border border-blue-500/20">
              📄
            </span>
            <div>
              <h3 className="font-titular text-lg font-bold text-verde-profundo">
                Generar Remisión / Factura
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

        {error && (
          <div className="mb-4 rounded-xl bg-rojo/10 border border-rojo/20 p-3 text-xs text-rojo font-medium flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-cuerpo">
          {/* Monto de la venta */}
          <div className="rounded-xl bg-slate-50 border border-carbon/10 p-3 flex justify-between items-center">
            <div>
              <span className="text-[10px] uppercase font-bold text-carbon/50 block">
                Monto Base del Servicio
              </span>
              <span className="text-sm font-bold text-carbon">
                Pactado en Cotización
              </span>
            </div>
            <span className="font-mono text-xl font-bold text-emerald-700">
              {formatMoneda(totalCotizado)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-carbon/80 mb-1">
                Tipo de Documento *
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as "remision" | "factura")}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce outline-none bg-white font-bold"
              >
                <option value="remision">📄 Remisión de Entrega</option>
                <option value="factura">🧾 Factura Fiscal CFDI</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-carbon/80 mb-1">
                Fecha del Documento
              </label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce outline-none"
              />
            </div>
          </div>

          {tipo === "remision" ? (
            <div className="space-y-3 bg-blue-50/40 p-4 rounded-xl border border-blue-100">
              <span className="font-titular text-[11px] font-bold text-blue-900 uppercase tracking-wide block">
                Datos de Entrega en Sitio
              </span>
              <div>
                <label className="block font-semibold text-carbon/80 mb-1">
                  Dirección de Entrega
                </label>
                <input
                  type="text"
                  required
                  value={direccionEntrega}
                  onChange={(e) => setDireccionEntrega(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce outline-none bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-carbon/80 mb-1">
                  Persona que Recibe la Obra
                </label>
                <input
                  type="text"
                  required
                  value={personaRecibe}
                  onChange={(e) => setPersonaRecibe(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce outline-none bg-white"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 bg-amber-50/40 p-4 rounded-xl border border-amber-100">
              <span className="font-titular text-[11px] font-bold text-amber-900 uppercase tracking-wide block">
                Datos Fiscales de Facturación
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-carbon/80 mb-1">
                    RFC Receptor *
                  </label>
                  <input
                    type="text"
                    required
                    value={rfc}
                    onChange={(e) => setRfc(e.target.value.toUpperCase())}
                    placeholder="XAXX010101000"
                    className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce outline-none bg-white font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-carbon/80 mb-1">
                    Razón Social *
                  </label>
                  <input
                    type="text"
                    required
                    value={razonSocial}
                    onChange={(e) => setRazonSocial(e.target.value)}
                    className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce outline-none bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-carbon/80 mb-1">
                    Régimen Fiscal
                  </label>
                  <input
                    type="text"
                    value={regimenFiscal}
                    onChange={(e) => setRegimenFiscal(e.target.value)}
                    placeholder="601 - General"
                    className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-carbon/80 mb-1">
                    Uso de CFDI
                  </label>
                  <select
                    value={usoCfdi}
                    onChange={(e) => setUsoCfdi(e.target.value)}
                    className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce outline-none bg-white"
                  >
                    <option value="G03">G03 - Gastos en general</option>
                    <option value="I01">I01 - Construcciones</option>
                    <option value="S01">S01 - Sin efectos fiscales</option>
                    <option value="CP01">CP01 - Pagos</option>
                  </select>
                </div>
              </div>
            </div>
          )}

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
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-xs font-bold transition shadow-md flex items-center gap-1.5 disabled:opacity-50"
            >
              {cargando ? "Generando Folio..." : "✓ Generar Documento Oficial"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
