"use client";

import React, { useState, useEffect } from "react";
import {
  compartirExpedienteWhatsAppLineaPrincipal,
  obtenerUrlPortalExpedienteAction,
} from "@/app/actions/expedientes";
import { normalizarTelefono } from "@/lib/telefono";

interface ModalCompartirExpedienteWhatsAppProps {
  abierto: boolean;
  onCerrar: () => void;
  expedienteId: string;
  clienteNombre?: string;
  clienteTelefono?: string;
  folioExpediente?: string;
  onEnviado?: () => void;
}

export function ModalCompartirExpedienteWhatsApp({
  abierto,
  onCerrar,
  expedienteId,
  clienteNombre = "Cliente",
  clienteTelefono = "",
  folioExpediente,
  onEnviado,
}: ModalCompartirExpedienteWhatsAppProps) {
  const [telefono, setTelefono] = useState(clienteTelefono);
  const [mensaje, setMensaje] = useState("");
  const [urlPortal, setUrlPortal] = useState("");
  const [cargandoPortal, setCargandoPortal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setTelefono(clienteTelefono);
    setResultado(null);
    setCargandoPortal(true);

    obtenerUrlPortalExpedienteAction(expedienteId)
      .then((res) => {
        const url = res.url || `https://crm.saucedamx.com/expediente-cliente/${expedienteId}`;
        setUrlPortal(url);
        const primerNombre = clienteNombre.split(" ")[0] || clienteNombre;
        setMensaje(
          `¡Hola ${primerNombre}! 👋 Te compartimos el enlace oficial para consultar tu expediente y el seguimiento de tu servicio con SAUCEDA:\n\n🔗 ${url}\n\nPuedes revisar la información, documentos y estado en cualquier momento.`
        );
      })
      .catch((e) => {
        setResultado({ tipo: "error", texto: e?.message || "No se pudo generar la liga del portal." });
      })
      .finally(() => {
        setCargandoPortal(false);
      });
  }, [abierto, expedienteId, clienteNombre, clienteTelefono]);

  if (!abierto) return null;

  const handleCopiarEnlace = async () => {
    if (!urlPortal) return;
    try {
      await navigator.clipboard.writeText(urlPortal);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  };

  const handleEnviarLineaPrincipal = async () => {
    if (!telefono.trim()) {
      setResultado({ tipo: "error", texto: "Debes ingresar un número telefónico válido." });
      return;
    }

    try {
      setEnviando(true);
      setResultado(null);

      const res = await compartirExpedienteWhatsAppLineaPrincipal({
        expedienteId,
        telefonoDestino: telefono.trim(),
        mensajePersonalizado: mensaje.trim(),
      });

      if (res.ok) {
        setResultado({ tipo: "ok", texto: res.mensaje || "Expediente enviado por la línea principal con éxito." });
        if (onEnviado) onEnviado();
        setTimeout(() => {
          onCerrar();
        }, 1800);
      } else {
        setResultado({ tipo: "error", texto: res.error || "No se pudo entregar por WhatsApp Cloud API." });
      }
    } catch (e: any) {
      setResultado({ tipo: "error", texto: e?.message || "Error al procesar el envío." });
    } finally {
      setEnviando(false);
    }
  };

  const telNormalizado = normalizarTelefono(telefono);
  const enlaceWaWeb = `https://wa.me/${telNormalizado}?text=${encodeURIComponent(mensaje)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4 animate-in fade-in duration-150 font-cuerpo">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-carbon/10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabecera */}
        <div className="bg-gradient-to-r from-emerald-800 via-verde-profundo to-teal-900 text-white p-4 sm:p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xl border border-white/20 shrink-0">
              💬
            </span>
            <div>
              <h3 className="font-titular font-bold text-base sm:text-lg flex items-center gap-2">
                <span>Compartir Expediente</span>
                <span className="font-mono text-[10px] bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.2 rounded-full">
                  {folioExpediente || expedienteId}
                </span>
              </h3>
              <p className="text-[11px] text-emerald-100/80">
                Envío oficial desde la Línea Principal de SAUCEDA (Meta Cloud API)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="text-white/60 hover:text-white text-lg font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Contenido */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {resultado && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 ${
                resultado.tipo === "ok"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-rose-50 border-rose-300 text-rose-800"
              }`}
            >
              <span className="text-base">{resultado.tipo === "ok" ? "✓" : "⚠"}</span>
              <span className="font-medium">{resultado.texto}</span>
            </div>
          )}

          {/* Destinatario */}
          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase font-bold text-carbon/50">
              Destinatario y Teléfono
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                readOnly
                value={clienteNombre}
                className="w-full sm:w-1/2 rounded-xl border border-carbon/20 bg-slate-50 px-3 py-2 text-xs text-carbon font-semibold"
                placeholder="Nombre del cliente"
              />
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="10 dígitos (ej. 4771234567)"
                className="w-full sm:w-1/2 rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon font-mono focus:border-sauce outline-none bg-white"
              />
            </div>
          </div>

          {/* Enlace al Portal del Cliente */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-blue-900">
              <span className="flex items-center gap-1.5">
                <span>🌐</span> Portal Público del Cliente
              </span>
              <button
                type="button"
                onClick={handleCopiarEnlace}
                disabled={cargandoPortal || !urlPortal}
                className="text-blue-700 hover:text-blue-950 font-bold lowercase hover:underline cursor-pointer"
              >
                {copiado ? "✓ copiado" : "copiar liga"}
              </button>
            </div>
            <div className="font-mono text-[11px] text-blue-800 truncate select-all">
              {cargandoPortal ? "Generando token seguro del portal..." : urlPortal}
            </div>
          </div>

          {/* Mensaje editable */}
          <div className="space-y-1.5">
            <label className="block text-[10px] uppercase font-bold text-carbon/50">
              Mensaje de WhatsApp
            </label>
            <textarea
              rows={5}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              className="w-full rounded-xl border border-carbon/20 p-3 text-xs text-carbon focus:border-sauce outline-none leading-relaxed font-cuerpo bg-white"
              placeholder="Escribe el mensaje para el cliente..."
            />
          </div>

          <div className="rounded-xl bg-slate-50 p-2.5 text-[11px] text-carbon/60 flex items-start gap-2 border border-carbon/10">
            <span className="text-base shrink-0">💡</span>
            <span>
              Este mensaje se enviará a través de la <strong>línea oficial de SAUCEDA en WhatsApp</strong> y quedará registrado automáticamente en el historial de conversaciones del CRM.
            </span>
          </div>
        </div>

        {/* Acciones */}
        <div className="bg-slate-50 border-t border-carbon/10 p-4 flex flex-wrap items-center justify-between gap-2.5">
          <a
            href={enlaceWaWeb}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-carbon/20 bg-white hover:bg-slate-100 text-carbon/70 text-xs font-semibold px-3 py-2 transition inline-flex items-center gap-1.5"
            title="Abrir como borrador en WhatsApp Web / Móvil personal"
          >
            <span>💬</span> Abrir en WhatsApp Web
          </a>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-xl border border-carbon/20 bg-white hover:bg-slate-100 text-carbon/80 text-xs font-semibold px-3.5 py-2 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleEnviarLineaPrincipal}
              disabled={enviando || cargandoPortal || !telefono.trim()}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 transition shadow-sm inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>{enviando ? "⏳" : "🚀"}</span>
              <span>{enviando ? "Enviando por Línea Principal…" : "Enviar por Línea Principal"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
