"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import PrevisualizadorRedSocial from "@/components/PrevisualizadorRedSocial";
import CalendarioMarketingOmnicanal from "@/components/CalendarioMarketingOmnicanal";
import ModalConexionMeta from "@/components/ModalConexionMeta";
import {
  PublicacionProgramada,
  obtenerPublicaciones,
  guardarPublicacion,
  cambiarEstadoPublicacion,
  reprogramarPublicacion,
  generarPublicacionesAutomaticas,
  adaptarPublicacionAOtrasRedes,
  regenerarCreativoPublicacion,
  eliminarPublicacion,
  eliminarPublicacionesMasivo,
  cambiarEstadoPublicacionesMasivo,
  actualizarImagenManual,
  restaurarFotoLimpia,
  ejecutarPublicacionMeta,
  ejecutarEnvioMautic,
  procesarPublicacionesProgramadasVencidas,
} from "@/app/actions/marketing";

interface OpcionFiltro {
  id: string;
  label: string;
  icono?: string;
}

const OPCIONES_ESTADO: OpcionFiltro[] = [
  { id: "pendiente_revision", label: "Pendientes de Revisión", icono: "⏳" },
  { id: "aprobado", label: "Aprobados (Listos)", icono: "✅" },
  { id: "publicado", label: "Publicados / Enviados", icono: "📲" },
  { id: "rechazado", label: "Rechazados", icono: "❌" },
];

const OPCIONES_CANAL: OpcionFiltro[] = [
  { id: "facebook", label: "Facebook", icono: "🔵" },
  { id: "instagram", label: "Instagram", icono: "🟣" },
  { id: "tiktok", label: "TikTok", icono: "⚫" },
  { id: "whatsapp", label: "WhatsApp", icono: "🟢" },
  { id: "mautic", label: "Mautic / Correo", icono: "🟠" },
];

const OPCIONES_FORMATO: OpcionFiltro[] = [
  { id: "imagen", label: "Imagen Estática", icono: "🖼️" },
  { id: "carrusel", label: "Carrusel", icono: "🖼️" },
  { id: "video", label: "Video", icono: "🎥" },
  { id: "reel", label: "Reel / TikTok", icono: "📱" },
];

const OPCIONES_TEMA: OpcionFiltro[] = [
  { id: "traspasos", label: "Traspasos INFONAVIT", icono: "🏠" },
  { id: "impermeabilizacion", label: "Impermeabilización", icono: "🌧️" },
  { id: "compra_directa", label: "Compra Directa de Casas", icono: "💵" },
  { id: "remodelacion", label: "Remodelaciones", icono: "🏗️" },
  { id: "gestion", label: "Asesoría / Gestión Legal", icono: "⚖️" },
];

const OPCIONES_FECHA: OpcionFiltro[] = [
  { id: "hoy", label: "Programadas para Hoy", icono: "📌" },
  { id: "manana", label: "Programadas para Mañana", icono: "📌" },
  { id: "esta_semana", label: "Esta Semana", icono: "📆" },
  { id: "este_mes", label: "Este Mes", icono: "🗓️" },
];

