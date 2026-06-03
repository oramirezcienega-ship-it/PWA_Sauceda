import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarActividad } from "@/lib/actividades";
import { notificarCliente } from "@/lib/email";
import { enviarWhatsAppTexto } from "@/lib/whatsapp";
import { aplicarParametros } from "@/lib/parametros";
import { ETAPAS_POR_ID } from "@/lib/etapas";
import type {
  AccionAutomatizacion,
  CondicionAutomatizacion,
  EventoAutomatizacion,
} from "@/lib/types";

/**
 * MOTOR DE AUTOMATIZACIONES.
 *
 * `dispararEvento` es el único punto de entrada: lo llaman los lugares donde
 * ocurre algo relevante (se crea un expediente/prospecto, cambia una etapa,
 * se responde un formulario, se edita un campo). El motor busca las reglas
 * activas para ese evento, evalúa sus condiciones contra la entidad y ejecuta
 * sus acciones.
 *
 * Es 100% best-effort: cualquier fallo se captura y se registra, pero NUNCA
 * interrumpe la operación que lo disparó. Las acciones tampoco vuelven a
 * disparar eventos (escriben en la BD directamente) para evitar bucles.
 */

/** Contexto del evento: qué entidad lo originó y qué cambió. */
export interface ContextoEvento {
  expedienteId?: string | null;
  prospectoId?: string | null;
  /** Campos (columnas) que cambiaron. Solo se usa en "cambio-campo". */
  cambios?: string[];
}

