"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CabinaLlamadaSombra } from "@/components/CabinaLlamadaSombra";
import {
  analizarSugerenciasIA,
  aprobarLlamadasIA,
  cancelarLlamadaIA,
  editarSugerenciaIA,
  generarListaProspectosIA,
  generarListaReagendarIA,
  llamarAhoraIA,
  probarLlamadaIA,
  sincronizarLlamadaIA,
  type ConfiguracionLlamadasIA,
} from "@/app/actions/llamadas-ia";
import type { LlamadaIA, EstadoLlamadaIA, ResultadoLlamadaIA } from "@/features/llamadas-ia/service";
import type { PrioridadLlamada } from "@/features/llamadas-ia/sugerencias";
import { SEGMENTOS, SEGMENTOS_LLAMABLES, segmentoDe, type SegmentoLlamada } from "@/features/llamadas-ia/segmentos";

// ============================================================================
// 1. CONSTANTES, ESTADOS Y DEFINICIÓN DE LÍNEAS DE NEGOCIO
// ============================================================================

const ESTADOS: Record<EstadoLlamadaIA, { label: string; clase: string }> = {
  pendiente: { label: "Por aprobar", clase: "bg-carbon/5 text-carbon/70 border-carbon/15" },
  aprobada: { label: "Programada", clase: "bg-blue-50 text-blue-800 border-blue-200" },
  en_curso: { label: "En curso", clase: "bg-yellow-100 text-yellow-800 border-yellow-200 animate-pulse" },
  completada: { label: "Completada", clase: "bg-green-100 text-green-800 border-green-200" },
  fallida: { label: "Fallida", clase: "bg-red-100 text-red-800 border-red-200" },
  cancelada: { label: "Cancelada", clase: "bg-carbon/5 text-carbon/40 border-carbon/10" },
};

const RESULTADOS: Record<ResultadoLlamadaIA, string> = {
  visita_agendada: "✅ Aceptó visita",
  cotizar: "📝 Enviar cotización",
  interesado: "🔥 Interesado",
  transferido: "📞 Transferido a asesor",
  duda: "❓ Tiene dudas",
  no_interesado: "✖ No interesado",
  llamar_despues: "⏰ Llamar después",
  no_contesta: "— No contestó",
  buzon: "📭 Buzón",
  no_llamar: "⛔ No llamar",
  error: "⚠ Error",
};

const PRIORIDADES: Record<PrioridadLlamada, { label: string; clase: string }> = {
  alta: { label: "Alta", clase: "bg-red-50 text-red-700 border-red-200" },
  media: { label: "Media", clase: "bg-amber-50 text-amber-800 border-amber-200" },
  baja: { label: "Baja", clase: "bg-carbon/5 text-carbon/60 border-carbon/15" },
};

type FiltroBandeja = "todas" | PrioridadLlamada | "descartar";
type FiltroSegmento = "todos" | SegmentoLlamada;
type ModoAgrupacion = "negocio" | "objetivo" | "plano";

const COLOR_SEGMENTO: Record<SegmentoLlamada, string> = {
  sin_respuesta: "bg-slate-100 text-slate-800 border-slate-300",
  sin_cotizar: "bg-orange-50 text-orange-800 border-orange-300",
  cotizado: "bg-emerald-50 text-emerald-800 border-emerald-300",
  no_interesado: "bg-carbon/5 text-carbon/50 border-carbon/15",
};

export interface NegocioInfo {
  clave: string;
  etiqueta: string;
  empresa: string;
  icono: string;
  colorBg: string;
  colorTexto: string;
  colorBorder: string;
  descripcion: string;
}

export const NEGOCIOS: Record<string, NegocioInfo> = {
  impermeabilizacion: {
    clave: "impermeabilizacion",
    etiqueta: "Impermeabilización",
    empresa: "Sauceda Construye",
    icono: "☔",
    colorBg: "bg-sky-50",
    colorTexto: "text-sky-800",
    colorBorder: "border-sky-300",
    descripcion: "Protección contra goteras y humedad. Sistemas acrílicos y prefabricados termosellados IMPAC (Saint-Gobain).",
  },
  piso_estampado: {
    clave: "piso_estampado",
    etiqueta: "Concreto Estampado",
    empresa: "Sauceda Construye",
    icono: "🧱",
    colorBg: "bg-amber-50",
    colorTexto: "text-amber-900",
    colorBorder: "border-amber-300",
    descripcion: "Pisos y cocheras de concreto colado en sitio de 10cm con revolvedora, moldes de textura y sellado rudo.",
  },
  remodelacion: {
    clave: "remodelacion",
    etiqueta: "Remodelación & Obra",
    empresa: "Sauceda Construye",
    icono: "🏗️",
    colorBg: "bg-purple-50",
    colorTexto: "text-purple-800",
    colorBorder: "border-purple-300",
    descripcion: "Ampliación de recámaras, cocheras, cocinas y acabados bajo levantamiento técnico presencial.",
  },
  cisternas: {
    clave: "cisternas",
    etiqueta: "Cisternas & Tinacos",
    empresa: "Sauceda Mantenimiento",
    icono: "🚰",
    colorBg: "bg-teal-50",
    colorTexto: "text-teal-800",
    colorBorder: "border-teal-300",
    descripcion: "Limpieza profunda, desinfección y sellado de grietas con mortero impermeable para agua potable.",
  },
  calentadores: {
    clave: "calentadores",
    etiqueta: "Calentadores Solares",
    empresa: "Sauceda Mantenimiento",
    icono: "☀️",
    colorBg: "bg-orange-50",
    colorTexto: "text-orange-900",
    colorBorder: "border-orange-300",
    descripcion: "Mantenimiento preventivo, descalcificación y cambio de barra de magnesio en equipos solares.",
  },
  inmobiliario: {
    clave: "inmobiliario",
    etiqueta: "Bienes Raíces / Infonavit",
    empresa: "Sauceda Bienes Raíces",
    icono: "🏠",
    colorBg: "bg-indigo-50",
    colorTexto: "text-indigo-800",
    colorBorder: "border-indigo-300",
    descripcion: "Compra directa liquidando adeudos de Infonavit/bancos, corretaje y trámites notariales en León.",
  },
  construccion_general: {
    clave: "construccion_general",
    etiqueta: "Construcción General",
    empresa: "Sauceda Construye",
    icono: "🛠️",
    colorBg: "bg-slate-100",
    colorTexto: "text-slate-800",
    colorBorder: "border-slate-300",
    descripcion: "Fontanería, electricidad, pintura y servicios de mantenimiento para la vivienda.",
  },
};

export function detectarNegocio(ll: LlamadaIA): NegocioInfo {
  const tn = (ll.contexto?.tipoNegocio || "").toLowerCase();
  const s = (ll.contexto?.servicio || "").toLowerCase();

  if (tn.includes("imper") || s.includes("imper") || s.includes("techo") || s.includes("losa") || s.includes("gotera")) {
    return NEGOCIOS.impermeabilizacion;
  }
  if (tn.includes("piso") || s.includes("piso") || s.includes("estampado") || s.includes("concreto")) {
    return NEGOCIOS.piso_estampado;
  }
  if (tn.includes("remodela") || s.includes("remodela") || s.includes("amplia") || s.includes("fachada") || s.includes("obra")) {
    return NEGOCIOS.remodelacion;
  }
  if (tn.includes("cisterna") || s.includes("cisterna") || s.includes("aljibe") || s.includes("tinaco")) {
    return NEGOCIOS.cisternas;
  }
  if (tn.includes("calentador") || s.includes("calentador") || s.includes("solar")) {
    return NEGOCIOS.calentadores;
  }
  if (
    tn.includes("traspaso") ||
    tn.includes("infonavit") ||
    tn.includes("promocion") ||
    tn.includes("tramite") ||
    s.includes("infonavit") ||
    s.includes("casa") ||
    s.includes("traspaso")
  ) {
    return NEGOCIOS.inmobiliario;
  }
  return NEGOCIOS.construccion_general;
}

