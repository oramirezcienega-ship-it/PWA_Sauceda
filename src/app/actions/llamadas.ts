"use server";

import { supabaseServidor } from "@/lib/supabase/server";
import { usuarioActual, requireAdmin } from "@/lib/supabase/cliente-sesion";
import { normalizarTelefono } from "@/lib/telefono";
import { registrarInicioLlamada, actualizarLlamada } from "@/features/conmutador/service";

export interface LlamadaConmutadorApp {
  id: string;
  twilio_call_sid: string;
  cliente_telefono: string;
  prospecto_id: string | null;
  prospecto_nombre?: string;
  agente_id: string | null;
  agente_nombre?: string;
  tipo: "entrante" | "saliente";
  estado: string;
  duracion: number | null;
  grabacion_url: string | null;
  transcripcion: string | null;
  resumen_ia: string | null;
  datos_perfilados: any | null;
  created_at: string;
}

export interface ConfiguracionLlamadas {
  telefono_desvio: string;
  disponible_llamadas: boolean;
  horario_inicio: string;
  horario_fin: string;
}

/**
 * Lista todas las llamadas registradas en el conmutador con joins a prospectos y agentes.
 */
export async function listarLlamadasConmutador(): Promise<LlamadaConmutadorApp[]> {
  const sb = supabaseServidor();
  
  // 1. Obtener las llamadas
  const { data: llamadas, error: errLlamadas } = await sb
    .from("llamadas_conmutador")
    .select("*")
    .order("created_at", { ascending: false });

  if (errLlamadas) {
    console.error("Error al listar llamadas del conmutador:", errLlamadas);
    throw new Error(errLlamadas.message);
  }

  // 2. Obtener perfiles para resolver nombres de agentes en memoria
  const { data: perfiles } = await sb
    .from("perfiles")
    .select("id, nombre");
  
  const mapaAgentes = new Map((perfiles ?? []).map((p) => [p.id, p.nombre]));

  // 3. Obtener prospectos para resolver nombres de clientes en memoria
  const { data: prospectos } = await sb
    .from("prospectos")
    .select("id, nombre");
  
  const mapaProspectos = new Map((prospectos ?? []).map((pr) => [pr.id, pr.nombre]));

  // 4. Mapear la información
  return (llamadas ?? []).map((row: any) => ({
    id: row.id,
    twilio_call_sid: row.twilio_call_sid,
    cliente_telefono: row.cliente_telefono,
    prospecto_id: row.prospecto_id,
    prospecto_nombre: row.prospecto_id ? mapaProspectos.get(row.prospecto_id) || row.prospecto_id : null,
    agente_id: row.agente_id,
    agente_nombre: row.agente_id ? mapaAgentes.get(row.agente_id) || "Asesor" : null,
    tipo: row.tipo,
    estado: row.estado,
    duracion: row.duracion,
    grabacion_url: row.grabacion_url,
    transcripcion: row.transcripcion,
    resumen_ia: row.resumen_ia,
    datos_perfilados: row.datos_perfilados,
    created_at: row.created_at,
  }));
}

/**
 * Obtiene la configuración de desvío y horarios del usuario actual.
 */
export async function obtenerMiConfiguracionLlamadas(): Promise<ConfiguracionLlamadas | null> {
  const user = await usuarioActual();
  if (!user) return null;

  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("perfiles")
    .select("telefono_desvio, disponible_llamadas, horario_inicio, horario_fin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    return {
      telefono_desvio: "",
      disponible_llamadas: false,
      horario_inicio: "09:00:00",
      horario_fin: "18:00:00",
    };
  }

  return {
    telefono_desvio: data.telefono_desvio || "",
    disponible_llamadas: data.disponible_llamadas || false,
    horario_inicio: data.horario_inicio || "09:00:00",
    horario_fin: data.horario_fin || "18:00:00",
  };
}

/**
 * Guarda la configuración de desvío y horarios del usuario actual.
 */
