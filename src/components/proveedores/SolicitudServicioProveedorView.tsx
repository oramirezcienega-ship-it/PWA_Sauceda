"use client";

import { useMemo, useState } from "react";
import { formatoPesos } from "@/lib/formato";
import { responderSolicitudPortal, type SolicitudPortal } from "@/app/actions/portal-precios-proveedor";

interface Props {
  token: string;
  proveedorNombre: string;
  solicitudInicial: SolicitudPortal;
}

const inputCls =
  "w-full rounded-xl border border-carbon/20 bg-white px-3.5 py-3 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/20";

function capitalizar(s: string) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Genera sugerencias de fecha en lenguaje natural para los próximos días */
function generarAtajosFechas() {
  const atajos: Array<{ label: string; valor: string }> = [];
  const ahora = new Date();

  // Opción 1: Mañana por la mañana
  const manana = new Date(ahora);
  manana.setDate(ahora.getDate() + 1);
  const diaManana = manana.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
  atajos.push({
    label: `Mañana en la mañana (9:00 - 13:00)`,
    valor: `Mañana ${diaManana} · mañana (9:00 a 13:00 h)`,
  });

  // Opción 2: Mañana por la tarde
  atajos.push({
    label: `Mañana por la tarde (14:00 - 18:00)`,
    valor: `Mañana ${diaManana} · tarde (14:00 a 18:00 h)`,
  });

  // Opción 3: Pasado mañana
  const pasado = new Date(ahora);
  pasado.setDate(ahora.getDate() + 2);
  const diaPasado = pasado.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
  atajos.push({
    label: `Pasado mañana (${capitalizar(diaPasado)})`,
    valor: `${capitalizar(diaPasado)} · mañana o tarde`,
  });

  // Opción 4: Próximo sábado
  const proxSab = new Date(ahora);
  const diasHastaSab = (6 - ahora.getDay() + 7) % 7 || 7;
  proxSab.setDate(ahora.getDate() + diasHastaSab);
  const diaSab = proxSab.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  atajos.push({
    label: `Sábado (${diaSab}) por la mañana`,
    valor: `Sábado ${diaSab} · mañana (9:00 a 14:00 h)`,
  });

  return atajos;
}

