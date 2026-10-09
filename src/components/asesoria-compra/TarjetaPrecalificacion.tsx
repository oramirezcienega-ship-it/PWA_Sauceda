"use client";

import { useRef, useState } from "react";
import {
  eliminarEvidencia,
  guardarPrecalificacion,
  prepararSubidaEvidencia,
  registrarEvidencia,
  type PrecalificacionOT,
} from "@/app/actions/asesoria-compra";
import {
  DICTAMENES,
  ETIQUETA_DICTAMEN,
  estadoRequisito,
  evaluarRequisitos,
  type Dictamen,
  type RequisitoPrecalificacion,
  type Respuesta,
} from "@/lib/asesoria/precalificacion";
import { ETIQUETA_CREDITO, type TipoCredito } from "@/lib/asesoria/match";
import { formatoFecha } from "@/lib/formato";
import { supabaseNavegador } from "@/lib/supabase/cliente-navegador";

const INPUT =
  "w-full rounded-md border border-carbon/20 bg-white px-2.5 py-1.5 text-sm focus:border-sauce focus:outline-none";

const ESTILO_DICTAMEN: Record<Dictamen, string> = {
  apto: "bg-emerald-50 text-emerald-900 border-emerald-200",
  apto_condiciones: "bg-amber-50 text-amber-900 border-amber-200",
  no_apto: "bg-rojo/10 text-rojo border-rojo/20",
};

/**
 * Precalificación del comprador: requisitos de su tipo de crédito, evidencia y
 * dictamen. Es el filtro para iniciar la búsqueda.
 */
