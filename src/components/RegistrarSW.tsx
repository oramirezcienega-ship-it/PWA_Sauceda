"use client";

import { useEffect } from "react";

/**
 * Registra el service worker básico (/sw.js) para que la PWA sea
 * instalable y funcione el cacheo mínimo offline. No renderiza nada.
 */
export function RegistrarSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // evita ruido en dev

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("No se pudo registrar el service worker:", err);
    });
  }, []);

  return null;
}
