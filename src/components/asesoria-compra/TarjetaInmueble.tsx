"use client";

import { formatoPesos } from "@/lib/formato";
import { ETIQUETA_CREDITO, type TipoCredito } from "@/lib/asesoria/match";
import { ETIQUETA_ESTATUS_INMUEBLE, ETIQUETA_ORIGEN, type Inmueble } from "@/lib/asesoria/inmuebles";

const COLOR_ESTATUS: Record<string, string> = {
  por_validar: "bg-amber-50 text-amber-900 border-amber-300",
  disponible: "bg-emerald-50 text-emerald-900 border-emerald-300",
  apartado: "bg-sky-50 text-sky-900 border-sky-300",
  vendido: "bg-verde-profundo text-crema border-verde-profundo",
  descartado: "bg-slate-100 text-slate-600 border-slate-300",
};

const COLOR_ORIGEN: Record<string, string> = {
  propio: "bg-violet-50 text-violet-900 border-violet-300",
  aliado: "bg-orange-50 text-orange-900 border-orange-300",
  portal: "bg-slate-50 text-slate-700 border-slate-300",
};

/** Tarjeta interna de un inmueble (SAUCEDA ve todo, incluida la dirección y el origen). */
export function TarjetaInmueble({ inmueble: i, children }: { inmueble: Inmueble; children?: React.ReactNode }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-carbon/10 bg-white shadow-sm">
      <div className="relative aspect-[4/3] bg-carbon/5">
        {i.fotosUrl[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={i.fotosUrl[0]} alt={i.folio} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-3xl text-carbon/20">🏠</span>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">{i.folio}</span>
        <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">📷 {i.fotos.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-base font-bold text-verde-profundo">{formatoPesos(i.precio)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${COLOR_ESTATUS[i.estatus] ?? ""}`}>
            {ETIQUETA_ESTATUS_INMUEBLE[i.estatus]}
          </span>
        </div>
        <p className="font-semibold text-carbon">{i.fraccionamiento || i.zona || i.colonia || "Sin zona"}</p>
        <p className="text-xs text-carbon/60">
          {[
            i.recamaras != null ? `${i.recamaras} rec.` : null,
            i.banos != null ? `${i.banos} baños` : null,
            i.metrosConstruccion != null ? `${i.metrosConstruccion} m² const.` : null,
            i.metrosTerreno != null ? `${i.metrosTerreno} m² terr.` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Sin medidas"}
        </p>
        <div className="flex flex-wrap gap-1">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${COLOR_ORIGEN[i.origen]}`}>
            {ETIQUETA_ORIGEN[i.origen]}
            {i.aliadoNombre ? ` · ${i.aliadoNombre}` : ""}
          </span>
          {i.aceptaCredito.map((c) => (
            <span key={c} className="rounded-full border border-carbon/15 px-2 py-0.5 text-[10px] text-carbon/70">
              {ETIQUETA_CREDITO[c as TipoCredito] ?? c}
            </span>
          ))}
          {i.tieneLitigios && <span className="rounded-full border border-rojo/30 bg-rojo/10 px-2 py-0.5 text-[10px] text-rojo">Litigios</span>}
          {i.tieneAdeudos && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-900">Adeudos</span>}
          {i.tieneEscritura === false && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-900">Sin escritura</span>}
        </div>
        {i.direccionPrivada && <p className="text-[11px] text-carbon/50">📍 {i.direccionPrivada}</p>}
        {i.urlFuente && (
          <a href={i.urlFuente} target="_blank" rel="noopener noreferrer" className="truncate text-[11px] text-sauce underline">
            Ver publicación original
          </a>
        )}
        {i.expedienteOrigenId && (
          <a href={`/expediente/${i.expedienteOrigenId}`} className="text-[11px] text-sauce underline">
            Expediente vendedor {i.expedienteOrigenId}
          </a>
        )}
        {children && <div className="mt-auto pt-2">{children}</div>}
      </div>
    </article>
  );
}
