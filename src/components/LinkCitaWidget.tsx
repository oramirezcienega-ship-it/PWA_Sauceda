"use client";

import { useState } from "react";

interface LinkCitaWidgetProps {
  asesorId: string | null;
  asesorNombre: string | null;
  prospectoId: string;
  prospectoNombre: string;
  prospectoTelefono: string | null;
  siteUrl: string;
}

export function LinkCitaWidget({
  asesorId,
  asesorNombre,
  prospectoId,
  prospectoNombre,
  prospectoTelefono,
  siteUrl,
}: LinkCitaWidgetProps) {
  const [copiado, setCopiado] = useState(false);

  if (!asesorId) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-carbon/20 bg-carbon/5 p-4 text-center">
        <p className="text-sm font-semibold text-carbon/60 flex items-center justify-center gap-1.5">
          <span>📅</span> Enlace de Cita no disponible
        </p>
        <p className="text-xs text-carbon/40 mt-1">
          Asigna un asesor en la parte superior para poder generar su enlace de citas.
        </p>
      </div>
    );
  }

  const urlReserva = `${siteUrl}/agenda/${asesorId}?prospecto_id=${prospectoId}`;

  async function handleCopiar() {
    try {
      await navigator.clipboard.writeText(urlReserva);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (err) {
      console.error("No se pudo copiar el enlace:", err);
    }
  }

  // Mensaje pre-llenado de WhatsApp
  const mensajeWhatsApp = `Hola ${prospectoNombre}, te comparto este enlace para que puedas seleccionar el horario que mejor te convenga para nuestra cita o asesoría: ${urlReserva}`;
  const whatsappUrl = prospectoTelefono
    ? `https://wa.me/${prospectoTelefono.replace(/\D/g, "")}?text=${encodeURIComponent(mensajeWhatsApp)}`
    : `https://wa.me/?text=${encodeURIComponent(mensajeWhatsApp)}`;

  return (
    <div className="mt-4 rounded-xl border border-sauce/20 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-verde-profundo uppercase tracking-wider flex items-center gap-1.5">
          <span>📅</span> Enlace de Agendamiento de Cita
        </h3>
        <span className="text-[10px] text-carbon/50 font-medium">
          Asesor: <strong>{asesorNombre}</strong>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={urlReserva}
          className="flex-1 rounded-lg border border-carbon/15 bg-carbon/5 px-3 py-1.5 text-xs text-carbon/75 font-mono select-all outline-none"
        />
        <button
          type="button"
          onClick={handleCopiar}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
            copiado
              ? "bg-sauce text-white border border-sauce"
              : "bg-white border border-carbon/15 text-carbon hover:bg-carbon/5"
          }`}
        >
          {copiado ? "✓ Copiado" : "📋 Copiar"}
        </button>
      </div>

      <div className="flex justify-between items-center text-[10px] text-carbon/40 pt-1 border-t border-carbon/5">
        <span>El cliente podrá seleccionar un horario disponible.</span>
        {prospectoTelefono && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-bold text-green-700 hover:text-green-800 hover:underline"
          >
            <span>💬 Enviar por WhatsApp</span>
          </a>
        )}
      </div>
    </div>
  );
}
