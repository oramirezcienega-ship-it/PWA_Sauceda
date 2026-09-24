"use client";

import React, { useState, useEffect } from "react";
import {
  consultarEstadoConexionTikTok,
  guardarCredencialesTikTok,
} from "@/app/actions/marketing";
import type { EstadoConexionTikTok } from "@/lib/tiktok-publicador";

interface ModalConexionTikTokProps {
  abierto: boolean;
  onCerrar: () => void;
  onConexionActualizada?: () => void;
}

export default function ModalConexionTikTok({
  abierto,
  onCerrar,
  onConexionActualizada,
}: ModalConexionTikTokProps) {
  const [cargando, setCargando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const [accessToken, setAccessToken] = useState("");
  const [openId, setOpenId] = useState("");
  const [clientKey, setClientKey] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [mostrarToken, setMostrarToken] = useState(false);

  const [estado, setEstado] = useState<EstadoConexionTikTok | null>(null);

  // Cargar estado inicial al abrir el modal
  useEffect(() => {
    if (abierto) {
      setMensajeExito(null);
      setMensajeError(null);
      setCargando(true);
      consultarEstadoConexionTikTok()
        .then((res) => {
          if (res.data) {
            setEstado(res.data);
            if (res.data.usuario?.openId) setOpenId(res.data.usuario.openId);
            if (!res.data.ok && res.data.error) {
              setMensajeError(res.data.error);
            }
          } else if (res.error) {
            setMensajeError(res.error);
          }
        })
        .catch((err) => {
          console.error("Error al cargar estado de TikTok:", err);
        })
        .finally(() => setCargando(false));
    }
  }, [abierto]);

  if (!abierto) return null;

  const handleProbarConexion = async () => {
    setProbando(true);
    setMensajeExito(null);
    setMensajeError(null);
    try {
      const res = await consultarEstadoConexionTikTok(accessToken || undefined, openId || undefined);
      if (res.data) {
        setEstado(res.data);
        if (res.data.ok) {
          setMensajeExito("¡Conexión exitosa con la API de TikTok! La cuenta está vinculada y lista para publicar.");
        } else {
          setMensajeError(res.data.error || "TikTok rechazó la conexión.");
        }
      } else {
        setMensajeError(res.error || "Error al conectar con TikTok.");
      }
    } catch (err: any) {
      setMensajeError(err?.message || "Error al probar conexión con TikTok.");
    } finally {
      setProbando(false);
    }
  };

  const handleGuardar = async () => {
    if (!accessToken && !estado?.tokenConfigurado) {
      setMensajeError("Por favor ingresa un Access Token de TikTok.");
      return;
    }

    setGuardando(true);
    setMensajeExito(null);
    setMensajeError(null);
    try {
      const res = await guardarCredencialesTikTok({
        accessToken: accessToken ? accessToken.trim() : undefined,
        openId: openId ? openId.trim() : undefined,
        clientKey: clientKey ? clientKey.trim() : undefined,
        clientSecret: clientSecret ? clientSecret.trim() : undefined,
      });

      if (res.success) {
        setMensajeExito("Credenciales de TikTok guardadas exitosamente en el CRM.");
        // Probar conexión con las credenciales recién guardadas
        const testRes = await consultarEstadoConexionTikTok(accessToken || undefined, openId || undefined);
        if (testRes.data) setEstado(testRes.data);
        if (onConexionActualizada) onConexionActualizada();
      } else {
        setMensajeError(res.error || "Error al guardar credenciales.");
      }
    } catch (err: any) {
      setMensajeError(err?.message || "Error al guardar credenciales.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-dorado/30 flex flex-col max-h-[92vh]">
        {/* Cabecera TikTok Estilo Neon */}
        <div className="bg-gradient-to-r from-[#010101] via-[#111827] to-[#010101] p-5 text-white flex items-center justify-between shrink-0 border-b border-cyan-500/30">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-black border border-cyan-400/40 flex items-center justify-center shadow-md">
              <span className="text-2xl">🎵</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold tracking-widest text-[#00f2fe] uppercase">
                  Conexión Oficial
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#ff004f]/20 text-[#ff004f] border border-[#ff004f]/40">
                  TikTok Content API v2
                </span>
              </div>
              <h3 className="text-lg font-bold font-display text-white">
                Publicador Directo en TikTok
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-sm cursor-pointer transition"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="p-6 overflow-y-auto space-y-5 text-carbon">
          {/* Mensajes de Alerta */}
          {mensajeExito && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <span>✅</span>
              <span>{mensajeExito}</span>
            </div>
          )}

          {mensajeError && (
            <div className="p-3.5 bg-red-50 border border-red-300 rounded-2xl text-red-800 text-xs font-semibold flex items-start gap-2 animate-in fade-in">
              <span className="shrink-0">⚠️</span>
              <span className="leading-relaxed">{mensajeError}</span>
            </div>
          )}

          {/* Estado Actual de la Conexión */}
          <div className="bg-gray-50 border border-dorado/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-carbon/70 uppercase tracking-wider">
                Estado de la Conexión
              </span>
              {cargando ? (
                <span className="text-xs text-carbon/50">Consultando...</span>
              ) : estado?.ok ? (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Conectado y Listo
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {estado?.tokenConfigurado ? "Token Inválido o Expirado" : "No Conectado"}
                </span>
              )}
            </div>

            {/* Tarjeta de Cuenta de TikTok */}
            {estado?.usuario && (
              <div className="bg-white rounded-xl p-3 border border-gray-200 flex items-center gap-3">
                {estado.usuario.avatar ? (
                  <img
                    src={estado.usuario.avatar}
                    alt={estado.usuario.nombre || "TikTok"}
                    className="w-12 h-12 rounded-full object-cover border border-cyan-400/40"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center font-bold text-lg border border-cyan-400">
                    🎵
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-carbon truncate">
                      {estado.usuario.nombre || "Sauceda Oficial"}
                    </span>
                    {estado.usuario.verificado && (
                      <span className="text-cyan-500 text-xs" title="Cuenta Verificada">
                        ☑️
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <a
                      href={estado.usuario.link || "https://www.tiktok.com/@saucedamxbr"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-cyan-600 hover:underline font-mono"
                    >
                      @saucedamxbr ↗
                    </a>
                  </div>
                  {estado.usuario.bio && (
                    <p className="text-[11px] text-carbon/60 line-clamp-1 mt-0.5">
                      {estado.usuario.bio}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Formulario de Configuración de Credenciales */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-carbon">
                  TikTok Access Token (Bearer Token):
                </label>
                <button
                  type="button"
                  onClick={() => setMostrarToken(!mostrarToken)}
                  className="text-[11px] text-verde-profundo font-semibold hover:underline cursor-pointer"
                >
                  {mostrarToken ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <input
                type={mostrarToken ? "text" : "password"}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={
                  estado?.tokenConfigurado
                    ? "••••••••••••••••••••••••••••••••••••••••"
                    : "act.exampleAccessToken123..."
                }
                className="w-full bg-white border border-dorado/30 rounded-xl px-3.5 py-2.5 text-xs font-mono text-carbon focus:outline-none focus:border-verde-profundo transition"
              />
              <p className="text-[11px] text-carbon/50 mt-1">
                Generado desde la App de TikTok Developers con permisos:{" "}
                <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px] text-cyan-700 font-bold">
                  video.publish
                </code>
                ,{" "}
                <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px] text-cyan-700 font-bold">
                  video.upload
                </code>{" "}
                y{" "}
                <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px] text-cyan-700 font-bold">
                  user.info.basic
                </code>
                .
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-carbon block mb-1.5">
                  Open ID (Opcional):
                </label>
                <input
                  type="text"
                  value={openId}
                  onChange={(e) => setOpenId(e.target.value)}
                  placeholder="ID de usuario de TikTok"
                  className="w-full bg-white border border-dorado/30 rounded-xl px-3 py-2 text-xs font-mono text-carbon focus:outline-none focus:border-verde-profundo transition"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-carbon block mb-1.5">
                  Client Key (App ID):
                </label>
                <input
                  type="text"
                  value={clientKey}
                  onChange={(e) => setClientKey(e.target.value)}
                  placeholder="awxxxxxxxxxxxx"
                  className="w-full bg-white border border-dorado/30 rounded-xl px-3 py-2 text-xs font-mono text-carbon focus:outline-none focus:border-verde-profundo transition"
                />
              </div>
            </div>

            {/* Guía Rápida */}
            <div className="p-3.5 bg-cyan-50/60 border border-cyan-200 rounded-2xl text-[11px] text-cyan-950 space-y-1 leading-relaxed">
              <span className="font-bold flex items-center gap-1 text-cyan-900">
                <span>💡</span> ¿Cómo funciona la publicación en TikTok?
              </span>
              <p>
                Al dar clic en <strong>Publicar TikTok</strong> o programar publicaciones en la agenda, el CRM enviará el contenido automáticamente a la cuenta de TikTok de Sauceda. Puedes publicar tanto <strong>videos directos (.mp4)</strong> como <strong>imágenes y carruseles publicitarios</strong> generados con IA.
              </p>
            </div>
          </div>
        </div>

        {/* Pie con Acciones */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleProbarConexion}
            disabled={probando || cargando}
            className="px-4 py-2 bg-white hover:bg-gray-100 border border-dorado/40 text-carbon font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>🔄</span> {probando ? "Verificando..." : "Probar Conexión"}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCerrar}
              className="px-4 py-2 text-xs font-semibold text-carbon/70 hover:text-carbon cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleGuardar}
              disabled={guardando || cargando}
              className="px-5 py-2 bg-black hover:bg-neutral-800 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 border border-cyan-400/40"
            >
              <span>💾</span> {guardando ? "Guardando..." : "Guardar y Conectar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
