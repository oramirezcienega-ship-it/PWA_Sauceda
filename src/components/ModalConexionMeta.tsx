"use client";

import React, { useState, useEffect } from "react";
import {
  consultarEstadoConexionMeta,
  guardarCredencialesMeta,
} from "@/app/actions/marketing";
import type { EstadoConexionMeta } from "@/lib/meta-publicador";

interface ModalConexionMetaProps {
  abierto: boolean;
  onCerrar: () => void;
  onConexionActualizada?: () => void;
}

export default function ModalConexionMeta({
  abierto,
  onCerrar,
  onConexionActualizada,
}: ModalConexionMetaProps) {
  const [cargando, setCargando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const [pageId, setPageId] = useState("61589957630232");
  const [token, setToken] = useState("");
  const [instagramId, setInstagramId] = useState("");
  const [mostrarToken, setMostrarToken] = useState(false);

  const [estado, setEstado] = useState<EstadoConexionMeta | null>(null);

  // Cargar estado inicial al abrir
  useEffect(() => {
    if (abierto) {
      setMensajeExito(null);
      setMensajeError(null);
      setCargando(true);
      consultarEstadoConexionMeta()
        .then((res) => {
          if (res.data) {
            setEstado(res.data);
            if (res.data.pagina?.id) setPageId(res.data.pagina.id);
            if (res.data.instagram?.id) setInstagramId(res.data.instagram.id);
            if (!res.data.ok && res.data.error) {
              setMensajeError(res.data.error);
            }
          } else if (res.error) {
            setMensajeError(res.error);
          }
        })
        .catch((err) => {
          console.error("Error al cargar estado de Meta:", err);
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
      const res = await consultarEstadoConexionMeta(token || undefined, pageId || undefined);
      if (res.data) {
        setEstado(res.data);
        if (res.data.ok) {
          setMensajeExito("¡Conexión exitosa con Meta Graph API! Las credenciales tienen acceso válido.");
          if (res.data.instagram?.id && !instagramId) {
            setInstagramId(res.data.instagram.id);
          }
        } else {
          setMensajeError(res.data.error || "Meta rechazó la conexión.");
        }
      } else {
        setMensajeError(res.error || "Error al conectar.");
      }
    } catch (err: any) {
      setMensajeError(err?.message || "Error al probar conexión con Meta.");
    } finally {
      setProbando(false);
    }
  };

  const handleGuardar = async () => {
    setGuardando(true);
    setMensajeExito(null);
    setMensajeError(null);
    try {
      const res = await guardarCredencialesMeta({
        pageId: pageId.trim(),
        pageAccessToken: token ? token.trim() : undefined,
        instagramId: instagramId ? instagramId.trim() : undefined,
      });

      if (res.success) {
        setMensajeExito("Credenciales de Meta guardadas exitosamente en el CRM.");
        // Re-probar conexión
        const testRes = await consultarEstadoConexionMeta(token || undefined, pageId || undefined);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-dorado/30 flex flex-col max-h-[92vh]">
        {/* Cabecera */}
        <div className="bg-gradient-to-r from-[#1877F2] via-[#833AB4] to-[#FD1D1D] p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xl shadow-xs">
              🔗
            </div>
            <div>
              <h3 className="font-titular text-lg font-bold">Conexión Meta & Instagram</h3>
              <p className="text-xs text-white/80">Publicación nativa directa en Facebook e Instagram</p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-sm font-bold transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 overflow-y-auto space-y-5 text-carbon">
          {/* Tarjeta de Diagnóstico / Estado Actual */}
          <div className="rounded-2xl border p-4.5 bg-gray-50/70 border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-carbon/60">
                Estado de la Conexión en Vivo
              </span>
              {cargando ? (
                <span className="text-xs text-carbon/50 animate-pulse">Verificando...</span>
              ) : estado?.ok ? (
                <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  🟢 Conectado con Meta
                </span>
              ) : (
                <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full border border-amber-300">
                  ⚪ Pendiente de Token
                </span>
              )}
            </div>

            {/* Detalles de Página de Facebook */}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔵</span>
                  <div>
                    <p className="font-bold text-carbon">
                      {estado?.pagina?.nombre || "Página de Facebook Sauceda"}
                    </p>
                    <p className="text-[11px] text-carbon/50 font-mono">
                      ID: {estado?.pagina?.id || pageId}
                    </p>
                  </div>
                </div>
                {estado?.pagina?.link && (
                  <a
                    href={estado.pagina.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-blue-600 hover:underline font-semibold"
                  >
                    Ver Página ↗
                  </a>
                )}
              </div>

              {/* Detalles de Instagram */}
              <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="text-base">🟣</span>
                  <div>
                    <p className="font-bold text-carbon">
                      {estado?.instagram?.usuario ? `@${estado.instagram.usuario}` : "Cuenta Profesional de Instagram"}
                    </p>
                    <p className="text-[11px] text-carbon/50 font-mono">
                      {estado?.instagram?.id ? `ID: ${estado.instagram.id}` : "Auto-descubrimiento activo"}
                    </p>
                  </div>
                </div>
                {estado?.instagram?.usuario && (
                  <a
                    href={`https://instagram.com/${estado.instagram.usuario}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-pink-600 hover:underline font-semibold"
                  >
                    Ver Perfil ↗
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Mensajes de Alerta */}
          {mensajeExito && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
              <span>✅</span>
              <span>{mensajeExito}</span>
            </div>
          )}
          {mensajeError && (
            <div className="p-3.5 bg-red-50 border border-red-300 rounded-xl text-xs text-red-900 flex items-start gap-2">
              <span className="text-base">⚠️</span>
              <div className="flex-1">
                <strong className="block font-semibold">Aviso de Meta Graph API:</strong>
                <p className="mt-0.5 leading-relaxed">{mensajeError}</p>
              </div>
            </div>
          )}

          {/* Formulario de Configuración de Credenciales */}
          <div className="space-y-4 pt-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-carbon/70">
              Credenciales de Acceso Meta Graph API
            </h4>

            {/* Page ID */}
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Facebook Page ID
              </label>
              <input
                type="text"
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                placeholder="61589957630232"
                className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-verde-profundo/30 bg-white"
              />
              <span className="text-[10px] text-carbon/50 mt-1 block">
                ID de la Página de Facebook de Sauceda Inmobiliaria & Construcción.
              </span>
            </div>

            {/* Page Access Token */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-carbon/80">
                  Page Access Token o System User Token
                </label>
                <button
                  type="button"
                  onClick={() => setMostrarToken(!mostrarToken)}
                  className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
                >
                  {mostrarToken ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <input
                type={mostrarToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={estado?.tokenConfigurado ? "•••••••••••••••••••••••• (Token guardado)" : "EAA..."}
                className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-verde-profundo/30 bg-white"
              />
              <span className="text-[10px] text-carbon/50 mt-1 block">
                Permisos requeridos en Meta: <code>pages_manage_posts</code>, <code>pages_read_engagement</code>, <code>instagram_content_publish</code>.
              </span>
            </div>

            {/* Instagram Account ID (Opcional) */}
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Instagram Business Account ID (Opcional)
              </label>
              <input
                type="text"
                value={instagramId}
                onChange={(e) => setInstagramId(e.target.value)}
                placeholder="178414..."
                className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-verde-profundo/30 bg-white"
              />
              <span className="text-[10px] text-carbon/50 mt-1 block">
                Si lo dejas en blanco, el CRM lo detectará automáticamente desde la Página vinculada.
              </span>
            </div>
          </div>

          {/* Guía Rápida */}
          <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl text-[11px] text-blue-950 space-y-1">
            <span className="font-bold flex items-center gap-1">
              <span>💡</span> ¿Dónde obtener el token permanente?
            </span>
            <p className="leading-relaxed">
              En tu <strong>Meta Business Suite</strong> → Configuración del Negocio → Usuarios del Sistema → Agregar usuario del sistema y asignar activos (Página de Facebook y Cuenta de Instagram) con los permisos de publicación de contenido.
            </p>
          </div>
        </div>

        {/* Pie del Modal */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleProbarConexion}
            disabled={probando}
            className="bg-white hover:bg-gray-100 border border-gray-300 text-carbon font-semibold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-2xs disabled:opacity-60"
          >
            <span>{probando ? "🔄" : "🔍"}</span>
            <span>{probando ? "Probando..." : "Probar Conexión"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCerrar}
              className="bg-gray-200 hover:bg-gray-300 text-carbon/80 font-bold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleGuardar}
              disabled={guardando}
              className="bg-verde-profundo hover:bg-verde-profundo/90 text-crema font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <span>{guardando ? "💾 Guardando..." : "Guardar Cambios"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
