"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { RemisionFacturaEnriquecida } from "@/app/actions/remisiones";

interface ModalDetalleRemisionProps {
  remision: RemisionFacturaEnriquecida | null;
  abierto: boolean;
  alCerrar: () => void;
}

export function ModalDetalleRemision({
  remision,
  abierto,
  alCerrar,
}: ModalDetalleRemisionProps) {
  const [copiado, setCopiado] = useState(false);

  if (!abierto || !remision) return null;

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(val);
  };

  const formatearFecha = (fechaStr?: string | null) => {
    if (!fechaStr) return "—";
    try {
      const d = new Date(fechaStr);
      if (isNaN(d.getTime())) return fechaStr;
      return d.toLocaleDateString("es-MX", {
        timeZone: "America/Mexico_City",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return fechaStr;
    }
  };

  const esFactura = remision.tipo === "factura";

  // URL del portal público para compartir
  const urlPublica = remision.ordenEntregaToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/orden-trabajo/remision/${remision.ordenEntregaToken}`
    : remision.cotizacionToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/cotizacion/remision/${remision.cotizacionToken}`
    : null;

  const handleCopiarEnlace = async () => {
    if (!urlPublica) return;
    try {
      await navigator.clipboard.writeText(urlPublica);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch (e) {
      console.error("Error al copiar enlace:", e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-carbon/10 overflow-hidden my-6">
        {/* Cabecera del Documento */}
        <div className="bg-gradient-to-r from-verde-profundo to-emerald-950 p-6 text-white flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xl">{esFactura ? "🏛️" : "📦"}</span>
              <span
                className={`text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  esFactura
                    ? "bg-purple-500/20 text-purple-300 border border-purple-400/30"
                    : "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30"
                }`}
              >
                {esFactura ? "Factura Fiscal" : "Remisión de Entrega"}
              </span>
            </div>
            <h2 className="font-titular text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>{remision.folio}</span>
            </h2>
            <p className="text-xs text-crema/80 font-cuerpo mt-1">
              Emitida el {formatearFecha(remision.fecha)}
            </p>
          </div>

          <button
            type="button"
            onClick={alCerrar}
            className="rounded-xl bg-white/10 hover:bg-white/20 p-2 text-white/80 hover:text-white transition"
            title="Cerrar modal"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-carbon font-cuerpo text-xs">
          {/* Tarjeta de Datos del Cliente */}
          <div className="rounded-xl border border-carbon/10 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-carbon/10 pb-2">
              <h4 className="font-titular font-bold text-verde-profundo text-sm uppercase tracking-wide">
                Datos del Cliente
              </h4>
              {remision.prospectoId && (
                <Link
                  href={`/prospectos/${remision.prospectoId}`}
                  prefetch={false}
                  className="text-[11px] font-semibold text-sauce hover:underline"
                >
                  Ver Ficha CRM →
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="block text-[10px] uppercase font-bold text-carbon/50">
                  {esFactura ? "Razón Social / Receptor" : "Nombre del Cliente"}
                </span>
                <span className="font-semibold text-carbon text-sm">
                  {remision.clienteNombre}
                </span>
              </div>

              {esFactura ? (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    RFC Receptor
                  </span>
                  <span className="font-mono font-bold text-carbon">
                    {remision.datosDocumento?.rfc || "XAXX010101000"}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Persona que Recibe
                  </span>
                  <span className="font-medium text-carbon">
                    {remision.datosDocumento?.personaRecibe || remision.clienteNombre}
                  </span>
                </div>
              )}

              {remision.clienteTelefono && (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Teléfono
                  </span>
                  <span className="font-mono text-carbon">
                    📱 {remision.clienteTelefono}
                  </span>
                </div>
              )}

              {remision.clienteEmail && (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Correo Electrónico
                  </span>
                  <span className="text-carbon">
                    ✉️ {remision.clienteEmail}
                  </span>
                </div>
              )}

              {esFactura && (
                <>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-carbon/50">
                      Régimen Fiscal
                    </span>
                    <span className="text-carbon font-mono">
                      {remision.datosDocumento?.regimenFiscal || "601"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-carbon/50">
                      Uso de CFDI
                    </span>
                    <span className="text-carbon font-mono">
                      {remision.datosDocumento?.usoCfdi || "G03 - Gastos en general"}
                    </span>
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <span className="block text-[10px] uppercase font-bold text-carbon/50">
                  Dirección de Entrega / Domicilio
                </span>
                <span className="text-carbon">
                  📍 {remision.clienteDireccion || "Domicilio en obra"}
                </span>
              </div>
            </div>
          </div>

          {/* Vínculo con Orden de Trabajo y Cotización */}
          <div className="rounded-xl border border-carbon/10 bg-white p-4 space-y-3">
            <h4 className="font-titular font-bold text-verde-profundo text-sm uppercase tracking-wide border-b border-carbon/10 pb-2">
              Origen Operativo
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {remision.ordenTrabajoId ? (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Orden de Trabajo
                  </span>
                  <Link
                    href={`/ordenes-trabajo/${remision.ordenTrabajoId}`}
                    prefetch={false}
                    className="font-mono font-bold text-sauce hover:underline text-xs inline-flex items-center gap-1 mt-0.5"
                  >
                    <span>🛠️ {remision.ordenFolio || "Ver Orden"}</span>
                    <span>→</span>
                  </Link>
                  {remision.ordenTitulo && (
                    <div className="text-[11px] text-carbon/70 truncate mt-0.5">
                      {remision.ordenTitulo}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Orden de Trabajo
                  </span>
                  <span className="text-carbon/40 italic">No vinculada a OT</span>
                </div>
              )}

              {remision.cotizacionId ? (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Cotización Aceptada
                  </span>
                  <Link
                    href={`/cotizacion/${remision.cotizacionToken || remision.cotizacionId}`}
                    target="_blank"
                    className="font-mono font-bold text-carbon hover:text-sauce hover:underline text-xs inline-flex items-center gap-1 mt-0.5"
                  >
                    <span>📑 {remision.cotizacionFolio || remision.cotizacionId}</span>
                    <span>↗</span>
                  </Link>
                </div>
              ) : (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Cotización
                  </span>
                  <span className="text-carbon/40 italic">Directa sin cotización previa</span>
                </div>
              )}

              <div>
                <span className="block text-[10px] uppercase font-bold text-carbon/50">
                  Asesor Responsable
                </span>
                <span className="font-medium text-carbon mt-0.5 block">
                  👤 {remision.asesorNombre || "Sin asignar"}
                </span>
              </div>

              {remision.expedienteId && (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Expediente
                  </span>
                  <Link
                    href={`/expediente/${remision.expedienteId}`}
                    prefetch={false}
                    className="text-sauce font-semibold hover:underline mt-0.5 inline-block"
                  >
                    📁 Ver Expediente Completo
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Desglose Financiero */}
          <div className="rounded-xl border border-carbon/10 bg-slate-50/70 p-4 space-y-3">
            <h4 className="font-titular font-bold text-verde-profundo text-sm uppercase tracking-wide border-b border-carbon/10 pb-2">
              Desglose Financiero
            </h4>

            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-carbon/70">
                <span>Subtotal Base:</span>
                <span>{formatMoneda(remision.montoSubtotal)}</span>
              </div>

              {remision.serviciosExtra > 0 && (
                <div className="flex justify-between text-carbon/70">
                  <span>Servicios Extra:</span>
                  <span>+{formatMoneda(remision.serviciosExtra)}</span>
                </div>
              )}

              {remision.costoFinanciero > 0 && (
                <div className="flex justify-between text-carbon/70">
                  <span>Costo Financiero:</span>
                  <span>+{formatMoneda(remision.costoFinanciero)}</span>
                </div>
              )}

              {remision.otrosGastos > 0 && (
                <div className="flex justify-between text-carbon/70">
                  <span>Otros Gastos:</span>
                  <span>+{formatMoneda(remision.otrosGastos)}</span>
                </div>
              )}

              <div className="border-t border-carbon/10 pt-2 flex justify-between font-bold text-sm text-verde-profundo">
                <span>Total del Documento:</span>
                <span>{formatMoneda(remision.montoTotal)}</span>
              </div>

              {/* Cobranza */}
              {remision.ordenTrabajoId && (
                <div className="mt-3 pt-3 border-t border-carbon/10 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-carbon/50">
                      Total Cobrado (Recibos)
                    </span>
                    <span className="font-bold text-emerald-700">
                      {formatMoneda(remision.totalCobrado)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-carbon/50">
                      Saldo Restante
                    </span>
                    <span
                      className={`font-bold ${
                        remision.saldoRestante > 0 ? "text-amber-700" : "text-emerald-700"
                      }`}
                    >
                      {remision.saldoRestante > 0
                        ? formatMoneda(remision.saldoRestante)
                        : "✓ Liquidado"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Barra de Acciones Inferior */}
        <div className="bg-slate-50 border-t border-carbon/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {urlPublica && (
              <button
                type="button"
                onClick={handleCopiarEnlace}
                className="rounded-xl border border-carbon/20 bg-white hover:bg-slate-100 text-carbon font-semibold px-3 py-2 text-xs transition shadow-2xs flex items-center gap-1.5"
                title="Copiar link para enviar por WhatsApp"
              >
                <span>{copiado ? "✓ Copiado" : "📋 Copiar Enlace"}</span>
              </button>
            )}

            {urlPublica && (
              <a
                href={urlPublica}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-sauce hover:bg-verde-profundo text-white font-bold px-3 py-2 text-xs transition shadow-2xs flex items-center gap-1.5"
              >
                <span>🖨️ Ver Documento / Imprimir</span>
              </a>
            )}
          </div>

          <button
            type="button"
            onClick={alCerrar}
            className="rounded-xl bg-slate-200 hover:bg-slate-300 text-carbon font-bold px-4 py-2 text-xs transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
