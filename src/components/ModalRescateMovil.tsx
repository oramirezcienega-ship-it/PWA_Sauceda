"use client";

import { useEffect, useState, useTransition } from "react";
import {
  obtenerEstadoEvolutionAction,
  enviarRescateMovilAction,
} from "@/app/actions/evolution-api";
import { generarMensajeRescate } from "@/lib/evolution-api";
import { normalizarTelefono } from "@/lib/telefono";

interface ModalRescateMovilProps {
  abierto: boolean;
  onCerrar: () => void;
  telefono: string;
  clienteNombre?: string;
  expedienteId?: string;
  prospectoId?: string;
  proyecto?: string;
  tipoNegocio?: string | null;
  colonia?: string;
  onEnviado?: () => void;
}

export function ModalRescateMovil({
  abierto,
  onCerrar,
  telefono,
  clienteNombre,
  expedienteId,
  prospectoId,
  proyecto,
  tipoNegocio,
  colonia,
  onEnviado,
}: ModalRescateMovilProps) {
  const [isPending, startTransition] = useTransition();
  const [copiado, setCopiado] = useState(false);
  const [enviadoExito, setEnviadoExito] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  // Datos del mensaje
  const expFolio = expedienteId || "EXP-001";
  const { textoCompleto, enlacePuente, textoPrellenadoWhatsApp } = generarMensajeRescate({
    clienteNombre,
    proyecto: proyecto || "remodelación",
    tipoNegocio,
    colonia,
    expedienteId: expFolio,
  });

  const [mensajeEditable, setMensajeEditable] = useState(textoCompleto);

  // Estado de conexión de Evolution API
  const [estadoEvolution, setEstadoEvolution] = useState<{
    cargando: boolean;
    online: boolean;
    estado: string;
    mensaje: string;
  }>({
    cargando: true,
    online: false,
    estado: "verificando",
    mensaje: "Comprobando servidor Proxmox...",
  });

  useEffect(() => {
    if (abierto) {
      setMensajeEditable(textoCompleto);
      setCopiado(false);
      setEnviadoExito(false);
      setErrorEnvio(null);

      // Comprobar estado de Evolution API
      setEstadoEvolution((prev) => ({ ...prev, cargando: true }));
      obtenerEstadoEvolutionAction()
        .then((res) => {
          setEstadoEvolution({
            cargando: false,
            online: res.online,
            estado: res.estado,
            mensaje: res.mensaje,
          });
        })
        .catch(() => {
          setEstadoEvolution({
            cargando: false,
            online: false,
            estado: "error",
            mensaje: "No se pudo consultar el servidor de Evolution API (192.168.100.253).",
          });
        });
    }
  }, [abierto, textoCompleto]);

  if (!abierto) return null;

  const telLimpio = normalizarTelefono(telefono);
  const telWA = telLimpio.startsWith("52") && telLimpio.length === 12 && !telLimpio.startsWith("521")
    ? `521${telLimpio.slice(2)}`
    : telLimpio;

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(mensajeEditable);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      setCopiado(false);
    }
  };

  const handleEnviarEvolution = () => {
    setErrorEnvio(null);
    startTransition(async () => {
      const res = await enviarRescateMovilAction({
        telefono: telLimpio,
        mensaje: mensajeEditable,
        expedienteId,
        prospectoId,
      });

      if (res.ok) {
        setEnviadoExito(true);
        if (onEnviado) onEnviado();
        setTimeout(() => {
          onCerrar();
        }, 1500);
      } else {
        setErrorEnvio(res.error || "No se pudo enviar el mensaje por Evolution API.");
      }
    });
  };

  const enlaceWADirecto = `https://wa.me/${telWA}?text=${encodeURIComponent(mensajeEditable)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Encabezado */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl shrink-0 border border-white/20">
              📲
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
                <span>Mensaje de Rescate Móvil</span>
                <span className="text-[10px] font-mono bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-400/30">
                  Doble Línea
                </span>
              </h3>
              <p className="text-xs text-slate-300">
                Línea secundaria para reactivar al cliente con enlace puente al canal oficial.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-slate-700 text-sm">
          {/* Ficha rápida de datos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block">Destinatario</span>
              <span className="font-semibold text-slate-900 truncate block">{clienteNombre || "Cliente"}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block">Teléfono</span>
              <span className="font-mono text-slate-900 truncate block">{telefono}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block">Expediente</span>
              <span className="font-mono font-bold text-emerald-800 truncate block">{expFolio}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block">Proyecto</span>
              <span className="font-medium text-slate-900 truncate block">{proyecto || "Remodelación"}</span>
            </div>
          </div>

          {/* Estado de Evolution API */}
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border bg-slate-50 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  estadoEvolution.cargando
                    ? "bg-amber-400 animate-pulse"
                    : estadoEvolution.online
                    ? "bg-emerald-500 ring-2 ring-emerald-200"
                    : "bg-rose-500"
                }`}
              />
              <span className="font-medium text-slate-700">
                <strong>Línea Móvil Secundaria (Evolution API):</strong>{" "}
                <span className="text-slate-600">{estadoEvolution.mensaje}</span>
              </span>
            </div>
            <span className="font-mono text-[10px] text-slate-500 hidden sm:inline">Proxmox 8080</span>
          </div>

          {/* Editor del Mensaje */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>💬 Texto del mensaje saliente:</span>
              </label>
              <span className="text-[10px] text-slate-500">Incluye token [{expFolio}] para el handshake</span>
            </div>
            <textarea
              rows={6}
              value={mensajeEditable}
              onChange={(e) => setMensajeEditable(e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-3 text-xs leading-relaxed font-sans text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 outline-none bg-white resize-none"
            />
          </div>

          {/* Vista previa del enlace puente */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-bold text-emerald-950 flex items-center gap-1">
                <span>🔗 Enlace Puente (Abre la ventana oficial):</span>
              </span>
              <span className="font-mono text-[10px] text-emerald-700">wa.me</span>
            </div>
            <div className="p-2 bg-white rounded-lg border border-emerald-300 font-mono text-[11px] text-slate-700 break-all select-all">
              {enlacePuente}
            </div>
            <p className="mt-1.5 text-[11px] text-emerald-800 leading-snug">
              Al tocar el enlace, el cliente escribirá: <em>&ldquo;{textoPrellenadoWhatsApp}&rdquo;</em>. El sistema
              detectará el token <strong>[{expFolio}]</strong> y abrirá la ventana de 24h con Sofía en contexto
              completo.
            </p>
          </div>

          {/* Mensajes de éxito / error */}
          {enviadoExito && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <span>🎉</span>
              <span>¡Mensaje de rescate despachado con éxito por la línea secundaria!</span>
            </div>
          )}

          {errorEnvio && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorEnvio}</span>
            </div>
          )}
        </div>

        {/* Pie de controles */}
        <div className="bg-slate-100 p-4 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopiar}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs border ${
                copiado
                  ? "bg-emerald-600 text-white border-emerald-700"
                  : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>{copiado ? "✓" : "📋"}</span>
              <span>{copiado ? "¡Copiado!" : "Copiar Texto"}</span>
            </button>

            <a
              href={enlaceWADirecto}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs border border-emerald-600 bg-white text-emerald-800 hover:bg-emerald-50"
            >
              <span>💬</span>
              <span>Abrir WhatsApp Web</span>
            </a>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCerrar}
              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
            >
              Cerrar
            </button>

            <button
              type="button"
              onClick={handleEnviarEvolution}
              disabled={isPending || !estadoEvolution.online || enviadoExito}
              title={
                !estadoEvolution.online
                  ? "Evolution API no está conectada en Proxmox"
                  : "Enviar automáticamente desde el número móvil secundario"
              }
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <span>{isPending ? "⏳" : "🚀"}</span>
              <span>{isPending ? "Enviando..." : "Enviar por Línea Secundaria"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
