"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExpedientes } from "@/context/expedientes-context";
import { ETAPAS, etapaAnterior, etapaSiguiente } from "@/lib/etapas";
import { EtapaBadge } from "./EtapaBadge";
import { FormulariosExpediente } from "./FormulariosExpediente";
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

  // Arma el enlace de WhatsApp con el mensaje y el enlace del portal.
  function enlaceWhatsApp(token: string, telefono: string, cliente: string) {
    const url = `${window.location.origin}/seguimiento/${token}`;
    const tel = telefono.replace(/\D/g, "");
    // Si no trae lada de país, anteponemos 52 (México).
    const numero = tel.length === 10 ? `52${tel}` : tel;
    const nombre = cliente.split(" ")[0] || "";
    const mensaje =
      `Hola ${nombre}, soy de SAUCEDA Bienes Raíces. ` +
      `Da seguimiento a tu trámite y completa tus formularios aquí: ${url}`;
    return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
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
    <div className="mx-auto max-w-2xl px-4 py-6">
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
            {expediente.cliente}
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

      {/* Prospecto (persona) dueño del expediente */}
      {expediente.prospectoId && (
        <Link
          href={`/prospectos/${expediente.prospectoId}`}
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-carbon/10 bg-white p-3 transition hover:border-sauce"
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

      {/* Enlace privado para el cliente vendedor */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cielo/30 bg-cielo/5 p-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-carbon/50">
            Portal del cliente
          </p>
          <p className="mt-0.5 text-sm text-carbon/70">
            Comparte el seguimiento de solo lectura de este expediente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => copiarEnlaceCliente(expediente.token)}
            className="rounded-md border border-cielo/40 bg-white px-3 py-2 text-sm text-cielo transition hover:bg-cielo hover:text-crema"
          >
            {copiado ? "¡Enlace copiado! ✓" : "Copiar enlace"}
          </button>
          {expediente.telefono && (
            <a
              href={enlaceWhatsApp(
                expediente.token,
                expediente.telefono,
                expediente.cliente,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-[#25D366] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Enviar por WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Avance por etapas */}
      <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-carbon/50">
          Avance del traspaso
        </p>
        <ol className="flex flex-wrap gap-2">
          {ETAPAS.map((etapa) => {
            const actual = etapa.id === expediente.etapa;
            const completada =
              etapa.orden < ETAPAS.find((e) => e.id === expediente.etapa)!.orden;
            return (
              <li
                key={etapa.id}
                className={`rounded-full px-3 py-1 text-xs ${
                  actual
                    ? "bg-verde-profundo text-crema"
                    : completada
                      ? "bg-sauce/20 text-verde-profundo"
                      : "bg-carbon/5 text-carbon/40"
                }`}
              >
                {etapa.nombre}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Datos del caso */}
      <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-carbon/10 bg-carbon/10 sm:grid-cols-2">
        <Dato etiqueta="Teléfono" valor={expediente.telefono} mono />
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

      {/* Formularios del cliente: enviar, retirar y ver respuestas
          (la información recopilada queda junto a los campos del expediente). */}
      <FormulariosExpediente expedienteId={expediente.id} />

      {/* Situación y notas */}
      <div className="mt-4 space-y-4">
        <Bloque titulo="Situación">{expediente.situacion}</Bloque>
        <Bloque titulo="Notas del asesor">{expediente.notas}</Bloque>
      </div>

      {/* Mover de etapa */}
      <div className="mt-6 rounded-xl border border-dorado/40 bg-dorado/5 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-carbon/50">
          Mover de etapa
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={!anterior}
            onClick={() => anterior && moverEtapa(expediente.id, anterior.id)}
            className="flex-1 rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon/70 transition enabled:hover:border-sauce enabled:hover:text-sauce disabled:opacity-30"
          >
            ← {anterior?.nombre ?? "Primera etapa"}
          </button>
          <button
            type="button"
            disabled={!siguiente}
            onClick={() => siguiente && moverEtapa(expediente.id, siguiente.id)}
            className="flex-1 rounded-md bg-sauce px-3 py-2 text-sm text-crema transition enabled:hover:bg-verde-profundo disabled:opacity-30"
          >
            {siguiente?.nombre ?? "Última etapa"} →
          </button>
        </div>
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
