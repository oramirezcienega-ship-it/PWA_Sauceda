/**
 * Modelo de Claude para las funciones de IA del CRM y opciones de petición
 * compatibles con él.
 *
 * - `ANTHROPIC_MODEL` manda; si está vacío o apunta a un modelo retirado
 *   (familia Claude 3 / 3.5 / 3.7, Claude 2), se usa el predeterminado.
 * - Los modelos nuevos (Sonnet 5.x, Opus 4.7+, Haiku 5.x, Fable) rechazan
 *   `temperature` y piensan por defecto: para tareas cortas se pide esfuerzo
 *   bajo y se deja margen en `max_tokens`.
 */

export const MODELO_CLAUDE_DEFAULT = "claude-sonnet-5-5";

export function esModeloRetirado(modelo: string): boolean {
  return /^claude-(2|instant|3)/.test(modelo) || /^claude-3-/.test(modelo);
}

export function modeloClaude(predeterminado: string = MODELO_CLAUDE_DEFAULT): string {
  const m = (process.env.ANTHROPIC_MODEL || "").trim();
  return !m || esModeloRetirado(m) ? predeterminado : m;
}

/** Modelos que rechazan `temperature`/`top_p` y tienen pensamiento adaptativo por defecto. */
export function esModeloNuevo(modelo: string): boolean {
  return /^claude-(opus-4-[78]|opus-5|sonnet-5|haiku-5|fable|mythos)/.test(modelo);
}

/** `max_tokens`, `temperature` y esfuerzo adecuados al modelo (para expandir en el cuerpo de la petición). */
export function opcionesClaude(
  modelo: string,
  { maxTokens, temperature }: { maxTokens: number; temperature?: number },
): Record<string, unknown> {
  if (esModeloNuevo(modelo)) {
    return { max_tokens: Math.min(Math.max(maxTokens * 2, 2048), 16000), output_config: { effort: "low" } };
  }
  return { max_tokens: maxTokens, ...(temperature !== undefined ? { temperature } : {}) };
}

/** Texto de una respuesta de Messages API: une solo los bloques `text` (ignora los de pensamiento). */
export function textoDeRespuesta(data: any): string {
  return (Array.isArray(data?.content) ? data.content : [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text ?? "")
    .join("");
}
