"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Comision, ComisionPago } from "@/lib/types";
import { calcularTotalesTarjetas } from "@/lib/comisiones-totales";
import { normalizarTelefono } from "@/lib/telefono";

interface Props {
  asesorNombre: string;
  asesorTelefono?: string | null;
  periodoTexto: string;
  comisiones: Comision[];
  pagos: ComisionPago[];
  /** Anticipos/préstamos activos a favor de SAUCEDA del asesor (o de todos si no hay filtro). */
  anticiposPendientes?: number;
  alCerrar: () => void;
}

// Al imprimir solo se muestra este documento (el resto de la página se oculta),
// en hoja carta/A4 horizontal con márgenes chicos para aprovechar el espacio.
const ESTILOS_IMPRESION = `
@media print {
  @page { size: landscape; margin: 8mm; }
  body > *:not([data-print-root]) { display: none !important; }
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  [data-print-root] { position: static !important; display: block !important; padding: 0 !important; background: #fff !important; overflow: visible !important; }
  [data-print-doc] { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; max-width: none !important; width: 100% !important; overflow: visible !important; }
  [data-print-body] { max-height: none !important; overflow: visible !important; padding: 0 !important; }
  [data-print-doc] table { page-break-inside: auto; }
  [data-print-doc] tr { page-break-inside: avoid; }
  [data-print-doc] thead { display: table-header-group; }
  [data-print-doc] tfoot { display: table-row-group; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export function ModalEstadoCuentaImprimible({
  asesorNombre,
  asesorTelefono,
  periodoTexto,
  comisiones,
  pagos,
  anticiposPendientes = 0,
  alCerrar,
}: Props) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const formatoMoneda = (val: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

  // Totales
  const tarjetasExtra = calcularTotalesTarjetas(comisiones);
  const totalVentas = comisiones.reduce((acc, c) => acc + c.montoVenta, 0);
  const totalBase = comisiones.reduce((acc, c) => acc + c.baseComisionable, 0);
  const totalComisiones = comisiones.reduce((acc, c) => acc + c.montoComision, 0);
  const totalPagado = comisiones.reduce((acc, c) => acc + c.montoPagado, 0);
  const saldoPendiente = comisiones.reduce((acc, c) => acc + c.saldoPendiente, 0);
  const saldoNeto = saldoPendiente - anticiposPendientes;
  const porLiquidar = comisiones.filter((c) => c.saldoPendiente > 0).length;

  // Nombre sugerido del PDF (sale del título del documento):
  // "Reporte de Comisiones - <Asesor> - <Período> - Emitido AAAA-MM-DD".
  // Se fija mientras el modal está abierto para que aplique también con Ctrl+P.
  useEffect(() => {
    const tituloOriginal = document.title;
    const hoy = new Date().toLocaleDateString("en-CA");
    document.title = `Reporte de Comisiones - ${asesorNombre} - ${periodoTexto} - Emitido ${hoy}`
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ");
    return () => {
      document.title = tituloOriginal;
    };
  }, [asesorNombre, periodoTexto]);

  const handleImprimir = () => {
    window.print();
  };

  const handleCompartirWhatsApp = () => {
    const tel = normalizarTelefono(asesorTelefono || "");
    const texto = `*ESTADO DE CUENTA DE COMISIONES · SAUCEDA*\n` +
      `👤 *Asesor:* ${asesorNombre}\n` +
      `📅 *Período:* ${periodoTexto}\n\n` +
      `📊 *RESUMEN DE BALANCE:*\n` +
      `• Total Ventas: ${formatoMoneda(totalVentas)}\n` +
      `• Comisiones Generadas: ${formatoMoneda(totalComisiones)}\n` +
      `• Comisiones Pagadas: ${formatoMoneda(totalPagado)}\n` +
      `• *SALDO PENDIENTE POR COBRAR: ${formatoMoneda(saldoPendiente)}*\n\n` +
      `📋 *DETALLE DE VENTAS (${comisiones.length}):*\n` +
      comisiones
        .map(
          (c) =>
            `• ${c.remisionFolio} | ${c.clienteNombre} | Venta: ${formatoMoneda(
              c.montoVenta
            )} | Com: ${formatoMoneda(c.montoComision)} [${c.estatus.toUpperCase()}]`
        )
        .join("\n") +
      `\n\nEmitido por Administración Sauceda el ${new Date().toLocaleDateString("es-MX")}.`;

    const url = tel
      ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank");
  };

  const Kpi = ({
    titulo,
    valor,
    sub,
    clases,
    colorValor,
  }: {
    titulo: string;
    valor: string;
    sub?: React.ReactNode;
    clases: string;
    colorValor: string;
  }) => (
    <div className={`px-2.5 py-1.5 rounded-lg border ${clases}`}>
      <span className="text-[8px] uppercase font-bold tracking-wider text-carbon/60 block leading-tight">
        {titulo}
      </span>
      <span className={`text-[13px] font-mono font-bold block leading-tight mt-0.5 ${colorValor}`}>{valor}</span>
      {sub && <span className="text-[8px] text-carbon/60 block leading-tight mt-0.5">{sub}</span>}
    </div>
  );

  const contenido = (
    <div
      data-print-root
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
    >
      <style>{ESTILOS_IMPRESION}</style>
      <div
        data-print-doc
        className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full overflow-hidden border border-carbon/10 text-carbon my-auto"
      >
        {/* Barra superior de acciones (oculta al imprimir) */}
        <div className="bg-verde-profundo text-crema px-6 py-3 flex items-center justify-between border-b border-dorado/30 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-titular text-sm font-bold tracking-wide">
              Vista de Impresión y Envío · Estado de Cuenta
            </span>
            <span className="text-[11px] bg-dorado/20 text-dorado px-2 py-0.5 rounded-full font-mono">
              {asesorNombre}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCompartirWhatsApp}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              title="Compartir resumen por WhatsApp"
            >
              <span>💬</span>
              <span>Enviar por WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handleImprimir}
              className="bg-dorado hover:bg-dorado/90 text-verde-profundo px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
              title="Imprimir o guardar en PDF"
            >
              <span>🖨️</span>
              <span>Imprimir / Guardar PDF</span>
            </button>
            <button
              type="button"
              onClick={alCerrar}
              className="text-crema/70 hover:text-crema p-1.5 rounded-lg transition hover:bg-crema/10"
              title="Cerrar vista"
            >
              ✕
            </button>
          </div>
        </div>

        {/* DOCUMENTO */}
        <div data-print-body className="p-6 max-h-[85vh] overflow-y-auto">
          {/* Encabezado compacto: marca a la izquierda, asesor y período a la derecha */}
          <div className="border-b-2 border-verde-profundo pb-3 mb-3 flex items-end justify-between gap-4">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="Sauceda" className="h-8 w-8" />
              <div>
                <h1 className="font-titular text-lg font-bold tracking-tight text-verde-profundo leading-none">
                  SAUCEDA
                </h1>
                <p className="font-titular text-[9px] font-semibold tracking-widest text-sauce uppercase mt-0.5">
                  Bienes Raíces & Construcción · Administración y Finanzas
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block bg-verde-profundo text-crema text-[10px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider">
                Reporte de Comisiones
              </span>
              <div className="text-[13px] font-bold text-verde-profundo mt-1 leading-tight">{asesorNombre}</div>
              <div className="text-[10px] text-carbon/70 leading-tight">
                Período: <span className="font-bold text-carbon">{periodoTexto}</span>
              </div>
              <div className="text-[9px] text-carbon/50 leading-tight">
                Emitido el {new Date().toLocaleDateString("es-MX", { dateStyle: "long" })}
                {asesorTelefono ? ` · Tel. ${asesorTelefono}` : ""}
              </div>
            </div>
          </div>

          {/* Resumen: una sola fila de tarjetas compactas */}
          <div className="grid grid-cols-3 sm:grid-cols-6 print:grid-cols-6 gap-2 mb-3">
            <Kpi
              titulo="Total Ventas"
              valor={formatoMoneda(totalVentas)}
              clases="bg-slate-50 border-carbon/10"
              colorValor="text-carbon"
            />
            <Kpi
              titulo="Base Comisionable"
              valor={formatoMoneda(tarjetasExtra.baseVentas)}
              sub={`${tarjetasExtra.ventasCount} ventas`}
              clases="bg-slate-50 border-carbon/10"
              colorValor="text-emerald-700"
            />
            <Kpi
              titulo="Inspecciones"
              valor={formatoMoneda(tarjetasExtra.inspeccionesMonto)}
              sub={`${tarjetasExtra.inspeccionesCount} inspecciones`}
              clases="bg-amber-50/60 border-amber-200"
              colorValor="text-amber-950"
            />
            <Kpi
              titulo="Comisión Generada"
              valor={formatoMoneda(totalComisiones)}
              clases="bg-slate-50 border-carbon/10"
              colorValor="text-blue-900"
            />
            <Kpi
              titulo="Comisión Pagada"
              valor={formatoMoneda(totalPagado)}
              clases="bg-emerald-50/70 border-emerald-200"
              colorValor="text-emerald-900"
            />
            <Kpi
              titulo="Balance Pendiente"
              valor={formatoMoneda(saldoPendiente)}
              sub={
                <>
                  {porLiquidar} comisión(es) por liquidar
                  {anticiposPendientes > 0 && (
                    <span className="block text-blue-800 font-semibold border-t border-amber-300/60 mt-0.5 pt-0.5">
                      💰 Anticipos a favor de SAUCEDA: {formatoMoneda(anticiposPendientes)}
                      <span className={`block font-mono font-bold ${saldoNeto < 0 ? "text-red-700" : "text-blue-900"}`}>
                        Saldo neto: {formatoMoneda(saldoNeto)}
                      </span>
                    </span>
                  )}
                </>
              }
              clases="bg-amber-50 border-amber-300"
              colorValor="text-amber-950"
            />
          </div>

          {/* Tabla de desglose */}
          <div className="mb-3">
            <h3 className="font-titular text-[10px] font-bold text-carbon uppercase tracking-wider mb-1 flex items-center justify-between border-b pb-0.5">
              <span>Relación Detallada de Ventas, Remisiones e Inspecciones</span>
              <span className="font-mono font-normal text-carbon/50">{comisiones.length} registros</span>
            </h3>

            {comisiones.length === 0 ? (
              <p className="text-xs text-carbon/50 italic py-3 text-center">
                No hay comisiones registradas en el período seleccionado.
              </p>
            ) : (
              <table className="w-full text-left text-[9px] leading-tight border-collapse">
                <thead>
                  <tr className="border-b border-carbon/30 text-carbon/70 text-[8px] uppercase bg-slate-50">
                    <th className="py-1 px-1">Folio / Fecha</th>
                    <th className="py-1 px-1">Asesor</th>
                    <th className="py-1 px-1">Cliente / Empresa</th>
                    <th className="py-1 px-1">Servicio</th>
                    <th className="py-1 px-1 text-right">Venta</th>
                    <th className="py-1 px-1 text-right">Base Com.</th>
                    <th className="py-1 px-1 text-center">% Com.</th>
                    <th className="py-1 px-1 text-right">Comisión</th>
                    <th className="py-1 px-1 text-right">Pagado</th>
                    <th className="py-1 px-1 text-right">Saldo</th>
                    <th className="py-1 px-1 text-center">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon/10 font-mono">
                  {comisiones.map((c) => (
                    <tr key={c.id}>
                      <td className="py-0.5 px-1 whitespace-nowrap">
                        <span className="font-bold text-verde-profundo">
                          {c.remisionFolio || (c.tipoComision === "inspeccion" ? "INSP" : "S/F")}
                        </span>
                        <span className="text-[8px] text-carbon/60 font-sans block">
                          {new Date(c.fecha).toLocaleDateString("es-MX")}
                        </span>
                      </td>
                      <td className="py-0.5 px-1 font-sans font-semibold whitespace-nowrap">{c.asesorNombre}</td>
                      <td className="py-0.5 px-1 font-sans max-w-[150px]">
                        <span className="font-semibold block truncate">{c.clienteNombre}</span>
                        {c.clienteEmpresa && (
                          <span className="text-[8px] text-carbon/50 block truncate">{c.clienteEmpresa}</span>
                        )}
                      </td>
                      <td className="py-0.5 px-1 font-sans capitalize text-carbon/80 whitespace-nowrap">
                        {c.tipoComision === "inspeccion"
                          ? "Inspección Técnica"
                          : c.servicioTipo?.replace(/_/g, " ") || "Construcción"}
                      </td>
                      <td className="py-0.5 px-1 text-right whitespace-nowrap">
                        {c.tipoComision === "inspeccion" ? (
                          <span className="text-[8px] text-carbon/50 italic font-sans">Tarifa Fija</span>
                        ) : (
                          formatoMoneda(c.montoVenta)
                        )}
                      </td>
                      <td className="py-0.5 px-1 text-right text-emerald-700 whitespace-nowrap">
                        {formatoMoneda(c.baseComisionable)}
                        {c.tipoComision !== "inspeccion" && (c.costoProveedor > 0 || c.comisionBancaria > 0) && (
                          <span className="block text-[7px] text-carbon/40">
                            −{formatoMoneda(c.costoProveedor + c.comisionBancaria)}
                          </span>
                        )}
                      </td>
                      <td className="py-0.5 px-1 text-center text-carbon/70 whitespace-nowrap">
                        {c.tipoComision === "inspeccion" ? "FIJA" : `${c.porcentajeComision}%`}
                        {c.esAjusteManual && <span className="text-[7px] text-amber-600 block">*manual</span>}
                      </td>
                      <td className="py-0.5 px-1 text-right font-bold text-blue-900 whitespace-nowrap">
                        {formatoMoneda(c.montoComision)}
                      </td>
                      <td className="py-0.5 px-1 text-right text-emerald-700 whitespace-nowrap">
                        {formatoMoneda(c.montoPagado)}
                        {(c.montoNeteadoAnticipo || 0) > 0 && (
                          <span className="block text-[7px] text-blue-700 font-sans">
                            {formatoMoneda(c.montoNeteadoAnticipo || 0)} c/anticipo
                          </span>
                        )}
                      </td>
                      <td className="py-0.5 px-1 text-right font-bold text-amber-950 whitespace-nowrap">
                        {formatoMoneda(c.saldoPendiente)}
                      </td>
                      <td className="py-0.5 px-1 text-center font-sans">
                        <span
                          className={`inline-block px-1.5 py-px rounded text-[8px] font-bold uppercase ${
                            c.estatus === "pagada"
                              ? "bg-emerald-100 text-emerald-800"
                              : c.estatus === "parcial"
                              ? "bg-blue-100 text-blue-800"
                              : c.estatus === "cancelada"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {c.estatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-carbon/30 font-bold bg-slate-50 font-mono text-[9px]">
                    <td colSpan={4} className="py-1 px-1 font-sans uppercase">
                      Totales generales
                    </td>
                    <td className="py-1 px-1 text-right whitespace-nowrap">{formatoMoneda(totalVentas)}</td>
                    <td className="py-1 px-1 text-right whitespace-nowrap">{formatoMoneda(totalBase)}</td>
                    <td className="py-1 px-1 text-center">-</td>
                    <td className="py-1 px-1 text-right text-blue-900 whitespace-nowrap">{formatoMoneda(totalComisiones)}</td>
                    <td className="py-1 px-1 text-right text-emerald-800 whitespace-nowrap">{formatoMoneda(totalPagado)}</td>
                    <td className="py-1 px-1 text-right text-amber-950 whitespace-nowrap">{formatoMoneda(saldoPendiente)}</td>
                    <td className="py-1 px-1 text-center">-</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Historial de pagos aplicados */}
          {pagos.length > 0 && (
            <div className="mb-3 print:break-inside-avoid">
              <h3 className="font-titular text-[10px] font-bold text-carbon uppercase tracking-wider mb-1 border-b pb-0.5">
                Historial de Pagos y Liquidaciones Recibidas
              </h3>
              <table className="w-full text-left text-[9px] leading-tight border-collapse font-mono">
                <thead>
                  <tr className="text-carbon/60 text-[8px] uppercase border-b bg-slate-50">
                    <th className="py-0.5 px-1">Fecha</th>
                    <th className="py-0.5 px-1">Método</th>
                    <th className="py-0.5 px-1">Referencia</th>
                    <th className="py-0.5 px-1">Notas</th>
                    <th className="py-0.5 px-1 text-right">Monto Pagado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon/5">
                  {pagos.map((p) => (
                    <tr key={p.id}>
                      <td className="py-0.5 px-1 font-sans">{new Date(p.fechaPago).toLocaleDateString("es-MX")}</td>
                      <td className="py-0.5 px-1 capitalize font-sans">{p.metodoPago}</td>
                      <td className="py-0.5 px-1">{p.referencia || "S/Ref"}</td>
                      <td className="py-0.5 px-1 font-sans text-carbon/70">{p.notas || "-"}</td>
                      <td className="py-0.5 px-1 text-right font-bold text-emerald-800">{formatoMoneda(p.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Firmas */}
          <div className="border-t border-carbon/20 pt-5 mt-4 grid grid-cols-2 gap-10 text-center text-[10px] print:break-inside-avoid">
            <div>
              <div className="border-b border-carbon/40 w-44 mx-auto mb-1" />
              <p className="font-bold text-carbon">{asesorNombre}</p>
              <p className="text-[8px] text-carbon/50 uppercase">Asesor Comisionista</p>
            </div>
            <div>
              <div className="border-b border-carbon/40 w-44 mx-auto mb-1" />
              <p className="font-bold text-carbon">Dirección Administrativa</p>
              <p className="text-[8px] text-carbon/50 uppercase">Sauceda Bienes Raíces & Construcción</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Se monta directamente en <body> para poder imprimir solo este documento
  return montado ? createPortal(contenido, document.body) : null;
}
