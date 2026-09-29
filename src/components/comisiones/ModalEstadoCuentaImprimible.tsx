"use client";

import type { Comision, ComisionPago } from "@/lib/types";
import { calcularTotalesTarjetas } from "@/lib/comisiones-totales";

interface Props {
  asesorNombre: string;
  asesorTelefono?: string | null;
  periodoTexto: string;
  comisiones: Comision[];
  pagos: ComisionPago[];
  alCerrar: () => void;
}

export function ModalEstadoCuentaImprimible({
  asesorNombre,
  asesorTelefono,
  periodoTexto,
  comisiones,
  pagos,
  alCerrar,
}: Props) {
  const formatoMoneda = (val: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

  // Totales
  const totalVentas = comisiones.reduce((acc, c) => acc + c.montoVenta, 0);
  const tarjetasExtra = calcularTotalesTarjetas(comisiones);
  const totalBase = comisiones.reduce((acc, c) => acc + c.baseComisionable, 0);
  const totalComisiones = comisiones.reduce((acc, c) => acc + c.montoComision, 0);
  const totalPagado = comisiones.reduce((acc, c) => acc + c.montoPagado, 0);
  const saldoPendiente = comisiones.reduce((acc, c) => acc + c.saldoPendiente, 0);

  const handleImprimir = () => {
    window.print();
  };

  const handleCompartirWhatsApp = () => {
    const tel = asesorTelefono?.replace(/\D/g, "") || "";
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:z-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-carbon/10 text-carbon my-auto print:shadow-none print:border-none print:rounded-none print:max-w-none">
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

        {/* DOCUMENTO MEMBRETADO OFICIAL */}
        <div className="p-8 sm:p-12 print:p-8 max-h-[85vh] print:max-h-none overflow-y-auto print:overflow-visible">
          {/* Encabezado membretado */}
          <div className="border-b-2 border-verde-profundo pb-6 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
            <div>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.svg" alt="Sauceda" className="h-10 w-10" />
                <div>
                  <h1 className="font-titular text-2xl font-bold tracking-tight text-verde-profundo leading-none">
                    SAUCEDA
                  </h1>
                  <p className="font-titular text-[11px] font-semibold tracking-widest text-sauce uppercase mt-1">
                    Bienes Raíces & Construcción
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-carbon/60 mt-2">
                León, Guanajuato · Departamento de Administración y Finanzas
              </p>
            </div>

            <div className="text-left sm:text-right">
              <span className="inline-block bg-verde-profundo text-crema text-[11px] font-bold px-3 py-1 rounded-md uppercase tracking-wider">
                Estado de Cuenta de Comisiones
              </span>
              <div className="font-mono text-xs text-carbon/60 mt-2">
                Período: <span className="font-bold text-carbon">{periodoTexto}</span>
              </div>
              <div className="text-[11px] text-carbon/50 mt-0.5">
                Fecha de Emisión: {new Date().toLocaleDateString("es-MX", { dateStyle: "long" })}
              </div>
            </div>
          </div>

          {/* Datos del Asesor */}
          <div className="bg-slate-50 border border-carbon/10 rounded-xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-carbon/50 block text-[10px] uppercase font-bold tracking-wider">
                Asesor Comercial
              </span>
              <span className="font-bold text-sm text-verde-profundo block mt-0.5">
                {asesorNombre}
              </span>
            </div>
            <div>
              <span className="text-carbon/50 block text-[10px] uppercase font-bold tracking-wider">
                Teléfono de Contacto
              </span>
              <span className="font-mono text-carbon font-semibold block mt-0.5">
                {asesorTelefono || "No registrado"}
              </span>
            </div>
            <div>
              <span className="text-carbon/50 block text-[10px] uppercase font-bold tracking-wider">
                Ventas Comisionadas
              </span>
              <span className="font-bold text-carbon block mt-0.5">
                {comisiones.length} documento(s)
              </span>
            </div>
          </div>

          {/* Cuadro de Balance */}
          <div className="grid grid-cols-2 sm:grid-cols-3 print:grid-cols-3 gap-3 mb-8">
            <div className="p-4 rounded-xl bg-slate-50 border border-carbon/10">
              <span className="text-[10px] uppercase font-bold tracking-wider text-carbon/50 block">
                Total Ventas
              </span>
              <span className="text-base font-mono font-bold text-carbon mt-1 block">
                {formatoMoneda(totalVentas)}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-carbon/10">
              <span className="text-[10px] uppercase font-bold tracking-wider text-carbon/50 block">
                Base Comisionable
              </span>
              <span className="text-base font-mono font-bold text-emerald-700 mt-1 block">
                {formatoMoneda(tarjetasExtra.baseVentas)}
              </span>
              <span className="text-[10px] text-carbon/50 block">{tarjetasExtra.ventasCount} ventas</span>
            </div>

            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-800 block">
                Inspecciones
              </span>
              <span className="text-base font-mono font-bold text-amber-950 mt-1 block">
                {formatoMoneda(tarjetasExtra.inspeccionesMonto)}
              </span>
              <span className="text-[10px] text-amber-900/70 block">{tarjetasExtra.inspeccionesCount} inspecciones</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-carbon/10">
              <span className="text-[10px] uppercase font-bold tracking-wider text-carbon/50 block">
                Comisión Generada
              </span>
              <span className="text-base font-mono font-bold text-blue-900 mt-1 block">
                {formatoMoneda(totalComisiones)}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-800 block">
                Comisión Pagada
              </span>
              <span className="text-base font-mono font-bold text-emerald-900 mt-1 block">
                {formatoMoneda(totalPagado)}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-900 block">
                Saldo a Favor Asesor
              </span>
              <span className="text-base font-mono font-bold text-amber-950 mt-1 block">
                {formatoMoneda(saldoPendiente)}
              </span>
            </div>
          </div>

          {/* Tabla de Desglose de Ventas */}
          <div className="mb-8">
            <h3 className="font-titular text-sm font-bold text-carbon uppercase tracking-wider mb-3 flex items-center justify-between border-b pb-1">
              <span>Relación Detallada de Ventas y Remisiones</span>
              <span className="text-[11px] font-mono font-normal text-carbon/50">
                {comisiones.length} registros
              </span>
            </h3>

            {comisiones.length === 0 ? (
              <p className="text-xs text-carbon/50 italic py-4 text-center">
                No hay ventas comisionables registradas en el período seleccionado.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-carbon/20 text-carbon/70 text-[10px] uppercase">
                      <th className="py-2 px-1">Folio / Fecha</th>
                      <th className="py-2 px-1">Asesor</th>
                      <th className="py-2 px-1">Cliente / Empresa</th>
                      <th className="py-2 px-1">Servicio</th>
                      <th className="py-2 px-1 text-right">Venta</th>
                      <th className="py-2 px-1 text-right">Base Comisionable</th>
                      <th className="py-2 px-1 text-center">% Com.</th>
                      <th className="py-2 px-1 text-right">Comisión</th>
                      <th className="py-2 px-1 text-right">Pagado</th>
                      <th className="py-2 px-1 text-right">Saldo</th>
                      <th className="py-2 px-1 text-center">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-carbon/10 font-mono">
                    {comisiones.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/50">
                        <td className="py-2 px-1 whitespace-nowrap">
                          <span className="font-bold text-verde-profundo block">
                            {c.remisionFolio || (c.tipoComision === "inspeccion" ? "INSP" : "S/F")}
                          </span>
                          <span className="text-[10px] text-carbon/60 font-sans block">
                            {new Date(c.fecha).toLocaleDateString("es-MX")}
                          </span>
                        </td>
                        <td className="py-2 px-1 font-sans font-semibold text-carbon whitespace-nowrap">
                          {c.asesorNombre}
                        </td>
                        <td className="py-2 px-1 font-sans text-carbon max-w-[160px] truncate" title={c.clienteNombre}>
                          <span className="font-semibold block truncate">{c.clienteNombre}</span>
                          {c.clienteEmpresa && (
                            <span className="text-[10px] text-carbon/50 block truncate">
                              🏢 {c.clienteEmpresa}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-1 font-sans capitalize text-carbon/80 text-[11px] whitespace-nowrap">
                          {c.tipoComision === "inspeccion"
                            ? "Inspección Técnica"
                            : c.servicioTipo?.replace(/_/g, " ") || "Construcción"}
                        </td>
                        <td className="py-2 px-1 text-right font-medium">
                          {c.tipoComision === "inspeccion" ? (
                            <span className="text-[10px] text-carbon/50 italic font-sans">Tarifa Fija</span>
                          ) : (
                            formatoMoneda(c.montoVenta)
                          )}
                        </td>
                        <td className="py-2 px-1 text-right font-medium text-emerald-700">
                          {formatoMoneda(c.baseComisionable)}
                          {c.tipoComision !== "inspeccion" && (c.costoProveedor > 0 || c.comisionBancaria > 0) && (
                            <span className="block text-[9px] text-carbon/40 font-normal">
                              −{formatoMoneda(c.costoProveedor + c.comisionBancaria)}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-1 text-center text-carbon/70">
                          {c.tipoComision === "inspeccion" ? "FIJA" : `${c.porcentajeComision}%`}
                          {c.esAjusteManual && <span className="text-[9px] text-amber-600 block">*manual</span>}
                        </td>
                        <td className="py-2 px-1 text-right font-bold text-blue-900">
                          {formatoMoneda(c.montoComision)}
                        </td>
                        <td className="py-2 px-1 text-right text-emerald-700">
                          {formatoMoneda(c.montoPagado)}
                        </td>
                        <td className="py-2 px-1 text-right font-bold text-amber-950">
                          {formatoMoneda(c.saldoPendiente)}
                        </td>
                        <td className="py-2 px-1 text-center font-sans">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              c.estatus === "pagada"
                                ? "bg-emerald-100 text-emerald-800"
                                : c.estatus === "parcial"
                                ? "bg-blue-100 text-blue-800"
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
                    <tr className="border-t-2 border-carbon/20 font-bold text-xs bg-slate-50 font-mono">
                      <td colSpan={4} className="py-2 px-1 font-sans uppercase">
                        Totales Generales:
                      </td>
                      <td className="py-2 px-1 text-right">{formatoMoneda(totalVentas)}</td>
                      <td className="py-2 px-1 text-right">{formatoMoneda(totalBase)}</td>
                      <td className="py-2 px-1 text-center">-</td>
                      <td className="py-2 px-1 text-right text-blue-900">{formatoMoneda(totalComisiones)}</td>
                      <td className="py-2 px-1 text-right text-emerald-800">{formatoMoneda(totalPagado)}</td>
                      <td className="py-2 px-1 text-right text-amber-950">{formatoMoneda(saldoPendiente)}</td>
                      <td className="py-2 px-1 text-center">-</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Historial de Pagos aplicados si existen */}
          {pagos.length > 0 && (
            <div className="mb-8 print:break-inside-avoid">
              <h3 className="font-titular text-sm font-bold text-carbon uppercase tracking-wider mb-2 border-b pb-1">
                Pagos y Dispersiones Aplicadas en el Período
              </h3>
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="text-carbon/60 text-[10px] uppercase border-b">
                    <th className="py-1">Fecha</th>
                    <th className="py-1">Método</th>
                    <th className="py-1">Referencia</th>
                    <th className="py-1">Notas</th>
                    <th className="py-1 text-right">Monto Pagado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-carbon/5">
                  {pagos.map((p) => (
                    <tr key={p.id}>
                      <td className="py-1 font-sans">{new Date(p.fechaPago).toLocaleDateString("es-MX")}</td>
                      <td className="py-1 capitalize font-sans">{p.metodoPago}</td>
                      <td className="py-1">{p.referencia || "S/Ref"}</td>
                      <td className="py-1 font-sans text-carbon/70">{p.notas || "-"}</td>
                      <td className="py-1 text-right font-bold text-emerald-800">{formatoMoneda(p.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Bloque de Firmas y Validación */}
          <div className="border-t border-carbon/20 pt-10 mt-12 grid grid-cols-2 gap-12 text-center text-xs print:break-inside-avoid">
            <div>
              <div className="border-b border-carbon/40 w-48 mx-auto mb-2" />
              <p className="font-bold text-carbon">{asesorNombre}</p>
              <p className="text-[10px] text-carbon/50 uppercase">Asesor Comisionista</p>
            </div>
            <div>
              <div className="border-b border-carbon/40 w-48 mx-auto mb-2" />
              <p className="font-bold text-carbon">Dirección Administrativa</p>
              <p className="text-[10px] text-carbon/50 uppercase">Sauceda Bienes Raíces & Construcción</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
