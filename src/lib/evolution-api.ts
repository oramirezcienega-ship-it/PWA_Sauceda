import { normalizarTelefono } from "@/lib/telefono";
import { MARCA } from "@/lib/marca";

/**
 * CONFIGURACIÓN DE EVOLUTION API v2 (Línea Móvil Secundaria de Rescate)
 * Servidor Proxmox (Casa): 192.168.100.253:8085 / 100.96.122.113:8085
 */
export const EVOLUTION_CONFIG = {
  baseUrl: process.env.EVOLUTION_API_URL || "http://192.168.100.253:8085",
  apiKey: process.env.EVOLUTION_API_KEY || "sauceda_evolution_api_key_2026",
  instanceName: process.env.EVOLUTION_INSTANCE_NAME || "linea-rescate",
  // Número oficial de SAUCEDA para el enlace puente (524774654700)
  numeroOficial: MARCA.whatsapp || "524774654700",
};

export interface DatosRescateLead {
  clienteNombre?: string;
  proyecto?: string;
  tipoNegocio?: string | null;
  colonia?: string;
  expedienteId: string;
}

/**
 * 1. GENERA EL ENLACE PUENTE Y EL TEXTO DE RESCATE
 * Construye el mensaje para la línea móvil secundaria adaptado dinámicamente
 * al tipo de negocio del expediente, firmado por Paulina, con el token [EXP-XXX]
 * incrustado en el enlace wa.me hacia la línea oficial.
 */
/**
 * Genera un enlace a wa.me limpio, legible y sin códigos crudos (%20, %5B, %5D).
 * Usa '+' para los espacios y sin corchetes innecesarios para que sea estético.
 */
function armarEnlaceWhatsAppLimpio(numero: string, texto: string): string {
  const textoLimpio = texto.replace(/[\[\]]/g, "").trim();
  const query = encodeURIComponent(textoLimpio)
    .replace(/%20/g, "+")
    .replace(/%2C/g, ",")
    .replace(/%2F/g, "/");
  return `wa.me/${numero}?text=${query}`;
}

