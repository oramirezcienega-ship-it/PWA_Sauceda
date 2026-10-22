"use client";

import { useEffect, useState } from "react";

/**
 * App instalada en la pantalla de inicio (modo standalone): no hay barra del navegador para
 * regresar y en iPhone window.print() no hace nada.
 */
function esAppInstalada(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

/**
 * Botones "Imprimir / Guardar PDF" y "Cerrar" de los documentos públicos (recibo, póliza,
 * remisión, reporte de visita). En el navegador normal imprime con window.print(); en la app
 * instalada pide al servidor el PDF de la misma página y lo abre con el menú Compartir
 * (desde ahí se imprime o se guarda en Archivos).
 */
export function AccionesDocumento({ className }: { className: string }) {
  const [instalada, setInstalada] = useState(false);
  const [estado, setEstado] = useState<"" | "generando" | "error">("");
  const [pdfListo, setPdfListo] = useState<File | null>(null);

  useEffect(() => {
    setInstalada(esAppInstalada());
  }, []);

  const compartir = async (archivo: File) => {
    try {
      await navigator.share({ files: [archivo], title: archivo.name.replace(/\.pdf$/, "") });
      setPdfListo(null);
    } catch (err) {
      // iOS exige un toque reciente: si la descarga tardó, se deja un botón para abrirlo
      if ((err as Error)?.name === "NotAllowedError") setPdfListo(archivo);
      else if ((err as Error)?.name !== "AbortError") setEstado("error");
    }
  };

  const imprimir = async () => {
    if (!instalada) {
      window.print();
      return;
    }
    if (pdfListo) {
      await compartir(pdfListo);
      return;
    }
    setEstado("generando");
    try {
      const nombre = document.title || "Documento";
      const params = new URLSearchParams({ ruta: window.location.pathname, nombre });
      const res = await fetch(`/api/documento-pdf?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const archivo = new File([await res.blob()], `${nombre}.pdf`, { type: "application/pdf" });
      setEstado("");
      if (navigator.canShare?.({ files: [archivo] })) {
        await compartir(archivo);
      } else {
        // Sin menú Compartir: se intenta la impresión normal
        window.print();
      }
    } catch {
      setEstado("error");
    }
  };

  const cerrar = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.close();
    // Si la ventana no se puede cerrar (se abrió directo), se regresa al inicio de la app
    setTimeout(() => {
      window.location.href = "/";
    }, 300);
  };

  const texto =
    estado === "generando"
      ? "⏳ Generando PDF…"
      : pdfListo
      ? "📄 Abrir PDF"
      : estado === "error"
      ? "⚠️ Reintentar PDF"
      : "🖨️ Imprimir / Guardar PDF";

  return (
    <div className="flex items-center gap-2 print:hidden">
      {instalada && (
        <button
          onClick={cerrar}
          className="rounded-lg bg-white hover:bg-carbon/5 text-carbon border border-carbon/15 px-4 py-2.5 text-xs font-bold transition shadow-sm"
        >
          ✕ Cerrar
        </button>
      )}
      <button onClick={imprimir} disabled={estado === "generando"} className={`${className} disabled:opacity-60`}>
        {texto}
      </button>
    </div>
  );
}
