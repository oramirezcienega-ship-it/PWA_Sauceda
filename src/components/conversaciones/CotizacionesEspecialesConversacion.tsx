"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatoPesos } from "@/lib/formato";
import { labelTipoNegocio, type MensajeChat, type TipoNegocioId } from "@/lib/types";
import {
  cancelarCotizacionEspecial,
  crearCotizacionEspecial,
  desvincularTelegramProveedor,
  enviarEstimacionEspecial,
  estructurarCotizacionEspecial,
  listarCotizacionesEspecialesConversacion,
  proveedoresParaEspecial,
  recalcularEstimacionEspecial,
  type CotizacionEspecial,
  type ProveedorParaEspecial,
  type RespuestaEspecial,
} from "@/app/actions/cotizaciones-especiales";

const LINEAS: TipoNegocioId[] = [
  "construccion-impermeabilizacion",
  "construccion-mantenimiento-calentadores",
  "construccion-mantenimiento-tinacos",
  "construccion-mantenimiento-cisternas",
  "construccion-mantenimiento-postventa",
  "construccion-piso-estampado",
  "construccion-herreria",
  "construccion-remodelacion",
  "construccion",
  "otro",
];

const ESTADO_RESPUESTA: Record<RespuestaEspecial["estado"], { texto: string; clase: string }> = {
  enviada: { texto: "Esperando", clase: "bg-slate-100 text-carbon/60" },
  cotizando: { texto: "Cotizando…", clase: "bg-sky-50 text-sky-700" },
  cotizada: { texto: "Cotizó", clase: "bg-emerald-50 text-emerald-700" },
  requiere_visita: { texto: "Necesita visita", clase: "bg-amber-50 text-amber-800" },
  rechazada: { texto: "No lo hace", clase: "bg-slate-100 text-carbon/50" },
  vencida: { texto: "No respondió", clase: "bg-slate-100 text-carbon/50" },
  sin_telegram: { texto: "No se pudo avisar", clase: "bg-rojo/10 text-rojo" },
};

const inputCls =
  "w-full rounded-lg border border-carbon/20 bg-white px-2.5 py-1.5 text-xs text-carbon outline-none focus:border-sauce";

/** Referencias de fotos que mandó el cliente: [image:ID] caption. */
function fotosDelCliente(mensajes: MensajeChat[]): string[] {
  const refs: string[] = [];
  for (const m of mensajes) {
    if (m.direccion !== "in") continue;
    const f = (m.texto || "").match(/^\[image:([^\]]+)\]/);
    if (f) refs.push(f[1]);
  }
  return refs.slice(-12);
}