function DropdownFiltroMultiple({
  titulo,
  icono,
  opciones,
  valoresSeleccionados,
  onToggle,
  onLimpiar,
}: {
  titulo: string;
  icono: string;
  opciones: OpcionFiltro[];
  valoresSeleccionados: string[];
  onToggle: (id: string) => void;
  onLimpiar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickAfuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    if (abierto) {
      document.addEventListener("mousedown", handleClickAfuera);
      return () => document.removeEventListener("mousedown", handleClickAfuera);
    }
  }, [abierto]);

  const cantSeleccionados = valoresSeleccionados.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((prev) => !prev)}
        className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
          cantSeleccionados > 0
            ? "bg-verde-profundo text-white border-verde-profundo shadow-xs"
            : "bg-crema/10 border-dorado/30 text-carbon/80 hover:border-dorado/60 hover:bg-white"
        }`}
      >
        <span>{icono}</span>
        <span>{titulo}</span>
        {cantSeleccionados > 0 ? (
          <span className="bg-dorado text-verde-profundo text-[10px] font-black px-1.5 py-0.2 rounded-full min-w-[18px] text-center">
            {cantSeleccionados}
          </span>
        ) : (
          <span className="text-carbon/40 text-[10px]">Todos</span>
        )}
        <span className={`text-[9px] transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {abierto && (
        <div className="absolute top-full left-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-dorado/30 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 pb-2 mb-1 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[11px] font-bold text-carbon/60 uppercase tracking-wider">
              {titulo}
            </span>
            {cantSeleccionados > 0 && (
              <button
                type="button"
                onClick={onLimpiar}
                className="text-[10px] font-bold text-red-500 hover:text-red-700 cursor-pointer"
              >
                Desmarcar todos
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto px-1.5 space-y-0.5">
            {opciones.map((opc) => {
              const estaActivo = valoresSeleccionados.includes(opc.id);
              return (
                <button
                  key={opc.id}
                  type="button"
                  onClick={() => onToggle(opc.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition cursor-pointer text-left ${
                    estaActivo
                      ? "bg-verde-profundo/10 text-verde-profundo font-bold"
                      : "text-carbon/80 hover:bg-gray-100"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {opc.icono && <span>{opc.icono}</span>}
                    <span>{opc.label}</span>
                  </span>
                  <span
                    className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] font-black transition-colors ${
                      estaActivo
                        ? "bg-verde-profundo text-white border-verde-profundo"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {estaActivo && "✓"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaginaPublicaciones() {
  const [publicaciones, setPublicaciones] = useState<PublicacionProgramada[]>([]);
  const [mostrarModalMeta, setMostrarModalMeta] = useState(false);
  const [publicandoMetaId, setPublicandoMetaId] = useState<string | null>(null);
  const [disparandoMauticId, setDisparandoMauticId] = useState<string | null>(null);

  // Estados de Filtros Multiselección
  const [filtrosEstado, setFiltrosEstado] = useState<string[]>([]);
  const [filtrosPlataforma, setFiltrosPlataforma] = useState<string[]>([]);
  const [filtrosFormato, setFiltrosFormato] = useState<string[]>([]);
  const [filtrosTema, setFiltrosTema] = useState<string[]>([]);
  const [filtrosFecha, setFiltrosFecha] = useState<string[]>([]);
  const [filtrosCargados, setFiltrosCargados] = useState(false);

  // Densidad de visualización: número de columnas (3, 4 o 5 por fila)
  const [numColumnas, setNumColumnas] = useState<number>(4);
  const [textosExpandidos, setTextosExpandidos] = useState<Record<string, boolean>>({});

  const toggleTextoExpandido = (id: string) => {
    setTextosExpandidos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Restaurar filtros guardados en localStorage al iniciar
  useEffect(() => {
    try {
      const guardado = localStorage.getItem("crm_sauceda_publicaciones_filtros_v2");
      if (guardado) {
        const parsed = JSON.parse(guardado);
        if (Array.isArray(parsed.estados)) setFiltrosEstado(parsed.estados);
        if (Array.isArray(parsed.plataformas)) setFiltrosPlataforma(parsed.plataformas);
        if (Array.isArray(parsed.formatos)) setFiltrosFormato(parsed.formatos);
        if (Array.isArray(parsed.temas)) setFiltrosTema(parsed.temas);
        if (Array.isArray(parsed.fechas)) setFiltrosFecha(parsed.fechas);
      }
      const colsGuardadas = localStorage.getItem("crm_sauceda_publicaciones_cols");
      if (colsGuardadas) {
        const n = parseInt(colsGuardadas, 10);
        if (n === 3 || n === 4 || n === 5) setNumColumnas(n);
      }
    } catch (e) {
      console.warn("Aviso al restaurar filtros de publicaciones:", e);
    } finally {
      setFiltrosCargados(true);
    }
  }, []);

  // Guardar filtros en localStorage al cambiar
  useEffect(() => {
    if (!filtrosCargados) return;
    try {
      localStorage.setItem(
        "crm_sauceda_publicaciones_filtros_v2",
        JSON.stringify({
          estados: filtrosEstado,
          plataformas: filtrosPlataforma,
          formatos: filtrosFormato,
          temas: filtrosTema,
          fechas: filtrosFecha,
        })
      );
      localStorage.setItem("crm_sauceda_publicaciones_cols", String(numColumnas));
    } catch (e) {
      console.warn("Aviso al guardar filtros de publicaciones:", e);
    }
  }, [filtrosEstado, filtrosPlataforma, filtrosFormato, filtrosTema, filtrosFecha, numColumnas, filtrosCargados]);

  // Handlers para togglear filtros
  const handleToggleFiltro = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    valor: string
  ) => {
    setter((prev) =>
      prev.includes(valor) ? prev.filter((v) => v !== valor) : [...prev, valor]
    );
  };

  const handleLimpiarTodosFiltros = () => {
    setFiltrosEstado([]);
    setFiltrosPlataforma([]);
    setFiltrosFormato([]);
    setFiltrosTema([]);
    setFiltrosFecha([]);
    try {
      localStorage.removeItem("crm_sauceda_publicaciones_filtros_v2");
    } catch {}
  };

  const gridColsClass = useMemo(() => {
    if (numColumnas === 3) {
      return "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5";
    }
    if (numColumnas === 5) {
      return "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3.5";
    }
    return "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4";
  }, [numColumnas]);

  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  
  const [pubEditando, setPubEditando] = useState<PublicacionProgramada | null>(null);
  const [pubPrevisualizar, setPubPrevisualizar] = useState<PublicacionProgramada | null>(null);
  const [pubProgramar, setPubProgramar] = useState<PublicacionProgramada | null>(null);
  const [fechaHoraProgramar, setFechaHoraProgramar] = useState<string>("");
  const [guardandoProgramacion, setGuardandoProgramacion] = useState(false);
  const [mostrarModalIA, setMostrarModalIA] = useState(false);
  const [temaIA, setTemaIA] = useState<string>("Servicios de impermeabilización profesional con garantía de 5 a 10 años");
  const [usarTemaPersonalizado, setUsarTemaPersonalizado] = useState(false);
  const [temaPersonalizado, setTemaPersonalizado] = useState("");
  const [canalesSeleccionadosIA, setCanalesSeleccionadosIA] = useState<Array<"facebook" | "instagram" | "tiktok" | "whatsapp" | "mautic">>([
    "instagram",
    "facebook",
    "tiktok",
  ]);
  const [detallesExtraIA, setDetallesExtraIA] = useState("");
  
  const obtenerManana = () => {
    const hoy = new Date();
    hoy.setDate(hoy.getDate() + 1);
    return hoy.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
  };
  const [fechaIA, setFechaIA] = useState(obtenerManana());

  // Estados para Replicar / Adaptar publicación existente a otras redes
  const [pubParaReplicar, setPubParaReplicar] = useState<PublicacionProgramada | null>(null);
  const [canalesParaReplicar, setCanalesParaReplicar] = useState<Array<"facebook" | "instagram" | "tiktok" | "whatsapp" | "mautic">>([
    "facebook",
  ]);
  const [instruccionesReplicar, setInstruccionesReplicar] = useState("");
  const [replicando, setReplicando] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [cargandoLista, setCargandoLista] = useState(true);
  const [mensajeCarga, setMensajeCarga] = useState("Generando contenido...");
  const [guionesExpandidos, setGuionesExpandidos] = useState<Record<string, boolean>>({});
  const [regenerandoIds, setRegenerandoIds] = useState<Record<string, boolean>>({});
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
      // Revisar y detonar publicaciones programadas que ya hayan alcanzado su horario establecido
      try {
        await procesarPublicacionesProgramadasVencidas();
      } catch (autoErr) {
        console.warn("Aviso al verificar publicaciones vencidas:", autoErr);
      }

      const res = await obtenerPublicaciones();
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
  }, []);

  const publicacionesFiltradas = publicaciones.filter((pub) => {
    // Filtro por Estado múltiple
    if (filtrosEstado.length > 0 && !filtrosEstado.includes(pub.estado)) {
      return false;
    }

    // Filtro por Canal múltiple
    if (filtrosPlataforma.length > 0) {
      const coincideCanal = filtrosPlataforma.some((plat) => {
        if (plat === "mautic") {
          return pub.plataforma === "mautic" || pub.plataforma === "email";
        }
        return pub.plataforma === plat;
      });
      if (!coincideCanal) return false;
    }

    // Filtro por Formato múltiple
    if (filtrosFormato.length > 0 && !filtrosFormato.includes(pub.tipo_formato)) {
      return false;
    }

    // Filtro por Tema / Campaña múltiple
    if (filtrosTema.length > 0) {
      const textoBuscado = (pub.titulo + " " + pub.contenido + " " + (pub.sugerencia_visual || "")).toLowerCase();
      const coincideTema = filtrosTema.some((tema) => {
        if (tema === "traspasos") return textoBuscado.includes("traspaso") || textoBuscado.includes("infonavit");
        if (tema === "impermeabilizacion") return textoBuscado.includes("impermeabiliz");
        if (tema === "compra_directa") return textoBuscado.includes("compra") || textoBuscado.includes("contado") || textoBuscado.includes("deuda");
        if (tema === "remodelacion") return textoBuscado.includes("remodela") || textoBuscado.includes("construc");
        if (tema === "gestion") return textoBuscado.includes("gesti") || textoBuscado.includes("legal") || textoBuscado.includes("asesor");
        return false;
      });
      if (!coincideTema) return false;
    }

    // Filtro por Fecha múltiple
    if (filtrosFecha.length > 0) {
      const strFecha = (pub.estado === "publicado" && pub.publicado_en)
        ? pub.publicado_en
        : (pub.fecha_programacion || pub.created_at);
      if (!strFecha) return false;
      const dPub = new Date(strFecha);
      const fechaPub = dPub.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
      const hoyObj = new Date();
      const hoyStr = hoyObj.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });

      const mananaObj = new Date();
      mananaObj.setDate(mananaObj.getDate() + 1);
      const mananaStr = mananaObj.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });

      const hoyD = new Date();
      const inicioSemana = new Date(hoyD.setDate(hoyD.getDate() - hoyD.getDay()));
      const finSemana = new Date(hoyD.setDate(hoyD.getDate() - hoyD.getDay() + 6));
      const mesActual = hoyObj.toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" }).slice(0, 7);

      const coincideFecha = filtrosFecha.some((tipoFecha) => {
        if (tipoFecha === "hoy") return fechaPub === hoyStr;
        if (tipoFecha === "manana") return fechaPub === mananaStr;
        if (tipoFecha === "esta_semana") return dPub >= inicioSemana && dPub <= finSemana;
        if (tipoFecha === "este_mes") return fechaPub.startsWith(mesActual);
        return false;
      });
      if (!coincideFecha) return false;
    }

    return true;
  });

  const handleAprobar = async (id: string) => {
    const pubTarget = publicaciones.find((p) => p.id === id);
    const tieneImagen = Boolean(pubTarget?.url_imagen && pubTarget.url_imagen.length > 5);
    const res = await cambiarEstadoPublicacion(id, "aprobado");
    if (res.success) {
      if (tieneImagen) {
        alert("✅ ¡Publicación aprobada y lista para publicar! (El arte visual se conserva intacto)");
      } else if (res.aviso && (res.aviso.includes("falta") || res.aviso.includes("incorrecta") || res.aviso.includes("retornó") || res.aviso.includes("Error") || res.aviso.includes("Tiempo"))) {
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
      const d = new Date(pub.fecha_programacion);
      if (isNaN(d.getTime())) {
        setFechaHoraProgramar("");
      } else {
        const tzOffset = d.getTimezoneOffset() * 60000;
        setFechaHoraProgramar(new Date(d.getTime() - tzOffset).toISOString().slice(0, 16));
      }
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
          alert("¡Publicación programada con éxito en la agenda! El sistema la publicará automáticamente al llegar el horario indicado.");
        } else if (nuevoEstado === "publicado") {
          if (pubProgramar.plataforma === "facebook" || pubProgramar.plataforma === "instagram") {
            const metaRes = await ejecutarPublicacionMeta(pubProgramar.id, pubProgramar.plataforma);
            if (metaRes.success) {
              alert(`¡Publicado de inmediato con éxito en ${pubProgramar.plataforma === "instagram" ? "Instagram" : "Facebook"}!`);
            } else {
              alert(`Guardado como publicado en base de datos. Aviso de Meta: ${metaRes.error}`);
            }
          } else if (pubProgramar.plataforma === "mautic" || pubProgramar.plataforma === "email") {
            const mauticRes = await ejecutarEnvioMautic(pubProgramar.id);
            if (mauticRes.success) {
              alert(mauticRes.aviso || "¡Campaña disparada de inmediato en Mautic excluyendo contactos inhabilitados!");
            } else {
              alert(`Guardado como publicado en base de datos. Aviso de Mautic: ${mauticRes.error}`);
            }
          } else {
            alert("¡Publicación marcada como publicada!");
          }
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
    setRegenerandoIds((prev) => ({ ...prev, [id]: true }));
    setMensajeCarga("Solicitando un nuevo creativo fotorrealista a n8n...");

    startTransition(async () => {
      const res = await regenerarCreativoPublicacion(id);
      if (!res.success) {
        alert("Error al solicitar regeneración de creativo: " + res.error);
        setRegenerandoIds((prev) => ({ ...prev, [id]: false }));
        return;
      }

      if (
        res.aviso &&
        (res.aviso.includes("falta") ||
          res.aviso.includes("incorrecta") ||
          res.aviso.includes("retornó") ||
          res.aviso.includes("Error") ||
          res.aviso.includes("Tiempo"))
      ) {
        alert("⚠️ Aviso de n8n: " + res.aviso);
      }

      // Actualizar inmediatamente para que url_imagen pase a estado de regeneración
      await cargarDatos();

      // Iniciar sondeo inteligente cada 2.5s para capturar la nueva imagen en cuanto n8n termine (toma ~5-8s)
      let intentos = 0;
      const interval = setInterval(async () => {
        intentos++;
        try {
          const resPubs = await obtenerPublicaciones();

          if (resPubs.success && resPubs.data) {
            setPublicaciones(resPubs.data);
            const pubActualizada = resPubs.data.find((p) => p.id === id);

            if (pubActualizada?.url_imagen || intentos >= 12) {
              clearInterval(interval);
              setRegenerandoIds((prev) => ({ ...prev, [id]: false }));

              // Si el modal de previsualización está abierto para esta publicación, actualizarlo en vivo
              setPubPrevisualizar((prev) =>
                prev?.id === id && pubActualizada ? pubActualizada : prev
              );
            }
          }
        } catch (e) {
          console.warn("Error en sondeo de regeneración:", e);
        }
      }, 2500);
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

  const handlePublicarDirectoMeta = async (id: string, plataforma: string) => {
    const destino = plataforma === "instagram" ? "instagram" : "facebook";
    const nombreRed = destino === "instagram" ? "Instagram" : "Facebook";

    if (!confirm(`¿Deseas publicar este contenido de inmediato en la cuenta oficial de ${nombreRed}?`)) {
      return;
    }

    setPublicandoMetaId(id);
    try {
      const res = await ejecutarPublicacionMeta(id, destino);
      if (res.success && res.data) {
        setPublicaciones((prev) =>
          prev.map((p) => (p.id === id ? (res.data as PublicacionProgramada) : p))
        );
        await cargarDatos();
        alert(`¡Publicación realizada con éxito en ${nombreRed}!`);
      } else {
        alert(`Aviso de Meta: ${res.error || "No se pudo completar la publicación."}`);
      }
    } catch (err: any) {
      alert(`Error al intentar publicar en Meta: ${err?.message || String(err)}`);
    } finally {
      setPublicandoMetaId(null);
    }
  };

  const handleDispararMautic = async (id: string) => {
    if (
      !confirm(
        "¿Deseas disparar esta campaña en Mautic ahora?\n\nSe enviará a todos los contactos activos y excluirá automáticamente a los prospectos inhabilitados del CRM."
      )
    ) {
      return;
    }

    setDisparandoMauticId(id);
    try {
      const res = await ejecutarEnvioMautic(id);
      if (res.success && res.data) {
        setPublicaciones((prev) =>
          prev.map((p) => (p.id === id ? (res.data as PublicacionProgramada) : p))
        );
        await cargarDatos();
        alert(res.aviso || "¡Campaña disparada exitosamente en Mautic!");
      } else {
        alert(`Aviso de Mautic: ${res.error || "No se pudo disparar la campaña."}`);
      }
    } catch (err: any) {
      alert(`Error al disparar campaña en Mautic: ${err?.message || String(err)}`);
    } finally {
      setDisparandoMauticId(null);
    }
  };

  const triggerGeneracionIA = () => {
    const temaFinal = usarTemaPersonalizado && temaPersonalizado.trim()
      ? temaPersonalizado.trim()
      : temaIA;

    if (canalesSeleccionadosIA.length === 0) {
      alert("Por favor selecciona al menos una red social para la campaña.");
      return;
    }

    setMensajeCarga(`Creando Campaña Omnicanal con IA (${canalesSeleccionadosIA.length} redes)...`);
    startTransition(async () => {
      const res = await generarPublicacionesAutomaticas({
        tema: temaFinal,
        canales: canalesSeleccionadosIA,
        fechaInicio: fechaIA,
        detallesAdicionales: detallesExtraIA.trim() || undefined,
      });

      if (res.success) {
        setMostrarModalIA(false);
        setErrorBd(null);
        await cargarDatos();
        alert(`¡Campaña Omnicanal generada con éxito! Se crearon ${res.data?.length || canalesSeleccionadosIA.length} publicaciones adaptadas con el mismo concepto visual.`);
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

  const handleAbrirReplicar = (pub: PublicacionProgramada) => {
    setPubParaReplicar(pub);
    const todasLasRedes: Array<"facebook" | "instagram" | "tiktok" | "whatsapp"> = [
      "facebook",
      "instagram",
      "tiktok",
      "whatsapp",
    ];
    setCanalesParaReplicar(todasLasRedes.filter((r) => r !== pub.plataforma));
    setInstruccionesReplicar("");
  };

  const handleEjecutarReplicacion = async () => {
    if (!pubParaReplicar?.id) return;
    if (canalesParaReplicar.length === 0) {
      alert("Por favor selecciona al menos un canal destino para replicar.");
      return;
    }

    setReplicando(true);
    setMensajeCarga(`Adaptando contenido con IA para ${canalesParaReplicar.length} redes sociales...`);
    try {
      const res = await adaptarPublicacionAOtrasRedes({
        idPublicacionOriginal: pubParaReplicar.id,
        canalesDestino: canalesParaReplicar,
        instruccionesExtra: instruccionesReplicar.trim() || undefined,
      });

      if (res.success && res.data) {
        setPubParaReplicar(null);
        await cargarDatos();
        alert(`¡Publicación adaptada con éxito a ${res.data.length} canales! Han quedado aprobadas y listas para publicar con el mismo arte visual.`);
      } else {
        alert("Error al adaptar publicación: " + res.error);
      }
    } catch (err: any) {
      alert("Error inesperado al replicar: " + (err?.message || String(err)));
    } finally {
      setReplicando(false);
    }
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
    try {
      const d = new Date(fechaStr);
      return d.toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return fechaStr;
    }
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

  const hayFiltrosActivos =
    filtrosEstado.length > 0 ||
    filtrosPlataforma.length > 0 ||
    filtrosFormato.length > 0 ||
    filtrosTema.length > 0 ||
    filtrosFecha.length > 0;

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
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMostrarModalMeta(true)}
              className="bg-white hover:bg-gray-50 border border-dorado/30 text-carbon font-semibold px-4 py-3 rounded-xl shadow-xs transition-all flex items-center gap-2 text-sm cursor-pointer"
              title="Configurar y probar conexión oficial con Meta Graph API (Facebook & Instagram)"
            >
              <span className="text-base">🔗</span>
              <span>Conexión Meta</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </button>
            <button
              onClick={() => setMostrarModalIA(true)}
              className="bg-verde-profundo hover:bg-verde-profundo/90 text-crema font-semibold px-5 py-3 rounded-xl shadow-md transition-all flex items-center gap-2 text-sm transform hover:scale-[1.02] cursor-pointer"
            >
              <span>✨</span> Generar Publicaciones con IA
            </button>
          </div>
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

        {/* Tarjeta de Filtros Omnicanal con Selección Múltiple y Persistencia */}
        <div className="mb-8 bg-white p-5 rounded-2xl border border-dorado/20 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* 5 Dropdowns de Selección Múltiple */}
            <div className="flex flex-wrap items-center gap-2.5">
              <DropdownFiltroMultiple
                titulo="Estado"
                icono="📋"
                opciones={OPCIONES_ESTADO}
                valoresSeleccionados={filtrosEstado}
                onToggle={(id) => handleToggleFiltro(setFiltrosEstado, id)}
                onLimpiar={() => setFiltrosEstado([])}
              />

              <DropdownFiltroMultiple
                titulo="Canal"
                icono="🌐"
                opciones={OPCIONES_CANAL}
                valoresSeleccionados={filtrosPlataforma}
                onToggle={(id) => handleToggleFiltro(setFiltrosPlataforma, id)}
                onLimpiar={() => setFiltrosPlataforma([])}
              />

              <DropdownFiltroMultiple
                titulo="Formato"
                icono="🎨"
                opciones={OPCIONES_FORMATO}
                valoresSeleccionados={filtrosFormato}
                onToggle={(id) => handleToggleFiltro(setFiltrosFormato, id)}
                onLimpiar={() => setFiltrosFormato([])}
              />

              <DropdownFiltroMultiple
                titulo="Campaña / Tema"
                icono="🎯"
                opciones={OPCIONES_TEMA}
                valoresSeleccionados={filtrosTema}
                onToggle={(id) => handleToggleFiltro(setFiltrosTema, id)}
                onLimpiar={() => setFiltrosTema([])}
              />

              <DropdownFiltroMultiple
                titulo="Fecha"
                icono="📅"
                opciones={OPCIONES_FECHA}
                valoresSeleccionados={filtrosFecha}
                onToggle={(id) => handleToggleFiltro(setFiltrosFecha, id)}
                onLimpiar={() => setFiltrosFecha([])}
              />
            </div>

            {/* Densidad de Columnas (3, 4 o 5) + Contador + Selección masiva */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 ml-auto">
              {/* Selector de Densidad de Columnas */}
              <div className="flex items-center bg-gray-100/90 p-0.5 rounded-xl border border-gray-200 shadow-2xs">
                <span className="text-[10px] font-bold text-carbon/50 px-2 uppercase hidden md:inline">Columnas:</span>
                <button
                  type="button"
                  onClick={() => setNumColumnas(3)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    numColumnas === 3
                      ? "bg-white text-verde-profundo shadow-2xs"
                      : "text-carbon/60 hover:text-carbon"
                  }`}
                  title="3 columnas por fila (tarjetas amplias)"
                >
                  3 cols
                </button>
                <button
                  type="button"
                  onClick={() => setNumColumnas(4)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    numColumnas === 4
                      ? "bg-white text-verde-profundo shadow-2xs"
                      : "text-carbon/60 hover:text-carbon"
                  }`}
                  title="4 columnas por fila (balance óptimo)"
                >
                  4 cols
                </button>
                <button
                  type="button"
                  onClick={() => setNumColumnas(5)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    numColumnas === 5
                      ? "bg-white text-verde-profundo shadow-2xs"
                      : "text-carbon/60 hover:text-carbon"
                  }`}
                  title="5 columnas por fila (máxima densidad)"
                >
                  5 cols
                </button>
              </div>

              <div className="text-xs text-carbon/60 font-medium">
                Mostrando:{" "}
                <span className="font-bold text-verde-profundo text-sm">
                  {publicacionesFiltradas.length}
                </span>{" "}
                de <span className="font-bold text-carbon/80">{publicaciones.length}</span>
              </div>
              {publicacionesFiltradas.length > 0 && (
                <label className="flex items-center gap-2 text-xs font-bold text-verde-profundo bg-verde-profundo/5 hover:bg-verde-profundo/10 px-3 py-1.5 rounded-lg border border-verde-profundo/20 cursor-pointer transition-all">
                  <input
                    type="checkbox"
                    checked={
                      seleccionados.length === publicacionesFiltradas.length &&
                      publicacionesFiltradas.length > 0
                    }
                    onChange={handleToggleSeleccionarTodos}
                    className="w-4 h-4 rounded border-dorado/40 text-verde-profundo focus:ring-verde-profundo cursor-pointer"
                  />
                  <span>
                    Seleccionar todas ({seleccionados.length}/{publicacionesFiltradas.length})
                  </span>
                </label>
              )}
            </div>
          </div>

          {/* Fila de Chips de Filtros Activos con eliminación rápida (✕) y Botón de Limpiar */}
          {hayFiltrosActivos && (
            <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2 animate-in fade-in duration-150">
              <span className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider mr-1">
                Filtros activos:
              </span>

              {filtrosEstado.map((id) => {
                const opc = OPCIONES_ESTADO.find((o) => o.id === id);
                return (
                  <span
                    key={`st-${id}`}
                    className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs px-2.5 py-1 rounded-full font-medium"
                  >
                    <span>{opc?.icono}</span>
                    <span>{opc?.label || id}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleFiltro(setFiltrosEstado, id)}
                      className="hover:bg-emerald-200/60 w-4 h-4 rounded-full flex items-center justify-center text-[11px] font-bold cursor-pointer transition"
                      title="Quitar este filtro"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}

              {filtrosPlataforma.map((id) => {
                const opc = OPCIONES_CANAL.find((o) => o.id === id);
                return (
                  <span
                    key={`pl-${id}`}
                    className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 text-xs px-2.5 py-1 rounded-full font-medium"
                  >
                    <span>{opc?.icono}</span>
                    <span>{opc?.label || id}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleFiltro(setFiltrosPlataforma, id)}
                      className="hover:bg-blue-200/60 w-4 h-4 rounded-full flex items-center justify-center text-[11px] font-bold cursor-pointer transition"
                      title="Quitar este filtro"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}

              {filtrosFormato.map((id) => {
                const opc = OPCIONES_FORMATO.find((o) => o.id === id);
                return (
                  <span
                    key={`fo-${id}`}
                    className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-800 border border-purple-200 text-xs px-2.5 py-1 rounded-full font-medium"
                  >
                    <span>{opc?.icono}</span>
                    <span>{opc?.label || id}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleFiltro(setFiltrosFormato, id)}
                      className="hover:bg-purple-200/60 w-4 h-4 rounded-full flex items-center justify-center text-[11px] font-bold cursor-pointer transition"
                      title="Quitar este filtro"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}

              {filtrosTema.map((id) => {
                const opc = OPCIONES_TEMA.find((o) => o.id === id);
                return (
                  <span
                    key={`te-${id}`}
                    className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 text-xs px-2.5 py-1 rounded-full font-medium"
                  >
                    <span>{opc?.icono}</span>
                    <span>{opc?.label || id}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleFiltro(setFiltrosTema, id)}
                      className="hover:bg-amber-200/60 w-4 h-4 rounded-full flex items-center justify-center text-[11px] font-bold cursor-pointer transition"
                      title="Quitar este filtro"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}

              {filtrosFecha.map((id) => {
                const opc = OPCIONES_FECHA.find((o) => o.id === id);
                return (
                  <span
                    key={`fe-${id}`}
                    className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-800 border border-rose-200 text-xs px-2.5 py-1 rounded-full font-medium"
                  >
                    <span>{opc?.icono}</span>
                    <span>{opc?.label || id}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleFiltro(setFiltrosFecha, id)}
                      className="hover:bg-rose-200/60 w-4 h-4 rounded-full flex items-center justify-center text-[11px] font-bold cursor-pointer transition"
                      title="Quitar este filtro"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}

              <button
                type="button"
                onClick={handleLimpiarTodosFiltros}
                className="ml-auto inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-bold px-3 py-1 rounded-xl bg-red-50 hover:bg-red-100 transition cursor-pointer"
                title="Limpiar todos los filtros"
              >
                <span>✕</span> Limpiar todos los filtros
              </button>
            </div>
          )}
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
            {hayFiltrosActivos && (
              <button
                type="button"
                onClick={handleLimpiarTodosFiltros}
                className="mt-4 bg-verde-profundo text-crema hover:bg-verde-profundo/90 px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <span>✕</span> Limpiar filtros aplicados
              </button>
            )}
          </div>
        ) : (
          <div className={gridColsClass}>
            {publicacionesFiltradas.map((pub) => {
              const guionActivo = guionesExpandidos[pub.id!] || false;
              const estaSeleccionado = seleccionados.includes(pub.id!);
              const estaExpandido = textosExpandidos[pub.id!] || false;
              const mediaUrl = pub.url_imagen && pub.url_imagen.length > 5
                ? (pub.url_imagen.startsWith("http") || pub.url_imagen.startsWith("data:")
                    ? pub.url_imagen
                    : `https://${pub.url_imagen}`)
                : null;
              const esVideo = mediaUrl ? Boolean(mediaUrl.match(/\.(mp4|webm|mov)(\?.*)?$/i)) : false;
              const esBannerSvg = mediaUrl ? Boolean(mediaUrl.includes("generar-banner")) : false;

              return (
                <div
                  key={pub.id}
                  className={`bg-white rounded-2xl border transition-all duration-300 flex flex-col shadow-xs overflow-hidden ${
                    estaSeleccionado
                      ? "border-verde-profundo ring-2 ring-verde-profundo/20 shadow-md"
                      : pub.estado === "pendiente_revision"
                      ? "border-dorado/30 hover:border-dorado/60 hover:shadow-md"
                      : pub.estado === "aprobado"
                      ? "border-emerald-500/30 hover:border-emerald-500/60 hover:shadow-md"
                      : pub.estado === "rechazado"
                      ? "border-red-500/20 opacity-90"
                      : "border-carbon/10 bg-gray-50/30 hover:shadow-sm"
                  }`}
                >
                  {/* Cabecera compacta de la Tarjeta */}
                  <div className="px-3.5 py-2.5 border-b border-carbon/5 flex items-center justify-between gap-1.5 bg-gray-50/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={estaSeleccionado}
                        onChange={() => handleToggleSeleccion(pub.id!)}
                        className="w-4 h-4 rounded border-dorado/40 text-verde-profundo focus:ring-verde-profundo cursor-pointer shrink-0"
                        title="Seleccionar para acciones masivas"
                      />
                      <div className="shrink-0 scale-95 origin-left">
                        {getPlataformaBadge(pub.plataforma)}
                      </div>
                      <span className="text-[11px] bg-carbon/5 text-carbon/70 font-semibold px-1.5 py-0.5 rounded shrink-0">
                        {getFormatoIcon(pub.tipo_formato)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[10px] font-mono truncate max-w-[125px] ${
                          pub.estado === "publicado" ? "text-blue-700 font-bold" : "text-carbon/60"
                        }`}
                        title={formatFecha(
                          (pub.estado === "publicado" && pub.publicado_en)
                            ? pub.publicado_en
                            : pub.fecha_programacion
                        )}
                      >
                        {formatFecha(
                          (pub.estado === "publicado" && pub.publicado_en)
                            ? pub.publicado_en
                            : pub.fecha_programacion
                        )}
                      </span>

                      {pub.estado === "pendiente_revision" && (
                        <span className="bg-amber-500/15 text-amber-700 text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0">
                          Revisión
                        </span>
                      )}
                      {pub.estado === "aprobado" && (
                        <span
                          className="bg-emerald-500/15 text-emerald-700 text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0"
                          title="Listo para publicar o programar"
                        >
                          Aprobado
                        </span>
                      )}
                      {pub.estado === "rechazado" && (
                        <span className="bg-red-500/15 text-red-700 text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0">
                          Rechazado
                        </span>
                      )}
                      {pub.estado === "publicado" && (
                        <span className="bg-blue-600 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded shadow-2xs shrink-0 flex items-center gap-0.5">
                          ✓ Enviada
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Imagen / Visual / Placeholder */}
                  {mediaUrl ? (
                    <div className="relative aspect-[16/10] bg-black overflow-hidden group">
                      {regenerandoIds[pub.id!] && (
                        <div className="absolute inset-0 bg-carbon/85 backdrop-blur-xs flex flex-col items-center justify-center text-white z-20 p-2 text-center animate-in fade-in">
                          <div className="w-7 h-7 border-2 border-dorado border-t-transparent rounded-full animate-spin mb-1" />
                          <span className="text-[11px] font-bold text-dorado">Generando arte Flux...</span>
                        </div>
                      )}
                      {esVideo ? (
                        <video
                          src={mediaUrl}
                          controls
                          preload="metadata"
                          className="w-full h-full object-contain mx-auto"
                        />
                      ) : (
                        <img
                          src={mediaUrl}
                          alt={pub.titulo}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      )}
                      <div className="absolute top-2 right-2 bg-carbon/80 backdrop-blur-md text-crema text-[9px] font-bold px-2 py-0.5 rounded-full border border-white/20 flex items-center gap-1 shadow-sm">
                        <span>{esVideo ? "🎬" : "🎨"}</span>
                        <span>{esVideo ? "Video IA" : esBannerSvg ? "Banner SVG" : "Flux"}</span>
                      </div>
                      {/* Botones rápidos en hover sobre la foto */}
                      <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <a
                          href={CANVA_DESIGN_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => handleCopiarYNotificar(pub)}
                          className="bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md transition-all flex items-center gap-1 cursor-pointer"
                          title="Abrir en Canva"
                        >
                          🎨 Canva
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopiarFoto(pub.url_imagen!, pub.id!)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md transition-all flex items-center gap-1 cursor-pointer"
                          title="Copiar foto"
                        >
                          📋 Copiar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReemplazarArte(pub.id!)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md transition-all flex items-center gap-1 cursor-pointer"
                          title="Subir Arte de Canva"
                        >
                          📁 Arte
                        </button>
                        <button
                          type="button"
                          disabled={regenerandoIds[pub.id!]}
                          onClick={() => handleRegenerarCreativo(pub.id!)}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md transition-all flex items-center gap-1 cursor-pointer disabled:opacity-60"
                          title="Regenerar con IA"
                        >
                          🔄
                        </button>
                        <a
                          href={mediaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-white/90 hover:bg-white text-carbon text-[10px] font-bold px-2 py-1 rounded shadow-md transition-all"
                          title="Ver en HD"
                        >
                          🔍
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="relative aspect-[16/10] border-b border-dashed border-dorado/30 bg-dorado/5 flex flex-col items-center justify-center p-3 text-center">
                      {regenerandoIds[pub.id!] ? (
                        <div className="flex flex-col items-center justify-center">
                          <div className="w-7 h-7 border-2 border-dorado border-t-transparent rounded-full animate-spin mb-1" />
                          <span className="text-[11px] font-bold text-dorado">Generando arte con IA...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-carbon/50">
                          <span className="text-2xl mb-1">🖼️</span>
                          <span className="text-[11px] font-medium">Sin imagen</span>
                          <button
                            type="button"
                            onClick={() => handleRegenerarCreativo(pub.id!)}
                            className="mt-1.5 bg-verde-profundo text-crema text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-xs hover:bg-verde-profundo/90 transition cursor-pointer flex items-center gap-1"
                          >
                            <span>✨</span> Generar con IA (Flux)
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cuerpo de la publicación */}
                  <div className="p-3.5 flex-1 flex flex-col gap-2.5">
                    <div>
                      <h3
                        className="font-bold text-verde-profundo text-xs sm:text-sm leading-snug line-clamp-2"
                        title={pub.titulo}
                      >
                        {pub.titulo}
                      </h3>
                      <div className="mt-1.5 bg-crema/10 border border-dorado/20 rounded-xl p-2.5 relative group">
                        <p
                          className={`text-xs text-carbon whitespace-pre-wrap leading-relaxed font-cuerpo pr-5 ${
                            estaExpandido ? "" : "line-clamp-3"
                          }`}
                        >
                          {pub.contenido}
                        </p>
                        {pub.contenido && pub.contenido.length > 120 && (
                          <button
                            type="button"
                            onClick={() => toggleTextoExpandido(pub.id!)}
                            className="mt-1 text-[10px] font-bold text-verde-profundo hover:underline cursor-pointer block"
                          >
                            {estaExpandido ? "▲ Ver menos" : "▼ Ver más texto"}
                          </button>
                        )}
                        <button
                          onClick={() => handleCopiarTexto(pub.contenido)}
                          className="absolute right-2 top-2 p-1 rounded bg-white/80 hover:bg-white text-carbon/50 hover:text-verde-profundo border border-carbon/10 shadow-2xs opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                          title="Copiar Copy"
                        >
                          📋
                        </button>
                      </div>
                    </div>

                    {/* Guion de Video (si existe) */}
                    {pub.guion_video && (
                      <div className="border border-carbon/10 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleGuion(pub.id!)}
                          className="w-full bg-carbon/5 hover:bg-carbon/10 px-2.5 py-1.5 flex items-center justify-between text-[11px] font-bold text-carbon/70 transition-all cursor-pointer"
                        >
                          <span>🎥 {guionActivo ? "Ocultar Guion" : "Ver Guion Video"}</span>
                          <span>{guionActivo ? "▲" : "▼"}</span>
                        </button>
                        {guionActivo && (
                          <div className="p-2.5 bg-gray-50 border-t border-carbon/10 max-h-40 overflow-y-auto">
                            <p className="text-[11px] text-carbon/80 whitespace-pre-wrap leading-relaxed font-mono">
                              {pub.guion_video}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sugerencia Visual (Prompt / Canva) */}
                    {pub.sugerencia_visual && (
                      <div className="text-[11px] bg-amber-500/5 border border-amber-500/10 rounded-lg p-2">
                        <span className="font-bold text-amber-800 block text-[10px] uppercase">
                          💡 Prompt Visual:
                        </span>
                        <p className="text-carbon/70 italic leading-snug line-clamp-2" title={pub.sugerencia_visual}>
                          {pub.sugerencia_visual}
                        </p>
                      </div>
                    )}

                    {/* Métricas Ads si existen */}
                    {((pub.leads_generados !== undefined && pub.leads_generados > 0) ||
                      (pub.inversion_ads !== undefined && pub.inversion_ads > 0)) && (
                      <div className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 flex items-center justify-between gap-1">
                        <div className="flex flex-wrap gap-2 text-carbon/80 font-mono">
                          <span>${pub.inversion_ads || 0}</span>
                          <span>👥 {pub.leads_generados || 0}</span>
                          <span>CPL ${pub.cpl || 0}</span>
                        </div>
                        <span className="bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded text-[9px]">
                          ⭐ {pub.roi_score || 0}
                        </span>
                      </div>
                    )}

                    {/* Observaciones de Rechazo si existen */}
                    {pub.estado === "rechazado" && pub.notas_revision && (
                      <div className="text-[11px] bg-red-500/5 border border-red-500/10 rounded-lg p-2">
                        <span className="font-bold text-red-800 block text-[10px]">❌ Motivo de Rechazo:</span>
                        <p className="text-carbon/70 leading-snug line-clamp-2">{pub.notas_revision}</p>
                      </div>
                    )}
                  </div>

                  {/* Pie de la tarjeta y Botonera Optimizada */}
                  <div className="px-3.5 py-2.5 bg-gray-50/70 border-t border-carbon/5 flex flex-col gap-2 rounded-b-2xl mt-auto">
                    {/* Fila 1: Acciones Principales según Estado */}
                    {pub.estado === "pendiente_revision" && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAprobar(pub.id!)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-1.5 px-2 rounded-lg shadow-2xs transition cursor-pointer text-center flex items-center justify-center gap-1"
                        >
                          <span>✓</span> Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAbrirProgramar(pub)}
                          className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs py-1.5 px-2 rounded-lg shadow-2xs transition cursor-pointer text-center flex items-center justify-center gap-1"
                        >
                          <span>⏰</span> Programar
                        </button>
                      </div>
                    )}

                    {pub.estado === "aprobado" && (
                      <div className="flex items-center gap-1.5">
                        {(pub.plataforma === "facebook" || pub.plataforma === "instagram") && (
                          <button
                            type="button"
                            onClick={() => handlePublicarDirectoMeta(pub.id!, pub.plataforma)}
                            disabled={publicandoMetaId === pub.id}
                            className={`flex-1 ${
                              pub.plataforma === "instagram"
                                ? "bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737] hover:opacity-90"
                                : "bg-[#1877F2] hover:bg-[#166FE5]"
                            } text-white font-bold text-xs py-1.5 px-2 rounded-lg shadow-2xs transition cursor-pointer text-center flex items-center justify-center gap-1 disabled:opacity-60`}
                            title={`Publicar directamente en ${pub.plataforma === "instagram" ? "Instagram" : "Facebook"}`}
                          >
                            <span>{publicandoMetaId === pub.id ? "⏳" : "🚀"}</span>
                            <span className="truncate">
                              {publicandoMetaId === pub.id
                                ? "Publicando..."
                                : `Publicar ${pub.plataforma === "instagram" ? "IG" : "FB"}`}
                            </span>
                          </button>
                        )}

                        {(pub.plataforma === "mautic" || pub.plataforma === "email") && (
                          <button
                            type="button"
                            onClick={() => handleDispararMautic(pub.id!)}
                            disabled={disparandoMauticId === pub.id}
                            className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs py-1.5 px-2 rounded-lg shadow-2xs transition cursor-pointer text-center flex items-center justify-center gap-1 disabled:opacity-60"
                            title="Disparar campaña masiva en Mautic"
                          >
                            <span>{disparandoMauticId === pub.id ? "⏳" : "🚀"}</span>
                            <span className="truncate">
                              {disparandoMauticId === pub.id ? "Enviando..." : "Mautic"}
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handlePublicar(pub.id!)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-1.5 px-2 rounded-lg shadow-2xs transition cursor-pointer text-center flex items-center justify-center gap-1"
                          title="Marcar como publicado manualmente"
                        >
                          <span>📲</span> Publicar
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAbrirProgramar(pub)}
                          className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition cursor-pointer shrink-0"
                          title="Reagendar fecha/hora"
                        >
                          ⏰
                        </button>
                      </div>
                    )}

                    {pub.estado === "publicado" && (
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-bold text-blue-700 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-md border border-blue-200">
                          <span>✓</span> Enviada
                        </span>
                        {pub.url_publicacion && pub.plataforma !== "mautic" && pub.plataforma !== "email" && (
                          <a
                            href={pub.url_publicacion}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 truncate"
                          >
                            <span>🔗</span> Ver post ↗
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleReconsiderar(pub.id!)}
                          className="text-[11px] text-carbon/60 hover:text-carbon hover:underline cursor-pointer ml-auto"
                          title="Regresar a revisión"
                        >
                          Regresar
                        </button>
                      </div>
                    )}

                    {/* Fila 2: Barra de Acciones Utilitarias Compactas */}
                    <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-gray-200/60 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const actual = publicaciones.find((p) => p.id === pub.id) || pub;
                          setPubPrevisualizar(actual);
                        }}
                        className="px-2 py-1 text-emerald-800 hover:bg-emerald-50 rounded-md font-semibold transition cursor-pointer flex items-center gap-1"
                        title="Previsualizar en simulador móvil"
                      >
                        <span>👁️</span> <span className="hidden sm:inline">Previs.</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPubEditando(pub)}
                        className="px-2 py-1 text-carbon/80 hover:bg-gray-200/60 rounded-md font-semibold transition cursor-pointer flex items-center gap-1"
                        title="Editar publicación"
                      >
                        <span>✏️</span> <span className="hidden sm:inline">Editar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAbrirReplicar(pub)}
                        className="px-2 py-1 text-amber-800 hover:bg-amber-50 rounded-md font-semibold transition cursor-pointer flex items-center gap-1"
                        title="Replicar a otras redes"
                      >
                        <span>🔄</span> <span className="hidden sm:inline">Replicar</span>
                      </button>

                      <a
                        href={CANVA_DESIGN_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handleCopiarYNotificar(pub)}
                        className="px-2 py-1 text-purple-700 hover:bg-purple-50 rounded-md font-semibold transition cursor-pointer flex items-center gap-1"
                        title="Abrir en Canva"
                      >
                        <span>🎨</span> <span className="hidden sm:inline">Canva</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => handleReemplazarArte(pub.id!)}
                        className="px-2 py-1 text-blue-700 hover:bg-blue-50 rounded-md font-semibold transition cursor-pointer flex items-center gap-1"
                        title="Subir archivo (.png/.jpg) descargado de Canva"
                      >
                        <span>📁</span> <span className="hidden sm:inline">Arte</span>
                      </button>

                      {pub.estado !== "publicado" && (
                        <button
                          type="button"
                          onClick={() => handleRechazar(pub.id!)}
                          className="px-2 py-1 text-red-500 hover:bg-red-50 rounded-md font-semibold transition cursor-pointer"
                          title="Rechazar publicación"
                        >
                          ✕
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleEliminarIndividual(pub.id!)}
                        className="px-2 py-1 text-red-600 hover:bg-red-50 rounded-md font-semibold transition cursor-pointer ml-auto"
                        title="Eliminar publicación"
                      >
                        🗑️
                      </button>
                    </div>
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
        <div className="fixed inset-0 bg-carbon/60 z-40 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-dorado/20">
            <div className="px-6 py-5 bg-verde-profundo text-crema flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <span>✨</span> Generar Campaña con IA (Omnicanal)
                </h3>
                <p className="text-xs text-crema/70 mt-0.5">
                  Concepto visual unificado adaptado al lenguaje de cada red.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMostrarModalIA(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold cursor-pointer transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
              {/* Tema de Campaña */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-carbon/80 uppercase">
                    Tema o Campaña Central
                  </label>
                  <button
                    type="button"
                    onClick={() => setUsarTemaPersonalizado(!usarTemaPersonalizado)}
                    className="text-[11px] font-bold text-dorado hover:underline cursor-pointer"
                  >
                    {usarTemaPersonalizado ? "← Ver temas sugeridos" : "✏️ Tema personalizado"}
                  </button>
                </div>

                {usarTemaPersonalizado ? (
                  <textarea
                    rows={2}
                    value={temaPersonalizado}
                    onChange={(e) => setTemaPersonalizado(e.target.value)}
                    placeholder="Ej. Promoción de impermeabilización con soplete $210/m² con 10 años de garantía antes del temporal de lluvias..."
                    className="w-full bg-crema/10 border border-dorado/40 rounded-xl px-3.5 py-2.5 text-sm text-carbon focus:outline-none focus:border-verde-profundo"
                  />
                ) : (
                  <select
                    value={temaIA}
                    onChange={(e) => setTemaIA(e.target.value)}
                    className="w-full bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2.5 text-sm text-carbon focus:outline-none focus:border-verde-profundo cursor-pointer font-medium"
                  >
                    <option value="Servicios de impermeabilización profesional con garantía de 5 a 10 años">
                      ☔ Impermeabilización Profesional $210/m² con Soplete (Garantía 5-10 años)
                    </option>
                    <option value="Traspasos de viviendas con crédito INFONAVIT">
                      🏠 Traspaso INFONAVIT en León Gto (Explicación y Venta Segura)
                    </option>
                    <option value="Compra rápida de casas de contado con adeudos o vandalizadas">
                      💰 Compra de Casas de Contado (Problemas Legales/Deudas)
                    </option>
                    <option value="Remodelaciones y ampliaciones de viviendas en León Gto">
                      🏗️ Remodelación y Ampliación de Hogares (Diseño y Obra)
                    </option>
                    <option value="Gestión y armado de expediente INFONAVIT para trato directo">
                      📂 Armado de Expediente INFONAVIT (Solo Trámite y Asesoría)
                    </option>
                  </select>
                )}
              </div>

              {/* Redes Sociales Destino (Multiselección) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-carbon/80 uppercase">
                    Redes Sociales Destino (Se adaptará a cada una)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCanalesSeleccionadosIA(["instagram", "facebook"])}
                      className="text-[10px] text-carbon/60 hover:text-carbon font-semibold underline cursor-pointer"
                    >
                      Meta (FB + IG)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCanalesSeleccionadosIA(["instagram", "facebook", "tiktok", "whatsapp", "mautic"])}
                      className="text-[10px] text-dorado font-bold hover:underline cursor-pointer"
                    >
                      Todas (5)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "instagram", nombre: "Instagram", icono: "🟣", detalle: "Post Feed + Hashtags" },
                    { id: "facebook", nombre: "Facebook", icono: "🔵", detalle: "Post Feed + Enlace" },
                    { id: "tiktok", nombre: "TikTok", icono: "⚫", detalle: "Guion de Video Corto" },
                    { id: "whatsapp", nombre: "WhatsApp", icono: "🟢", detalle: "Mensaje Difusión + Link" },
                    { id: "mautic", nombre: "Mautic / Correo", icono: "🟠", detalle: "Boletín / Campaña Masiva" },
                  ].map((canal) => {
                    const seleccionado = canalesSeleccionadosIA.includes(canal.id as any);
                    return (
                      <button
                        key={canal.id}
                        type="button"
                        onClick={() => {
                          if (seleccionado) {
                            if (canalesSeleccionadosIA.length > 1) {
                              setCanalesSeleccionadosIA(canalesSeleccionadosIA.filter((c) => c !== canal.id));
                            }
                          } else {
                            setCanalesSeleccionadosIA([...canalesSeleccionadosIA, canal.id as any]);
                          }
                        }}
                        className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                          seleccionado
                            ? "bg-verde-profundo/10 border-verde-profundo text-verde-profundo font-bold shadow-xs"
                            : "bg-gray-50 border-gray-200 text-carbon/60 hover:bg-gray-100"
                        }`}
                      >
                        <span className="text-lg">{canal.icono}</span>
                        <div>
                          <div className="text-xs font-bold leading-tight flex items-center gap-1">
                            <span>{canal.nombre}</span>
                            {seleccionado && <span className="text-emerald-600 text-xs">✓</span>}
                          </div>
                          <span className="text-[10px] font-normal opacity-70 block mt-0.5">{canal.detalle}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-carbon/50 mt-1.5">
                  📐 Todas las publicaciones compartirán el <strong>mismo concepto visual y prompt de fotografía</strong>, pero la IA redactará copys y guiones adaptados a cada formato.
                </p>
              </div>

              {/* Detalles adicionales / Oferta (Opcional) */}
              <div>
                <label className="text-xs font-bold text-carbon/80 uppercase block mb-1">
                  Detalles u Oferta Específica (Opcional)
                </label>
                <input
                  type="text"
                  value={detallesExtraIA}
                  onChange={(e) => setDetallesExtraIA(e.target.value)}
                  placeholder="Ej. WhatsApp 477 465 4700, promoción del mes, visita técnica gratuita..."
                  className="w-full bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2 text-xs text-carbon focus:outline-none focus:border-verde-profundo"
                />
              </div>

              {/* Día de Programación */}
              <div>
                <label className="text-xs font-bold text-carbon/80 uppercase block mb-1">Día de Programación</label>
                <input
                  type="date"
                  value={fechaIA}
                  onChange={(e) => setFechaIA(e.target.value)}
                  className="w-full bg-crema/10 border border-dorado/30 rounded-xl px-4 py-2 text-sm text-carbon focus:outline-none focus:border-verde-profundo"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex items-center justify-between border-t border-gray-200">
              <span className="text-xs text-carbon/60 font-medium">
                {canalesSeleccionadosIA.length} {canalesSeleccionadosIA.length === 1 ? "publicación" : "publicaciones unificadas"}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarModalIA(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-carbon/60 hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={triggerGeneracionIA}
                  className="px-5 py-2.5 bg-verde-profundo hover:bg-verde-profundo/90 text-crema text-xs font-bold rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>✨</span> Generar Campaña ({canalesSeleccionadosIA.length} Redes)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Replicar / Adaptar publicación existente a otras redes */}
      {pubParaReplicar && (
        <div className="fixed inset-0 bg-carbon/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-dorado/30">
            <div className="px-6 py-5 bg-verde-profundo text-crema flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <span>🔄</span> Replicar en otros Canales
                </h3>
                <p className="text-xs text-crema/70 mt-0.5">
                  Adapta esta publicación manteniendo la misma fotografía ya aprobada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPubParaReplicar(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold cursor-pointer transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Tarjeta resumen del post origen */}
              <div className="bg-dorado/10 border border-dorado/30 rounded-2xl p-3.5 flex items-center gap-3">
                {pubParaReplicar.url_imagen && pubParaReplicar.url_imagen.length > 5 ? (
                  <img
                    src={pubParaReplicar.url_imagen}
                    alt="Arte aprobado"
                    className="w-16 h-16 rounded-xl object-cover border border-dorado/40 shadow-xs flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-carbon/10 border border-carbon/20 flex items-center justify-center text-lg flex-shrink-0">
                    🖼️
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] uppercase font-bold text-dorado">Origen:</span>
                    {getPlataformaBadge(pubParaReplicar.plataforma)}
                  </div>
                  <h4 className="text-xs font-bold text-carbon truncate">
                    {pubParaReplicar.titulo}
                  </h4>
                  <p className="text-[11px] text-carbon/60 line-clamp-1 mt-0.5">
                    {pubParaReplicar.contenido}
                  </p>
                </div>
              </div>

              {/* Selector de Canales Destino */}
              <div>
                <label className="text-xs font-bold text-carbon/80 uppercase block mb-1.5">
                  ¿A qué redes deseas adaptar este post?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "instagram", nombre: "Instagram", icono: "🟣", detalle: "Post / Feed" },
                    { id: "facebook", nombre: "Facebook", icono: "🔵", detalle: "Post Feed con enlace" },
                    { id: "tiktok", nombre: "TikTok", icono: "⚫", detalle: "Guion de Video" },
                    { id: "whatsapp", nombre: "WhatsApp", icono: "🟢", detalle: "Mensaje de Difusión" },
                    { id: "mautic", nombre: "Mautic / Correo", icono: "🟠", detalle: "Boletín / Campaña Masiva" },
                  ]
                    .filter((canal) => canal.id !== pubParaReplicar.plataforma)
                    .map((canal) => {
                      const seleccionado = canalesParaReplicar.includes(canal.id as any);
                      return (
                        <button
                          key={canal.id}
                          type="button"
                          onClick={() => {
                            if (seleccionado) {
                              setCanalesParaReplicar(canalesParaReplicar.filter((c) => c !== canal.id));
                            } else {
                              setCanalesParaReplicar([...canalesParaReplicar, canal.id as any]);
                            }
                          }}
                          className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                            seleccionado
                              ? "bg-verde-profundo/10 border-verde-profundo text-verde-profundo font-bold shadow-xs"
                              : "bg-gray-50 border-gray-200 text-carbon/60 hover:bg-gray-100"
                          }`}
                        >
                          <span className="text-lg">{canal.icono}</span>
                          <div>
                            <div className="text-xs font-bold leading-tight flex items-center gap-1">
                              <span>{canal.nombre}</span>
                              {seleccionado && <span className="text-emerald-600 text-xs">✓</span>}
                            </div>
                            <span className="text-[10px] font-normal opacity-70 block mt-0.5">{canal.detalle}</span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Instrucciones opcionales */}
              <div>
                <label className="text-xs font-bold text-carbon/80 uppercase block mb-1">
                  Instrucciones o enfoque adicional para la IA (Opcional)
                </label>
                <input
                  type="text"
                  value={instruccionesReplicar}
                  onChange={(e) => setInstruccionesReplicar(e.target.value)}
                  placeholder="Ej. Enfatizar la cotización gratuita o tono más enérgico..."
                  className="w-full bg-crema/10 border border-dorado/30 rounded-xl px-3.5 py-2 text-xs text-carbon focus:outline-none focus:border-verde-profundo"
                />
              </div>

              <div className="text-[11px] bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-200">
                ✅ <strong>Misma Fotografía Garantizada:</strong> Las nuevas publicaciones conservarán automáticamente la fotografía aprobada de la publicación original.
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex items-center justify-between border-t border-gray-200">
              <span className="text-xs text-carbon/60 font-medium">
                {canalesParaReplicar.length} {canalesParaReplicar.length === 1 ? "red seleccionada" : "redes seleccionadas"}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={replicando}
                  onClick={() => setPubParaReplicar(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-carbon/60 hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={replicando || canalesParaReplicar.length === 0}
                  onClick={handleEjecutarReplicacion}
                  className="px-5 py-2.5 bg-verde-profundo hover:bg-verde-profundo/90 text-crema text-xs font-bold rounded-xl shadow-md transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span>{replicando ? "⏳" : "✨"}</span>
                  <span>{replicando ? "Adaptando..." : `Adaptar a ${canalesParaReplicar.length} Redes`}</span>
                </button>
              </div>
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
                    value={
                      pubEditando.fecha_programacion
                        ? (() => {
                            const d = new Date(pubEditando.fecha_programacion);
                            if (isNaN(d.getTime())) return "";
                            const tzOffset = d.getTimezoneOffset() * 60000;
                            return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
                          })()
                        : ""
                    }
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
          onRegenerarCreativo={(id) => handleRegenerarCreativo(id)}
          onReemplazarArte={(id) => handleReemplazarArte(id)}
          onReplicar={(pub) => handleAbrirReplicar(pub)}
          onPublicado={async (pub) => {
            setPublicaciones((prev) => prev.map((p) => (p.id === pub.id ? pub : p)));
            await cargarDatos();
          }}
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

      {/* Modal de Conexión y Diagnóstico Meta (Facebook & Instagram) */}
      <ModalConexionMeta
        abierto={mostrarModalMeta}
        onCerrar={() => setMostrarModalMeta(false)}
        onConexionActualizada={cargarDatos}
      />
    </main>
  );
}
