"use client";

import { useEffect } from "react";

/** Abre el diálogo de impresión (o "Guardar como PDF") al cargar la página. */
export function AutoImprimirAlCargar() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 900);
    return () => clearTimeout(t);
  }, []);
  return null;
}
