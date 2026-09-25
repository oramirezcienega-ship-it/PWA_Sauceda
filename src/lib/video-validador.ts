/**
 * Validador y Especificaciones Técnicas de Video para Redes Sociales y Ads
 * Cubre: Instagram Reels, Instagram Feed, Facebook Video/Reels, TikTok y WhatsApp.
 * 
 * Permite prevalidar en el cliente (HTML5) y en el servidor antes de programar o publicar,
 * evitando que Meta Graph API o TikTok Content API rechacen el video por duración,
 * relación de aspecto, peso o formato incompatible.
 */

export interface MetadatosVideo {
  duracionSegundos: number;
  ancho: number;
  alto: number;
  aspectRatio: number; // ancho / alto
  aspectRatioTexto: string; // "9:16 (Vertical)", "1:1 (Cuadrado)", "16:9 (Horizontal)", etc.
  pesoBytes: number;
  pesoMb: number;
  formato: string; // "mp4", "mov", "webm", etc.
  tipoMime: string;
  nombreArchivo: string;
}

export type NivelValidacion = "valido" | "advertencia" | "error";

export interface ItemValidacion {
  criterio: string; // "Duración", "Relación de Aspecto", "Formato de Archivo", "Peso", "Resolución"
  valorDetectado: string;
  requisitoEsperado: string;
  estado: NivelValidacion;
  mensaje: string;
}

export interface ReglasPlataformaVideo {
  nombrePlataforma: string;
  formatoContenedor: string[]; // ["mp4", "mov"]
  duracionMinimaSeg: number;
  duracionMaximaSeg: number;
  duracionRecomendada: string;
  pesoMaximoMb: number;
  aspectRatioRequerido: "9:16" | "1:1" | "4:5" | "16:9" | "flexible";
  aspectRatioMin: number;
  aspectRatioMax: number;
  resolucionMinima: { ancho: number; alto: number };
  resolucionRecomendada: string;
  codecsRequeridos: string;
}

export interface ResultadoPrevalidacionVideo {
  esValido: boolean; // true si no tiene ningún error bloqueante
  puedePublicar: boolean;
  alertasCriticas: string[];
  advertencias: string[];
  items: ItemValidacion[];
  metadatos: MetadatosVideo;
  sugerenciaOptimizacion?: string;
  formatoRecomendado?: "reel" | "video";
}

/**
 * Matriz de especificaciones oficiales de video para cada plataforma y formato.
 */
export const REGLAS_VIDEO_PLATAFORMAS: Record<string, ReglasPlataformaVideo> = {
  instagram_reel: {
    nombrePlataforma: "Instagram Reels",
    formatoContenedor: ["mp4", "mov"],
    duracionMinimaSeg: 3, // Meta Graph API rechaza con error 2207082 si dura < 3s
    duracionMaximaSeg: 90, // Reels orgánico y Ads estándar
    duracionRecomendada: "15 a 60 segundos",
    pesoMaximoMb: 100, // Recomendado para carga web en CRM
    aspectRatioRequerido: "9:16",
    aspectRatioMin: 0.54,
    aspectRatioMax: 0.60,
    resolucionMinima: { ancho: 540, alto: 960 },
    resolucionRecomendada: "1080 x 1920 px (9:16 Vertical)",
    codecsRequeridos: "H.264 o HEVC / Audio AAC estéreo",
  },
  instagram_post: {
    nombrePlataforma: "Instagram Feed Video",
    formatoContenedor: ["mp4", "mov"],
    duracionMinimaSeg: 3,
    duracionMaximaSeg: 3600, // Hasta 60 min en Feed
    duracionRecomendada: "15 a 60 segundos",
    pesoMaximoMb: 100,
    aspectRatioRequerido: "flexible", // 1:1 (cuadrado) o 4:5 (vertical feed)
    aspectRatioMin: 0.78, // 4:5 ~ 0.8
    aspectRatioMax: 1.92, // 16:9 ~ 1.77, hasta 1.91
    resolucionMinima: { ancho: 600, alto: 600 },
    resolucionRecomendada: "1080 x 1080 px (1:1) o 1080 x 1350 px (4:5)",
    codecsRequeridos: "H.264 / AAC",
  },
  tiktok: {
    nombrePlataforma: "TikTok Video / Ads",
    formatoContenedor: ["mp4", "mov", "webm"],
    duracionMinimaSeg: 3, // TikTok API rechaza estrictamente videos < 3s
    duracionMaximaSeg: 600, // 10 min máx orgánico (Ads recomiendan 9-60s)
    duracionRecomendada: "15 a 45 segundos",
    pesoMaximoMb: 100,
    aspectRatioRequerido: "9:16",
    aspectRatioMin: 0.54,
    aspectRatioMax: 0.60,
    resolucionMinima: { ancho: 540, alto: 960 },
    resolucionRecomendada: "1080 x 1920 px (9:16 Vertical)",
    codecsRequeridos: "H.264 o H.265 / Audio AAC",
  },
  facebook: {
    nombrePlataforma: "Facebook Video / Reels",
    formatoContenedor: ["mp4", "mov"],
    duracionMinimaSeg: 3,
    duracionMaximaSeg: 14400, // Hasta 240 min
    duracionRecomendada: "15 a 90 segundos",
    pesoMaximoMb: 150,
    aspectRatioRequerido: "flexible", // Acepta 9:16 (Reels), 1:1, 16:9
    aspectRatioMin: 0.54,
    aspectRatioMax: 1.92,
    resolucionMinima: { ancho: 540, alto: 540 },
    resolucionRecomendada: "1080 x 1920 px (Reels) o 1080 x 1080 px (Feed)",
    codecsRequeridos: "H.264 / AAC",
  },
  whatsapp: {
    nombrePlataforma: "WhatsApp Difusión",
    formatoContenedor: ["mp4", "3gp"],
    duracionMinimaSeg: 1,
    duracionMaximaSeg: 180,
    duracionRecomendada: "10 a 45 segundos",
    pesoMaximoMb: 16, // WhatsApp Cloud API rechaza videos mayores a 16MB
    aspectRatioRequerido: "flexible",
    aspectRatioMin: 0.54,
    aspectRatioMax: 1.92,
    resolucionMinima: { ancho: 480, alto: 480 },
    resolucionRecomendada: "720 x 1280 px o 720 x 720 px (< 16 MB)",
    codecsRequeridos: "H.264 / AAC",
  },
};

