"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { agendarVisitaOpcion, marcarOpcionVista, responderOpcion } from "@/app/actions/asesoria-compra";
import { formatoPesos } from "@/lib/formato";
import { ETIQUETA_MOTIVO_DESCARTE, MOTIVOS_DESCARTE, type MotivoDescarte } from "@/lib/asesoria/inmuebles";
import type { OpcionCliente } from "@/lib/asesoria/portal";

/** Sección "Tus opciones" del portal del cliente comprador. */
export function TusOpciones({ token, opciones }: { token: string; opciones: OpcionCliente[] }) {
  return (
    <section>
      <h2 className="mb-1 font-titular text-xl text-verde-profundo">Tus opciones</h2>
      <p className="mb-3 text-sm text-carbon/60">
        Casas seleccionadas por tu asesor según tu perfil. La dirección exacta te la compartimos al agendar la visita.
      </p>
      {opciones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-carbon/15 bg-white p-6 text-center text-sm text-carbon/50">
          Estamos buscando casas para ti. Te avisaremos por WhatsApp en cuanto tengamos opciones.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {opciones.map((o) => (
            <TarjetaOpcion key={o.id} token={token} opcion={o} />
          ))}
        </div>
      )}
    </section>
  );
}

function TarjetaOpcion({ token, opcion: o }: { token: string; opcion: OpcionCliente }) {
  const router = useRouter();
  const [foto, setFoto] = useState(0);
  const [panel, setPanel] = useState<null | "descartar" | "visita">(null);
  const [motivo, setMotivo] = useState<MotivoDescarte | null>(null);
  const [comentario, setComentario] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("11:00");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState(o.estatus !== "publicada");

  function marcarVista() {
    if (vista) return;
    setVista(true);
    void marcarOpcionVista(token, o.id);
  }

  async function ejecutar(fn: () => Promise<{ ok: boolean; mensaje?: string }>) {
    setEnviando(true);
    setError(null);
    const r = await fn();
    setEnviando(false);
    if (!r.ok) {
      setError(r.mensaje || "No se pudo guardar.");
      return;
    }
    setPanel(null);
    router.refresh();
  }

  return (
    <article className="overflow-hidden rounded-xl border border-carbon/10 bg-white shadow-sm" onClick={marcarVista}>
      <div className="relative aspect-[4/3] bg-carbon/5">
        {o.fotos[foto] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.fotos[foto]} alt={`Foto ${foto + 1}`} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-4xl text-carbon/20">🏠</span>
        )}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            o.estatus === "publicada" ? "bg-dorado text-carbon" : "bg-black/60 text-white"
          }`}
        >
          {o.etiquetaEstatus}
        </span>
        {o.fotos.length > 1 && (
          <>
            <button type="button" aria-label="Foto anterior" onClick={() => setFoto((f) => (f - 1 + o.fotos.length) % o.fotos.length)} className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-2 py-1 text-white">‹</button>
            <button type="button" aria-label="Foto siguiente" onClick={() => setFoto((f) => (f + 1) % o.fotos.length)} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-2 py-1 text-white">›</button>
            <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">{foto + 1}/{o.fotos.length}</span>
          </>
        )}
      </div>

      <div className="space-y-2 p-4">
        <p className="font-mono text-xl font-bold text-verde-profundo">{formatoPesos(o.precio)}</p>
        {o.zona && <p className="font-semibold text-carbon">📍 {o.zona}</p>}
        <p className="text-sm text-carbon/70">
          {[
            o.recamaras != null ? `${o.recamaras} recámaras` : null,
            o.banos != null ? `${o.banos} baños` : null,
            o.metrosConstruccion != null ? `${o.metrosConstruccion} m² construcción` : null,
            o.metrosTerreno != null ? `${o.metrosTerreno} m² terreno` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {o.descripcion && <p className="text-sm text-carbon/80">{o.descripcion}</p>}

        {o.visita && (
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            🗓️ Visita: <strong>{o.visita.fecha}</strong> a las <strong>{o.visita.hora}</strong>
            {o.direccion && (
              <span className="block">
                📍 {o.direccion}{" "}
                <a
                  className="underline"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.direccion)}`}
                >
                  Ver mapa
                </a>
              </span>
            )}
            <span className="block text-xs">Tu asesor te confirmará la cita.</span>
          </div>
        )}

        {o.puedeResponder && panel === null && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              disabled={enviando || o.estatus === "me_interesa"}
              onClick={() => ejecutar(() => responderOpcion(token, o.id, { accion: "me_interesa" }))}
              className="rounded-md bg-sauce px-2 py-2.5 text-xs font-semibold text-crema disabled:opacity-60"
            >
              {o.estatus === "me_interesa" ? "✓ Te interesa" : "👍 Me interesa"}
            </button>
            <button type="button" onClick={() => setPanel("visita")} className="rounded-md border border-sauce px-2 py-2.5 text-xs font-semibold text-sauce">
              🗓️ Agendar visita
            </button>
            <button type="button" onClick={() => setPanel("descartar")} className="rounded-md border border-carbon/20 px-2 py-2.5 text-xs text-carbon/70">
              👎 Descartar
            </button>
          </div>
        )}

        {panel === "descartar" && (
          <div className="space-y-2 rounded-md border border-carbon/10 bg-carbon/5 p-3">
            <p className="text-xs font-semibold text-carbon/70">¿Por qué no te convence?</p>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_DESCARTE.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivo(m)}
                  className={`rounded-full border px-3 py-1.5 text-xs ${motivo === m ? "border-sauce bg-sauce text-crema" : "border-carbon/20 bg-white text-carbon/70"}`}
                >
                  {ETIQUETA_MOTIVO_DESCARTE[m]}
                </button>
              ))}
            </div>
            <textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Comentario (opcional)" className="w-full rounded-md border border-carbon/20 px-2.5 py-2 text-sm" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setPanel(null)} className="flex-1 rounded-md border border-carbon/15 px-3 py-2 text-xs">Cancelar</button>
              <button
                type="button"
                disabled={!motivo || enviando}
                onClick={() => ejecutar(() => responderOpcion(token, o.id, { accion: "descartar", motivo: motivo!, comentario }))}
                className="flex-1 rounded-md bg-carbon px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Descartar
              </button>
            </div>
          </div>
        )}

        {panel === "visita" && (
          <div className="space-y-2 rounded-md border border-sauce/30 bg-sauce/5 p-3">
            <p className="text-xs font-semibold text-carbon/70">¿Cuándo te gustaría visitarla?</p>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-md border border-carbon/20 px-2 py-2 text-sm" />
              <input type="time" min="08:00" max="19:00" step={1800} value={hora} onChange={(e) => setHora(e.target.value)} className="rounded-md border border-carbon/20 px-2 py-2 text-sm" />
            </div>
            <textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Comentario para tu asesor (opcional)" className="w-full rounded-md border border-carbon/20 px-2.5 py-2 text-sm" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setPanel(null)} className="flex-1 rounded-md border border-carbon/15 px-3 py-2 text-xs">Cancelar</button>
              <button
                type="button"
                disabled={!fecha || !hora || enviando}
                onClick={() => ejecutar(() => agendarVisitaOpcion(token, o.id, fecha, hora, comentario))}
                className="flex-1 rounded-md bg-sauce px-3 py-2 text-xs font-semibold text-crema disabled:opacity-50"
              >
                {enviando ? "Agendando…" : "Agendar visita"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-rojo">{error}</p>}
      </div>
    </article>
  );
}
