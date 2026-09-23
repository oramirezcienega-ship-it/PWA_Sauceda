"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import PrevisualizadorRedSocial from "@/components/PrevisualizadorRedSocial";
import CalendarioMarketingOmnicanal from "@/components/CalendarioMarketingOmnicanal";
import {
  PublicacionProgramada,
  obtenerPublicaciones,
  guardarPublicacion,
  cambiarEstadoPublicacion,
  reprogramarPublicacion,
  generarPublicacionesAutomaticas,
  regenerarCreativoPublicacion,
  eliminarPublicacion,
  eliminarPublicacionesMasivo,
  cambiarEstadoPublicacionesMasivo,
  actualizarImagenManual,
  restaurarFotoLimpia,
} from "@/app/actions/marketing";

export default function PaginaPublicaciones() {
  const [publicaciones, setPublicaciones] = useState<PublicacionProgramada[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [filtroPlataforma, setFiltroPlataforma] = useState<string>("todos");
  const [filtroFormato, setFiltroFormato] = useState<string>("todos");
  const [filtroTemaFiltro, setFiltroTemaFiltro] = useState<string>("todos");
  const [filtroFecha, setFiltroFecha] = useState<string>("todos");
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  
  const [pubEditando, setPubEditando] = useState<PublicacionProgramada | null>(null);
  const [pubPrevisualizar, setPubPrevisualizar] = useState<PublicacionProgramada | null>(null);
  const [pubProgramar, setPubProgramar] = useState<PublicacionProgramada | null>(null);
  const [fechaHoraProgramar, setFechaHoraProgramar] = useState<string>("");
  const [guardandoProgramacion, setGuardandoProgramacion] = useState(false);
  const [mostrarModalIA, setMostrarModalIA] = useState(false);
  const [cantidadIA, setCantidadIA] = useState(1);
  
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
  const [errorBd, setErrorBd] = useState<string | null>(null);

  const SQL_MIGRACION_COMPLETA = `-- ==============================================================================
-- MIGRACIÓN CONSOLIDADA: MÓDULO MARKETING & PUBLICACIONES IA
-- Compatible con: Supabase Producción y Staging
-- Ejecutar en: Supabase Dashboard -> SQL Editor
-- ==============================================================================

create table if not exists public.publicaciones_programadas (
  id                  uuid primary key default gen_random_uuid(),
  titulo              text not null,
  contenido           text not null,
  plataforma          text not null check (plataforma in ('facebook', 'instagram', 'tiktok', 'whatsapp')),
  tipo_formato        text not null check (tipo_formato in ('imagen', 'carrusel', 'video', 'reel')),
  sugerencia_visual   text,
  guion_video         text,
  fecha_programacion  timestamptz not null,
  estado              text not null default 'pendiente_revision' 
                        check (estado in ('pendiente_revision', 'aprobado', 'rechazado', 'publicado')),
  notas_revision      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.publicaciones_programadas 
  add column if not exists url_imagen text,
  add column if not exists diseno_banner jsonb default '{}'::jsonb,
  add column if not exists inversion_ads numeric default 0,
  add column if not exists impresiones integer default 0,
  add column if not exists clics integer default 0,
  add column if not exists leads_generados integer default 0,
  add column if not exists cpl numeric default 0,
  add column if not exists roi_score numeric default 0,
  add column if not exists meta_ad_id text;

create index if not exists publicaciones_programadas_estado_idx on public.publicaciones_programadas(estado);
create index if not exists publicaciones_programadas_fecha_idx on public.publicaciones_programadas(fecha_programacion);
create index if not exists publicaciones_programadas_cpl_idx on public.publicaciones_programadas(cpl) where estado = 'publicado';

alter table public.publicaciones_programadas enable row level security;

drop policy if exists "Acceso total para usuarios autenticados" on public.publicaciones_programadas;
create policy "Acceso total para usuarios autenticados"
  on public.publicaciones_programadas
  for all
  to authenticated
  using (true)
  with check (true);

notify pgrst, 'reload schema';`;

  const handleCopiarSqlMigracion = () => {
    navigator.clipboard.writeText(SQL_MIGRACION_COMPLETA);
    alert("¡SQL de migración copiado al portapapeles!\n\nPégalo en el SQL Editor de tu consola Supabase y presiona 'Run'.");
  };

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
    setErrorBd(null);
    try {
      const res = await obtenerPublicaciones({
        estado: filtroEstado,
        plataforma: filtroPlataforma,
        tipo_formato: filtroFormato,
      });
      if (res.success && res.data) {
        setPublicaciones(res.data);
      } else if (res.error) {
        setErrorBd(res.error);
      }
    } catch (err: any) {
      console.error("Error al cargar publicaciones:", err);
      setErrorBd(
        "La tabla 'publicaciones_programadas' no existe en la base de datos de este entorno. Es necesario ejecutar la migración SQL en Supabase para poder guardar y gestionar publicaciones."
      );
    } finally {
      setCargandoLista(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [filtroEstado, filtroPlataforma, filtroFormato]);

  const publicacionesFiltradas = publicaciones.filter((pub) => {
    // Filtro por Tema / Campaña
    if (filtroTemaFiltro !== "todos") {
      const textoBuscado = (pub.titulo + " " + pub.contenido + " " + (pub.sugerencia_visual || "")).toLowerCase();
      if (filtroTemaFiltro === "traspasos" && !textoBuscado.includes("traspaso") && !textoBuscado.includes("infonavit")) return false;
      if (filtroTemaFiltro === "impermeabilizacion" && !textoBuscado.includes("impermeabiliz")) return false;
      if (filtroTemaFiltro === "compra_directa" && !textoBuscado.includes("compra") && !textoBuscado.includes("contado") && !textoBuscado.includes("deuda")) return false;
      if (filtroTemaFiltro === "remodelacion" && !textoBuscado.includes("remodela") && !textoBuscado.includes("construc")) return false;
      if (filtroTemaFiltro === "gestion" && !textoBuscado.includes("gesti") && !textoBuscado.includes("legal") && !textoBuscado.includes("asesor")) return false;
    }

    // Filtro por Fecha
    if (filtroFecha !== "todos" && pub.fecha_programacion) {
      const fechaPub = pub.fecha_programacion.split("T")[0];
      const hoyObj = new Date();
      const hoyStr = hoyObj.toISOString().split("T")[0];
      
      if (filtroFecha === "hoy" && fechaPub !== hoyStr) return false;
      if (filtroFecha === "manana") {
        const mananaObj = new Date();
        mananaObj.setDate(mananaObj.getDate() + 1);
        const mananaStr = mananaObj.toISOString().split("T")[0];
        if (fechaPub !== mananaStr) return false;
      }
      if (filtroFecha === "esta_semana") {
        const hoy = new Date();
        const inicioSemana = new Date(hoy.setDate(hoy.getDate() - hoy.getDay()));
        const finSemana = new Date(hoy.setDate(hoy.getDate() - hoy.getDay() + 6));
        const pubDate = new Date(fechaPub);
        if (pubDate < inicioSemana || pubDate > finSemana) return false;
      }
      if (filtroFecha === "este_mes") {
        const mesActual = new Date().toISOString().slice(0, 7);
        if (!fechaPub.startsWith(mesActual)) return false;
      }
    }

    return true;
  });

  const handleAprobar = async (id: string) => {
    const res = await cambiarEstadoPublicacion(id, "aprobado");
    if (res.success) {
      if (res.aviso && (res.aviso.includes("falta") || res.aviso.includes("incorrecta") || res.aviso.includes("retornó") || res.aviso.includes("Error") || res.aviso.includes("Tiempo"))) {
        alert("Publicación aprobada en base de datos.\n\n⚠️ Aviso de n8n: " + res.aviso);
      } else {
        alert("¡Publicación aprobada y enviada a n8n con éxito! (n8n está generando el creativo)");
      }
      await cargarDatos();
    } else {
      alert("Error al aprobar publicación: " + res.error);
    }
  };

  const handleAbrirProgramar = (pub: PublicacionProgramada) => {
    setPubProgramar(pub);
    if (pub.fecha_programacion) {
      setFechaHoraProgramar(pub.fecha_programacion.substring(0, 16));
    } else {
      const manana = new Date();
      manana.setDate(manana.getDate() + 1);
      manana.setHours(10, 0, 0, 0);
      const tzOffset = manana.getTimezoneOffset() * 60000;
      setFechaHoraProgramar(new Date(manana.getTime() - tzOffset).toISOString().slice(0, 16));
    }
  };

  const handleGuardarProgramacionModal = async (nuevoEstado?: "aprobado" | "publicado") => {
    if (!pubProgramar?.id || !fechaHoraProgramar) return;
    setGuardandoProgramacion(true);
    try {
      const fechaIso = new Date(fechaHoraProgramar).toISOString();
      const res = await reprogramarPublicacion(pubProgramar.id, fechaIso, nuevoEstado);
      if (res.success) {
        if (nuevoEstado === "aprobado") {
          alert("¡Publicación aprobada y programada con éxito para la fecha seleccionada!");
        } else if (nuevoEstado === "publicado") {
          alert("¡Publicación marcada como publicada!");
        } else {
          alert("¡Fecha y hora de programación actualizadas con éxito!");
        }
        setPubProgramar(null);
        await cargarDatos();
      } else {
        alert("Error al programar: " + res.error);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setGuardandoProgramacion(false);
    }
  };

  const handleAtajoFechaModal = (tipo: "hoy_tarde" | "manana_10" | "manana_19" | "sabado_11") => {
    const base = new Date();
    if (tipo === "hoy_tarde") {
      base.setHours(18, 0, 0, 0);
    } else if (tipo === "manana_10") {
      base.setDate(base.getDate() + 1);
      base.setHours(10, 0, 0, 0);
    } else if (tipo === "manana_19") {
      base.setDate(base.getDate() + 1);
      base.setHours(19, 30, 0, 0);
    } else if (tipo === "sabado_11") {
      const diasHastaSabado = (6 - base.getDay() + 7) % 7 || 7;
      base.setDate(base.getDate() + diasHastaSabado);
      base.setHours(11, 0, 0, 0);
    }
    const tzOffset = base.getTimezoneOffset() * 60000;
    const localISOTime = new Date(base.getTime() - tzOffset).toISOString().slice(0, 16);
    setFechaHoraProgramar(localISOTime);
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
      if (res.aviso && (res.aviso.includes("falta") || res.aviso.includes("incorrecta") || res.aviso.includes("retornó") || res.aviso.includes("Error") || res.aviso.includes("Tiempo"))) {
        alert("Publicación marcada como publicada.\n\n⚠️ Aviso de n8n: " + res.aviso);
      } else {
        alert("¡Publicación marcada como publicada e informada a n8n!");
      }
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

  const handleRegenerarCreativo = async (id: string) => {
    setMensajeCarga("Solicitando un nuevo creativo fotorrealista a n8n...");
    startTransition(async () => {
      const res = await regenerarCreativoPublicacion(id);
      if (res.success) {
        if (res.aviso && (res.aviso.includes("falta") || res.aviso.includes("incorrecta") || res.aviso.includes("retornó") || res.aviso.includes("Error") || res.aviso.includes("Tiempo"))) {
          alert("Se solicitó regeneración.\n\n⚠️ Aviso de n8n: " + res.aviso);
        } else {
          alert("¡Solicitud enviada a n8n! Generando nuevo diseño con IA...");
        }
        await cargarDatos();
      } else {
        alert("Error al solicitar regeneración de creativo: " + res.error);
      }
    });
  };

  const CANVA_DESIGN_URL = "https://www.canva.com/design?create=true&template=EAHWDrq_iM8";
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const handleCopiarYNotificar = (pub: PublicacionProgramada) => {
    try {
      const textoCopiar = `📢 TÍTULO:\n${pub.titulo}\n\n📝 COPY:\n${pub.contenido}\n\n📞 CONTACTO:\n477 465 4700 • León, Gto.`;
      navigator.clipboard.writeText(textoCopiar);
      setCopiadoId(pub.id || "copy");
      setTimeout(() => setCopiadoId(null), 4000);
    } catch (e) {
      console.error("Error al copiar al portapapeles:", e);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pubIdParaSubir, setPubIdParaSubir] = useState<string | null>(null);

  const handleReemplazarArte = (id: string) => {
    setPubIdParaSubir(id);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleArchivoSeleccionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = pubIdParaSubir;
    if (!file || !targetId) return;

    setMensajeCarga("Subiendo y guardando arte desde tu equipo...");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("id", targetId);
        formData.append("file", file);

        const res = await fetch("/api/marketing/subir-arte", {
          method: "POST",
          body: formData,
        });

        const json = await res.json();
        if (res.ok && json.success) {
          await cargarDatos();
          // Si estamos editando en el modal, actualizar también su estado
          if (pubEditando && pubEditando.id === targetId) {
            setPubEditando({ ...pubEditando, url_imagen: json.url_imagen });
          }
          alert("🎉 ¡Arte publicitario guardado con éxito!");
        } else {
          alert("Error al subir imagen: " + (json.error || "Fallo desconocido"));
        }
      } catch (err: any) {
        console.error("Error al subir archivo de imagen:", err);
        alert("Error de red al subir imagen: " + err.message);
      } finally {
        setPubIdParaSubir(null);
      }
    });
  };

  const handleRestaurarFotoLimpia = async (id: string) => {
    if (!confirm("¿Deseas remover el banner SVG y restaurar la fotografía limpia generada por IA (Flux)?")) return;

    setMensajeCarga("Restaurando fotografía limpia original...");
    startTransition(async () => {
      const res = await restaurarFotoLimpia(id);
      if (res.success) {
        await cargarDatos();
        if (pubEditando && pubEditando.id === id) {
          setPubEditando(res.data ?? null);
        }
        alert("✨ Fotografía limpia restaurada con éxito.");
      } else {
        alert("Error al restaurar: " + res.error);
      }
    });
  };

  const [copiandoFotoId, setCopiandoFotoId] = useState<string | null>(null);

  const handleCopiarFoto = async (url: string, id: string) => {
    try {
      setCopiandoFotoId(id);
      let targetUrl = url;
      if (targetUrl.includes("generar-banner")) {
        const match = targetUrl.match(/foto=([^&]+)/);
        if (match && match[1]) targetUrl = decodeURIComponent(match[1]);
      }

      const res = await fetch(targetUrl);
      const blob = await res.blob();

      const img = new Image();
      img.crossOrigin = "anonymous";
      const objectUrl = URL.createObjectURL(blob);
      img.src = objectUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo obtener contexto 2D");
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(objectUrl);

      canvas.toBlob(async (pngBlob) => {
        if (!pngBlob) {
          window.open(targetUrl, "_blank");
          setCopiandoFotoId(null);
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": pngBlob }),
          ]);
          setCopiandoFotoId(null);
          alert("📋 ¡Foto copiada al portapapeles!\n\nVe a tu pestaña de Canva y presiona Ctrl + V para pegarla directamente en tu plantilla.");
        } catch {
          window.open(targetUrl, "_blank");
          setCopiandoFotoId(null);
          alert("Se abrió la foto limpia en una pestaña para copiarla (clic derecho -> Copiar imagen) o arrastrarla directamente a Canva.");
        }
      }, "image/png");
    } catch (err: any) {
      console.warn("Fallo al copiar imagen directo al portapapeles:", err);
      let targetUrl = url;
      if (targetUrl.includes("generar-banner")) {
        const match = targetUrl.match(/foto=([^&]+)/);
        if (match && match[1]) targetUrl = decodeURIComponent(match[1]);
      }
      window.open(targetUrl, "_blank");
      setCopiandoFotoId(null);
      alert("Se abrió la foto limpia en una pestaña para copiarla (clic derecho -> Copiar imagen) o arrastrarla a Canva.");
    }
  };

  const handleToggleSeleccion = (id: string) => {
    setSeleccionados(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSeleccionarTodos = () => {
    if (seleccionados.length === publicacionesFiltradas.length && publicacionesFiltradas.length > 0) {
      setSeleccionados([]);
    } else {
      setSeleccionados(publicacionesFiltradas.map(p => p.id!).filter(Boolean));
    }
  };

  const handleEliminarIndividual = async (id: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta publicación permanentemente?")) return;
    setMensajeCarga("Eliminando publicación...");
    startTransition(async () => {
      const res = await eliminarPublicacion(id);
      if (res.success) {
        setSeleccionados(prev => prev.filter(item => item !== id));
        await cargarDatos();
      } else {
        alert("Error al eliminar la publicación: " + res.error);
      }
    });
  };

  const handleEliminarMasivo = async () => {
    if (seleccionados.length === 0) return;
    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente las ${seleccionados.length} publicaciones seleccionadas?`)) return;
    
    setMensajeCarga(`Eliminando ${seleccionados.length} publicaciones...`);
    startTransition(async () => {
      const res = await eliminarPublicacionesMasivo(seleccionados);
      if (res.success) {
        setSeleccionados([]);
        await cargarDatos();
      } else {
        alert("Error en la eliminación masiva: " + res.error);
      }
    });
  };

  const handleAprobarMasivo = async () => {
    if (seleccionados.length === 0) return;
    if (!confirm(`¿Aprobar y enviar a n8n las ${seleccionados.length} publicaciones seleccionadas?`)) return;
    
    setMensajeCarga(`Aprobando ${seleccionados.length} publicaciones y enviando a n8n...`);
    startTransition(async () => {
      const res = await cambiarEstadoPublicacionesMasivo(seleccionados, "aprobado");
      if (res.success) {
        setSeleccionados([]);
        await cargarDatos();
        if (res.aviso && (res.aviso.includes("falta") || res.aviso.includes("incorrecta") || res.aviso.includes("retornó") || res.aviso.includes("Error") || res.aviso.includes("Tiempo"))) {
          alert("Publicaciones aprobadas en base de datos.\n\n⚠️ Aviso de n8n: " + res.aviso);
        } else {
          alert("¡Publicaciones aprobadas y enviadas a n8n con éxito!");
        }
      } else {
        alert("Error al aprobar publicaciones: " + res.error);
      }
    });
  };

  const handleRechazarMasivo = async () => {
    if (seleccionados.length === 0) return;
    const motivo = prompt(`Motivo de rechazo masivo para las ${seleccionados.length} publicaciones:`) || "Rechazo masivo";
    
    setMensajeCarga(`Rechazando ${seleccionados.length} publicaciones...`);
    startTransition(async () => {
      const res = await cambiarEstadoPublicacionesMasivo(seleccionados, "rechazado");
      if (res.success) {
        setSeleccionados([]);
        await cargarDatos();
      } else {
        alert("Error al rechazar publicaciones: " + res.error);
      }
    });
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
        setErrorBd(null);
        await cargarDatos();
      } else {
        alert("Ocurrió un error en la generación automática:\n\n" + res.error);
        if (
          res.error?.includes("publicaciones_programadas") ||
          res.error?.includes("schema cache") ||
          res.error?.includes("migración")
        ) {
          setErrorBd(res.error);
        }
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
        return <span className="bg-blue-600/10 text-blue-600 text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1"><span>🔵</span> Facebook</span>;
      case "instagram":
        return <span className="bg-pink-600/10 text-pink-600 text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1"><span>🟣</span> Instagram</span>;
      case "tiktok":
        return <span className="bg-black text-white text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1"><span>⚫</span> TikTok</span>;
      case "whatsapp":
        return <span className="bg-emerald-600/10 text-emerald-600 text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1"><span>🟢</span> WhatsApp</span>;
      case "email":
      case "mautic":
        return <span className="bg-orange-600/10 text-orange-600 text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1"><span>🟠</span> Mautic / Correo</span>;
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
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleArchivoSeleccionado}
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
      />
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
        {errorBd && (
          <div className="mb-6 rounded-2xl bg-amber-50 border border-amber-300 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl mt-0.5">⚠️</span>
              <div>
                <h3 className="text-sm font-bold text-amber-900">
                  Base de datos incompleta: falta la tabla de publicaciones
                </h3>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed max-w-4xl">
                  {errorBd} Ejecuta la migración SQL en tu consola Supabase para activar el módulo.
                </p>
              </div>
            </div>
            <button
              onClick={handleCopiarSqlMigracion}
              className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>📋</span> Copiar SQL de Migración
            </button>
          </div>
        )}

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
                <option value="mautic">Mautic / Correo</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-bold text-carbon/60 uppercase mb-1">Filtrar por Formato</label>
              <select
                value={filtroFormato}
                onChange={(e) => setFiltroFormato(e.target.value)}
                className="bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2 text-sm text-carbon focus:outline-none focus:border-verde-profundo cursor-pointer"
              >
                <option value="todos">🎨 Todos los Formatos</option>
                <option value="imagen">🖼️ Imagen Estática</option>
                <option value="carrusel">🖼️ Carrusel</option>
                <option value="video">🎥 Video</option>
                <option value="reel">📱 Reel / TikTok</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-carbon/60 uppercase mb-1">Filtrar por Campaña / Tema</label>
              <select
                value={filtroTemaFiltro}
                onChange={(e) => setFiltroTemaFiltro(e.target.value)}
                className="bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2 text-sm text-carbon focus:outline-none focus:border-verde-profundo cursor-pointer"
              >
                <option value="todos">🎯 Todos los Temas</option>
                <option value="traspasos">🏠 Traspasos INFONAVIT</option>
                <option value="impermeabilizacion">🌧️ Impermeabilización</option>
                <option value="compra_directa">💵 Compra Directa de Casas</option>
                <option value="remodelacion">🏗️ Remodelaciones</option>
                <option value="gestion">⚖️ Asesoría / Gestión Legal</option>
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-bold text-carbon/60 uppercase mb-1">Filtrar por Fecha</label>
              <select
                value={filtroFecha}
                onChange={(e) => setFiltroFecha(e.target.value)}
                className="bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2 text-sm text-carbon focus:outline-none focus:border-verde-profundo cursor-pointer"
              >
                <option value="todos">📅 Todas las Fechas</option>
                <option value="hoy">📌 Programadas para Hoy</option>
                <option value="manana">📌 Programadas para Mañana</option>
                <option value="esta_semana">📆 Esta Semana</option>
                <option value="este_mes">🗓️ Este Mes</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="text-xs text-carbon/50 font-medium">
              Total encontradas: <span className="font-bold text-verde-profundo text-sm">{publicacionesFiltradas.length}</span>
            </div>
            {publicacionesFiltradas.length > 0 && (
              <label className="flex items-center gap-2 text-xs font-bold text-verde-profundo bg-verde-profundo/5 hover:bg-verde-profundo/10 px-3 py-1.5 rounded-lg border border-verde-profundo/20 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  checked={seleccionados.length === publicacionesFiltradas.length && publicacionesFiltradas.length > 0}
                  onChange={handleToggleSeleccionarTodos}
                  className="w-4 h-4 rounded border-dorado/40 text-verde-profundo focus:ring-verde-profundo cursor-pointer"
                />
                <span>Seleccionar todas ({seleccionados.length}/{publicacionesFiltradas.length})</span>
              </label>
            )}
          </div>
        </div>

        {/* Barra de Acciones Masivas Flotante cuando hay elementos seleccionados */}
        {seleccionados.length > 0 && (
          <div className="mb-6 bg-verde-profundo text-crema p-4 rounded-2xl shadow-lg border border-dorado/40 flex flex-wrap items-center justify-between gap-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <span className="bg-dorado text-verde-profundo font-bold text-xs px-2.5 py-1 rounded-md">
                {seleccionados.length} Seleccionadas
              </span>
              <span className="text-sm font-semibold">Acciones masivas disponibles:</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleAprobarMasivo}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>✓</span> Aprobar Seleccionadas ({seleccionados.length})
              </button>
              <button
                onClick={handleRechazarMasivo}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>✕</span> Rechazar Seleccionadas ({seleccionados.length})
              </button>
              <button
                onClick={handleEliminarMasivo}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>🗑️</span> Eliminar Seleccionadas ({seleccionados.length})
              </button>
              <button
                onClick={() => setSeleccionados([])}
                className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-2 rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {cargandoLista ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-dorado/20 rounded-2xl">
            <div className="w-10 h-10 border-4 border-dorado/20 border-t-verde-profundo rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-carbon/60 font-semibold">Cargando la agenda de contenidos...</p>
          </div>
        ) : publicacionesFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-dorado/20 rounded-2xl px-6 text-center">
            <span className="text-5xl">🔍</span>
            <h3 className="mt-4 text-lg font-bold text-verde-profundo">No hay publicaciones con estos filtros</h3>
            <p className="mt-2 text-sm text-carbon/60 max-w-md">
              Prueba cambiando o limpiando los filtros seleccionados para ver más publicaciones.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {publicacionesFiltradas.map((pub) => {
              const guionActivo = guionesExpandidos[pub.id!] || false;
              const estaSeleccionado = seleccionados.includes(pub.id!);
              return (
                <div
                  key={pub.id}
                  className={`bg-white rounded-2xl border transition-all duration-300 flex flex-col shadow-xs ${
                    estaSeleccionado ? "border-verde-profundo ring-2 ring-verde-profundo/20 shadow-md" :
                    pub.estado === "pendiente_revision" ? "border-dorado/30 hover:border-dorado/60 hover:shadow-md" :
                    pub.estado === "aprobado" ? "border-emerald-500/30 hover:border-emerald-500/60" :
                    pub.estado === "rechazado" ? "border-red-500/20 opacity-90" : "border-carbon/10 bg-gray-50/50"
                  }`}
                >
                  <div className="px-6 py-4 border-b border-carbon/5 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={estaSeleccionado}
                        onChange={() => handleToggleSeleccion(pub.id!)}
                        className="w-4 h-4 rounded border-dorado/40 text-verde-profundo focus:ring-verde-profundo cursor-pointer"
                        title="Seleccionar para acciones masivas"
                      />
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

                    {pub.url_imagen && pub.url_imagen.length > 5 && (() => {
                      const mediaUrl = pub.url_imagen.startsWith("http") || pub.url_imagen.startsWith("data:")
                        ? pub.url_imagen
                        : `https://${pub.url_imagen}`;
                      const esVideo = Boolean(mediaUrl.match(/\.(mp4|webm|mov)(\?.*)?$/i));
                      const esBannerSvg = Boolean(mediaUrl.includes("generar-banner"));

                      return (
                        <div className="relative rounded-2xl overflow-hidden border border-dorado/30 shadow-md group bg-black">
                          {esVideo ? (
                            <video
                              src={mediaUrl}
                              controls
                              preload="metadata"
                              className="w-full h-64 object-contain mx-auto"
                            />
                          ) : (
                            <img
                              src={mediaUrl}
                              alt={pub.titulo}
                              referrerPolicy="no-referrer"
                              className="w-full h-64 object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          )}
                          <div className="absolute top-3 right-3 bg-carbon/80 backdrop-blur-md text-crema text-[10px] font-bold px-3 py-1 rounded-full border border-white/20 flex items-center gap-1.5 shadow-sm">
                            <span>{esVideo ? "🎬" : "🎨"}</span> {esVideo ? "Video Generado por IA" : (esBannerSvg ? "Banner Compuesto SVG" : "Fotografía Limpia (Flux)")}
                          </div>
                          <div className="absolute bottom-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <a
                              href={CANVA_DESIGN_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => handleCopiarYNotificar(pub)}
                              className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md transition-all flex items-center gap-1 cursor-pointer"
                              title="Copiar contenido y abrir tu plantilla en Canva"
                            >
                              🎨 Canva
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCopiarFoto(pub.url_imagen!, pub.id!)}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md transition-all flex items-center gap-1 cursor-pointer"
                              title="Copiar foto al portapapeles para pegarla en Canva con Ctrl + V"
                            >
                              📋 Copiar Foto
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReemplazarArte(pub.id!)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md transition-all flex items-center gap-1 cursor-pointer"
                              title="Subir archivo (.png/.jpg) descargado de Canva a este post"
                            >
                              📁 Subir Arte
                            </button>
                            {esBannerSvg && (
                              <button
                                type="button"
                                onClick={() => handleRestaurarFotoLimpia(pub.id!)}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md transition-all flex items-center gap-1 cursor-pointer"
                                title="Remover banner SVG y restaurar la foto original limpia de Flux"
                              >
                                🧹 Foto Limpia
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRegenerarCreativo(pub.id!)}
                              className="bg-amber-600/90 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md transition-all flex items-center gap-1 cursor-pointer"
                              title="Generar otra variante de imagen/video"
                            >
                              🔄 Regenerar
                            </button>
                            <a
                              href={mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="bg-white/90 hover:bg-white text-carbon text-xs font-bold px-3 py-1.5 rounded-lg shadow-md transition-all flex items-center gap-1"
                            >
                              🔍 HD
                            </a>
                          </div>
                        </div>
                      );
                    })()}

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

                    {((pub.leads_generados !== undefined && pub.leads_generados > 0) || (pub.inversion_ads !== undefined && pub.inversion_ads > 0)) && (
                      <div className="text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-emerald-800 block mb-1">📊 Rendimiento de Campaña (API Sincronizado):</span>
                          <div className="flex flex-wrap gap-3 text-carbon/80 font-mono text-[11px]">
                            <span>💵 Inversión: <strong>${pub.inversion_ads || 0} MXN</strong></span>
                            <span>👥 Prospectos: <strong>{pub.leads_generados || 0}</strong></span>
                            <span>🎯 CPL: <strong>${pub.cpl || 0} MXN</strong></span>
                          </div>
                        </div>
                        <div className="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg text-[10px]">
                          ⭐ Score: {pub.roi_score || 0}/100
                        </div>
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
                      onClick={() => handleEliminarIndividual(pub.id!)}
                      className="bg-white hover:bg-red-50 border border-red-200 text-red-600 hover:text-red-700 font-semibold text-xs px-3 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1"
                      title="Eliminar esta publicación permanentemente"
                    >
                      🗑️ Eliminar
                    </button>

                    <a
                      href={CANVA_DESIGN_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleCopiarYNotificar(pub)}
                      className="bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-xs px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                      title="Copiar contenido de este post y abrir tu plantilla en Canva"
                    >
                      <span>🎨</span> Canva
                      {copiadoId === pub.id && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold animate-in fade-in">
                          ¡Copiado!
                        </span>
                      )}
                    </a>

                    {pub.url_imagen && (
                      <button
                        type="button"
                        onClick={() => handleCopiarFoto(pub.url_imagen!, pub.id!)}
                        className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold text-xs px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                        title="Copiar foto al portapapeles para pegarla en Canva con Ctrl + V"
                      >
                        <span>📋</span> {copiandoFotoId === pub.id ? "Copiando..." : "Copiar Foto"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleReemplazarArte(pub.id!)}
                      className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                      title="Subir archivo (.png/.jpg) descargado de Canva a este post"
                    >
                      <span>📁</span> Subir Arte
                    </button>

                    <button
                      type="button"
                      onClick={() => setPubPrevisualizar(pub)}
                      className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      title="Previsualizar cómo se verá en la red social"
                    >
                      <span>👁️</span> Previsualizar
                    </button>

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
                          type="button"
                          onClick={() => handleAbrirProgramar(pub)}
                          className="bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1"
                          title="Elegir fecha y hora exacta para este post"
                        >
                          <span>⏰</span> Programar
                        </button>
                        <button
                          onClick={() => handleAprobar(pub.id!)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition-all cursor-pointer"
                        >
                          ✓ Aprobar
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
                          type="button"
                          onClick={() => handleAbrirProgramar(pub)}
                          className="bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center gap-1"
                          title="Reagendar fecha y hora de publicación"
                        >
                          <span>⏰</span> Reagendar
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

        {/* Sección de Calendario Editorial Omnicanal */}
        <CalendarioMarketingOmnicanal
          publicaciones={publicaciones}
          onRecargar={cargarDatos}
          onPrevisualizar={(pub) => setPubPrevisualizar(pub)}
          onEditar={(pub) => setPubEditando(pub)}
          onNuevaPublicacionParaFecha={(fechaIso) => {
            setFechaIA(fechaIso);
            setMostrarModalIA(true);
          }}
        />
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
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCantidadIA(num)}
                      className={`py-2 rounded-xl text-sm font-bold border transition ${
                        cantidadIA === num ? "bg-verde-profundo text-crema border-verde-profundo" : "bg-crema/10 text-carbon border-dorado/30 hover:bg-crema/20"
                      }`}
                    >
                      {num} {num === 1 ? "post" : "posts"}
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
                    <option value="mautic">Mautic / Correo</option>
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

                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-carbon/60 block mb-1">
                    Prompt Fotográfico IA (Flux / Replicate en Inglés)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Award-winning commercial architectural editorial photography of a modern Mexican residential..."
                    value={pubEditando.prompt_imagen_flux || (pubEditando.diseno_banner as any)?.prompt_imagen_flux || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPubEditando({
                        ...pubEditando,
                        prompt_imagen_flux: val,
                        diseno_banner: {
                          ...(pubEditando.diseno_banner || {}),
                          prompt_imagen_flux: val,
                        },
                      });
                    }}
                    className="w-full bg-crema/10 border border-dorado/30 rounded-xl p-4 text-xs text-carbon focus:outline-none focus:border-verde-profundo font-mono"
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
                      value={pubEditando.notas_revision || ""}
                      onChange={(e) => setPubEditando({ ...pubEditando, notas_revision: e.target.value })}
                      className="w-full bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-500"
                    />
                  </div>
                )}

                {/* Sección de Arte / Imagen de la Publicación */}
                <div className="md:col-span-2 border-t border-dorado/20 pt-4 mt-2">
                  <label className="text-xs font-bold text-verde-profundo uppercase block mb-2 flex items-center gap-1.5">
                    <span>🖼️</span> Arte / Creativo Visual
                  </label>
                  <div className="bg-crema/10 border border-dorado/30 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center">
                    {pubEditando.url_imagen && pubEditando.url_imagen.length > 5 ? (
                      <div className="w-24 h-24 rounded-xl overflow-hidden border border-dorado/30 relative flex-shrink-0 bg-black shadow-xs">
                        <img
                          src={pubEditando.url_imagen}
                          alt="Vista previa"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded-xl border border-dashed border-dorado/40 flex items-center justify-center text-xs text-carbon/40 flex-shrink-0">
                        Sin imagen
                      </div>
                    )}
                    <div className="flex-1 w-full space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPubIdParaSubir(pubEditando.id!);
                            if (fileInputRef.current) {
                              fileInputRef.current.value = "";
                              fileInputRef.current.click();
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>📁</span> Cargar PNG de Canva / PC
                        </button>
                        {pubEditando.url_imagen?.includes("generar-banner") && (
                          <button
                            type="button"
                            onClick={() => handleRestaurarFotoLimpia(pubEditando.id!)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>🧹</span> Restaurar Foto Limpia
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="O pega una URL directa (https://...)"
                        value={pubEditando.url_imagen || ""}
                        onChange={(e) => setPubEditando({ ...pubEditando, url_imagen: e.target.value })}
                        className="w-full bg-white border border-dorado/30 rounded-lg px-3 py-1.5 text-xs text-carbon focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Sección de Parametrización Dinámica de Anuncio Vendedor (Banner Meta Ads) */}
                <div className="md:col-span-2 border-t border-dorado/20 pt-4 mt-2">
                  <div className="bg-dorado/10 border border-dorado/30 rounded-2xl p-4">
                    <h4 className="font-bold text-verde-profundo text-xs uppercase mb-3 flex items-center gap-2">
                      <span>🎨</span> Personalizar Anuncio Vendedor (Estilo VIPROCOSA / Meta Ads)
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-carbon/70 block mb-1">Título del Ad (Banner)</label>
                        <input
                          type="text"
                          value={pubEditando.diseno_banner?.titulo_ad || pubEditando.titulo}
                          onChange={(e) => setPubEditando({
                            ...pubEditando,
                            diseno_banner: { ...pubEditando.diseno_banner, titulo_ad: e.target.value }
                          })}
                          className="w-full bg-white border border-dorado/30 rounded-lg px-3 py-1.5 text-xs text-carbon focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-carbon/70 block mb-1">Subtítulo / Oferta</label>
                        <input
                          type="text"
                          value={pubEditando.diseno_banner?.subtitulo_ad || "Instalación en 1 día • Garantía por escrito"}
                          onChange={(e) => setPubEditando({
                            ...pubEditando,
                            diseno_banner: { ...pubEditando.diseno_banner, subtitulo_ad: e.target.value }
                          })}
                          className="w-full bg-white border border-dorado/30 rounded-lg px-3 py-1.5 text-xs text-carbon focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-carbon/70 block mb-1">Sello 1 (Texto Top / Bot)</label>
                        <div className="grid grid-cols-2 gap-1">
                          <input
                            type="text"
                            placeholder="GARANTÍA"
                            value={pubEditando.diseno_banner?.sellos?.[0]?.texto_top || "GARANTÍA"}
                            onChange={(e) => {
                              const sellos = [...(pubEditando.diseno_banner?.sellos || [{ texto_top: "GARANTÍA", texto_bottom: "10 AÑOS" }])];
                              sellos[0] = { ...sellos[0], texto_top: e.target.value };
                              setPubEditando({ ...pubEditando, diseno_banner: { ...pubEditando.diseno_banner, sellos } });
                            }}
                            className="bg-white border border-dorado/30 rounded-lg px-2 py-1 text-xs text-carbon"
                          />
                          <input
                            type="text"
                            placeholder="10 AÑOS"
                            value={pubEditando.diseno_banner?.sellos?.[0]?.texto_bottom || "10 AÑOS"}
                            onChange={(e) => {
                              const sellos = [...(pubEditando.diseno_banner?.sellos || [{ texto_top: "GARANTÍA", texto_bottom: "10 AÑOS" }])];
                              sellos[0] = { ...sellos[0], texto_bottom: e.target.value };
                              setPubEditando({ ...pubEditando, diseno_banner: { ...pubEditando.diseno_banner, sellos } });
                            }}
                            className="bg-white border border-dorado/30 rounded-lg px-2 py-1 text-xs text-carbon"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-carbon/70 block mb-1">Sello 2 (Texto Top / Bot)</label>
                        <div className="grid grid-cols-2 gap-1">
                          <input
                            type="text"
                            placeholder="MARCA"
                            value={pubEditando.diseno_banner?.sellos?.[1]?.texto_top || "MARCA"}
                            onChange={(e) => {
                              const s0 = pubEditando.diseno_banner?.sellos?.[0] || { texto_top: "", texto_bottom: "" };
                              const s1 = pubEditando.diseno_banner?.sellos?.[1] || { texto_top: "MARCA", texto_bottom: "GTO" };
                              const sellos = [s0, { ...s1, texto_top: e.target.value }];
                              setPubEditando({ ...pubEditando, diseno_banner: { ...pubEditando.diseno_banner, sellos } });
                            }}
                            className="bg-white border border-dorado/30 rounded-lg px-2 py-1 text-xs text-carbon"
                          />
                          <input
                            type="text"
                            placeholder="GTO"
                            value={pubEditando.diseno_banner?.sellos?.[1]?.texto_bottom || "GTO"}
                            onChange={(e) => {
                              const s0 = pubEditando.diseno_banner?.sellos?.[0] || { texto_top: "", texto_bottom: "" };
                              const s1 = pubEditando.diseno_banner?.sellos?.[1] || { texto_top: "MARCA", texto_bottom: "GTO" };
                              const sellos = [s0, { ...s1, texto_bottom: e.target.value }];
                              setPubEditando({ ...pubEditando, diseno_banner: { ...pubEditando.diseno_banner, sellos } });
                            }}
                            className="bg-white border border-dorado/30 rounded-lg px-2 py-1 text-xs text-carbon"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-carbon/70 block mb-1">Teléfono WhatsApp Contacto</label>
                        <input
                          type="text"
                          value={pubEditando.diseno_banner?.telefono_contacto || "477 465 4700"}
                          onChange={(e) => setPubEditando({
                            ...pubEditando,
                            diseno_banner: { ...pubEditando.diseno_banner, telefono_contacto: e.target.value }
                          })}
                          className="w-full bg-white border border-dorado/30 rounded-lg px-3 py-1.5 text-xs text-carbon focus:outline-none font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-carbon/70 block mb-1">Color Destacado del Ad</label>
                        <select
                          value={pubEditando.diseno_banner?.color_destacado || "#2D4A2B"}
                          onChange={(e) => setPubEditando({
                            ...pubEditando,
                            diseno_banner: { ...pubEditando.diseno_banner, color_destacado: e.target.value }
                          })}
                          className="w-full bg-white border border-dorado/30 rounded-lg px-3 py-1.5 text-xs text-carbon focus:outline-none cursor-pointer font-bold"
                        >
                          <option value="#2D4A2B">🟢 Verde Profundo SAUCEDA (#2D4A2B)</option>
                          <option value="#5C7A52">🌿 Verde Sauce SAUCEDA (#5C7A52)</option>
                          <option value="#C9A961">🟡 Dorado Tierra SAUCEDA (#C9A961)</option>
                          <option value="#C44A4A">🔴 Rojo Oferta SAUCEDA (#C44A4A)</option>
                          <option value="#5C8DAA">🔵 Azul Cielo SAUCEDA (#5C8DAA)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
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

      {/* Modal de Previsualización en Redes Sociales */}
      {pubPrevisualizar && (
        <PrevisualizadorRedSocial
          publicacion={pubPrevisualizar}
          abierto={Boolean(pubPrevisualizar)}
          onCerrar={() => setPubPrevisualizar(null)}
          onEditar={(pub) => setPubEditando(pub)}
          onProgramar={(pub) => handleAbrirProgramar(pub)}
        />
      )}

      {/* Modal de Programación Rápida con Horario Específico */}
      {pubProgramar && (
        <div className="fixed inset-0 z-50 bg-carbon/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-dorado/30 overflow-hidden">
            {/* Cabecera */}
            <div className="bg-verde-profundo text-crema p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-dorado block">
                  Programación de Publicación
                </span>
                <h3 className="font-bold text-base mt-0.5 truncate max-w-[340px]">
                  ⏰ Definir Horario de Publicación
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPubProgramar(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold cursor-pointer transition"
              >
                ✕
              </button>
            </div>

            {/* Contenido */}
            <div className="p-6 space-y-4">
              <div>
                <h4 className="font-bold text-sm text-verde-profundo mb-1">
                  {pubProgramar.titulo}
                </h4>
                <div className="flex items-center gap-2 mb-2">
                  {getPlataformaBadge(pubProgramar.plataforma)}
                  <span className="text-xs bg-gray-100 text-carbon/70 font-semibold px-2 py-0.5 rounded-md">
                    {getFormatoIcon(pubProgramar.tipo_formato)}
                  </span>
                </div>
                <p className="text-xs text-carbon/70 bg-gray-50 p-3 rounded-xl border border-gray-200 line-clamp-2">
                  {pubProgramar.contenido}
                </p>
              </div>

              {/* Selector de Fecha y Hora */}
              <div className="border border-dorado/30 rounded-2xl p-4 bg-dorado/5 space-y-3">
                <label className="text-xs font-bold text-carbon/80 block">
                  Fecha y Hora Programada:
                </label>
                <input
                  type="datetime-local"
                  required
                  value={fechaHoraProgramar}
                  onChange={(e) => setFechaHoraProgramar(e.target.value)}
                  className="w-full bg-white border border-dorado/30 rounded-xl px-3.5 py-2.5 text-sm text-carbon focus:outline-none focus:border-verde-profundo"
                />

                {/* Atajos de 1 clic */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold text-carbon/50 block">Atajos de horarios recomendados:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAtajoFechaModal("hoy_tarde")}
                      className="text-[11px] font-semibold bg-white hover:bg-gray-100 border border-gray-200 rounded-lg py-1.5 px-2 text-carbon text-left cursor-pointer transition"
                    >
                      🌆 Hoy a las 18:00 hrs
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAtajoFechaModal("manana_10")}
                      className="text-[11px] font-semibold bg-white hover:bg-gray-100 border border-gray-200 rounded-lg py-1.5 px-2 text-carbon text-left cursor-pointer transition"
                    >
                      🌅 Mañana a las 10:00 hrs
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAtajoFechaModal("manana_19")}
                      className="text-[11px] font-semibold bg-white hover:bg-gray-100 border border-gray-200 rounded-lg py-1.5 px-2 text-carbon text-left cursor-pointer transition"
                    >
                      🌙 Mañana a las 19:30 hrs
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAtajoFechaModal("sabado_11")}
                      className="text-[11px] font-semibold bg-white hover:bg-gray-100 border border-gray-200 rounded-lg py-1.5 px-2 text-carbon text-left cursor-pointer transition"
                    >
                      ☀️ Sábado a las 11:00 hrs
                    </button>
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  disabled={guardandoProgramacion}
                  onClick={() => handleGuardarProgramacionModal("aprobado")}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <span>✓</span> {guardandoProgramacion ? "Guardando..." : "Aprobar y Programar a esta Hora"}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={guardandoProgramacion}
                    onClick={() => handleGuardarProgramacionModal(undefined)}
                    className="w-full bg-white hover:bg-gray-100 border border-dorado/40 text-carbon font-bold text-xs py-2.5 rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    💾 Guardar Fecha
                  </button>
                  <button
                    type="button"
                    disabled={guardandoProgramacion}
                    onClick={() => handleGuardarProgramacionModal("publicado")}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <span>📲</span> Publicar Ahora
                  </button>
                </div>
              </div>
            </div>

            {/* Pie */}
            <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={() => setPubProgramar(null)}
                className="text-xs font-semibold text-carbon/60 hover:text-carbon cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