/** Genera la radiografía del guion telefónico exacto que usará Sofía en Vapi para este prospecto. */
export function generarGuionSofia(ll: LlamadaIA): {
  apertura: string;
  objetivoLlamada: string;
  metaExito: string;
  pasos: { orden: number; titulo: string; accion: string; detalle: string }[];
  datosAutorizados: string[];
  objecionesClave: { objecion: string; respuesta: string }[];
  candadosCalidad: string[];
} {
  const seg = segmentoDe(ll);
  const neg = detectarNegocio(ll);
  const nombre = (ll.nombre || "cliente").split(" ")[0];
  const servicio = ll.contexto?.servicio || neg.etiqueta.toLowerCase();
  const colonia = ll.contexto?.colonia ? ` en ${ll.contexto.colonia}` : " en León";
  const m2 = ll.contexto?.metros ? ` para sus ${ll.contexto.metros} m²` : "";
  const gancho = ll.sugerencia?.gancho || "";

  let apertura = `Hola ${nombre}, le habla Sofía, asistente virtual de Sauceda; esta llamada se graba.`;
  if (seg === "sin_respuesta") {
    apertura += ` Hace unos días nos escribió por WhatsApp sobre ${servicio}${colonia} y ya no supimos de usted. ¿Pudo revisar la información que le mandamos?`;
  } else if (seg === "sin_cotizar") {
    apertura += ` Le llamo por el ${servicio} que nos preguntó por WhatsApp; una disculpa porque no le llegó su presupuesto completo. ¿Lo sigue considerando para su propiedad?`;
  } else {
    apertura += ` Le llamo por la cotización de ${servicio}${m2} que le enviamos por WhatsApp. ¿Pudo revisarla?`;
  }

  const objetivoLlamada = SEGMENTOS[seg].objetivo;
  const metaExito = SEGMENTOS[seg].exito;

  const pasos = [
    {
      orden: 1,
      titulo: "Apertura y Reconexión",
      accion: "Captar atención en <15s y validar tiempo sin presionar.",
      detalle: gancho
        ? `Usar gancho personalizado del chat: "${gancho}". Si dice que no es buen momento, preguntar qué día marcar y despedirse.`
        : "Validar si sigue disponible para 1 minuto de conversación.",
    },
    {
      orden: 2,
      titulo: "Sondeo y Diagnóstico del Dolor",
      accion: "Escuchar activamente (regla 40% Sofía / 60% cliente).",
      detalle:
        neg.clave === "impermeabilizacion"
          ? "¿Tiene goteras activas o es mantenimiento preventivo? Confirmar medidas aproximadas y estado de la losa."
          : neg.clave === "piso_estampado"
          ? "¿Qué área es (cochera, patio)? ¿Es colado nuevo sobre tierra o sobre un firme existente?"
          : "¿Cuál es el trabajo exacto que requiere y qué urgencia tiene?",
    },
    {
      orden: 3,
      titulo: "Argumentación y Propuesta de Valor",
      accion: "Posicionar la formalidad técnica y garantía por escrito.",
      detalle:
        neg.clave === "impermeabilizacion"
          ? "Explicar que trabajamos con membrana termosellada IMPAC (Saint-Gobain) con gravilla de 3.5mm (5 años) o 4.0mm (10 años), no parches de pintura que se botan al año."
          : neg.clave === "piso_estampado"
          ? "Explicar que es concreto premezclado de 10cm colado en sitio con revolvedora, resistente al peso de camionetas."
          : "Explicar que los proyectos son ejecutados por técnicos especialistas con contrato formal de obra.",
    },
    {
      orden: 4,
      titulo: "Cierre Asertivo de Visita Técnica",
      accion: "Vender la inspección presencial gratuita con Doble Alternativa.",
      detalle:
        "Ofrecer 2 opciones de ruta (mañana a las 10:00 am o tarde a las 4:00 pm). Aclarar que la visita con medidor láser es sin costo ni compromiso para que no pague de más por metros mal calculados.",
    },
  ];

  const datosAutorizados = [
    `Cliente: ${ll.nombre || "Sin nombre"} | Teléfono: ${ll.telefono}`,
    `Servicio detectado: ${neg.etiqueta} (${neg.empresa})`,
    ll.contexto?.metros ? `Superficie estimada: ${ll.contexto.metros} metros cuadrados` : "Medidas: Por confirmar en sitio",
    ll.contexto?.monto ? `Presupuesto preliminar WhatsApp: Alrededor de $${Math.round(ll.contexto.monto).toLocaleString("es-MX")} pesos sin factura` : "Precio preliminar: No enviado aún",
    "Garantía oficial: 2, 5 o 10 años por escrito según el paquete elegido.",
    "Forma de pago oficial: Efectivo o transferencia bancaria (tarjeta solo en una exhibición si el cliente la solicita; PROHIBIDO ofrecer meses).",
    "Visita técnica: 100% gratuita y sin compromiso en León y zona metropolitana.",
  ];

  const objecionesClave = [
    {
      objecion: '"Está muy caro / un albañil me cobra la mitad"',
      respuesta:
        'Validar sin discutir: "Tiene toda la razón, hay personas que aplican pintura barata que al año se cuartea. En Sauceda colocamos membrana termosellada de uso rudo con contrato y garantía por escrito de 5 a 10 años. Lo barato sale caro cuando vuelve a llover."',
    },
    {
      objecion: '"Mándamelo por WhatsApp y ahí lo checo"',
      respuesta:
        'Retomar el control: "Con mucho gusto se lo envío terminando la llamada. Solo que como cada obra tiene condiciones distintas (grietas, desniveles), para no mandarle información genérica, el técnico pasa 15 minutos con el flexómetro sin costo para dejarle el número exacto. ¿Qué día le queda mejor?"',
    },
    {
      objecion: '"Déjame platicarlo con mi familia / socio y yo les marco"',
      respuesta:
        'Acompañar la decisión: "Es una decisión importante para cuidar su patrimonio. Precisamente para que cuando lo platiquen tengan el diagnóstico técnico real y no suposiciones, agendamos una revisión en un horario donde puedan estar ambos 15 minutos."',
    },
    {
      objecion: '"Ya contraté a alguien más"',
      respuesta:
        'Cierre elegante: "Excelente, me alegra que ya lo esté resolviendo. Solo por control nuestro: ¿qué sistema le van a colocar? Guarde nuestro número para cualquier detalle futuro. Que tenga buen día."',
    },
  ];

  const candadosCalidad = [
    "PROHIBIDO cotizar precio cerrado final por teléfono en obra sin visita técnica presencial.",
    "PROHIBIDO ofrecer meses sin intereses o pagos a plazos (solo contado / transferencia).",
    "Despedida UNA sola vez: 'Gracias, que tenga buen día' y colgar de inmediato.",
    "Si contesta buzón de voz o menú interactivo: Colgar de inmediato en < 3 segundos para no gastar saldo.",
    "Duración máxima de llamada: 180 segundos (3 minutos).",
  ];

  return { apertura, objetivoLlamada, metaExito, pasos, datosAutorizados, objecionesClave, candadosCalidad };
}

/** Tipos de negocio que la fuente "prospectos sin cotización" puede traer. */
const TIPOS_PROSPECTO: { valor: string; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todos los servicios" },
  { valor: "construccion-impermeabilizacion", etiqueta: "Impermeabilización" },
  { valor: "construccion-piso-estampado", etiqueta: "Piso estampado" },
  { valor: "construccion-remodelacion", etiqueta: "Remodelación" },
  { valor: "construccion-mantenimiento-cisternas", etiqueta: "Cisternas" },
  { valor: "construccion-mantenimiento-calentadores", etiqueta: "Calentadores" },
  { valor: "construccion", etiqueta: "Otros de construcción" },
];

type Ejecutar = (accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) => void;

const BTN =
  "rounded-md border border-carbon/15 px-2.5 py-1 text-xs font-semibold text-verde-profundo transition hover:border-sauce disabled:opacity-40";