export function TarjetaPrecalificacion({
  ordenTrabajoId,
  tipoCredito,
  datos,
  soloLectura = false,
  onGuardado,
}: {
  ordenTrabajoId: string;
  tipoCredito: TipoCredito | null;
  datos: PrecalificacionOT;
  soloLectura?: boolean;
  onGuardado: () => void | Promise<void>;
}) {
  const [respuestas, setRespuestas] = useState<Record<string, Respuesta>>({ ...datos.respuestas });
  const [dictamen, setDictamen] = useState<Dictamen | null>(datos.dictamen);
  const [nota, setNota] = useState(datos.nota ?? "");
  const [retomarEl, setRetomarEl] = useState(datos.retomarEl ?? "");
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const evaluacion = evaluarRequisitos(datos.requisitos, respuestas);
  const sugerido: Dictamen | null =
    evaluacion.total === 0 || evaluacion.pendientes.length > 0 ? null : evaluacion.noCumplen.length === 0 ? "apto" : null;

  async function guardar(dictamenFinal: Dictamen | null = dictamen) {
    setGuardando(true);
    setAviso(null);
    const r = await guardarPrecalificacion(ordenTrabajoId, {
      respuestas,
      dictamen: dictamenFinal,
      nota,
      retomarEl: retomarEl || null,
    });
    setGuardando(false);
    if (!r.ok) {
      setAviso({ tipo: "error", texto: r.mensaje || "No se pudo guardar." });
      return;
    }
    setAviso({ tipo: "ok", texto: "Precalificación guardada." });
    await onGuardado();
  }

  async function subir(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setSubiendo(true);
    setAviso(null);
    try {
      for (const f of Array.from(lista)) {
        const prep = await prepararSubidaEvidencia(ordenTrabajoId, f.name);
        if (!prep.ok || !prep.ruta || !prep.token) throw new Error(prep.error || "No se pudo preparar la subida.");
        const { error } = await supabaseNavegador()
          .storage.from("precalificaciones")
          .uploadToSignedUrl(prep.ruta, prep.token, f, { contentType: f.type || "application/octet-stream" });
        if (error) throw new Error(error.message);
        const r = await registrarEvidencia(ordenTrabajoId, prep.ruta, f.name);
        if (!r.ok) throw new Error(r.mensaje || "No se pudo registrar.");
      }
      await onGuardado();
    } catch (e: any) {
      setAviso({ tipo: "error", texto: e?.message || "No se pudo subir la evidencia." });
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  }

  async function quitar(ruta: string) {
    const r = await eliminarEvidencia(ordenTrabajoId, ruta);
    if (!r.ok) setAviso({ tipo: "error", texto: r.mensaje || "No se pudo quitar." });
    else await onGuardado();
  }

  return (
    <section className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-violet-900">📋 Precalificación: filtro para buscar casa</p>
          <p className="text-[11px] text-carbon/50">
            {tipoCredito ? `Requisitos para crédito ${ETIQUETA_CREDITO[tipoCredito]}` : "Define el tipo de crédito en la ficha para ver sus requisitos."}
            {evaluacion.total > 0 && ` · ${evaluacion.cumplen} de ${evaluacion.total} cumplen`}
          </p>
        </div>
        {datos.dictamen && (
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ESTILO_DICTAMEN[datos.dictamen]}`}>
            {ETIQUETA_DICTAMEN[datos.dictamen]}
            {datos.dictamenEn && <span className="font-normal opacity-70"> · {formatoFecha(datos.dictamenEn)}</span>}
          </span>
        )}
      </div>

      {datos.dictamen === "no_apto" && (
        <div className="mb-3 rounded-md border border-rojo/20 bg-rojo/5 px-3 py-2 text-xs text-carbon/80">
          <p className="font-semibold text-rojo">⏸️ Orden en pausa</p>
          {datos.nota && <p>Motivo: {datos.nota}</p>}
          {datos.retomarEl && <p>Retomar el {formatoFecha(`${datos.retomarEl}T12:00:00`)} (llamada agendada al asesor).</p>}
          {!soloLectura && (
            <button
              type="button"
              disabled={guardando}
              onClick={() => {
                setDictamen(null);
                void guardar(null);
              }}
              className="mt-2 rounded-md border border-carbon/20 bg-white px-2.5 py-1 text-xs font-semibold text-carbon/80 hover:border-sauce disabled:opacity-50"
            >
              Reabrir precalificación
            </button>
          )}
        </div>
      )}

      {/* Requisitos */}
      {datos.requisitos.length > 0 && (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {datos.requisitos.map((r) => (
            <FilaRequisito
              key={r.id}
              requisito={r}
              valor={respuestas[r.clave]}
              soloLectura={soloLectura}
              onCambio={(v) => setRespuestas((x) => ({ ...x, [r.clave]: v }))}
            />
          ))}
        </div>
      )}

      {/* Evidencias */}
      <div className="mt-4">
        <p className="mb-1 text-[10px] font-bold uppercase text-carbon/50">Evidencia de la precalificación</p>
        {datos.evidencias.length === 0 ? (
          <p className="text-xs text-carbon/50">Sin evidencia. Sube la precalificación (PDF o captura), reporte de buró, etc.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {datos.evidencias.map((e) => (
              <li key={e.ruta} className="flex items-center gap-1.5 rounded-md border border-carbon/10 bg-carbon/[0.02] px-2 py-1 text-xs">
                <span>{/\.pdf$/i.test(e.ruta) ? "📄" : "🖼️"}</span>
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer" className="max-w-[180px] truncate text-sauce hover:underline">
                    {e.nombre}
                  </a>
                ) : (
                  <span className="max-w-[180px] truncate">{e.nombre}</span>
                )}
                {!soloLectura && (
                  <button type="button" onClick={() => void quitar(e.ruta)} className="text-carbon/40 hover:text-rojo" aria-label={`Quitar ${e.nombre}`}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!soloLectura && (
          <>
            <input
              ref={archivo}
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={(e) => void subir(e.target.files)}
            />
            <button
              type="button"
              disabled={subiendo}
              onClick={() => archivo.current?.click()}
              className="mt-2 rounded-md border border-dashed border-violet-300 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50 disabled:opacity-50"
            >
              {subiendo ? "Subiendo…" : "📎 Subir evidencia"}
            </button>
          </>
        )}
      </div>

      {/* Dictamen */}
      {!soloLectura && datos.dictamen !== "no_apto" && (
        <div className="mt-4 space-y-2 border-t border-carbon/5 pt-3">
          <p className="text-[10px] font-bold uppercase text-carbon/50">Dictamen</p>
          <div className="flex flex-wrap gap-2">
            {DICTAMENES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDictamen(dictamen === d ? null : d)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                  dictamen === d ? ESTILO_DICTAMEN[d] : "border-carbon/15 text-carbon/60 hover:border-sauce"
                }`}
              >
                {ETIQUETA_DICTAMEN[d]}
                {sugerido === d && dictamen !== d && <span className="ml-1 font-normal opacity-60">(sugerido)</span>}
              </button>
            ))}
          </div>
          {(dictamen === "apto_condiciones" || dictamen === "no_apto") && (
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={dictamen === "no_apto" ? "Motivo (p. ej. le faltan puntos Infonavit)" : "Condición (p. ej. juntar $80,000 de enganche)"}
              className={INPUT}
            />
          )}
          {dictamen === "no_apto" && (
            <label className="flex flex-wrap items-center gap-2 text-xs text-carbon/70">
              Retomar el
              <input type="date" value={retomarEl} onChange={(e) => setRetomarEl(e.target.value)} className="rounded-md border border-carbon/20 px-2 py-1 text-xs" />
              <span className="text-carbon/40">(se agenda una llamada al asesor)</span>
            </label>
          )}
        </div>
      )}

      {aviso && (
        <p className={`mt-3 rounded-md px-3 py-2 text-xs ${aviso.tipo === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-rojo/10 text-rojo"}`}>
          {aviso.texto}
        </p>
      )}

      {!soloLectura && datos.dictamen !== "no_apto" && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={guardando}
            onClick={() => void guardar()}
            className="rounded-md bg-sauce px-3 py-1.5 text-xs font-semibold text-crema hover:bg-verde-profundo disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar precalificación"}
          </button>
        </div>
      )}
    </section>
  );
}

