"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  analizarSugerenciasIA,
  aprobarLlamadasIA,
  cancelarLlamadaIA,
  editarSugerenciaIA,
  generarListaReagendarIA,
  llamarAhoraIA,
  probarLlamadaIA,
  sincronizarLlamadaIA,
  type ConfiguracionLlamadasIA,
} from "@/app/actions/llamadas-ia";
import type { LlamadaIA, EstadoLlamadaIA, ResultadoLlamadaIA } from "@/features/llamadas-ia/service";
import type { PrioridadLlamada } from "@/features/llamadas-ia/sugerencias";

const ESTADOS: Record<EstadoLlamadaIA, { label: string; clase: string }> = {
  pendiente: { label: "Por aprobar", clase: "bg-carbon/5 text-carbon/70 border-carbon/15" },
  aprobada: { label: "Programada", clase: "bg-blue-50 text-blue-800 border-blue-200" },
  en_curso: { label: "En curso", clase: "bg-yellow-100 text-yellow-800 border-yellow-200 animate-pulse" },
  completada: { label: "Completada", clase: "bg-green-100 text-green-800 border-green-200" },
  fallida: { label: "Fallida", clase: "bg-red-100 text-red-800 border-red-200" },
  cancelada: { label: "Cancelada", clase: "bg-carbon/5 text-carbon/40 border-carbon/10" },
};

const RESULTADOS: Record<ResultadoLlamadaIA, string> = {
  visita_agendada: "✅ Aceptó visita",
  interesado: "🔥 Interesado",
  transferido: "📞 Transferido a asesor",
  duda: "❓ Tiene dudas",
  no_interesado: "✖ No interesado",
  llamar_despues: "⏰ Llamar después",
  no_contesta: "— No contestó",
  buzon: "📭 Buzón",
  no_llamar: "⛔ No llamar",
  error: "⚠ Error",
};

const PRIORIDADES: Record<PrioridadLlamada, { label: string; clase: string }> = {
  alta: { label: "Alta", clase: "bg-red-50 text-red-700 border-red-200" },
  media: { label: "Media", clase: "bg-amber-50 text-amber-800 border-amber-200" },
  baja: { label: "Baja", clase: "bg-carbon/5 text-carbon/60 border-carbon/15" },
};

type FiltroBandeja = "todas" | PrioridadLlamada | "descartar";
type Ejecutar = (accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) => void;

const BTN =
  "rounded-md border border-carbon/15 px-2 py-0.5 text-xs font-semibold text-verde-profundo transition hover:border-sauce disabled:opacity-40";