function fecha(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function horaLarga(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function aInputLocal(iso: string | null): string {
  if (!iso) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour") === "24" ? "00" : v("hour")}:${v("minute")}`;
}

function deInputLocal(v: string): string {
  return `${v}:00-06:00`;
}

// ============================================================================
// 2. COMPONENTE PRINCIPAL
// ============================================================================

export function LlamadasIA({ inicial, config }: { inicial: LlamadaIA[]; config: ConfiguracionLlamadasIA }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);

  // Filtros
  const [filtro, setFiltro] = useState<FiltroBandeja>("todas");
  const [filtroSeg, setFiltroSeg] = useState<FiltroSegmento>("todos");
  const [filtroNegocio, setFiltroNegocio] = useState<string>("todos");
  const [modoAgrupacion, setModoAgrupacion] = useState<ModoAgrupacion>("negocio");
  const [gruposColapsados, setGruposColapsados] = useState<Record<string, boolean>>({});

  // Script Modal
  const [scriptModalLlamada, setScriptModalLlamada] = useState<LlamadaIA | null>(null);

  const [tipoProspecto, setTipoProspecto] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [llamadaActivaSombra, setLlamadaActivaSombra] = useState<{
    id: string;
    nombre: string;
    telefono: string;
    vapiCallId?: string | null;
    listenUrl?: string | null;
  } | null>(null);

  const [prueba, setPrueba] = useState<{
    telefono: string;
    nombre: string;
    servicio: string;
    colonia: string;
    segmento: SegmentoLlamada;
  }>({
    telefono: "",
    nombre: "",
    servicio: "impermeabilización",
    colonia: "",
    segmento: "cotizado",
  });

  const configurado = config.vapiApiKey && config.vapiNumero;
  const hayEnCurso = inicial.some((l) => l.estado === "en_curso");

  const sugeridas = inicial
    .filter((l) => l.estado === "pendiente" && !l.es_prueba)
    .sort((a, b) => (b.puntaje ?? -1) - (a.puntaje ?? -1));
  const sinAnalizar = sugeridas.filter((l) => !l.analizada_at).length;

  const enSegmento = (l: LlamadaIA, f: FiltroSegmento) => f === "todos" || segmentoDe(l) === f;
  const enNegocio = (l: LlamadaIA, f: string) => f === "todos" || detectarNegocio(l).clave === f;
  const enFiltro = (l: LlamadaIA, f: FiltroBandeja) => {
    const descartable = !!l.sugerencia?.descartar || l.segmento === "no_interesado";
    if (f === "descartar") return descartable;
    return !descartable && (f === "todas" || l.prioridad === f);
  };

  const visibles = sugeridas.filter(
    (l) => enFiltro(l, filtro) && enSegmento(l, filtroSeg) && enNegocio(l, filtroNegocio),
  );

  const agenda = inicial
    .filter((l) => l.estado === "aprobada" || l.estado === "en_curso")
    .sort((a, b) => Date.parse(a.proximo_intento ?? a.created_at) - Date.parse(b.proximo_intento ?? b.created_at));
  const historial = inicial.filter((l) => ["completada", "fallida", "cancelada"].includes(l.estado));

  // Refrescar mientras hay llamadas en curso o la IA está analizando.
  const refrescar = hayEnCurso || (analizando && sinAnalizar > 0);
  useEffect(() => {
    if (!refrescar) return;
    const t = setInterval(() => router.refresh(), analizando ? 6000 : 8000);
    return () => clearInterval(t);
  }, [refrescar, analizando, router]);
  useEffect(() => {
    if (analizando && sinAnalizar === 0) setAnalizando(false);
  }, [analizando, sinAnalizar]);

  const ejecutar: Ejecutar = (accion, exito) => {
    setMensaje(null);
    iniciar(async () => {
      const r = await accion();
      setMensaje(r.ok ? { ok: true, texto: exito } : { ok: false, texto: r.error || "Ocurrió un error." });
      router.refresh();
    });
  };

  const iniciarSombra = (ll: LlamadaIA) => {
    setLlamadaActivaSombra({
      id: ll.id,
      nombre: ll.nombre || "Prospecto",
      telefono: ll.telefono,
      vapiCallId: ll.vapi_call_id,
      listenUrl: (ll.datos as any)?.monitor?.listenUrl || null,
    });
  };

  const toggleGrupo = (clave: string) => {
    setGruposColapsados((prev) => ({ ...prev, [clave]: !prev[clave] }));
  };

  // Métricas rápidas
  const reales = inicial.filter((l) => !l.es_prueba);
  const contestadas = reales.filter(
    (l) => l.resultado && !["no_contesta", "buzon", "error", "no_llamar"].includes(l.resultado),
  ).length;
  const visitas = reales.filter((l) => l.resultado === "visita_agendada").length;
  const costo = inicial.reduce((s, l) => s + (Number(l.costo_usd) || 0), 0);
  const seleccionVisible = seleccion.filter((id) => visibles.some((l) => l.id === id));

  // Grupos calculados para renderizado inteligente
  const gruposPorNegocio = Object.values(NEGOCIOS)
    .map((neg) => {
      const items = visibles.filter((l) => detectarNegocio(l).clave === neg.clave);
      const altas = items.filter((l) => l.prioridad === "alta").length;
      return { neg, items, altas };
    })
    .filter((g) => g.items.length > 0);

  const gruposPorObjetivo = SEGMENTOS_LLAMABLES.map((segClave) => {
    const items = visibles.filter((l) => segmentoDe(l) === segClave);
    const altas = items.filter((l) => l.prioridad === "alta").length;
    return {
      clave: segClave,
      info: SEGMENTOS[segClave],
      items,
      altas,
    };
  }).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {/* Alerta de Configuración */}
      {!configurado && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 shadow-sm">
          <p className="font-semibold">Falta configurar Vapi para poder marcar.</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {!config.vapiApiKey && <li>Variable de entorno <code>VAPI_API_KEY</code> (llave privada de Vapi).</li>}
            {!config.vapiNumero && (
              <li>
                <code>VAPI_PHONE_NUMBER_ID</code>: número importado en Vapi (usar línea con Caller ID verificado de León <code>+52 477 465 4700</code>).
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Banner de Mensajes de Estado */}
      {mensaje && (
        <div
          className={`flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm shadow-sm ${
            mensaje.ok ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          <span>{mensaje.texto}</span>
          <button type="button" onClick={() => setMensaje(null)} className="text-xs font-bold hover:underline">
            ✕ Cerrar
          </button>
        </div>
      )}

      {/* Cabina de Escucha e Intervención WebRTC en Vivo */}
      {llamadaActivaSombra && (
        <CabinaLlamadaSombra
          llamadaId={llamadaActivaSombra.id}
          vapiCallId={llamadaActivaSombra.vapiCallId}
          clienteNombre={llamadaActivaSombra.nombre}
          clienteTelefono={llamadaActivaSombra.telefono}
          listenUrl={llamadaActivaSombra.listenUrl}
          onCerrar={() => setLlamadaActivaSombra(null)}
        />
      )}

      {/* Modal de Detalle de Script de Sofía */}
      {scriptModalLlamada && (
        <ModalScriptSofia llamada={scriptModalLlamada} onClose={() => setScriptModalLlamada(null)} onIniciarSombra={iniciarSombra} />
      )}

      {/* Tablero de Métricas KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi titulo="Sugeridas en Cola" valor={sugeridas.length} subtitulo="Por evaluar y aprobar" />
        <Kpi titulo="Programadas" valor={agenda.length} subtitulo="En agenda de marcación" />
        <Kpi titulo="Contactos Efectivos" valor={contestadas} subtitulo="Llamadas descolgadas" />
        <Kpi titulo="Citas Agendadas" valor={visitas} subtitulo="Objetivo principal cumplido" />
        <Kpi titulo="Inversión Vapi" valor={`$${costo.toFixed(2)} USD`} subtitulo="Consumo acumulado" />
      </div>

      {/* ==================================================================== */}
      {/* BANDEJA DE LLAMADAS SUGERIDAS (MÓDULO CENTRAL OPTIMIZADO)            */}
      {/* ==================================================================== */}
      <section className="rounded-xl border border-carbon/15 bg-white shadow-sm">
        {/* Cabecera y Botones de Importación */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-carbon/10 bg-crema/20 px-4 py-3.5">
          <div>
            <h2 className="text-base font-bold text-verde-profundo flex items-center gap-2">
              <span>🎯 Bandeja de Llamadas Sugeridas</span>
              <span className="rounded-full bg-verde-profundo/10 px-2 py-0.5 text-xs font-semibold text-verde-profundo">
                {visibles.length} {visibles.length === 1 ? "lead" : "leads"}
              </span>
            </h2>
            <p className="text-xs text-carbon/60">
              Sofía analiza el WhatsApp y cotización de cada cliente para determinar el negocio exacto, el objetivo y el guion telefónico óptimo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pendiente}
              onClick={() => {
                setMensaje(null);
                iniciar(async () => {
                  const r = await generarListaReagendarIA();
                  if (r.ok && r.agregadas) setAnalizando(true);
                  setMensaje(
                    r.ok
                      ? {
                          ok: true,
                          texto: r.agregadas
                            ? `Se agregaron ${r.agregadas} cotizaciones. Sofía las está analizando…`
                            : "No hay cotizaciones nuevas esperando visita.",
                        }
                      : { ok: false, texto: r.error || "Error al importar." },
                  );
                  router.refresh();
                });
              }}
              className="rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs font-semibold text-verde-profundo shadow-sm transition hover:border-sauce hover:bg-crema/40 disabled:opacity-40"
            >
              + Traer cotizaciones en espera
            </button>

            <div className="flex items-center overflow-hidden rounded-lg border border-carbon/20 bg-white shadow-sm">
              <select
                aria-label="Servicio de los prospectos"
                value={tipoProspecto}
                onChange={(e) => setTipoProspecto(e.target.value)}
                className="border-r border-carbon/10 bg-white px-2.5 py-1.5 text-xs text-verde-profundo outline-none"
              >
                {TIPOS_PROSPECTO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pendiente}
                onClick={() => {
                  setMensaje(null);
                  iniciar(async () => {
                    const r = await generarListaProspectosIA(tipoProspecto || null);
                    if (r.ok && r.agregadas) setAnalizando(true);
                    setMensaje(
                      r.ok
                        ? {
                            ok: true,
                            texto: r.agregadas
                              ? `Se agregaron ${r.agregadas} prospectos. Analizando contexto y servicio…`
                              : "No hay prospectos nuevos sin cotización para ese servicio.",
                          }
                        : { ok: false, texto: r.error || "Error al importar." },
                    );
                    router.refresh();
                  });
                }}
                className="px-3 py-1.5 text-xs font-semibold text-verde-profundo transition hover:bg-crema/60 disabled:opacity-40"
              >
                + Traer prospectos
              </button>
            </div>

            {sinAnalizar > 0 && (
              <button
                type="button"
                disabled={pendiente || analizando}
                onClick={() => {
                  setMensaje(null);
                  iniciar(async () => {
                    const r = await analizarSugerenciasIA();
                    if (r.ok) setAnalizando(true);
                    else setMensaje({ ok: false, texto: r.error || "Error" });
                    router.refresh();
                  });
                }}
                className="rounded-lg bg-verde-profundo px-3 py-1.5 text-xs font-semibold text-crema shadow-sm transition hover:bg-sauce disabled:opacity-40"
              >
                {analizando ? `Analizando… faltan ${sinAnalizar}` : `✨ Analizar con IA (${sinAnalizar})`}
              </button>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* BARRA DE FILTROS AVANZADOS: NEGOCIO, OBJETIVO Y PRIORIDAD          */}
        {/* ------------------------------------------------------------------ */}
        {sugeridas.length > 0 && (
          <div className="space-y-2 border-b border-carbon/10 bg-carbon/[0.02] p-3 text-xs">
            {/* 1. Filtro por Negocio / Vertical */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 shrink-0 font-bold uppercase tracking-wider text-carbon/40 text-[10px]">
                🏢 Negocio:
              </span>
              <button
                type="button"
                onClick={() => setFiltroNegocio("todos")}
                className={`rounded-full border px-2.5 py-0.5 font-semibold transition ${
                  filtroNegocio === "todos"
                    ? "border-verde-profundo bg-verde-profundo text-white"
                    : "border-carbon/15 bg-white text-carbon/60 hover:text-verde-profundo"
                }`}
              >
                Todos los negocios ({sugeridas.filter((l) => enFiltro(l, filtro) && enSegmento(l, filtroSeg)).length})
              </button>
              {Object.values(NEGOCIOS).map((neg) => {
                const cuenta = sugeridas.filter(
                  (l) => enFiltro(l, filtro) && enSegmento(l, filtroSeg) && detectarNegocio(l).clave === neg.clave,
                ).length;
                if (cuenta === 0) return null;
                const activo = filtroNegocio === neg.clave;
                return (
                  <button
                    key={neg.clave}
                    type="button"
                    onClick={() => setFiltroNegocio(neg.clave)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold transition ${
                      activo
                        ? `${neg.colorBg} ${neg.colorTexto} ${neg.colorBorder} ring-2 ring-sauce/40`
                        : "border-carbon/15 bg-white text-carbon/70 hover:border-sauce"
                    }`}
                  >
                    <span>{neg.icono}</span>
                    <span>{neg.etiqueta}</span>
                    <span className="opacity-60">({cuenta})</span>
                  </button>
                );
              })}
            </div>

            {/* 2. Filtro por Segmento y Objetivo de Conversación */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 shrink-0 font-bold uppercase tracking-wider text-carbon/40 text-[10px]">
                🎯 Objetivo:
              </span>
              {(["todos", ...SEGMENTOS_LLAMABLES] as FiltroSegmento[]).map((f) => {
                const cuenta = sugeridas.filter((l) => enFiltro(l, filtro) && enSegmento(l, f) && enNegocio(l, filtroNegocio)).length;
                const activo = filtroSeg === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFiltroSeg(f)}
                    title={f === "todos" ? undefined : `Meta: ${SEGMENTOS[f].objetivo}`}
                    className={`rounded-full border px-2.5 py-0.5 font-semibold transition ${
                      activo
                        ? "border-sauce bg-sauce/15 text-verde-profundo font-bold ring-1 ring-sauce"
                        : "border-carbon/15 bg-white text-carbon/60 hover:text-verde-profundo"
                    }`}
                  >
                    {f === "todos" ? "Todos los objetivos" : SEGMENTOS[f].etiqueta} ({cuenta})
                  </button>
                );
              })}
            </div>

            {/* 3. Filtro por Prioridad y Selector de Vista Agrupada */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-carbon/5">
              <span className="w-20 shrink-0 font-bold uppercase tracking-wider text-carbon/40 text-[10px]">
                ⚡ Prioridad:
              </span>
              {(["todas", "alta", "media", "baja", "descartar"] as FiltroBandeja[]).map((f) => {
                const cuenta = sugeridas.filter(
                  (l) => enFiltro(l, f) && enSegmento(l, filtroSeg) && enNegocio(l, filtroNegocio),
                ).length;
                const activo = filtro === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFiltro(f)}
                    className={`rounded-full border px-2.5 py-0.5 font-semibold transition ${
                      activo ? "border-carbon/40 bg-carbon/10 text-carbon font-bold" : "border-carbon/15 bg-white text-carbon/60 hover:text-carbon"
                    }`}
                  >
                    {f === "todas" ? "Todas" : f === "descartar" ? "No llamar" : PRIORIDADES[f].label} ({cuenta})
                  </button>
                );
              })}

              {/* Selector de Modo de Agrupación */}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-carbon/40">Agrupar por:</span>
                <div className="inline-flex rounded-lg border border-carbon/20 bg-white p-0.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setModoAgrupacion("negocio")}
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold transition ${
                      modoAgrupacion === "negocio" ? "bg-verde-profundo text-white" : "text-carbon/60 hover:text-verde-profundo"
                    }`}
                  >
                    🏢 Negocio
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoAgrupacion("objetivo")}
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold transition ${
                      modoAgrupacion === "objetivo" ? "bg-verde-profundo text-white" : "text-carbon/60 hover:text-verde-profundo"
                    }`}
                  >
                    🎯 Objetivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoAgrupacion("plano")}
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold transition ${
                      modoAgrupacion === "plano" ? "bg-verde-profundo text-white" : "text-carbon/60 hover:text-verde-profundo"
                    }`}
                  >
                    📋 Lista
                  </button>
                </div>

                <label className="flex items-center gap-1 text-xs text-carbon/70 pl-2">
                  <input
                    type="checkbox"
                    checked={visibles.length > 0 && seleccionVisible.length === visibles.length}
                    onChange={(e) => setSeleccion(e.target.checked ? visibles.map((l) => l.id) : [])}
                  />
                  <span>Todas</span>
                </label>

                <button
                  type="button"
                  disabled={pendiente || seleccionVisible.length === 0}
                  onClick={() => {
                    const ids = seleccionVisible;
                    ejecutar(() => aprobarLlamadasIA(ids), `${ids.length} pasaron a la agenda con su hora sugerida.`);
                    setSeleccion([]);
                  }}
                  className="rounded-lg bg-sauce px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-sauce/90 disabled:opacity-40"
                >
                  Aprobar ({seleccionVisible.length})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* LISTADO DE TARJETAS (AGRUPADO O PLANO)                             */}
        {/* ------------------------------------------------------------------ */}
        <div className="divide-y divide-carbon/10">
          {visibles.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-carbon/50">
              <span className="block text-2xl mb-1">📭</span>
              {sugeridas.length === 0
                ? "No hay sugerencias en cola. Trae las cotizaciones esperando visita o prospectos sin cotización para empezar."
                : "No hay llamadas sugeridas con los filtros seleccionados."}
            </div>
          ) : modoAgrupacion === "negocio" ? (
            // ==============================================================
            // VISTA 1: AGRUPADA POR LÍNEA DE NEGOCIO
            // ==============================================================
            gruposPorNegocio.map(({ neg, items, altas }) => {
              const colapsado = !!gruposColapsados[neg.clave];
              const idsGrupo = items.map((x) => x.id);
              const todasSeleccionadas = idsGrupo.every((id) => seleccion.includes(id));

              return (
                <div key={neg.clave} className="border-b border-carbon/10 last:border-b-0">
                  {/* Cabecera del Grupo Negocio */}
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none transition ${
                      colapsado ? "bg-white hover:bg-carbon/[0.02]" : "bg-crema/20 border-b border-carbon/10"
                    }`}
                    onClick={() => toggleGrupo(neg.clave)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{neg.icono}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-verde-profundo">{neg.etiqueta}</h3>
                          <span className="text-[11px] text-carbon/50 font-normal">· {neg.empresa}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${neg.colorBg} ${neg.colorTexto} ${neg.colorBorder}`}>
                            {items.length} {items.length === 1 ? "llamada" : "llamadas"}
                          </span>
                          {altas > 0 && (
                            <span className="rounded-full bg-red-100 text-red-800 border border-red-300 px-2 py-0.2 text-[10px] font-bold">
                              🔥 {altas} Alta prioridad
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-carbon/60 line-clamp-1">{neg.descripcion}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={pendiente}
                        onClick={() => {
                          ejecutar(() => aprobarLlamadasIA(idsGrupo), `${items.length} llamadas de ${neg.etiqueta} aprobadas.`);
                        }}
                        className="rounded-md border border-sauce/30 bg-white px-2.5 py-1 text-xs font-semibold text-verde-profundo shadow-sm transition hover:bg-sauce/10 disabled:opacity-40"
                      >
                        ✓ Aprobar grupo ({items.length})
                      </button>
                      <button
                        type="button"
                        className="p-1 text-carbon/40 hover:text-carbon transition text-sm"
                        onClick={() => toggleGrupo(neg.clave)}
                        title={colapsado ? "Expandir grupo" : "Colapsar grupo"}
                      >
                        {colapsado ? "▼ Desplegar" : "▲ Contraer"}
                      </button>
                    </div>
                  </div>

                  {/* Cuerpo del Grupo */}
                  {!colapsado && (
                    <div className="divide-y divide-carbon/5 bg-white">
                      {items.map((ll) => (
                        <TarjetaSugerida
                          key={ll.id}
                          ll={ll}
                          seleccionada={seleccion.includes(ll.id)}
                          onSeleccionar={(v) =>
                            setSeleccion(v ? [...seleccion, ll.id] : seleccion.filter((x) => x !== ll.id))
                          }
                          ocupado={pendiente}
                          configurado={configurado}
                          ejecutar={ejecutar}
                          onIniciarSombra={iniciarSombra}
                          onVerScript={setScriptModalLlamada}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : modoAgrupacion === "objetivo" ? (
            // ==============================================================
            // VISTA 2: AGRUPADA POR OBJETIVO DE LA CONVERSACIÓN
            // ==============================================================
            gruposPorObjetivo.map(({ clave, info, items, altas }) => {
              const colapsado = !!gruposColapsados[clave];
              const idsGrupo = items.map((x) => x.id);

              return (
                <div key={clave} className="border-b border-carbon/10 last:border-b-0">
                  {/* Cabecera del Grupo Objetivo */}
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none transition ${
                      colapsado ? "bg-white hover:bg-carbon/[0.02]" : "bg-crema/20 border-b border-carbon/10"
                    }`}
                    onClick={() => toggleGrupo(clave)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">🎯</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-verde-profundo">{info.etiqueta}</h3>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${COLOR_SEGMENTO[clave as SegmentoLlamada]}`}>
                            {items.length} {items.length === 1 ? "prospecto" : "prospectos"}
                          </span>
                          {altas > 0 && (
                            <span className="rounded-full bg-red-100 text-red-800 border border-red-300 px-2 py-0.2 text-[10px] font-bold">
                              🔥 {altas} Alta
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-carbon/70 font-medium">
                          Meta de Sofía: <span className="font-normal text-carbon/60">{info.objetivo}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={pendiente}
                        onClick={() => {
                          ejecutar(() => aprobarLlamadasIA(idsGrupo), `${items.length} llamadas de objetivo "${info.etiqueta}" aprobadas.`);
                        }}
                        className="rounded-md border border-sauce/30 bg-white px-2.5 py-1 text-xs font-semibold text-verde-profundo shadow-sm transition hover:bg-sauce/10 disabled:opacity-40"
                      >
                        ✓ Aprobar grupo ({items.length})
                      </button>
                      <button
                        type="button"
                        className="p-1 text-carbon/40 hover:text-carbon transition text-sm"
                        onClick={() => toggleGrupo(clave)}
                      >
                        {colapsado ? "▼ Desplegar" : "▲ Contraer"}
                      </button>
                    </div>
                  </div>

                  {!colapsado && (
                    <div className="divide-y divide-carbon/5 bg-white">
                      {items.map((ll) => (
                        <TarjetaSugerida
                          key={ll.id}
                          ll={ll}
                          seleccionada={seleccion.includes(ll.id)}
                          onSeleccionar={(v) =>
                            setSeleccion(v ? [...seleccion, ll.id] : seleccion.filter((x) => x !== ll.id))
                          }
                          ocupado={pendiente}
                          configurado={configurado}
                          ejecutar={ejecutar}
                          onIniciarSombra={iniciarSombra}
                          onVerScript={setScriptModalLlamada}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            // ==============================================================
            // VISTA 3: LISTA PLANA CONTINUA
            // ==============================================================
            visibles.map((ll) => (
              <TarjetaSugerida
                key={ll.id}
                ll={ll}
                seleccionada={seleccion.includes(ll.id)}
                onSeleccionar={(v) => setSeleccion(v ? [...seleccion, ll.id] : seleccion.filter((x) => x !== ll.id))}
                ocupado={pendiente}
                configurado={configurado}
                ejecutar={ejecutar}
                onIniciarSombra={iniciarSombra}
                onVerScript={setScriptModalLlamada}
              />
            ))
          )}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* SECCIÓN: AGENDA DE LLAMADAS PROGRAMADAS                              */}
      {/* ==================================================================== */}
      <section className="rounded-xl border border-carbon/10 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-carbon/10 bg-crema/20 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-verde-profundo flex items-center gap-2">
              <span>📅 Agenda de Llamadas Programadas</span>
              <span className="rounded-full bg-verde-profundo/10 px-2 py-0.5 text-xs font-semibold text-verde-profundo">
                {agenda.length}
              </span>
            </h2>
            <p className="text-xs text-carbon/50">
              Llamadas aprobadas listas para marcar en su hora óptima (L-S 10:00 a 19:00 hrs). Puedes dispararlas con "Llamar ahora" o "Llamar en Sombra".
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs font-semibold text-carbon/70 hover:text-verde-profundo hover:border-sauce shadow-sm transition"
          >
            ↻ Actualizar agenda
          </button>
        </div>
        <div className="divide-y divide-carbon/5">
          {agenda.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-carbon/50">No hay llamadas programadas en este momento.</p>
          ) : (
            agenda.map((ll) => (
              <FilaAgenda
                key={ll.id}
                ll={ll}
                ocupado={pendiente}
                configurado={configurado}
                ejecutar={ejecutar}
                onIniciarSombra={iniciarSombra}
                onVerScript={setScriptModalLlamada}
              />
            ))
          )}
        </div>
      </section>

      {/* ==================================================================== */}
      {/* SECCIÓN: LLAMADA DE PRUEBA A TU NÚMERO (MODO SOMBRA AIRPODS)         */}
      {/* ==================================================================== */}
      <details className="rounded-xl border border-carbon/15 bg-white shadow-sm overflow-hidden">
        <summary className="cursor-pointer bg-crema/20 px-4 py-3 text-sm font-bold text-verde-profundo hover:bg-crema/40 transition flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span>🧪</span> Probar Sofía con una llamada de prueba a tu celular
          </span>
          <span className="text-xs text-carbon/40 font-normal">Clic para desplegar formulario ▼</span>
        </summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ejecutar(async () => {
              const res = await probarLlamadaIA(prueba);
              if (res.ok && res.llamadaId) {
                setLlamadaActivaSombra({
                  id: res.llamadaId,
                  nombre: prueba.nombre || "Llamada de Prueba",
                  telefono: prueba.telefono,
                  vapiCallId: res.vapiCallId || null,
                  listenUrl: res.listenUrl || null,
                });
              }
              return res;
            }, "Llamada de prueba lanzada con modo sombra para AirPods. ¡Contesta tu teléfono!");
          }}
          className="border-t border-carbon/10 p-5 space-y-4 bg-white"
        >
          <div className="grid gap-3 md:grid-cols-4">
            <Campo
              label="Teléfono (10 dígitos)"
              value={prueba.telefono}
              requerido
              onChange={(v) => setPrueba({ ...prueba, telefono: v })}
            />
            <Campo
              label="Nombre del prospecto"
              value={prueba.nombre}
              onChange={(v) => setPrueba({ ...prueba, nombre: v })}
            />
            <Campo
              label="Servicio"
              value={prueba.servicio}
              onChange={(v) => setPrueba({ ...prueba, servicio: v })}
            />
            <Campo
              label="Colonia (en León)"
              value={prueba.colonia}
              onChange={(v) => setPrueba({ ...prueba, colonia: v })}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <label className="block max-w-xs">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-carbon/50">
                Segmento / Objetivo a Probar
              </span>
              <select
                value={prueba.segmento}
                onChange={(e) => setPrueba({ ...prueba, segmento: e.target.value as SegmentoLlamada })}
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs text-verde-profundo outline-none"
              >
                {SEGMENTOS_LLAMABLES.map((s) => (
                  <option key={s} value={s}>
                    {SEGMENTOS[s].etiqueta} — {SEGMENTOS[s].objetivo}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={pendiente || !configurado}
                className="rounded-lg bg-verde-profundo px-4 py-2 text-xs font-bold text-crema shadow-sm transition hover:bg-sauce disabled:opacity-40 flex items-center gap-2"
              >
                <span>🎧</span> {pendiente ? "Marcando…" : "Lanzar Llamada de Prueba"}
              </button>
              <span className="text-xs text-carbon/50">
                No toca prospectos ni cotizaciones. Puede marcar fuera de horario.
              </span>
            </div>
          </div>
        </form>
      </details>

      {/* ==================================================================== */}
      {/* SECCIÓN: RESULTADOS E HISTORIAL DE LLAMADAS                          */}
      {/* ==================================================================== */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-verde-profundo flex items-center gap-2">
            <span>📊 Historial de Resultados de Llamadas</span>
            <span className="rounded-full bg-carbon/5 px-2 py-0.5 text-xs font-semibold text-carbon/60">
              {historial.length}
            </span>
          </h2>
        </div>
        <div className="overflow-auto rounded-xl border border-carbon/10 bg-white shadow-sm scrollbar-sutil">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-carbon/10 bg-crema/70 text-left">
                <Th>Cliente / Negocio</Th>
                <Th>Estado</Th>
                <Th>Resultado Vapi</Th>
                <Th>Intentos</Th>
                <Th>Cita Agendada</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {historial.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-carbon/50">
                    Aún no hay llamadas terminadas registradas en el sistema.
                  </td>
                </tr>
              ) : (
                historial.map((ll) => (
                  <FilaLlamada
                    key={ll.id}
                    ll={ll}
                    abierta={abierta === ll.id}
                    onAbrir={() => setAbierta(abierta === ll.id ? null : ll.id)}
                    onVerScript={setScriptModalLlamada}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// 3. TARJETA DE LLAMADA SUGERIDA (CON NEGOCIO, OBJETIVO Y SCRIPT VISIBLE)
// ============================================================================

function TarjetaSugerida({
  ll,
  seleccionada,
  onSeleccionar,
  ocupado,
  configurado,
  ejecutar,
  onIniciarSombra,
  onVerScript,
}: {
  ll: LlamadaIA;
  seleccionada: boolean;
  onSeleccionar: (v: boolean) => void;
  ocupado: boolean;
  configurado: boolean;
  ejecutar: Ejecutar;
  onIniciarSombra: (ll: LlamadaIA) => void;
  onVerScript: (ll: LlamadaIA) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [expandirScript, setExpandirScript] = useState(false);
  const [hora, setHora] = useState(aInputLocal(ll.hora_sugerida));
  const [gancho, setGancho] = useState(ll.sugerencia?.gancho ?? "");
  const sug = ll.sugerencia;
  const pri = ll.prioridad ? PRIORIDADES[ll.prioridad] : null;
  const neg = detectarNegocio(ll);
  const seg = segmentoDe(ll);
  const guion = generarGuionSofia(ll);

  return (
    <div className={`p-4 transition ${seleccionada ? "bg-sauce/5" : "hover:bg-carbon/[0.01]"}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label="Seleccionar prospecto"
          className="mt-1 h-4 w-4 rounded border-carbon/20 text-sauce focus:ring-sauce"
          checked={seleccionada}
          onChange={(e) => onSeleccionar(e.target.checked)}
        />

        <div className="min-w-0 flex-1 space-y-2">
          {/* Fila 1: Nombre, Badge de Negocio, Prioridad y Segmento */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-verde-profundo">{ll.nombre || "Sin nombre"}</span>

            {/* Badge Destacado de Negocio */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold shadow-2xs ${neg.colorBg} ${neg.colorTexto} ${neg.colorBorder}`}
              title={`${neg.etiqueta} · ${neg.empresa}`}
            >
              <span>{neg.icono}</span>
              <span>{neg.etiqueta}</span>
            </span>

            {/* Badge de Prioridad */}
            {pri ? (
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pri.clase}`}>
                {pri.label} · {ll.puntaje ?? 0} pts
              </span>
            ) : (
              <span className="rounded-full border border-carbon/15 px-2 py-0.5 text-[11px] text-carbon/40">
                Sin analizar
              </span>
            )}

            {/* Badge de Horario */}
            {ll.hora_sugerida && (
              <span className="rounded-full bg-carbon/5 border border-carbon/10 px-2 py-0.5 text-[11px] font-medium text-carbon/70">
                🕒 {horaLarga(ll.hora_sugerida)}
              </span>
            )}

            {sug?.editada && <span className="text-[10px] uppercase font-bold text-sauce bg-sauce/10 px-1.5 py-0.2 rounded">Editada</span>}
          </div>

          {/* Fila 2: Datos técnicos del prospecto */}
          <ClienteLinea ll={ll} negocio={neg} />

          {/* Fila 3: BANNER DE OBJETIVO DE LA CONVERSACIÓN (CLARO Y VISIBLE) */}
          <div className="rounded-lg border border-carbon/15 bg-crema/40 p-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1.5 font-bold text-verde-profundo">
                <span>🎯 Objetivo de Sofía:</span>
                <span className={`rounded-full border px-2 py-0.2 text-[10px] font-bold ${COLOR_SEGMENTO[seg]}`}>
                  {SEGMENTOS[seg].etiqueta}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-emerald-800">
                Meta esperada: <strong>{SEGMENTOS[seg].exito}</strong>
              </span>
            </div>
            <p className="text-carbon/80 leading-relaxed">{guion.objetivoLlamada}</p>
          </div>

          {/* Fila 4: Razonamiento de la IA & Gancho */}
          {sug?.descartar && (
            <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
              ⛔ La IA sugiere no llamar: cliente ya no está interesado o pidió no ser contactado.
            </p>
          )}

          {sug?.razon && <p className="text-xs text-carbon/75 font-medium">💡 {sug.razon}</p>}

          {sug?.gancho && (
            <div className="rounded-lg border-l-4 border-sauce bg-carbon/[0.02] px-3 py-1.5 text-xs text-carbon/90">
              <span className="block font-bold text-[10px] uppercase tracking-wider text-sauce">Apertura con gancho:</span>
              <p className="italic font-serif">"{sug.gancho}"</p>
            </div>
          )}

          {sug?.objecion && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200/60 rounded px-2 py-1">
              ⚠️ <strong>Freno / Objeción probable:</strong> {sug.objecion}
            </p>
          )}

          {/* Fila 5: Edición rápida de hora y gancho */}
          {editando && (
            <div className="space-y-2 rounded-lg bg-crema/50 border border-carbon/15 p-3">
              <label className="block text-xs font-semibold text-verde-profundo">
                Hora programada para marcar
                <input
                  type="datetime-local"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  className="mt-1 block rounded-lg border border-carbon/20 bg-white px-2.5 py-1 text-sm text-verde-profundo"
                />
              </label>
              <label className="block text-xs font-semibold text-verde-profundo">
                Con qué abrir (gancho personalizado)
                <textarea
                  value={gancho}
                  onChange={(e) => setGancho(e.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-lg border border-carbon/20 bg-white px-2.5 py-1 text-sm text-verde-profundo"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={BTN}
                  disabled={ocupado}
                  onClick={() => {
                    ejecutar(
                      () => editarSugerenciaIA(ll.id, { gancho, ...(hora ? { hora: deInputLocal(hora) } : {}) }),
                      "Sugerencia actualizada.",
                    );
                    setEditando(false);
                  }}
                >
                  Guardar cambios
                </button>
                <button type="button" className={BTN} onClick={() => setEditando(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Fila 6: Acordeón opcional de Script In-line */}
          {expandirScript && (
            <div className="mt-2 space-y-2 rounded-lg border border-sauce/30 bg-crema/30 p-3 text-xs animate-in fade-in">
              <div className="flex items-center justify-between border-b border-carbon/10 pb-1.5">
                <span className="font-bold text-verde-profundo">📜 Guion Rápido de Sofía</span>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-sauce hover:underline"
                  onClick={() => onVerScript(ll)}
                >
                  Abrir simulador completo ↗
                </button>
              </div>
              <div>
                <span className="font-bold text-carbon/70">Apertura:</span>
                <p className="italic text-carbon/80 mt-0.5 font-serif">"{guion.apertura}"</p>
              </div>
              <div>
                <span className="font-bold text-carbon/70">Cierre de visita:</span>
                <p className="text-carbon/80 mt-0.5">{guion.pasos[3]?.detalle}</p>
              </div>
            </div>
          )}
        </div>

        {/* Columna de Acciones Rápidas */}
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            className="rounded-md border border-emerald-600/40 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 shadow-2xs transition hover:bg-emerald-100 disabled:opacity-40"
            disabled={ocupado || !configurado}
            onClick={() => onIniciarSombra(ll)}
            title="Llamar con Sofía y escuchar en vivo por AirPods con opción a intervenir"
          >
            🎧 Llamar en Sombra
          </button>

          <button
            type="button"
            className="rounded-md border border-sauce/40 bg-sauce/15 px-2.5 py-1 text-xs font-bold text-verde-profundo shadow-2xs transition hover:bg-sauce/30"
            onClick={() => onVerScript(ll)}
          >
            📜 Ver Script
          </button>

          <button
            type="button"
            className="rounded-md bg-sauce px-2.5 py-1 text-xs font-bold text-white shadow-2xs transition hover:bg-sauce/90 disabled:opacity-40"
            disabled={ocupado}
            onClick={() => ejecutar(() => aprobarLlamadasIA([ll.id]), "Pasó a la agenda.")}
          >
            ✓ Aprobar
          </button>

          <div className="flex items-center gap-1 mt-1">
            {sug && !editando && (
              <button
                type="button"
                className={BTN}
                onClick={() => {
                  setHora(aInputLocal(ll.hora_sugerida));
                  setGancho(sug.gancho ?? "");
                  setEditando(true);
                }}
              >
                Editar
              </button>
            )}
            <button
              type="button"
              className={BTN}
              disabled={ocupado}
              onClick={() => ejecutar(() => analizarSugerenciasIA([ll.id]), "Analizada de nuevo.")}
              title="Volver a leer el chat de WhatsApp con Claude"
            >
              Reanalizar
            </button>
            <button
              type="button"
              className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
              disabled={ocupado}
              onClick={() => ejecutar(() => cancelarLlamadaIA(ll.id), "Descartada.")}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 4. MODAL DETALLADO DEL SCRIPT Y GUION TELEFÓNICO DE SOFÍA
// ============================================================================

function ModalScriptSofia({
  llamada,
  onClose,
  onIniciarSombra,
}: {
  llamada: LlamadaIA;
  onClose: () => void;
  onIniciarSombra: (ll: LlamadaIA) => void;
}) {
  const guion = generarGuionSofia(llamada);
  const neg = detectarNegocio(llamada);
  const seg = segmentoDe(llamada);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-carbon/20 bg-white shadow-2xl scrollbar-sutil">
        {/* Cabecera del Modal */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-carbon/15 bg-crema px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{neg.icono}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-verde-profundo">Guion Telefónico de Sofía</h3>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${neg.colorBg} ${neg.colorTexto} ${neg.colorBorder}`}>
                  {neg.etiqueta}
                </span>
                <span className={`rounded-full border px-2 py-0.2 text-xs font-semibold ${COLOR_SEGMENTO[seg]}`}>
                  {SEGMENTOS[seg].etiqueta}
                </span>
              </div>
              <p className="text-xs text-carbon/60">
                Prospecto: <strong className="text-verde-profundo">{llamada.nombre || "Sin nombre"}</strong> ({llamada.telefono}) · {neg.empresa}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-carbon/40 hover:bg-carbon/10 hover:text-carbon transition text-lg"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* 1. OBJETIVO ESTRATÉGICO */}
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                <span>🎯</span> Objetivo de la Conversación
              </span>
              <span className="rounded-md bg-emerald-100 text-emerald-900 px-2 py-0.5 text-xs font-bold">
                Meta: {guion.metaExito}
              </span>
            </div>
            <p className="text-sm font-medium text-emerald-950 mt-1">{guion.objetivoLlamada}</p>
          </div>

          {/* 2. APERTURA DE VOZ (PRIMEROS 15 SEGUNDOS) */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-carbon/50 flex items-center gap-1">
              <span>🎙️</span> 1. Apertura de Voz (Primeros 15 segundos)
            </h4>
            <div className="rounded-xl border-l-4 border-sauce bg-carbon/[0.03] p-4 text-sm font-serif italic text-carbon/90 shadow-2xs">
              "{guion.apertura}"
            </div>
            {llamada.sugerencia?.gancho && (
              <p className="text-xs text-carbon/60">
                💡 <strong>Gancho detectado en WhatsApp:</strong> {llamada.sugerencia.gancho}
              </p>
            )}
          </div>

          {/* 3. FLUJO PASO A PASO */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-carbon/50 flex items-center gap-1">
              <span>📋</span> 2. Estructura y Pasos de la Llamada
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {guion.pasos.map((p) => (
                <div key={p.orden} className="rounded-xl border border-carbon/15 bg-white p-3.5 shadow-2xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-verde-profundo text-white text-xs font-bold">
                      {p.orden}
                    </span>
                    <h5 className="text-xs font-bold text-verde-profundo">{p.titulo}</h5>
                  </div>
                  <p className="text-xs font-semibold text-sauce">{p.accion}</p>
                  <p className="text-xs text-carbon/70 mt-1 leading-relaxed">{p.detalle}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 4. DATOS Y PRECIOS OFICIALES AUTORIZADOS */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-carbon/50 flex items-center gap-1">
              <span>💲</span> 3. Datos Oficiales que Sofía Puede Afirmar
            </h4>
            <ul className="rounded-xl border border-carbon/15 bg-carbon/[0.02] p-4 text-xs space-y-1.5 text-carbon/80">
              {guion.datosAutorizados.map((d, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-sauce font-bold">•</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 5. MANEJO DE OBJECIONES EN TIEMPO REAL */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-carbon/50 flex items-center gap-1">
              <span>🛡️</span> 4. Manejo de Objeciones Específico
            </h4>
            <div className="space-y-2">
              {guion.objecionesClave.map((o, idx) => (
                <div key={idx} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs shadow-2xs">
                  <p className="font-bold text-amber-950">Si el prospecto dice: {o.objecion}</p>
                  <p className="text-carbon/80 mt-1 pl-2 border-l-2 border-amber-400 italic">
                    Sofía responderá: {o.respuesta}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 6. CANDADOS DE CALIDAD Y LÍNEAS ROJAS */}
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 text-xs">
            <span className="font-bold uppercase tracking-wider text-red-900 block mb-1">
              🚨 Candados de Calidad y Líneas Rojas (QA):
            </span>
            <ul className="list-disc pl-5 space-y-1 text-red-900/80">
              {guion.candadosCalidad.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Pie del Modal con Acciones */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-carbon/15 bg-crema px-6 py-3">
          <button
            type="button"
            className="rounded-lg border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon hover:bg-carbon/10 transition"
            onClick={onClose}
          >
            Cerrar vista
          </button>
          <button
            type="button"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 transition flex items-center gap-1.5"
            onClick={() => {
              onClose();
              onIniciarSombra(llamada);
            }}
          >
            <span>🎧</span> Iniciar Llamada en Modo Sombra (AirPods)
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 5. COMPONENTES AUXILIARES
// ============================================================================

function ClienteLinea({ ll, negocio }: { ll: LlamadaIA; negocio?: NegocioInfo }) {
  const neg = negocio || detectarNegocio(ll);
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-xs text-carbon/60">
      <span className="font-mono font-medium text-carbon/80">{ll.telefono}</span>
      <span>·</span>
      <span className="font-semibold text-verde-profundo">{ll.contexto?.servicio || neg.etiqueta}</span>
      {ll.contexto?.colonia && (
        <>
          <span>·</span>
          <span>📍 Col. {ll.contexto.colonia}</span>
        </>
      )}
      {ll.contexto?.metros ? (
        <>
          <span>·</span>
          <span>📏 {ll.contexto.metros} m²</span>
        </>
      ) : null}
      {ll.contexto?.monto ? (
        <>
          <span>·</span>
          <span className="font-semibold text-emerald-800">
            💲 ${Math.round(ll.contexto.monto).toLocaleString("es-MX")}
          </span>
        </>
      ) : null}
      {ll.cotizacion_id && (
        <>
          <span>·</span>
          <Link href={`/construccion/${ll.cotizacion_id}`} className="text-sauce font-semibold hover:underline">
            Cotización {ll.cotizacion_id} ↗
          </Link>
        </>
      )}
    </div>
  );
}

function FilaAgenda({
  ll,
  ocupado,
  configurado,
  ejecutar,
  onIniciarSombra,
  onVerScript,
}: {
  ll: LlamadaIA;
  ocupado: boolean;
  configurado: boolean;
  ejecutar: Ejecutar;
  onIniciarSombra: (ll: LlamadaIA) => void;
  onVerScript: (ll: LlamadaIA) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [hora, setHora] = useState(aInputLocal(ll.proximo_intento));
  const est = ESTADOS[ll.estado];
  const neg = detectarNegocio(ll);
  const seg = segmentoDe(ll);

  return (
    <div className="flex flex-wrap items-start gap-3 px-4 py-3.5 hover:bg-carbon/[0.01] transition">
      <div className="w-40 shrink-0 text-xs">
        <span className="block font-bold text-verde-profundo">
          {ll.proximo_intento ? horaLarga(ll.proximo_intento) : "Sin hora programada"}
        </span>
        <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${est.clase}`}>
          {est.label}
        </span>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-verde-profundo">{ll.nombre || "Sin nombre"}</span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.2 text-[10px] font-bold ${neg.colorBg} ${neg.colorTexto} ${neg.colorBorder}`}>
            {neg.icono} {neg.etiqueta}
          </span>
          <span className={`rounded-full border px-2 py-0.2 text-[10px] font-semibold ${COLOR_SEGMENTO[seg]}`}>
            {SEGMENTOS[seg].etiqueta}
          </span>
          {ll.es_prueba && (
            <span className="rounded bg-purple-100 border border-purple-200 px-1.5 py-0.2 text-[10px] font-bold uppercase text-purple-700">
              Prueba
            </span>
          )}
        </div>

        <ClienteLinea ll={ll} negocio={neg} />

        {ll.sugerencia?.gancho && (
          <p className="text-xs italic text-carbon/70 bg-carbon/[0.02] p-1.5 rounded border-l-2 border-sauce">
            "{ll.sugerencia.gancho}"
          </p>
        )}

        {ll.intentos > 0 && (
          <p className="text-[11px] text-carbon/50">
            Intento {ll.intentos}/{ll.max_intentos}
            {ll.resultado ? ` · Último resultado: ${RESULTADOS[ll.resultado]}` : ""}
          </p>
        )}

        {editando && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="rounded-lg border border-carbon/20 bg-white px-2 py-1 text-sm text-verde-profundo"
            />
            <button
              type="button"
              className={BTN}
              disabled={ocupado || !hora}
              onClick={() => {
                ejecutar(() => editarSugerenciaIA(ll.id, { hora: deInputLocal(hora) }), "Hora cambiada.");
                setEditando(false);
              }}
            >
              Guardar
            </button>
            <button type="button" className={BTN} onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="rounded-md border border-sauce/40 bg-sauce/15 px-2.5 py-1 text-xs font-semibold text-verde-profundo transition hover:bg-sauce/30"
          onClick={() => onVerScript(ll)}
        >
          📜 Guion
        </button>

        {ll.estado === "aprobada" && (
          <>
            <button
              type="button"
              className="rounded-md border border-emerald-600/40 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 shadow-2xs transition hover:bg-emerald-100 disabled:opacity-40"
              disabled={ocupado || !configurado}
              onClick={() => onIniciarSombra(ll)}
            >
              🎧 Modo Sombra
            </button>
            <button
              type="button"
              className={BTN}
              disabled={ocupado || !configurado}
              onClick={() => ejecutar(() => llamarAhoraIA(ll.id), "Marcando…")}
            >
              Llamar ahora
            </button>
            <button type="button" className={BTN} onClick={() => setEditando(!editando)}>
              Hora
            </button>
            <button
              type="button"
              className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
              disabled={ocupado}
              onClick={() => ejecutar(() => cancelarLlamadaIA(ll.id), "Cancelada.")}
            >
              Cancelar
            </button>
          </>
        )}

        {ll.estado === "en_curso" && (
          <>
            <button
              type="button"
              className="rounded-md border border-emerald-600/40 bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900 transition hover:bg-emerald-200"
              onClick={() => onIniciarSombra(ll)}
            >
              🎧 Escuchar en Vivo
            </button>
            <button
              type="button"
              className={BTN}
              disabled={ocupado}
              onClick={() => ejecutar(() => sincronizarLlamadaIA(ll.id), "Sincronizada con Vapi.")}
            >
              Consultar Vapi
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function FilaLlamada({
  ll,
  abierta,
  onAbrir,
  onVerScript,
}: {
  ll: LlamadaIA;
  abierta: boolean;
  onAbrir: () => void;
  onVerScript: (ll: LlamadaIA) => void;
}) {
  const est = ESTADOS[ll.estado];
  const neg = detectarNegocio(ll);
  const tieneDetalle = !!(ll.resumen || ll.transcripcion || ll.grabacion_url || ll.error);

  return (
    <>
      <tr className="border-b border-carbon/5 align-top hover:bg-carbon/[0.02]">
        <td className="px-3.5 py-3">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-verde-profundo">{ll.nombre || "Sin nombre"}</span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.2 text-[10px] font-semibold ${neg.colorBg} ${neg.colorTexto} ${neg.colorBorder}`}>
              {neg.icono} {neg.etiqueta}
            </span>
          </div>
          <ClienteLinea ll={ll} negocio={neg} />
        </td>
        <td className="px-3.5 py-3">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${est.clase}`}>{est.label}</span>
        </td>
        <td className="px-3.5 py-3 text-xs font-semibold">{ll.resultado ? RESULTADOS[ll.resultado] : "--"}</td>
        <td className="px-3.5 py-3 font-mono text-xs">
          {ll.intentos}/{ll.max_intentos}
        </td>
        <td className="px-3.5 py-3 text-xs font-medium text-emerald-800">{fecha(ll.fecha_visita)}</td>
        <td className="px-3.5 py-3">
          <div className="flex items-center gap-1">
            <button type="button" className={BTN} onClick={() => onVerScript(ll)} title="Ver guion que usó Sofía">
              📜 Guion
            </button>
            {tieneDetalle && (
              <button type="button" className={BTN} onClick={onAbrir}>
                {abierta ? "Ocultar" : "Detalle"}
              </button>
            )}
          </div>
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-carbon/10 bg-crema/40">
          <td colSpan={6} className="space-y-3 px-6 py-4 text-sm">
            {ll.error && <p className="text-red-700 font-semibold">⚠ {ll.error}</p>}
            {ll.resumen && (
              <div className="rounded-lg bg-white p-3 border border-carbon/10">
                <span className="font-bold text-verde-profundo block mb-1">Resumen de la Conversación: </span>
                <p className="text-carbon/80 text-xs leading-relaxed">{ll.resumen}</p>
              </div>
            )}
            {ll.grabacion_url && (
              <div>
                <span className="text-xs font-bold text-carbon/60 block mb-1">Audio grabado de la llamada:</span>
                <audio src={ll.grabacion_url} controls className="h-8 w-full max-w-md" />
              </div>
            )}
            {ll.transcripcion && (
              <div>
                <span className="text-xs font-bold text-carbon/60 block mb-1">Transcripción completa:</span>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-xs text-carbon/80 border border-carbon/10">
                  {ll.transcripcion}
                </pre>
              </div>
            )}
            <p className="text-xs text-carbon/40">
              {ll.duracion_seg != null && `Duración ${ll.duracion_seg}s · `}
              {ll.costo_usd != null && `Costo $${Number(ll.costo_usd).toFixed(3)} USD · `}
              Creada {fecha(ll.created_at)}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function Kpi({ titulo, valor, subtitulo }: { titulo: string; valor: string | number; subtitulo?: string }) {
  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-3.5 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-carbon/50">{titulo}</p>
      <p className="mt-1 font-titular text-2xl font-bold text-verde-profundo">{valor}</p>
      {subtitulo && <p className="text-[11px] text-carbon/40 mt-0.5">{subtitulo}</p>}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-carbon/60">{children}</th>;
}

function Campo({
  label,
  value,
  onChange,
  requerido,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  requerido?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-carbon/50">{label}</span>
      <input
        type="text"
        value={value}
        required={requerido}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/20"
      />
    </label>
  );
}