function FilaRequisito({
  requisito: r,
  valor,
  soloLectura,
  onCambio,
}: {
  requisito: RequisitoPrecalificacion;
  valor: Respuesta | undefined;
  soloLectura: boolean;
  onCambio: (v: Respuesta) => void;
}) {
  const estado = estadoRequisito(r, valor);
  const icono = estado === "cumple" ? "✅" : estado === "no_cumple" ? "❌" : "⬜";
  return (
    <div className="rounded-md border border-carbon/10 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-carbon">
          <span className="mr-1">{icono}</span>
          {r.etiqueta}
          {!r.obligatorio && <span className="text-carbon/40"> (opcional)</span>}
        </p>
        {r.tipoRespuesta === "si_no" ? (
          <div className="flex shrink-0 overflow-hidden rounded-md border border-carbon/15 text-[11px]">
            {[
              { v: true, t: "Sí" },
              { v: false, t: "No" },
            ].map((o) => (
              <button
                key={o.t}
                type="button"
                disabled={soloLectura}
                onClick={() => onCambio(valor === o.v ? null : o.v)}
                className={`px-2.5 py-0.5 ${
                  valor === o.v ? (o.v ? "bg-emerald-600 text-white" : "bg-rojo text-white") : "bg-white text-carbon/60"
                }`}
              >
                {o.t}
              </button>
            ))}
          </div>
        ) : (
          <input
            type={r.tipoRespuesta === "numero" ? "number" : "text"}
            value={valor === null || valor === undefined ? "" : String(valor)}
            disabled={soloLectura}
            onChange={(e) =>
              onCambio(e.target.value === "" ? null : r.tipoRespuesta === "numero" ? Number(e.target.value) : e.target.value)
            }
            className="w-28 shrink-0 rounded-md border border-carbon/20 px-2 py-0.5 text-right text-xs focus:border-sauce focus:outline-none"
          />
        )}
      </div>
      {(r.ayuda || r.minimo !== null) && (
        <p className="mt-0.5 text-[10px] text-carbon/45">
          {r.minimo !== null && `Mínimo: ${r.minimo.toLocaleString("es-MX")}. `}
          {r.ayuda}
        </p>
      )}
    </div>
  );
}
