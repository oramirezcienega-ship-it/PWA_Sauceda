"use client";

import React, { useState, useEffect } from "react";
import { PublicacionProgramada } from "@/app/actions/marketing";

interface PrevisualizadorRedSocialProps {
  publicacion: PublicacionProgramada;
  abierto: boolean;
  onCerrar: () => void;
  onEditar?: (pub: PublicacionProgramada) => void;
  onProgramar?: (pub: PublicacionProgramada) => void;
}

export default function PrevisualizadorRedSocial({
  publicacion,
  abierto,
  onCerrar,
  onEditar,
  onProgramar,
}: PrevisualizadorRedSocialProps) {
  const [plataformaActiva, setPlataformaActiva] = useState<string>("facebook");
  const [expandirTexto, setExpandirTexto] = useState(false);
  const [liked, setLiked] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Inicializar la pestaña activa según la plataforma de la publicación
  useEffect(() => {
    if (publicacion) {
      if (publicacion.plataforma === "email" || publicacion.plataforma === "mautic") {
        setPlataformaActiva("mautic");
      } else if (publicacion.tipo_formato === "reel" || publicacion.plataforma === "tiktok") {
        setPlataformaActiva("tiktok");
      } else {
        setPlataformaActiva(publicacion.plataforma || "facebook");
      }
    }
  }, [publicacion]);

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

  if (!abierto || !publicacion) return null;

  const mediaUrl = publicacion.url_imagen && publicacion.url_imagen.length > 5
    ? (publicacion.url_imagen.startsWith("http") || publicacion.url_imagen.startsWith("data:")
        ? publicacion.url_imagen
        : `https://${publicacion.url_imagen}`)
    : null;

  const esVideo = mediaUrl ? Boolean(mediaUrl.match(/\.(mp4|webm|mov)(\?.*)?$/i)) : false;

  const handleCopiarTexto = () => {
    navigator.clipboard.writeText(publicacion.contenido);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
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
          <button
            onClick={onCerrar}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer text-lg font-bold"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Pestañas de Plataforma */}
        <div className="bg-gray-100 px-4 py-2.5 flex items-center gap-1.5 sm:gap-2 overflow-x-auto border-b border-gray-200 shrink-0">
          <span className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider mr-1 hidden sm:inline">
            Canal:
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

          <button
            onClick={() => setPlataformaActiva("tiktok")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              plataformaActiva === "tiktok"
                ? "bg-black text-white shadow-sm"
                : "bg-white text-carbon/70 hover:bg-gray-200"
            }`}
          >
            <span>📱</span> Reel / TikTok (9:16)
          </button>

          <button
            onClick={() => setPlataformaActiva("whatsapp")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              plataformaActiva === "whatsapp"
                ? "bg-[#25D366] text-white shadow-sm"
                : "bg-white text-carbon/70 hover:bg-gray-200"
            }`}
          >
            <span>🟢</span> WhatsApp Chat
          </button>

          <button
            onClick={() => setPlataformaActiva("mautic")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              plataformaActiva === "mautic"
                ? "bg-[#FF6A00] text-white shadow-sm"
                : "bg-white text-carbon/70 hover:bg-gray-200"
            }`}
          >
            <span>🟠</span> Mautic / Correo
          </button>
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
                {mediaUrl ? (
                  <div className="relative bg-black">
                    {esVideo ? (
                      <video
                        src={mediaUrl}
                        controls
                        className="w-full max-h-[380px] object-contain"
                      />
                    ) : (
                      <img
                        src={mediaUrl}
                        alt="Facebook Post Media"
                        className="w-full max-h-[380px] object-cover"
                      />
                    )}
                  </div>
                ) : (
                  <div className="h-48 bg-gradient-to-br from-dorado/20 to-verde-profundo/20 flex flex-col items-center justify-center text-carbon/60 p-4 text-center">
                    <span className="text-3xl mb-1">🖼️</span>
                    <span className="text-xs font-semibold">Sin imagen asignada aún</span>
                    <span className="text-[10px] text-carbon/40">Se mostrará la foto limpia al aprobar o subir arte</span>
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
                {mediaUrl ? (
                  <div className="relative bg-black aspect-square overflow-hidden flex items-center justify-center">
                    {esVideo ? (
                      <video
                        src={mediaUrl}
                        controls
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={mediaUrl}
                        alt="Instagram Post Media"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                ) : (
                  <div className="aspect-square bg-gradient-to-tr from-purple-100 via-pink-50 to-amber-50 flex flex-col items-center justify-center text-carbon/60 p-6 text-center">
                    <span className="text-4xl mb-2">📸</span>
                    <span className="text-xs font-bold text-carbon/80">Vista Previa Instagram (1:1)</span>
                    <span className="text-[10px] text-carbon/50 mt-1">Sube el arte editado de Canva para visualizarlo en alta fidelidad</span>
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
            {/* 3. MOCKUP TIKTOK / REEL 9:16 VERTICAL */}
            {/* ============================================================== */}
            {plataformaActiva === "tiktok" && (
              <div className="bg-black text-white rounded-3xl shadow-2xl overflow-hidden aspect-[9/16] relative flex flex-col justify-between border-4 border-gray-900 animate-in zoom-in-95 duration-150">
                {/* Media de Fondo */}
                {mediaUrl ? (
                  <div className="absolute inset-0 z-0">
                    {esVideo ? (
                      <video
                        src={mediaUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={mediaUrl}
                        alt="Reel TikTok Media"
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80"></div>
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-800 to-black flex flex-col items-center justify-center p-6 text-center z-0">
                    <span className="text-5xl mb-3">📱</span>
                    <span className="text-sm font-bold">Formato Vertical 9:16</span>
                    <span className="text-xs text-white/60 mt-1">Ideal para Reels de Instagram y TikTok</span>
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
                    {mediaUrl && (
                      <div className="rounded-xl overflow-hidden mb-2 bg-black">
                        {esVideo ? (
                          <video src={mediaUrl} controls className="w-full max-h-48 object-cover" />
                        ) : (
                          <img src={mediaUrl} alt="WhatsApp Media" className="w-full max-h-48 object-cover" />
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

                  {mediaUrl && (
                    <div className="rounded-xl overflow-hidden border border-gray-200">
                      <img src={mediaUrl} alt="Email Hero" className="w-full max-h-52 object-cover" />
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

        {/* Pie del Modal con Acciones Rápidas */}
        <div className="bg-white px-6 py-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopiarTexto}
              className="bg-gray-100 hover:bg-gray-200 text-carbon font-semibold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>📋</span> {copiado ? "¡Copiado!" : "Copiar Copy"}
            </button>
            <a
              href="https://www.canva.com/design?create=true&template=EAHWDrq_iM8"
              target="_blank"
              rel="noreferrer"
              className="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>🎨</span> Abrir Canva
            </a>
          </div>

          <div className="flex items-center gap-2">
            {onEditar && (
              <button
                onClick={() => {
                  onCerrar();
                  onEditar(publicacion);
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
                  onProgramar(publicacion);
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
    </div>
  );
}
