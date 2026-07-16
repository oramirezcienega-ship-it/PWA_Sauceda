import { useMemo, useState } from "react";

export type DireccionOrden = "asc" | "desc";

/**
 * Hook de ordenamiento por columna para tablas.
 * Recibe los elementos y un mapa de comparadores por clave de columna.
 * Devuelve la lista ordenada y controles para alternar la columna/dirección.
 *
 * `comparadores` debe ser estable (defínelo a nivel de módulo).
 */
export function useOrden<T>(
  items: T[],
  comparadores: Record<string, (a: T, b: T) => number>,
  defaultClave: string | null = null,
  defaultDir: DireccionOrden = "asc",
) {
  const [clave, setClave] = useState<string | null>(defaultClave);
  const [dir, setDir] = useState<DireccionOrden>(defaultDir);

  function ordenarPor(k: string) {
    if (clave === k) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setClave(k);
      setDir("asc");
    }
  }

  const ordenados = useMemo(() => {
    if (!clave || !comparadores[clave]) return items;
    const arr = [...items].sort(comparadores[clave]);
    return dir === "desc" ? arr.reverse() : arr;
  }, [items, clave, dir, comparadores]);

  return { ordenados, clave, dir, ordenarPor };
}
