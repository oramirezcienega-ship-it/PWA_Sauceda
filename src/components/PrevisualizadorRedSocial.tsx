"use client";

import React, { useState, useEffect } from "react";
import {
  PublicacionProgramada,
  obtenerPublicacionPorId,
  ejecutarPublicacionMeta,
  ejecutarEnvioMautic,
  enviarPruebaWhatsAppMarketing,
} from "@/app/actions/marketing";
import { listarPlantillasWhatsApp } from "@/app/actions/whatsapp";
import type { PlantillaWhatsApp } from "@/lib/whatsapp";

interface PrevisualizadorRedSocialProps {
  publicacion: PublicacionProgramada;
  abierto: boolean;
  onCerrar: () => void;
  onEditar?: (pub: PublicacionProgramada) => void;
  onProgramar?: (pub: PublicacionProgramada) => void;
  onRegenerarCreativo?: (id: string) => void;
  onReemplazarArte?: (id: string) => void;
  onSubirVideo?: (pub: PublicacionProgramada) => void;
  onReplicar?: (pub: PublicacionProgramada) => void;
  onPublicado?: (pub: PublicacionProgramada) => void;
}

export default function PrevisualizadorRedSocial({
  publicacion,
  abierto,
  onCerrar,
  onEditar,
  onProgramar,
  onRegenerarCreativo,
  onReemplazarArte,
  onSubirVideo,
  onReplicar,
  onPublicado,
}: PrevisualizadorRedSocialProps) {
  const [pubActual, setPubActual] = useState<PublicacionProgramada>(publicacion);
  const [plataformaActiva, setPlataformaActiva] = useState<string>("facebook");
  const [expandirTexto, setExpandirTexto] = useState(false);
  const [liked, setLiked] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [publicandoMeta, setPublicandoMeta] = useState(false);
  const [mostrarModalPruebaWA, setMostrarModalPruebaWA] = useState(false);
  const [telefonoPruebaWA, setTelefonoPruebaWA] = useState("");
  const [viaPruebaWA, setViaPruebaWA] = useState<"plantilla_meta" | "directo_meta" | "webhook_mautic">("plantilla_meta");
  const [plantillasWA, setPlantillasWA] = useState<PlantillaWhatsApp[]>([]);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<string>("reactivacion_impermeabilizacio");
  const [nombreDestinatarioPrueba, setNombreDestinatarioPrueba] = useState<string>("Oscar");
  const [cargandoPlantillasWA, setCargandoPlantillasWA] = useState(false);
  const [enviandoPruebaWA, setEnviandoPruebaWA] = useState(false);
  const [mensajeFeedback, setMensajeFeedback] = useState<{
    tipo: "exito" | "error";
    texto: string;
    url?: string;
  } | null>(null);

  // Cargar plantillas de WhatsApp aprobadas cuando se abre el modal de prueba
  useEffect(() => {
    if (mostrarModalPruebaWA && plantillasWA.length === 0) {
      setCargandoPlantillasWA(true);
      listarPlantillasWhatsApp()
        .then((res) => {
          if (res.ok && res.plantillas && res.plantillas.length > 0) {
            const aprobadas = res.plantillas.filter(
              (p) => p.estado === "APPROVED" && p.nombre !== "hello_world"
            );
            setPlantillasWA(aprobadas);
            // Preseleccionar plantilla según el contenido del post
            const contenidoLower = ((pubActual?.contenido || "") + " " + (pubActual?.titulo || "")).toLowerCase();
            if (contenidoLower.includes("impermea") || contenidoLower.includes("gotera") || contenidoLower.includes("techo") || contenidoLower.includes("lluvia")) {
              setPlantillaSeleccionada("reactivacion_impermeabilizacio");
            } else if (contenidoLower.includes("compram") || contenidoLower.includes("contado") || contenidoLower.includes("liquida")) {
              setPlantillaSeleccionada("reactivacion_compra_directa");
            } else if (contenidoLower.includes("vend") || contenidoLower.includes("propiedad")) {
              setPlantillaSeleccionada("reactivacion_promocion_venta");
            } else if (contenidoLower.includes("infonavit") || contenidoLower.includes("tramite") || contenidoLower.includes("credito")) {
              setPlantillaSeleccionada("reactivacion_solo_tramite");
            } else if (aprobadas.length > 0) {
              setPlantillaSeleccionada(aprobadas[0].nombre);
            }
          }
        })
        .catch((err) => console.warn("Error cargando plantillas de WhatsApp:", err))
        .finally(() => setCargandoPlantillasWA(false));
    }
  }, [mostrarModalPruebaWA, plantillasWA.length, pubActual]);

  const handleEnviarPruebaWA = async () => {
    if (!pubActual?.id || !telefonoPruebaWA.trim()) {
      alert("Por favor ingresa un número de teléfono de 10 dígitos.");
      return;
    }
    setEnviandoPruebaWA(true);
    try {
      const res = await enviarPruebaWhatsAppMarketing({
        idPublicacion: pubActual.id,
        telefonoDestino: telefonoPruebaWA.trim(),
        via: viaPruebaWA,
        nombrePlantilla: plantillaSeleccionada,
        nombreDestinatario: nombreDestinatarioPrueba,
      });
      if (res.success && res.data) {
        alert(res.data.detalle);
        setMostrarModalPruebaWA(false);
      } else {
        alert("Aviso de WhatsApp: " + (res.error || "No se pudo entregar el mensaje de prueba."));
      }
    } catch (e: any) {
      alert("Error al enviar prueba: " + (e?.message || String(e)));
    } finally {
      setEnviandoPruebaWA(false);
    }
  };

  // Sincronizar estado local si cambia la prop
  useEffect(() => {
    if (publicacion) {
      setPubActual(publicacion);
    }
  }, [publicacion]);

  // Al abrir el modal, consultar la versión más reciente en la base de datos por si n8n acaba de guardar la nueva imagen
  useEffect(() => {
    if (abierto && publicacion?.id) {
      obtenerPublicacionPorId(publicacion.id)
        .then((res) => {
          if (res.success && res.data) {
            setPubActual(res.data);
          }
        })
        .catch((err) => console.warn("Error al refrescar publicación en modal:", err));
    }
  }, [abierto, publicacion?.id]);

  // Identificar el formato nativo de la publicación para restringir previsualizaciones incompatibles
  const esInstagramReel =
    pubActual?.plataforma === "instagram" &&
    (pubActual?.tipo_formato === "reel" || pubActual?.tipo_formato === "video");
  const esTikTok = pubActual?.plataforma === "tiktok";
  const esFormatoVertical =
    esInstagramReel ||
    esTikTok ||
    pubActual?.tipo_formato === "reel" ||
    pubActual?.tipo_formato === "video";
  const esWhatsApp = pubActual?.plataforma === "whatsapp";
  const esMautic = pubActual?.plataforma === "email" || pubActual?.plataforma === "mautic";

  // Inicializar la pestaña activa según la plataforma de la publicación
  useEffect(() => {
    if (pubActual) {
      if (pubActual.plataforma === "email" || pubActual.plataforma === "mautic") {
        setPlataformaActiva("mautic");
      } else if (
        pubActual.plataforma === "instagram" &&
        (pubActual.tipo_formato === "reel" || pubActual.tipo_formato === "video")
      ) {
        setPlataformaActiva("instagram_reel");
      } else if (
        pubActual.plataforma === "tiktok" ||
        pubActual.tipo_formato === "reel" ||
        pubActual.tipo_formato === "video"
      ) {
        setPlataformaActiva("tiktok");
      } else if (pubActual.plataforma === "whatsapp") {
        setPlataformaActiva("whatsapp");
      } else if (pubActual.plataforma === "instagram") {
        setPlataformaActiva("instagram");
      } else {
        setPlataformaActiva("facebook");
      }
    }
  }, [pubActual]);

  // Manejo de tecla ESC para cerrar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && abierto) {
        onCerrar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [abierto, onCerrar]);

  // Construir URL de imagen con cache-buster para garantizar que nunca cargue una imagen obsoleta de la caché
  useEffect(() => {
    setImgError(false);
    const targetUrl = pubActual?.url_imagen;
    const cacheKey = pubActual?.updated_at
      ? new Date(pubActual.updated_at).getTime()
      : Date.now();

    if (targetUrl && targetUrl.length > 5) {
      let u = targetUrl.startsWith("http") || targetUrl.startsWith("data:")
        ? targetUrl
        : `https://${targetUrl}`;

      // Si no es un data: URI, agregar cache buster dinámico
      if (!u.startsWith("data:")) {
        const sep = u.includes("?") ? "&" : "?";
        u = `${u}${sep}_cb=${cacheKey}`;
      }
      setImgSrc(u);
    } else if (pubActual?.id) {
      // Si no tiene url_imagen directa, intentar proxy por ID con cache-buster
      setImgSrc(`/api/marketing/imagen/${pubActual.id}?_cb=${cacheKey}`);
    } else {
      setImgSrc(null);
    }
  }, [pubActual]);

  const handleImgError = () => {
    if (pubActual?.id && imgSrc && !imgSrc.includes("/api/marketing/imagen/")) {
      const cacheKey = Date.now();
      setImgSrc(`/api/marketing/imagen/${pubActual.id}?_cb=${cacheKey}`);
    } else {
      setImgError(true);
    }
  };

  const handleRefrescarArte = async () => {
    if (!pubActual?.id) return;
    setRefrescando(true);
    setImgError(false);
    try {
      const res = await obtenerPublicacionPorId(pubActual.id);
      if (res.success && res.data) {
        setPubActual(res.data);
      }
      const cb = Date.now();
      if (pubActual.url_imagen && !pubActual.url_imagen.startsWith("data:")) {
        const sep = pubActual.url_imagen.includes("?") ? "&" : "?";
        setImgSrc(`${pubActual.url_imagen}${sep}_cb=${cb}`);
      } else {
        setImgSrc(`/api/marketing/imagen/${pubActual.id}?_cb=${cb}`);
      }
    } catch (e) {
      console.warn("Fallo al refrescar arte manualmente:", e);
    } finally {
      setTimeout(() => setRefrescando(false), 500);
    }
  };

  if (!abierto || !publicacion) return null;

  const mediaUrl = imgSrc;
  const esVideo = mediaUrl ? Boolean(mediaUrl.match(/\.(mp4|webm|mov)(\?.*)?$/i)) : false;

  const handleCopiarTexto = () => {
    navigator.clipboard.writeText(pubActual.contenido);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
  };

  const handlePublicarEnMeta = async () => {
    if (!pubActual?.id) return;
    const destino = (plataformaActiva === "instagram" || pubActual.plataforma === "instagram") ? "instagram" : "facebook";
    const nombreRed = destino === "instagram" ? "Instagram" : "Facebook";

    if (!confirm(`¿Deseas publicar este contenido de inmediato en la cuenta oficial de ${nombreRed}?`)) {
      return;
    }

    setPublicandoMeta(true);
    setMensajeFeedback(null);
    try {
      const res = await ejecutarPublicacionMeta(pubActual.id, destino);
      if (res.success && res.data) {
        setPubActual(res.data);
        setMensajeFeedback({
          tipo: "exito",
          texto: `¡Publicado exitosamente en ${nombreRed}!`,
          url: res.data.url_publicacion,
        });
        if (onPublicado) onPublicado(res.data);
        if (onEditar) onEditar(res.data);
      } else {
        setMensajeFeedback({
          tipo: "error",
          texto: res.error || `No se pudo publicar en ${nombreRed}. Revisa las credenciales de Meta.`,
        });
      }
    } catch (err: any) {
      setMensajeFeedback({
        tipo: "error",
        texto: err?.message || `Error al intentar publicar en ${nombreRed}.`,
      });
    } finally {
      setPublicandoMeta(false);
    }
  };

  const handleDispararMauticModal = async () => {
    if (!pubActual?.id) return;
    if (
      !confirm(
        "¿Deseas disparar esta campaña en Mautic ahora?\n\nSe enviará a todos los contactos activos y excluirá automáticamente a los prospectos inhabilitados del CRM."
      )
    ) {
      return;
    }

    setPublicandoMeta(true);
    setMensajeFeedback(null);
    try {
      const res = await ejecutarEnvioMautic(pubActual.id);
      if (res.success && res.data) {
        setPubActual(res.data);
        setMensajeFeedback({
          tipo: "exito",
          texto: res.aviso || "¡Campaña disparada exitosamente en Mautic!",
          url: res.data.url_publicacion,
        });
        if (onPublicado) onPublicado(res.data);
        if (onEditar) onEditar(res.data);
      } else {
        setMensajeFeedback({
          tipo: "error",
          texto: res.error || "No se pudo disparar la campaña en Mautic.",
        });
      }
    } catch (err: any) {
      setMensajeFeedback({
        tipo: "error",
        texto: err?.message || "Error al disparar campaña en Mautic.",
      });
    } finally {
      setPublicandoMeta(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-carbon/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-dorado/30 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="bg-verde-profundo text-crema px-6 py-4 flex items-center justify-between border-b border-dorado/30 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">👁️</span>
            <div>
              <h3 className="font-bold text-base sm:text-lg leading-tight">
                Previsualizador de Red Social
              </h3>
              <p className="text-xs text-crema/70 mt-0.5">
                Simula cómo verán tus clientes el post en sus aplicaciones móviles
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefrescarArte}
              disabled={refrescando}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-crema text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Volver a consultar el servidor para cargar la foto más reciente de IA"
            >
              <span className={refrescando ? "animate-spin" : ""}>🔄</span>
              <span className="hidden sm:inline">{refrescando ? "Actualizando..." : "Refrescar Foto"}</span>
            </button>
            <button
              onClick={onCerrar}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer text-lg font-bold"
              title="Cerrar (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Pestañas de Plataforma / Información del Formato */}
        <div className="bg-gray-100 px-4 py-2.5 flex items-center justify-between border-b border-gray-200 shrink-0">
          {esInstagramReel ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5">
                  <span>🎬</span> Formato Vertical 9:16 (Instagram Reel)
                </span>
                <span className="text-[11px] text-carbon/60 hidden sm:inline">
                  Simulación nativa de Instagram Reels
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold bg-pink-100 text-pink-800 px-2.5 py-1 rounded-lg border border-pink-200">
                🟣 Instagram Reel
              </span>
            </div>
          ) : esTikTok ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="bg-black text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5">
                  <span>📱</span> Formato Vertical 9:16 (TikTok Video)
                </span>
                <span className="text-[11px] text-carbon/60 hidden sm:inline">
                  Simulación nativa de TikTok
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold bg-gray-200 text-gray-800 px-2.5 py-1 rounded-lg border border-gray-300">
                ⚫ TikTok Video
              </span>
            </div>
          ) : esFormatoVertical ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="bg-black text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5">
                  <span>📱</span> Formato Vertical 9:16
                </span>
                <span className="text-[11px] text-carbon/60 hidden sm:inline">
                  Simulación móvil vertical a pantalla completa
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold bg-purple-100 text-purple-800 px-2.5 py-1 rounded-lg border border-purple-200">
                Reel / Video
              </span>
            </div>
          ) : esWhatsApp ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="bg-[#25D366] text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5">
                  <span>🟢</span> WhatsApp Chat Directo
                </span>
                <span className="text-[11px] text-carbon/60 hidden sm:inline">
                  Mensaje con fotografía 1:1 y CTA de WhatsApp
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-200">
                WhatsApp Oficial
              </span>
            </div>
          ) : esMautic ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="bg-[#FF6A00] text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5">
                  <span>🟠</span> Mautic / Correo Electrónico
                </span>
                <span className="text-[11px] text-carbon/60 hidden sm:inline">
                  Plantilla de newsletter / email marketing
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold bg-orange-100 text-orange-800 px-2.5 py-1 rounded-lg border border-orange-200">
                Email Marketing
              </span>
            </div>
          ) : (
            /* Feed Posts (Facebook e Instagram comparten aspecto cuadrado 1:1) */
            <div className="flex items-center gap-2 overflow-x-auto w-full">
              <span className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider mr-1 hidden sm:inline">
                Canal Feed (1:1):
              </span>
              <button
                onClick={() => setPlataformaActiva("facebook")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  plataformaActiva === "facebook"
                    ? "bg-[#1877F2] text-white shadow-sm"
                    : "bg-white text-carbon/70 hover:bg-gray-200"
                }`}
              >
                <span>🔵</span> Facebook Feed
              </button>

              <button
                onClick={() => setPlataformaActiva("instagram")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  plataformaActiva === "instagram"
                    ? "bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-white shadow-sm"
                    : "bg-white text-carbon/70 hover:bg-gray-200"
                }`}
              >
                <span>🟣</span> Instagram Post
              </button>

              <span className="ml-auto text-[10px] font-medium text-carbon/50 hidden md:inline">
                📐 Formato Cuadrado 1:1
              </span>
            </div>
          )}
        </div>

        {/* Contenedor del Mockup Móvil */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gradient-to-b from-gray-100 to-gray-200 flex justify-center items-start">
          <div className="w-full max-w-[420px] transition-all duration-300">
            {/* ============================================================== */}
            {/* 1. MOCKUP FACEBOOK */}
            {/* ============================================================== */}
            {plataformaActiva === "facebook" && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-300 overflow-hidden font-sans text-carbon animate-in zoom-in-95 duration-150">
                {/* Cabecera Facebook */}
                <div className="p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-verde-profundo flex items-center justify-center text-white font-bold text-sm shadow-xs border border-dorado/40">
                      S
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-sm text-[#050505]">
                          Sauceda Inmobiliaria & Construcción
                        </span>
                        <span className="text-[#1877F2] text-xs" title="Verificado">●</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-gray-500">
                        <span>Publicidad</span>
                        <span>•</span>
                        <span>🌐</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-gray-400 font-bold tracking-widest text-lg cursor-pointer">
                    •••
                  </div>
                </div>

                {/* Texto del Copy */}
                <div className="px-3.5 pb-3">
                  <p className="text-[13px] text-[#050505] leading-relaxed whitespace-pre-wrap">
                    {expandirTexto || publicacion.contenido.length < 220
                      ? publicacion.contenido
                      : `${publicacion.contenido.slice(0, 220)}... `}
                    {publicacion.contenido.length >= 220 && (
                      <button
                        onClick={() => setExpandirTexto(!expandirTexto)}
                        className="text-[#1877F2] font-semibold text-[13px] hover:underline cursor-pointer"
                      >
                        {expandirTexto ? " Ver menos" : "Ver más"}
                      </button>
                    )}
                  </p>
                </div>

                {/* Creativo Multimedia */}
                {imgSrc && !imgError ? (
                  <div className="relative bg-black">
                    {esVideo ? (
                      <video
                        src={imgSrc}
                        controls
                        className="w-full max-h-[380px] object-contain"
                      />
                    ) : (
                      <img
                        src={imgSrc}
                        alt="Facebook Post Media"
                        referrerPolicy="no-referrer"
                        onError={handleImgError}
                        className="w-full max-h-[420px] object-top object-cover"
                      />
                    )}
                  </div>
                ) : (
                  <div className="h-48 bg-gradient-to-br from-dorado/20 to-verde-profundo/20 flex flex-col items-center justify-center text-carbon/60 p-4 text-center">
                    <span className="text-3xl mb-1">🖼️</span>
                    <span className="text-xs font-semibold">Fotografía en proceso de generación</span>
                    <span className="text-[10px] text-carbon/40 mt-1">Se visualizará la foto limpia al finalizar o cargar el archivo</span>
                  </div>
                )}

                {/* Banda de Call to Action (CTA Meta Ads) */}
                <div className="bg-[#F0F2F5] px-3.5 py-2.5 flex items-center justify-between border-t border-b border-gray-200">
                  <div className="min-w-0 pr-2">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block truncate">
                      SAUCEDA.MX • LEÓN, GTO.
                    </span>
                    <span className="text-xs font-bold text-[#050505] block truncate">
                      {publicacion.titulo || "Atención Inmediata por WhatsApp"}
                    </span>
                  </div>
                  <a
                    href="https://wa.me/524774654700"
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-xs transition"
                  >
                    <span>💬</span> Enviar mensaje
                  </a>
                </div>

                {/* Barra de Reacciones y Comentarios */}
                <div className="px-3.5 py-2 flex items-center justify-between text-xs text-gray-500 border-b border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <div className="flex -space-x-1">
                      <span className="w-4 h-4 rounded-full bg-[#1877F2] text-white text-[9px] flex items-center justify-center">👍</span>
                      <span className="w-4 h-4 rounded-full bg-[#FA383E] text-white text-[9px] flex items-center justify-center">❤️</span>
                    </div>
                    <span>{liked ? "Tú y 94 personas más" : "94 personas"}</span>
                  </div>
                  <div className="flex gap-2 text-[11px]">
                    <span>18 comentarios</span>
                    <span>•</span>
                    <span>7 veces compartido</span>
                  </div>
                </div>

                {/* Botones de Interacción (Like, Comentar, Compartir) */}
                <div className="px-2 py-1 flex items-center justify-around text-xs font-semibold text-gray-600">
                  <button
                    onClick={() => setLiked(!liked)}
                    className={`flex-1 py-1.5 rounded-lg hover:bg-gray-100 flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      liked ? "text-[#1877F2]" : ""
                    }`}
                  >
                    <span>{liked ? "👍" : "👍🏻"}</span> Me gusta
                  </button>
                  <button className="flex-1 py-1.5 rounded-lg hover:bg-gray-100 flex items-center justify-center gap-1.5 transition cursor-pointer">
                    <span>💬</span> Comentar
                  </button>
                  <button className="flex-1 py-1.5 rounded-lg hover:bg-gray-100 flex items-center justify-center gap-1.5 transition cursor-pointer">
                    <span>↗️</span> Compartir
                  </button>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* 2. MOCKUP INSTAGRAM POST */}
            {/* ============================================================== */}
            {plataformaActiva === "instagram" && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-300 overflow-hidden font-sans text-carbon animate-in zoom-in-95 duration-150">
                {/* Cabecera Instagram */}
                <div className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full p-[2px] bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5]">
                      <div className="w-full h-full rounded-full bg-white p-[1.5px]">
                        <div className="w-full h-full rounded-full bg-verde-profundo flex items-center justify-center text-white font-bold text-xs">
                          S
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-xs text-carbon">saucedamx</span>
                        <span className="text-gray-400 text-xs">•</span>
                        <span className="text-[#0095F6] text-xs font-bold cursor-pointer">Seguir</span>
                      </div>
                      <span className="text-[10px] text-gray-500 block">León, Guanajuato</span>
                    </div>
                  </div>
                  <span className="text-gray-400 font-bold text-base cursor-pointer">•••</span>
                </div>

                {/* Contenedor Cuadrado o 4:5 */}
                {imgSrc && !imgError ? (
                  <div className="relative bg-black aspect-square overflow-hidden flex items-center justify-center">
                    {esVideo ? (
                      <video
                        src={imgSrc}
                        controls
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={imgSrc}
                        alt="Instagram Post Media"
                        referrerPolicy="no-referrer"
                        onError={handleImgError}
                        className="w-full h-full object-top object-cover"
                      />
                    )}
                  </div>
                ) : (
                  <div className="aspect-square bg-gradient-to-tr from-purple-100 via-pink-50 to-amber-50 flex flex-col items-center justify-center text-carbon/60 p-6 text-center">
                    <span className="text-4xl mb-2">📸</span>
                    <span className="text-xs font-bold text-carbon/80">Sin Imagen Cargada (1:1)</span>
                    <span className="text-[10px] text-carbon/50 mt-1 max-w-xs">Puedes generar una foto fotorrealista con IA o cargar tu diseño de Canva</span>
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-3 z-10">
                      {onRegenerarCreativo && (
                        <button
                          type="button"
                          onClick={() => onRegenerarCreativo(pubActual.id!)}
                          className="bg-verde-profundo text-crema font-bold text-xs px-3.5 py-1.5 rounded-xl shadow-xs hover:bg-verde-profundo/90 transition flex items-center gap-1 cursor-pointer"
                        >
                          <span>✨</span> Generar con IA (Flux)
                        </button>
                      )}
                      {onReemplazarArte && (
                        <button
                          type="button"
                          onClick={() => onReemplazarArte(pubActual.id!)}
                          className="bg-white border border-dorado/40 text-carbon font-bold text-xs px-3 py-1.5 rounded-xl shadow-2xs hover:bg-gray-50 transition flex items-center gap-1 cursor-pointer"
                        >
                          <span>📁</span> Cargar Foto
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Barra de Iconos de Instagram */}
                <div className="p-3 pb-1 flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xl">
                    <button
                      onClick={() => setLiked(!liked)}
                      className={`cursor-pointer transition-transform active:scale-125 ${
                        liked ? "text-red-500" : "text-carbon"
                      }`}
                    >
                      {liked ? "❤️" : "🤍"}
                    </button>
                    <button className="cursor-pointer text-carbon">💬</button>
                    <button className="cursor-pointer text-carbon">↗️</button>
                  </div>
                  <button className="cursor-pointer text-xl text-carbon">🔖</button>
                </div>

                {/* Contador de Likes y Caption */}
                <div className="px-3 pb-3 space-y-1 text-xs">
                  <p className="font-bold text-carbon">
                    {liked ? "Les gusta a 189 personas" : "Les gusta a 188 personas"}
                  </p>
                  <p className="text-carbon leading-relaxed whitespace-pre-wrap">
                    <span className="font-bold mr-1.5">saucedamx</span>
                    {expandirTexto || publicacion.contenido.length < 180
                      ? publicacion.contenido
                      : `${publicacion.contenido.slice(0, 180)}... `}
                    {publicacion.contenido.length >= 180 && (
                      <button
                        onClick={() => setExpandirTexto(!expandirTexto)}
                        className="text-gray-400 font-normal hover:text-carbon cursor-pointer"
                      >
                        {expandirTexto ? "menos" : "más"}
                      </button>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-400 cursor-pointer pt-0.5">
                    Ver los 16 comentarios
                  </p>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">
                    HACE 2 HORAS
                  </p>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* 3.A MOCKUP INSTAGRAM REELS 9:16 VERTICAL */}
            {/* ============================================================== */}
            {plataformaActiva === "instagram_reel" && (
              <div className="bg-black text-white rounded-3xl shadow-2xl overflow-hidden aspect-[9/16] relative flex flex-col justify-between border-4 border-gray-900 animate-in zoom-in-95 duration-150 select-none">
                {/* Media de Fondo */}
                {imgSrc && !imgError ? (
                  <div className="absolute inset-0 z-0">
                    {esVideo ? (
                      <video
                        src={imgSrc}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={imgSrc}
                        alt="Instagram Reel Media"
                        referrerPolicy="no-referrer"
                        onError={handleImgError}
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/85"></div>
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-b from-[#833AB4]/30 via-black to-black flex flex-col items-center justify-center p-6 text-center z-0">
                    <span className="text-5xl mb-3">🎬</span>
                    <span className="text-sm font-bold">Instagram Reel (9:16)</span>
                    <span className="text-xs text-white/60 mt-1 max-w-xs">Aún no se ha asignado una foto o video para este Reel</span>
                    <div className="flex flex-col items-center gap-2 mt-4 z-10">
                      {onRegenerarCreativo && (
                        <button
                          type="button"
                          onClick={() => onRegenerarCreativo(pubActual.id!)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>✨</span> Generar con IA (Flux)
                        </button>
                      )}
                      {onReemplazarArte && (
                        <button
                          type="button"
                          onClick={() => onReemplazarArte(pubActual.id!)}
                          className="bg-white/10 hover:bg-white/20 text-white font-medium text-xs px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>📁</span> Subir Foto de Canva / PC
                        </button>
                      )}
                      {onSubirVideo && (
                        <button
                          type="button"
                          onClick={() => {
                            onCerrar();
                            onSubirVideo(pubActual);
                          }}
                          className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <span>🎬</span> Subir Video (Reel)
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Cabecera Superior Instagram Reels */}
                <div className="relative z-10 pt-4 px-4 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 cursor-pointer">
                    <span className="font-bold text-lg tracking-tight">Reels</span>
                    <svg className="w-3.5 h-3.5 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                  <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition cursor-pointer">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  </button>
                </div>

                {/* Columna Derecha de Acciones Nativas de Instagram Reels */}
                <div className="absolute right-3 bottom-14 z-10 flex flex-col items-center gap-5 text-xs">
                  {/* Like */}
                  <button
                    onClick={() => setLiked(!liked)}
                    className="flex flex-col items-center gap-1 cursor-pointer group"
                  >
                    <div className={`transition-transform active:scale-125 ${liked ? "text-[#FF3040]" : "text-white"}`}>
                      {liked ? (
                        <svg className="w-7 h-7 drop-shadow-md" viewBox="0 0 24 24" fill="#FF3040">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                      ) : (
                        <svg className="w-7 h-7 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold drop-shadow-md">{liked ? "1,241" : "1,240"}</span>
                  </button>

                  {/* Comentarios */}
                  <div className="flex flex-col items-center gap-1 cursor-pointer">
                    <svg className="w-7 h-7 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                    <span className="text-[11px] font-semibold drop-shadow-md">36</span>
                  </div>

                  {/* Compartir / Enviar (Paper Plane) */}
                  <div className="flex flex-col items-center gap-1 cursor-pointer">
                    <svg className="w-7 h-7 drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    <span className="text-[11px] font-semibold drop-shadow-md">84</span>
                  </div>

                  {/* Más opciones (...) */}
                  <div className="cursor-pointer py-1">
                    <svg className="w-6 h-6 drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="6" cy="12" r="1.5" />
                      <circle cx="18" cy="12" r="1.5" />
                    </svg>
                  </div>

                  {/* Carátula Cuadrada de Audio Instagram */}
                  <div className="w-7 h-7 rounded-lg border-2 border-white/80 overflow-hidden bg-black flex items-center justify-center shadow-lg mt-1">
                    <span className="text-[11px]">🎵</span>
                  </div>
                </div>

                {/* Pie Inferior: Perfil + Seguir, Caption expandible y Audio */}
                <div className="relative z-10 p-4 pb-5 max-w-[82%] space-y-2">
                  {/* Fila de Perfil y Botón Seguir */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-verde-profundo border border-white/70 flex items-center justify-center font-bold text-xs text-white shadow-sm shrink-0">
                      S
                    </div>
                    <span className="font-bold text-xs tracking-tight drop-shadow-md">saucedamx</span>
                    <button className="border border-white/70 bg-black/20 hover:bg-white/20 text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-lg transition backdrop-blur-xs cursor-pointer">
                      Seguir
                    </button>
                  </div>

                  {/* Copy / Descripción con Ver más */}
                  <div className="text-[12px] leading-snug drop-shadow-md">
                    <p className="line-clamp-2 text-white/95">
                      {expandirTexto || publicacion.contenido.length < 120
                        ? publicacion.contenido
                        : `${publicacion.contenido.slice(0, 120)}...`}
                    </p>
                    {publicacion.contenido.length >= 120 && (
                      <button
                        onClick={() => setExpandirTexto(!expandirTexto)}
                        className="text-white/70 font-semibold text-[11px] hover:text-white cursor-pointer mt-0.5"
                      >
                        {expandirTexto ? "menos" : "... más"}
                      </button>
                    )}
                  </div>

                  {/* Track de Audio Instagram */}
                  <div className="flex items-center gap-1.5 text-[11px] text-white/90 drop-shadow-md pt-0.5">
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                    </svg>
                    <span className="truncate">saucedamx • Audio original</span>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* 3.B MOCKUP TIKTOK 9:16 VERTICAL */}
            {/* ============================================================== */}
            {plataformaActiva === "tiktok" && (
              <div className="bg-black text-white rounded-3xl shadow-2xl overflow-hidden aspect-[9/16] relative flex flex-col justify-between border-4 border-gray-900 animate-in zoom-in-95 duration-150">
                {/* Media de Fondo */}
                {imgSrc && !imgError ? (
                  <div className="absolute inset-0 z-0">
                    {esVideo ? (
                      <video
                        src={imgSrc}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={imgSrc}
                        alt="Reel TikTok Media"
                        referrerPolicy="no-referrer"
                        onError={handleImgError}
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80"></div>
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-800 to-black flex flex-col items-center justify-center p-6 text-center z-0">
                    <span className="text-5xl mb-3">📱</span>
                    <span className="text-sm font-bold">Formato Vertical 9:16</span>
                    <span className="text-xs text-white/60 mt-1 max-w-xs">Aún no se ha generado una fotografía o video para esta publicación</span>
                    <div className="flex flex-col items-center gap-2 mt-4 z-10">
                      {onRegenerarCreativo && (
                        <button
                          type="button"
                          onClick={() => onRegenerarCreativo(pubActual.id!)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>✨</span> Generar con IA (Flux)
                        </button>
                      )}
                      {onReemplazarArte && (
                        <button
                          type="button"
                          onClick={() => onReemplazarArte(pubActual.id!)}
                          className="bg-white/10 hover:bg-white/20 text-white font-medium text-xs px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>📁</span> Subir Foto de Canva / PC
                        </button>
                      )}
                      {onSubirVideo && (
                        <button
                          type="button"
                          onClick={() => {
                            onCerrar();
                            onSubirVideo(pubActual);
                          }}
                          className="bg-white/20 hover:bg-white/30 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <span>🎬</span> Subir Video (TikTok)
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Cabecera Superior TikTok */}
                <div className="relative z-10 pt-4 px-4 flex items-center justify-between text-xs font-semibold">
                  <span className="opacity-70">En vivo</span>
                  <div className="flex gap-4">
                    <span className="opacity-60">Siguiendo</span>
                    <span className="font-bold border-b-2 border-white pb-0.5">Para ti</span>
                  </div>
                  <span className="text-sm">🔍</span>
                </div>

                {/* Columna Derecha de Interacciones */}
                <div className="absolute right-3 bottom-24 z-10 flex flex-col items-center gap-4 text-xs">
                  {/* Avatar con botón Seguir */}
                  <div className="relative mb-2">
                    <div className="w-11 h-11 rounded-full border-2 border-white bg-verde-profundo flex items-center justify-center font-bold text-sm">
                      S
                    </div>
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#FE2C55] text-white flex items-center justify-center text-[10px] font-bold">
                      +
                    </div>
                  </div>

                  {/* Like */}
                  <button 
                    onClick={() => setLiked(!liked)} 
                    className="flex flex-col items-center gap-1 cursor-pointer"
                  >
                    <span className={`text-2xl transition ${liked ? "scale-110" : ""}`}>
                      {liked ? "❤️" : "🤍"}
                    </span>
                    <span className="text-[10px] font-bold">{liked ? "1.8K" : "1.7K"}</span>
                  </button>

                  {/* Comentarios */}
                  <div className="flex flex-col items-center gap-1 cursor-pointer">
                    <span className="text-2xl">💬</span>
                    <span className="text-[10px] font-bold">92</span>
                  </div>

                  {/* Favorito */}
                  <div className="flex flex-col items-center gap-1 cursor-pointer">
                    <span className="text-2xl">🔖</span>
                    <span className="text-[10px] font-bold">248</span>
                  </div>

                  {/* Compartir */}
                  <div className="flex flex-col items-center gap-1 cursor-pointer">
                    <span className="text-2xl">↗️</span>
                    <span className="text-[10px] font-bold">64</span>
                  </div>

                  {/* Disco de Audio Giratorio */}
                  <div className="w-9 h-9 rounded-full bg-gray-800 border-2 border-white/40 flex items-center justify-center animate-spin text-[10px]">
                    🎵
                  </div>
                </div>

                {/* Pie Inferior: Username, Descripción y Audio */}
                <div className="relative z-10 p-4 pb-6 max-w-[80%] space-y-1.5 text-xs text-shadow">
                  <p className="font-bold text-sm flex items-center gap-1.5">
                    @saucedamx
                    <span className="bg-[#20D5EC] text-black text-[9px] px-1 py-0.2 rounded-xs font-bold">✓</span>
                  </p>
                  <p className="text-[12px] leading-snug line-clamp-3 text-white/90">
                    {publicacion.contenido}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-white/80 pt-1">
                    <span>🎵</span>
                    <span className="truncate">Sonido original - Sauceda Inmobiliaria & Construcción</span>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* 4. MOCKUP WHATSAPP CHAT */}
            {/* ============================================================== */}
            {plataformaActiva === "whatsapp" && (
              <div className="bg-[#EFEAE2] rounded-2xl shadow-xl border border-gray-300 overflow-hidden font-sans text-carbon animate-in zoom-in-95 duration-150">
                {/* Cabecera Verde de WhatsApp */}
                <div className="bg-[#075E54] text-white px-3.5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-bold">←</span>
                    <div className="w-9 h-9 rounded-full bg-verde-profundo border border-white/30 flex items-center justify-center font-bold text-xs text-white">
                      S
                    </div>
                    <div>
                      <h4 className="font-bold text-sm leading-tight">
                        Sauceda Asesoría Oficial
                      </h4>
                      <p className="text-[10px] text-white/80">en línea</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span>📹</span>
                    <span>📞</span>
                    <span>⋮</span>
                  </div>
                </div>

                {/* Cuerpo del Chat con Burbuja de Mensaje */}
                <div className="p-4 min-h-[320px] flex flex-col justify-end">
                  {/* Píldora de Fecha */}
                  <div className="self-center mb-3">
                    <span className="bg-white/80 text-carbon/60 text-[10px] font-semibold px-2.5 py-1 rounded-md shadow-xs">
                      HOY
                    </span>
                  </div>

                  {/* Burbuja Enviada */}
                  <div className="max-w-[88%] self-end bg-[#E7FFDB] rounded-2xl rounded-tr-xs p-2 shadow-xs border border-[#D5EAC9] text-xs">
                    {imgSrc && !imgError && (
                      <div className="rounded-xl overflow-hidden mb-2 bg-black">
                        {esVideo ? (
                          <video src={imgSrc} controls className="w-full max-h-48 object-cover" />
                        ) : (
                          <img
                            src={imgSrc}
                            alt="WhatsApp Media"
                            referrerPolicy="no-referrer"
                            onError={handleImgError}
                            className="w-full max-h-48 object-cover"
                          />
                        )}
                      </div>
                    )}
                    <p className="text-carbon leading-relaxed whitespace-pre-wrap font-sans text-[12.5px] px-1">
                      {publicacion.contenido}
                    </p>
                    <div className="flex items-center justify-end gap-1 text-[10px] text-carbon/50 pt-1 pr-1 font-mono">
                      <span>10:30 AM</span>
                      <span className="text-[#34B7F1] font-bold">✓✓</span>
                    </div>
                  </div>

                  {/* Botón de Respuesta Rápida de WhatsApp */}
                  <div className="mt-4 self-center w-full">
                    <a
                      href="https://wa.me/524774654700"
                      target="_blank"
                      rel="noreferrer"
                      className="w-full bg-[#25D366] hover:bg-[#1EBE5D] text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition"
                    >
                      <span>💬</span> Probar envío directo al 477 465 4700
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* 5. MOCKUP MAUTIC / CORREO ELECTRÓNICO */}
            {/* ============================================================== */}
            {plataformaActiva === "mautic" && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-300 overflow-hidden font-sans text-carbon animate-in zoom-in-95 duration-150">
                {/* Cabecera Estilo Cliente de Correo */}
                <div className="bg-gray-100 px-4 py-3 border-b border-gray-200 text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-carbon text-sm">
                      📧 {publicacion.titulo || "Boletín Informativo Sauceda"}
                    </span>
                    <span className="text-[10px] bg-orange-100 text-orange-800 font-bold px-2 py-0.5 rounded">
                      Campaña Mautic
                    </span>
                  </div>
                  <div className="text-[11px] text-carbon/70 space-y-0.5 font-mono">
                    <p><strong>De:</strong> Sauceda Inmobiliaria &lt;contacto@sauceda.mx&gt;</p>
                    <p><strong>Para:</strong> prospecto.interesado@gmail.com</p>
                  </div>
                </div>

                {/* Plantilla de Correo */}
                <div className="p-5 space-y-4">
                  <div className="border-b border-dorado/20 pb-3 flex items-center justify-between">
                    <div className="text-verde-profundo font-bold text-base tracking-wider">
                      SAUCEDA
                    </div>
                    <span className="text-[10px] text-carbon/50">León, Gto.</span>
                  </div>

                  {imgSrc && !imgError && (
                    <div className="rounded-xl overflow-hidden border border-gray-200">
                      <img
                        src={imgSrc}
                        alt="Email Hero"
                        referrerPolicy="no-referrer"
                        onError={handleImgError}
                        className="w-full max-h-52 object-cover"
                      />
                    </div>
                  )}

                  <div className="text-xs text-carbon/90 leading-relaxed whitespace-pre-wrap space-y-2 font-serif">
                    {publicacion.contenido}
                  </div>

                  <div className="pt-2 text-center">
                    <a
                      href="https://wa.me/524774654700"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block bg-verde-profundo hover:bg-verde-profundo/90 text-crema font-bold text-xs px-6 py-3 rounded-xl shadow-md transition"
                    >
                      👉 Solicitar Asesoría Personalizada sin Costo
                    </a>
                  </div>

                  <div className="border-t border-gray-200 pt-3 text-[10px] text-carbon/40 text-center">
                    Sauceda Bienes Raíces & Construcción • León, Guanajuato • Tel: 477 465 4700
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Banner de Feedback de Publicación en Meta */}
        {mensajeFeedback && (
          <div
            className={`px-6 py-2.5 flex items-center justify-between text-xs border-t shrink-0 ${
              mensajeFeedback.tipo === "exito"
                ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                : "bg-red-50 text-red-900 border-red-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{mensajeFeedback.tipo === "exito" ? "✅" : "⚠️"}</span>
              <span className="font-semibold">{mensajeFeedback.texto}</span>
            </div>
            {mensajeFeedback.url && (
              <a
                href={mensajeFeedback.url}
                target="_blank"
                rel="noreferrer"
                className="font-bold underline hover:opacity-80"
              >
                Abrir Publicación en Vivo ↗
              </a>
            )}
          </div>
        )}

        {/* Pie del Modal con Acciones Rápidas */}
        <div className="bg-white px-6 py-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopiarTexto}
              className="bg-gray-100 hover:bg-gray-200 text-carbon font-semibold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>📋</span> {copiado ? "¡Copiado!" : "Copiar Copy"}
            </button>
            {onReplicar && (
              <button
                type="button"
                onClick={() => {
                  onCerrar();
                  onReplicar(pubActual);
                }}
                className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Generar versiones adaptadas de esta misma publicación para otras redes sociales"
              >
                <span>🔄</span> Replicar en otras Redes
              </button>
            )}
            <a
              href="https://www.canva.com/design?create=true&template=EAHWDrq_iM8"
              target="_blank"
              rel="noreferrer"
              className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>🎨</span> Abrir Canva
            </a>

            <button
              type="button"
              onClick={() => setMostrarModalPruebaWA(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Enviar una prueba de esta publicación por WhatsApp a un solo número"
            >
              <span>🧪</span> Probar WhatsApp (1 Destinatario)
            </button>

            {onSubirVideo && (
              <button
                type="button"
                onClick={() => {
                  onCerrar();
                  onSubirVideo(pubActual);
                }}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Subir video y pre-validar formato técnico para Instagram Reels, Facebook o TikTok"
              >
                <span>🎬</span> Subir / Validar Video
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Botón de Publicación Directa en Meta (Facebook o Instagram) */}
            {(pubActual.plataforma === "facebook" || pubActual.plataforma === "instagram") && (
              <>
                {pubActual.estado === "publicado" && pubActual.url_publicacion ? (
                  <a
                    href={pubActual.url_publicacion}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <span>🔗</span> Ver en {pubActual.plataforma === "instagram" ? "Instagram" : "Facebook"} ↗
                  </a>
                ) : (
                  <button
                    onClick={handlePublicarEnMeta}
                    disabled={publicandoMeta}
                    className={`${
                      (plataformaActiva === "instagram" || pubActual.plataforma === "instagram")
                        ? "bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] hover:opacity-90"
                        : "bg-[#1877F2] hover:bg-[#166FE5]"
                    } text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60`}
                    title="Publicar directamente en la red social usando Meta Graph API"
                  >
                    <span>{publicandoMeta ? "⏳" : "🚀"}</span>
                    <span>
                      {publicandoMeta
                        ? "Publicando en Meta..."
                        : `Publicar en ${(plataformaActiva === "instagram" || pubActual.plataforma === "instagram") ? "Instagram" : "Facebook"}`}
                    </span>
                  </button>
                )}
              </>
            )}

            {/* Botón de Disparo de Campaña en Mautic */}
            {(pubActual.plataforma === "mautic" || pubActual.plataforma === "email") && (
              <>
                {pubActual.estado === "publicado" ? (
                  <span className="bg-orange-50 text-orange-700 border border-orange-200 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-2xs">
                    <span>✓</span> Campaña Enviada en Mautic
                  </span>
                ) : (
                  <button
                    onClick={handleDispararMauticModal}
                    disabled={publicandoMeta}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    title="Disparar campaña masiva en Mautic excluyendo contactos inhabilitados"
                  >
                    <span>{publicandoMeta ? "⏳" : "🚀"}</span>
                    <span>
                      {publicandoMeta
                        ? "Disparando en Mautic..."
                        : "Disparar Campaña Mautic Ahora"}
                    </span>
                  </button>
                )}
              </>
            )}

            {onEditar && (
              <button
                onClick={() => {
                  onCerrar();
                  onEditar(pubActual);
                }}
                className="bg-white hover:bg-gray-100 border border-carbon/20 text-carbon font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
              >
                ✏️ Editar Post
              </button>
            )}
            {onProgramar && (
              <button
                onClick={() => {
                  onCerrar();
                  onProgramar(pubActual);
                }}
                className="bg-verde-profundo hover:bg-verde-profundo/90 text-crema font-bold text-xs px-4 py-2 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>⏰</span> Programar Horario
              </button>
            )}
            <button
              onClick={onCerrar}
              className="bg-gray-100 hover:bg-gray-200 text-carbon/70 font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Envío de Prueba de WhatsApp a 1 Destinatario */}
      {mostrarModalPruebaWA && (
        <div className="fixed inset-0 z-60 bg-carbon/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-dorado/30 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-base text-verde-profundo flex items-center gap-2">
                <span>🧪</span> Enviar Prueba de WhatsApp
              </h3>
              <button
                type="button"
                onClick={() => setMostrarModalPruebaWA(false)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-carbon/70 font-bold flex items-center justify-center text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Aviso sobre la Regla de las 24 horas de Meta */}
            <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 text-[11px] text-amber-950 leading-relaxed space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <span>⚠️</span> Regla de 24 Horas de Meta (WhatsApp Cloud API):
              </div>
              <p>
                Meta <strong>bloquea estrictamente</strong> mensajes libres (texto/imágenes) a números que no han escrito en las últimas 24h. Para iniciar contacto frío o campañas de difusión masiva se requiere una <strong>Plantilla Oficial Aprobada</strong>.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-carbon/80 block mb-1">
                Número de WhatsApp Destino (10 dígitos):
              </label>
              <div className="flex items-center gap-2">
                <span className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-carbon/70">
                  🇲🇽 +52
                </span>
                <input
                  type="tel"
                  placeholder="Ej: 4771234567"
                  value={telefonoPruebaWA}
                  onChange={(e) => setTelefonoPruebaWA(e.target.value)}
                  className="flex-1 bg-white border border-gray-300 rounded-xl px-3.5 py-2 text-sm text-carbon focus:outline-none focus:border-emerald-600 font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-carbon/80 block">
                Modalidad de Envío de la Prueba:
              </label>
              <div className="grid grid-cols-1 gap-2.5">
                {/* Opción 1: Plantilla Aprobada por Meta */}
                <label className={`flex flex-col gap-2 p-3.5 rounded-2xl border text-xs cursor-pointer transition ${viaPruebaWA === "plantilla_meta" ? "bg-emerald-50/90 border-emerald-500 shadow-2xs" : "border-gray-200 hover:bg-gray-50 text-carbon/80"}`}>
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="via_wa"
                      checked={viaPruebaWA === "plantilla_meta"}
                      onChange={() => setViaPruebaWA("plantilla_meta")}
                      className="mt-0.5 text-emerald-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-emerald-950">📋 Plantilla Oficial Aprobada por Meta</span>
                        <span className="bg-emerald-200 text-emerald-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          ⭐ Entrega Inmediata Garantizada
                        </span>
                      </div>
                      <p className="text-[11px] font-normal text-carbon/70 mt-0.5">
                        Ignora la ventana de 24 horas y Meta la entrega al segundo a tu celular.
                      </p>
                    </div>
                  </div>

                  {viaPruebaWA === "plantilla_meta" && (
                    <div className="mt-2 pt-2.5 border-t border-emerald-200/80 space-y-2.5 pl-6">
                      <div>
                        <label className="text-[11px] font-bold text-emerald-950 block mb-1">
                          Seleccionar Plantilla de Meta:
                        </label>
                        {cargandoPlantillasWA ? (
                          <div className="text-[11px] text-carbon/60 py-1">Cargando plantillas de Meta...</div>
                        ) : (
                          <select
                            value={plantillaSeleccionada}
                            onChange={(e) => setPlantillaSeleccionada(e.target.value)}
                            className="w-full bg-white border border-emerald-300 rounded-xl px-2.5 py-1.5 text-xs text-carbon focus:outline-none focus:border-emerald-600"
                          >
                            {plantillasWA.length > 0 ? (
                              plantillasWA.map((p) => (
                                <option key={p.nombre} value={p.nombre}>
                                  {p.nombre === "reactivacion_impermeabilizacio" ? "🛠️ reactivacion_impermeabilizacio (Inspección Gratuita)" :
                                   p.nombre === "reactivacion_compra_directa" ? "🏡 reactivacion_compra_directa (Compra al Contado)" :
                                   p.nombre === "reactivacion_promocion_venta" ? "📈 reactivacion_promocion_venta (Venta de Casas)" :
                                   p.nombre === "reactivacion_solo_tramite" ? "⚖️ reactivacion_solo_tramite (Trámites Infonavit)" :
                                   p.nombre === "reactivar_inspeccion_gratuita" ? "🔍 reactivar_inspeccion_gratuita (Agenda Visita)" :
                                   p.nombre === "dudas_seguimiento_llamada" ? "📞 dudas_seguimiento_llamada (Aclaración Presupuesto)" :
                                   p.nombre === "encuesta_satisfaccion_servicio_instalacion" ? "⭐ encuesta_satisfaccion (Calidad de Servicio)" :
                                   p.nombre === "entrega_documentos_remision_garantia" ? "📄 entrega_documentos (Garantía y Remisión)" :
                                   p.nombre}
                                </option>
                              ))
                            ) : (
                              <>
                                <option value="reactivacion_impermeabilizacio">🛠️ reactivacion_impermeabilizacio</option>
                                <option value="reactivacion_compra_directa">🏡 reactivacion_compra_directa</option>
                                <option value="reactivacion_promocion_venta">📈 reactivacion_promocion_venta</option>
                                <option value="reactivacion_solo_tramite">⚖️ reactivacion_solo_tramite</option>
                              </>
                            )}
                          </select>
                        )}
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-emerald-950 block mb-1">
                          Nombre para la variable {"{{1}}"} (ej: tu nombre):
                        </label>
                        <input
                          type="text"
                          value={nombreDestinatarioPrueba}
                          onChange={(e) => setNombreDestinatarioPrueba(e.target.value)}
                          placeholder="Ej: Oscar"
                          className="w-full bg-white border border-emerald-300 rounded-xl px-2.5 py-1.5 text-xs text-carbon focus:outline-none focus:border-emerald-600"
                        />
                      </div>

                      {/* Vista previa del mensaje de la plantilla */}
                      {plantillasWA.find((p) => p.nombre === plantillaSeleccionada)?.cuerpo && (
                        <div className="bg-white/90 border border-emerald-200 rounded-xl p-2.5 text-[11px] text-carbon/80 leading-relaxed shadow-2xs">
                          <span className="font-bold text-emerald-900 block text-[10px] mb-1 uppercase tracking-wide">
                            Mensaje que recibirás en WhatsApp:
                          </span>
                          <p className="whitespace-pre-line italic">
                            &quot;{plantillasWA
                              .find((p) => p.nombre === plantillaSeleccionada)
                              ?.cuerpo.replace(/\{\{1\}\}/g, nombreDestinatarioPrueba || "Cliente")}&quot;
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </label>

                {/* Opción 2: Texto Libre e Imagen (Requiere 24h) */}
                <label className={`flex items-start gap-2.5 p-3 rounded-2xl border text-xs cursor-pointer transition ${viaPruebaWA === "directo_meta" ? "bg-amber-50/90 border-amber-500 shadow-2xs" : "border-gray-200 hover:bg-gray-50 text-carbon/80"}`}>
                  <input
                    type="radio"
                    name="via_wa"
                    checked={viaPruebaWA === "directo_meta"}
                    onChange={() => setViaPruebaWA("directo_meta")}
                    className="mt-0.5 text-amber-600"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-amber-950">🖼️ Copy y Arte Libre de la Publicación</span>
                    </div>
                    <p className="text-[11px] font-normal text-carbon/70 mt-0.5 leading-relaxed">
                      Envía la imagen generada y el copy libre tal como están en este modal.
                    </p>
                    {viaPruebaWA === "directo_meta" && (
                      <p className="text-[11px] text-amber-900 bg-amber-100/70 border border-amber-300/60 rounded-lg p-2 mt-2 font-medium">
                        ⚠️ <strong>Requisito Indispensable:</strong> Debes enviar primero un mensaje (ej: <em>&quot;Hola&quot;</em>) desde tu celular al WhatsApp oficial de Sauceda (+52 477 465 4700) para abrir tu ventana de 24 horas antes de presionar Enviar.
                      </p>
                    )}
                  </div>
                </label>

                {/* Opción 3: Webhook Mautic / n8n */}
                <label className={`flex items-start gap-2.5 p-3 rounded-2xl border text-xs cursor-pointer transition ${viaPruebaWA === "webhook_mautic" ? "bg-orange-50 border-orange-500 text-orange-950 font-bold shadow-2xs" : "border-gray-200 hover:bg-gray-50 text-carbon/80"}`}>
                  <input
                    type="radio"
                    name="via_wa"
                    checked={viaPruebaWA === "webhook_mautic"}
                    onChange={() => setViaPruebaWA("webhook_mautic")}
                    className="mt-0.5 text-orange-600"
                  />
                  <div>
                    <span>⚙️ Webhook Mautic / n8n (Simular Campaña)</span>
                    <p className="text-[11px] font-normal text-carbon/60 mt-0.5">
                      Dispara el evento hacia el flujo de n8n marcado con bandera de prueba para 1 solo destinatario.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setMostrarModalPruebaWA(false)}
                className="px-4 py-2 text-xs font-semibold text-carbon/70 hover:bg-gray-100 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEnviarPruebaWA}
                disabled={enviandoPruebaWA || !telefonoPruebaWA.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                <span>{enviandoPruebaWA ? "⏳" : "🚀"}</span>
                <span>{enviandoPruebaWA ? "Enviando Prueba..." : "Enviar Prueba Ahora"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
