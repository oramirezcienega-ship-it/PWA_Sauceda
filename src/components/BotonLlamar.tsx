"use client";

import { useState, useEffect } from "react";
import { iniciarLlamadaConmutador } from "@/app/actions/llamadas";
import { obtenerTelLink } from "@/lib/telefono";

interface BotonLlamarProps {
  telefono: string;
  prospectoId?: string | null;
  className?: string;
}

export function BotonLlamar({ telefono, prospectoId, className = "" }: BotonLlamarProps) {
  const [llamando, setLlamando] = useState(false);
  const [esMovil, setEsMovil] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);

  useEffect(() => {
    const checkMovil = () => {
      const ua = navigator.userAgent || "";
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;
      setEsMovil(isMobileUA || isSmallScreen);
    };
    checkMovil();
    window.addEventListener("resize", checkMovil);
    return () => window.removeEventListener("resize", checkMovil);
  }, []);

  if (!telefono || telefono.startsWith("messenger:") || telefono.startsWith("instagram:")) {
    return null;
  }

  // Si es celular/dispositivo móvil: Llamada directa desde el número nativo del teléfono
  if (esMovil) {
    return (
      <a
        href={`tel:${obtenerTelLink(telefono)}`}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-800 ${className}`}
        title="Llamar directo desde tu celular"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
          />
        </svg>
        Llamar
      </a>
    );
  }

  // Si es Escritorio/PC: Usar conmutador Twilio
  async function realizarLlamada() {
    if (llamando) return;
    setLlamando(true);
    setMensaje(null);

    try {
      const res = await iniciarLlamadaConmutador(telefono, prospectoId);
      if (res.ok) {
        setMensaje({
          tipo: "exito",
          texto: "Llamando a tu teléfono de desvío...",
        });
        setTimeout(() => setMensaje(null), 5000);
      } else {
        setMensaje({
          tipo: "error",
          texto: res.error || "Ocurrió un error al iniciar la llamada.",
        });
      }
    } catch (err) {
      console.error("Error al iniciar llamada:", err);
      setMensaje({
        tipo: "error",
        texto: "Error de conexión al iniciar la llamada.",
      });
    } finally {
      setLlamando(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={realizarLlamada}
        disabled={llamando}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-800 disabled:opacity-50 ${className}`}
        title="Llamar con el conmutador (Twilio)"
      >
        <svg
          className={`h-3.5 w-3.5 ${llamando ? "animate-bounce" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
          />
        </svg>
        {llamando ? "Conectando..." : "Llamar"}
      </button>

      {mensaje && (
        <span
          className={`mt-1 max-w-[220px] rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight ${
            mensaje.tipo === "exito"
              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
              : "bg-rojo/10 text-rojo border border-rojo/20"
          }`}
        >
          {mensaje.texto}
        </span>
      )}
    </div>
  );
}
