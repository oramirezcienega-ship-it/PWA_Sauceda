"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExpedientes } from "@/context/expedientes-context";
import { enviarEnlacePortalWhatsApp } from "@/app/actions/expedientes";
import { etapaAnterior, etapaSiguiente } from "@/lib/etapas";
import { EtapaBadge } from "./EtapaBadge";
import { AvanceTraspaso } from "./AvanceTraspaso";
import { FormulariosExpediente } from "./FormulariosExpediente";
import { MensajesExpediente } from "./MensajesExpediente";
import { RespuestasExpediente } from "./RespuestasExpediente";
import { Actividades } from "./Actividades";
import { formatoFecha, formatoPesos } from "@/lib/formato";

/**
 * Vista de detalle de un expediente.
 * Muestra toda la información del caso, el avance por etapas y permite
 * mover el expediente de etapa, editarlo o eliminarlo.
 */
export function DetalleExpediente({ id }: { id: string }) {
  const router = useRouter();
  const { obtenerExpediente, moverEtapa, eliminarExpediente, cargado } =
    useExpedientes();
  const expediente = obtenerExpediente(id);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [enviandoWa, setEnviandoWa] = useState(false);
  const [waMsg, setWaMsg] = useState<string | null>(null);

  // Copia al portapapeles el enlace privado de seguimiento del cliente.
  function copiarEnlaceCliente(token: string) {
    const url = `${window.location.origin}/seguimiento/${token}`;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      },
      () => window.prompt("Copia el enlace para el cliente:", url),
    );
  }

  // Envía el enlace del portal al cliente por WhatsApp (vía API, sin abrir
  // WhatsApp Web).
  async function enviarPortalWhatsApp(expedienteId: string) {
    setEnviandoWa(true);
    setWaMsg(null);
    try {
      const r = await enviarEnlacePortalWhatsApp(expedienteId);
      setWaMsg(r.mensaje);
    } catch {
      setWaMsg("No se pudo enviar el WhatsApp.");
    } finally {
      setEnviandoWa(false);
      setTimeout(() => setWaMsg(null), 6000);
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

  const anterior = etapaAnterior(expediente.etapa);
  const siguiente = etapaSiguiente(expediente.etapa);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-sauce hover:text-verde-profundo"
      >
        ← Volver al tablero
      </Link>

      {/* Cabecera */}
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            {expediente.nombreCompleto}
          </h1>
          <p className="mt-1 text-sm text-carbon/60">
            {expediente.fraccionamiento} · León, Gto.
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs text-carbon/40">
          {expediente.id}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <EtapaBadge etapa={expediente.etapa} />

        {/* Acciones del expediente: editar / eliminar */}
        <div className="flex items-center gap-2">
          <Link
            href={`/expediente/${expediente.id}/editar`}
            className="rounded-md border border-carbon/15 bg-white px-3 py-1.5 text-xs text-carbon/70 transition hover:border-sauce hover:text-sauce"
          >
            Editar
          </Link>
          {!confirmarBorrado ? (
            <button
              type="button"
              onClick={() => setConfirmarBorrado(true)}
              className="rounded-md border border-rojo/30 bg-white px-3 py-1.5 text-xs text-rojo transition hover:bg-rojo/10"
            >
              Eliminar
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-md border border-rojo/30 bg-rojo/5 px-2 py-1 text-xs">
              <span className="text-carbon/70">¿Eliminar?</span>
              <button
                type="button"
                onClick={async () => {
                  await eliminarExpediente(expediente.id);
                  router.push("/");
                }}
                className="rounded bg-rojo px-2 py-1 font-medium text-crema hover:opacity-90"
              >
                Sí
              </button>
              <button
                type="button"
                onClick={() => setConfirmarBorrado(false)}
                className="rounded px-2 py-1 text-carbon/60 hover:text-carbon"
              >
                No
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Dos columnas: izquierda = operación/cliente · derecha = info del expediente */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ---------- COLUMNA IZQUIERDA ---------- */}
        <div className="space-y-6">
          {/* Avance por etapas */}
          <div className="rounded-xl border border-carbon/10 bg-white p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-carbon/50">
              Avance del traspaso
            </p>
            <AvanceTraspaso etapa={expediente.etapa} />

            {/* Mover de etapa */}
            <div className="mt-4 flex gap-3 border-t border-carbon/5 pt-4">
              <button
                type="button"
                disabled={!anterior}
                onClick={() =>
                  anterior && moverEtapa(expediente.id, anterior.id)
                }
                className="flex-1 rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon/70 transition enabled:hover:border-sauce enabled:hover:text-sauce disabled:opacity-30"
              >
                ← {anterior?.nombre ?? "Primera"}
              </button>
              <button
                type="button"
                disabled={!siguiente}
                onClick={() =>
                  siguiente && moverEtapa(expediente.id, siguiente.id)
                }
                className="flex-1 rounded-md bg-sauce px-3 py-2 text-sm text-crema transition enabled:hover:bg-verde-profundo disabled:opacity-30"
              >
                {siguiente?.nombre ?? "Última"} →
              </button>
            </div>
          </div>

          {/* Prospecto (persona) dueño del expediente */}
          {expediente.prospectoId && (
            <Link
              href={`/prospectos/${expediente.prospectoId}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-carbon/10 bg-white p-3 transition hover:border-sauce"
            >
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-carbon/50">
                  Prospecto
                </p>
                <p className="mt-0.5 font-mono text-sm text-verde-profundo">
                  {expediente.prospectoId}
                </p>
              </div>
              <span className="text-sm text-sauce">Ver ficha →</span>
            </Link>
          )}

          {/* Portal del cliente */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cielo/30 bg-cielo/5 p-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-carbon/50">
                Portal del cliente
              </p>
              <p className="mt-0.5 text-sm text-carbon/70">
                Comparte el seguimiento de solo lectura.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => copiarEnlaceCliente(expediente.token)}
                className="rounded-md border border-cielo/40 bg-white px-3 py-2 text-sm text-cielo transition hover:bg-cielo hover:text-crema"
              >
                {copiado ? "¡Copiado! ✓" : "Copiar enlace"}
              </button>
              {expediente.telefono && (
                <button
                  type="button"
                  onClick={() => enviarPortalWhatsApp(expediente.id)}
                  disabled={enviandoWa}
                  className="rounded-md bg-[#25D366] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {enviandoWa ? "Enviando…" : "Enviar por WhatsApp"}
                </button>
              )}
              {waMsg && (
                <span className="w-full text-xs text-carbon/70">{waMsg}</span>
              )}
            </div>
          </div>

          {/* Formularios del cliente (enviar / retirar) */}
          <FormulariosExpediente expedienteId={expediente.id} />

          {/* Mensajes al cliente */}
          <MensajesExpediente
            expedienteId={expediente.id}
            telefono={expediente.telefono}
            token={expediente.token}
            parametros={{
              nombre: expediente.cliente,
              primer_apellido: expediente.primerApellido,
              segundo_apellido: expediente.segundoApellido,
              nombre_completo: expediente.nombreCompleto,
              fraccionamiento: expediente.fraccionamiento,
            }}
          />
        </div>

        {/* ---------- COLUMNA DERECHA: información del expediente ---------- */}
        <div className="space-y-6">
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-carbon/10 bg-carbon/10 sm:grid-cols-2">
            <Dato etiqueta="Teléfono" valor={expediente.telefono || "—"} mono />
            <Dato
              etiqueta="Último movimiento"
              valor={formatoFecha(expediente.ultimoMovimiento)}
            />
            <Dato
              etiqueta="Valor estimado"
              valor={formatoPesos(expediente.valorEstimado)}
              mono
              resaltar
            />
            <Dato
              etiqueta="Saldo de deuda"
              valor={formatoPesos(expediente.saldoDeuda)}
              mono
            />
          </dl>

          {(expediente.campaignName ||
            expediente.adsetName ||
            expediente.adName) && (
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-carbon/10 bg-carbon/10 sm:grid-cols-3">
              <Dato etiqueta="Campaign" valor={expediente.campaignName || "—"} />
              <Dato etiqueta="Adset" valor={expediente.adsetName || "—"} />
              <Dato etiqueta="Ad" valor={expediente.adName || "—"} />
            </dl>
          )}

          <Bloque titulo="Situación">{expediente.situacion || "—"}</Bloque>
          <Bloque titulo="Notas del asesor">{expediente.notas || "—"}</Bloque>

          {/* Información recopilada (respuestas de formularios) */}
          <RespuestasExpediente expedienteId={expediente.id} />
        </div>
      </div>

      {/* Bitácora de actividades (ancho completo) */}
      <Actividades expedienteId={expediente.id} />
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