function fecha(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function horaLarga(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** ISO → valor de <input type="datetime-local"> en hora de México. */
function aInputLocal(iso: string | null): string {
  if (!iso) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour") === "24" ? "00" : v("hour")}:${v("minute")}`;
}

/** Valor de <input type="datetime-local"> (hora de México) → ISO con zona. */
function deInputLocal(v: string): string {
  return `${v}:00-06:00`;
}

export function LlamadasIA({ inicial, config }: { inicial: LlamadaIA[]; config: ConfiguracionLlamadasIA }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroBandeja>("todas");
  const [analizando, setAnalizando] = useState(false);
  const [prueba, setPrueba] = useState({ telefono: "", nombre: "", servicio: "impermeabilización", colonia: "" });

  const configurado = config.vapiApiKey && config.vapiNumero;
  const hayEnCurso = inicial.some((l) => l.estado === "en_curso");

  const sugeridas = inicial
    .filter((l) => l.estado === "pendiente" && !l.es_prueba)
    .sort((a, b) => (b.puntaje ?? -1) - (a.puntaje ?? -1));
  const sinAnalizar = sugeridas.filter((l) => !l.analizada_at).length;
  const enFiltro = (l: LlamadaIA, f: FiltroBandeja) => {
    const descartable = !!l.sugerencia?.descartar;
    if (f === "descartar") return descartable;
    return !descartable && (f === "todas" || l.prioridad === f);
  };
  const visibles = sugeridas.filter((l) => enFiltro(l, filtro));
  const agenda = inicial
    .filter((l) => l.estado === "aprobada" || l.estado === "en_curso")
    .sort((a, b) => Date.parse(a.proximo_intento ?? a.created_at) - Date.parse(b.proximo_intento ?? b.created_at));
  const historial = inicial.filter((l) => ["completada", "fallida", "cancelada"].includes(l.estado));

  // Refrescar mientras hay llamadas en curso o la IA está analizando.
  const refrescar = hayEnCurso || (analizando && sinAnalizar > 0);
  useEffect(() => {
    if (!refrescar) return;
    const t = setInterval(() => router.refresh(), analizando ? 6000 : 8000);
    return () => clearInterval(t);
  }, [refrescar, analizando, router]);
  useEffect(() => {
    if (analizando && sinAnalizar === 0) setAnalizando(false);
  }, [analizando, sinAnalizar]);

  const ejecutar: Ejecutar = (accion, exito) => {
    setMensaje(null);
    iniciar(async () => {
      const r = await accion();
      setMensaje(r.ok ? { ok: true, texto: exito } : { ok: false, texto: r.error || "Ocurrió un error." });
      router.refresh();
    });
  };

  const reales = inicial.filter((l) => !l.es_prueba);
  const contestadas = reales.filter((l) => l.resultado && !["no_contesta", "buzon", "error"].includes(l.resultado)).length;
  const visitas = reales.filter((l) => l.resultado === "visita_agendada").length;
  const costo = inicial.reduce((s, l) => s + (Number(l.costo_usd) || 0), 0);
  const seleccionVisible = seleccion.filter((id) => visibles.some((l) => l.id === id));

  return (
    <div className="space-y-5">
      {!configurado && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
          <p className="font-semibold">Falta configurar Vapi para poder marcar.</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {!config.vapiApiKey && <li>Variable de entorno <code>VAPI_API_KEY</code> (llave privada de Vapi).</li>}
            {!config.vapiNumero && (
              <li>
                <code>VAPI_PHONE_NUMBER_ID</code>: número de Twilio importado en Vapi. Usa uno distinto al del
                conmutador, porque importarlo cambia su webhook de voz.
              </li>
            )}
          </ul>
        </div>
      )}

      {mensaje && (
        <p
          className={`rounded-lg border px-4 py-2 text-sm ${
            mensaje.ok ? "border-green-200 bg-green-50 text-green-800" : "border-rojo/30 bg-rojo/10 text-rojo"
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi titulo="Sugeridas" valor={sugeridas.length} />
        <Kpi titulo="Programadas" valor={agenda.length} />
        <Kpi titulo="Contestadas" valor={contestadas} />
        <Kpi titulo="Visitas aceptadas" valor={visitas} />
        <Kpi titulo="Costo Vapi" valor={`$${costo.toFixed(2)} USD`} />
      </div>

      {/* Bandeja de sugeridas */}
      <section className="rounded-xl border border-carbon/10 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-carbon/10 px-4 py-3">
          <div className="mr-auto">
            <h2 className="text-sm font-semibold text-verde-profundo">Llamadas sugeridas</h2>
            <p className="text-xs text-carbon/50">
              La IA lee la cotización y el WhatsApp de cada cliente y propone prioridad, hora y con qué abrir. Nada se marca sin aprobar.
            </p>
          </div>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              setMensaje(null);
              iniciar(async () => {
                const r = await generarListaReagendarIA();
                if (r.ok && r.agregadas) setAnalizando(true);
                setMensaje(
                  r.ok
                    ? {
                        ok: true,
                        texto: r.agregadas
                          ? `Se agregaron ${r.agregadas}. La IA las está analizando…`
                          : "No hay cotizaciones nuevas esperando visita.",
                      }
                    : { ok: false, texto: r.error || "Error" },
                );
                router.refresh();
              });
            }}
            className="rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs font-semibold text-verde-profundo transition hover:border-sauce disabled:opacity-40"
          >
            + Traer cotizaciones esperando visita
          </button>
          {sinAnalizar > 0 && (
            <button
              type="button"
              disabled={pendiente || analizando}
              onClick={() => {
                setMensaje(null);
                iniciar(async () => {
                  const r = await analizarSugerenciasIA();
                  if (r.ok) setAnalizando(true);
                  else setMensaje({ ok: false, texto: r.error || "Error" });
                  router.refresh();
                });
              }}
              className="rounded-lg bg-verde-profundo px-3 py-1.5 text-xs font-semibold text-crema transition hover:bg-sauce disabled:opacity-40"
            >
              {analizando ? `Analizando… faltan ${sinAnalizar}` : `✨ Analizar con IA (${sinAnalizar})`}
            </button>
          )}
        </div>

        {sugeridas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-carbon/5 px-4 py-2">
            {(["todas", "alta", "media", "baja", "descartar"] as FiltroBandeja[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition ${
                  filtro === f ? "border-sauce bg-sauce/10 text-verde-profundo" : "border-carbon/10 text-carbon/50 hover:text-verde-profundo"
                }`}
              >
                {f === "todas" ? "Todas" : f === "descartar" ? "No llamar" : PRIORIDADES[f].label} (
                {sugeridas.filter((l) => enFiltro(l, f)).length})
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-carbon/60">
              <input
                type="checkbox"
                checked={visibles.length > 0 && seleccionVisible.length === visibles.length}
                onChange={(e) => setSeleccion(e.target.checked ? visibles.map((l) => l.id) : [])}
              />
              Todas
            </label>
            <button
              type="button"
              disabled={pendiente || seleccionVisible.length === 0}
              onClick={() => {
                const ids = seleccionVisible;
                ejecutar(() => aprobarLlamadasIA(ids), `${ids.length} pasaron a la agenda con su hora sugerida.`);
                setSeleccion([]);
              }}
              className="rounded-lg bg-sauce px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-40"
            >
              Aprobar seleccionadas ({seleccionVisible.length})
            </button>
          </div>
        )}

        <div className="divide-y divide-carbon/5">
          {visibles.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-carbon/50">
              {sugeridas.length === 0
                ? "No hay sugerencias. Trae las cotizaciones esperando visita para empezar."
                : "No hay sugerencias con este filtro."}
            </p>
          ) : (
            visibles.map((ll) => (
              <TarjetaSugerida
                key={ll.id}
                ll={ll}
                seleccionada={seleccion.includes(ll.id)}
                onSeleccionar={(v) => setSeleccion(v ? [...seleccion, ll.id] : seleccion.filter((x) => x !== ll.id))}
                ocupado={pendiente}
                ejecutar={ejecutar}
              />
            ))
          )}
        </div>
      </section>

      {/* Agenda */}
      <section className="rounded-xl border border-carbon/10 bg-white shadow-sm">
        <div className="flex items-center border-b border-carbon/10 px-4 py-3">
          <div className="mr-auto">
            <h2 className="text-sm font-semibold text-verde-profundo">Agenda de llamadas</h2>
            <p className="text-xs text-carbon/50">Aprobadas, en orden de hora sugerida. Por ahora cada llamada se lanza a mano con “Llamar ahora” (lunes a sábado, 10 a 19 h).</p>
          </div>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-carbon/60 hover:text-verde-profundo"
          >
            ↻ Actualizar
          </button>
        </div>
        <div className="divide-y divide-carbon/5">
          {agenda.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-carbon/50">No hay llamadas programadas.</p>
          ) : (
            agenda.map((ll) => <FilaAgenda key={ll.id} ll={ll} ocupado={pendiente} configurado={configurado} ejecutar={ejecutar} />)
          )}
        </div>
      </section>

      {/* Resultados */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-verde-profundo">Resultados</h2>
        <div className="overflow-auto rounded-xl border border-carbon/10 bg-white shadow-sm scrollbar-sutil">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-carbon/10 bg-crema/90 text-left">
                <Th>Cliente</Th>
                <Th>Estado</Th>
                <Th>Resultado</Th>
                <Th>Intentos</Th>
                <Th>Horario pedido</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {historial.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-carbon/50">
                    Aún no hay llamadas terminadas.
                  </td>
                </tr>
              ) : (
                historial.map((ll) => (
                  <FilaLlamada
                    key={ll.id}
                    ll={ll}
                    abierta={abierta === ll.id}
                    onAbrir={() => setAbierta(abierta === ll.id ? null : ll.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Llamada de prueba */}
      <details className="rounded-xl border border-carbon/10 bg-white shadow-sm">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-verde-profundo">Llamada de prueba a tu número</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ejecutar(() => probarLlamadaIA(prueba), "Llamada de prueba en marcha: contesta tu teléfono.");
          }}
          className="border-t border-carbon/10 p-4"
        >
          <div className="grid gap-3 md:grid-cols-4">
            <Campo label="Teléfono (10 dígitos)" value={prueba.telefono} requerido onChange={(v) => setPrueba({ ...prueba, telefono: v })} />
            <Campo label="Nombre" value={prueba.nombre} onChange={(v) => setPrueba({ ...prueba, nombre: v })} />
            <Campo label="Servicio" value={prueba.servicio} onChange={(v) => setPrueba({ ...prueba, servicio: v })} />
            <Campo label="Colonia" value={prueba.colonia} onChange={(v) => setPrueba({ ...prueba, colonia: v })} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pendiente || !configurado}
              className="rounded-lg bg-verde-profundo px-4 py-1.5 text-sm font-semibold text-crema shadow-sm transition hover:bg-sauce disabled:opacity-40"
            >
              {pendiente ? "Marcando…" : "📞 Llamarme"}
            </button>
            <span className="text-xs text-carbon/50">
              Queda marcada como prueba: no toca cotizaciones ni prospectos. Puede marcar fuera de horario.
            </span>
          </div>
        </form>
      </details>
    </div>
  );
}

function ClienteLinea({ ll }: { ll: LlamadaIA }) {
  return (
    <span className="block text-xs text-carbon/50">
      <span className="font-mono">{ll.telefono}</span>
      {ll.contexto?.servicio && ` · ${ll.contexto.servicio}`}
      {ll.contexto?.metros ? ` · ${ll.contexto.metros} m²` : ""}
      {ll.contexto?.monto ? ` · $${Math.round(ll.contexto.monto).toLocaleString("es-MX")}` : ""}
      {ll.cotizacion_id && (
        <>
          {" · "}
          <Link href={`/construccion/${ll.cotizacion_id}`} className="text-sauce hover:underline">
            {ll.cotizacion_id}
          </Link>
        </>
      )}
    </span>
  );
}

function TarjetaSugerida({
  ll,
  seleccionada,
  onSeleccionar,
  ocupado,
  ejecutar,
}: {
  ll: LlamadaIA;
  seleccionada: boolean;
  onSeleccionar: (v: boolean) => void;
  ocupado: boolean;
  ejecutar: Ejecutar;
}) {
  const [editando, setEditando] = useState(false);
  const [hora, setHora] = useState(aInputLocal(ll.hora_sugerida));
  const [gancho, setGancho] = useState(ll.sugerencia?.gancho ?? "");
  const sug = ll.sugerencia;
  const pri = ll.prioridad ? PRIORIDADES[ll.prioridad] : null;

  return (
    <div className="flex gap-3 px-4 py-3">
      <input type="checkbox" aria-label="Seleccionar" className="mt-1" checked={seleccionada} onChange={(e) => onSeleccionar(e.target.checked)} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-verde-profundo">{ll.nombre || "Sin nombre"}</span>
          {pri ? (
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pri.clase}`}>
              {pri.label} · {ll.puntaje ?? 0}
            </span>
          ) : (
            <span className="rounded-full border border-carbon/10 px-2 py-0.5 text-[11px] text-carbon/40">Sin analizar</span>
          )}
          {sug?.editada && <span className="text-[11px] text-carbon/40">editada</span>}
        </div>
        <ClienteLinea ll={ll} />

        {sug?.descartar && <p className="text-xs font-semibold text-rojo">La IA sugiere no llamar.</p>}
        {sug?.razon && <p className="text-sm text-carbon/80">{sug.razon}</p>}
        {sug?.punto && <p className="text-xs text-carbon/50">Dónde se quedó: {sug.punto}</p>}
        {sug?.precio_dado && <p className="text-xs text-carbon/60">💲 Ya recibió precio: {sug.precio_dado}</p>}

        {editando ? (
          <div className="space-y-2 rounded-lg bg-crema/50 p-3">
            <label className="block text-xs text-carbon/60">
              Hora de la llamada
              <input
                type="datetime-local"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="mt-1 block rounded-lg border border-carbon/15 bg-white px-2 py-1 text-sm text-verde-profundo"
              />
            </label>
            <label className="block text-xs text-carbon/60">
              Con qué abrir (gancho)
              <textarea
                value={gancho}
                onChange={(e) => setGancho(e.target.value)}
                rows={2}
                className="mt-1 block w-full rounded-lg border border-carbon/15 bg-white px-2 py-1 text-sm text-verde-profundo"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className={BTN}
                disabled={ocupado}
                onClick={() => {
                  ejecutar(
                    () => editarSugerenciaIA(ll.id, { gancho, ...(hora ? { hora: deInputLocal(hora) } : {}) }),
                    "Sugerencia actualizada.",
                  );
                  setEditando(false);
                }}
              >
                Guardar
              </button>
              <button type="button" className={BTN} onClick={() => setEditando(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          sug && (
            <>
              <p className="text-xs text-carbon/70">
                <span className="font-semibold text-verde-profundo">🕒 {horaLarga(ll.hora_sugerida)}</span>
                {sug.hora_razon && <span className="text-carbon/50"> · {sug.hora_razon}</span>}
              </p>
              {sug.gancho && (
                <p className="rounded-lg border-l-2 border-sauce bg-crema/50 px-3 py-1.5 text-sm italic text-carbon/80">{sug.gancho}</p>
              )}
              {sug.objecion && <p className="text-xs text-carbon/50">Freno probable: {sug.objecion}</p>}
            </>
          )
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button type="button" className={BTN} disabled={ocupado} onClick={() => ejecutar(() => aprobarLlamadasIA([ll.id]), "Pasó a la agenda.")}>
          Aprobar
        </button>
        {sug && !editando && (
          <button
            type="button"
            className={BTN}
            onClick={() => {
              setHora(aInputLocal(ll.hora_sugerida));
              setGancho(sug.gancho ?? "");
              setEditando(true);
            }}
          >
            Editar
          </button>
        )}
        <button
          type="button"
          className={BTN}
          disabled={ocupado}
          onClick={() => ejecutar(() => analizarSugerenciasIA([ll.id]), "Analizada de nuevo.")}
        >
          {sug ? "Reanalizar" : "Analizar"}
        </button>
        <button type="button" className={BTN} disabled={ocupado} onClick={() => ejecutar(() => cancelarLlamadaIA(ll.id), "Descartada.")}>
          Descartar
        </button>
      </div>
    </div>
  );
}

function FilaAgenda({ ll, ocupado, configurado, ejecutar }: { ll: LlamadaIA; ocupado: boolean; configurado: boolean; ejecutar: Ejecutar }) {
  const [editando, setEditando] = useState(false);
  const [hora, setHora] = useState(aInputLocal(ll.proximo_intento));
  const est = ESTADOS[ll.estado];

  return (
    <div className="flex flex-wrap items-start gap-3 px-4 py-3">
      <div className="w-36 shrink-0 text-xs">
        <span className="block font-semibold text-verde-profundo">
          {ll.proximo_intento ? horaLarga(ll.proximo_intento) : "Sin hora"}
        </span>
        <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${est.clase}`}>{est.label}</span>
      </div>
      <div className="min-w-0 flex-1">
        <span className="block font-semibold text-verde-profundo">
          {ll.nombre || "Sin nombre"}
          {ll.es_prueba && (
            <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-purple-700">Prueba</span>
          )}
        </span>
        <ClienteLinea ll={ll} />
        {ll.sugerencia?.gancho && <p className="mt-1 text-xs italic text-carbon/60">{ll.sugerencia.gancho}</p>}
        {ll.intentos > 0 && (
          <p className="mt-1 text-[11px] text-carbon/40">
            Intento {ll.intentos}/{ll.max_intentos}
            {ll.resultado ? ` · último: ${RESULTADOS[ll.resultado]}` : ""}
          </p>
        )}
        {editando && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="rounded-lg border border-carbon/15 bg-white px-2 py-1 text-sm text-verde-profundo"
            />
            <button
              type="button"
              className={BTN}
              disabled={ocupado || !hora}
              onClick={() => {
                ejecutar(() => editarSugerenciaIA(ll.id, { hora: deInputLocal(hora) }), "Hora cambiada.");
                setEditando(false);
              }}
            >
              Guardar
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {ll.estado === "aprobada" && (
          <>
            <button
              type="button"
              className={BTN}
              disabled={ocupado || !configurado}
              onClick={() => ejecutar(() => llamarAhoraIA(ll.id), "Marcando…")}
            >
              Llamar ahora
            </button>
            <button type="button" className={BTN} onClick={() => setEditando(!editando)}>
              Cambiar hora
            </button>
            <button type="button" className={BTN} disabled={ocupado} onClick={() => ejecutar(() => cancelarLlamadaIA(ll.id), "Cancelada.")}>
              Cancelar
            </button>
          </>
        )}
        {ll.estado === "en_curso" && (
          <button
            type="button"
            className={BTN}
            disabled={ocupado}
            onClick={() => ejecutar(() => sincronizarLlamadaIA(ll.id), "Sincronizada con Vapi.")}
          >
            Consultar Vapi
          </button>
        )}
      </div>
    </div>
  );
}

/** Llamada terminada (completada, fallida o cancelada). */
function FilaLlamada({ ll, abierta, onAbrir }: { ll: LlamadaIA; abierta: boolean; onAbrir: () => void }) {
  const est = ESTADOS[ll.estado];
  const tieneDetalle = !!(ll.resumen || ll.transcripcion || ll.grabacion_url || ll.error);

  return (
    <>
      <tr className="border-b border-carbon/5 align-top hover:bg-carbon/5">
        <td className="px-3 py-3">
          <span className="block font-semibold text-verde-profundo">
            {ll.nombre || "Sin nombre"}
            {ll.es_prueba && (
              <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-purple-700">Prueba</span>
            )}
          </span>
          <ClienteLinea ll={ll} />
        </td>
        <td className="px-3 py-3">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${est.clase}`}>{est.label}</span>
        </td>
        <td className="px-3 py-3 text-xs">{ll.resultado ? RESULTADOS[ll.resultado] : "--"}</td>
        <td className="px-3 py-3 font-mono text-xs">
          {ll.intentos}/{ll.max_intentos}
        </td>
        <td className="px-3 py-3 text-xs">{fecha(ll.fecha_visita)}</td>
        <td className="px-3 py-3">
          {tieneDetalle && (
            <button type="button" className={BTN} onClick={onAbrir}>
              {abierta ? "Ocultar" : "Detalle"}
            </button>
          )}
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-carbon/10 bg-crema/40">
          <td colSpan={6} className="space-y-2 px-6 py-4 text-sm">
            {ll.error && <p className="text-rojo">⚠ {ll.error}</p>}
            {ll.resumen && (
              <p>
                <span className="font-semibold text-verde-profundo">Resumen: </span>
                {ll.resumen}
              </p>
            )}
            {ll.grabacion_url && <audio src={ll.grabacion_url} controls className="h-8 w-full max-w-md" />}
            {ll.transcripcion && (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-cuerpo text-xs text-carbon/80">
                {ll.transcripcion}
              </pre>
            )}
            <p className="text-xs text-carbon/40">
              {ll.duracion_seg != null && `Duración ${ll.duracion_seg}s · `}
              {ll.costo_usd != null && `Costo $${Number(ll.costo_usd).toFixed(3)} USD · `}
              Creada {fecha(ll.created_at)}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function Kpi({ titulo, valor }: { titulo: string; valor: string | number }) {
  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-carbon/40">{titulo}</p>
      <p className="mt-1 font-titular text-2xl font-semibold text-verde-profundo">{valor}</p>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  requerido,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  requerido?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-carbon/40">{label}</span>
      <input
        type="text"
        value={value}
        required={requerido}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-sm text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
      />
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-carbon/50">{children}</th>;
}