export function generarMensajeRescate(datos: DatosRescateLead): {
  textoCompleto: string;
  enlacePuente: string;
  textoPrellenadoWhatsApp: string;
} {
  const nombreLimpio = datos.clienteNombre?.trim() || "Cliente";
  const primerNombre = nombreLimpio.split(" ")[0] || "Cliente";
  const coloniaLimpia = datos.colonia?.trim() ? ` en ${datos.colonia.trim()}` : "";
  const tipo = (datos.tipoNegocio || "").toLowerCase();
  const proy = (datos.proyecto || "").toLowerCase();
  const expFolio = datos.expedienteId?.trim() || "EXP-001";

  // Enlace ultra-corto de cero fricción: wa.me/524774654700?text=Cita+EXP-XXX
  const textoPrellenadoUniversal = `Cita ${expFolio}`;
  const enlace = armarEnlaceWhatsAppLimpio(EVOLUTION_CONFIG.numeroOficial, textoPrellenadoUniversal);

  // 1. Remodelación
  if (tipo.includes("remodela") || proy.includes("remodela") || proy.includes("baño") || proy.includes("cocina")) {
    const espacio = datos.proyecto?.trim() || "remodelación";
    const cuerpoMensaje =
      `Hola ${primerNombre}, buen día... te escribe Paulina de SAUCEDA. Vi tu solicitud para la remodelación de tu ${espacio}${coloniaLimpia} 🏡\n\n` +
      `Queremos coordinar la visita de nuestro especialista técnico para tomar medidas y entregarte la propuesta formal sin costo.\n\n` +
      `Para apartar tu horario prioritario en su ruta, solo sigue estos 2 pasos rápidos:\n` +
      `1️⃣ Toca este enlace azul: 👉 ${enlace}\n` +
      `2️⃣ Presiona Enviar y nuestro sistema te mostrará de inmediato los días y horarios disponibles.\n\n` +
      `*(O si te es más cómodo, dime por aquí mismo qué día después de las 5:00 PM te queda mejor y te anoto con gusto).* ✨\n` +
      `— Paulina, tu asesora comercial en SAUCEDA`;

    return {
      textoCompleto: cuerpoMensaje,
      enlacePuente: enlace,
      textoPrellenadoWhatsApp: textoPrellenadoUniversal,
    };
  }

  // 2. Impermeabilización
  if (tipo.includes("impermea") || proy.includes("impermea") || proy.includes("gotera") || proy.includes("azotea") || proy.includes("techo")) {
    const cuerpoMensaje =
      `Hola ${primerNombre}, buen día... te escribe Paulina de SAUCEDA. Dando seguimiento a la impermeabilización de tu azotea${coloniaLimpia} 💧\n\n` +
      `Tenemos disponibilidad para que el técnico pase a medir tus metros cuadrados y revisar el estado de la losa sin costo.\n\n` +
      `Para apartar tu horario prioritario en su ruta, solo sigue estos 2 pasos rápidos:\n` +
      `1️⃣ Toca este enlace azul: 👉 ${enlace}\n` +
      `2️⃣ Presiona Enviar y nuestro sistema te mostrará de inmediato los días y horarios disponibles.\n\n` +
      `*(O si te es más cómodo, dime por aquí mismo qué día después de las 5:00 PM te queda mejor y te anoto con gusto).* ✨\n` +
      `— Paulina, tu asesora comercial en SAUCEDA`;

    return {
      textoCompleto: cuerpoMensaje,
      enlacePuente: enlace,
      textoPrellenadoWhatsApp: textoPrellenadoUniversal,
    };
  }

  // 3. Herrería
  if (tipo.includes("herreria") || proy.includes("herreria") || proy.includes("porton") || proy.includes("proteccion") || proy.includes("barandal")) {
    const cuerpoMensaje =
      `Hola ${primerNombre}, buen día... te escribe Paulina de SAUCEDA. Dando seguimiento a tu proyecto de herrería (portón/protecciones/estructura)${coloniaLimpia} ⚒️\n\n` +
      `Queremos coordinar la toma de medidas en sitio sin compromiso con nuestro maestro herrero.\n\n` +
      `Para apartar tu horario prioritario en su ruta, solo sigue estos 2 pasos rápidos:\n` +
      `1️⃣ Toca este enlace azul: 👉 ${enlace}\n` +
      `2️⃣ Presiona Enviar y nuestro sistema te mostrará de inmediato los días y horarios disponibles.\n\n` +
      `*(O si te es más cómodo, dime por aquí mismo qué día después de las 5:00 PM te queda mejor y te anoto con gusto).* ✨\n` +
      `— Paulina, tu asesora comercial en SAUCEDA`;

    return {
      textoCompleto: cuerpoMensaje,
      enlacePuente: enlace,
      textoPrellenadoWhatsApp: textoPrellenadoUniversal,
    };
  }

  // 4. Piso Estampado
  if (tipo.includes("estampado") || proy.includes("estampado")) {
    const cuerpoMensaje =
      `Hola ${primerNombre}, buen día... te escribe Paulina de SAUCEDA. Para tu proyecto de piso estampado${coloniaLimpia} 🧱\n\n` +
      `Nuestro especialista puede visitarte para validar el área y mostrarte el muestrario físico de texturas y colores sin costo.\n\n` +
      `Para apartar tu horario prioritario en su ruta, solo sigue estos 2 pasos rápidos:\n` +
      `1️⃣ Toca este enlace azul: 👉 ${enlace}\n` +
      `2️⃣ Presiona Enviar y nuestro sistema te mostrará de inmediato los días y horarios disponibles.\n\n` +
      `*(O si te es más cómodo, dime por aquí mismo qué día después de las 5:00 PM te queda mejor y te anoto con gusto).* ✨\n` +
      `— Paulina, tu asesora comercial en SAUCEDA`;

    return {
      textoCompleto: cuerpoMensaje,
      enlacePuente: enlace,
      textoPrellenadoWhatsApp: textoPrellenadoUniversal,
    };
  }

  // 5. Mantenimiento de Cisternas / Tinacos
  if (
    tipo.includes("cisterna") ||
    tipo.includes("tinaco") ||
    proy.includes("cisterna") ||
    proy.includes("tinaco") ||
    proy.includes("aljibe")
  ) {
    const cuerpoMensaje =
      `Hola ${primerNombre}, buen día... te escribe Paulina de SAUCEDA. Para el mantenimiento y lavado de tu cisterna/aljibe o tinaco${coloniaLimpia} 🚰\n\n` +
      `Podemos agendar la visita de diagnóstico y servicio con nuestro técnico de fontanería.\n\n` +
      `Para apartar tu horario prioritario en su ruta, solo sigue estos 2 pasos rápidos:\n` +
      `1️⃣ Toca este enlace azul: 👉 ${enlace}\n` +
      `2️⃣ Presiona Enviar y nuestro sistema te mostrará de inmediato los días y horarios disponibles.\n\n` +
      `*(O si te es más cómodo, dime por aquí mismo qué día te queda mejor y te anoto con gusto).* ✨\n` +
      `— Paulina, tu asesora comercial en SAUCEDA`;

    return {
      textoCompleto: cuerpoMensaje,
      enlacePuente: enlace,
      textoPrellenadoWhatsApp: textoPrellenadoUniversal,
    };
  }

  // 6. Bienes Raíces / Traspaso / Compra Directa / Asesoría de Compra / Trámite Infonavit
  if (
    tipo === "traspaso_compra" ||
    tipo === "solo_tramite" ||
    tipo === "promocion_venta" ||
    tipo.includes("bienes_raices") ||
    tipo.includes("inmobiliaria") ||
    proy.includes("compra") ||
    proy.includes("casa") ||
    proy.includes("asesoría") ||
    proy.includes("asesoria") ||
    proy.includes("traspaso") ||
    proy.includes("infonavit") ||
    proy.includes("tramite") ||
    proy.includes("trámite")
  ) {
    const cuerpoMensaje =
      `Hola ${primerNombre}, buen día... te escribe Paulina de SAUCEDA. Dando seguimiento a la asesoría para la compra / trámite de tu casa${coloniaLimpia} 🏠\n\n` +
      `Nuestro asesor patrimonial puede coordinar la sesión para revisar tu expediente y opciones disponibles sin costo.\n\n` +
      `Para apartar tu horario de atención, solo sigue estos 2 pasos rápidos:\n` +
      `1️⃣ Toca este enlace azul: 👉 ${enlace}\n` +
      `2️⃣ Presiona Enviar y nuestro sistema te mostrará de inmediato los días y horarios disponibles.\n\n` +
      `*(O si te es más cómodo, dime por aquí mismo si te queda mejor por la mañana o por la tarde).* ✨\n` +
      `— Paulina, tu asesora comercial en SAUCEDA`;

    return {
      textoCompleto: cuerpoMensaje,
      enlacePuente: enlace,
      textoPrellenadoWhatsApp: textoPrellenadoUniversal,
    };
  }

  // 7. Fallback general para otros servicios
  const proyectoGenerico = datos.proyecto?.trim() || "tu proyecto";
  const cuerpoMensaje =
    `Hola ${primerNombre}, buen día... te escribe Paulina de SAUCEDA. Dando seguimiento a ${proyectoGenerico}${coloniaLimpia} 🏡\n\n` +
    `Nos gustaría coordinar tu atención con nuestro equipo para brindarte la propuesta sin costo.\n\n` +
    `Para apartar tu horario, solo sigue estos 2 pasos rápidos:\n` +
    `1️⃣ Toca este enlace azul: 👉 ${enlace}\n` +
    `2️⃣ Presiona Enviar y nuestro sistema te mostrará de inmediato los días y horarios disponibles.\n\n` +
    `*(O si te es más cómodo, dime por aquí mismo qué día te queda mejor y te anoto con gusto).* ✨\n` +
    `— Paulina, tu asesora comercial en SAUCEDA`;

  return {
    textoCompleto: cuerpoMensaje,
    enlacePuente: enlace,
    textoPrellenadoWhatsApp: textoPrellenadoUniversal,
  };
}

