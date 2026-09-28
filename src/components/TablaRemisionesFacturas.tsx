"use client";

import React from "react";
import Link from "next/link";
import type { RemisionFacturaEnriquecida } from "@/app/actions/remisiones";

interface TablaRemisionesFacturasProps {
  remisiones: RemisionFacturaEnriquecida[];
  cargando: boolean;
  alVerDetalle: (rem: RemisionFacturaEnriquecida) => void;
  alNuevaRemision?: () => void;
}

export function TablaRemisionesFacturas({
  remisiones,
  cargando,
  alVerDetalle,
  alNuevaRemision,
}: TablaRemisionesFacturasProps) {
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
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return fechaStr;
    }
  };

  const getTipoDocumentoBadge = (tipo: "remision" | "factura") => {
    if (tipo === "factura") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200/80 px-2.5 py-0.5 text-[11px] font-bold text-purple-700 shadow-2xs">
          <span>🏛️</span>
          <span>Factura</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200/80 px-2.5 py-0.5 text-[11px] font-bold text-sky-800 shadow-2xs">
        <span>📦</span>
        <span>Remisión</span>
      </span>
    );
  };

  const getTipoBadge = (tipo?: string | null) => {
    const tiposMap: Record<string, { label: string; color: string }> = {
      impermeabilizacion: {
        label: "Impermeabilización",
        color: "bg-cyan-50 text-cyan-800 border-cyan-200/60",
      },
      mantenimiento_cisternas: {
        label: "Cisternas & Aljibes",
        color: "bg-sky-50 text-sky-800 border-sky-200/60",
      },
      construccion: {
        label: "Construcción",
        color: "bg-emerald-50 text-emerald-800 border-emerald-200/60",
      },
      herreria: {
        label: "Herrería",
        color: "bg-stone-100 text-stone-800 border-stone-200",
      },
      piso_estampado: {
        label: "Piso Estampado",
        color: "bg-orange-50 text-orange-800 border-orange-200/60",
      },
      traspaso_compra: {
        label: "Inmobiliaria",
        color: "bg-purple-50 text-purple-800 border-purple-200/60",
      },
      pintura: {
        label: "Pintura",
        color: "bg-amber-50 text-amber-800 border-amber-200/60",
      },
      remodelacion: {
        label: "Remodelación",
        color: "bg-indigo-50 text-indigo-800 border-indigo-200/60",
      },
    };

    const tipoSeguro = (tipo || "general").toLowerCase();
    const config = tiposMap[tipoSeguro] || {
      label: (tipo || "General").replace(/_/g, " "),
      color: "bg-slate-100 text-slate-700 border-slate-200",
    };

    return (
      <span
        className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-medium capitalize ${config.color}`}
      >
        {config.label}
      </span>
    );
  };

  if (cargando) {
    return (
      <div className="rounded-2xl border border-carbon/10 bg-white p-12 text-center shadow-xs">
        <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-sauce border-t-transparent mb-3"></div>
        <p className="text-xs font-semibold text-carbon/60">
          Cargando concentrado de remisiones y facturas...
        </p>
      </div>
    );
  }

  if (remisiones.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-carbon/15 bg-white p-12 text-center shadow-xs space-y-3">
        <span className="text-4xl block">🧾</span>
        <p className="font-titular font-bold text-carbon/80 text-base">
          No se encontraron remisiones ni facturas
        </p>
        <p className="text-xs text-carbon/50 max-w-md mx-auto font-cuerpo">
          No hay documentos emitidos que coincidan con los filtros seleccionados.
          Puedes limpiar tu búsqueda o generar una remisión desde una orden de trabajo.
        </p>
        {alNuevaRemision && (
          <button
            type="button"
            onClick={alNuevaRemision}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-sauce hover:bg-verde-profundo px-4 py-2 text-xs font-bold text-white transition shadow-sm"
          >
            <span>+</span> Ir a Órdenes para Emitir
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-carbon/10 bg-white shadow-xs overflow-hidden">
      {/* Vista de Tabla para Escritorio */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs font-cuerpo">
          <thead className="bg-slate-50 border-b border-carbon/10 font-titular font-semibold text-carbon/60 uppercase tracking-wider text-[11px] shadow-2xs">
            <tr>
              <th className="px-5 py-3.5">Folio & Fecha</th>
              <th className="px-5 py-3.5">Cliente</th>
              <th className="px-5 py-3.5">Origen / Orden de Trabajo</th>
              <th className="px-5 py-3.5">Tipo</th>
              <th className="px-5 py-3.5 text-right">Importe & Saldo</th>
              <th className="px-5 py-3.5 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon/5 text-carbon">
            {remisiones.map((rem) => {
              const urlPublica = rem.ordenEntregaToken
                ? `/orden-trabajo/remision/${rem.ordenEntregaToken}`
                : rem.cotizacionToken
                ? `/cotizacion/remision/${rem.cotizacionToken}`
                : null;

              const porcentajeCobrado =
                rem.montoTotal > 0
                  ? Math.min(100, Math.round(((rem.totalCobrado || 0) / rem.montoTotal) * 100))
                  : 0;

              return (
                <tr
                  key={rem.id}
                  className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                  onClick={() => alVerDetalle(rem)}
                >
                  {/* Folio & Fecha */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    <div className="font-mono font-bold text-sauce group-hover:text-verde-profundo group-hover:underline inline-flex items-center gap-1.5 text-xs">
                      <span>{rem.folio}</span>
                    </div>
                    <div className="text-[10.5px] text-carbon/50 font-mono mt-0.5 flex items-center gap-1">
                      <span>📅</span>
                      <span>{formatearFecha(rem.fecha)}</span>
                    </div>
                  </td>

                  {/* Cliente */}
                  <td
                    className="px-5 py-4 max-w-[220px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="font-semibold text-carbon text-xs truncate">
                      {rem.clienteNombre}
                    </div>
                    {rem.clienteTelefono && (
                      <div className="text-[11px] font-mono text-carbon/50 mt-0.5 truncate">
                        📱 {rem.clienteTelefono}
                      </div>
                    )}
                    {rem.tipo === "factura" && rem.datosDocumento?.rfc && (
                      <div className="text-[10.5px] font-mono text-purple-700 font-semibold mt-0.5 truncate">
                        RFC: {rem.datosDocumento.rfc}
                      </div>
                    )}
                    {rem.prospectoId && (
                      <div className="mt-1.5">
                        <Link
                          href={`/prospectos/${rem.prospectoId}`}
                          prefetch={false}
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-carbon/70 hover:text-carbon hover:underline bg-slate-100 px-1.5 py-0.5 rounded border border-carbon/15"
                          title="Ver ficha del cliente en CRM"
                        >
                          <span>👤</span> CRM Prospecto
                        </Link>
                      </div>
                    )}
                  </td>

                  {/* Origen / Orden de Trabajo */}
                  <td
                    className="px-5 py-4 max-w-[240px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {rem.ordenTrabajoId ? (
                      <div>
                        <Link
                          href={`/ordenes-trabajo/${rem.ordenTrabajoId}`}
                          prefetch={false}
                          className="font-mono font-bold text-sauce hover:underline text-xs inline-flex items-center gap-1"
                          title="Ir a orden de trabajo vinculada"
                        >
                          <span>🛠️ {rem.ordenFolio || "OT"}</span>
                        </Link>
                        {rem.ordenTitulo && (
                          <div className="font-semibold text-carbon text-xs line-clamp-1 mt-0.5">
                            {rem.ordenTitulo}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          {rem.ordenTipoNegocio && getTipoBadge(rem.ordenTipoNegocio)}
                          {rem.asesorNombre && rem.asesorNombre !== "Sin asignar" && (
                            <span className="text-[10.5px] text-carbon/50 truncate">
                              👤 {rem.asesorNombre}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : rem.cotizacionId ? (
                      <div>
                        <Link
                          href={`/cotizacion/${rem.cotizacionToken || rem.cotizacionId}`}
                          target="_blank"
                          className="font-mono font-bold text-carbon/80 hover:text-sauce hover:underline text-xs inline-flex items-center gap-1"
                        >
                          <span>📑 Cotización {rem.cotizacionFolio || rem.cotizacionId}</span>
                        </Link>
                        {rem.cotizacionServicioTipo && (
                          <div className="mt-1">
                            {getTipoBadge(rem.cotizacionServicioTipo)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-carbon/40 italic text-xs">Directo</span>
                    )}
                  </td>

                  {/* Tipo de Documento */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {getTipoDocumentoBadge(rem.tipo)}
                  </td>

                  {/* Importe & Saldo */}
                  <td className="px-5 py-4 whitespace-nowrap text-right font-mono">
                    <div className="space-y-1">
                      <div className="font-bold text-verde-profundo text-xs">
                        {formatMoneda(rem.montoTotal)}
                      </div>

                      {((rem.costoFinanciero || 0) > 0 || (rem.costoProveedor || 0) > 0) && (
                        <div>
                          <span
                            className="text-[9.5px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded inline-block"
                            title="Base gravable para comisiones tras deducir pasarela y proveedor"
                          >
                            Base: {formatMoneda(rem.baseGravableComision)}
                          </span>
                        </div>
                      )}

                      {rem.ordenTrabajoId && (
                        <>
                          <div className="text-[10px] text-carbon/60">
                            Cobrado:{" "}
                            <span className="text-emerald-700 font-semibold">
                              {formatMoneda(rem.totalCobrado || 0)}
                            </span>
                          </div>
                          {(rem.saldoRestante || 0) > 0 ? (
                            <div className="text-[10px] font-bold text-amber-700">
                              Resta: {formatMoneda(rem.saldoRestante || 0)}
                            </div>
                          ) : (
                            <div className="text-[10px] font-bold text-emerald-700">
                              ✓ Liquidado
                            </div>
                          )}
                          <div className="w-20 ml-auto h-1.5 rounded-full bg-carbon/10 overflow-hidden mt-1">
                            <div
                              className={`h-full rounded-full transition-all ${
                                porcentajeCobrado >= 100
                                  ? "bg-emerald-600"
                                  : "bg-amber-500"
                              }`}
                              style={{ width: `${porcentajeCobrado}%` }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </td>

                  {/* Acciones */}
                  <td
                    className="px-5 py-4 whitespace-nowrap text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => alVerDetalle(rem)}
                        className="inline-flex items-center gap-1 rounded-lg border border-carbon/20 bg-white hover:bg-slate-100 px-2.5 py-1 text-xs font-semibold text-carbon transition shadow-2xs"
                        title="Ver detalle del documento"
                      >
                        <span>👁️ Detalle</span>
                      </button>

                      {urlPublica && (
                        <a
                          href={urlPublica}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-sauce/30 bg-sauce/10 hover:bg-sauce hover:text-white px-2.5 py-1 text-xs font-bold text-sauce transition shadow-2xs"
                          title="Abrir portal oficial para imprimir o compartir"
                        >
                          <span>🖨️ PDF</span>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Vista de Tarjetas para Móviles */}
      <div className="divide-y divide-carbon/10 md:hidden">
        {remisiones.map((rem) => {
          const urlPublica = rem.ordenEntregaToken
            ? `/orden-trabajo/remision/${rem.ordenEntregaToken}`
            : rem.cotizacionToken
            ? `/cotizacion/remision/${rem.cotizacionToken}`
            : null;

          return (
            <div
              key={rem.id}
              className="p-4 space-y-3 cursor-pointer hover:bg-slate-50/60 transition-colors"
              onClick={() => alVerDetalle(rem)}
            >
              {/* Encabezado tarjeta */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-sauce bg-sauce/10 border border-sauce/20 px-2 py-0.5 rounded">
                      {rem.folio}
                    </span>
                    {getTipoDocumentoBadge(rem.tipo)}
                  </div>
                  <div className="text-[10px] text-carbon/40 font-mono mt-1">
                    📅 {formatearFecha(rem.fecha)}
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="font-bold text-verde-profundo text-sm">
                    {formatMoneda(rem.montoTotal)}
                  </div>
                  {((rem.costoFinanciero || 0) > 0 || (rem.costoProveedor || 0) > 0) && (
                    <div className="text-[9.5px] font-semibold text-emerald-800 bg-emerald-50 px-1 py-0.5 rounded inline-block mt-0.5">
                      Base: {formatMoneda(rem.baseGravableComision)}
                    </div>
                  )}
                  {rem.ordenTrabajoId && (
                    <div className="text-[10px] text-carbon/50">
                      {rem.saldoRestante > 0 ? (
                        <span className="text-amber-700 font-semibold">
                          Resta: {formatMoneda(rem.saldoRestante)}
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-bold">✓ Liquidado</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Cliente */}
              <div>
                <div className="font-semibold text-carbon text-xs">
                  {rem.clienteNombre}
                </div>
                {rem.clienteTelefono && (
                  <div className="text-[11px] font-mono text-carbon/50">
                    📱 {rem.clienteTelefono}
                  </div>
                )}
                {rem.tipo === "factura" && rem.datosDocumento?.rfc && (
                  <div className="text-[10px] font-mono text-purple-700">
                    RFC: {rem.datosDocumento.rfc}
                  </div>
                )}
              </div>

              {/* Origen OT */}
              {rem.ordenTrabajoId && (
                <div
                  className="rounded-lg bg-slate-50 border border-carbon/10 p-2 text-[11px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/ordenes-trabajo/${rem.ordenTrabajoId}`}
                      prefetch={false}
                      className="font-mono font-bold text-sauce hover:underline"
                    >
                      🛠️ {rem.ordenFolio || "Ver OT"}
                    </Link>
                    {rem.ordenTipoNegocio && getTipoBadge(rem.ordenTipoNegocio)}
                  </div>
                  {rem.ordenTitulo && (
                    <div className="text-carbon/70 text-[10px] truncate mt-0.5">
                      {rem.ordenTitulo}
                    </div>
                  )}
                </div>
              )}

              {/* Acciones */}
              <div
                className="flex items-center justify-end gap-2 pt-1 border-t border-carbon/5"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => alVerDetalle(rem)}
                  className="rounded-lg border border-carbon/20 bg-white hover:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-carbon transition"
                >
                  👁️ Ver Detalle
                </button>

                {urlPublica && (
                  <a
                    href={urlPublica}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-sauce hover:bg-verde-profundo text-white font-bold px-3 py-1.5 text-xs transition"
                  >
                    🖨️ PDF / Portal
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
