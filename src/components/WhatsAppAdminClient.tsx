"use client";

import React, { useState } from "react";
import { WhatsAppCoexistenciaSignup } from "@/components/WhatsAppCoexistenciaSignup";
import type { PlantillaWhatsApp } from "@/lib/whatsapp";

const COLOR_ESTADO: Record<string, string> = {
  APPROVED: "bg-sauce/15 text-verde-profundo",
  PENDING: "bg-dorado/15 text-dorado",
  REJECTED: "bg-rojo/10 text-rojo",
};

interface Props {
  plantillasResult: {
    ok: boolean;
    error?: string;
    plantillas: PlantillaWhatsApp[];
  };
}

export function WhatsAppAdminClient({ plantillasResult: r }: Props) {
  const [tab, setTab] = useState<"coexistencia" | "plantillas">("coexistencia");

  return (
    <div className="space-y-6">
      {/* Pestañas de Navegación */}
      <div className="flex border-b border-carbon/10 gap-2">
        <button
          onClick={() => setTab("coexistencia")}
          className={`flex items-center gap-2 pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
            tab === "coexistencia"
              ? "border-verde-profundo text-verde-profundo"
              : "border-transparent text-carbon/60 hover:text-carbon"
          }`}
        >
          <span>📱</span>
          <span>Conexión & Coexistencia (App Móvil + API)</span>
        </button>

        <button
          onClick={() => setTab("plantillas")}
          className={`flex items-center gap-2 pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
            tab === "plantillas"
              ? "border-verde-profundo text-verde-profundo"
              : "border-transparent text-carbon/60 hover:text-carbon"
          }`}
        >
          <span>📝</span>
          <span>Plantillas de Mensajes</span>
          {r.ok && r.plantillas.length > 0 && (
            <span className="rounded-full bg-carbon/10 px-2 py-0.5 text-[11px] font-mono text-carbon/70">
              {r.plantillas.length}
            </span>
          )}
        </button>
      </div>

      {tab === "coexistencia" ? (
        <WhatsAppCoexistenciaSignup />
      ) : (
        <div className="space-y-5">
          {/* Aviso explicativo */}
          <div className="rounded-lg border border-cielo/30 bg-cielo/5 px-4 py-3 text-sm text-carbon/70">
            <p className="font-medium text-verde-profundo">¿Cómo funciona?</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              <li>
                Para contactar a un cliente <strong>fuera de la ventana de 24 h</strong> (cuando no te ha escrito) Meta
                exige una <strong>plantilla aprobada</strong>.
              </li>
              <li>
                Crea y manda a aprobar tus plantillas en{" "}
                <span className="font-mono">business.facebook.com</span> → WhatsApp Manager → Plantillas de mensajes.
              </li>
              <li>
                Una vez <strong>aprobadas</strong>, aparecen abajo y podrás elegirlas en la acción “Enviar WhatsApp” de
                una automatización.
              </li>
            </ul>
          </div>

          {!r.ok ? (
            <p className="rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo">
              No se pudieron cargar las plantillas: {r.error}
              <br />
              <span className="text-xs text-carbon/60">
                Configura <span className="font-mono">WHATSAPP_TOKEN</span> y{" "}
                <span className="font-mono">WHATSAPP_WABA_ID</span> en las variables de entorno o mediante el flujo de
                conexión.
              </span>
            </p>
          ) : r.plantillas.length === 0 ? (
            <p className="rounded-lg border border-dashed border-carbon/15 p-8 text-center text-sm text-carbon/40">
              No hay plantillas en tu cuenta de WhatsApp Business todavía. Créalas en Meta y, al aprobarse, aparecerán
              aquí.
            </p>
          ) : (
            <div className="space-y-2">
              {r.plantillas.map((p) => (
                <div key={`${p.nombre}-${p.idioma}`} className="rounded-lg border border-carbon/10 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-titular font-medium text-verde-profundo">{p.nombre}</span>
                    <span className="font-mono text-xs text-carbon/40">{p.idioma}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        COLOR_ESTADO[p.estado] ?? "bg-carbon/10 text-carbon/50"
                      }`}
                    >
                      {p.estado}
                    </span>
                    <span className="rounded-full bg-carbon/5 px-2 py-0.5 text-xs text-carbon/50">{p.categoria}</span>
                    {p.parametros > 0 && (
                      <span className="text-xs text-carbon/50">
                        {p.parametros} parámetro{p.parametros === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  {p.cuerpo && (
                    <p className="mt-2 whitespace-pre-line rounded-md bg-crema/40 p-2 text-xs text-carbon/60">
                      {p.cuerpo}
                    </p>
                  )}
                  {p.components && p.components.length > 0 && (
                    <div className="mt-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-carbon/40">
                        Estructura de Meta (JSON):
                      </span>
                      <pre className="mt-1 max-h-48 overflow-y-auto overflow-x-auto rounded-md bg-carbon/5 p-2 text-[10px] font-mono text-carbon/60">
                        {JSON.stringify(p.components, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
