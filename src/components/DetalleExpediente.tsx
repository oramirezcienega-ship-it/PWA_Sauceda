"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExpedientes } from "@/context/expedientes-context";
import { etapaAnterior, etapaSiguiente, ETAPAS_POR_ID, obtenerEtapasPorNegocio } from "@/lib/etapas";
import { EtapaBadge } from "./EtapaBadge";
import { AvanceTraspaso } from "./AvanceTraspaso";
import { Actividades } from "./Actividades";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { BotonLlamar } from "./BotonLlamar";
import { AsesorSelector } from "./AsesorSelector";
import { OperadorSelector } from "./OperadorSelector";
import { labelTipoNegocio, type Cotizacion, type CalificacionProspecto } from "@/lib/types";
import { CalificacionProspectoBadge } from "./CalificacionProspectoBadge";
import { cambiarCalificacionExpediente } from "@/app/actions/expedientes";
import { ConversacionHistorica } from "./ConversacionHistorica";
import { LlamadasHistoricas } from "./LlamadasHistoricas";
import { TimelineSecuencia } from "./TimelineSecuencia";
import { listarSecuencias, enrolarLead } from "@/app/actions/secuencias";
import { WidgetBpmTareas } from "./WidgetBpmTareas";
import { obtenerCotizacionesDeExpediente } from "@/app/actions/cotizaciones";
import { LinkCitaWidget } from "./LinkCitaWidget";
import { programarInstalacionExpediente, programarLlamadaExpediente } from "@/app/actions/agenda";
import { PromocionVentaWidget } from "./PromocionVentaWidget";
import { WidgetAgendaCitas } from "./WidgetAgendaCitas";
import { listarPerfilesActivos } from "@/app/actions/usuarios";

/**
 * Vista de detalle de un expediente.
 * Muestra toda la información del caso, el avance por etapas y permite
 * mover el expediente de etapa, editarlo o eliminarlo.
 */