interface FilaAutomatizacion {
  id: string;
  nombre: string;
  evento: string;
  condiciones: CondicionAutomatizacion[] | null;
  acciones: AccionAutomatizacion[] | null;
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Evalúa todas las condiciones (AND) contra la fila de la entidad. */
function cumpleCondiciones(
  fila: Record<string, unknown> | null,
  condiciones: CondicionAutomatizacion[],
  cambios: string[] | undefined,
  esCambioCampo: boolean,
): boolean {
  if (condiciones.length === 0) return true;
  if (!fila) return false;
  for (const c of condiciones) {
    // En "cambio-campo" la condición solo aplica si ese campo realmente cambió.
    if (esCambioCampo && cambios && !cambios.includes(c.campo)) return false;
    const actual = String(fila[c.campo] ?? "").toLowerCase().trim();
    const esperado = String(c.valor ?? "").toLowerCase().trim();
    switch (c.operador) {
      case "igual":
        if (actual !== esperado) return false;
        break;
      case "distinto":
        if (actual === esperado) return false;
        break;
      case "contiene":
        if (!actual.includes(esperado)) return false;
        break;
      case "cualquiera":
        break;
    }
  }
  return true;
}

/** Parámetros ({nombre}, etc.) a partir de la fila de la entidad. */
function paramsDeFila(fila: Record<string, unknown> | null): Record<string, string> {
  const nombre = String(fila?.cliente ?? fila?.nombre ?? "");
  const primer = String(fila?.primer_apellido ?? "");
  const segundo = String(fila?.segundo_apellido ?? "");
  return {
    nombre,
    primer_apellido: primer,
    segundo_apellido: segundo,
    nombre_completo: [nombre, primer, segundo].filter(Boolean).join(" "),
    fraccionamiento: String(fila?.fraccionamiento ?? ""),
  };
}

/** Ejecuta una sola acción y devuelve un texto con el resultado. */
async function ejecutarAccion(
  sb: SupabaseClient,
  accion: AccionAutomatizacion,
  ctx: ContextoEvento,
  fila: Record<string, unknown> | null,
): Promise<string> {
  switch (accion.tipo) {
    case "enviar-formulario": {
      if (!ctx.expedienteId) return "enviar-formulario: omitido (sin expediente)";
      if (!accion.formularioId) return "enviar-formulario: omitido (sin formulario)";
      // No duplicar si ya hay uno pendiente del mismo formulario.
      const { data: ex } = await sb
        .from("envios_formulario")
        .select("id")
        .eq("expediente_id", ctx.expedienteId)
        .eq("formulario_id", accion.formularioId)
        .eq("estado", "pendiente")
        .limit(1);
      if (ex && ex.length > 0) return "enviar-formulario: ya estaba pendiente";
      const { error } = await sb.from("envios_formulario").insert({
        expediente_id: ctx.expedienteId,
        formulario_id: accion.formularioId,
      });
      if (error) return `enviar-formulario: error (${error.message})`;
      await registrarActividad(sb, {
        expedienteId: ctx.expedienteId,
        tipo: "formulario",
        titulo: "Formulario enviado al cliente (automatización)",
      });
      await notificarCliente(
        sb,
        ctx.expedienteId,
        "Tienes un formulario por completar",
        "Formulario por completar",
        "Hola {nombre}, tienes un formulario por completar para tu trámite. Ábrelo en tu portal y respóndelo cuando puedas.",
      );
      return "enviar-formulario: ok";
    }

    case "enviar-correo": {
      if (!ctx.expedienteId) return "enviar-correo: omitido (sin expediente)";
      await notificarCliente(
        sb,
        ctx.expedienteId,
        accion.asunto || "Mensaje de SAUCEDA Bienes Raíces",
        accion.titulo || "",
        accion.cuerpo || "",
      );
      return "enviar-correo: ok";
    }

    case "enviar-whatsapp": {
      const tel = String(fila?.telefono ?? "");
      if (!tel) return "enviar-whatsapp: omitido (sin teléfono)";
      const texto = aplicarParametros(accion.texto || "", paramsDeFila(fila));
      const r = await enviarWhatsAppTexto(tel, texto);
      return r.ok ? "enviar-whatsapp: ok" : `enviar-whatsapp: ${r.error ?? "error"}`;
    }

    case "mover-etapa": {
      if (!ctx.expedienteId) return "mover-etapa: omitido (sin expediente)";
      if (!accion.etapa) return "mover-etapa: omitido (sin etapa)";
      // Escribe la columna directamente: no usamos moverEtapa() para no
      // volver a disparar el evento "cambio-etapa" (evita bucles).
      const { error } = await sb
        .from("expedientes")
        .update({ etapa: accion.etapa, ultimo_movimiento: hoyISO() })
        .eq("id", ctx.expedienteId);
      if (error) return `mover-etapa: error (${error.message})`;
      await registrarActividad(sb, {
        expedienteId: ctx.expedienteId,
        tipo: "etapa",
        titulo: `Movido a ${ETAPAS_POR_ID[accion.etapa]?.nombre ?? accion.etapa} (automatización)`,
      });
      return "mover-etapa: ok";
    }

    default:
      return "acción desconocida";
  }
}

/** Ejecuta todas las acciones de una regla y registra la ejecución. */
async function ejecutarRegla(
  sb: SupabaseClient,
  regla: FilaAutomatizacion,
  ctx: ContextoEvento,
  fila: Record<string, unknown> | null,
): Promise<void> {
  const acciones = regla.acciones ?? [];
  const resultados: string[] = [];
  let huboError = false;

  for (const accion of acciones) {
    try {
      resultados.push(await ejecutarAccion(sb, accion, ctx, fila));
    } catch (err) {
      huboError = true;
      resultados.push(
        `${accion.tipo}: error (${err instanceof Error ? err.message : "desconocido"})`,
      );
    }
  }

  const estado = huboError
    ? "error"
    : resultados.every((r) => r.includes("omitido"))
      ? "omitido"
      : "ok";

  await sb.from("automatizaciones_log").insert({
    automatizacion_id: regla.id,
    nombre: regla.nombre,
    evento: regla.evento,
    expediente_id: ctx.expedienteId ?? null,
    prospecto_id: ctx.prospectoId ?? null,
    estado,
    detalle: resultados.join(" · ") || "sin acciones",
  });
}

/**
 * Punto de entrada del motor. Busca reglas activas para el evento, evalúa
 * condiciones y ejecuta acciones. Best-effort: nunca lanza.
 */
export async function dispararEvento(
  sb: SupabaseClient,
  evento: EventoAutomatizacion,
  ctx: ContextoEvento,
): Promise<void> {
  try {
    const { data, error } = await sb
      .from("automatizaciones")
      .select("id, nombre, evento, condiciones, acciones")
      .eq("evento", evento)
      .eq("activa", true);
    if (error) {
      console.error("No se pudieron leer las automatizaciones:", error.message);
      return;
    }
    const reglas = (data ?? []) as FilaAutomatizacion[];
    if (reglas.length === 0) return;

    // Carga la entidad una sola vez para evaluar condiciones y resolver datos.
    let fila: Record<string, unknown> | null = null;
    if (ctx.expedienteId) {
      const { data: e } = await sb
        .from("expedientes")
        .select("*")
        .eq("id", ctx.expedienteId)
        .maybeSingle();
      fila = (e as Record<string, unknown>) ?? null;
    } else if (ctx.prospectoId) {
      const { data: p } = await sb
        .from("prospectos")
        .select("*")
        .eq("id", ctx.prospectoId)
        .maybeSingle();
      fila = (p as Record<string, unknown>) ?? null;
    }

    const esCambioCampo = evento === "cambio-campo";
    for (const regla of reglas) {
      const condiciones = regla.condiciones ?? [];
      if (!cumpleCondiciones(fila, condiciones, ctx.cambios, esCambioCampo)) {
        continue;
      }
      await ejecutarRegla(sb, regla, ctx, fila);
    }
  } catch (err) {
    console.error("Motor de automatizaciones falló:", err);
  }
}
