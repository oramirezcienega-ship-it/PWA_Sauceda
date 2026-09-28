"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { OrdenTrabajo } from "@/app/actions/ordenes-trabajo";

interface TablaOrdenesTrabajoProps {
  ordenes: OrdenTrabajo[];
  cargando: boolean;
  asesores?: Array<{ id: string; nombre: string }>;
  alActualizarEstatus?: (ot: OrdenTrabajo, nuevoEstatus: "pendiente" | "en_proceso" | "completada" | "cancelada") => Promise<void>;
  alNuevaOrden?: () => void;
}

export function TablaOrdenesTrabajo({
  ordenes,
  cargando,
  asesores = [],
  alActualizarEstatus,
  alNuevaOrden,
}: TablaOrdenesTrabajoProps) {
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(val);
  };

  const getEstatusBadge = (estatus: string) => {
    switch (estatus) {
      case "en_proceso":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse"></span>
            En Proceso
          </span>
        );
      case "pendiente":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200/60 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            Pendiente
          </span>
        );
      case "completada":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
            Completada ✓
          </span>
        );
      case "cancelada":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
            Cancelada
          </span>
        );
      default:
        return (
          <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
            {estatus}
          </span>
        );
    }
  };

  const getTipoBadge = (tipo: string) => {
    const tiposMap: Record<string, { label: string; color: string }> = {
      impermeabilizacion: { label: "Impermeabilización", color: "bg-cyan-50 text-cyan-800 border-cyan-200/60" },
      mantenimiento_cisternas: { label: "Cisternas & Aljibes", color: "bg-sky-50 text-sky-800 border-sky-200/60" },
      construccion: { label: "Construcción", color: "bg-emerald-50 text-emerald-800 border-emerald-200/60" },
      herreria: { label: "Herrería", color: "bg-stone-100 text-stone-800 border-stone-200" },
      piso_estampado: { label: "Piso Estampado", color: "bg-orange-50 text-orange-800 border-orange-200/60" },
      traspaso_compra: { label: "Inmobiliaria", color: "bg-purple-50 text-purple-800 border-purple-200/60" },
    };

    const config = tiposMap[tipo] || {
      label: tipo.replace(/_/g, " "),
      color: "bg-slate-100 text-slate-700 border-slate-200",
    };

    return (
      <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const handleCambiarEstado = async (ot: OrdenTrabajo, nuevoEstatus: any) => {
    if (!alActualizarEstatus) return;
    try {
      setActualizandoId(ot.id);
      await alActualizarEstatus(ot, nuevoEstatus);
    } finally {
      setActualizandoId(null);
    }
  };

  if (cargando) {
    return (
      <div className="rounded-2xl border border-carbon/10 bg-white p-12 text-center shadow-xs">
        <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-sauce border-t-transparent mb-3"></div>
        <p className="text-xs font-semibold text-carbon/60">Cargando órdenes de trabajo...</p>
      </div>
    );
  }

  if (ordenes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-carbon/15 bg-white p-12 text-center shadow-xs space-y-3">
        <span className="text-4xl block">🛠️</span>
        <p className="font-titular font-bold text-carbon/80 text-base">
          No se encontraron órdenes de trabajo
        </p>
        <p className="text-xs text-carbon/50 max-w-md mx-auto font-cuerpo">
          No hay órdenes registradas que coincidan con los filtros seleccionados. Puedes crear una nueva orden o limpiar tu búsqueda.
        </p>
        {alNuevaOrden && (
          <button
            type="button"
            onClick={alNuevaOrden}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-sauce hover:bg-verde-profundo px-4 py-2 text-xs font-bold text-white transition shadow-sm"
          >
            <span>+</span> Nueva Orden de Trabajo
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
              <th className="px-5 py-3.5">Folio</th>
              <th className="px-5 py-3.5">Cliente</th>
              <th className="px-5 py-3.5">Trabajo / Servicio</th>
              <th className="px-5 py-3.5">Fechas</th>
              <th className="px-5 py-3.5">Asesor Ejecutor</th>
              <th className="px-5 py-3.5">Estatus</th>
              <th className="px-5 py-3.5 text-right">Cobranza & Saldo</th>
              <th className="px-5 py-3.5 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carbon/5 text-carbon">
            {ordenes.map((ot) => {
              const porcentajeCobrado =
                (ot.totalCotizado || 0) > 0
                  ? Math.min(100, Math.round(((ot.totalPagado || 0) / (ot.totalCotizado || 1)) * 100))
                  : 0;

              return (
                <tr key={ot.id} className="hover:bg-slate-50/70 transition-colors group">
                  {/* Folio */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    <Link
                      href={`/ordenes-trabajo/${ot.id}`}
                      className="font-mono font-bold text-sauce hover:text-verde-profundo hover:underline inline-flex items-center gap-1.5 text-xs"
                      title="Ver y editar orden de trabajo"
                    >
                      <span>{ot.folio}</span>
                    </Link>
                    <div className="text-[10px] text-carbon/40 font-mono mt-0.5">
                      {new Date(ot.createdAt).toLocaleDateString()}
                    </div>
                  </td>

                  {/* Cliente */}
                  <td className="px-5 py-4 max-w-[200px]">
                    <div className="font-semibold text-carbon text-xs truncate">
                      {ot.clienteNombre || "Cliente General"}
                    </div>
                    {ot.clienteTelefono && (
                      <div className="text-[11px] font-mono text-carbon/50 mt-0.5 truncate">
                        📱 {ot.clienteTelefono}
                      </div>
                    )}
                    {ot.proveedorNombre && (
                      <div className="text-[10px] text-purple-700 font-semibold mt-0.5 flex items-center gap-1 truncate" title={`Proveedor asignado: ${ot.proveedorNombre}`}>
                        <span>🧾</span> {ot.proveedorNombre}
                      </div>
                    )}
                  </td>

                  {/* Trabajo / Servicio */}
                  <td className="px-5 py-4 max-w-[240px]">
                    <div className="font-semibold text-carbon text-xs line-clamp-1 group-hover:text-verde-profundo transition-colors">
                      {ot.titulo}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      {getTipoBadge(ot.tipoNegocio)}
                    </div>
                    {ot.descripcion && (
                      <div className="text-[10px] text-carbon/50 line-clamp-1 mt-0.5">
                        {ot.descripcion}
                      </div>
                    )}
                  </td>

                  {/* Fechas */}
                  <td className="px-5 py-4 whitespace-nowrap text-[11px] font-mono">
                    <div className="text-carbon/80">
                      📅 {ot.fechaProgramada || ot.fechaInicio || "Por definir"}
                    </div>
                    {ot.fechaConclusion ? (
                      <div className="text-emerald-700 font-semibold text-[10px] mt-0.5">
                        ✓ Entregado {new Date(ot.fechaConclusion).toLocaleDateString()}
                      </div>
                    ) : (
                      <div className="text-carbon/40 italic text-[10px] mt-0.5">
                        En ejecución
                      </div>
                    )}
                  </td>

                  {/* Asesor */}
                  <td className="px-5 py-4 whitespace-nowrap text-xs">
                    <div className="flex items-center gap-1.5 text-carbon font-medium">
                      <span className="text-xs">👤</span>
                      <span className="truncate max-w-[130px]">{ot.asesorEjecutorNombre || "Sin asignar"}</span>
                    </div>
                  </td>

                  {/* Estatus */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {alActualizarEstatus ? (
                      <select
                        value={ot.estatus}
                        disabled={actualizandoId === ot.id}
                        onChange={(e) => handleCambiarEstado(ot, e.target.value as any)}
                        className="rounded-lg border border-carbon/20 px-2 py-1 text-xs font-semibold text-carbon bg-white focus:border-sauce outline-none cursor-pointer shadow-2xs"
                      >
                        <option value="pendiente">⏳ Pendiente</option>
                        <option value="en_proceso">⚙️ En Proceso</option>
                        <option value="completada">✓ Completada</option>
                        <option value="cancelada">✕ Cancelada</option>
                      </select>
                    ) : (
                      getEstatusBadge(ot.estatus)
                    )}
                  </td>

                  {/* Cobranza & Saldo */}
                  <td className="px-5 py-4 whitespace-nowrap text-right font-mono">
                    {(ot.totalCotizado || 0) > 0 ? (
                      <div className="space-y-1">
                        <div className="font-bold text-verde-profundo text-xs">
                          {formatMoneda(ot.totalCotizado || 0)}
                        </div>
                        <div className="text-[10.5px] text-carbon/60">
                          Cobrado: <span className="text-emerald-700 font-semibold">{formatMoneda(ot.totalPagado || 0)}</span>
                        </div>
                        {(ot.saldoRestante || 0) > 0 ? (
                          <div className="text-[10px] font-bold text-amber-700">
                            Resta: {formatMoneda(ot.saldoRestante || 0)}
                          </div>
                        ) : (
                          <div className="text-[10px] font-bold text-emerald-700">
                            ✓ Liquidado
                          </div>
                        )}
                        <div className="w-20 ml-auto h-1.5 rounded-full bg-carbon/10 overflow-hidden mt-1">
                          <div
                            className={`h-full rounded-full transition-all ${
                              porcentajeCobrado >= 100 ? "bg-emerald-600" : "bg-amber-500"
                            }`}
                            style={{ width: `${porcentajeCobrado}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-carbon/40 italic text-xs">—</span>
                    )}
                  </td>

                  {/* Acción a la derecha */}
                  <td className="px-5 py-4 whitespace-nowrap text-right">
                    <Link
                      href={`/ordenes-trabajo/${ot.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sauce/30 bg-sauce/10 hover:bg-sauce hover:text-white px-3 py-1.5 text-xs font-bold text-sauce transition shadow-2xs group-hover:border-sauce/50"
                      title="Ver y editar todos los detalles de la orden"
                    >
                      <span>Ver y Editar</span>
                      <span className="transition-transform group-hover:translate-x-0.5">→</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Vista de Tarjetas para Móviles */}
      <div className="divide-y divide-carbon/10 md:hidden">
        {ordenes.map((ot) => (
          <div key={ot.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-sauce bg-sauce/10 border border-sauce/20 px-2 py-0.5 rounded">
                    {ot.folio}
                  </span>
                  {getEstatusBadge(ot.estatus)}
                </div>
                <h3 className="font-titular text-sm font-bold text-carbon mt-1.5">
                  {ot.titulo}
                </h3>
              </div>
              <Link
                href={`/ordenes-trabajo/${ot.id}`}
                className="shrink-0 rounded-lg bg-sauce text-white px-3 py-1.5 text-xs font-bold shadow-2xs"
              >
                Ver / Editar
              </Link>
            </div>

            <div className="text-xs text-carbon/80 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-carbon/5">
              <div className="flex justify-between">
                <span className="text-carbon/50">Cliente:</span>
                <span className="font-semibold text-carbon">{ot.clienteNombre}</span>
              </div>
              {ot.clienteTelefono && (
                <div className="flex justify-between">
                  <span className="text-carbon/50">Teléfono:</span>
                  <span className="font-mono">{ot.clienteTelefono}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-carbon/50">Línea:</span>
                <span>{getTipoBadge(ot.tipoNegocio)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-carbon/50">Asesor:</span>
                <span className="font-medium">👤 {ot.asesorEjecutorNombre}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-carbon/50">Programada:</span>
                <span className="font-mono">{ot.fechaProgramada || "Sin fecha"}</span>
              </div>
              {(ot.totalCotizado || 0) > 0 && (
                <div className="flex justify-between pt-1 border-t border-carbon/5 font-mono">
                  <span className="text-carbon/50">Total / Saldo:</span>
                  <span>
                    <strong>{formatMoneda(ot.totalCotizado || 0)}</strong>
                    {ot.saldoRestante ? (
                      <span className="text-amber-700 ml-1.5 font-bold">(Resta {formatMoneda(ot.saldoRestante)})</span>
                    ) : (
                      <span className="text-emerald-700 ml-1.5 font-bold">✓ Pagado</span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