export async function guardarMiConfiguracionLlamadas(datos: ConfiguracionLlamadas): Promise<void> {
  const user = await usuarioActual();
  if (!user) throw new Error("No autenticado");

  const sb = supabaseServidor();
  
  // Limpieza simple de formato
  const tMin = datos.telefono_desvio.trim();
  
  const { error } = await sb
    .from("perfiles")
    .update({
      telefono_desvio: tMin,
      disponible_llamadas: datos.disponible_llamadas,
      horario_inicio: datos.horario_inicio,
      horario_fin: datos.horario_fin,
    })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Obtiene la configuración de llamadas de cualquier agente (para administradores).
 */
export async function obtenerConfiguracionLlamadasAgente(agenteId: string): Promise<ConfiguracionLlamadas | null> {
  const sb = supabaseServidor();
  const { data, error } = await sb
    .from("perfiles")
    .select("telefono_desvio, disponible_llamadas, horario_inicio, horario_fin")
    .eq("id", agenteId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    telefono_desvio: data.telefono_desvio || "",
    disponible_llamadas: data.disponible_llamadas || false,
    horario_inicio: data.horario_inicio || "09:00:00",
    horario_fin: data.horario_fin || "18:00:00",
  };
}

/**
 * Guarda la configuración de llamadas de cualquier agente (para administradores).
 */
export async function guardarConfiguracionLlamadasAgente(
  agenteId: string,
  datos: ConfiguracionLlamadas
): Promise<void> {
  const sb = supabaseServidor();
  
  const { error } = await sb
    .from("perfiles")
    .update({
      telefono_desvio: datos.telefono_desvio.trim(),
      disponible_llamadas: datos.disponible_llamadas,
      horario_inicio: datos.horario_inicio,
      horario_fin: datos.horario_fin,
    })
    .eq("id", agenteId);

  if (error) {
    throw new Error(error.message);
  }
}

/** Auxiliar para obtener teléfono en formato E.164. */
function normalizarTelefonoE164(tel: string): string {
  const canon = normalizarTelefono(tel);
  if (!canon) return "";
  return "+" + canon;
}

/**
 * Inicia una llamada saliente (Click-to-Call) desde el CRM.
 * Llama primero al teléfono de desvío del agente y, al contestar, lo conecta con el prospecto.
 */
export async function iniciarLlamadaConmutador(
  telefonoCliente: string,
  prospectoId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const user = await usuarioActual();
    if (!user) return { ok: false, error: "No autenticado" };

    const sb = supabaseServidor();

    // 1. Obtener el perfil del agente/asesor actual
    const { data: agente, error: errAgente } = await sb
      .from("perfiles")
      .select("nombre, telefono_desvio, telefono")
      .eq("id", user.id)
      .maybeSingle();

    if (errAgente || !agente) {
      return { ok: false, error: "No se encontró el perfil del asesor." };
    }

    const destinoAgente = agente.telefono_desvio || agente.telefono;
    if (!destinoAgente) {
      return {
        ok: false,
        error: "No tienes un teléfono de desvío configurado para recibir llamadas.",
      };
    }

    // 2. Setup de Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const rawFrom = process.env.TWILIO_PHONE_NUMBER || "+524774654700";
    const fromCanon = normalizarTelefono(rawFrom);
    const fromNumber = fromCanon.startsWith("+") ? fromCanon : `+${fromCanon}`;

    if (!accountSid || !authToken) {
      return {
        ok: false,
        error: "El conmutador no está configurado (faltan variables de entorno de Twilio).",
      };
    }

    // 3. Normalizar teléfonos
    const toAgente = normalizarTelefonoE164(destinoAgente);
    const toCliente = normalizarTelefonoE164(telefonoCliente);

    if (!toAgente) {
      return { ok: false, error: "Teléfono del asesor no es válido." };
    }
    if (!toCliente) {
      return { ok: false, error: "Teléfono del cliente/prospecto no es válido." };
    }

    // 4. Construir URL de TwiML
    const queryParams = new URLSearchParams();
    queryParams.append("cliente", toCliente);
    if (prospectoId) {
      queryParams.append("prospectoId", prospectoId);
    }
    queryParams.append("agenteId", user.id);

    const baseUrl = process.env.SITE_URL || "https://app.saucedamx.com";
    const twimlUrl = `${baseUrl}/api/conmutador/outbound-twiml?${queryParams.toString()}`;

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const params = new URLSearchParams();
    params.append("To", toAgente);
    params.append("From", fromNumber);
    params.append("Url", twimlUrl);
    params.append("StatusCallback", `${baseUrl}/api/conmutador/webhook-evento`);

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    const detalle = await res.json();

    if (!res.ok) {
      console.error("Twilio outbound call failed:", res.status, detalle);
      return {
        ok: false,
        error: detalle.message || `Error de Twilio: ${res.status}`,
      };
    }

    // 5. Registrar e iniciar llamada en la BD
    await registrarInicioLlamada({
      twilioCallSid: detalle.sid,
      clienteTelefono: toCliente,
      tipo: "saliente",
      estado: "queued",
    });

    // Asociar al agente
    await actualizarLlamada(detalle.sid, {
      estado: "queued",
      agenteId: user.id,
    });

    return { ok: true };
  } catch (err) {
    console.error("Error al iniciar llamada conmutador:", err);
    return { ok: false, error: "Error de red al iniciar la llamada." };
  }
}

