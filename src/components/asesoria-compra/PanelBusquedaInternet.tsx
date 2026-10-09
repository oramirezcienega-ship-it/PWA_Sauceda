"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  agregarCandidataWeb,
  iniciarBusquedaWeb,
  invitarAnuncianteComoAliado,
  obtenerPanelBusquedaWeb,
  type BusquedaWeb,
  type PanelBusquedaWeb,
} from "@/app/actions/asesoria-compra";
import type { Candidata } from "@/lib/asesoria/busqueda-web";
import { formatoPesos } from "@/lib/formato";

const INPUT =
  "w-full rounded-md border border-carbon/20 bg-white px-2.5 py-1.5 text-sm focus:border-sauce focus:outline-none";

/**
 * Búsqueda de casas en internet para la OT: con IA en portales, leyendo un
 * link o un texto pegado, y accesos directos a cada portal. El asesor elige
 * qué candidatas pasan a Opciones; el link del portal nunca llega al cliente.
 */
export function PanelBusquedaInternet({ ordenTrabajoId, onAgregada }: { ordenTrabajoId: string; onAgregada?: () => void }) {
  const [panel, setPanel] = useState<PanelBusquedaWeb | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [modo, setModo] = useState<"ia" | "link" | "texto">("ia");
  const [url, setUrl] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const sondeo = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cargar = useCallback(async () => {
    try {
      const p = await obtenerPanelBusquedaWeb(ordenTrabajoId);
      setPanel(p);
      return p;
    } catch (e: any) {
      setAviso({ tipo: "error", texto: e?.message || "No se pudo cargar la búsqueda en internet." });
      return null;
    }
  }, [ordenTrabajoId]);

  // Mientras haya una búsqueda en proceso, consultar cada 4 s.
  const programarSondeo = useCallback(() => {
    if (sondeo.current) clearTimeout(sondeo.current);
    sondeo.current = setTimeout(async () => {
      const p = await cargar();
      if (p?.busquedas.some((b) => b.estado === "en_proceso")) programarSondeo();
    }, 4000);
  }, [cargar]);

  useEffect(() => {
    void cargar().then((p) => {
      if (p?.busquedas.some((b) => b.estado === "en_proceso")) programarSondeo();
    });
    return () => {
      if (sondeo.current) clearTimeout(sondeo.current);
    };
  }, [cargar, programarSondeo]);

  async function iniciar() {
    setEnviando(true);
    setAviso(null);
    const r = await iniciarBusquedaWeb(ordenTrabajoId, modo === "ia" ? { tipo: "portales" } : modo === "link" ? { tipo: "link", url } : { tipo: "texto", texto, url });
    setEnviando(false);
    if (!r.ok) {
      setAviso({ tipo: "error", texto: r.mensaje || "No se pudo iniciar." });
      return;
    }
    setSeleccion(r.id ?? null);
    if (modo !== "ia") {
      setUrl("");
      setTexto("");
    }
    await cargar();
    programarSondeo();
  }

  const busqueda: BusquedaWeb | null = panel
    ? panel.busquedas.find((b) => b.id === seleccion) ?? panel.busquedas[0] ?? null
    : null;

  return (
    <section className="rounded-xl border border-sky-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-sky-900">🌐 Buscar en internet</p>
      <p className="mb-3 text-[11px] text-carbon/50">
        Busca publicaciones en portales con el perfil del cliente (sin sus datos personales). Tú eliges cuáles pasan a Opciones.
      </p>

      {panel && (
        <details className="mb-3 rounded-md bg-sky-50/60 px-3 py-2 text-xs text-carbon/70">
          <summary className="cursor-pointer font-semibold text-sky-900">Criterios y accesos directos a portales</summary>
          <pre className="mt-2 whitespace-pre-wrap font-cuerpo text-[11px]">{panel.criterios}</pre>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {panel.enlaces.map((e) => (
              <a
                key={e.nombre}
                href={e.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-sky-200 bg-white px-2.5 py-0.5 text-[11px] text-sky-900 hover:bg-sky-100"
              >
                {e.nombre} ↗
              </a>
            ))}
          </div>
        </details>
      )}

      <div className="mb-2 flex flex-wrap gap-1.5 text-xs">
        {[
          { id: "ia", t: "🤖 Buscar con IA" },
          { id: "link", t: "🔗 Pegar link" },
          { id: "texto", t: "📋 Pegar texto" },
        ].map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setModo(m.id as typeof modo)}
            className={`rounded-md border px-3 py-1 ${modo === m.id ? "border-sky-300 bg-sky-100 font-semibold text-sky-900" : "border-carbon/15 text-carbon/60"}`}
          >
            {m.t}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {modo === "ia" && (
          <p className="text-[11px] text-carbon/55">
            La IA busca en Inmuebles24, Vivanuncios, Lamudi, Propiedades.com y otros portales. Tarda de 1 a 3 minutos; puedes seguir trabajando.
          </p>
        )}
        {(modo === "link" || modo === "texto") && (
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.inmuebles24.com/propiedades/…" className={INPUT} />
        )}
        {modo === "texto" && (
          <textarea
            rows={4}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Copia y pega aquí el texto del anuncio (precio, ubicación, recámaras, contacto…)"
            className={INPUT}
          />
        )}
        <button
          type="button"
          disabled={enviando || busqueda?.estado === "en_proceso"}
          onClick={() => void iniciar()}
          className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {enviando ? "Iniciando…" : modo === "ia" ? "Buscar casas en portales" : modo === "link" ? "Leer publicación" : "Extraer datos"}
        </button>
      </div>

      {aviso && (
        <p className={`mt-3 rounded-md px-3 py-2 text-xs ${aviso.tipo === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-rojo/10 text-rojo"}`}>{aviso.texto}</p>
      )}

      {panel && panel.busquedas.length > 1 && (
        <select
          value={busqueda?.id ?? ""}
          onChange={(e) => setSeleccion(e.target.value)}
          className="mt-3 w-full rounded-md border border-carbon/15 px-2 py-1 text-xs text-carbon/70"
        >
          {panel.busquedas.map((b) => (
            <option key={b.id} value={b.id}>
              {new Date(b.createdAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })} · {b.descripcion}
            </option>
          ))}
        </select>
      )}

      {busqueda && (
        <div className="mt-3">
          {busqueda.estado === "en_proceso" && (
            <p className="animate-pulse rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-900">🔎 Buscando… {busqueda.descripcion}</p>
          )}
          {busqueda.estado === "error" && <p className="rounded-md bg-rojo/10 px-3 py-2 text-xs text-rojo">{busqueda.mensaje || "La búsqueda falló."}</p>}
          {busqueda.estado === "lista" && (
            <>
              {busqueda.mensaje && <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{busqueda.mensaje}</p>}
              {busqueda.candidatas.length > 0 && (
                <p className="mb-2 text-[11px] text-carbon/50">
                  {busqueda.candidatas.length} candidata(s). Revisa cada publicación antes de agregarla: los datos los extrae la IA y pueden tener errores.
                </p>
              )}
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {busqueda.candidatas.map((c) => (
                  <TarjetaCandidata
                    key={c.url}
                    busquedaId={busqueda.id}
                    candidata={c}
                    onCambio={async (mensaje) => {
                      setAviso(mensaje);
                      await cargar();
                      if (mensaje?.tipo === "ok") onAgregada?.();
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function TarjetaCandidata({
  busquedaId,
  candidata: c,
  onCambio,
}: {
  busquedaId: string;
  candidata: Candidata;
  onCambio: (aviso: { tipo: "ok" | "error"; texto: string } | null) => Promise<void>;
}) {
  const [trabajando, setTrabajando] = useState<"agregar" | "aliado" | null>(null);
  const ubicacion = [c.fraccionamiento, c.colonia, c.zona, c.ciudad].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
  const datos = [
    c.recamaras ? `${c.recamaras} rec.` : null,
    c.banos ? `${c.banos} baños` : null,
    c.metrosConstruccion ? `${c.metrosConstruccion} m² const.` : null,
    c.metrosTerreno ? `${c.metrosTerreno} m² terreno` : null,
  ].filter(Boolean);

  async function agregar() {
    setTrabajando("agregar");
    const r = await agregarCandidataWeb(busquedaId, c.url);
    setTrabajando(null);
    await onCambio(r.ok ? { tipo: "ok", texto: `"${c.titulo}" agregada a Opciones como sugerencia.` } : { tipo: "error", texto: r.mensaje || "No se pudo agregar." });
  }

  async function invitar() {
    setTrabajando("aliado");
    const r = await invitarAnuncianteComoAliado(busquedaId, c.url);
    setTrabajando(null);
    await onCambio(
      r.ok
        ? { tipo: "ok", texto: r.yaExistia ? `${c.anuncianteNombre} ya está en Aliados.` : `${c.anuncianteNombre} quedó como aliado prospecto (sin convenio). Contáctalo desde Aliados.` }
        : { tipo: "error", texto: r.mensaje || "No se pudo dar de alta." },
    );
  }

  return (
    <div className="rounded-md border border-carbon/10 p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-carbon">{c.titulo}</p>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${c.verificada ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
          title={c.verificada ? "La publicación apareció en los resultados de la búsqueda." : "No se pudo confirmar que el link exista: ábrelo antes de agregarla."}
        >
          {c.verificada ? "✓ verificada" : "⚠ sin verificar"}
        </span>
      </div>
      <p className="mt-0.5 font-mono text-sm text-verde-profundo">{c.precio ? formatoPesos(c.precio) : "Sin precio"}</p>
      {ubicacion && <p className="text-carbon/70">📍 {ubicacion}</p>}
      {datos.length > 0 && <p className="text-carbon/60">{datos.join(" · ")}</p>}
      {c.aceptaCredito.length > 0 && <p className="text-carbon/60">Acepta: {c.aceptaCredito.join(", ").toUpperCase()}</p>}
      {c.resumen && <p className="mt-1 text-carbon/60">{c.resumen}</p>}
      {(c.anuncianteNombre || c.anuncianteTelefono) && (
        <p className="mt-1 text-carbon/60">👤 {[c.anuncianteNombre, c.anuncianteTelefono].filter(Boolean).join(" · ")}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a href={c.url} target="_blank" rel="noreferrer" className="text-sky-800 hover:underline">
          Ver publicación ↗
        </a>
        {c.inmuebleId && <span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">✓ En inventario</span>}
        <button
          type="button"
          disabled={trabajando !== null}
          onClick={() => void agregar()}
          className="rounded-md bg-sauce px-2.5 py-1 font-semibold text-crema hover:bg-verde-profundo disabled:opacity-50"
        >
          {trabajando === "agregar" ? "Agregando…" : "＋ Agregar a Opciones"}
        </button>
        {c.anuncianteNombre && (
          <button
            type="button"
            disabled={trabajando !== null}
            onClick={() => void invitar()}
            className="rounded-md border border-carbon/15 px-2.5 py-1 text-carbon/70 hover:border-sauce disabled:opacity-50"
          >
            {trabajando === "aliado" ? "Guardando…" : "🤝 Invitar como aliado"}
          </button>
        )}
      </div>
    </div>
  );
}
