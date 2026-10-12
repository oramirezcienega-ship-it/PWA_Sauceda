import { normalizarTelefono } from "@/lib/telefono";
import { MARCA } from "@/lib/marca";

/**
 * CONFIGURACIÓN DE EVOLUTION API v2 (Línea Móvil Secundaria de Rescate)
 * Servidor Proxmox (Casa): 192.168.100.253:8080 / 100.96.122.113:8080
 */
export const EVOLUTION_CONFIG = {
  baseUrl: process.env.EVOLUTION_API_URL || "http://192.168.100.253:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "sauceda_evolution_api_key_2026",
  instanceName: process.env.EVOLUTION_INSTANCE_NAME || "linea-rescate",
  // Número oficial de SAUCEDA para el enlace puente (524774654700)
  numeroOficial: MARCA.whatsapp || "524774654700",
};

export interface DatosRescateLead {
  clienteNombre?: string;
  proyecto?: string;
  colonia?: string;
  expedienteId: string;
}

/**
 * 1. GENERA EL ENLACE PUENTE Y EL TEXTO DE RESCATE
 * Construye el mensaje para la línea móvil secundaria con el token [EXP-XXX]
 * incrustado en el enlace wa.me hacia la línea oficial.
 */
export function generarMensajeRescate(datos: DatosRescateLead): {
  textoCompleto: string;
  enlacePuente: string;
  textoPrellenadoWhatsApp: string;
} {
  const nombreLimpio = datos.clienteNombre?.trim() || "Cliente";
  const primerNombre = nombreLimpio.split(" ")[0] || "Cliente";
  const proyectoLimpio = datos.proyecto?.trim() || "remodelación";
  const coloniaLimpia = datos.colonia?.trim() ? ` en ${datos.colonia.trim()}` : "";

  // Mensaje que el cliente enviará al tocar el enlace puente
  const textoPrellenadoWhatsApp = `Hola Sofía, revisé la cita de mi proyecto de ${proyectoLimpio} [${datos.expedienteId}]`;

  // Enlace inteligente wa.me con el token
  const enlacePuente = `https://wa.me/${EVOLUTION_CONFIG.numeroOficial}?text=${encodeURIComponent(
    textoPrellenadoWhatsApp
  )}`;

  // Mensaje saliente desde la línea móvil secundaria
  const textoCompleto =
    `Hola ${primerNombre}, te escribo del equipo de SAUCEDA Construye para dar seguimiento a tu proyecto de ${proyectoLimpio}${coloniaLimpia}.\n\n` +
    `Para revisar tus opciones de horarios vespertinos y agendar la visita de nuestro Especialista Técnico sin costo, entra a nuestro canal oficial por este enlace directo:\n` +
    `👉 ${enlacePuente}\n\n` +
    `¡Te atendemos de inmediato! 🏡`;

  return {
    textoCompleto,
    enlacePuente,
    textoPrellenadoWhatsApp,
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
        linkPreview: true,
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