/**
 * Resuelve la regla de validación adecuada según plataforma y tipo de formato.
 */
export function obtenerReglaPlataforma(
  plataforma: string,
  tipoFormato?: string
): ReglasPlataformaVideo {
  if (plataforma === "tiktok") {
    return REGLAS_VIDEO_PLATAFORMAS.tiktok;
  }
  if (plataforma === "instagram") {
    if (tipoFormato === "reel" || tipoFormato === "video") {
      return REGLAS_VIDEO_PLATAFORMAS.instagram_reel;
    }
    return REGLAS_VIDEO_PLATAFORMAS.instagram_post;
  }
  if (plataforma === "whatsapp") {
    return REGLAS_VIDEO_PLATAFORMAS.whatsapp;
  }
  return REGLAS_VIDEO_PLATAFORMAS.facebook;
}

/**
 * Extrae metadatos reales de un archivo de video en el navegador (lado cliente HTML5)
 * leyendo dimensiones, duración y peso sin subir nada al servidor aún.
 */
export function extraerMetadatosVideoCliente(file: File): Promise<MetadatosVideo> {
  return new Promise((resolve, reject) => {
    if (!file) {
      return reject(new Error("No se proporcionó ningún archivo de video."));
    }

    const videoEl = document.createElement("video");
    videoEl.preload = "metadata";
    videoEl.muted = true;
    videoEl.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    videoEl.src = objectUrl;

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          "Tiempo de espera agotado al leer metadatos del video. El archivo puede estar dañado o en un formato no soportado por el navegador."
        )
      );
    }, 10000);

    videoEl.onloadedmetadata = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);

      const ancho = videoEl.videoWidth || 0;
      const alto = videoEl.videoHeight || 0;
      const duracion = videoEl.duration || 0;
      const ratio = alto > 0 ? ancho / alto : 1;

      let ratioTexto = "Personalizado";
      if (ratio >= 0.54 && ratio <= 0.60) {
        ratioTexto = "9:16 (Vertical)";
      } else if (ratio >= 0.75 && ratio <= 0.85) {
        ratioTexto = "4:5 (Vertical Feed)";
      } else if (ratio >= 0.95 && ratio <= 1.05) {
        ratioTexto = "1:1 (Cuadrado)";
      } else if (ratio >= 1.70 && ratio <= 1.85) {
        ratioTexto = "16:9 (Horizontal)";
      }

      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const pesoMb = Math.round((file.size / (1024 * 1024)) * 100) / 100;

      resolve({
        duracionSegundos: Math.round(duracion * 10) / 10,
        ancho,
        alto,
        aspectRatio: Math.round(ratio * 1000) / 1000,
        aspectRatioTexto: ratioTexto,
        pesoBytes: file.size,
        pesoMb,
        formato: ext,
        tipoMime: file.type || `video/${ext}`,
        nombreArchivo: file.name,
      });
    };

    videoEl.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          "No fue posible decodificar el video. Verifica que sea un archivo MP4 o MOV válido codificado en H.264."
        )
      );
    };
  });
}

