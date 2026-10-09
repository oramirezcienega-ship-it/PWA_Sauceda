"use client";

import { useCallback, useEffect, useState } from "react";
import { obtenerOrdenAsesoria, cambiarEtapaOrdenAsesoria, type OrdenAsesoria } from "@/app/actions/asesoria-compra";
import { TarjetaPerfilBusqueda } from "./TarjetaPerfilBusqueda";
import { TarjetaPrecalificacion } from "./TarjetaPrecalificacion";
import { PanelBusquedaInternet } from "./PanelBusquedaInternet";
import { BandejaOpciones } from "./BandejaOpciones";
import { PanelBusquedaAliados } from "@/components/aliados/PanelBusquedaAliados";
import { WidgetBpmTareas } from "@/components/WidgetBpmTareas";

/**
 * Panel de la orden de trabajo de asesoría de compra: sus etapas propias, su
 * ficha (precalificación y perfil de búsqueda), las tareas de su flujo, la
 * búsqueda con aliados y la bandeja de opciones de casas.
 */
export function PanelAsesoriaCompraOT({
  ordenTrabajoId,
  soloLectura = false,
}: {
  ordenTrabajoId: string;
  soloLectura?: boolean;
}) {
  const [orden, setOrden] = useState<OrdenAsesoria | null>(null);
  const [cargando, setCargando] = useState(true);
  const [moviendo, setMoviendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [versionOpciones, setVersionOpciones] = useState(0);

  const cargar = useCallback(async () => {
    try {
      setOrden(await obtenerOrdenAsesoria(ordenTrabajoId));
    } catch (e: any) {
      setAviso(e?.message || "No se pudo cargar la orden.");
    } finally {
      setCargando(false);
    }
  }, [ordenTrabajoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (cargando) return <p className="text-xs text-carbon/50">Cargando asesoría de compra…</p>;
  if (!orden) return <p className="text-xs text-rojo">{aviso || "No se encontró la ficha de esta orden de trabajo."}</p>;

  const idx = orden.etapas.findIndex((e) => e.clave === orden.etapa);
  const anterior = idx > 0 ? orden.etapas[idx - 1] : null;
  const siguiente = idx >= 0 ? orden.etapas[idx + 1] ?? null : orden.etapas[0] ?? null;
  const enPausa = orden.precalificacion.dictamen === "no_apto";
  const enPrecalificacion = idx <= 0;
  // Búsqueda y aliados solo cuando la precalificación pasó el filtro.
  const busquedaHabilitada = !orden.perfil.yaTieneCasa && !enPausa && orden.pendientes.length === 0;

  async function mover(clave: string) {
    setMoviendo(true);
    const r = await cambiarEtapaOrdenAsesoria(ordenTrabajoId, clave);
    setMoviendo(false);
    if (!r.ok) setAviso(r.mensaje || "No se pudo cambiar la etapa.");
    else setAviso(null);
    await cargar();
    setVersion((v) => v + 1); // refresca tareas y bandeja (p. ej. al entrar a Búsqueda)
  }

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-violet-900">🔑 Asesoría de compra · {orden.folio}</p>
          {enPausa && <span className="rounded-full bg-rojo/10 px-2 py-0.5 text-[10px] font-bold uppercase text-rojo">⏸️ En pausa</span>}
        </div>
        <ol className="flex flex-wrap gap-x-1 gap-y-2">
          {orden.etapas.map((e, i) => {
            const estado = idx === -1 ? "pendiente" : i < idx ? "hecho" : i === idx ? "actual" : "pendiente";
            return (
              <li key={e.clave} className="flex items-center gap-1 text-[11px]">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    estado === "hecho" ? "bg-sauce text-crema" : estado === "actual" ? "bg-cielo text-white" : "bg-carbon/10 text-carbon/40"
                  }`}
                >
                  {estado === "hecho" ? "✓" : i + 1}
                </span>
                <span className={estado === "actual" ? "font-semibold text-carbon" : "text-carbon/50"}>{e.nombre}</span>
                {i < orden.etapas.length - 1 && <span className="mx-1 text-carbon/20">›</span>}
              </li>
            );
          })}
        </ol>
        {aviso && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{aviso}</p>}
        {!enPausa && (enPrecalificacion || orden.pendientes.length > 0) && (
          <div
            className={`mt-3 rounded-md px-3 py-2 text-xs ${
              orden.pendientes.length === 0 ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
            }`}
          >
            {orden.pendientes.length === 0 ? (
              <p>✅ Precalificación completa: puede pasar a {siguiente?.nombre ?? "la siguiente etapa"}.</p>
            ) : (
              <>
                <p className="font-semibold">
                  {enPrecalificacion
                    ? `Para pasar a ${siguiente?.nombre ?? "la siguiente etapa"} falta:`
                    : "Para buscar casas (inventario y aliados) falta:"}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {orden.pendientes.map((x) => (
                    <li key={x.clave}>{x.texto}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {!soloLectura && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!anterior || moviendo}
              onClick={() => anterior && mover(anterior.clave)}
              className="flex-1 rounded-md border border-carbon/15 bg-white px-3 py-2 text-xs text-carbon/70 enabled:hover:border-sauce disabled:opacity-30"
            >
              ← {anterior?.nombre ?? "Primera"}
            </button>
            <button
              type="button"
              disabled={!siguiente || moviendo || enPausa || (enPrecalificacion && orden.pendientes.length > 0)}
              onClick={() => siguiente && mover(siguiente.clave)}
              className="flex-1 rounded-md bg-sauce px-3 py-2 text-xs font-semibold text-crema enabled:hover:bg-verde-profundo disabled:opacity-30"
            >
              {siguiente?.nombre ?? "Última"} →
            </button>
          </div>
        )}
      </section>

      <div className="space-y-3">
        <TarjetaPerfilBusqueda key={`ficha-${version}`} ordenTrabajoId={ordenTrabajoId} perfilInicial={orden.perfil} onGuardado={cargar} />
        <TarjetaPrecalificacion
          key={`precal-${orden.perfil.tipoCredito ?? "ninguno"}-${version}`}
          ordenTrabajoId={ordenTrabajoId}
          tipoCredito={orden.perfil.tipoCredito}
          datos={orden.precalificacion}
          soloLectura={soloLectura}
          onGuardado={cargar}
        />
      </div>

      {orden.expedienteId && (
        <WidgetBpmTareas
          key={`tareas-${version}`}
          expedienteId={orden.expedienteId}
          ordenTrabajoId={ordenTrabajoId}
          tipoNegocio="asesoria_compra"
          inicialContraido={false}
        />
      )}

      {busquedaHabilitada && (
        <>
          <PanelBusquedaAliados ordenTrabajoId={ordenTrabajoId} />
          <PanelBusquedaInternet ordenTrabajoId={ordenTrabajoId} onAgregada={() => setVersionOpciones((v) => v + 1)} />
          <BandejaOpciones key={`opciones-${version}-${versionOpciones}`} ordenTrabajoId={ordenTrabajoId} />
        </>
      )}
    </div>
  );
}
