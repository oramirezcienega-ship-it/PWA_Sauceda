"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  obtenerResumenAsesoriaExpediente,
  iniciarAsesoriaDesdeExpediente,
  type ResumenAsesoriaExpediente,
} from "@/app/actions/asesoria-compra";
import { formatoPesos } from "@/lib/formato";

interface Props {
  expedienteId: string;
  clienteNombre?: string;
  onActualizado?: () => void;
}

export function TarjetaAsesoriaCompraExpediente({
  expedienteId,
  clienteNombre,
  onActualizado,
}: Props) {
  const [resumen, setResumen] = useState<ResumenAsesoriaExpediente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [iniciando, setIniciando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setError(null);
      const data = await obtenerResumenAsesoriaExpediente(expedienteId);
      setResumen(data);
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar el estado de la asesoría.");
    } finally {
      setCargando(false);
    }
  }, [expedienteId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function handleIniciarOrden() {
    try {
      setIniciando(true);
      setError(null);
      const res = await iniciarAsesoriaDesdeExpediente(expedienteId);
      if (!res.ok) {
        setError(res.mensaje || "No se pudo iniciar la orden.");
        return;
      }
      await cargar();
      onActualizado?.();
    } catch (e: any) {
      setError(e?.message || "Error al inicializar la orden.");
    } finally {
      setIniciando(false);
    }
  }

  if (cargando) {
    return (
      <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-xs animate-pulse">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-4 w-4 bg-violet-200 rounded"></div>
          <div className="h-4 w-36 bg-violet-100 rounded"></div>
        </div>
        <div className="h-3 w-48 bg-carbon/10 rounded"></div>
      </div>
    );
  }

  if (!resumen) return null;

  // CASO A: Ya cuenta con Orden de Trabajo iniciada
  if (resumen.tieneOrden && resumen.ordenTrabajoId) {
    const enPausa = resumen.dictamen === "no_apto";
    const dictamenEstilo =
      resumen.dictamen === "apto"
        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
        : resumen.dictamen === "apto_condiciones"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : resumen.dictamen === "no_apto"
        ? "bg-rojo/10 text-rojo border-rojo/20"
        : "bg-carbon/5 text-carbon/60 border-carbon/10";

    return (
      <div className="rounded-2xl border border-violet-200 bg-white p-4 sm:p-5 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-base text-violet-700">
              🔑
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-titular text-sm font-bold text-violet-950">
                  Asesoría de Compra · {resumen.folio}
                </h3>
                {enPausa && (
                  <span className="rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] font-bold text-rojo">
                    ⏸️ En pausa
                  </span>
                )}
              </div>
              <p className="text-[11px] text-carbon/60 font-medium">
                Operación activa en la Orden de Trabajo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-violet-50 border border-violet-200/60 px-2.5 py-0.5 text-[11px] font-bold text-violet-800">
              Etapa: {resumen.etapaNombre}
            </span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${dictamenEstilo}`}>
              {resumen.dictamenEtiqueta || "Dictamen pendiente"}
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-rojo/10 p-2.5 text-xs text-rojo font-medium">
            ⚠️ {error}
          </div>
        )}

        {/* Resumen del Perfil y Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl bg-violet-50/50 p-2.5 border border-violet-100/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-800/60 block">
              Poder de Compra
            </span>
            <p className="font-mono text-sm font-bold text-verde-profundo mt-0.5">
              {resumen.poderDeCompra ? formatoPesos(resumen.poderDeCompra) : "Por definir"}
            </p>
            {Boolean(resumen.montoCredito && resumen.montoAhorro) && (
              <span className="text-[10px] text-carbon/50 block mt-0.5">
                Crédito: {formatoPesos(resumen.montoCredito!)} + Ahorro: {formatoPesos(resumen.montoAhorro!)}
              </span>
            )}
          </div>

          <div className="rounded-xl bg-violet-50/50 p-2.5 border border-violet-100/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-800/60 block">
              Zonas de Búsqueda
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {resumen.zonas && resumen.zonas.length > 0 ? (
                resumen.zonas.map((z) => (
                  <span
                    key={z}
                    className="inline-block rounded-md bg-white border border-violet-200/60 px-1.5 py-0.5 text-[10px] text-violet-900 font-medium"
                  >
                    📍 {z}
                  </span>
                ))
              ) : (
                <span className="text-carbon/40 italic">Sin zonas confirmadas</span>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-violet-50/50 p-2.5 border border-violet-100/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-800/60 block">
              Oferta y Visitas
            </span>
            <p className="font-semibold text-carbon mt-0.5">
              {resumen.opcionesPublicadas} opción(es) publicada(s)
            </p>
            <span className="text-[10px] text-carbon/50 block mt-0.5">
              {resumen.visitasAgendadas} visita(s) agendada(s)
            </span>
          </div>
        </div>

        {/* Pendientes para pasar a búsqueda */}
        {resumen.pendientes && resumen.pendientes.length > 0 && !enPausa && (
          <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-3 text-xs text-amber-900">
            <p className="font-semibold">⚠️ Pendientes para buscar casas:</p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[11px]">
              {resumen.pendientes.map((p) => (
                <li key={p.clave}>{p.texto}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Link
            href={`/ordenes-trabajo/${resumen.ordenTrabajoId}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-violet-800 shadow-xs"
          >
            <span>Gestionar Asesoría en {resumen.folio}</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    );
  }

  // CASO B: Aún no tiene Orden de Trabajo creada
  const preliminar = resumen.preliminarExpediente;
  const tieneDatosPrevios = Boolean(
    preliminar?.montoCredito || (preliminar?.zonas && preliminar.zonas.length > 0) || preliminar?.tipoCredito,
  );

  return (
    <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/40 p-4 sm:p-5 shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-lg text-violet-700 border border-violet-200">
            🔑
          </span>
          <div>
            <h3 className="font-titular text-sm font-bold text-violet-950">
              Asesoría de Compra y Acompañamiento
            </h3>
            <p className="text-xs text-carbon/60">
              Precalificación de crédito, selección y búsqueda de vivienda para {clienteNombre || "el comprador"}.
            </p>
          </div>
        </div>
      </div>

      {tieneDatosPrevios && (
        <div className="rounded-xl bg-white border border-violet-200/80 p-3 text-xs text-carbon/70 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-900 block">
            Datos recopilados por perfilamiento:
          </span>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {preliminar?.tipoCredito && (
              <span>
                Crédito: <strong className="text-carbon font-semibold">{preliminar.tipoCredito}</strong>
              </span>
            )}
            {preliminar?.montoCredito && (
              <span>
                Monto autorizado:{" "}
                <strong className="text-verde-profundo font-mono font-bold">
                  {formatoPesos(preliminar.montoCredito)}
                </strong>
              </span>
            )}
            {preliminar?.montoAhorro && (
              <span>
                Ahorro: <strong className="text-carbon font-semibold">{formatoPesos(preliminar.montoAhorro)}</strong>
              </span>
            )}
            {preliminar?.zonas && preliminar.zonas.length > 0 && (
              <span>
                Zonas: <strong className="text-carbon font-semibold">{preliminar.zonas.join(", ")}</strong>
              </span>
            )}
          </div>
          <p className="text-[10px] text-carbon/50 pt-0.5">
            ✨ Estos datos se transferirán automáticamente a la ficha de la orden al iniciar.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-rojo/10 p-2.5 text-xs text-rojo font-medium">
          ⚠️ {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-carbon/50">
          Inicia la orden para activar la compuerta de precalificación y cruzar inventario.
        </span>
        <button
          type="button"
          disabled={iniciando}
          onClick={handleIniciarOrden}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-violet-800 disabled:opacity-40 shadow-xs"
        >
          {iniciando ? "Iniciando orden…" : "🚀 Iniciar Orden de Asesoría"}
        </button>
      </div>
    </div>
  );
}