/**
 * Pre-valida exhaustivamente los metadatos de un video contra los requisitos
 * de la plataforma y formato seleccionados antes de permitir la programación.
 */
export function prevalidarVideoParaPlataforma(
  metadatos: MetadatosVideo,
  plataforma: string,
  tipoFormato?: string
): ResultadoPrevalidacionVideo {
  const regla = obtenerReglaPlataforma(plataforma, tipoFormato);
  const items: ItemValidacion[] = [];
  const alertasCriticas: string[] = [];
  const advertencias: string[] = [];

  // 1. Duración
  const seg = metadatos.duracionSegundos;
  if (seg < regla.duracionMinimaSeg) {
    const msg = `El video dura solo ${seg}s. ${regla.nombrePlataforma} exige mínimo ${regla.duracionMinimaSeg} segundos o será rechazado por la API.`;
    alertasCriticas.push(msg);
    items.push({
      criterio: "Duración",
      valorDetectado: `${seg} seg`,
      requisitoEsperado: `Mínimo ${regla.duracionMinimaSeg}s (Rec: ${regla.duracionRecomendada})`,
      estado: "error",
      mensaje: msg,
    });
  } else if (seg > regla.duracionMaximaSeg) {
    const msg = `El video dura ${seg}s (excede el máximo de ${regla.duracionMaximaSeg}s para ${regla.nombrePlataforma}).`;
    alertasCriticas.push(msg);
    items.push({
      criterio: "Duración",
      valorDetectado: `${seg} seg`,
      requisitoEsperado: `Máximo ${regla.duracionMaximaSeg}s (Rec: ${regla.duracionRecomendada})`,
      estado: "error",
      mensaje: msg,
    });
  } else {
    items.push({
      criterio: "Duración",
      valorDetectado: `${seg} seg`,
      requisitoEsperado: `${regla.duracionMinimaSeg}s a ${regla.duracionMaximaSeg}s (${regla.duracionRecomendada})`,
      estado: "valido",
      mensaje: `Duración adecuada para ${regla.nombrePlataforma}.`,
    });
  }

  // 2. Relación de Aspecto (Aspect Ratio)
  const esVertical916 = metadatos.aspectRatio >= 0.54 && metadatos.aspectRatio <= 0.60;
  const esCuadrado11 = metadatos.aspectRatio >= 0.95 && metadatos.aspectRatio <= 1.05;
  const esHorizontal169 = metadatos.aspectRatio >= 1.70 && metadatos.aspectRatio <= 1.85;

  if (regla.aspectRatioRequerido === "9:16") {
    if (esVertical916) {
      items.push({
        criterio: "Relación de Aspecto",
        valorDetectado: `${metadatos.ancho} x ${metadatos.alto} (${metadatos.aspectRatioTexto})`,
        requisitoEsperado: "9:16 Vertical (1080 x 1920 px)",
        estado: "valido",
        mensaje: "Formato vertical 9:16 perfecto para Reels y TikTok.",
      });
    } else {
      const msg = `${regla.nombrePlataforma} está optimizado para video vertical 9:16. Tu video es ${metadatos.aspectRatioTexto} (${metadatos.ancho}x${metadatos.alto}). Podría mostrar barras negras laterales o recortarse en los móviles de los clientes.`;
      advertencias.push(msg);
      items.push({
        criterio: "Relación de Aspecto",
        valorDetectado: `${metadatos.ancho} x ${metadatos.alto} (${metadatos.aspectRatioTexto})`,
        requisitoEsperado: "9:16 Vertical (Recomendado 1080x1920)",
        estado: "advertencia",
        mensaje: msg,
      });
    }
  } else {
    // Formato flexible (Facebook, Instagram Feed)
    if (metadatos.aspectRatio < regla.aspectRatioMin || metadatos.aspectRatio > regla.aspectRatioMax) {
      const msg = `La proporción ${metadatos.aspectRatioTexto} (${metadatos.ancho}x${metadatos.alto}) está fuera del rango soportado (${regla.aspectRatioMin} a ${regla.aspectRatioMax}).`;
      advertencias.push(msg);
      items.push({
        criterio: "Relación de Aspecto",
        valorDetectado: `${metadatos.ancho} x ${metadatos.alto}`,
        requisitoEsperado: `Rango ratio ${regla.aspectRatioMin} a ${regla.aspectRatioMax}`,
        estado: "advertencia",
        mensaje: msg,
      });
    } else {
      items.push({
        criterio: "Relación de Aspecto",
        valorDetectado: `${metadatos.ancho} x ${metadatos.alto} (${metadatos.aspectRatioTexto})`,
        requisitoEsperado: regla.resolucionRecomendada,
        estado: "valido",
        mensaje: `Aspect ratio compatible con ${regla.nombrePlataforma}.`,
      });
    }
  }

  // 3. Peso / Tamaño del Archivo
  if (metadatos.pesoMb > regla.pesoMaximoMb) {
    const msg = `El archivo pesa ${metadatos.pesoMb} MB (supera el límite de ${regla.pesoMaximoMb} MB para ${regla.nombrePlataforma}).`;
    alertasCriticas.push(msg);
    items.push({
      criterio: "Tamaño de Archivo",
      valorDetectado: `${metadatos.pesoMb} MB`,
      requisitoEsperado: `Máximo ${regla.pesoMaximoMb} MB`,
      estado: "error",
      mensaje: msg,
    });
  } else if (metadatos.pesoMb > 50 && plataforma === "whatsapp") {
    const msg = `WhatsApp permite máx 16 MB. Tu video pesa ${metadatos.pesoMb} MB.`;
    alertasCriticas.push(msg);
    items.push({
      criterio: "Tamaño de Archivo",
      valorDetectado: `${metadatos.pesoMb} MB`,
      requisitoEsperado: "Máximo 16 MB para WhatsApp",
      estado: "error",
      mensaje: msg,
    });
  } else {
    items.push({
      criterio: "Tamaño de Archivo",
      valorDetectado: `${metadatos.pesoMb} MB`,
      requisitoEsperado: `Máximo ${regla.pesoMaximoMb} MB`,
      estado: "valido",
      mensaje: `Peso óptimo (${metadatos.pesoMb} MB) dentro del límite.`,
    });
  }

  // 4. Formato de Contenedor
  const extLimpia = metadatos.formato.toLowerCase();
  const esFormatoPermitido = regla.formatoContenedor.includes(extLimpia);
  if (!esFormatoPermitido) {
    const msg = `El formato .${extLimpia} no es compatible. ${regla.nombrePlataforma} requiere: ${regla.formatoContenedor.map((f) => `.${f}`).join(", ")}.`;
    alertasCriticas.push(msg);
    items.push({
      criterio: "Formato de Archivo",
      valorDetectado: `.${extLimpia.toUpperCase()}`,
      requisitoEsperado: regla.formatoContenedor.map((f) => `.${f.toUpperCase()}`).join(", "),
      estado: "error",
      mensaje: msg,
    });
  } else {
    items.push({
      criterio: "Formato de Archivo",
      valorDetectado: `.${extLimpia.toUpperCase()} (${metadatos.tipoMime})`,
      requisitoEsperado: regla.formatoContenedor.map((f) => `.${f.toUpperCase()}`).join(", "),
      estado: "valido",
      mensaje: `Formato estándar compatible con la API de ${regla.nombrePlataforma}.`,
    });
  }

  // 5. Resolución mínima
  if (metadatos.ancho < regla.resolucionMinima.ancho || metadatos.alto < regla.resolucionMinima.alto) {
    const msg = `Resolución baja: ${metadatos.ancho}x${metadatos.alto} px. Se recomienda al menos ${regla.resolucionMinima.ancho}x${regla.resolucionMinima.alto} px para evitar video borroso o pixelado en anuncios.`;
    advertencias.push(msg);
    items.push({
      criterio: "Resolución",
      valorDetectado: `${metadatos.ancho} x ${metadatos.alto} px`,
      requisitoEsperado: `Mínimo ${regla.resolucionMinima.ancho} x ${regla.resolucionMinima.alto} px`,
      estado: "advertencia",
      mensaje: msg,
    });
  } else {
    items.push({
      criterio: "Resolución",
      valorDetectado: `${metadatos.ancho} x ${metadatos.alto} px`,
      requisitoEsperado: `Mínimo ${regla.resolucionMinima.ancho} x ${regla.resolucionMinima.alto} px`,
      estado: "valido",
      mensaje: "Excelente resolución y nitidez para visualización móvil.",
    });
  }

  // Sugerencia de formato
  let formatoRecomendado: "reel" | "video" = "video";
  if (esVertical916 || plataforma === "tiktok" || (plataforma === "instagram" && seg <= 90)) {
    formatoRecomendado = "reel";
  }

  const esValido = alertasCriticas.length === 0;

  return {
    esValido,
    puedePublicar: esValido,
    alertasCriticas,
    advertencias,
    items,
    metadatos,
    formatoRecomendado,
    sugerenciaOptimizacion:
      advertencias.length > 0
        ? advertencias.join(" • ")
        : esValido
        ? "✅ El video cumple con todas las especificaciones técnicas y está listo para programarse sin riesgo de rechazo."
        : undefined,
  };
}
