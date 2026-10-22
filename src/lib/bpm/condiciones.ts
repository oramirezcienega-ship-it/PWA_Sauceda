/**
 * Condiciones de los pasos BPM sobre campos del expediente.
 *
 * Módulo puro (sin dependencias) para poder probarlo con `node --test`.
 *
 * Un paso puede traer `condicion_campo` (jsonb, opcional):
 *   { "campo": "ya_tiene_casa", "igual": false }
 *   [ { "campo": "...", "igual": ... }, { "campo": "...", "distinto": ... } ]  (AND)
 * NULL = el paso siempre aplica (comportamiento original del motor).
 *
 * Cuando un paso no aplica, las tareas que dependían de él (por
 * `condicion_activacion` = título del paso) heredan la condición del paso
 * omitido, para que la cadena no se quede bloqueada.
 */

export interface CondicionCampo {
  campo: string;
  igual?: unknown;
  distinto?: unknown;
}

export type CondicionCampoJson = CondicionCampo | CondicionCampo[] | null | undefined;

export interface PasoCondicionable {
  id: string;
  titulo_tarea: string;
  condicion_activacion: string;
  condicion_campo?: CondicionCampoJson;
}

export interface PasoResuelto<P extends PasoCondicionable> {
  paso: P;
  /** Condición con la que debe esperar la tarea (puede diferir de la del paso). */
  condicionEfectiva: string;
  /** true si la condición efectiva es distinta a la del paso (hay que guardarla en la tarea). */
  condicionHeredada: boolean;
}

/** Normaliza el valor de un campo: los booleanos nulos cuentan como `false`. */
function normalizar(valor: unknown, referencia: unknown): unknown {
  if (typeof referencia === "boolean") return valor === true || valor === "true";
  if (valor === undefined) return null;
  return valor;
}

/** Evalúa una condición (o lista AND de condiciones) contra los datos del expediente. */
export function evaluarCondicionCampo(
  condicion: CondicionCampoJson,
  datos: Record<string, unknown>,
): boolean {
  if (!condicion) return true;
  const lista = Array.isArray(condicion) ? condicion : [condicion];
  return lista.every((c) => {
    if (!c || typeof c.campo !== "string") return true;
    const valor = datos[c.campo];
    if ("igual" in c) return normalizar(valor, c.igual) === c.igual;
    if ("distinto" in c) return normalizar(valor, c.distinto) !== c.distinto;
    return true;
  });
}

/** Busca el paso referido por una condición de activación (por título o `completar_<id>`). */
function pasoReferido<P extends PasoCondicionable>(condicion: string, pasos: P[]): P | undefined {
  if (!condicion || condicion === "inmediato") return undefined;
  return pasos.find(
    (p) => p.titulo_tarea === condicion || `completar_${p.id}` === condicion,
  );
}

/**
 * Devuelve los pasos que aplican al expediente, en el mismo orden, con su
 * condición de activación efectiva (saltando los pasos omitidos).
 */
export function resolverPasosAplicables<P extends PasoCondicionable>(
  pasos: P[],
  datos: Record<string, unknown>,
): PasoResuelto<P>[] {
  const aplica = new Map(pasos.map((p) => [p.id, evaluarCondicionCampo(p.condicion_campo, datos)]));

  const condicionEfectiva = (condicion: string): string => {
    let actual = condicion;
    const visitados = new Set<string>();
    for (;;) {
      const ref = pasoReferido(actual, pasos);
      if (!ref || aplica.get(ref.id) || visitados.has(ref.id)) return actual;
      visitados.add(ref.id);
      actual = ref.condicion_activacion || "inmediato";
    }
  };

  return pasos
    .filter((p) => aplica.get(p.id))
    .map((p) => {
      const efectiva = condicionEfectiva(p.condicion_activacion || "inmediato");
      return {
        paso: p,
        condicionEfectiva: efectiva,
        condicionHeredada: efectiva !== (p.condicion_activacion || "inmediato"),
      };
    });
}
