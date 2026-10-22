"use client";

import { useEffect, useRef, useState } from "react";
import {
  prepararCoordinacionServicio,
  enviarCoordinacionOficial,
  redactarMensajeProveedorSofia,
  registrarAceptacionProveedor,
  registrarCoordinacionProveedor,
  type DatosCoordinacionServicio,
  type TipoCoordinacionProveedor,
} from "@/app/actions/coordinacion-servicio-proveedor";
import { ModalProgramarServicio } from "@/components/conversaciones/ModalProgramarServicio";

/**
 * Coordinar un servicio o instalación con un proveedor (p. ej. el plomero): Sofía redacta
 * el WhatsApp con el trabajo, la fecha que pide el cliente y la dirección a confirmar.
 * El asesor lo revisa y lo manda desde su WhatsApp (wa.me); queda en la bitácora.
 */
export function ModalCoordinarServicioProveedor({ telefono, onCerrar }: { telefono: string; onCerrar: () => void }) {
  const [datos, setDatos] = useState<DatosCoordinacionServicio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoCoordinacionProveedor>("servicio");
  const [proveedorId, setProveedorId] = useState("");
  const [fecha, setFecha] = useState("");
  const [horario, setHorario] = useState("");
  const [direccion, setDireccion] = useState("");
  const [linkMaps, setLinkMaps] = useState("");
  const [trabajo, setTrabajo] = useState("");
  const [costo, setCosto] = useState("");
  /** Mientras el asesor no escriba el costo, se toma el de lo cotizado para el proveedor elegido. */
  const [costoEditado, setCostoEditado] = useState(false);
  const [indicacion, setIndicacion] = useState("");
  const [texto, setTexto] = useState("");
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [orden, setOrden] = useState<string | null>(null);
  const [programar, setProgramar] = useState<{ solicitudId: string; opcion: string } | null>(null);
  const [aceptando, setAceptando] = useState(false);
  const versionRef = useRef(0);

  useEffect(() => {
    prepararCoordinacionServicio(telefono).then((r) => {
      if (!r.ok || !r.datos) return setError(r.error || "No se pudieron cargar los datos.");
      setDatos(r.datos);
      setProveedorId(r.datos.proveedorSugeridoId || r.datos.proveedores[0]?.id || "");
      setDireccion(r.datos.direccion);
      setLinkMaps(r.datos.linkMaps);
      setTrabajo(r.datos.trabajo);
    });
  }, [telefono]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const proveedor = datos?.proveedores.find((p) => p.id === proveedorId) || null;
  const costoSugerido = datos?.costosSugeridos[proveedorId] ?? null;

  useEffect(() => {
    if (!costoEditado) setCosto(costoSugerido ? String(costoSugerido) : "");
  }, [costoSugerido, costoEditado]);
  // Si no hay link capturado, se arma uno de Google Maps con la dirección.
  const linkFinal = linkMaps.trim() || linkMapsDeDireccion(direccion);
  const costoNum = Number(costo.replace(/[^\d.]/g, "")) || null;

  // Primera versión en cuanto hay datos: Sofía saca la fecha y el trabajo de la conversación.
  const primeraRef = useRef(false);
  useEffect(() => {
    if (datos && proveedorId && !primeraRef.current) {
      primeraRef.current = true;
      void redactar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, proveedorId]);

  async function redactar() {
    if (!datos || !proveedorId) return;
    const version = ++versionRef.current;
    setGenerando(true);
    setError(null);
    try {
      const r = await redactarMensajeProveedorSofia({
        telefono,
        proveedorId,
        tipo,
        clienteNombre: datos.clienteNombre,
        direccion,
        linkMaps: linkFinal,
        fecha,
        horario,
        trabajo,
        costo: costoNum,
        indicacion,
      });
      if (version !== versionRef.current) return;
      if (r.ok && r.texto) setTexto(r.texto);
      else setError(r.error || "Sofía no pudo redactar el mensaje.");
    } finally {
      if (version === versionRef.current) setGenerando(false);
    }
  }

  async function registrar() {
    const r = await registrarCoordinacionProveedor({
      telefono,
      proveedorId,
      tipo,
      direccion,
      linkMaps: linkFinal,
      fecha,
      horario,
      costo: costoNum,
      mensaje: texto,
    });
    if (!r.ok) setError(r.error || "No se pudo registrar en la bitácora.");
    if (r.ok)
      setOrden(
        [
          r.ordenFolio ? `${r.ordenCreada ? "Se creó la orden de trabajo" : "Se actualizó la orden de trabajo"} ${r.ordenFolio} con el proveedor y su costo.` : "",
          r.solicitudFolio ? `Solicitud ${r.solicitudFolio}: cuando acepte y proponga horarios en su link, aparecerá arriba del chat para ofrecérselos al cliente.` : "",
        ]
          .filter(Boolean)
          .join(" ") || null
      );
    return r.ok;
  }

  const [enviandoOficial, setEnviandoOficial] = useState(false);
  /** Por la línea oficial: queda en Conversaciones → Proveedores con sus palomitas. */
  async function enviarOficial() {
    if (!proveedor?.whatsapp || !texto.trim()) return;
    setEnviandoOficial(true);
    setError(null);
    try {
      const r = await enviarCoordinacionOficial({
        telefono,
        proveedorId,
        tipo,
        direccion,
        linkMaps: linkFinal,
        fecha,
        horario,
        costo: costoNum,
        mensaje: texto,
        trabajo,
      });
      if (!r.ok) return setError(r.error || "No se pudo enviar.");
      setAviso(
        r.via === "plantilla"
          ? `${proveedor.nombre} no ha escrito en 24 h: se le mandó el aviso y tu mensaje completo sale en cuanto conteste. Síguelo en Conversaciones → Proveedores.`
          : `Mensaje enviado a ${proveedor.nombre} por WhatsApp. Síguelo en Conversaciones → Proveedores.`
      );
      if (r.solicitudFolio)
        setOrden(`Solicitud ${r.solicitudFolio}: cuando acepte y proponga horarios en su link, aparecerá arriba del chat para ofrecérselos al cliente.`);
    } finally {
      setEnviandoOficial(false);
    }
  }

  async function abrirWhatsApp() {
    if (!proveedor?.whatsapp || !texto.trim()) return;
    window.open(`https://wa.me/${proveedor.whatsapp}?text=${encodeURIComponent(texto.trim())}`, "_blank", "noopener");
    if (await registrar()) setAviso(`Mensaje abierto en WhatsApp para ${proveedor.nombre} y registrado en la bitácora del cliente.`);
  }

  /** El proveedor ya dijo que sí por WhatsApp: se registra y se pasa directo a programar. */
  async function yaAcepto() {
    if (!proveedorId || !fecha) return setError("Indica el proveedor y la fecha que acordaron.");
    setAceptando(true);
    setError(null);
    try {
      const r = await registrarAceptacionProveedor({
        telefono,
        proveedorId,
        tipo,
        direccion,
        linkMaps: linkFinal,
        fecha,
        horario,
        costo: costoNum,
        mensaje: texto,
      });
      if (!r.ok || !r.solicitudId || !r.opcion) return setError(r.error || "No se pudo registrar la aceptación.");
      setProgramar({ solicitudId: r.solicitudId, opcion: r.opcion });
    } finally {
      setAceptando(false);
    }
  }

  async function copiar() {
    if (!texto.trim()) return;
    await navigator.clipboard.writeText(texto.trim());
    if (await registrar()) setAviso("Mensaje copiado y registrado en la bitácora del cliente.");
  }

  const campo = "w-full rounded border border-carbon/15 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-carbon/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onCerrar}
    >
      <div
        className="w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-carbon/10 flex flex-col max-h-[92vh] overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-carbon/10 flex items-center justify-between bg-sky-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl p-1.5 bg-sky-100 rounded-lg shrink-0">🔧</span>
            <div>
              <h3 className="font-titular text-sm sm:text-base font-bold text-sky-900">Coordinar servicio con proveedor</h3>
              <p className="text-[11px] text-carbon/50">Sofía redacta el WhatsApp para el proveedor; tú lo revisas y lo mandas.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="text-carbon/40 hover:text-carbon p-1.5 rounded-lg hover:bg-carbon/5 transition text-lg leading-none cursor-pointer"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>

        {!datos ? (
          <div className="p-6 text-center text-sm text-carbon/60">{error || "Cargando…"}</div>
        ) : (
          <>
            <div className="p-4 space-y-3 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[11px] font-bold text-carbon/70 mb-0.5">Tipo</span>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCoordinacionProveedor)} className={campo}>
                    <option value="servicio">Servicio</option>
                    <option value="instalacion">Instalación</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-bold text-carbon/70 mb-0.5">Proveedor</span>
                  <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={campo}>
                    {datos.proveedores.length === 0 && <option value="">No hay proveedores activos</option>}
                    {(() => {
                      const opcion = (p: (typeof datos.proveedores)[number]) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                          {p.categoria ? ` · ${p.categoria}` : ""}
                          {p.whatsapp ? "" : " (sin WhatsApp)"}
                        </option>
                      );
                      const ligados = datos.relacionadosIds
                        .map((id) => datos.proveedores.find((p) => p.id === id))
                        .filter((p): p is (typeof datos.proveedores)[number] => Boolean(p));
                      if (!ligados.length) return datos.proveedores.map(opcion);
                      const otros = datos.proveedores.filter((p) => !datos.relacionadosIds.includes(p.id));
                      return (
                        <>
                          <optgroup label="Del producto cotizado">{ligados.map(opcion)}</optgroup>
                          {otros.length > 0 && <optgroup label="Otros proveedores">{otros.map(opcion)}</optgroup>}
                        </>
                      );
                    })()}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-bold text-carbon/70 mb-0.5">Fecha que pide el cliente</span>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-bold text-carbon/70 mb-0.5">Horario</span>
                  <input
                    type="text"
                    value={horario}
                    onChange={(e) => setHorario(e.target.value)}
                    placeholder="Ej. 10:00 am, por la tarde…"
                    className={campo}
                  />
                </label>
              </div>
              <label className="block">
                <span className="block text-[11px] font-bold text-carbon/70 mb-0.5">Costo que cobra el proveedor</span>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-carbon/50">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={costo}
                    onChange={(e) => {
                      setCosto(e.target.value);
                      setCostoEditado(true);
                    }}
                    placeholder="Ej. 850 — va en el mensaje y en la orden de trabajo"
                    className={`${campo} pl-5`}
                  />
                </div>
                {costoSugerido !== null && datos.origenCosto && (
                  <span className="mt-0.5 block text-[10.5px] text-carbon/50">
                    {costoEditado && Number(costo) !== costoSugerido ? (
                      <button
                        type="button"
                        onClick={() => setCostoEditado(false)}
                        className="text-sky-700 underline cursor-pointer"
                      >
                        Usar el del catálogo: ${costoSugerido.toLocaleString("es-MX")}
                      </button>
                    ) : (
                      <>Del catálogo del proveedor, según {datos.origenCosto}</>
                    )}
                  </span>
                )}
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold text-carbon/70 mb-0.5">Trabajo</span>
                <input
                  type="text"
                  value={trabajo}
                  onChange={(e) => setTrabajo(e.target.value)}
                  placeholder="Si lo dejas vacío, Sofía lo saca de la conversación"
                  className={campo}
                />
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold text-carbon/70 mb-0.5">
                  Dirección {datos.clienteNombre ? `de ${datos.clienteNombre}` : ""} (se guarda en el expediente)
                </span>
                <textarea value={direccion} onChange={(e) => setDireccion(e.target.value)} rows={2} className={`${campo} resize-y`} />
              </label>
              <div>
                <input
                  type="url"
                  value={linkMaps}
                  onChange={(e) => setLinkMaps(e.target.value)}
                  placeholder="Link de Google Maps (si lo dejas vacío se arma con la dirección)"
                  className={campo}
                />
                {linkFinal && (
                  <a href={linkFinal} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[11px] font-semibold text-sky-700 underline">
                    📍 {linkMaps.trim() ? "Ver en Google Maps" : "Ver en Google Maps (generado con la dirección)"}
                  </a>
                )}
              </div>

              <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-2.5 space-y-2">
                <label className="block text-[11px] font-bold text-violet-900">Indicación para Sofía (opcional)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={indicacion}
                    onChange={(e) => setIndicacion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !generando && void redactar()}
                    placeholder="Ej. que lleve material para cambiar la llave de paso"
                    className="flex-1 min-w-0 rounded border border-carbon/15 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                  />
                  <button
                    type="button"
                    onClick={() => void redactar()}
                    disabled={generando || !proveedorId}
                    className="shrink-0 rounded bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {texto ? "↻ Otra versión" : "✨ Redactar con Sofía"}
                  </button>
                </div>
              </div>

              <div className="relative">
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  disabled={generando}
                  rows={8}
                  placeholder={generando ? "" : "Aquí aparece el mensaje de Sofía; puedes editarlo."}
                  className="w-full rounded-lg border border-carbon/15 p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:bg-slate-50 resize-y"
                />
                {generando && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-violet-800 font-semibold">
                    ⏳ Sofía está leyendo la conversación…
                  </div>
                )}
              </div>

              {error && <p className="text-[11px] rounded bg-rojo/10 text-rojo px-2 py-1.5">{error}</p>}
              {aviso && (
                <p className="text-[11px] rounded bg-emerald-50 border border-emerald-200 text-emerald-900 px-2 py-1.5">
                  {aviso}
                  {orden && <span className="block font-semibold">{orden}</span>}
                </p>
              )}
            </div>

            <div className="px-4 py-3 border-t border-carbon/10 flex flex-wrap items-center justify-end gap-2 bg-crema/20 shrink-0">
              <button
                type="button"
                onClick={() => void yaAcepto()}
                disabled={aceptando || generando || !proveedorId || !fecha}
                title={!fecha ? "Pon la fecha (y el horario) que acordaron" : "El proveedor ya aceptó por WhatsApp: registrar y programar el servicio"}
                className="mr-auto rounded border border-emerald-600 bg-white text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                {aceptando ? "Registrando…" : "✅ Ya aceptó · programar"}
              </button>
              <button
                type="button"
                onClick={() => void copiar()}
                disabled={generando || !texto.trim()}
                className="rounded border border-carbon/20 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                Copiar
              </button>
              <button
                type="button"
                onClick={() => void abrirWhatsApp()}
                disabled={generando || !texto.trim() || !proveedor?.whatsapp}
                title="Abre tu WhatsApp con el mensaje escrito (no queda en Conversaciones → Proveedores)"
                className="rounded border border-carbon/20 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                Desde mi WhatsApp
              </button>
              <button
                type="button"
                onClick={() => void enviarOficial()}
                disabled={enviandoOficial || generando || !texto.trim() || !proveedor?.whatsapp}
                title={proveedor && !proveedor.whatsapp ? "El proveedor no tiene WhatsApp ni teléfono registrado" : "Se manda desde la línea oficial y se ve en Conversaciones → Proveedores"}
                className="rounded bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                {enviandoOficial ? "Enviando…" : `Enviar por WhatsApp${proveedor ? ` · ${proveedor.nombre}` : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
      {programar && (
        <ModalProgramarServicio
          solicitudId={programar.solicitudId}
          opcion={programar.opcion}
          telefono={telefono}
          fechaInicial={fecha}
          horarioInicial={horario}
          onCerrar={() => {
            setProgramar(null);
            onCerrar();
          }}
          onProgramado={() => {}}
        />
      )}
    </div>
  );
}

/** Link de búsqueda de Google Maps para la dirección; si no menciona ciudad, se asume León. */
function linkMapsDeDireccion(direccion: string): string {
  const d = direccion.trim().replace(/\s+/g, " ");
  if (!d) return "";
  const conCiudad = /le[oó]n|gto|guanajuato|silao|irapuato|celaya|salamanca|lagos|san francisco del rinc[oó]n|purísima/i.test(d) ? d : `${d}, León, Gto.`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(conCiudad)}`;
}