export function SolicitudServicioProveedorView({ token, proveedorNombre, solicitudInicial }: Props) {
  const [s, setS] = useState<SolicitudPortal>(solicitudInicial);
  const [fechas, setFechas] = useState<string[]>(["", "", ""]);
  const [comentario, setComentario] = useState("");
  const [modoSecundario, setModoSecundario] = useState<"visita" | "rechazo" | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  const atajos = useMemo(() => generarAtajosFechas(), []);
  const esPendiente = s.estado === "enviada" || s.estado === "vista";

  // Extraer link de Google Maps si viene embebido en la descripción
  const linkMaps = useMemo(() => {
    const match = s.descripcion.match(/https?:\/\/(?:maps\.app\.goo\.gl|www\.google\.com\/maps)[^\s\n]+/i);
    return match ? match[0] : null;
  }, [s.descripcion]);

  // Limpiar la descripción quitando links crudos de maps para que se lea impecable
  const descripcionLimpia = useMemo(() => {
    return s.descripcion
      .replace(/Maps:\s*https?:\/\/[^\s\n]+/gi, "")
      .trim();
  }, [s.descripcion]);

  function aplicarAtajo(valor: string) {
    setFechas((prev) => {
      // Si la primera opción está vacía, ponerla ahí; si no, buscar la primera vacía
      if (!prev[0].trim()) return [valor, prev[1], prev[2]];
      if (!prev[1].trim()) return [prev[0], valor, prev[2]];
      if (!prev[2].trim()) return [prev[0], prev[1], valor];
      return [valor, prev[1], prev[2]];
    });
  }

  async function enviarAceptacion(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const fechasValidas = fechas.map((f) => f.trim()).filter(Boolean);
    if (fechasValidas.length === 0) {
      setMensaje({
        tipo: "error",
        texto: "Por favor indica al menos un día y horario en el que podrías acudir.",
      });
      return;
    }

    setEnviando(true);
    setMensaje(null);
    const res = await responderSolicitudPortal(token, s.envioId, {
      tipo: "aceptada",
      fechas: fechasValidas,
      comentario: comentario.trim() || undefined,
    });
    setEnviando(false);

    if (!res.ok) {
      setMensaje({ tipo: "error", texto: res.mensaje || "No se pudo registrar tu respuesta." });
      return;
    }

    if (res.solicitud) setS(res.solicitud);
    setMensaje({
      tipo: "ok",
      texto: "¡Excelente! Ya recibimos tus horarios disponibles.",
    });
  }

  async function enviarRespuestaAlternativa(tipo: "requiere_visita" | "rechazada") {
    if (tipo === "requiere_visita" && !comentario.trim()) {
      setMensaje({
        tipo: "error",
        texto: "Por favor escribe qué necesitas revisar en el sitio antes de cotizar o agendar.",
      });
      return;
    }

    setEnviando(true);
    setMensaje(null);
    const res = await responderSolicitudPortal(token, s.envioId, {
      tipo,
      comentario: comentario.trim() || undefined,
    });
    setEnviando(false);

    if (!res.ok) {
      setMensaje({ tipo: "error", texto: res.mensaje || "No se pudo registrar tu respuesta." });
      return;
    }

    if (res.solicitud) setS(res.solicitud);
    setModoSecundario(null);
    setMensaje({
      tipo: "ok",
      texto: tipo === "requiere_visita" ? "Solicitud de visita técnica enviada al equipo." : "Respuesta registrada. Gracias por avisarnos.",
    });
  }

  return (
    <div className="min-h-screen bg-slate-100/80 px-4 py-6 font-cuerpo sm:py-10">
      <div className="mx-auto max-w-xl">
        {/* Encabezado limpio institucional */}
        <header className="mb-4 flex items-center justify-between rounded-2xl bg-white px-5 py-3.5 shadow-xs border border-carbon/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-verde-profundo text-white font-bold text-sm shadow-xs">
              S
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-carbon/50">SAUCEDA · Servicios</div>
              <div className="font-titular text-sm font-bold text-verde-profundo">Petición de Trabajo</div>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs font-semibold text-carbon/70 border border-carbon/10">
            {s.folio}
          </span>
        </header>

        {/* Saludo personalizado */}
        <div className="mb-4 px-1">
          <h1 className="font-titular text-xl font-bold text-verde-profundo">
            Hola {proveedorNombre} 👋
          </h1>
          <p className="mt-0.5 text-xs text-carbon/70">
            Te compartimos los datos de la petición para coordinar el servicio con el cliente:
          </p>
        </div>

        {/* Tarjeta Principal de la Petición */}
        <article className="overflow-hidden rounded-2xl border border-carbon/10 bg-white shadow-sm">
          {/* Banda de encabezado de trabajo */}
          <div className="border-b border-carbon/10 bg-slate-50/80 p-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900 uppercase tracking-wider">
              <span>🔧</span> Trabajo a Realizar
            </span>
            <h2 className="mt-2 font-titular text-lg font-bold text-verde-profundo leading-snug">
              {s.productoNombre}
              {s.cantidad ? ` · ${s.cantidad.toLocaleString("es-MX")} ${s.unidad}` : ""}
            </h2>
            {s.costoReferencia !== null && (
              <div className="mt-2.5 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-1.5 border border-emerald-500/20">
                <span className="text-xs text-emerald-800 font-medium">Pago convenido para ti:</span>
                <span className="font-mono text-sm font-bold text-emerald-900">{formatoPesos(s.costoReferencia)}</span>
              </div>
            )}
          </div>

          <div className="p-5 space-y-4 text-sm">
            {/* Ubicación y Maps */}
            {s.zona && (
              <div className="rounded-xl border border-carbon/10 bg-slate-50/50 p-3.5">
                <div className="text-[11px] font-bold uppercase tracking-wide text-carbon/50 flex items-center gap-1.5">
                  <span>📍</span> Ubicación del servicio
                </div>
                <p className="mt-1 font-semibold text-carbon/90 text-sm leading-relaxed">{s.zona}</p>
                {linkMaps && (
                  <a
                    href={linkMaps}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 border border-emerald-600/20 shadow-2xs hover:bg-emerald-50 transition"
                  >
                    <span>🗺️</span> Abrir ubicación en Google Maps ↗
                  </a>
                )}
              </div>
            )}

            {/* Detalles / Descripción */}
            {descripcionLimpia && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-carbon/50 mb-1">
                  📝 Detalle de la petición
                </div>
                <p className="whitespace-pre-line text-sm text-carbon/80 leading-relaxed bg-slate-50/30 rounded-xl p-3 border border-carbon/5">
                  {descripcionLimpia}
                </p>
              </div>
            )}

            {/* Fecha tentativa del cliente */}
            <div className="rounded-xl bg-amber-50/60 border border-amber-200/60 p-3.5 text-xs text-amber-900">
              <span className="font-bold">📅 Fecha deseada por el cliente: </span>
              {s.fechasSugeridas ? (
                <span>{s.fechasSugeridas}</span>
              ) : (
                <span>Fecha abierta (el cliente espera tus opciones de día para agendar).</span>
              )}
            </div>

            {/* Fotos si las hay */}
            {s.fotos.length > 0 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-carbon/50 mb-2">
                  📸 Fotos del sitio o problema
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {s.fotos.map((f, i) => (
                    <button
                      type="button"
                      key={f.url}
                      onClick={() => setFotoAmpliada(f.url)}
                      className="group relative aspect-square overflow-hidden rounded-xl border border-carbon/10 bg-slate-100 cursor-pointer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt={f.titulo || `Foto ${i + 1}`}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition text-white text-xs font-bold">
                        🔍 Ver
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </article>

        {/* Modal para ver foto ampliada */}
        {fotoAmpliada && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setFotoAmpliada(null)}
          >
            <div className="relative max-h-[90vh] max-w-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoAmpliada} alt="Foto ampliada" className="max-h-[85vh] w-auto rounded-2xl object-contain shadow-2xl" />
              <button
                type="button"
                onClick={() => setFotoAmpliada(null)}
                className="absolute top-2 right-2 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white hover:bg-black"
              >
                ✕ Cerrar
              </button>
            </div>
          </div>
        )}

        {/* SECCIÓN INTERACTIVA DE RESPUESTA */}
        <section className="mt-5">
          {/* Caso 1: Solicitud ya aceptada / respondida */}
          {s.estado === "aceptada" ? (
            <div className="rounded-2xl border-2 border-emerald-500 bg-white p-6 shadow-sm text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">
                ✅
              </div>
              <h3 className="mt-3 font-titular text-lg font-bold text-verde-profundo">
                ¡Horarios enviados con éxito!
              </h3>
              <p className="mt-1 text-xs text-carbon/70">
                Tu disponibilidad quedó registrada para esta orden:
              </p>

              <div className="mt-4 rounded-xl bg-emerald-50/70 p-4 text-left border border-emerald-500/20">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-900/70">
                  🗓️ Opciones que propusiste:
                </div>
                <ul className="mt-1.5 space-y-1 text-sm font-semibold text-emerald-950">
                  {s.fechasPropuestas.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-emerald-600">•</span> {f}
                    </li>
                  ))}
                </ul>
                {s.comentario && (
                  <p className="mt-2 text-xs text-emerald-800 border-t border-emerald-200/50 pt-2">
                    <b>Nota:</b> {s.comentario}
                  </p>
                )}
              </div>

              {s.fechaAcordada ? (
                <div className="mt-4 rounded-xl bg-verde-profundo p-3.5 text-white text-xs font-bold">
                  📅 Cita confirmada con el cliente: {s.fechaAcordada}
                </div>
              ) : (
                <p className="mt-4 text-xs text-carbon/60 leading-relaxed">
                  En <b>SAUCEDA</b> estamos confirmando la cita con el cliente y te enviaremos la confirmación definitiva por WhatsApp.
                </p>
              )}
            </div>
          ) : s.estado === "rechazada" ? (
            <div className="rounded-2xl border border-carbon/10 bg-white p-6 shadow-sm text-center">
              <p className="text-2xl">🤝</p>
              <h3 className="mt-2 font-titular text-base font-bold text-carbon/80">
                Respondiste que no tienes disponibilidad
              </h3>
              <p className="mt-1 text-xs text-carbon/60">
                Gracias por avisarnos a tiempo para no hacer esperar al cliente. Te avisaremos en el próximo servicio.
              </p>
            </div>
          ) : s.estado === "requiere_visita" ? (
            <div className="rounded-2xl border border-sky-300 bg-sky-50/60 p-6 shadow-sm text-center">
              <p className="text-2xl">🔎</p>
              <h3 className="mt-2 font-titular text-base font-bold text-sky-950">
                Solicitaste visita técnica previa
              </h3>
              <p className="mt-1 text-xs text-sky-800">
                El equipo revisará tu solicitud de inspección y coordinará con el cliente.
              </p>
            </div>
          ) : esPendiente ? (
            /* Caso 2: PENDIENTE DE RESPONDER */
            <div className="rounded-2xl border border-sauce/30 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 uppercase tracking-wider">
                  <span>⏱️</span> Respuesta requerida
                </span>
                <h3 className="mt-1.5 font-titular text-lg font-bold text-verde-profundo">
                  ¿Qué días y horarios tienes disponible?
                </h3>
                <p className="text-xs text-carbon/70">
                  Indícanos cuándo podrías acudir para coordinar la cita con el cliente:
                </p>
              </div>

              {/* Botón rápido si el cliente propuso fecha */}
              {s.fechasSugeridas && (
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => setFechas([s.fechasSugeridas, fechas[1], fechas[2]])}
                    className="w-full rounded-xl border-2 border-emerald-500/40 bg-emerald-50/70 p-3 text-left transition hover:bg-emerald-100/70 hover:border-emerald-600 cursor-pointer flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                        ⚡ Opción rápida de un clic
                      </div>
                      <div className="text-xs font-semibold text-emerald-950">
                        Puedo en la fecha que pide el cliente: <b>{s.fechasSugeridas}</b>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-2xs">
                      Elegir
                    </span>
                  </button>
                </div>
              )}

              {/* Atajos de un toque */}
              <div className="mb-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-carbon/50 mb-2">
                  Atajos rápidos (toca para agregar):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {atajos.map((a, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => aplicarAtajo(a.valor)}
                      className="rounded-lg border border-carbon/15 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-carbon/80 hover:bg-emerald-50 hover:border-emerald-500/40 hover:text-emerald-900 transition cursor-pointer"
                    >
                      + {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Formulario de opciones */}
              <form onSubmit={enviarAceptacion} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-carbon/80">
                    Opción 1 de fecha y horario <span className="text-rojo">*</span>
                  </label>
                  <input
                    value={fechas[0]}
                    onChange={(e) => setFechas([e.target.value, fechas[1], fechas[2]])}
                    placeholder="Ej. Mañana miércoles a las 10:00 am"
                    className={inputCls}
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-carbon/60">
                    Opción 2 alternativa (opcional si el cliente no puede en la primera)
                  </label>
                  <input
                    value={fechas[1]}
                    onChange={(e) => setFechas([fechas[0], e.target.value, fechas[2]])}
                    placeholder="Ej. Jueves por la tarde (15:00 a 18:00 h)"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-carbon/60">
                    Opción 3 alternativa (opcional)
                  </label>
                  <input
                    value={fechas[2]}
                    onChange={(e) => setFechas([fechas[0], fechas[1], e.target.value])}
                    placeholder="Ej. Sábado por la mañana (9:00 a 13:00 h)"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-carbon/60">
                    Comentario o nota para el equipo (opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder="Ej. Llevaré soplete y empaques / voy con ayudante..."
                    className={inputCls}
                  />
                </div>

                {mensaje && (
                  <div
                    className={`rounded-xl p-3 text-xs font-semibold ${
                      mensaje.tipo === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-rojo"
                    }`}
                  >
                    {mensaje.texto}
                  </div>
                )}

                {/* Botón principal grande y verde */}
                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full rounded-xl bg-verde-profundo py-3.5 px-4 font-titular text-sm font-bold text-white shadow-md hover:bg-sauce disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {enviando ? (
                    <span>Guardando tu respuesta…</span>
                  ) : (
                    <>
                      <span>✅ Sí, lo tomo · Enviar mis horarios a SAUCEDA</span>
                    </>
                  )}
                </button>
              </form>

              {/* Opciones secundarias discretas */}
              <div className="mt-5 border-t border-carbon/10 pt-4 text-center">
                <div className="text-xs text-carbon/50 mb-2">¿No puedes o requieres revisar en sitio primero?</div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModoSecundario((prev) => (prev === "visita" ? null : "visita"))}
                    className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs font-semibold text-carbon/70 hover:bg-slate-50 cursor-pointer"
                  >
                    🔎 Necesito ver en sitio primero
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoSecundario((prev) => (prev === "rechazo" ? null : "rechazo"))}
                    className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs font-semibold text-carbon/70 hover:bg-slate-50 cursor-pointer"
                  >
                    ❌ No puedo en estos días
                  </button>
                </div>

                {/* Subpanel para visita técnica */}
                {modoSecundario === "visita" && (
                  <div className="mt-3 rounded-xl bg-sky-50 p-3.5 text-left border border-sky-200">
                    <p className="text-xs font-bold text-sky-950 mb-1">
                      ¿Qué necesitas revisar en el sitio antes de cotizar o agendar?
                    </p>
                    <textarea
                      rows={2}
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      placeholder="Explica qué condiciones necesitas revisar en persona..."
                      className={inputCls}
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setModoSecundario(null)}
                        className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs text-carbon/60"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => enviarRespuestaAlternativa("requiere_visita")}
                        disabled={enviando}
                        className="rounded-lg bg-sky-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-900 disabled:opacity-50"
                      >
                        Solicitar visita técnica
                      </button>
                    </div>
                  </div>
                )}

                {/* Subpanel para rechazo */}
                {modoSecundario === "rechazo" && (
                  <div className="mt-3 rounded-xl bg-slate-100 p-3.5 text-left border border-carbon/10">
                    <p className="text-xs font-bold text-carbon/80 mb-1">
                      ¿Seguro que no puedes tomar este servicio?
                    </p>
                    <p className="text-xs text-carbon/60 mb-2">
                      Lo asignaremos a otro proveedor para no demorar al cliente.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setModoSecundario(null)}
                        className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs text-carbon/60"
                      >
                        Volver
                      </button>
                      <button
                        type="button"
                        onClick={() => enviarRespuestaAlternativa("rechazada")}
                        disabled={enviando}
                        className="rounded-lg bg-carbon/80 px-3 py-1.5 text-xs font-bold text-white hover:bg-carbon disabled:opacity-50"
                      >
                        Confirmar que no puedo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Vencida o cancelada */
            <div className="rounded-2xl border border-carbon/10 bg-white p-6 shadow-sm text-center">
              <p className="text-2xl">⌛</p>
              <h3 className="mt-2 font-titular text-base font-bold text-carbon/80">
                Petición no disponible
              </h3>
              <p className="mt-1 text-xs text-carbon/60">
                El plazo para responder venció o el servicio ya fue asignado.
              </p>
            </div>
          )}
        </section>

        {/* Pie de página discreto */}
        <footer className="mt-8 text-center text-[11px] text-carbon/40">
          SAUCEDA Construcción y Mantenimiento · León, Guanajuato · Soporte y dudas por WhatsApp
        </footer>
      </div>
    </div>
  );
}
