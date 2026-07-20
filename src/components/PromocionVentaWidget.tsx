"use client";

import { useState, useEffect, useCallback } from "react";
import { obtenerPromocionExpediente, asegurarPortalClienteAction } from "@/app/actions/expedientes";

interface Props {
  expedienteId: string;
  clienteNombre?: string;
  siteUrl: string;
}

export function PromocionVentaWidget({ expedienteId, clienteNombre, siteUrl }: Props) {
  const [data, setData] = useState<{
    promocion: any | null;
    sessionTokenClient: string | null;
    statusProceso: string | null;
    fechaConfirmacion: string | null;
    fechaFotosAgendadas: string | null;
    litigiosBloqueado: boolean;
  } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      const res = await obtenerPromocionExpediente(expedienteId);
      setData(res);
    } catch (err: any) {
      setError(err.message || "Error al cargar expediente de promoción.");
    } finally {
      setCargando(false);
    }
  }, [expedienteId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function handleGenerarPortal() {
    setGenerando(true);
    setError(null);
    try {
      await asegurarPortalClienteAction(expedienteId);
      await cargar();
    } catch (err: any) {
      setError(err.message || "Error al generar portal de cliente.");
    } finally {
      setGenerando(false);
    }
  }

  const token = data?.sessionTokenClient;
  const urlPortal = token ? `${siteUrl}/expediente-cliente/${expedienteId}?token=${token}` : null;
  const promo = data?.promocion;

  function copiarEnlace() {
    if (!urlPortal) return;
    navigator.clipboard.writeText(urlPortal);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  function formatMoney(n?: number | null) {
    if (!n) return "—";
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
  }

  return (
    <div className="rounded-2xl border border-sauce/20 bg-white p-4 sm:p-6 shadow-sm space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-carbon/10 pb-4">
        <div>
          <h3 className="font-titular text-lg font-bold text-verde-profundo flex items-center gap-2">
            <span>🏠</span> Expediente de Promoción Venta
          </h3>
          <p className="text-xs text-carbon/60 mt-0.5">
            Recopilación de información de la propiedad y estado del Portal del Cliente
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {data?.statusProceso && (
            <span className="rounded-full bg-sauce/10 border border-sauce/20 px-3 py-1 text-xs font-bold text-sauce">
              Estatus: {data.statusProceso.replace(/_/g, " ")}
            </span>
          )}
          {data?.litigiosBloqueado && (
            <span className="rounded-full bg-red-100 border border-red-200 px-3 py-1 text-xs font-bold text-red-700">
              ⚠️ Litigio Bloqueado
            </span>
          )}
        </div>
      </div>

      {/* Alertas / Errores */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Bloque del Portal del Cliente (Enlace) */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-verde-profundo flex items-center gap-1.5">
            <span>🔑</span> Portal Público del Cliente
          </span>
          {data?.fechaConfirmacion && (
            <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              ✓ Confirmado por el cliente el {new Date(data.fechaConfirmacion).toLocaleDateString("es-MX")}
            </span>
          )}
        </div>

        {urlPortal ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2 font-mono text-xs text-carbon select-all overflow-x-auto">
              <span className="truncate flex-1">{urlPortal}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={copiarEnlace}
                className="inline-flex items-center gap-1.5 bg-sauce hover:bg-sauce/90 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shadow-sm"
              >
                {copiado ? "✓ ¡Copiado!" : "📋 Copiar Enlace"}
              </button>
              <a
                href={urlPortal}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-white border border-slate-300 hover:border-sauce hover:text-sauce text-carbon/80 text-xs font-bold px-3 py-1.5 rounded-lg transition"
              >
                🔗 Abrir Portal (Vista Cliente) ↗
              </a>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-carbon/60">
              Aún no se ha generado el enlace del portal para este cliente.
            </p>
            <button
              type="button"
              disabled={generando}
              onClick={handleGenerarPortal}
              className="inline-flex items-center gap-1.5 bg-sauce hover:bg-sauce/90 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition shadow-sm disabled:opacity-50"
            >
              {generando ? "Generando..." : "✨ Generar y Activar Portal"}
            </button>
          </div>
        )}
      </div>

      {/* Contenido del Formulario / Datos de la Propiedad */}
      {cargando ? (
        <div className="py-8 text-center text-xs text-carbon/40 animate-pulse">
          Cargando datos del expediente de promoción...
        </div>
      ) : !promo ? (
        <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <p className="text-xs text-carbon/60 mb-2">
            Aún no hay respuestas recopiladas en el expediente de la casa.
          </p>
          <p className="text-[11px] text-carbon/40">
            Comparte el enlace del portal con el cliente o se irán completando al pasar a etapa Valuación.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Columna 1: Características de la Propiedad y Ubicación */}
          <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-verde-profundo text-xs uppercase tracking-wider border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
              <span>🏡</span> Ubicación y Características
            </h4>
            
            <div className="space-y-1.5 text-carbon/80">
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Calle y Número:</span>
                <span className="font-medium">{promo.calle ? `${promo.calle} ${promo.numero_exterior ?? ""}` : "—"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Colonia:</span>
                <span className="font-medium">{promo.colonia || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Ciudad / Estado:</span>
                <span className="font-medium">{promo.ciudad ? `${promo.ciudad}, ${promo.estado ?? ""}` : "—"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Construcción:</span>
                <span className="font-semibold">{promo.metros_construccion ? `${promo.metros_construccion} m²` : "—"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Terreno:</span>
                <span className="font-semibold">{promo.metros_terreno ? `${promo.metros_terreno} m²` : "—"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Recámaras / Baños:</span>
                <span className="font-medium">
                  {promo.num_recamaras ?? "—"} rec. / {promo.num_banos ?? "—"} baños
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Año construcción:</span>
                <span className="font-medium">{promo.anio_construccion || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-carbon/50">Estado conservación:</span>
                <span className="font-medium">{promo.estado_conservacion || "—"}</span>
              </div>
            </div>
          </div>

          {/* Columna 2: Situación Legal, Crédito y Disponibilidad */}
          <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 space-y-3">
            <h4 className="font-bold text-verde-profundo text-xs uppercase tracking-wider border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
              <span>📜</span> Situación Legal, Crédito y Fotos
            </h4>

            <div className="space-y-1.5 text-carbon/80">
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Titular:</span>
                <span className="font-medium">{promo.nombre_titular || clienteNombre || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Teléfono Titular:</span>
                <span className="font-mono font-medium">{promo.telefono_titular || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Tipo Crédito:</span>
                <span className="font-medium">{promo.tipo_credito || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Folio / Exp. Infonavit:</span>
                <span className="font-mono font-medium">{promo.expediente_infonavit || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Saldo Deuda:</span>
                <span className="font-mono font-semibold text-verde-profundo">{formatMoney(promo.saldo_credito)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Propiedad Ocupada:</span>
                <span className="font-medium">
                  {promo.propiedad_ocupada === true ? `Sí (${promo.nombre_ocupante || 'Sin nombre'})` : promo.propiedad_ocupada === false ? "No (Vacía)" : "—"}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-1">
                <span className="text-carbon/50">Adeudos:</span>
                <span className="font-medium">
                  {promo.tiene_adeudos ? (promo.descripcion_adeudos || "Sí tiene") : "Sin adeudos"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-carbon/50">Horario fotos:</span>
                <span className="font-medium">{promo.horario_fotos || "—"}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
