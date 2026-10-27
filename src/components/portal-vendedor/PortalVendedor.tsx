"use client";

import { useState } from "react";
import type { PortalCliente } from "@/app/actions/asesoria-compra";
import { GaleriaFotosExpediente } from "@/components/GaleriaFotosExpediente";
import { validarPinExpediente } from "@/app/actions/expedientes";

interface Props {
  portal: PortalCliente;
  token: string;
}

interface DatosSensibles {
  direccionCompleta: string;
  saldoDeuda: number;
  valorEstimado: number;
  tipoCredito: string;
  tieneEscritura: boolean | null;
  expedienteInfonavit: string | null;
  tieneAdeudos: boolean | null;
  descripcionAdeudos: string;
  propiedadOcupada: boolean | null;
  nombreOcupante: string;
}

function formatMoney(n: number | null | undefined): string {
  if (!n) return "$0 MXN";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}

const ETAPAS_VENTA = [
  { id: "1", nombre: "Ficha Preliminar", desc: "Recepción de datos básicos y fotografías", icono: "📋", hecho: true },
  { id: "2", nombre: "Dictamen Notarial", desc: "Análisis de mercado y revisión jurídica sin costo", icono: "⚖️", actual: true },
  { id: "3", nombre: "Inspección Física", desc: "Visita del asesor y confirmación técnica", icono: "📸", pendiente: true },
  { id: "4", nombre: "Promoción Dirigida", desc: "Presentación a compradores precalificados en lista", icono: "🎯", pendiente: true },
  { id: "5", nombre: "Firma en Notaría", desc: "Formalización de compraventa y liquidación de hipoteca", icono: "🏛️", pendiente: true },
];

