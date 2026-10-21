"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatoPesos } from "@/lib/formato";
import {
  cancelarSolicitudProveedor,
  confirmarSolicitudProveedor,
  crearSolicitudProveedor,
  listarCandidatosSolicitud,
  listarSolicitudesCotizacion,
  prepararSolicitudDesdeCotizacion,
  subirFotoSolicitud,
  type CandidatoSolicitud,
  type EstadoEnvio,
  type SolicitudProveedor,
} from "@/app/actions/solicitudes-proveedor";

const ETIQUETA_ESTADO: Record<SolicitudProveedor["estado"], { texto: string; clase: string }> = {
  abierta: { texto: "Esperando proveedor", clase: "bg-sky-100 text-sky-800" },
  asignada: { texto: "Aceptada · confirmar con cliente", clase: "bg-amber-100 text-amber-800" },
  confirmada: { texto: "Confirmada", clase: "bg-emerald-100 text-emerald-800" },
  sin_proveedor: { texto: "Nadie la aceptó", clase: "bg-rose-100 text-rose-800" },
  cancelada: { texto: "Cancelada", clase: "bg-carbon/10 text-carbon/60" },
};

const ETIQUETA_ENVIO: Record<EstadoEnvio, string> = {
  en_espera: "⏳ En turno",
  enviada: "📨 Enviada",
  vista: "👀 Vista",
  aceptada: "✅ Aceptó",
  rechazada: "✖ No puede",
  requiere_visita: "🔎 Pide visita",
  vencida: "⌛ No respondió",
  cancelada: "— Retirada",
};

function fechaHora(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Solicitudes de servicio a proveedores para una cotización: se le pregunta al
 * proveedor si puede tomarlo (cascada o urgente) antes de coordinar fecha con el cliente.
 */
export function PanelSolicitudesProveedor({ cotizacionId }: { cotizacionId: string }) {
  const [solicitudes, setSolicitudes] = useState<SolicitudProveedor[] | null>(null);
  const [modal, setModal] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function cargar() {
    setSolicitudes(await listarSolicitudesCotizacion(cotizacionId).catch(() => []));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotizacionId]);

  async function confirmar(s: SolicitudProveedor, fecha: string) {
    const res = await confirmarSolicitudProveedor(s.id, fecha);
    setMensaje(res.ok ? res.mensaje || "Confirmada." : res.error || "No se pudo confirmar.");
    await cargar();
  }

  async function cancelar(s: SolicitudProveedor) {
    if (!confirm(`¿Cancelar la solicitud ${s.folio}? Se retira a los proveedores que no han respondido.`)) return;
    const res = await cancelarSolicitudProveedor(s.id);
    if (!res.ok) alert(res.error || "No se pudo cancelar.");
    await cargar();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-carbon/10 bg-white p-5 font-cuerpo text-xs shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-titular text-base font-bold text-verde-profundo">Solicitudes a proveedores</h3>
          <p className="text-carbon/60">
            Pregunta a tus proveedores si pueden tomar el servicio antes de comprometer fecha con el cliente. Ellos ven solo
            los datos del servicio, nunca los del cliente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal(true)}
          className="rounded-lg bg-sauce px-3.5 py-1.5 font-semibold text-white hover:bg-verde-profundo"
        >
          + Nueva solicitud
        </button>
      </div>

      {mensaje && <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-800">{mensaje}</div>}

      {solicitudes === null ? (
        <p className="text-carbon/50">Cargando…</p>
      ) : solicitudes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-carbon/20 p-6 text-center text-carbon/50">
          Aún no hay solicitudes para esta cotización.
        </p>
      ) : (
        <div className="space-y-3">
          {solicitudes.map((s) => (
            <TarjetaSolicitud key={s.id} s={s} onConfirmar={confirmar} onCancelar={cancelar} />
          ))}
        </div>
      )}

      {modal && (
        <ModalNuevaSolicitud
          cotizacionId={cotizacionId}
          onCerrar={() => setModal(false)}
          onCreada={async () => {
            setModal(false);
            setMensaje("Solicitud enviada.");
            await cargar();
          }}
        />
      )}
    </div>
  );
}

