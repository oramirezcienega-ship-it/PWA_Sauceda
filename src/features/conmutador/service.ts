import { supabaseServidor } from "@/lib/supabase/server";
import { registrarActividad } from "@/lib/actividades";
import { enviarBienvenida } from "@/lib/bienvenida";
import { dispararEvento } from "@/lib/automatizaciones/motor";
import { normalizarTelefono, variantesTelefono } from "@/lib/telefono";
import { notificarNuevoLead } from "@/lib/notificaciones-sistema";

export interface DatosLlamadaInicial {
  twilioCallSid: string;
  clienteTelefono: string;
  tipo?: "entrante" | "saliente";
  estado: string;
}

export interface ReporteVoiceBot {
  twilioCallSid: string;
  clienteTelefono: string;
  transcripcion?: string;
  resumen?: string;
  grabacionUrl?: string;
  datosPerfilados?: {
    nombre?: string;
    correo?: string;
    necesidad?: string;
    tipoCredito?: string;
    valorEstimado?: number;
    saldoDeuda?: number;
  };
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Obtiene la hora actual en la Zona Horaria de México (America/Mexico_City) en formato 'HH:MM:SS' de 24 horas robusto.
export function obtenerHoraLocalMX(): string {
  const d = new Date();
  const formateador = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const partes = formateador.formatToParts(d);
  let horas = "00";
  let minutos = "00";
  let segundos = "00";

  for (const parte of partes) {
    if (parte.type === "hour") horas = parte.value.padStart(2, "0");
    if (parte.type === "minute") minutos = parte.value.padStart(2, "0");
    if (parte.type === "second") segundos = parte.value.padStart(2, "0");
  }

  // Corregir caso donde '24' pueda ser devuelto por algunas implementaciones de Node
  if (horas === "24") horas = "00";

  return `${horas}:${minutos}:${segundos}`;
}

async function siguienteId(
  sb: ReturnType<typeof supabaseServidor>,
  tabla: string,
  prefijo: string,
): Promise<string> {
  const { data } = await sb.from(tabla).select("id");
  const numeros = (data ?? [])
    .map((r) => parseInt(String(r.id).replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `${prefijo}-${String(max + 1).padStart(3, "0")}`;
}

/**
 * Busca un agente activo y disponible en el horario actual de guardia.
 * Si hay múltiples, elige uno de forma aleatoria para balancear la carga.
 */
export async function obtenerAgenteDisponible(): Promise<{ id: string; nombre: string; telefono_desvio: string } | null> {
  const sb = supabaseServidor();
  const horaActual = obtenerHoraLocalMX();

  // Consulta perfiles que estén marcados como disponibles para llamadas y que tengan teléfono de desvío
  const { data: agentes, error } = await sb
    .from("perfiles")
    .select("id, nombre, telefono_desvio, horario_inicio, horario_fin")
    .eq("activo", true)
    .eq("disponible_llamadas", true)
    .neq("telefono_desvio", "");

  if (error || !agentes || agentes.length === 0) {
    return null;
  }

  // Filtrar por horario laboral
  const agentesEnHorario = agentes.filter((agente) => {
    const inicio = agente.horario_inicio;
    const fin = agente.horario_fin;
    
    // Comparación simple de cadenas 'HH:MM:SS'
    if (inicio <= fin) {
      return horaActual >= inicio && horaActual <= fin;
    } else {
      // Manejar turnos que cruzan la medianoche (ej: 22:00:00 a 06:00:00)
      return horaActual >= inicio || horaActual <= fin;
    }
  });

  if (agentesEnHorario.length === 0) {
    return null;
  }

  // Selección aleatoria
  const index = Math.floor(Math.random() * agentesEnHorario.length);
  const agente = agentesEnHorario[index];

  return {
    id: agente.id,
    nombre: agente.nombre,
    telefono_desvio: agente.telefono_desvio,
  };
}

/**
 * Registra o actualiza el inicio de una llamada telefónica.
 */
export async function registrarInicioLlamada(datos: DatosLlamadaInicial): Promise<void> {
  const sb = supabaseServidor();
  const telefonoCanon = normalizarTelefono(datos.clienteTelefono);

  // Buscar si ya existe un prospecto con este teléfono
  let prospectoId: string | null = null;
  const variantes = variantesTelefono(datos.clienteTelefono);
  if (variantes.length) {
    const { data } = await sb
      .from("prospectos")
      .select("id")
      .in("telefono", variantes)
      .limit(1);
    if (data && data.length) {
      prospectoId = data[0].id;
    }
  }

  // Upsert del registro de la llamada
  const { error } = await sb.from("llamadas_conmutador").upsert(
    {
      twilio_call_sid: datos.twilioCallSid,
      cliente_telefono: telefonoCanon,
      prospecto_id: prospectoId,
      tipo: datos.tipo ?? "entrante",
      estado: datos.estado,
    },
    { onConflict: "twilio_call_sid" }
  );

  if (error) {
    console.error("Error al registrar inicio de llamada:", error);
  }
}

/**
 * Actualiza la información de la llamada al finalizar o cambiar de estado.
 */
export async function actualizarLlamada(
  twilioCallSid: string,
  datos: {
    estado: string;
    duracion?: number;
    grabacionUrl?: string;
    agenteId?: string;
  }
): Promise<void> {
  const sb = supabaseServidor();
  
  const updateData: Record<string, any> = {
    estado: datos.estado,
  };

  if (datos.duracion !== undefined) updateData.duracion = datos.duracion;
  if (datos.grabacionUrl !== undefined) updateData.grabacion_url = datos.grabacionUrl;
  if (datos.agenteId !== undefined) updateData.agente_id = datos.agenteId;

  const { error } = await sb
    .from("llamadas_conmutador")
    .update(updateData)
    .eq("twilio_call_sid", twilioCallSid);

  if (error) {
    console.error(`Error al actualizar llamada ${twilioCallSid}:`, error);
  }
}

/**
 * Procesa el reporte final del Voice Bot: crea el prospecto/expediente
 * si no existía, y enlaza toda la información en Supabase.
 */
export async function procesarReporteVoiceBot(reporte: ReporteVoiceBot): Promise<string | null> {
  const sb = supabaseServidor();
  const telefonoRaw = reporte.clienteTelefono;
  const telefono = normalizarTelefono(telefonoRaw);
  const variantesTel = variantesTelefono(telefonoRaw);
  
  const nombre = reporte.datosPerfilados?.nombre?.trim() || "Lead de Conmutador IA";
  const correo = reporte.datosPerfilados?.correo?.trim() || "";

  // 1. Buscar prospecto existente por teléfono o correo
  let prospectoId: string | null = null;
  let nombreExistente = "";
  if (variantesTel.length) {
    const { data } = await sb
      .from("prospectos")
      .select("id, nombre")
      .in("telefono", variantesTel)
      .limit(1);
    if (data && data.length) {
      prospectoId = data[0].id;
      nombreExistente = data[0].nombre;
    }
  }
  if (!prospectoId && correo) {
    const { data } = await sb
      .from("prospectos")
      .select("id, nombre")
      .eq("correo", correo)
      .limit(1);
    if (data && data.length) {
      prospectoId = data[0].id;
      nombreExistente = data[0].nombre;
    }
  }

  // 2. Si no existe, crear el prospecto
  if (!prospectoId) {
    const id = await siguienteId(sb, "prospectos", "PRO");
    const { error: insErr } = await sb.from("prospectos").insert({
      id,
      nombre,
      telefono,
      correo,
      origen: "sitio-web", // Usamos un origen compatible, o crearemos uno en caso necesario. En la migración 0002 se checkean origenes. 'sitio-web' o 'otro'. Usaremos 'otro' para llamadas telefónicas.
    });

    if (insErr) {
      console.error("Error al crear prospecto desde conmutador:", insErr);
      return null;
    }
    prospectoId = id;
    await dispararEvento(sb, "nuevo-prospecto", { prospectoId: id });
  } else {
    // Si ya existe pero tiene el nombre genérico y ahora se obtuvo un nombre real, actualizarlo
    const esGenerico = !nombreExistente || nombreExistente === "Lead de Conmutador IA" || nombreExistente === "Lead de Conmutador";
    const esNombreValido = nombre && nombre !== "Lead de Conmutador IA" && nombre !== "Lead de Conmutador";
    if (esGenerico && esNombreValido) {
      await sb
        .from("prospectos")
        .update({ nombre })
        .eq("id", prospectoId);
      
      // También actualizamos el nombre del cliente en expedientes asociados
      await sb
        .from("expedientes")
        .update({ cliente: nombre })
        .eq("prospecto_id", prospectoId);
    }
  }

  // 3. Buscar si ya existe un expediente activo
  let expedienteId: string | null = null;
  let token: string | null = null;
  
  if (variantesTel.length) {
    const { data: ex } = await sb
      .from("expedientes")
      .select("id, token")
      .in("telefono", variantesTel)
      .limit(1);
    if (ex && ex.length) {
      expedienteId = ex[0].id;
      token = ex[0].token;
      
      await sb
        .from("expedientes")
        .update({ ultimo_movimiento: hoyISO() })
        .eq("id", expedienteId);

      await registrarActividad(sb, {
        expedienteId,
        tipo: "sistema",
        titulo: "Nueva interacción de voz con el conmutador IA",
        detalle: reporte.resumen || "El cliente interactuó con el Voice Bot.",
      });
    }
  }

  // 4. Si no tiene expediente, crear uno nuevo en 'nuevo-lead'
  if (!expedienteId) {
    token = crypto.randomUUID();
    const expId = await siguienteId(sb, "expedientes", "EXP");
    
    const { error: expErr } = await sb.from("expedientes").insert({
      id: expId,
      token,
      cliente: nombre,
      fraccionamiento: "Por definir",
      etapa: "nuevo-lead",
      situacion: reporte.resumen 
        ? `Llamada perfilada por IA: ${reporte.resumen}`.slice(0, 300) 
        : "Solicitud entrante por llamada telefónica.",
      telefono,
      valor_estimado: reporte.datosPerfilados?.valorEstimado || 0,
      saldo_deuda: reporte.datosPerfilados?.saldoDeuda || 0,
      notas: "Lead captado automáticamente por el Voice Bot del Conmutador.",
      ultimo_movimiento: hoyISO(),
      prospecto_id: prospectoId,
      tipo_credito: reporte.datosPerfilados?.tipoCredito || null,
      necesidad: reporte.datosPerfilados?.necesidad || null,
    });

    if (expErr) {
      console.error("Error al crear expediente de llamada:", expErr);
      return null;
    }
    
    expedienteId = expId;

    // Enrolar en secuencias
    try {
      const { enrolarLeadEnSecuenciasActivas } = await import("@/lib/automatizaciones/orquestador");
      await enrolarLeadEnSecuenciasActivas(sb, {
        nombre,
        phone: telefono,
        email: correo || undefined,
        prospectoId,
        expedienteId,
      });
    } catch (err) {
      console.error("Error al enrolar lead telefónico en secuencias:", err);
    }

    await registrarActividad(sb, {
      expedienteId,
      prospectoId,
      tipo: "creacion",
      titulo: "Lead captado por llamada",
      detalle: reporte.resumen || "Registro automático.",
    });

    await enviarBienvenida(sb, expedienteId);
    await dispararEvento(sb, "nuevo-expediente", { expedienteId, prospectoId });
    void notificarNuevoLead(expedienteId);
  }

  // 5. Registrar/Actualizar la tabla llamadas_conmutador con la transcripción y el prospecto
  const { error: callUpdateErr } = await sb
    .from("llamadas_conmutador")
    .upsert({
      twilio_call_sid: reporte.twilioCallSid,
      cliente_telefono: telefono,
      prospecto_id: prospectoId,
      transcripcion: reporte.transcripcion,
      resumen_ia: reporte.resumen,
      grabacion_url: reporte.grabacionUrl,
      datos_perfilados: reporte.datosPerfilados,
      estado: "completed",
      tipo: "entrante",
    }, { onConflict: "twilio_call_sid" });

  if (callUpdateErr) {
    console.error(`Error al asociar reporte de IA a llamada ${reporte.twilioCallSid}:`, callUpdateErr);
  }

  return token;
}
