"use client";

import { useEffect, useState } from "react";
import {
  eliminarMensajeEnviado,
  enviarMensaje,
  listarMensajes,
  listarMensajesDeExpediente,
} from "@/app/actions/mensajes";
import { aplicarParametros } from "@/lib/parametros";
import type { Mensaje, MensajeEnviado } from "@/lib/types";

/**
 * Bloque del detalle del expediente para enviar mensajes al cliente
 * (desde una plantilla o personalizados) y notificarlos por WhatsApp.
 */
export function MensajesExpediente({
  expedienteId,
  telefono,
  token,
  parametros = {},
}: {
  expedienteId: string;
  telefono: string;
  token: string;
  parametros?: Record<string, string>;
}) {
  const [plantillas, setPlantillas] = useState<Mensaje[]>([]);
  const [enviados, setEnviados] = useState<MensajeEnviado[]>([]);
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function cargar() {
    const [p, e] = await Promise.all([
      listarMensajes().catch(() => []),
      listarMensajesDeExpediente(expedienteId).catch(() => []),
    ]);
    setPlantillas(p);
    setEnviados(e);
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expedienteId]);

  function elegirPlantilla(id: string) {
    const p = plantillas.find((x) => x.id === id);
    if (p) {
      setTitulo(p.titulo);
      setTexto(p.texto);
    }
  }

  async function enviar() {
    if (!titulo.trim() || !texto.trim()) return;
    setEnviando(true);
    try {
      await enviarMensaje(expedienteId, titulo.trim(), texto.trim());
      setTitulo("");
      setTexto("");
      await cargar();
    } finally {
      setEnviando(false);
    }
  }

  function enlaceWhatsApp(tx: string) {
    const tel = telefono.replace(/\D/g, "");
    const numero = tel.length === 10 ? `52${tel}` : tel;
    const url = `${window.location.origin}/seguimiento/${token}`;
    // Resuelve los parámetros ({nombre}, etc.) y NO incluye el título.
    const textoResuelto = aplicarParametros(tx, parametros);
    const cuerpo = `${textoResuelto}\n\nVer en tu portal: ${url}`;
    return `https://wa.me/${numero}?text=${encodeURIComponent(cuerpo)}`;
  }

  const INPUT =
    "w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30";

  return (
    <div className="mt-6 rounded-xl border border-carbon/10 bg-white p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-carbon/50">
        Mensajes al cliente
      </p>

      {/* Componer */}
      <div className="space-y-2">
        {plantillas.length > 0 && (
          <select
            onChange={(e) => elegirPlantilla(e.target.value)}
            value=""
            className={INPUT}
          >
            <option value="">Usar plantilla…</option>
            {plantillas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titulo}
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título del mensaje"
          className={INPUT}
        />
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Escribe el mensaje (puedes usar {nombre}, etc.)"
          className={INPUT}
        />
        <button
          type="button"
          onClick={enviar}
          disabled={!titulo.trim() || !texto.trim() || enviando}
          className="rounded-md bg-sauce px-3 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo disabled:opacity-50"
        >
          {enviando ? "Enviando…" : "Enviar al portal del cliente"}
        </button>
      </div>

      {/* Enviados */}
      {enviados.length > 0 && (
        <ul className="mt-4 space-y-3">
          {enviados.map((m) => (
            <li
              key={m.id}
              className="rounded-lg border border-carbon/10 bg-crema/30 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-verde-profundo">
                  {m.titulo}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await eliminarMensajeEnviado(m.id);
                    await cargar();
                  }}
                  className="text-xs text-rojo/70 hover:text-rojo"
                >
                  Retirar
                </button>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm text-carbon/70">
                {m.texto}
              </p>
              {telefono && (
                <a
                  href={enlaceWhatsApp(m.texto)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block rounded-md bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                >
                  Notificar por WhatsApp
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