/**
 * Obtiene todas las llamadas registradas del conmutador para un teléfono específico (últimos 10 dígitos).
 */
export async function obtenerLlamadasPorTelefono(
  telefono: string
): Promise<LlamadaConmutadorApp[]> {
  const sb = supabaseServidor();
  const digitos = (telefono || "").replace(/\D/g, "").slice(-10);
  if (!digitos) return [];

  // 1. Obtener todas las llamadas
  const { data: llamadas, error: errLlamadas } = await sb
    .from("llamadas_conmutador")
    .select("*")
    .order("created_at", { ascending: false });

  if (errLlamadas) {
    console.error("Error al filtrar llamadas por teléfono:", errLlamadas);
    throw new Error(errLlamadas.message);
  }

  // 2. Filtrar llamadas donde cliente_telefono coincida con los últimos 10 dígitos
  const llamadasFiltradas = (llamadas ?? []).filter((row: any) => {
    const rowDigitos = (row.cliente_telefono || "").replace(/\D/g, "").slice(-10);
    return rowDigitos === digitos;
  });

  if (llamadasFiltradas.length === 0) return [];

  // 3. Obtener perfiles para resolver nombres de agentes en memoria
  const { data: perfiles } = await sb
    .from("perfiles")
    .select("id, nombre");
  
  const mapaAgentes = new Map((perfiles ?? []).map((p) => [p.id, p.nombre]));

  // 4. Obtener prospectos para resolver nombres de clientes en memoria
  const { data: prospectos } = await sb
    .from("prospectos")
    .select("id, nombre");
  
  const mapaProspectos = new Map((prospectos ?? []).map((pr) => [pr.id, pr.nombre]));

  // 5. Mapear la información
  return llamadasFiltradas.map((row: any) => ({
    id: row.id,
    twilio_call_sid: row.twilio_call_sid,
    cliente_telefono: row.cliente_telefono,
    prospecto_id: row.prospecto_id,
    prospecto_nombre: row.prospecto_id ? mapaProspectos.get(row.prospecto_id) || row.prospecto_id : null,
    agente_id: row.agente_id,
    agente_nombre: row.agente_id ? mapaAgentes.get(row.agente_id) || "Asesor" : null,
    tipo: row.tipo,
    estado: row.estado,
    duracion: row.duracion,
    grabacion_url: row.grabacion_url,
    transcripcion: row.transcripcion,
    resumen_ia: row.resumen_ia,
    datos_perfilados: row.datos_perfilados,
    created_at: row.created_at,
  }));
}
