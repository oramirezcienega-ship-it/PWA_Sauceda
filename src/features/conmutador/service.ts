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
    rawPayload?: any;
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

  // Determinar el día de la semana actual en la zona horaria de México (usando en-US para evitar problemas de ICU locale)
  const d = new Date();
  const formDia = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    weekday: "long",
  });
  
  const diaSemanaRaw = formDia.format(d).toLowerCase();
  let diaSemana = "lunes";
  if (diaSemanaRaw.includes("monday")) diaSemana = "lunes";
  else if (diaSemanaRaw.includes("tuesday")) diaSemana = "martes";
  else if (diaSemanaRaw.includes("wednesday")) diaSemana = "miercoles";
  else if (diaSemanaRaw.includes("thursday")) diaSemana = "jueves";
  else if (diaSemanaRaw.includes("friday")) diaSemana = "viernes";
  else if (diaSemanaRaw.includes("saturday")) diaSemana = "sabado";
  else if (diaSemanaRaw.includes("sunday")) diaSemana = "domingo";

  console.log(`[obtenerAgenteDisponible] Evaluando día: ${diaSemana}, hora local: ${horaActual}`);

  // Consulta perfiles que estén marcados como activos y disponibles para recibir llamadas
  // Nota: Quitamos el filtro neq("telefono_desvio", "") de la query de Supabase para evitar 
  // comportamientos inesperados si el campo es NULL, lo filtraremos de forma segura en JS.
  const { data: agentes, error } = await sb
    .from("perfiles")
    .select("id, nombre, telefono_desvio, horarios_guardia, rol")
    .eq("activo", true)
    .eq("disponible_llamadas", true);

  if (error || !agentes || agentes.length === 0) {
    console.log("[obtenerAgenteDisponible] No se encontraron agentes activos con disponible_llamadas = true.");
    return null;
  }

  // Filtrar agentes con un teléfono de desvío válido en JS
  const agentesConTelefono = agentes.filter(
    (a) => a.telefono_desvio && a.telefono_desvio.trim() !== ""
  );

  if (agentesConTelefono.length === 0) {
    console.log("[obtenerAgenteDisponible] Agentes disponibles pero ninguno tiene telefono_desvio configurado.");
    return null;
  }

  // Filtrar por horario laboral dinámico
  const agentesEnHorario = agentesConTelefono.filter((agente) => {
    // Si no tiene horarios configurados, usamos el fallback (Lunes a Viernes 09:00 a 18:00)
    const horarios = (agente.horarios_guardia as any) || {
      lunes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      martes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      miercoles: [{ inicio: "09:00:00", fin: "18:00:00" }],
      jueves: [{ inicio: "09:00:00", fin: "18:00:00" }],
      viernes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      sabado: [],
      domingo: []
    };

    const bloques = horarios[diaSemana] || [];
    if (!Array.isArray(bloques) || bloques.length === 0) {
      return false;
    }

    // Comprobar si la hora actual cae en alguna de las franjas horarias configuradas para hoy
    return bloques.some((bloque: any) => {
      const inicio = bloque.inicio;
      const fin = bloque.fin;
      if (!inicio || !fin) return false;

      // Normalizar a HH:MM para evitar inconsistencias de segundos en las comparaciones de cadenas
      const hActual = horaActual.slice(0, 5);
      const hInicio = inicio.slice(0, 5);
      const hFin = fin.slice(0, 5);

      if (hInicio <= hFin) {
        return hActual >= hInicio && hActual <= hFin;
      } else {
        // Manejar turnos que cruzan la medianoche
        return hActual >= hInicio || hActual <= hFin;
      }
    });
  });

  if (agentesEnHorario.length === 0) {
    console.log(`[obtenerAgenteDisponible] Hay ${agentesConTelefono.length} agentes configurados, pero ninguno está dentro de su franja horaria de guardia hoy.`);
    return null;
  }

  // Lógica de Priorización:
  // 1. Filtrar asesores de guardia y balancear uniformemente (aleatorio) entre ellos
  // 2. Si no hay asesores de guardia, delegar en administradores de guardia (balanceados uniformemente)
  let poolSeleccion = agentesEnHorario.filter((a) => a.rol === "asesor");

  if (poolSeleccion.length === 0) {
    console.log("[obtenerAgenteDisponible] No hay asesores de guardia disponibles en este momento. Evaluando administradores.");
    poolSeleccion = agentesEnHorario.filter((a) => a.rol === "admin");
  }

  if (poolSeleccion.length === 0) {
    console.log("[obtenerAgenteDisponible] No se encontraron asesores ni administradores en el pool de selección.");
    return null;
  }

  // Selección aleatoria equilibrada dentro del pool seleccionado
  const index = Math.floor(Math.random() * poolSeleccion.length);
  const agente = poolSeleccion[index];

  console.log(`[obtenerAgenteDisponible] Agente seleccionado (${agente.rol}): ${agente.nombre}`);

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
    estado?: string;
    duracion?: number;
    grabacionUrl?: string;
    agenteId?: string;
  }
): Promise<void> {
  const sb = supabaseServidor();
  
  const updateData: Record<string, any> = {};

  if (datos.estado !== undefined && datos.estado.trim() !== "") {
    updateData.estado = datos.estado;
  }
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
  
  const correo = reporte.datosPerfilados?.correo?.trim() || "";

  let resumen = reporte.resumen?.trim() || "";
  if (!resumen && reporte.datosPerfilados) {
    const dp = reporte.datosPerfilados;
    const partes: string[] = [];
    if (dp.necesidad) partes.push(`Necesidad: ${dp.necesidad}`);
    if (dp.tipoCredito) partes.push(`Crédito: ${dp.tipoCredito}`);
    if (dp.valorEstimado) partes.push(`Presupuesto: $${dp.valorEstimado.toLocaleString()}`);
    if (dp.saldoDeuda) partes.push(`Deuda: ${dp.saldoDeuda.toLocaleString()}`);
    if (dp.correo) partes.push(`Correo: ${dp.correo}`);
    if (partes.length > 0) {
      resumen = `Llamada perfilada por IA. ${partes.join(". ")}.`;
    }
  }

  // 0. Buscar si esta llamada fue transferida/asociada a un agente durante la conversación
  let agenteId: string | null = null;
  if (reporte.twilioCallSid) {
    const { data: callData } = await sb
      .from("llamadas_conmutador")
      .select("agente_id")
      .eq("twilio_call_sid", reporte.twilioCallSid)
      .limit(1);
    if (callData && callData.length && callData[0].agente_id) {
      agenteId = callData[0].agente_id;
    }
  }

  // 1. Buscar prospecto existente por teléfono o correo
  let prospectoId: string | null = null;
  let nombreExistente = "";
  let asesorIdExistente: string | null = null;

  if (variantesTel.length) {
    const { data } = await sb
      .from("prospectos")
      .select("id, nombre, asesor_id")
      .in("telefono", variantesTel)
      .limit(1);
    if (data && data.length) {
      prospectoId = data[0].id;
      nombreExistente = data[0].nombre?.trim() || "";
      asesorIdExistente = data[0].asesor_id;
    }
  }
  if (!prospectoId && correo) {
    const { data } = await sb
      .from("prospectos")
      .select("id, nombre, asesor_id")
      .eq("correo", correo)
      .limit(1);
    if (data && data.length) {
      prospectoId = data[0].id;
      nombreExistente = data[0].nombre?.trim() || "";
      asesorIdExistente = data[0].asesor_id;
    }
  }

  // Determinar el nombre a usar:
  let nombre = reporte.datosPerfilados?.nombre?.trim() || "";
  const esNombreValido = nombre && nombre !== "Lead de Conmutador IA" && nombre !== "Lead de Conmutador";
  const esNombreExistenteValido = nombreExistente && nombreExistente !== "Lead de Conmutador IA" && nombreExistente !== "Lead de Conmutador";

  if (!esNombreValido && esNombreExistenteValido) {
    nombre = nombreExistente;
  }
  if (!nombre) {
    nombre = "Lead de Conmutador IA";
  }

  // Determinar el asesor a asignar: si ya tiene uno asignado en BD, lo mantenemos; si no, asignamos el que atendió/transfirió.
  const finalAsesorId = asesorIdExistente || agenteId || null;

  // 2. Si no existe, crear el prospecto
  if (!prospectoId) {
    const id = await siguienteId(sb, "prospectos", "PRO");
    const { error: insErr } = await sb.from("prospectos").insert({
      id,
      nombre,
      telefono,
      correo,
      origen: "otro", // 'otro' es el origen correcto para llamadas telefónicas.
      asesor_id: finalAsesorId,
    });

    if (insErr) {
      console.error("Error al crear prospecto desde conmutador:", insErr);
      return null;
    }
    prospectoId = id;
    await dispararEvento(sb, "nuevo-prospecto", { prospectoId: id });
  } else {
    // Si ya existe, actualizamos su asesor_id si es que antes no tenía y ahora sí tenemos uno
    if (finalAsesorId && finalAsesorId !== asesorIdExistente) {
      await sb
        .from("prospectos")
        .update({ asesor_id: finalAsesorId })
        .eq("id", prospectoId);
    }

    // Si ya existe pero tiene el nombre genérico y ahora se obtuvo un nombre real, actualizarlo
    const esGenerico = !nombreExistente || nombreExistente === "Lead de Conmutador IA" || nombreExistente === "Lead de Conmutador";
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
      .select("id, token, asesor_id")
      .in("telefono", variantesTel)
      .limit(1);
    if (ex && ex.length) {
      expedienteId = ex[0].id;
      token = ex[0].token;
      
      const updateData: Record<string, any> = {
        ultimo_movimiento: hoyISO()
      };

      if (nombre && nombre !== "Lead de Conmutador IA" && nombre !== "Lead de Conmutador") {
        updateData.cliente = nombre;
      }
      if (reporte.datosPerfilados?.tipoCredito) {
        updateData.tipo_credito = reporte.datosPerfilados.tipoCredito;
      }
      if (reporte.datosPerfilados?.necesidad) {
        updateData.necesidad = reporte.datosPerfilados.necesidad;
      }
      if (reporte.datosPerfilados?.valorEstimado !== undefined && reporte.datosPerfilados.valorEstimado > 0) {
        updateData.valor_estimado = reporte.datosPerfilados.valorEstimado;
      }
      if (reporte.datosPerfilados?.saldoDeuda !== undefined && reporte.datosPerfilados.saldoDeuda > 0) {
        updateData.saldo_deuda = reporte.datosPerfilados.saldoDeuda;
      }
      if (resumen) {
        updateData.situacion = `Llamada perfilada por IA: ${resumen}`.slice(0, 300);
      }
      // Mantener en sincronía el asesor del expediente
      if (finalAsesorId && ex[0].asesor_id !== finalAsesorId) {
        updateData.asesor_id = finalAsesorId;
      }

      await sb
        .from("expedientes")
        .update(updateData)
        .eq("id", expedienteId);

      if (resumen) {
        await registrarActividad(sb, {
          expedienteId,
          tipo: "llamada",
          titulo: "Llamada perfilada por Conmutador IA",
          detalle: resumen,
        });
      }
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
      situacion: resumen 
        ? `Llamada perfilada por IA: ${resumen}`.slice(0, 300) 
        : "Solicitud entrante por llamada telefónica.",
      telefono,
      valor_estimado: reporte.datosPerfilados?.valorEstimado || 0,
      saldo_deuda: reporte.datosPerfilados?.saldoDeuda || 0,
      notas: "Lead captado automáticamente por el Voice Bot del Conmutador.",
      ultimo_movimiento: hoyISO(),
      prospecto_id: prospectoId,
      tipo_credito: reporte.datosPerfilados?.tipoCredito || null,
      necesidad: reporte.datosPerfilados?.necesidad || null,
      asesor_id: finalAsesorId,
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
      detalle: resumen || "Registro automático.",
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
      resumen_ia: resumen,
      grabacion_url: reporte.grabacionUrl,
      datos_perfilados: reporte.datosPerfilados,
      estado: "completed",
      tipo: "entrante",
      // Si la llamada fue ruteada a un asesor, nos aseguramos que quede registrado aquí
      agente_id: finalAsesorId,
    }, { onConflict: "twilio_call_sid" });

  if (callUpdateErr) {
    console.error(`Error al asociar reporte de IA a llamada ${reporte.twilioCallSid}:`, callUpdateErr);
  }

  return token;
}