export function TarjetaSolicitud({
  s,
  onConfirmar,
  onCancelar,
  onOfrecer,
  onProgramar,
}: {
  s: SolicitudProveedor;
  onConfirmar: (s: SolicitudProveedor, fecha: string) => void;
  /** Si se da, el horario elegido abre la programación del servicio en vez de confirmarlo directo. */
  onProgramar?: (s: SolicitudProveedor, fecha: string) => void;
  onCancelar: (s: SolicitudProveedor) => void;
  /** Si se da, aparece "Ofrecer al cliente" (manda las opciones por su conversación). */
  onOfrecer?: (s: SolicitudProveedor) => void;
}) {
  const aceptado = s.envios.find((e) => e.estado === "aceptada");
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const etiqueta = ETIQUETA_ESTADO[s.estado];

  return (
    <div className="rounded-xl border border-carbon/10 p-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-bold text-sauce">{s.folio}</span>
          <span className="font-semibold text-carbon">{s.productoNombre}</span>
          {s.cantidad ? (
            <span className="text-carbon/60">
              {s.cantidad.toLocaleString("es-MX")} {s.unidad}
            </span>
          ) : null}
          <span className="text-carbon/50">· {s.zona || "sin zona"}</span>
          {s.modo === "urgente" && <span className="rounded bg-rojo/10 px-1.5 font-bold text-rojo">URGENTE</span>}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${etiqueta.clase}`}>{etiqueta.texto}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {s.envios.map((e) => (
          <span
            key={e.id}
            className="rounded-lg border border-carbon/10 bg-slate-50 px-2 py-1"
            title={[
              e.enviadaAt ? `Enviada ${fechaHora(e.enviadaAt)}` : "",
              e.fechaLimite && (e.estado === "enviada" || e.estado === "vista") ? `Responde antes de ${fechaHora(e.fechaLimite)}` : "",
              e.notificado ? "Avisado (Telegram o WhatsApp)" : "",
              e.comentario,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <b>{e.proveedorNombre}</b> {ETIQUETA_ENVIO[e.estado]}
            {e.costoReferencia !== null && <span className="text-carbon/50"> · {formatoPesos(e.costoReferencia)}</span>}
            {e.estado === "requiere_visita" && e.comentario && <span className="text-carbon/60"> · “{e.comentario}”</span>}
          </span>
        ))}
      </div>

      {s.estado === "asignada" && aceptado && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <b>{aceptado.proveedorNombre}</b> lo toma
              {s.costoAcordado !== null && <> por {formatoPesos(s.costoAcordado)}</>}
              {aceptado.porTelegram && <span className="text-carbon/50"> · respondió por Telegram</span>}. Opciones:
            </div>
            {onOfrecer && (
              <button
                type="button"
                onClick={() => onOfrecer(s)}
                className="rounded-lg border border-sauce/40 bg-white px-2.5 py-1 font-semibold text-sauce hover:bg-sauce hover:text-white"
                title="Manda estas opciones al cliente por WhatsApp para que elija"
              >
                {s.opcionesOfrecidasAt ? "📲 Reenviar al cliente" : "📲 Ofrecer al cliente"}
              </button>
            )}
          </div>
          {s.opcionesOfrecidasAt && (
            <p className="text-[11px] text-carbon/55">Ofrecidas al cliente el {fechaHora(s.opcionesOfrecidasAt)}. Cuando elija, confírmala:</p>
          )}
          <div className="space-y-1">
            {aceptado.fechasPropuestas.map((f, idx) => (
              <div key={f} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-2.5 py-1.5">
                <span>
                  <b className="text-carbon/50">{idx + 1}.</b> {f}
                </span>
                <button
                  type="button"
                  disabled={confirmando !== null}
                  onClick={async () => {
                    if (onProgramar) return onProgramar(s, f);
                    if (!confirm(`¿Confirmar "${f}"? Se avisa al proveedor y queda la orden de trabajo.`)) return;
                    setConfirmando(f);
                    try {
                      await onConfirmar(s, f);
                    } finally {
                      setConfirmando(null);
                    }
                  }}
                  className="rounded-md bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {confirmando === f ? "Confirmando…" : onProgramar ? "📅 El cliente eligió esta: programar" : "✓ El cliente eligió esta"}
                </button>
              </div>
            ))}
          </div>
          {aceptado.comentario && <p className="text-carbon/60">Comentario: {aceptado.comentario}</p>}
        </div>
      )}

      {s.estado === "confirmada" && (
        <p className="text-emerald-800">
          Confirmada con <b>{s.proveedorAsignadoNombre}</b> para <b>{s.fechaAcordada}</b>
          {s.costoAcordado !== null && <> · costo {formatoPesos(s.costoAcordado)}</>}
          {s.ordenTrabajoFolio && (
            <>
              {" "}· orden de trabajo <b className="font-mono">{s.ordenTrabajoFolio}</b>
            </>
          )}
          .
        </p>
      )}

      {(s.estado === "abierta" || s.estado === "asignada" || s.estado === "sin_proveedor") && (
        <div className="flex justify-end">
          <button type="button" onClick={() => onCancelar(s)} className="text-rojo hover:underline">
            Cancelar solicitud
          </button>
        </div>
      )}
    </div>
  );
}

export function ModalNuevaSolicitud({
  cotizacionId,
  onCerrar,
  onCreada,
}: {
  cotizacionId: string;
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const [montado, setMontado] = useState(false);
  const [conceptos, setConceptos] = useState<
    { productoId: string; productoNombre: string; descripcion: string; cantidad: number; unidad: string }[]
  >([]);
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [zona, setZona] = useState("");
  const [fechasSugeridas, setFechasSugeridas] = useState("");
  const [fotos, setFotos] = useState<{ url: string; titulo: string }[]>([]);
  const [modo, setModo] = useState<"cascada" | "urgente">("cascada");
  const [horas, setHoras] = useState("4");
  const [candidatos, setCandidatos] = useState<CandidatoSolicitud[] | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMontado(true);
    prepararSolicitudDesdeCotizacion(cotizacionId)
      .then((d) => {
        setConceptos(d.conceptos);
        setZona(d.zona);
        if (d.conceptos[0]) {
          setProductoId(d.conceptos[0].productoId);
          setCantidad(d.conceptos[0].cantidad ? String(d.conceptos[0].cantidad) : "");
          setDescripcion(d.conceptos[0].descripcion);
        }
      })
      .catch(() => setConceptos([]));
  }, [cotizacionId]);

  useEffect(() => {
    if (!productoId) return;
    setCandidatos(null);
    listarCandidatosSolicitud(productoId, cantidad ? Number(cantidad) : null)
      .then((c) => {
        setCandidatos(c);
        setSeleccion(c.map((x) => x.proveedorId));
      })
      .catch(() => setCandidatos([]));
  }, [productoId, cantidad]);

  useEffect(() => {
    setHoras(modo === "urgente" ? "1" : "4");
  }, [modo]);

  function mover(id: string, delta: number) {
    setSeleccion((prev) => {
      const i = prev.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const copia = [...prev];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  async function subir(archivos: FileList | null) {
    if (!archivos) return;
    setSubiendo(true);
    for (const a of Array.from(archivos).slice(0, 15 - fotos.length)) {
      const fd = new FormData();
      fd.append("archivo", a);
      const r = await subirFotoSolicitud(fd);
      if (r.ok && r.url) setFotos((p) => [...p, { url: r.url!, titulo: "" }]);
      else setError(r.error || "No se pudo subir una foto.");
    }
    setSubiendo(false);
  }

  async function enviar() {
    setError("");
    setEnviando(true);
    const res = await crearSolicitudProveedor({
      cotizacionId,
      productoId,
      descripcion,
      cantidad: cantidad ? Number(cantidad) : null,
      zona,
      fotos,
      fechasSugeridas,
      modo,
      horasRespuesta: Number(horas) || 4,
      proveedorIds: seleccion,
    });
    setEnviando(false);
    if (!res.ok) return setError(res.error || "No se pudo enviar.");
    onCreada();
  }

  if (!montado) return null;
  const elegidos = seleccion.map((id) => candidatos?.find((c) => c.proveedorId === id)).filter(Boolean) as CandidatoSolicitud[];
  const noElegidos = (candidatos || []).filter((c) => !seleccion.includes(c.proveedorId));
  const campo = "w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 outline-none focus:border-sauce";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 font-cuerpo text-xs">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-carbon/10 bg-slate-50 px-5 py-3">
          <div>
            <h3 className="font-titular text-base font-bold text-verde-profundo">Nueva solicitud a proveedores</h3>
            <p className="text-carbon/60">No incluyas nombre, teléfono ni dirección exacta del cliente.</p>
          </div>
          <button type="button" onClick={onCerrar} className="text-lg text-carbon/40 hover:text-carbon">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && <div className="rounded-lg bg-red-50 p-2.5 text-rojo">{error}</div>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="sm:col-span-2">
              <span className="mb-1 block font-semibold">Servicio *</span>
              <select
                value={productoId}
                onChange={(e) => {
                  const c = conceptos.find((x) => x.productoId === e.target.value);
                  setProductoId(e.target.value);
                  if (c) {
                    setCantidad(c.cantidad ? String(c.cantidad) : "");
                    setDescripcion(c.descripcion);
                  }
                }}
                className={campo}
              >
                {conceptos.length === 0 && <option value="">La cotización no tiene productos del catálogo</option>}
                {conceptos.map((c) => (
                  <option key={c.productoId} value={c.productoId}>
                    {c.productoNombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block font-semibold">Cantidad</span>
              <input type="number" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={campo} />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block font-semibold">Qué hay que hacer</span>
            <textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={campo} />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1 block font-semibold">Zona / colonia</span>
              <input value={zona} onChange={(e) => setZona(e.target.value)} className={campo} placeholder="Solo colonia, sin calle ni número" />
            </label>
            <label>
              <span className="mb-1 block font-semibold">Fechas que le convienen al cliente</span>
              <input
                value={fechasSugeridas}
                onChange={(e) => setFechasSugeridas(e.target.value)}
                className={campo}
                placeholder="Ej. esta semana por las tardes"
              />
            </label>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold">Fotos o capturas del problema</span>
              <label className="cursor-pointer font-semibold text-sauce hover:underline">
                {subiendo ? "Subiendo…" : "+ Agregar fotos"}
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => subir(e.target.files)} />
              </label>
            </div>
            {fotos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {fotos.map((f, i) => (
                  <div key={f.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={`Foto ${i + 1}`} className="h-16 w-16 rounded-lg border object-cover" />
                    <button
                      type="button"
                      onClick={() => setFotos((p) => p.filter((_, j) => j !== i))}
                      className="absolute -right-1 -top-1 rounded-full bg-black/70 px-1 text-[10px] text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-carbon/10 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={modo === "cascada"} onChange={() => setModo("cascada")} />
                <b>Uno por uno</b> <span className="text-carbon/50">(en el orden de la lista)</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={modo === "urgente"} onChange={() => setModo("urgente")} />
                <b className="text-rojo">Urgente</b> <span className="text-carbon/50">(a todos; gana el primero)</span>
              </label>
              <label className="flex items-center gap-1.5">
                Plazo para responder
                <input
                  type="number"
                  min="0.25"
                  step="0.5"
                  value={horas}
                  onChange={(e) => setHoras(e.target.value)}
                  className="w-16 rounded border border-carbon/20 px-1.5 py-1 text-right"
                />
                h {modo === "cascada" && "por proveedor"}
              </label>
            </div>

            {candidatos === null ? (
              <p className="text-carbon/50">Buscando proveedores…</p>
            ) : candidatos.length === 0 ? (
              <p className="text-rojo">
                Ningún proveedor tiene registrado este producto. Agrégalo en Proveedores → Productos que ofrece.
              </p>
            ) : (
              <div className="space-y-1.5">
                {elegidos.map((c, i) => (
                  <div key={c.proveedorId} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <span className="w-5 font-mono text-carbon/50">{modo === "cascada" ? i + 1 : "•"}</span>
                    <span className="flex-1">
                      <b>{c.proveedorNombre}</b> {c.preferido && "⭐"}
                      <span className="text-carbon/50">
                        {" "}
                        · {c.costoReferencia !== null ? formatoPesos(c.costoReferencia) : "sin costo"}
                        {c.zonasCobertura && ` · ${c.zonasCobertura}`}
                        {!c.tieneWhatsapp && " · sin WhatsApp (aviso por Telegram)"}
                      </span>
                    </span>
                    {modo === "cascada" && (
                      <>
                        <button type="button" onClick={() => mover(c.proveedorId, -1)} className="px-1 text-carbon/50">
                          ▲
                        </button>
                        <button type="button" onClick={() => mover(c.proveedorId, 1)} className="px-1 text-carbon/50">
                          ▼
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setSeleccion((p) => p.filter((x) => x !== c.proveedorId))}
                      className="px-1 text-rojo"
                      title="Quitar de esta solicitud"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {noElegidos.map((c) => (
                  <button
                    key={c.proveedorId}
                    type="button"
                    onClick={() => setSeleccion((p) => [...p, c.proveedorId])}
                    className="block text-sauce hover:underline"
                  >
                    + {c.proveedorNombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-carbon/10 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-carbon/20 px-4 py-2 font-semibold text-carbon/70">
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={enviando || subiendo || !productoId || seleccion.length === 0}
            className="rounded-lg bg-sauce px-4 py-2 font-semibold text-white hover:bg-verde-profundo disabled:opacity-50"
          >
            {enviando ? "Enviando…" : modo === "urgente" ? `Enviar a ${seleccion.length} proveedor(es)` : "Enviar al primero"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
