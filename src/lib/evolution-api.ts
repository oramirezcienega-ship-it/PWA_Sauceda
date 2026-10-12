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
  return `https://wa.me/${numero}?text=${query}`;
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

  // 1. Remodelación
  if (tipo.includes("remodela") || proy.includes("remodela") || proy.includes("baño") || proy.includes("cocina")) {
    const espacio = datos.proyecto?.trim() || "remodelación";
    const textoPrellenado = `Hola Paulina, revise mi cita de ${espacio} ${expFolio}`;
    const enlace = armarEnlaceWhatsAppLimpio(EVOLUTION_CONFIG.numeroOficial, textoPrellenado);

    const cuerpoMensaje =
      `Hola ${primerNombre}, buen día... vi que nos solicitaste información para la remodelación de tu ${espacio}${coloniaLimpia} y queremos coordinar la visita de levantamiento con nuestro especialista técnico para entregarte la propuesta formal sin costo.\n\n` +
      `Para coordinar tu horario y apartar tu espacio prioritario en su ruta, entra a nuestro canal oficial por este enlace directo:\n` +
      `👉 ${enlace}\n\n` +
      `¡Quedo a tus órdenes! 🏡\n— Paulina, tu asesora comercial en SAUCEDA`;

    return {
      textoCompleto: cuerpoMensaje,
      enlacePuente: enlace,
      textoPrellenadoWhatsApp: textoPrellenado,
    };
  }

  // 2. Impermeabilización
  if (tipo.includes("impermea") || proy.includes("impermea") || proy.includes("gotera") || proy.includes("azotea") || proy.includes("techo")) {
    const textoPrellenado = `Hola Paulina, revise mi cita de impermeabilizacion ${expFolio}`;
    const enlace = armarEnlaceWhatsAppLimpio(EVOLUTION_CONFIG.numeroOficial, textoPrellenado);

    const cuerpoMensaje =
      `Hola ${primerNombre}, buen día... dando seguimiento a la impermeabilización de tu azotea${coloniaLimpia}, tenemos disponibilidad para que el técnico pase a medir tus metros cuadrados y revisar el estado de la losa sin costo.\n\n` +
      `Para coordinar tu horario de visita, entra a nuestro canal oficial por este enlace directo:\n` +
      `👉 ${enlace}\n\n` +
      `¡Seguimos a tus órdenes! 💧\n— Paulina, tu asesora comercial en SAUCEDA`;

    return {
      textoCompleto: cuerpoMensaje,
      enlacePuente: enlace,
      textoPrellenadoWhatsApp: textoPrellenado,
    };
  }

  // 3. Herrería
  if (tipo.includes("herreria") || proy.includes("herreria") || proy.includes("porton") || proy.includes("proteccion") || proy.includes("barandal")) {
    const textoPrellenado = `Hola Paulina, revise mi cita de herreria ${expFolio}`;
    const enlace = armarEnlaceWhatsAppLimpio(EVOLUTION_CONFIG.numeroOficial, textoPrellenado);

    const cuerpoMensaje =
      `Hola ${primerNombre}, buen día... para tu proyecto de herrería (portón/protecciones/estructura)${coloniaLimpia}, queremos coordinar la toma de medidas en sitio sin compromiso con nuestro maestro herrero.\n\n` +
      `Para elegir el horario que mejor te acomode, continúa por nuestro canal oficial aquí:\n` +
      `👉 ${enlace}\n\n` +
      `¡Con gusto te atendemos! ⚒️\n— Paulina, tu asesora comercial en SAUCEDA`;

    return {
      textoCompleto: cuerpoMensaje,
      enlacePuente: enlace,
      textoPrellenadoWhatsApp: textoPrellenado,
    };
  }

  // 4. Piso Estampado
  if (tipo.includes("estampado") || proy.includes("estampado")) {
    const textoPrellenado = `Hola Paulina, revise mi cita de piso estampado ${expFolio}`;
    const enlace = armarEnlaceWhatsAppLimpio(EVOLUTION_CONFIG.numeroOficial, textoPrellenado);

    const cuerpoMensaje =
      `Hola ${primerNombre}, buen día... para tu proyecto de piso estampado${coloniaLimpia}, nuestro especialista puede visitarte para validar el área y mostrarte el muestrario físico de texturas y colores.\n\n` +
      `Para agendar tu visita, entra a nuestro canal oficial por este enlace:\n` +
      `👉 ${enlace}\n\n` +
      `¡A tus órdenes! 🧱\n— Paulina, tu asesora comercial en SAUCEDA`;

    return {
      textoCompleto: cuerpoMensaje,
      enlacePuente: enlace,
      textoPrellenadoWhatsApp: textoPrellenado,
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
    const textoPrellenado = `Hola Paulina, revise el servicio de cisterna ${expFolio}`;
    const enlace = armarEnlaceWhatsAppLimpio(EVOLUTION_CONFIG.numeroOficial, textoPrellenado);

    const cuerpoMensaje =
      `Hola ${primerNombre}, buen día... para el mantenimiento y lavado de tu cisterna/aljibe o tinaco${coloniaLimpia}, podemos agendar la visita de diagnóstico y servicio con nuestro técnico de fontanería.\n\n` +
      `Por favor continúa por nuestro canal oficial para coordinar el horario:\n` +
      `👉 ${enlace}\n\n` +
      `¡Quedamos al pendiente! 🚰\n— Paulina, tu asesora comercial en SAUCEDA`;

    return {
      textoCompleto: cuerpoMensaje,
      enlacePuente: enlace,
      textoPrellenadoWhatsApp: textoPrellenado,
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
    const textoPrellenado = `Hola Paulina, revise mi asesoria de casa ${expFolio}`;
    const enlace = armarEnlaceWhatsAppLimpio(EVOLUTION_CONFIG.numeroOficial, textoPrellenado);

    const cuerpoMensaje =
      `Hola ${primerNombre}, buen día... dando seguimiento a la asesoría para la adquisición / trámite de tu casa${coloniaLimpia}, nuestro asesor patrimonial puede coordinar la sesión para revisar tu expediente y opciones disponibles sin costo.\n\n` +
      `Para coordinar tu horario de atención, entra a nuestro canal oficial por este enlace directo:\n` +
      `👉 ${enlace}\n\n` +
      `¡Estamos para apoyarte! 🏠\n— Paulina, tu asesora comercial en SAUCEDA`;

    return {
      textoCompleto: cuerpoMensaje,
      enlacePuente: enlace,
      textoPrellenadoWhatsApp: textoPrellenado,
    };
  }

  // 7. Fallback general para otros servicios
  const proyectoGenerico = datos.proyecto?.trim() || "tu proyecto";
  const textoPrellenado = `Hola Paulina, revise mi cita ${expFolio}`;
  const enlace = armarEnlaceWhatsAppLimpio(EVOLUTION_CONFIG.numeroOficial, textoPrellenado);

  const cuerpoMensaje =
    `Hola ${primerNombre}, buen día... dando seguimiento a ${proyectoGenerico}${coloniaLimpia}, nos gustaría coordinar tu atención con nuestro equipo para brindarte la propuesta sin costo.\n\n` +
    `Para coordinar tu horario prioritario, entra a nuestro canal oficial por este enlace directo:\n` +
    `👉 ${enlace}\n\n` +
    `¡Con gusto te atendemos! 🏡\n— Paulina, tu asesora comercial en SAUCEDA`;

  return {
    textoCompleto: cuerpoMensaje,
    enlacePuente: enlace,
    textoPrellenadoWhatsApp: textoPrellenado,
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