export function DetalleExpediente({ id }: { id: string }) {
  const router = useRouter();
  const { obtenerExpediente, moverEtapa, eliminarExpediente, cargado, recargar } =
    useExpedientes();
  const expediente = obtenerExpediente(id);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [mostrarControlesTraspaso, setMostrarControlesTraspaso] = useState(false);
  const [secuencias, setSecuencias] = useState<any[]>([]);
  const [enrolandoSecuencia, setEnrolandoSecuencia] = useState(false);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [siteUrl, setSiteUrl] = useState("https://app.saucedamx.com");

  // Estado para programación de llamada
  const [mostrarFormLlamada, setMostrarFormLlamada] = useState(false);
  const [perfiles, setPerfiles] = useState<{ id: string; nombre: string; rol: string }[]>([]);
  const [perfilLlamadaId, setPerfilLlamadaId] = useState("");
  const [fechaLlamada, setFechaLlamada] = useState("");
  const [horaLlamada, setHoraLlamada] = useState("10:00");
  const [notasLlamada, setNotasLlamada] = useState("");
  const [guardandoLlamada, setGuardandoLlamada] = useState(false);
  const [exitoLlamada, setExitoLlamada] = useState<string | null>(null);
  const [errorLlamada, setErrorLlamada] = useState<string | null>(null);

  useEffect(() => {
    listarPerfilesActivos()
      .then((p) => setPerfiles(p))
      .catch(console.error);
  }, []);

  async function handleProgramarLlamada(e: React.FormEvent) {
    e.preventDefault();
    if (!expediente || !fechaLlamada) return;
    const targetPerfilId = perfilLlamadaId || expediente.operadorId || expediente.asesorId;
    if (!targetPerfilId) {
      setErrorLlamada("Por favor selecciona la persona (asesor o técnico) asignada para realizar la llamada.");
      return;
    }
    setGuardandoLlamada(true);
    setErrorLlamada(null);
    setExitoLlamada(null);

    try {
      const r = await programarLlamadaExpediente({
        expedienteId: expediente.id,
        prospectoId: expediente.prospectoId || undefined,
        perfilId: targetPerfilId,
        clienteNombre: expediente.nombreCompleto || expediente.cliente,
        clienteTelefono: expediente.telefono,
        fecha: fechaLlamada,
        horaInicio: horaLlamada,
        notas: notasLlamada,
      });
      setGuardandoLlamada(false);

      if (!r.ok) {
        setErrorLlamada(r.error ?? "No se pudo agendar la llamada.");
      } else {
        setExitoLlamada("¡Llamada programada con éxito en la agenda!");
        setMostrarFormLlamada(false);
        setNotasLlamada("");
        await recargar();
      }
    } catch (err: any) {
      setErrorLlamada(err.message || "Error al programar la llamada.");
      setGuardandoLlamada(false);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSiteUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    listarSecuencias()
      .then((lista) => setSecuencias(lista.filter((s) => s.status === "activa")))
      .catch(() => {});
  }, []);

  // Cargar cotizaciones vinculadas si aplica
  useEffect(() => {
    if (expediente?.id) {
      obtenerCotizacionesDeExpediente(expediente.id)
        .then((list) => setCotizaciones(list))
        .catch(console.error);
    }
  }, [expediente?.id]);

  async function enrolarEnSecuencia(sequenceId: string) {
    if (!expediente || !sequenceId) return;
    setEnrolandoSecuencia(true);
    try {
      await enrolarLead({
        sequenceId,
        phone: expediente.telefono,
        nombre: expediente.nombreCompleto,
        expedienteId: expediente.id,
      });
      alert("Expediente enrolado en la secuencia exitosamente.");
      recargar();
    } catch (err: any) {
      alert(`Error al enrolar: ${err.message}`);
    } finally {
      setEnrolandoSecuencia(false);
    }
  }

  // Expediente inexistente. Mientras carga el estado persistido evitamos
  // mostrar el mensaje de "no encontrado" (podría ser un id válido aún no leído).
  if (!expediente) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="font-titular text-2xl text-verde-profundo">
          {cargado ? "Expediente no encontrado" : "Cargando…"}
        </p>
        {cargado && (
          <>
            <p className="mt-2 text-sm text-carbon/60">
              El expediente <span className="font-mono">{id}</span> no existe.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-md bg-sauce px-4 py-2 text-sm text-crema hover:bg-verde-profundo"
            >
              ← Volver al tablero
            </Link>
          </>
        )}
      </div>
    );
  }

  const anterior = etapaAnterior(expediente.etapa, expediente.tipoNegocio);
  const siguiente = etapaSiguiente(expediente.etapa, expediente.tipoNegocio);

  const etapasLista = obtenerEtapasPorNegocio(expediente.tipoNegocio);
  const totalEtapas = etapasLista.length;
  const etapaActualIndex = etapasLista.findIndex(e => e.id === expediente.etapa);
  const etapaNumero = etapaActualIndex !== -1 ? etapaActualIndex + 1 : 1;
  const porcentajeAvance = Math.round((etapaNumero / totalEtapas) * 100);


  return (
    <div className="mx-auto max-w-2xl px-4 py-6">

      {/* Volver al tablero & Acciones principales */}
      <div className="flex items-center justify-between gap-4 border-b border-carbon/5 pb-2.5">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-sauce hover:text-verde-profundo"
        >
          ← Volver al tablero
        </Link>
        
        {/* Acciones principales como enlaces limpios y compactos */}
        <div className="flex items-center gap-2 text-xs">
          <Link
            href={`/expediente/${expediente.id}/editar`}
            className="font-bold text-carbon/60 hover:text-sauce hover:underline"
          >
            Editar
          </Link>
          <span className="text-carbon/25">|</span>
          {!confirmarBorrado ? (
            <button
              type="button"
              onClick={() => setConfirmarBorrado(true)}
              className="font-bold text-rojo hover:underline"
            >
              Eliminar
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 bg-rojo/5 px-2 py-0.5 rounded border border-rojo/10">
              <span className="text-carbon/50 text-[10px]">¿Eliminar?</span>
              <button
                type="button"
                onClick={async () => {
                  await eliminarExpediente(expediente.id);
                  router.push("/");
                }}
                className="font-bold text-rojo hover:underline text-[10px]"
              >
                Sí
              </button>
              <button
                type="button"
                onClick={() => setConfirmarBorrado(false)}
                className="text-carbon/50 hover:underline text-[10px]"
              >
                No
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Señalética Visual de Identificación: EXPEDIENTE */}
      <div className="mb-4 rounded-xl border border-emerald-300/40 bg-gradient-to-r from-verde-profundo via-verde-profundo to-emerald-950 px-4 py-3 text-crema shadow-md flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sauce/30 text-lg border border-sauce/40 text-dorado">
            📁
          </span>
          <div>
            <span className="font-titular text-sm font-bold uppercase tracking-wider text-dorado block">
              Expediente de Operación Legal / Comercial
            </span>
            <span className="text-[11px] text-crema/70 block font-mono">
              Traspaso · Documentación · Valuación & Notaría
            </span>
          </div>
        </div>
        <span className="font-mono text-xs font-bold bg-sauce/30 border border-sauce/40 text-crema px-3 py-1 rounded-full shadow-2xs">
          {expediente.id}
        </span>
      </div>

      {/* Cabecera limpia y justificada */}
      <div className="mt-2 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-titular text-2xl sm:text-3xl font-bold text-verde-profundo leading-tight">
            {expediente.nombreCompleto}
          </h1>
          <span className="font-mono text-xs text-carbon/40 shrink-0 select-all">
            {expediente.id}
          </span>
        </div>
        
        <p className="text-xs text-carbon/45 leading-none flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{expediente.fraccionamiento} · León, Gto.</span>
          {expediente.prospectoId && (
            <>
              <span className="text-carbon/25 font-bold">•</span>
              <span className="font-bold text-carbon/40 uppercase text-[10px]">Prospecto:</span>
              <Link
                href={`/prospectos/${expediente.prospectoId}`}
                className="font-mono font-bold text-sauce hover:underline flex items-center gap-0.5"
              >
                {expediente.prospectoId} <span className="text-[9px] font-semibold text-sauce/80 font-titular leading-none">(Ver ficha →)</span>
              </Link>
            </>
          )}
        </p>

        {/* Calificación / Prioridad y Tipo de Negocio responsivos */}
        <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-carbon/5 mt-2">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[10px] uppercase font-bold text-carbon/40">Calificación:</span>
            <CalificacionProspectoBadge calificacion={expediente.calificacion || "frio"} />
            <select
              value={expediente.calificacion || "frio"}
              onChange={async (e) => {
                const nueva = e.target.value as CalificacionProspecto;
                await cambiarCalificacionExpediente(expediente.id, nueva);
                await recargar();
              }}
              className="text-[10px] rounded border border-carbon/20 px-1.5 py-0.5 bg-white font-medium focus:outline-none focus:border-sauce text-carbon/70 cursor-pointer shadow-2xs"
              title="Cambiar calificación"
            >
              <option value="caliente">🔥 Caliente</option>
              <option value="templado">⚡ Templado</option>
              <option value="frio">❄️ Frío</option>
              <option value="descalificado">🚫 Descalificado</option>
            </select>
          </div>
          
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[10px] uppercase font-bold text-carbon/40">Negocio:</span>
            {expediente.tipoNegocio ? (
              <span className="inline-flex items-center rounded-full bg-sauce/10 border border-sauce/20 px-2 py-0.5 text-[10px] font-bold text-sauce">
                {labelTipoNegocio(expediente.tipoNegocio)}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-carbon/5 border border-carbon/10 px-2 py-0.5 text-[10px] font-medium text-carbon/50">
                Sin definir
              </span>
            )}
          </div>
        </div>

        {/* Asesor Selector y Secuencia — misma fila en desktop, apilados en móvil */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-carbon/5">
          <div className="flex flex-wrap items-center gap-4 text-xs text-carbon/70 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-carbon/40 shrink-0">Atiende:</span>
              <AsesorSelector
                entidadId={expediente.id}
                tipoEntidad="expediente"
                asesorIdActual={expediente.asesorId ?? null}
                asesorNombreActual={expediente.asesorNombre ?? null}
                onAsignado={recargar}
              />
            </div>
            <div className="flex items-center gap-1.5 border-t sm:border-t-0 sm:border-l border-carbon/10 pt-1.5 sm:pt-0 sm:pl-4">
              <span className="text-[10px] uppercase font-bold text-carbon/40 shrink-0">Operador:</span>
              <OperadorSelector
                entidadId={expediente.id}
                tipoEntidad="expediente"
                operadorIdActual={expediente.operadorId ?? null}
                operadorNombreActual={expediente.operadorNombre ?? null}
                onAsignado={recargar}
              />
            </div>
          </div>

          {secuencias.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-carbon/70 sm:border-l sm:border-carbon/10 sm:pl-2">
              <span className="text-[10px] uppercase font-bold text-carbon/40 shrink-0">Secuencia:</span>
              {expediente.secuenciaNombre ? (
                <span className="rounded-full bg-sauce/10 border border-sauce/20 px-2 py-0.5 text-[10px] font-bold text-sauce truncate max-w-[140px]" title={expediente.secuenciaNombre}>
                  {expediente.secuenciaNombre}
                </span>
              ) : (
                <select
                  defaultValue=""
                  disabled={enrolandoSecuencia}
                  onChange={(e) => {
                    if (e.target.value) {
                      void enrolarEnSecuencia(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className="rounded-md border border-carbon/15 bg-white px-2 py-0.5 text-[10px] text-verde-profundo outline-none focus:border-sauce disabled:opacity-50"
                >
                  <option value="">+ Agregar a secuencia</option>
                  {secuencias.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Columna única centrada para un diseño premium y ordenado */}
      <div className="mt-6 space-y-6">
        {/* Widget Principal de Datos de Contacto del Cliente */}
        <div className="rounded-xl border border-carbon/10 bg-white p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-carbon/5 pb-2.5">
            <h3 className="font-titular text-xs font-bold text-verde-profundo uppercase tracking-wider flex items-center gap-1.5">
              🎴 Datos de Contacto del Cliente
            </h3>
            <span className="text-[10px] text-carbon/40 font-mono">Información de comunicación y ubicación</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Teléfono */}
            <div className="rounded-lg border border-carbon/10 bg-slate-50/50 p-3 space-y-1.5 flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-carbon/40 uppercase tracking-wider block">📞 Teléfono</span>
                <span className="font-mono text-xs sm:text-sm font-bold text-carbon block mt-0.5 select-all truncate">
                  {expediente.telefono || "Sin teléfono registrado"}
                </span>
              </div>
              {expediente.telefono && (
                <div className="flex items-center gap-1.5 pt-1">
                  <BotonLlamar telefono={expediente.telefono} prospectoId={expediente.prospectoId} />
                  <a
                    href={`https://wa.me/${expediente.telefono.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 transition shadow-2xs"
                  >
                    <span>💬 WhatsApp</span>
                  </a>
                </div>
              )}
            </div>

            {/* Correo Electrónico */}
            <div className="rounded-lg border border-carbon/10 bg-slate-50/50 p-3 space-y-1.5 flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-carbon/40 uppercase tracking-wider block">✉️ Correo Electrónico</span>
                <span className="font-mono text-xs sm:text-sm font-medium text-carbon block mt-0.5 select-all truncate" title={expediente.prospectoCorreo || "Sin correo registrado"}>
                  {expediente.prospectoCorreo || "Sin correo registrado"}
                </span>
              </div>
              {expediente.prospectoCorreo ? (
                <a
                  href={`mailto:${expediente.prospectoCorreo}`}
                  className="self-start inline-flex items-center gap-1 text-[10px] font-bold text-sauce hover:underline pt-1"
                >
                  <span>Enviar correo →</span>
                </a>
              ) : (
                <span className="text-[10px] text-carbon/40 italic">No proporcionado</span>
              )}
            </div>

            {/* Dirección Completa / Propiedad */}
            <div className="rounded-lg border border-carbon/10 bg-slate-50/50 p-3 space-y-1.5 flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-carbon/40 uppercase tracking-wider block">📍 Dirección Completa</span>
                <span className="text-xs font-medium text-carbon/80 block mt-0.5 line-clamp-2" title={expediente.direccionPropiedad || expediente.prospectoDireccion || `${expediente.fraccionamiento || "Sin dirección"}, León, Gto.`}>
                  {expediente.direccionPropiedad || expediente.prospectoDireccion || `${expediente.fraccionamiento || "Sin dirección"}, León, Gto.`}
                </span>
              </div>
              {expediente.linkGoogleMaps ? (
                <a
                  href={expediente.linkGoogleMaps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="self-start inline-flex items-center gap-1 text-[10px] font-bold text-sauce hover:underline pt-1"
                >
                  <span>🗺️ Ver en Google Maps →</span>
                </a>
              ) : (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(expediente.direccionPropiedad || `${expediente.fraccionamiento}, León, Gto.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="self-start inline-flex items-center gap-1 text-[10px] font-bold text-sauce hover:underline pt-1"
                >
                  <span>🗺️ Buscar en mapa →</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Enlaces de agendamiento de citas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LinkCitaWidget
            asesorId={expediente.asesorId ?? null}
            asesorNombre={expediente.asesorNombre ?? null}
            prospectoId={expediente.prospectoId || ""}
            prospectoNombre={expediente.cliente}
            prospectoTelefono={expediente.telefono ?? null}
            siteUrl={siteUrl}
          />

          <LinkCitaWidget
            asesorId={expediente.operadorId ?? null}
            asesorNombre={expediente.operadorNombre ?? null}
            prospectoId={expediente.prospectoId || ""}
            prospectoNombre={expediente.cliente}
            prospectoTelefono={expediente.telefono ?? null}
            siteUrl={siteUrl}
            titulo="📅 Enlace de Agendamiento de Inspección"
            tipoCitaPredefinido="inspeccion"
            rolEtiqueta="Operador"
          />
        </div>

        {/* Widget de Agendamiento Directo e Historial de Citas del Expediente */}
        <WidgetAgendaCitas
          prospectoId={expediente.prospectoId}
          expedienteId={expediente.id}
          clienteNombre={expediente.nombreCompleto || expediente.cliente}
          clienteTelefono={expediente.telefono || ""}
          onRefresh={async () => {
            await recargar();
          }}
        />

        {/* Avance por etapas (Solo visible para Traspaso / Compra de casa) */}
        {(!expediente.tipoNegocio || expediente.tipoNegocio === "traspaso_compra" || (expediente.tipoNegocio as string) === "compra" || (expediente.tipoNegocio as string) === "traspaso") && (
          <div className={`rounded-xl border border-carbon/10 bg-white shadow-sm transition-all duration-300 ${mostrarControlesTraspaso ? "p-3.5" : "px-3.5 py-2.5"}`}>
            {/* Vista Desktop (Completa) */}
            <div className="hidden md:block">
              <p className="text-xs font-medium uppercase tracking-wide text-carbon/50 mb-2">
                Avance del traspaso
              </p>
              <AvanceTraspaso etapa={expediente.etapa} tipoNegocio={expediente.tipoNegocio} />
              
              {/* Mover de etapa Desktop */}
              <div className="mt-4 flex gap-3 border-t border-carbon/5 pt-4">
                <button
                  type="button"
                  disabled={!anterior}
                  onClick={() => anterior && moverEtapa(expediente.id, anterior.id)}
                  className="flex-1 rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon/70 transition enabled:hover:border-sauce enabled:hover:text-sauce disabled:opacity-30"
                >
                  ← {anterior?.nombre ?? "Primera"}
                </button>
                <button
                  type="button"
                  disabled={!siguiente}
                  onClick={() => siguiente && moverEtapa(expediente.id, siguiente.id)}
                  className="flex-1 rounded-md bg-sauce px-3 py-2 text-sm text-crema transition enabled:hover:bg-verde-profundo disabled:opacity-30"
                >
                  {siguiente?.nombre ?? "Última"} →
                </button>
              </div>
            </div>

            {/* Vista Móvil (Colapsable) */}
            <div className="block md:hidden">
              {!mostrarControlesTraspaso ? (
                /* Vista Contraída (Fila Única tipo Prospecto) */
                <div
                  onClick={() => setMostrarControlesTraspaso(true)}
                  className="flex items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-carbon/40">
                      Avance:
                    </span>
                    <span className="text-xs font-bold text-verde-profundo">
                      {etapasLista[etapaActualIndex]?.nombre || expediente.etapa}
                    </span>
                    <span className="text-[10px] text-carbon/40">
                      ({etapaNumero}/{totalEtapas})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-sauce bg-sauce/10 px-1.5 py-0.5 rounded-full font-mono">
                      {porcentajeAvance}%
                    </span>
                    <span className="text-[10px] font-bold text-sauce flex items-center gap-0.5">
                      Cambiar →
                    </span>
                  </div>
                </div>
              ) : (
                /* Vista Expandida (Progreso y Controles) */
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] text-carbon/40 font-bold uppercase block">
                        Etapa {etapaNumero} de {totalEtapas}
                      </span>
                      <span className="text-sm font-bold text-verde-profundo mt-0.5 block">
                        {etapasLista[etapaActualIndex]?.nombre || expediente.etapa}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-sauce bg-sauce/10 px-2 py-0.5 rounded-full">
                        {porcentajeAvance}%
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMostrarControlesTraspaso(false);
                        }}
                        className="text-[10px] font-bold text-carbon/50 hover:underline"
                      >
                        ▲ Cerrar
                      </button>
                    </div>
                  </div>

                  {/* Barra de progreso visual */}
                  <div className="w-full bg-carbon/5 rounded-full h-1.5">
                    <div
                      className="bg-sauce h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${porcentajeAvance}%` }}
                    ></div>
                  </div>

                  {/* Botones de navegación móviles compactos */}
                  <div className="flex gap-2 pt-2 border-t border-carbon/5">
                    <button
                      type="button"
                      disabled={!anterior}
                      onClick={() => anterior && moverEtapa(expediente.id, anterior.id)}
                      className="flex-1 rounded-lg border border-carbon/15 bg-white py-1 px-2 text-xs font-bold text-carbon/70 transition disabled:opacity-30"
                    >
                      ← {anterior ? "Anterior" : "Inicio"}
                    </button>
                    <button
                      type="button"
                      disabled={!siguiente}
                      onClick={() => siguiente && moverEtapa(expediente.id, siguiente.id)}
                      className="flex-1 rounded-lg bg-sauce py-1 px-2 text-xs font-bold text-crema transition disabled:opacity-30"
                    >
                      {siguiente ? "Siguiente" : "Fin"} →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

          {/* Ficha Premium: Expediente de Traspaso (Solo visible para Traspaso / Compra de casa) */}
          {(!expediente.tipoNegocio || expediente.tipoNegocio === "traspaso_compra" || (expediente.tipoNegocio as string) === "compra" || (expediente.tipoNegocio as string) === "traspaso") && (
            <div className="rounded-2xl border border-carbon/10 bg-white p-4 sm:p-6 shadow-sm">
              {/* Header de la Ficha */}
              <div className="flex items-center justify-between gap-3">
                {/* Desktop Header */}
                <div className="hidden sm:flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-verde-profundo/10 font-titular text-lg font-bold text-verde-profundo">
                    {expediente.cliente ? expediente.cliente.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "EX"}
                  </div>
                  <div>
                    <h3 className="font-titular text-lg font-bold text-verde-profundo">
                      Expediente de Traspaso
                    </h3>
                    <p className="text-xs text-carbon/60 font-medium">
                      {expediente.nombreCompleto || `${expediente.cliente} ${expediente.primerApellido}`}
                    </p>
                  </div>
                </div>

                {/* Mobile Header */}
                <div className="block sm:hidden">
                  <h3 className="font-titular text-sm font-bold uppercase tracking-wider text-verde-profundo">
                    Expediente de Traspaso
                  </h3>
                </div>

                <span className={`rounded-full px-2.5 py-0.5 text-[10px] sm:text-xs font-semibold ${
                  expediente.etapa === "nuevo-lead" ? "bg-emerald-50 text-emerald-700" :
                  expediente.etapa === "perdido" ? "bg-rojo/10 text-rojo" :
                  "bg-sauce/10 text-sauce"
                }`}>
                  {expediente.etapa === "nuevo-lead" ? "Nuevo" : (ETAPAS_POR_ID[expediente.etapa]?.nombre || expediente.etapa)}
                </span>
              </div>

              <div className="my-4 border-t border-carbon/10"></div>

              {/* Listado de campos con Iconos (sin teléfono, ya mostrado arriba) */}
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-carbon/60">
                    <svg className="h-4 w-4 text-carbon/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Zona
                  </span>
                  <span className="font-medium text-carbon text-right max-w-[200px] truncate">
                    {expediente.fraccionamiento || "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-carbon/60">
                    <svg className="h-4 w-4 text-carbon/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    Tipo
                  </span>
                  <span className="font-medium text-carbon text-right max-w-[200px] truncate">
                    {expediente.tipoCredito || "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-carbon/60">
                    <svg className="h-4 w-4 text-carbon/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Negocio
                  </span>
                  <span className="font-medium text-carbon text-right max-w-[200px] truncate">
                    {expediente.tipoNegocio ? labelTipoNegocio(expediente.tipoNegocio) : "Traspaso / Compra"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-carbon/60">
                    <svg className="h-4 w-4 text-carbon/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Sin pagos
                  </span>
                  <span className="font-medium text-carbon">
                    {expediente.sinPagos || "Sin dato"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-carbon/60">
                    <svg className="h-4 w-4 text-carbon/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Estado físico
                  </span>
                  <span className={`font-semibold ${
                    expediente.estadoFisico && expediente.estadoFisico.toLowerCase().includes("buen")
                      ? "text-[#0F5A47]"
                      : "text-carbon"
                  }`}>
                    {expediente.estadoFisico || "Sin dato"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-carbon/60">
                    <svg className="h-4 w-4 text-carbon/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    Habitada
                  </span>
                  <span className="font-medium text-carbon">
                    {expediente.habitada || "Sin dato"}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 py-1">
                  <span className="flex items-center gap-2 text-carbon/60 text-xs sm:text-sm">
                    <svg className="h-4 w-4 text-carbon/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Valor / Adeudo
                  </span>
                  <span className="font-mono font-bold text-carbon text-xs sm:text-sm text-left sm:text-right">
                    {expediente.valorEstimado > 0 || expediente.saldoDeuda > 0 ? (
                      <>
                        {expediente.valorEstimado > 0 ? formatoPesos(expediente.valorEstimado) : "Sin dato"}
                        {" / "}
                        {expediente.saldoDeuda > 0 ? formatoPesos(expediente.saldoDeuda) : "Sin dato"}
                      </>
                    ) : (
                      <span className="italic text-carbon/60">Sin dato</span>
                    )}
                  </span>
                </div>
              </div>

              <div className="my-4 border-t border-carbon/10"></div>

              {/* Siguiente Paso */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-wider text-carbon/40">
                  Siguiente Paso
                </span>
                <div className="flex items-start gap-2 text-sm text-carbon/85">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#0F5A47]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium text-carbon/90">
                    {obtenerSiguientePasoDinamico(expediente.etapa)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-carbon/50 pt-0.5">
                  <svg className="h-4 w-4 shrink-0 text-carbon/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>
                    Contacto recibido: {formatoFecha(expediente.createdAt || expediente.ultimoMovimiento)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {(expediente.campaignName ||
            expediente.adsetName ||
            expediente.adName) && (
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-carbon/10 bg-carbon/10 sm:grid-cols-3">
              <Dato etiqueta="Campaign" valor={expediente.campaignName || "—"} />
              <Dato etiqueta="Adset" valor={expediente.adsetName || "—"} />
              <Dato etiqueta="Ad" valor={expediente.adName || "—"} />
            </dl>
          )}

          {(expediente.direccionPropiedad || expediente.linkGoogleMaps) && (
            <Bloque titulo="Dirección de la propiedad">
              {expediente.direccionPropiedad || "—"}
              {expediente.linkGoogleMaps && (
                <div className="mt-2 pt-2 border-t border-carbon/5">
                  <a
                    href={expediente.linkGoogleMaps}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-sauce hover:underline font-semibold"
                  >
                    📍 Ver ubicación en Google Maps
                  </a>
                </div>
              )}
            </Bloque>
          )}

          {/* Checklist de Flujo de Trabajo Operativo (BPM) */}
          <WidgetBpmTareas 
            expedienteId={expediente.id} 
            tipoNegocio={expediente.tipoNegocio} 
          />

          {/* Módulo de Promoción Venta & Portal del Cliente */}
          {(expediente.tipoNegocio === "promocion_venta" || expediente.sessionTokenClient) && (
            <PromocionVentaWidget
              expedienteId={expediente.id}
              clienteNombre={expediente.cliente}
              siteUrl={siteUrl}
            />
          )}

          <Bloque titulo="Situación">{expediente.situacion || "—"}</Bloque>
          <Bloque titulo="Notas del asesor">{expediente.notas || "—"}</Bloque>

          {/* Línea de tiempo de la Secuencia de Automatización */}
          <TimelineSecuencia
            phoneOrId={expediente.id}
            datosEnrolamiento={{
              phone: expediente.telefono || "",
              nombre: [expediente.cliente, expediente.primerApellido, expediente.segundoApellido].filter(Boolean).join(" "),
              prospectoId: expediente.prospectoId || undefined,
              expedienteId: expediente.id,
            }}
          />

          {/* Módulo de Cotizaciones y Propuesta Comercial (Sauceda Construye) */}
          <div className="rounded-2xl border border-carbon/10 bg-white p-4 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-titular text-base sm:text-lg font-semibold text-carbon flex items-center gap-1.5">
                  📋 Cotizaciones y Propuestas
                </h3>
                <p className="text-xs text-carbon/50">
                  Propuestas comerciales y visitas técnicas asociadas
                </p>
              </div>
              <Link
                href={`/construccion?prospectoId=${expediente.prospectoId}&expedienteId=${expediente.id}&crear=1`}
                className="rounded-lg bg-sauce/10 border border-sauce/20 hover:bg-sauce hover:text-white transition px-3 py-1.5 text-xs font-semibold text-sauce flex items-center gap-1 font-titular"
              >
                + Nueva Cotización
              </Link>
            </div>

            {cotizaciones.length === 0 ? (
              <div className="py-6 text-center border border-dashed border-carbon/15 rounded-lg bg-carbon/[0.01]">
                <p className="text-xs text-carbon/40 mb-2">No hay cotizaciones para este expediente.</p>
                <Link
                  href={`/construccion?prospectoId=${expediente.prospectoId}&expedienteId=${expediente.id}&crear=1`}
                  className="inline-flex items-center gap-1 text-xs text-sauce hover:underline font-semibold"
                >
                  Crear primera cotización →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {cotizaciones.map((c) => (
                  <div key={c.id} className="p-3.5 rounded-xl border border-carbon/10 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col xs:flex-row xs:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link href={`/construccion/${c.id}`} className="font-mono font-bold text-sauce hover:underline">
                          {c.id}
                        </Link>
                        <span className="text-xs font-semibold text-carbon/60">
                          {c.servicioTipo === "impermeabilizacion" ? "Impermeabilización" :
                           c.servicioTipo === "pintura" ? "Pintura" :
                           c.servicioTipo === "losa" ? "Construcción de Losa" :
                           c.servicioTipo === "remodelacion" ? "Remodelación" : "Otro Servicio"}
                        </span>
                      </div>
                      <p className="text-xs text-carbon/40 mt-0.5">
                        Creada: {new Date(c.createdAt).toLocaleDateString("es-MX")}
                      </p>
                    </div>

                    <div className="flex items-center justify-between xs:justify-end gap-3 flex-wrap">
                      <div className="text-right font-mono">
                        <span className="block text-xs font-bold text-verde-profundo">
                          {c.precioFinal > 0 ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(c.precioFinal) : "—"}
                        </span>
                        <span className="text-[10px] text-carbon/40 uppercase tracking-wide">Precio Venta</span>
                      </div>
                      
                      <div className="flex flex-col items-end gap-1">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          c.estatus === "aceptada" ? "bg-green-100 text-green-700" :
                          c.estatus === "rechazada" ? "bg-red-100 text-red-700" :
                          c.estatus === "esperando_visita" ? "bg-amber-100 text-amber-700" :
                          "bg-slate-100 text-slate-700"
                        }`}>
                          {c.estatus.replace("_", " ")}
                        </span>

                        {(c.estatus === "aprobada" || c.estatus === "enviada" || c.estatus === "aceptada") && (
                          <a
                            href={`/cotizacion/${c.token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] text-sauce hover:underline font-semibold flex items-center gap-0.5 animate-pulse"
                            title="Ver vista pública del cliente"
                          >
                            🔗 Portal Cliente
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Módulo de Programación de Llamada Telefónica */}
          <div className="rounded-2xl border border-carbon/10 bg-white p-4 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-titular text-base sm:text-lg font-semibold text-carbon flex items-center gap-1.5">
                  📞 Programar Llamada a Realizar
                </h3>
                <p className="text-xs text-carbon/50">
                  Agendar llamada telefónica para que el técnico o asesor la realice
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMostrarFormLlamada(!mostrarFormLlamada)}
                className="rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-600 hover:text-white transition px-3 py-1.5 text-xs font-semibold text-amber-800 flex items-center gap-1 cursor-pointer"
              >
                {mostrarFormLlamada ? "Cancelar" : "📞 Agendar Llamada"}
              </button>
            </div>

            {exitoLlamada && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
                {exitoLlamada}
              </div>
            )}
            {errorLlamada && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                {errorLlamada}
              </div>
            )}

            {mostrarFormLlamada && (
              <form onSubmit={handleProgramarLlamada} className="p-4 rounded-xl border border-carbon/15 bg-slate-50 space-y-3">
                <h4 className="text-xs font-bold text-verde-profundo uppercase tracking-wider">Programar Llamada de Seguimiento</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Fecha de Llamada</label>
                    <input
                      type="date"
                      required
                      value={fechaLlamada}
                      onChange={(e) => setFechaLlamada(e.target.value)}
                      className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Hora Tentativa</label>
                    <input
                      type="time"
                      required
                      value={horaLlamada}
                      onChange={(e) => setHoraLlamada(e.target.value)}
                      className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-carbon/70 mb-1">
                    Asignar Llamada a (Asesor o Técnico) *
                  </label>
                  <select
                    required
                    value={perfilLlamadaId || expediente.operadorId || expediente.asesorId || ""}
                    onChange={(e) => setPerfilLlamadaId(e.target.value)}
                    className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
                  >
                    <option value="">-- Seleccionar Asesor o Técnico --</option>
                    {perfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} ({p.rol === "operaciones" ? "Técnico / Operador" : p.rol === "asesor" ? "Asesor Comercial" : "Administrador"})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Notas / Propósito de la Llamada</label>
                  <input
                    type="text"
                    placeholder="Ej. Confirmar medidas de azotea / Acordar presupuesto..."
                    value={notasLlamada}
                    onChange={(e) => setNotasLlamada(e.target.value)}
                    className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setMostrarFormLlamada(false)}
                    className="px-3 py-1.5 rounded-lg border border-carbon/15 text-xs text-carbon/70 hover:bg-carbon/5"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardandoLlamada}
                    className="px-4 py-1.5 rounded-lg bg-sauce hover:bg-verde-profundo text-white text-xs font-bold transition disabled:opacity-50"
                  >
                    {guardandoLlamada ? "Guardando..." : "Guardar Llamada en Agenda"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Historial de conversaciones de WhatsApp */}
          {expediente.telefono && (
            <ConversacionHistorica telefono={expediente.telefono} />
          )}

          {/* Historial de llamadas telefónicas y grabaciones */}
          {expediente.telefono && (
            <LlamadasHistoricas telefono={expediente.telefono} />
          )}

          {/* Bitácora de actividades */}
          <Actividades expedienteId={expediente.id} />
        </div>
      </div>
  );
}

/** Celda de dato dentro de la cuadrícula de información. */
function Dato({
  etiqueta,
  valor,
  mono,
  resaltar,
}: {
  etiqueta: string;
  valor: string;
  mono?: boolean;
  resaltar?: boolean;
}) {
  return (
    <div className="bg-white p-3">
      <dt className="text-[10px] uppercase tracking-wide text-carbon/40">
        {etiqueta}
      </dt>
      <dd
        className={`mt-0.5 ${mono ? "font-mono" : "font-cuerpo"} ${
          resaltar ? "text-sauce" : "text-carbon"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

/** Bloque de texto con título (situación / notas). */
function Bloque({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-4">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-carbon/50">
        {titulo}
      </p>
      <p className="text-sm text-carbon/80">{children}</p>
    </div>
  );
}

/** Devuelve una descripción amigable del siguiente paso recomendado para el asesor según la etapa. */
function obtenerSiguientePasoDinamico(etapa: string): string {
  switch (etapa) {
    case "nuevo-lead":
      return "Establecer contacto y validar interés del prospecto";
    case "contactado":
      return "Solicitar fotos y validar situación de la propiedad";
    case "valuacion":
      return "Visita en persona para valuar la propiedad";
    case "oferta":
      return "Presentar oferta formal de compra / traspaso";
    case "documentos":
      return "Recopilar y validar expediente de documentos";
    case "notaria":
      return "Programar firma y finiquito en notaría";
    case "cerrado":
      return "Traspaso cerrado. Post-venta y archivo";
    case "perdido":
      return "Seguimiento de reactivación en 3 meses";
    default:
      return "Siguiente contacto de seguimiento";
  }
}