/**
 * 2. CONSULTA EL ESTADO DE CONEXIÓN DE LA INSTANCIA DE EVOLUTION API
 */
export async function consultarEstadoEvolution(): Promise<{
  online: boolean;
  estado: "open" | "connecting" | "close" | "desconectado" | "error";
  mensaje: string;
}> {
  try {
    const url = `${EVOLUTION_CONFIG.baseUrl}/instance/connectionState/${EVOLUTION_CONFIG.instanceName}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: EVOLUTION_CONFIG.apiKey,
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return {
        online: false,
        estado: "desconectado",
        mensaje: `Instancia '${EVOLUTION_CONFIG.instanceName}' no responde (Status ${res.status}).`,
      };
    }

    const data = await res.json();
    const state = data?.instance?.state || data?.state || "close";

    if (state === "open") {
      return {
        online: true,
        estado: "open",
        mensaje: "Línea secundaria conectada y lista para envíos.",
      };
    }

    return {
      online: false,
      estado: state,
      mensaje: `Instancia en estado '${state}'. Escanea el código QR en Proxmox si está desconectada.`,
    };
  } catch (err: any) {
    return {
      online: false,
      estado: "error",
      mensaje: `No se pudo conectar a Evolution API en ${EVOLUTION_CONFIG.baseUrl}: ${err.message}`,
    };
  }
}

/**
 * 3. ENVÍA MENSAJE DE TEXTO MEDIANTE EVOLUTION API v2 (Línea Móvil Secundaria)
 */
export async function enviarMensajeTextoEvolution(
  telefonoDestino: string,
  mensaje: string
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const tel = normalizarTelefono(telefonoDestino);
    if (!tel) {
      return { ok: false, error: "Teléfono destino inválido." };
    }

    // Formatear a formato esperado por WhatsApp en México (521XXXXXXXXXX si tiene 12 dígitos o 52XXXXXXXXXX)
    const numeroWhatsApp = tel.startsWith("52") && tel.length === 12 && !tel.startsWith("521")
      ? `521${tel.slice(2)}`
      : tel;

    const url = `${EVOLUTION_CONFIG.baseUrl}/message/sendText/${EVOLUTION_CONFIG.instanceName}`;
    const payload = {
      number: numeroWhatsApp,
      text: mensaje,
      options: {
        delay: 1200,
        presence: "composing",
        linkPreview: false,
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_CONFIG.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        ok: false,
        error: `Error de Evolution API (Status ${res.status}): ${errText}`,
      };
    }

    const data = await res.json();
    const msgId = data?.key?.id || data?.id;

    return {
      ok: true,
      messageId: msgId,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: `Fallo al enviar por Evolution API: ${err.message}`,
    };
  }
}