export function PortalVendedor({ portal, token }: Props) {
  const [bovedaDesbloqueada, setBovedaDesbloqueada] = useState(false);
  const [pin, setPin] = useState("");
  const [errorPin, setErrorPin] = useState<string | null>(null);
  const [validandoPin, setValidandoPin] = useState(false);
  const [datosSensibles, setDatosSensibles] = useState<DatosSensibles | null>(null);

  async function handleDesbloquearBoveda(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) {
      setErrorPin("Ingresa los 4 dígitos de tu PIN.");
      return;
    }
    setErrorPin(null);
    setValidandoPin(true);

    try {
      const res = await validarPinExpediente(token, pin.trim());
      if (!res.ok) {
        setErrorPin(res.error || "PIN incorrecto. Ingresa los últimos 4 dígitos de tu teléfono registrado.");
      } else {
        setDatosSensibles(res.datosSensibles || null);
        setBovedaDesbloqueada(true);
      }
    } catch {
      setErrorPin("Ocurrió un error al validar. Intenta nuevamente.");
    } finally {
      setValidandoPin(false);
    }
  }

  const zonaNombre = portal.fraccionamiento || "León, Guanajuato";
  const numCompradores = portal.compradoresEnZona || 3;

  return (
    <main className="min-h-screen bg-slate-50 pb-16 text-carbon font-cuerpo">
      {/* Header Institucional */}
      <header className="bg-verde-profundo px-4 py-6 text-white shadow-md">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-dorado">
                SAUCEDA Bienes Raíces
              </p>
              <h1 className="font-titular text-2xl font-bold mt-1">
                Portal del Propietario · {portal.primerNombre || "Bienvenido"}
              </h1>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-full text-xs font-medium text-dorado border border-dorado/30">
              🔒 Respaldo Notarial
            </span>
          </div>
          {portal.asesorNombre && (
            <p className="text-xs text-white/70 mt-2 flex items-center gap-1">
              <span>Asesor asignado:</span>
              <strong className="text-white font-semibold">{portal.asesorNombre}</strong>
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-6">
        {/* Radar de Compradores en Espera (Gancho de Confianza y Valor) */}
        <section className="rounded-2xl border-2 border-dorado/40 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-3xl">🎯</span>
            <div className="flex-1">
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-dorado/20 text-amber-900 px-2 py-0.5 rounded-full mb-1">
                Radar de Cartera Sauceda
              </span>
              <h2 className="font-titular text-lg font-bold text-verde-profundo">
                {numCompradores} compradores calificados buscando en {zonaNombre}
              </h2>
              <p className="text-xs text-carbon/70 mt-1 leading-relaxed">
                Tenemos familias con crédito INFONAVIT / Bancario autorizado con presupuesto activo de{" "}
                <strong className="text-carbon">$750,000 a $1,450,000 MXN</strong> interesadas en esta zona.
              </p>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-sauce font-semibold">
                <span>✓</span>
                <span>Tu casa tendrá prioridad de presentación al completar las fotografías y dictamen.</span>
              </div>
            </div>
          </div>
        </section>

        {/* Estatus del Proceso (Línea de Tiempo) */}
        <section className="rounded-2xl border border-carbon/10 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-carbon/50">Estatus hacia la Notaría</p>
              <h3 className="font-titular text-lg text-verde-profundo mt-0.5">
                {portal.etapaNombre || "Contacto y Dictamen Inicial"}
              </h3>
            </div>
            <span className="text-xs bg-sauce/10 text-sauce font-bold px-3 py-1 rounded-full">
              Paso 2 de 5
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
            {ETAPAS_VENTA.map((paso, idx) => (
              <div
                key={paso.id}
                className={`flex flex-col p-2.5 rounded-xl border text-left transition ${
                  paso.hecho
                    ? "bg-emerald-50/60 border-emerald-200 text-verde-profundo"
                    : paso.actual
                    ? "bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/20 text-carbon font-semibold"
                    : "bg-slate-50/50 border-slate-200 text-carbon/40"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-base">{paso.icono}</span>
                  <span className="text-[10px] font-mono font-bold text-carbon/40">#{idx + 1}</span>
                </div>
                <p className="text-xs font-bold leading-tight">{paso.nombre}</p>
                <p className="text-[10px] text-carbon/60 mt-1 line-clamp-2 leading-tight">{paso.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-carbon/70 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
            💡 <strong>Siguiente paso:</strong> Integrar de 3 a 5 fotografías de la vivienda para elaborar la ficha técnica preliminar y coordinar la visita física de valoración con tu asesor.
          </p>
        </section>

        {/* Galería de Fotos de la Vivienda (Capa 1: Pública y editable) */}
        {portal.expedienteId && (
          <section className="rounded-2xl border border-carbon/10 bg-white p-5 shadow-sm space-y-3">
            <div className="border-b border-slate-100 pb-2">
              <h3 className="font-titular text-lg font-bold text-verde-profundo flex items-center gap-2">
                <span>📸</span> Fotografías de tu Propiedad
              </h3>
              <p className="text-xs text-carbon/60">
                Puedes subir fotos directamente desde la cámara o galería de tu celular (fachada, sala, recámaras y patio).
              </p>
            </div>

            <GaleriaFotosExpediente expedienteId={portal.expedienteId} />
          </section>
        )}

        {/* Bóveda Notarial (Capa 2: Protegida con PIN de 4 dígitos) */}
        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">{bovedaDesbloqueada ? "🔓" : "🔒"}</span>
              <div>
                <h3 className="font-titular text-sm font-bold tracking-wide">
                  Bóveda Notarial y Documentación Oficial
                </h3>
                <p className="text-[11px] text-slate-300">
                  Protegido bajo estricto secreto profesional y aviso de privacidad notarial
                </p>
              </div>
            </div>
            {bovedaDesbloqueada && (
              <span className="text-[11px] bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                Verificado
              </span>
            )}
          </div>

          <div className="p-5">
            {!bovedaDesbloqueada ? (
              <div className="max-w-md mx-auto text-center py-4 space-y-4">
                <p className="text-xs text-carbon/70 leading-relaxed">
                  Para proteger tus escrituras, adeudos y datos personales de terceros, ingresa los{" "}
                  <strong className="text-carbon">últimos 4 dígitos de tu teléfono registrado</strong> en WhatsApp:
                </p>

                <form onSubmit={handleDesbloquearBoveda} className="space-y-3">
                  <div className="flex justify-center">
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      placeholder="••••"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      className="w-36 text-center text-2xl tracking-[0.4em] font-mono font-bold bg-slate-50 border-2 border-slate-300 rounded-xl px-3 py-2 focus:border-verde-profundo focus:bg-white focus:outline-none transition shadow-inner"
                    />
                  </div>

                  {errorPin && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 font-medium">
                      {errorPin}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={validandoPin || pin.length < 4}
                    className="inline-flex items-center justify-center gap-2 bg-verde-profundo hover:bg-sauce disabled:opacity-50 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition shadow-sm w-full sm:w-auto"
                  >
                    {validandoPin ? "Verificando..." : "Desbloquear Bóveda Notarial"}
                  </button>
                </form>

                <p className="text-[11px] text-carbon/40">
                  ¿Tienes problemas con tu PIN? Solicítalo en cualquier momento a través de nuestro chat de WhatsApp.
                </p>
              </div>
            ) : (
              <div className="space-y-4 animate-fadeIn">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-carbon/50 block">
                      Tipo de Crédito / Gravamen
                    </span>
                    <p className="text-sm font-bold text-verde-profundo mt-0.5">
                      {datosSensibles?.tipoCredito || "INFONAVIT / Por verificar"}
                    </p>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-carbon/50 block">
                      Saldo Estimado de Deuda
                    </span>
                    <p className="text-sm font-bold text-verde-profundo mt-0.5">
                      {formatMoney(datosSensibles?.saldoDeuda)}
                    </p>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-carbon/50 block">
                      Valor Proyectado de Mercado
                    </span>
                    <p className="text-sm font-bold text-verde-profundo mt-0.5">
                      {formatMoney(datosSensibles?.valorEstimado)}
                    </p>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-carbon/50 block">
                      Estatus de Escritura
                    </span>
                    <p className="text-sm font-bold text-verde-profundo mt-0.5">
                      {datosSensibles?.tieneEscritura ? "Escritura pública en mano" : "En análisis notarial"}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-carbon/60">
                  <span>✓ Información verificada y resguardada con cifrado notarial.</span>
                  <button
                    onClick={() => setBovedaDesbloqueada(false)}
                    className="text-xs text-sauce hover:underline font-semibold"
                  >
                    Bloquear Bóveda
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Botón de Asistencia WhatsApp */}
        <div className="text-center pt-2">
          <a
            href="https://wa.me/5214774654700"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition"
          >
            <span>💬</span> Hablar con mi asesor por WhatsApp
          </a>
          <p className="text-[11px] text-carbon/40 mt-2">
            SAUCEDA Bienes Raíces · León, Guanajuato. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </main>
  );
}
