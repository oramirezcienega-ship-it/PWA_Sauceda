"use client";

import { useEffect, useState, useTransition } from "react";
import {
  PublicacionProgramada,
  obtenerPublicaciones,
  guardarPublicacion,
  cambiarEstadoPublicacion,
  generarPublicacionesAutomaticas,
} from "@/app/actions/marketing";

export default function PaginaPublicaciones() {
  const [publicaciones, setPublicaciones] = useState<PublicacionProgramada[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [filtroPlataforma, setFiltroPlataforma] = useState<string>("todos");
  
  const [pubEditando, setPubEditando] = useState<PublicacionProgramada | null>(null);
  const [mostrarModalIA, setMostrarModalIA] = useState(false);
  const [cantidadIA, setCantidadIA] = useState(3);
  
  const obtenerManana = () => {
    const hoy = new Date();
    hoy.setDate(hoy.getDate() + 1);
    return hoy.toISOString().split("T")[0];
  };
  const [fechaIA, setFechaIA] = useState(obtenerManana());

  const [temaIA, setTemaIA] = useState<string>("todos");

  const [isPending, startTransition] = useTransition();
  const [cargandoLista, setCargandoLista] = useState(true);
  const [mensajeCarga, setMensajeCarga] = useState("Generando contenido...");
  const [guionesExpandidos, setGuionesExpandidos] = useState<Record<string, boolean>>({});

  const frasesCarga = [
    "Analizando el mercado inmobiliario de León, Gto...",
    "Redactando copys magnéticos para tus traspasos...",
    "Ideando sugerencias visuales creativas para Canva...",
    "Estructurando guiones paso a paso para TikTok y Reels...",
    "Configurando horarios de alta interacción...",
    "Casi listo, puliendo los últimos detalles..."
  ];

  useEffect(() => {
    if (isPending) {
      let index = 0;
      const interval = setInterval(() => {
        index = (index + 1) % frasesCarga.length;
        setMensajeCarga(frasesCarga[index]);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isPending]);

  const cargarDatos = async () => {
    setCargandoLista(true);
    try {
      const datos = await obtenerPublicaciones({
        estado: filtroEstado,
        plataforma: filtroPlataforma,
      });
      setPublicaciones(datos);
    } catch (err) {
      console.error("Error al cargar publicaciones:", err);
    } finally {
      setCargandoLista(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [filtroEstado, filtroPlataforma]);

  const handleAprobar = async (id: string) => {
    const res = await cambiarEstadoPublicacion(id, "aprobado");
    if (res.success) {
      alert("¡Publicación aprobada y enviada a n8n!");
      await cargarDatos();
    } else {
      alert("Error al aprobar publicación: " + res.error);
    }
  };

  const handleRechazar = async (id: string, notas?: string) => {
    const notasPrompt = notas || prompt("Ingresa el motivo del rechazo u observaciones:") || "";
    if (notasPrompt === null) return;
    
    const res = await cambiarEstadoPublicacion(id, "rechazado", notasPrompt);
    if (res.success) {
      await cargarDatos();
    } else {
      alert("Error al rechazar publicación: " + res.error);
    }
  };

  const handlePublicar = async (id: string) => {
    const res = await cambiarEstadoPublicacion(id, "publicado");
    if (res.success) {
      alert("¡Publicación marcada como publicada e informada a n8n!");
      await cargarDatos();
    } else {
      alert("Error al marcar como publicado: " + res.error);
    }
  };

  const handleReconsiderar = async (id: string) => {
    const res = await cambiarEstadoPublicacion(id, "pendiente_revision");
    if (res.success) {
      await cargarDatos();
    } else {
      alert("Error al volver a revisión: " + res.error);
    }
  };

  const handleCopiarTexto = (texto: string) => {
    navigator.clipboard.writeText(texto);
    alert("¡Texto copiado al portapapeles con éxito!");
  };

  const triggerGeneracionIA = () => {
    setMensajeCarga("Conectando con el Agente de Marketing IA...");
    startTransition(async () => {
      const res = await generarPublicacionesAutomaticas(cantidadIA, fechaIA, temaIA);
      if (res.success) {
        setMostrarModalIA(false);
        await cargarDatos();
      } else {
        alert("Ocurrió un error en la generación automática:\n\n" + res.error);
      }
    });
  };

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pubEditando) return;

    const res = await guardarPublicacion(pubEditando);
    if (res.success) {
      setPubEditando(null);
      await cargarDatos();
    } else {
      alert("Error al guardar cambios: " + res.error);
    }
  };

  const toggleGuion = (id: string) => {
    setGuionesExpandidos(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const formatFecha = (fechaStr: string) => {
    const d = new Date(fechaStr);
    return d.toLocaleString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPlataformaBadge = (plataforma: string) => {
    switch (plataforma) {
      case "facebook":
        return <span className="bg-blue-600/10 text-blue-600 text-xs font-semibold px-2.5 py-1 rounded-md">Facebook</span>;
      case "instagram":
        return <span className="bg-pink-600/10 text-pink-600 text-xs font-semibold px-2.5 py-1 rounded-md">Instagram</span>;
      case "tiktok":
        return <span className="bg-black text-white text-xs font-semibold px-2.5 py-1 rounded-md">TikTok</span>;
      case "whatsapp":
        return <span className="bg-emerald-600/10 text-emerald-600 text-xs font-semibold px-2.5 py-1 rounded-md">WhatsApp</span>;
      default:
        return <span className="bg-gray-100 text-gray-800 text-xs font-semibold px-2.5 py-1 rounded-md">{plataforma}</span>;
    }
  };

  const getFormatoIcon = (formato: string) => {
    switch (formato) {
      case "imagen": return "🖼️ Imagen";
      case "carrusel": return "📚 Carrusel";
      case "video": return "🎥 Video";
      case "reel": return "📱 Reel";
      default: return formato;
    }
  };

  return (
    <main className="min-h-screen pb-16 bg-crema/20">
      <div className="bg-white border-b border-dorado/20 shadow-xs">
        <div className="mx-auto max-w-[1700px] px-6 py-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-titular text-3xl font-bold text-verde-profundo flex items-center gap-2">
              <span>🤖</span> Marketing & Publicaciones IA
            </h1>
            <p className="mt-1 text-sm text-carbon/60">
              Genera copys automáticos, guiones de video y dispara la publicación real con n8n.
            </p>
          </div>
          <button
            onClick={() => setMostrarModalIA(true)}
            className="bg-verde-profundo hover:bg-verde-profundo/90 text-crema font-semibold px-5 py-3 rounded-xl shadow-md transition-all flex items-center gap-2 text-sm transform hover:scale-[1.02] cursor-pointer"
          >
            <span>✨</span> Generar Publicaciones con IA
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1700px] px-6 mt-8">
        <div className="flex flex-wrap gap-4 items-center justify-between mb-8 bg-white p-4 rounded-2xl border border-dorado/20 shadow-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col">
              <label className="text-xs font-bold text-carbon/60 uppercase mb-1">Filtrar por Estado</label>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2 text-sm text-carbon focus:outline-none focus:border-verde-profundo cursor-pointer"
              >
                <option value="todos">📋 Todos los Estados</option>
                <option value="pendiente_revision">⏳ Pendientes de Revisión</option>
                <option value="aprobado">✅ Aprobados (Enviados a n8n)</option>
                <option value="rechazado">❌ Rechazados</option>
                <option value="publicado">📲 Publicados</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-carbon/60 uppercase mb-1">Filtrar por Canal</label>
              <select
                value={filtroPlataforma}
                onChange={(e) => setFiltroPlataforma(e.target.value)}
                className="bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2 text-sm text-carbon focus:outline-none focus:border-verde-profundo cursor-pointer"
              >
                <option value="todos">🌐 Todos los Canales</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-carbon/50 font-medium">
            Total encontradas: <span className="font-bold text-verde-profundo text-sm">{publicaciones.length}</span>
          </div>
        </div>

        {cargandoLista ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-dorado/20 rounded-2xl">
            <div className="w-10 h-10 border-4 border-dorado/20 border-t-verde-profundo rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-carbon/60 font-semibold">Cargando la agenda de contenidos...</p>
          </div>
        ) : publicaciones.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-dorado/20 rounded-2xl px-6 text-center">
            <span className="text-5xl">📅</span>
            <h3 className="mt-4 text-lg font-bold text-verde-profundo">No hay publicaciones programadas</h3>
            <p className="mt-2 text-sm text-carbon/60 max-w-md">
              No encontramos publicaciones. Genera propuestas haciendo clic en &quot;Generar Publicaciones con IA&quot;.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {publicaciones.map((pub) => {
              const guionActivo = guionesExpandidos[pub.id!] || false;
              return (
                <div
                  key={pub.id}
                  className={`bg-white rounded-2xl border transition-all duration-300 flex flex-col shadow-xs ${
                    pub.estado === "pendiente_revision" ? "border-dorado/30 hover:border-dorado/60 hover:shadow-md" :
                    pub.estado === "aprobado" ? "border-emerald-500/30 hover:border-emerald-500/60" :
                    pub.estado === "rechazado" ? "border-red-500/20 opacity-90" : "border-carbon/10 bg-gray-50/50"
                  }`}
                >
                  <div className="px-6 py-4 border-b border-carbon/5 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      {getPlataformaBadge(pub.plataforma)}
                      <span className="text-xs bg-carbon/5 text-carbon/70 font-semibold px-2 py-0.5 rounded-md">
                        {getFormatoIcon(pub.tipo_formato)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-carbon/50 font-mono">
                        ⏰ {formatFecha(pub.fecha_programacion)}
                      </span>
                      {pub.estado === "pendiente_revision" && (
                        <span className="bg-amber-500/10 text-amber-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">Revisión</span>
                      )}
                      {pub.estado === "aprobado" && (
                        <span className="bg-emerald-500/10 text-emerald-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded" title="Enviado a n8n">Aprobado</span>
                      )}
                      {pub.estado === "rechazado" && (
                        <span className="bg-red-500/10 text-red-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">Rechazado</span>
                      )}
                      {pub.estado === "publicado" && (
                        <span className="bg-blue-500/10 text-blue-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">Publicado</span>
                      )}
                    </div>
                  </div>

                  <div className="p-6 flex-1 flex flex-col gap-5">
                    <div>
                      <h3 className="font-bold text-verde-profundo text-lg mb-2">{pub.titulo}</h3>
                      <div className="bg-crema/10 border border-dorado/20 rounded-xl p-4 relative group">
                        <p className="text-sm text-carbon whitespace-pre-wrap leading-relaxed font-cuerpo pr-8">
                          {pub.contenido}
                        </p>
                        <button
                          onClick={() => handleCopiarTexto(pub.contenido)}
                          className="absolute right-3 top-3 p-1.5 rounded-lg bg-white/80 hover:bg-white text-carbon/50 hover:text-verde-profundo border border-carbon/10 shadow-xs opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                          title="Copiar Copy"
                        >
                          📋
                        </button>
                      </div>
                    </div>

                    {pub.url_imagen && (
                      <div className="relative rounded-2xl overflow-hidden border border-dorado/30 shadow-md group">
                        <img
                          src={pub.url_imagen}
                          alt={pub.titulo}
                          className="w-full h-64 object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute top-3 right-3 bg-carbon/80 backdrop-blur-md text-crema text-[10px] font-bold px-3 py-1 rounded-full border border-white/20 flex items-center gap-1.5 shadow-sm">
                          <span>🎨</span> Creativo Generado por IA (Flux)
                        </div>
                        <a
                          href={pub.url_imagen}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute bottom-3 right-3 bg-white/90 hover:bg-white text-carbon text-xs font-bold px-3 py-1.5 rounded-lg shadow-md transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1"
                        >
                          🔍 Ver en HD
                        </a>
                      </div>
                    )}

                    {pub.guion_video && (
                      <div className="border border-carbon/10 rounded-xl overflow-hidden">
                        <button
                          onClick={() => toggleGuion(pub.id!)}
                          className="w-full bg-carbon/5 hover:bg-carbon/10 px-4 py-2.5 flex items-center justify-between text-xs font-bold text-carbon/70 transition-all cursor-pointer"
                        >
                          <span>🎥 {guionActivo ? "Ocultar Guion" : "Ver Guion de Video (Reel/TikTok)"}</span>
                          <span>{guionActivo ? "▲" : "▼"}</span>
                        </button>
                        {guionActivo && (
                          <div className="p-4 bg-gray-50 border-t border-carbon/10">
                            <p className="text-xs text-carbon/80 whitespace-pre-wrap leading-relaxed font-mono">
                              {pub.guion_video}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {pub.sugerencia_visual && (
                      <div className="text-xs bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
                        <span className="font-bold text-amber-800 block mb-1">💡 Sugerencia Visual (Prompt / Canva):</span>
                        <p className="text-carbon/70 italic leading-snug">{pub.sugerencia_visual}</p>
                      </div>
                    )}

                    {pub.estado === "rechazado" && pub.notas_revision && (
                      <div className="text-xs bg-red-500/5 border border-red-500/10 rounded-xl p-3">
                        <span className="font-bold text-red-800 block mb-1">❌ Observaciones de Rechazo:</span>
                        <p className="text-carbon/70 leading-snug">{pub.notas_revision}</p>
                      </div>
                    )}
                  </div>

                  <div className="px-6 py-4 bg-gray-50/50 border-t border-carbon/5 flex flex-wrap gap-2 justify-end items-center rounded-b-2xl">
                    <button
                      onClick={() => setPubEditando(pub)}
                      className="bg-white hover:bg-gray-100 border border-carbon/20 text-carbon/80 hover:text-carbon font-semibold text-xs px-3.5 py-2 rounded-lg transition-all cursor-pointer"
                    >
                      ✏️ Editar
                    </button>

                    {pub.estado === "pendiente_revision" && (
                      <>
                        <button
                          onClick={() => handleRechazar(pub.id!)}
                          className="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs px-3.5 py-2 rounded-lg transition-all cursor-pointer"
                        >
                          ✕ Rechazar
                        </button>
                        <button
                          onClick={() => handleAprobar(pub.id!)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition-all cursor-pointer"
                        >
                          ✓ Aprobar y Mandar a n8n
                        </button>
                      </>
                    )}

                    {pub.estado === "aprobado" && (
                      <>
                        <button
                          onClick={() => handleRechazar(pub.id!)}
                          className="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs px-3.5 py-2 rounded-lg transition-all cursor-pointer"
                        >
                          ✕ Rechazar
                        </button>
                        <button
                          onClick={() => handlePublicar(pub.id!)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition-all cursor-pointer"
                        >
                          📲 Marcar Publicado
                        </button>
                      </>
                    )}

                    {(pub.estado === "rechazado" || pub.estado === "publicado") && (
                      <button
                        onClick={() => handleReconsiderar(pub.id!)}
                        className="bg-white hover:bg-gray-100 border border-carbon/20 text-carbon/70 hover:text-carbon font-semibold text-xs px-3.5 py-2 rounded-lg transition-all cursor-pointer"
                      >
                        🔄 Regresar a Revisión
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isPending && (
        <div className="fixed inset-0 bg-carbon/80 z-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center border border-dorado/30">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 border-4 border-dorado/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-t-verde-profundo rounded-full animate-spin"></div>
              <span className="absolute inset-0 flex items-center justify-center text-3xl">✨</span>
            </div>
            
            <h3 className="text-xl font-bold text-verde-profundo mb-2">El Agente de IA está trabajando</h3>
            <p className="text-sm text-carbon/70 font-medium min-h-12 leading-relaxed animate-pulse">
              {mensajeCarga}
            </p>
            <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-6">
              <div className="bg-gradient-to-r from-dorado to-verde-profundo h-full w-2/3 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      )}

      {mostrarModalIA && (
        <div className="fixed inset-0 bg-carbon/60 z-40 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-dorado/20">
            <div className="px-6 py-5 bg-verde-profundo text-crema">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <span>✨</span> Generar Propuestas con IA
              </h3>
              <p className="text-xs text-crema/70 mt-1">Configura las directrices para el agente de contenido.</p>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-carbon/60 uppercase block mb-1">Cantidad de Publicaciones</label>
                <div className="grid grid-cols-3 gap-2">
                  {[2, 3, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCantidadIA(num)}
                      className={`py-2 rounded-xl text-sm font-bold border transition ${
                        cantidadIA === num ? "bg-verde-profundo text-crema border-verde-profundo" : "bg-crema/10 text-carbon border-dorado/30 hover:bg-crema/20"
                      }`}
                    >
                      {num} posts
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-carbon/60 uppercase block mb-1">Tema / Campaña de Enfoque</label>
                <select
                  value={temaIA}
                  onChange={(e) => setTemaIA(e.target.value)}
                  className="w-full bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2.5 text-sm text-carbon focus:outline-none focus:border-verde-profundo cursor-pointer"
                >
                  <option value="todos">🔀 Variado (Todos los pilares mezclados)</option>
                  <option value="Traspasos de viviendas con crédito INFONAVIT">🏠 Traspaso INFONAVIT (Explicación y Venta)</option>
                  <option value="Compra rápida de casas de contado con adeudos o vandalizadas">💰 Compra de Casas de Contado (Problemas Legales/Deudas)</option>
                  <option value="Servicios de impermeabilización profesional con garantía de 5 a 10 años">☔ Impermeabilización Profesional (Sauceda Construye)</option>
                  <option value="Remodelaciones y ampliaciones de viviendas en León Gto">🏗️ Remodelación y Ampliación de Hogares</option>
                  <option value="Gestión y armado de expediente INFONAVIT para trato directo">📂 Armado de Expediente INFONAVIT (Solo Trámite)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-carbon/60 uppercase block mb-1">Día de Programación</label>
                <input
                  type="date"
                  value={fechaIA}
                  onChange={(e) => setFechaIA(e.target.value)}
                  className="w-full bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2.5 text-sm text-carbon focus:outline-none focus:border-verde-profundo"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setMostrarModalIA(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-carbon/60 hover:bg-gray-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={triggerGeneracionIA}
                className="px-5 py-2.5 bg-verde-profundo hover:bg-verde-profundo/90 text-crema text-xs font-bold rounded-xl shadow transition"
              >
                Comenzar Generación
              </button>
            </div>
          </div>
        </div>
      )}

      {pubEditando && (
        <div className="fixed inset-0 bg-carbon/60 z-40 flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden border border-dorado/20 my-8">
            <div className="px-6 py-5 bg-verde-profundo text-crema">
              <h3 className="font-bold text-lg">✏️ Editar Publicación</h3>
              <p className="text-xs text-crema/70 mt-1">Modifica la programación del post.</p>
            </div>

            <form onSubmit={handleGuardarEdicion}>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-carbon/60 block mb-1">Título de la Publicación</label>
                  <input
                    type="text"
                    required
                    value={pubEditando.titulo}
                    onChange={(e) => setPubEditando({ ...pubEditando, titulo: e.target.value })}
                    className="w-full bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2.5 text-sm text-carbon focus:outline-none focus:border-verde-profundo"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-carbon/60 block mb-1">Plataforma / Canal</label>
                  <select
                    value={pubEditando.plataforma}
                    onChange={(e) => setPubEditando({ ...pubEditando, plataforma: e.target.value as any })}
                    className="w-full bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2.5 text-sm text-carbon focus:outline-none focus:border-verde-profundo"
                  >
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-carbon/60 block mb-1">Formato</label>
                  <select
                    value={pubEditando.tipo_formato}
                    onChange={(e) => setPubEditando({ ...pubEditando, tipo_formato: e.target.value as any })}
                    className="w-full bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2.5 text-sm text-carbon focus:outline-none focus:border-verde-profundo"
                  >
                    <option value="imagen">🖼️ Imagen</option>
                    <option value="carrusel">📚 Carrusel</option>
                    <option value="video">🎥 Video</option>
                    <option value="reel">📱 Reel</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-carbon/60 block mb-1">Copy / Contenido del Post</label>
                  <textarea
                    rows={6}
                    required
                    value={pubEditando.contenido}
                    onChange={(e) => setPubEditando({ ...pubEditando, contenido: e.target.value })}
                    className="w-full bg-crema/10 border border-dorado/30 rounded-xl p-4 text-sm text-carbon focus:outline-none focus:border-verde-profundo font-cuerpo"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-carbon/60 block mb-1">Guion del Video (Opcional)</label>
                  <textarea
                    rows={4}
                    value={pubEditando.guion_video || ""}
                    onChange={(e) => setPubEditando({ ...pubEditando, guion_video: e.target.value })}
                    className="w-full bg-crema/10 border border-dorado/30 rounded-xl p-4 text-sm text-carbon focus:outline-none focus:border-verde-profundo font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-carbon/60 block mb-1">Sugerencia Visual (Prompt / Diseño)</label>
                  <textarea
                    rows={3}
                    value={pubEditando.sugerencia_visual || ""}
                    onChange={(e) => setPubEditando({ ...pubEditando, sugerencia_visual: e.target.value })}
                    className="w-full bg-crema/10 border border-dorado/30 rounded-xl p-4 text-sm text-carbon focus:outline-none focus:border-verde-profundo italic"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-carbon/60 block mb-1">Fecha de Programación</label>
                  <input
                    type="datetime-local"
                    required
                    value={pubEditando.fecha_programacion ? pubEditando.fecha_programacion.substring(0, 16) : ""}
                    onChange={(e) => setPubEditando({ ...pubEditando, fecha_programacion: e.target.value })}
                    className="w-full bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2.5 text-sm text-carbon focus:outline-none focus:border-verde-profundo"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-carbon/60 block mb-1">Estado</label>
                  <select
                    value={pubEditando.estado}
                    onChange={(e) => setPubEditando({ ...pubEditando, estado: e.target.value as any })}
                    className="w-full bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2.5 text-sm text-carbon focus:outline-none focus:border-verde-profundo"
                  >
                    <option value="pendiente_revision">⏳ Pendiente de Revisión</option>
                    <option value="aprobado">✅ Aprobado</option>
                    <option value="rechazado">❌ Rechazado</option>
                    <option value="publicado">📲 Publicado</option>
                  </select>
                </div>

                {pubEditando.estado === "rechazado" && (
                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-red-800 block mb-1">Feedback de Rechazo</label>
                    <input
                      type="text"
                      value={pubEditando.notes_revision || ""}
                      onChange={(e) => setPubEditando({ ...pubEditando, notes_revision: e.target.value })}
                      className="w-full bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-500"
                    />
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPubEditando(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-carbon/60 hover:bg-gray-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-verde-profundo hover:bg-verde-profundo/90 text-crema text-xs font-bold rounded-xl shadow transition"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
