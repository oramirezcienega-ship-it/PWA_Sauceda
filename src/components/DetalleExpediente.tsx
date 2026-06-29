"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExpedientes } from "@/context/expedientes-context";
import { etapaAnterior, etapaSiguiente, ETAPAS_POR_ID } from "@/lib/etapas";
import { EtapaBadge } from "./EtapaBadge";
import { AvanceTraspaso } from "./AvanceTraspaso";
import { Actividades } from "./Actividades";
import { formatoFecha, formatoPesos } from "@/lib/formato";
import { BotonLlamar } from "./BotonLlamar";
import { AsesorSelector } from "./AsesorSelector";
import { labelTipoNegocio } from "@/lib/types";
import { ConversacionHistorica } from "./ConversacionHistorica";
import { LlamadasHistoricas } from "./LlamadasHistoricas";

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

  const anterior = etapaAnterior(expediente.etapa);
  const siguiente = etapaSiguiente(expediente.etapa);

  const etapasLista = Object.values(ETAPAS_POR_ID);
  const totalEtapas = etapasLista.length;
  const etapaActualIndex = etapasLista.findIndex(e => e.id === expediente.etapa);
  const etapaNumero = etapaActualIndex !== -1 ? etapaActualIndex + 1 : 1;
  const porcentajeAvance = Math.round((etapaNumero / totalEtapas) * 100);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
      >
        ← Volver al tablero
      </Link>

      {/* Cabecera Optimizado para Móvil */}
      <div className="mt-3 space-y-2">
        {/* Fila 1: Título, ID y Acciones */}
        <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
          <div>
            <h1 className="font-titular text-xl sm:text-3xl font-bold text-verde-profundo leading-tight">
              {expediente.nombreCompleto}
            </h1>
            <p className="text-xs text-carbon/45 mt-0.5">
              {expediente.fraccionamiento} · León, Gto.
            </p>
          </div>
          
          <div className="flex flex-col items-end gap-1.5 shrink-0 ml-auto">
            <span className="font-mono text-[10px] sm:text-xs text-carbon/40">
              {expediente.id}
            </span>
            
            {/* Acciones del expediente: editar / eliminar compactos */}
            <div className="flex items-center gap-1.5">
              <Link
                href={`/expediente/${expediente.id}/editar`}
                className="rounded-lg border border-carbon/15 bg-white px-2 py-1 text-[11px] font-bold text-carbon/70 hover:border-sauce hover:text-sauce transition"
              >
                Editar
              </Link>
              {!confirmarBorrado ? (
                <button
                  type="button"
                  onClick={() => setConfirmarBorrado(true)}
                  className="rounded-lg border border-rojo/30 bg-white px-2 py-1 text-[11px] font-bold text-rojo hover:bg-rojo/5 transition"
                >
                  Eliminar
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-rojo/20 bg-rojo/5 p-1 text-[10px]">
                  <button
                    type="button"
                    onClick={async () => {
                      await eliminarExpediente(expediente.id);
                      router.push("/");
                    }}
                    className="rounded bg-rojo px-1.5 py-0.5 font-bold text-crema"
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmarBorrado(false)}
                    className="text-carbon/60 hover:text-carbon font-bold"
                  >
                    No
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Fila 2: Estatus y Asesor */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-carbon/5">
          <EtapaBadge etapa={expediente.etapa} />
          
          <div className="text-xs">
            <AsesorSelector
              entidadId={expediente.id}
              tipoEntidad="expediente"
              asesorIdActual={expediente.asesorId ?? null}
              asesorNombreActual={expediente.asesorNombre ?? null}
              onAsignado={recargar}
            />
          </div>
        </div>
      </div>

      {/* Columna única centrada para un diseño premium y ordenado */}
      <div className="mt-6 space-y-6">
          {/* Avance por etapas */}
          <div className="rounded-xl border border-carbon/10 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-carbon/50 mb-2">
              Avance del traspaso
            </p>

            {/* Vista Desktop (Completa) */}
            <div className="hidden md:block">
              <AvanceTraspaso etapa={expediente.etapa} />
              
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

            {/* Vista Móvil (Súper Compacta con Barra de Progreso y KPI) */}
            <div className="block md:hidden space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] text-carbon/40 font-bold uppercase block">
                    Etapa {etapaNumero} de {totalEtapas}
                  </span>
                  <span className="text-sm font-bold text-verde-profundo mt-0.5 block">
                    {etapasLista[etapaActualIndex]?.nombre || expediente.etapa}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-sauce bg-sauce/10 px-2 py-0.5 rounded-full">
                  {porcentajeAvance}%
                </span>
              </div>

              {/* Barra de progreso visual */}
              <div className="w-full bg-carbon/5 rounded-full h-2">
                <div
                  className="bg-sauce h-2 rounded-full transition-all duration-500"
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
          </div>

          {/* Prospecto (persona) dueño del expediente */}
          {expediente.prospectoId && (
            <Link
              href={`/prospectos/${expediente.prospectoId}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-carbon/10 bg-white px-3.5 py-2.5 transition hover:border-sauce shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-carbon/40">
                  Prospecto:
                </span>
                <span className="font-mono text-xs font-bold text-verde-profundo">
                  {expediente.prospectoId}
                </span>
              </div>
              <span className="text-xs font-bold text-sauce flex items-center gap-0.5">
                Ver ficha →
              </span>
            </Link>
          )}
          {/* Ficha Premium de Información de la Propiedad (Estilo Expediente/Lead) */}
          <div className="rounded-2xl border border-carbon/10 bg-white p-4 sm:p-6 shadow-sm">
            {/* Header de la Ficha */}
            <div className="flex items-center justify-between gap-3">
              {/* Desktop Header */}
              <div className="hidden sm:flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-verde-profundo/10 font-titular text-lg font-bold text-verde-profundo">
                  {expediente.cliente ? expediente.cliente.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "EX"}
                </div>
                <div>
                  <h3 className="font-titular text-lg font-semibold text-carbon">
                    {expediente.nombreCompleto || `${expediente.cliente} ${expediente.primerApellido}`}
                  </h3>
                  <p className="text-xs text-carbon/60">
                    Lead SAUCEDA Bienes Raíces
                  </p>
                </div>
              </div>

              {/* Mobile Header (Súper Compacto, evita duplicidad de nombre) */}
              <div className="block sm:hidden">
                <h3 className="font-titular text-sm font-bold uppercase tracking-wider text-verde-profundo">
                  Negociación y Ficha
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

            {/* Listado de campos con Iconos */}
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-carbon/60">
                  <svg className="h-4 w-4 text-carbon/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Teléfono
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-carbon">
                    {expediente.telefono || "—"}
                  </span>
                  {expediente.telefono && (
                    <div className="flex items-center gap-1.5">
                      <BotonLlamar
                        telefono={expediente.telefono}
                        prospectoId={expediente.prospectoId}
                      />
                      <Link
                        href={`/conversaciones?tel=${expediente.telefono}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-100 hover:text-green-800"
                        title="Abrir chat de WhatsApp"
                      >
                        💬 WhatsApp
                      </Link>
                    </div>
                  )}
                </div>
              </div>

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

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-carbon/60">
                  <svg className="h-4 w-4 text-carbon/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Valor / Adeudo
                </span>
                <span className="font-mono font-medium text-carbon">
                  {expediente.valorEstimado > 0 || expediente.saldoDeuda > 0 ? (
                    <>
                      {expediente.valorEstimado > 0 ? formatoPesos(expediente.valorEstimado) : "Sin dato"}
                      {" / "}
                      {expediente.saldoDeuda > 0 ? formatoPesos(expediente.saldoDeuda) : "Sin dato"}
                    </>
                  ) : (
                    <span className="italic text-carbon/60 text-sm">Sin dato</span>
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

          <Bloque titulo="Situación">{expediente.situacion || "—"}</Bloque>
          <Bloque titulo="Notas del asesor">{expediente.notas || "—"}</Bloque>

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
