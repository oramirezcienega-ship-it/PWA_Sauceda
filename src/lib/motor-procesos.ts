import type { Expediente, EtapaConfiguracion, ReglaValidacion } from "./types";

export interface ResultadoValidacion {
  valido: boolean;
  errores: string[];
}

/**
  * Valida si un objeto (expediente/prospecto) cumple con los campos obligatorios
  * y las reglas IF/THEN configuradas para avanzar a la claveEtapaDestino.
  */
export function evaluarReglasDeAvance(
  datosObj: Record<string, any>,
  etapaConfig: EtapaConfiguracion
): ResultadoValidacion {
  const errores: string[] = [];

  // 1. Validar Campos Requeridos
  if (Array.isArray(etapaConfig.camposRequeridos)) {
    for (const campo of etapaConfig.camposRequeridos) {
      const val = datosObj[campo];
      if (val === undefined || val === null || val === "" || (typeof val === "number" && isNaN(val))) {
        errores.push(`El campo obligatorio "${campo}" no ha sido registrado.`);
      }
    }
  }

  // 2. Validar Reglas Visuales IF/THEN
  if (Array.isArray(etapaConfig.validaciones)) {
    for (const regla of etapaConfig.validaciones) {
      const val = datosObj[regla.campo];
      let falla = false;

      switch (regla.operador) {
        case "esta_vacio":
          falla = val === undefined || val === null || val === "";
          break;
        case "no_esta_vacio":
          falla = !(val === undefined || val === null || val === "");
          break;
        case "es_igual":
          falla = String(val) === String(regla.valor);
          break;
        case "no_es_igual":
          falla = String(val) !== String(regla.valor);
          break;
        case "mayor_que":
          falla = Number(val) > Number(regla.valor);
          break;
        case "menor_que":
          falla = Number(val) < Number(regla.valor);
          break;
      }

      if (falla) {
        errores.push(regla.mensajeError || `Regla violada en campo ${regla.campo}`);
      }
    }
  }

  return {
    valido: errores.length === 0,
    errores,
  };
}

/**
  * Calcula si un expediente ha superado el SLA en días para su etapa actual.
  */
export function calcularEstadoSLA(
  fechaUltimoMovimientoISO: string,
  slaDias: number
): { vencido: boolean; diasEnEtapa: number; diasRestantes: number } {
  if (!fechaUltimoMovimientoISO) {
    return { vencido: false, diasEnEtapa: 0, diasRestantes: slaDias };
  }

  const inicio = new Date(fechaUltimoMovimientoISO).getTime();
  const ahora = Date.now();
  const diffMs = ahora - inicio;
  const diasEnEtapa = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diasRestantes = slaDias - diasEnEtapa;

  return {
    vencido: diasEnEtapa > slaDias,
    diasEnEtapa,
    diasRestantes: diasRestantes < 0 ? 0 : diasRestantes,
  };
}

/**
  * Helper para enviar webhooks a n8n en segundo plano de manera segura (best-effort).
  */
export async function enviarWebhookN8n(
  webhookUrl: string,
  payload: Record<string, any>
): Promise<boolean> {
  if (!webhookUrl || !webhookUrl.startsWith("http")) return false;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        ...payload,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error(`[n8n Webhook Error] ${webhookUrl}:`, err);
    return false;
  }
}