const srcFoto = (ref: string) => (/^https?:\/\//i.test(ref) ? ref : `/api/conversaciones/media?mediaId=${encodeURIComponent(ref)}`);

/**
 * Cotizaciones especiales (fuera de catálogo) de la conversación: se arma el brief, se concursa
 * con proveedores por Telegram y, con su respuesta + margen, el asesor envía la estimación al cliente.
 */
export function CotizacionesEspecialesConversacion({
  telefono,
  tipoNegocio,
  prospectoId,
  expedienteId,
  mensajes,
  onEnviada,
}: {
  telefono: string;
  tipoNegocio: string | null | undefined;
  prospectoId: string | null;
  expedienteId: string | null;
  mensajes: MensajeChat[];
  onEnviada: () => void;
}) {
  const [lista, setLista] = useState<CotizacionEspecial[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista(await listarCotizacionesEspecialesConversacion(telefono));
    } catch {
      setLista([]);
    }
  }, [telefono]);

  useEffect(() => {
    setAbierto(false);
    setCreando(false);
    cargar();
    // Las respuestas de los proveedores llegan por Telegram o por su portal: se refresca cada 30 s.
    const t = setInterval(cargar, 30000);
    return () => clearInterval(t);
  }, [cargar]);

  const activas = lista.filter((c) => c.estado === "enviada" || c.estado === "estimacion_lista");
  const listas = lista.filter((c) => c.estado === "estimacion_lista");
  const mostrarLista = abierto || listas.length > 0;

  return (
    <div className={`border-b px-3 py-1.5 text-xs ${listas.length ? "border-amber-300 bg-amber-50/70" : "border-carbon/10 bg-white/60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setAbierto((v) => !v)} className="flex items-center gap-1.5 font-semibold text-carbon/75">
          💡 Cotizaciones especiales
          {activas.length > 0 && (
            <span className="rounded-full bg-sauce px-1.5 py-0.5 text-[10px] font-bold text-white">{activas.length}</span>
          )}
          {listas.length > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {listas.length} estimación lista
            </span>
          )}
          {lista.length > 0 && <span className="text-carbon/40">{mostrarLista ? "▲" : "▼"}</span>}
        </button>
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="rounded-md border border-sauce/40 bg-white px-2 py-0.5 text-[11px] font-bold text-sauce hover:bg-sauce hover:text-white"
          title="Pedir estimación a proveedores para algo que no está en el catálogo"
        >
          + Nueva
        </button>
      </div>

      {mostrarLista && lista.length > 0 && (
        <div className="mt-2 max-h-[45vh] space-y-2 overflow-y-auto pb-1">
          {lista.map((c) => (
            <TarjetaCotizacionEspecial key={c.id} c={c} onCambio={cargar} onEnviada={onEnviada} />
          ))}
        </div>
      )}

      {creando && (
        <ModalNuevaCotizacionEspecial
          telefono={telefono}
          tipoNegocio={tipoNegocio || null}
          prospectoId={prospectoId}
          expedienteId={expedienteId}
          mensajes={mensajes}
          onCerrar={() => setCreando(false)}
          onCreada={() => {
            setCreando(false);
            setAbierto(true);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function TarjetaCotizacionEspecial({
  c,
  onCambio,
  onEnviada,
}: {
  c: CotizacionEspecial;
  onCambio: () => void;
  onEnviada: () => void;
}) {
  const [texto, setTexto] = useState(c.estimacionTexto);
  const [margen, setMargen] = useState(c.margenPct !== null ? String(c.margenPct) : "");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTexto(c.estimacionTexto);
    setMargen(c.margenPct !== null ? String(c.margenPct) : "");
  }, [c.estimacionTexto, c.margenPct]);

  const elegida = c.respuestas.find((r) => r.id === c.respuestaElegidaId) || null;

  async function accion(fn: () => Promise<{ ok: boolean; error?: string }>, despues?: () => void) {
    setError(null);
    setOcupado(true);
    try {
      const r = await fn();
      if (!r.ok) setError(r.error || "No se pudo completar.");
      else {
        despues?.();
        onCambio();
      }
    } finally {
      setOcupado(false);
    }
  }

  const etiquetaEstado: Record<CotizacionEspecial["estado"], string> = {
    enviada: "Esperando a proveedores",
    estimacion_lista: "💡 Estimación lista para enviar",
    enviada_cliente: "✓ Enviada al cliente",
    cerrada: "Cerrada",
    cancelada: "Cancelada",
  };

  return (
    <div
      className={`rounded-xl border bg-white p-3 ${
        c.estado === "estimacion_lista" ? "border-amber-300 ring-1 ring-amber-200" : "border-carbon/10"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-carbon/45">
            {c.folio}
            {c.tipoNegocio ? ` · ${labelTipoNegocio(c.tipoNegocio)}` : ""}
          </div>
          <div className="font-semibold text-carbon">{c.titulo}</div>
          {c.zona && <div className="text-[11px] text-carbon/55">📍 {c.zona}</div>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-carbon/60">{etiquetaEstado[c.estado]}</span>
          {(c.estado === "enviada" || c.estado === "estimacion_lista") && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => confirm("¿Cancelar esta cotización especial?") && accion(() => cancelarCotizacionEspecial(c.id))}
              className="text-[11px] text-rojo/70 hover:text-rojo"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Respuestas de proveedores */}
      <div className="mt-2 space-y-1">
        {c.respuestas.map((r) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
            <div className="min-w-0">
              <span className="font-semibold text-carbon">{r.proveedorNombre}</span>{" "}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ESTADO_RESPUESTA[r.estado].clase}`}>
                {ESTADO_RESPUESTA[r.estado].texto}
              </span>
              {r.estado === "cotizada" && (
                <div className="text-[11px] text-carbon/70">
                  {r.tiempo && <>⏱️ {r.tiempo} · </>}
                  {r.incluye || "Sin detalle de qué incluye"}
                </div>
              )}
            </div>
            <div className="text-right">
              {r.precio !== null && <div className="font-mono font-bold text-carbon">{formatoPesos(r.precio)}</div>}
              {r.estado === "cotizada" && c.estado === "estimacion_lista" && r.id !== c.respuestaElegidaId && (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => accion(() => recalcularEstimacionEspecial(c.id, { respuestaId: r.id }))}
                  className="text-[10.5px] font-bold text-sauce hover:underline"
                >
                  Usar esta
                </button>
              )}
              {r.id === c.respuestaElegidaId && <div className="text-[10px] font-bold text-sauce">✓ elegida</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Estimación para el cliente */}
      {c.estado === "estimacion_lista" && elegida && (
        <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-carbon/75">
            <span>
              Costo <b className="font-mono">{formatoPesos(elegida.precio || 0)}</b>
            </span>
            <label className="flex items-center gap-1">
              Margen
              <input
                type="number"
                min={0}
                max={90}
                value={margen}
                onChange={(e) => setMargen(e.target.value)}
                onBlur={() =>
                  margen !== "" &&
                  Number(margen) !== c.margenPct &&
                  accion(() => recalcularEstimacionEspecial(c.id, { margenPct: Number(margen) }))
                }
                className="w-14 rounded border border-carbon/20 px-1.5 py-0.5 font-mono"
              />
              %
            </label>
            <span>
              → Sugerido <b className="font-mono">{formatoPesos(c.precioSugerido || 0)}</b> · rango{" "}
              <b className="font-mono">
                {formatoPesos(c.rangoMin || 0)}–{formatoPesos(c.rangoMax || 0)}
              </b>
            </span>
          </div>
          <textarea
            rows={7}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="w-full rounded-lg border border-carbon/20 bg-white px-2.5 py-2 text-xs text-carbon outline-none focus:border-sauce"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto text-[10.5px] text-carbon/50">Puedes editar el texto antes de enviarlo.</span>
            <button
              type="button"
              disabled={ocupado || !texto.trim()}
              onClick={() => accion(() => enviarEstimacionEspecial(c.id, texto), onEnviada)}
              className="rounded-lg bg-sauce px-3.5 py-1.5 text-xs font-bold text-white hover:bg-verde-profundo disabled:opacity-50"
            >
              {ocupado ? "Enviando…" : "Enviar al cliente"}
            </button>
          </div>
        </div>
      )}

      {error && <div className="mt-2 rounded-md bg-rojo/10 px-2 py-1 text-[11px] text-rojo">{error}</div>}
    </div>
  );
}

function ModalNuevaCotizacionEspecial({
  telefono,
  tipoNegocio,
  prospectoId,
  expedienteId,
  mensajes,
  onCerrar,
  onCreada,
}: {
  telefono: string;
  tipoNegocio: string | null;
  prospectoId: string | null;
  expedienteId: string | null;
  mensajes: MensajeChat[];
  onCerrar: () => void;
  onCreada: () => void;
}) {
  // Borrador de la descripción: lo último que escribió el cliente (sin fotos ni botones)
  const borrador = useMemo(
    () =>
      mensajes
        .filter((m) => m.direccion === "in" && m.texto && !m.texto.startsWith("[") && m.texto.length > 3)
        .slice(-6)
        .map((m) => m.texto.trim())
        .join("\n"),
    [mensajes]
  );
  const candidatas = useMemo(() => fotosDelCliente(mensajes), [mensajes]);

  const [linea, setLinea] = useState(tipoNegocio && LINEAS.includes(tipoNegocio as TipoNegocioId) ? tipoNegocio : "");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState(borrador);
  const [zona, setZona] = useState("");
  const [fotos, setFotos] = useState<string[]>(candidatas.slice(-6));
  const [horas, setHoras] = useState("24");
  const [proveedores, setProveedores] = useState<ProveedorParaEspecial[] | null>(null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [ordenando, setOrdenando] = useState(false);
  const [ordenadoIA, setOrdenadoIA] = useState(false);
  // Si el usuario ya escribió, la respuesta automática de la IA no le pisa los cambios
  const editado = useRef(false);
  const setEditado = (v: boolean) => {
    editado.current = v;
  };

  // La IA convierte el chat en título + viñetas técnicas + colonia, sin saludos ni datos personales.
  const ordenarConIA = useCallback(
    async (forzar: boolean) => {
      setOrdenando(true);
      try {
        const r = await estructurarCotizacionEspecial(
          mensajes.map((m) => ({ direccion: m.direccion === "in" ? "in" : "out", texto: m.texto || "" })),
          linea || tipoNegocio
        );
        if (!r || (editado.current && !forzar)) return;
        if (r.titulo) setTitulo(r.titulo);
        if (r.descripcion) setDescripcion(r.descripcion);
        if (r.zona) setZona(r.zona);
        setOrdenadoIA(true);
        setEditado(false);
      } finally {
        setOrdenando(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mensajes, linea, tipoNegocio]
  );

  useEffect(() => {
    ordenarConIA(false);
    // Solo al abrir el modal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function desvincular(p: ProveedorParaEspecial) {
    const cuenta = p.telegramUsuario ? ` (@${p.telegramUsuario})` : "";
    if (!confirm(`¿Desvincular el Telegram${cuenta} de ${p.nombre}? Dejará de recibir cotizaciones hasta que abra su link de nuevo.`)) return;
    const r = await desvincularTelegramProveedor(p.id);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    setElegidos((prev) => prev.filter((x) => x !== p.id));
    setProveedores((prev) => prev && prev.map((x) => (x.id === p.id ? { ...x, tieneTelegram: false, telegramUsuario: null } : x)));
  }

  useEffect(() => {
    setProveedores(null);
    proveedoresParaEspecial(linea || null)
      .then((p) => {
        setProveedores(p);
        // Preselecciona los de la línea con Telegram; si no hay, todos los que tienen Telegram
        // Preselecciona los de la línea a los que se les puede avisar (WhatsApp o Telegram)
        const avisables = p.filter((x) => x.tieneTelegram || x.tieneWhatsapp);
        const deLinea = avisables.filter((x) => x.enLinea).map((x) => x.id);
        setElegidos(deLinea.length ? deLinea : avisables.map((x) => x.id));
      })
      .catch(() => setProveedores([]));
  }, [linea]);

  async function enviar() {
    setError(null);
    setEnviando(true);
    try {
      const r = await crearCotizacionEspecial({
        telefono,
        prospectoId,
        expedienteId,
        tipoNegocio: linea || null,
        titulo,
        descripcion,
        zona,
        fotos,
        horasRespuesta: Number(horas) || 24,
        proveedoresIds: elegidos,
      });
      if (!r.ok) {
        setError(r.error || "No se pudo enviar.");
        return;
      }
      if (r.sinTelegram && r.sinTelegram.length > 0) {
        setResultado(
          `Enviada a ${r.enviados} proveedor(es). Sin WhatsApp ni Telegram registrado: ${r.sinTelegram.join(", ")}.`
        );
        setTimeout(onCreada, 2500);
      } else onCreada();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4 backdrop-blur-xs">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-carbon/10 bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3 border-b border-carbon/10 pb-3">
          <div>
            <h3 className="font-titular text-base font-bold text-verde-profundo">💡 Cotización especial</h3>
            <p className="text-[11px] text-carbon/60">
              Para algo que no está en el catálogo. Se le avisa a cada proveedor por su canal (WhatsApp con link a su portal, o Telegram); nunca ven el nombre,
              teléfono ni dirección exacta del cliente.
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="p-1 text-lg font-bold text-carbon/40 hover:text-carbon">
            ✕
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <div>
              <label className="mb-1 block font-semibold text-carbon/80">¿Qué necesita el cliente? (título) *</label>
              <input
                value={titulo}
                onChange={(e) => {
                  setTitulo(e.target.value);
                  setEditado(true);
                }}
                className={inputCls}
                placeholder="Ej. Mantenimiento calentador 40 tubos con hidrobomba"
              />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-carbon/80">Línea de negocio</label>
              <select value={linea} onChange={(e) => setLinea(e.target.value)} className={inputCls}>
                <option value="">— General —</option>
                {LINEAS.map((t) => (
                  <option key={t} value={t}>
                    {labelTipoNegocio(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block font-semibold text-carbon/80">En qué consiste y características</label>
              <button
                type="button"
                onClick={() => ordenarConIA(true)}
                disabled={ordenando}
                className="text-[11px] font-semibold text-sauce hover:underline disabled:opacity-50"
              >
                {ordenando ? "✨ Ordenando…" : "✨ Ordenar con IA"}
              </button>
            </div>
            <textarea
              rows={6}
              value={descripcion}
              onChange={(e) => {
                setDescripcion(e.target.value);
                setEditado(true);
              }}
              className={inputCls}
              placeholder="Medidas, cantidades, materiales, estado actual, acceso (azotea, altura)…"
            />
            <p className="mt-0.5 text-[10.5px] text-carbon/45">
              {ordenando
                ? "La IA está ordenando lo que pidió el cliente…"
                : ordenadoIA
                  ? "La IA lo redactó a partir del chat: revisa que esté completo y correcto antes de enviar."
                  : "Se prellenó con lo último que escribió el cliente: revísalo y quita datos personales."}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <div>
              <label className="mb-1 block font-semibold text-carbon/80">Ubicación (colonia / municipio)</label>
              <input
                value={zona}
                onChange={(e) => {
                  setZona(e.target.value);
                  setEditado(true);
                }}
                className={inputCls} placeholder="Ej. Jardines del Moral, León" />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-carbon/80">Plazo para responder (horas)</label>
              <input type="number" min={1} max={168} value={horas} onChange={(e) => setHoras(e.target.value)} className={inputCls} />
            </div>
          </div>

          {candidatas.length > 0 && (
            <div>
              <div className="mb-1 font-semibold text-carbon/80">Fotos del cliente para el proveedor</div>
              <div className="flex flex-wrap gap-2">
                {candidatas.map((ref) => {
                  const sel = fotos.includes(ref);
                  return (
                    <button
                      key={ref}
                      type="button"
                      onClick={() => setFotos((prev) => (sel ? prev.filter((x) => x !== ref) : [...prev, ref].slice(0, 10)))}
                      className={`relative h-16 w-16 overflow-hidden rounded-lg border-2 ${sel ? "border-sauce" : "border-transparent opacity-50"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={srcFoto(ref)} alt="Foto del cliente" className="h-full w-full object-cover" />
                      {sel && <span className="absolute right-0.5 top-0.5 rounded-full bg-sauce px-1 text-[9px] text-white">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 font-semibold text-carbon/80">Proveedores que concursan</div>
            {proveedores === null ? (
              <div className="text-carbon/50">Cargando proveedores…</div>
            ) : (
              <div className="space-y-1">
                {proveedores.map((p) => {
                  const sel = elegidos.includes(p.id);
                  return (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={(e) =>
                            setElegidos((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))
                          }
                        />
                        <span className="font-semibold text-carbon">{p.nombre}</span>
                        {p.enLinea && <span className="text-[10px] text-sauce">· trabaja esta línea</span>}
                      </label>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          p.canal === "telegram" ? "bg-sky-100 text-sky-800" : p.tieneWhatsapp ? "bg-emerald-100 text-emerald-800" : "bg-rojo/10 text-rojo"
                        }`}
                        title={p.canal === "telegram" ? "Recibe botones en Telegram" : "Recibe un WhatsApp con link a su portal para responder"}
                      >
                        {p.canal === "telegram" ? "✈ Telegram" : p.tieneWhatsapp ? "📱 WhatsApp" : "Sin teléfono"}
                      </span>
                      {p.canal !== "telegram" ? null : p.tieneTelegram ? (
                        <span className="flex items-center gap-2 text-[10.5px]">
                          <span className="font-semibold text-emerald-700" title="Cuenta de Telegram que recibe las cotizaciones">
                            ✓ Telegram{p.telegramUsuario ? ` @${p.telegramUsuario}` : ""}
                          </span>
                          <button type="button" onClick={() => desvincular(p)} className="text-carbon/50 hover:text-rojo hover:underline">
                            Desvincular
                          </button>
                        </span>
                      ) : p.enlaceTelegram ? (
                        <button
                          type="button"
                          onClick={() => navigator.clipboard?.writeText(p.enlaceTelegram!).catch(() => prompt("Copia el link:", p.enlaceTelegram!))}
                          className="text-[10.5px] font-semibold text-amber-700 hover:underline"
                          title="El proveedor abre este link en su celular, toca Iniciar y queda ligado"
                        >
                          ⚠ Sin Telegram · copiar link para ligar
                        </button>
                      ) : (
                        <span className="text-[10.5px] text-amber-700">⚠ Sin Telegram</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && <div className="rounded-lg bg-rojo/10 px-3 py-2 text-rojo">{error}</div>}
          {resultado && <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">{resultado}</div>}

          <div className="flex items-center justify-end gap-2 border-t border-carbon/10 pt-3">
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-lg border border-carbon/20 px-4 py-2 font-semibold text-carbon/70 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={enviando || !titulo.trim() || elegidos.length === 0}
              onClick={enviar}
              className="rounded-lg bg-sauce px-4 py-2 font-bold text-white hover:bg-verde-profundo disabled:opacity-50"
            >
              {enviando ? "Enviando…" : `Enviar a ${elegidos.length} proveedor(es)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
