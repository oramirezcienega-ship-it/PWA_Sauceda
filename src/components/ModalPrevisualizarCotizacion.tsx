"use client";

import React, { useState, useEffect } from "react";
import { formatoPesos } from "@/lib/formato";
import type { Cotizacion, CotizacionConcepto, VisitaReporte } from "@/lib/types";

export interface ModalPrevisualizarCotizacionProps {
  abierto: boolean;
  onCerrar: () => void;
  cotizacion: Cotizacion;
  conceptos: CotizacionConcepto[];
  reporteVisita?: VisitaReporte | null;
  baseEnlace: string;
  onEnviarWhatsAppAPI: (mensajePersonalizado?: string, enviarComoDocumentoPdf?: boolean) => Promise<{ ok: boolean; mensaje?: string; error?: string }>;
  onEnviarCorreo: (datos: { correoDestino: string; asunto: string; notasAdicionales: string }) => Promise<{ ok: boolean; mensaje?: string; error?: string }>;
  onCotizacionActualizada?: (cambios: Partial<Cotizacion>) => void;
}

export function ModalPrevisualizarCotizacion({
  abierto,
  onCerrar,
  cotizacion,
  conceptos,
  reporteVisita,
  baseEnlace,
  onEnviarWhatsAppAPI,
  onEnviarCorreo,
  onCotizacionActualizada,
}: ModalPrevisualizarCotizacionProps) {
  const [pestaña, setPestaña] = useState<"whatsapp" | "email">("whatsapp");
  const [enviarWsp, setEnviarWsp] = useState<boolean>(true);
  const [enviarEmail, setEnviarEmail] = useState<boolean>(false);
  const [enviarPdfWsp, setEnviarPdfWsp] = useState<boolean>(false);
  const [telefonoCliente, setTelefonoCliente] = useState<string>("");
  const [correoDestino, setCorreoDestino] = useState<string>("");
  const [asuntoEmail, setAsuntoEmail] = useState<string>("");
  const [notasEmail, setNotasEmail] = useState<string>("");
  const [mensajeWsp, setMensajeWsp] = useState<string>("");
  const [editandoWsp, setEditandoWsp] = useState<boolean>(false);
  const [procesando, setProcesando] = useState<boolean>(false);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [copiado, setCopiado] = useState<boolean>(false);

  const primerNombre = cotizacion.prospectoNombre?.split(" ")[0] || "Cliente";
  const portalUrl = `${baseEnlace}/cotizacion/${cotizacion.token}`;
  const pdfCotizacionUrl = `/api/cotizaciones/${cotizacion.token}/pdf`;
  const pdfReporteUrl = `/api/cotizaciones/${cotizacion.token}/pdf?tipo=reporte`;
  const totalMonto = cotizacion.precioFinal || cotizacion.costoEstimado || 0;

  const servicioLabels: Record<string, string> = {
    impermeabilizacion: "Impermeabilización",
    pintura: "Pintura & Acabados",
    losa: "Construcción de Losa",
    remodelacion: "Remodelación Integral",
  };
  const servicioNombre = servicioLabels[cotizacion.servicioTipo] || cotizacion.servicioTipo || "Servicio de Construcción";

  // Generador de texto base de WhatsApp
  const generarTextoBaseWhatsApp = () => {
    return `¡Hola ${primerNombre}! 👋 Te compartimos la propuesta comercial y cotización para el servicio de *${servicioNombre}* en tu domicilio.\n\n📄 *Folio:* ${cotizacion.id}\n💰 *Inversión:* ${formatoPesos(totalMonto)}\n\nEn el siguiente enlace puedes revisar a detalle el desglose de conceptos, garantías y autorizarla en línea por sistema:\n👉 ${portalUrl}\n\nQuedamos a tus órdenes para cualquier duda o ajuste. ¡Excelente día! 💚`;
  };

  useEffect(() => {
    if (abierto) {
      const tel = cotizacion.prospectoTelefono || "";
      const email = cotizacion.prospectoCorreo || "";
      setTelefonoCliente(tel);
      setCorreoDestino(email);
      setAsuntoEmail(`Propuesta Comercial y Cotización - Folio ${cotizacion.id} · SAUCEDA`);
      setNotasEmail("");
      setEnviarWsp(Boolean(tel && tel.replace(/\D/g, "").length >= 10));
      setEnviarEmail(Boolean(email && email.includes("@")));
      setEnviarPdfWsp(false);
      setMensajeWsp(generarTextoBaseWhatsApp());
      setEditandoWsp(false);
      setResultado(null);
    }
  }, [abierto, cotizacion]);

  if (!abierto) return null;

  const handleCopiarEnlace = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleDescargarPdfCotizacion = () => {
    window.open(pdfCotizacionUrl, "_blank", "noopener,noreferrer");
  };

  const handleDescargarPdfReporte = () => {
    window.open(pdfReporteUrl, "_blank", "noopener,noreferrer");
  };

  const handleAbrirWhatsAppWeb = () => {
    const telLimpio = telefonoCliente.replace(/\D/g, "");
    const url = `https://wa.me/${telLimpio}?text=${encodeURIComponent(mensajeWsp)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleEnviarMulticanal = async () => {
    if (!enviarWsp && !enviarEmail) {
      setResultado({
        tipo: "error",
        texto: "Selecciona al menos un canal de envío (WhatsApp o Correo Electrónico).",
      });
      return;
    }

    try {
      setProcesando(true);
      setResultado(null);

      const mensajesExito: string[] = [];
      const errores: string[] = [];

      // 1. Envío por WhatsApp
      if (enviarWsp) {
        if (!telefonoCliente.trim() || telefonoCliente.replace(/\D/g, "").length < 10) {
          errores.push("WhatsApp: El teléfono del cliente es inválido o menor a 10 dígitos.");
        } else {
          const resWsp = await onEnviarWhatsAppAPI(mensajeWsp, enviarPdfWsp);
          if (resWsp.ok) {
            mensajesExito.push(enviarPdfWsp ? "WhatsApp (con PDF adjunto) ✓" : "WhatsApp ✓");
          } else {
            errores.push(`WhatsApp: ${resWsp.error || "Fallo en el envío"}`);
          }
        }
      }

      // 2. Envío por Correo Electrónico (con PDF adjunto)
      if (enviarEmail) {
        if (!correoDestino.trim() || !correoDestino.includes("@")) {
          errores.push("Correo: Ingresa una dirección de correo válida.");
        } else {
          const resEmail = await onEnviarCorreo({
            correoDestino: correoDestino.trim(),
            asunto: asuntoEmail.trim() || `Cotización ${cotizacion.id}`,
            notasAdicionales: notasEmail.trim(),
          });
          if (resEmail.ok) {
            mensajesExito.push("Correo (con PDF adjunto) ✓");
          } else {
            errores.push(`Correo: ${resEmail.error || "Fallo en el envío"}`);
          }
        }
      }

      if (errores.length === 0) {
        setResultado({
          tipo: "ok",
          texto: `¡Propuesta enviada con éxito! (${mensajesExito.join(", ")})`,
        });
        if (onCotizacionActualizada) {
          onCotizacionActualizada({
            estatus: cotizacion.estatus === "aprobada" ? "enviada" : cotizacion.estatus,
            prospectoCorreo: correoDestino.trim() || cotizacion.prospectoCorreo,
          });
        }
        setTimeout(() => {
          onCerrar();
        }, 2200);
      } else if (mensajesExito.length > 0) {
        setResultado({
          tipo: "ok",
          texto: `Parcialmente enviado: ${mensajesExito.join(", ")}. Errores: ${errores.join(" | ")}`,
        });
      } else {
        setResultado({
          tipo: "error",
          texto: errores.join(" | "),
        });
      }
    } catch (err) {
      setResultado({
        tipo: "error",
        texto: err instanceof Error ? err.message : "Error inesperado al procesar el envío.",
      });
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-carbon/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-carbon/10 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="bg-verde-profundo text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl p-2 bg-white/10 rounded-xl">📤</span>
            <div>
              <h3 className="font-titular text-base sm:text-lg font-bold">
                Previsualizar y Enviar Cotización
              </h3>
              <p className="text-xs text-crema/80">
                Folio <strong>{cotizacion.id}</strong> · Revisa y personaliza los mensajes antes de enviar al cliente
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={procesando}
            className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Barra Superior con Datos Clave y Acciones Rápidas */}
        <div className="bg-slate-50 border-b border-carbon/10 p-3 sm:p-4 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-center">
            <div>
              <span className="text-carbon/50 block font-medium">Cliente</span>
              <strong className="text-carbon block truncate">{cotizacion.prospectoNombre || "Sin nombre"}</strong>
              <span className="text-carbon/60 text-[11px]">{telefonoCliente || "Sin teléfono"}</span>
            </div>
            <div>
              <span className="text-carbon/50 block font-medium">Servicio & Folio</span>
              <strong className="text-carbon block capitalize truncate">{servicioNombre}</strong>
              <span className="text-verde-profundo font-mono text-[11px] font-bold">{cotizacion.id}</span>
            </div>
            <div>
              <span className="text-carbon/50 block font-medium">Monto Total</span>
              <strong className="text-emerald-700 block font-mono text-sm">{formatoPesos(totalMonto)}</strong>
              <span className="text-carbon/50 text-[10px]">IVA Incluido</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleDescargarPdfCotizacion}
                  className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-300 px-2 py-1 text-[10px] sm:text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 transition w-full justify-center shadow-2xs cursor-pointer truncate"
                  title="Abre o descarga el documento PDF oficial de la Cotización"
                >
                  <span>📄</span>
                  <span>PDF Cotización</span>
                </button>
                {(reporteVisita || cotizacion.requiereVisita) && (
                  <button
                    type="button"
                    onClick={handleDescargarPdfReporte}
                    className="inline-flex items-center gap-1 rounded bg-sauce/10 border border-sauce/30 px-2 py-1 text-[10px] sm:text-[11px] font-bold text-sauce hover:bg-sauce/20 transition w-full justify-center shadow-2xs cursor-pointer truncate"
                    title="Abre o descarga la Ficha Técnica de Inspección en PDF"
                  >
                    <span>📋</span>
                    <span>PDF Reporte</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleCopiarEnlace}
                className="inline-flex items-center gap-1.5 rounded bg-white border border-carbon/20 px-2.5 py-1 text-[11px] font-semibold text-carbon hover:bg-slate-100 transition w-full justify-center cursor-pointer"
              >
                <span>🔗</span>
                <span>{copiado ? "¡Copiado!" : "Copiar Enlace Portal"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Pestañas de Previsualización */}
        <div className="flex border-b border-carbon/10 px-4 pt-3 bg-white gap-2">
          <button
            type="button"
            onClick={() => setPestaña("whatsapp")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer ${
              pestaña === "whatsapp"
                ? "border-[#25D366] text-carbon bg-[#25D366]/5 rounded-t-lg"
                : "border-transparent text-carbon/50 hover:text-carbon"
            }`}
          >
            <span className="text-base">💬</span>
            <span>WhatsApp</span>
            {enviarWsp && <span className="w-2 h-2 rounded-full bg-[#25D366]"></span>}
          </button>

          <button
            type="button"
            onClick={() => setPestaña("email")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer ${
              pestaña === "email"
                ? "border-sauce text-carbon bg-sauce/5 rounded-t-lg"
                : "border-transparent text-carbon/50 hover:text-carbon"
            }`}
          >
            <span className="text-base">✉️</span>
            <span>Correo Electrónico (con PDF)</span>
            {enviarEmail && correoDestino.includes("@") && (
              <span className="w-2 h-2 rounded-full bg-sauce"></span>
            )}
          </button>
        </div>

        {/* Mensaje de Resultado (Alerta) */}
        {resultado && (
          <div
            className={`mx-4 mt-3 p-3.5 rounded-xl text-xs font-medium border flex flex-col gap-2 ${
              resultado.tipo === "ok"
                ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                : "bg-red-50 text-red-900 border-red-300"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <span className="text-base">{resultado.tipo === "ok" ? "✅" : "⚠️"}</span>
                <span className="leading-relaxed">{resultado.texto}</span>
              </div>
              <button
                type="button"
                onClick={() => setResultado(null)}
                className="text-carbon/40 hover:text-carbon font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {resultado.tipo === "error" && telefonoCliente && (
              <div className="pt-1 border-t border-red-200 flex items-center justify-between flex-wrap gap-2">
                <span className="text-[11px] text-red-700">
                  ¿Prefieres enviarlo de inmediato por tu WhatsApp Web sin restricciones de API?
                </span>
                <button
                  type="button"
                  onClick={handleAbrirWhatsAppWeb}
                  className="inline-flex items-center gap-1.5 bg-[#25D366] hover:bg-[#128C7E] text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.37 5.054L2 22l5.13-1.346a9.945 9.945 0 004.88 1.28c5.505 0 9.988-4.478 9.989-9.984C22.01 6.477 17.528 2 12.012 2zm6.36 14.195c-.277.78-1.6 1.436-2.23 1.5-1.12.1-3.21-.6-5.71-3.1-2.07-2.07-3.07-4.14-3.07-5.13 0-1.12.77-1.74 1.1-2.04.28-.26.54-.3.72-.3.17 0 .34 0 .5.01.16 0 .38-.06.58.42.2.49.7 1.7.77 1.83.07.13.1.28.01.46-.09.18-.18.3-.32.46-.14.16-.3.36-.43.48-.15.14-.3.29-.13.58.18.29.8 1.3 1.7 2.1.86.76 1.8 1.14 2.1 1.28.3.14.47.12.65-.08.18-.2.78-.9.98-1.2.2-.3.4-.26.68-.16.27.1 1.73.81 2.03.96.3.15.5.22.58.36.08.14.08.82-.2 1.6z"/>
                  </svg>
                  <span>Abrir en WhatsApp Web Ahora</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Contenido de la Previsualización */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* PESTAÑA WHATSAPP */}
          {pestaña === "whatsapp" && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-carbon/10 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enviarWsp}
                      onChange={(e) => setEnviarWsp(e.target.checked)}
                      className="w-4 h-4 rounded text-[#25D366] focus:ring-[#25D366] cursor-pointer"
                    />
                    <span className="text-xs font-bold text-carbon">
                      Enviar cotización por WhatsApp al {telefonoCliente || "(Sin teléfono)"}
                    </span>
                  </label>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setMensajeWsp(generarTextoBaseWhatsApp());
                        setEditandoWsp(false);
                      }}
                      className="text-[11px] text-sauce hover:underline font-semibold cursor-pointer"
                    >
                      Restablecer texto original
                    </button>
                  </div>
                </div>

                {/* Switch para enviar como Documento PDF adjunto directo */}
                <div className="pt-2 border-t border-carbon/10 flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enviarPdfWsp}
                      onChange={(e) => setEnviarPdfWsp(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                    />
                    <span className="text-xs text-carbon/80 font-medium">
                      📄 Adjuntar y enviar archivo PDF directo (vía API oficial de Meta)
                    </span>
                  </label>
                  {enviarPdfWsp && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                      Documento PDF Activo
                    </span>
                  )}
                </div>
              </div>

              {/* Burbuja estilo WhatsApp */}
              <div className="rounded-xl border border-carbon/15 bg-[#EFEAE2] p-4 relative overflow-hidden shadow-inner">
                <div className="text-[10px] text-carbon/40 text-center mb-3 uppercase tracking-wider font-semibold">
                  Previsualización exacta del chat
                </div>

                <div className="flex justify-end">
                  <div className="max-w-[90%] sm:max-w-[80%] bg-[#DCF8C6] text-carbon rounded-2xl rounded-tr-xs p-3.5 shadow-xs text-xs space-y-2 border border-[#b8e59e]">
                    {enviarPdfWsp && (
                      <div className="bg-white/80 border border-carbon/15 rounded-xl p-2.5 flex items-center gap-3 mb-1">
                        <span className="text-2xl">📕</span>
                        <div className="flex-1 min-w-0">
                          <strong className="block text-xs text-carbon truncate">Cotizacion-{cotizacion.id}.pdf</strong>
                          <span className="text-[10px] text-carbon/60">Documento PDF Oficial · SAUCEDA</span>
                        </div>
                      </div>
                    )}
                    <div className="whitespace-pre-wrap leading-relaxed font-sans text-carbon/90 text-[11px] sm:text-xs">
                      {mensajeWsp}
                    </div>
                    <div className="flex items-center justify-end gap-1 text-[10px] text-carbon/50 pt-1">
                      <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="text-[#34B7F1] font-bold">✓✓</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Editor de Mensaje WhatsApp */}
              <div>
                <label className="block text-xs font-bold text-carbon/70 mb-1">
                  Editar texto del mensaje antes de enviar:
                </label>
                <textarea
                  rows={5}
                  value={mensajeWsp}
                  onChange={(e) => {
                    setMensajeWsp(e.target.value);
                    setEditandoWsp(true);
                  }}
                  className="w-full rounded-xl border border-carbon/20 bg-white p-3 text-xs font-mono text-carbon focus:border-[#25D366] focus:outline-none leading-relaxed"
                  placeholder="Escribe el mensaje de WhatsApp..."
                />
                <div className="flex justify-between text-[10px] text-carbon/50 mt-0.5">
                  <span>Tip: Los enlaces y saltos de línea se enviarán tal como los redactes.</span>
                  <span>{mensajeWsp.length} caracteres</span>
                </div>
              </div>
            </div>
          )}

          {/* PESTAÑA CORREO */}
          {pestaña === "email" && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-carbon/10 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enviarEmail}
                      onChange={(e) => setEnviarEmail(e.target.checked)}
                      className="w-4 h-4 rounded text-sauce focus:ring-sauce cursor-pointer"
                    />
                    <span className="text-xs font-bold text-carbon">
                      Enviar propuesta formal por correo electrónico
                    </span>
                  </label>

                  <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 px-2.5 py-1 rounded-lg text-[11px] font-semibold">
                    <span>📎</span>
                    <span>Adjunta automáticamente: <strong>Cotizacion-{cotizacion.id}.pdf</strong></span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-carbon/70 mb-1">
                      Correo del destinatario:
                    </label>
                    <input
                      type="email"
                      value={correoDestino}
                      onChange={(e) => {
                        setCorreoDestino(e.target.value);
                        if (e.target.value.includes("@")) setEnviarEmail(true);
                      }}
                      placeholder="cliente@ejemplo.com"
                      className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
                    />
                    {!correoDestino && (
                      <span className="text-[10px] text-amber-600 block mt-1">
                        ⚠️ El prospecto no tiene correo registrado. Escríbelo aquí para enviárselo.
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-carbon/70 mb-1">
                      Asunto del correo:
                    </label>
                    <input
                      type="text"
                      value={asuntoEmail}
                      onChange={(e) => setAsuntoEmail(e.target.value)}
                      placeholder="Asunto..."
                      className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-carbon/70 mb-1">
                    Notas adicionales en el correo (Opcional):
                  </label>
                  <input
                    type="text"
                    value={notasEmail}
                    onChange={(e) => setNotasEmail(e.target.value)}
                    placeholder="Ej. Favor de revisar la propuesta adjunta para iniciar el lunes..."
                    className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs text-carbon focus:border-sauce focus:outline-none"
                  />
                </div>
              </div>

              {/* Vista Previa del Correo HTML */}
              <div className="border border-carbon/15 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-slate-100 border-b border-carbon/15 px-3 py-2 text-xs flex items-center justify-between">
                  <span className="font-medium text-carbon/70">
                    Asunto: <strong>{asuntoEmail}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-bold">
                      📎 PDF Adjunto
                    </span>
                    <span className="text-[10px] bg-white px-2 py-0.5 rounded text-carbon/60 font-mono">
                      HTML Branded
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-[#F5F1E8] text-xs">
                  <div className="max-w-md mx-auto bg-white rounded-xl shadow-xs overflow-hidden border border-carbon/10">
                    <div className="bg-[#2D4A2B] p-5 text-center text-white">
                      <div className="font-bold text-sm tracking-wider">SAUCEDA CONSTRUCCIÓN & SERVICIOS</div>
                      <div className="text-[10px] text-[#C9A961] tracking-widest uppercase mt-1">
                        Propuesta Comercial & Presupuesto
                      </div>
                    </div>

                    <div className="p-5 space-y-3.5 text-xs text-carbon">
                      <p className="text-carbon/90">
                        Estimado(a) <strong>{cotizacion.prospectoNombre || "Cliente"}</strong>,
                      </p>
                      <p className="text-carbon/70 leading-relaxed text-[11px]">
                        Es un gusto saludarte. Te compartimos la propuesta comercial formal para el servicio de <strong>{servicioNombre}</strong> en tu inmueble (Folio <strong>{cotizacion.id}</strong>).
                      </p>

                      {notasEmail.trim() && (
                        <div className="bg-slate-50 border-l-4 border-sauce p-3 rounded-r-lg italic text-carbon/80 text-[11px]">
                          "{notasEmail.trim()}"
                        </div>
                      )}

                      {/* Tarjeta Resumen */}
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-carbon/10 space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-carbon/60">Folio:</span>
                          <span className="font-bold text-verde-profundo">{cotizacion.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-carbon/60">Servicio:</span>
                          <span className="font-semibold text-carbon">{servicioNombre}</span>
                        </div>
                        <div className="flex justify-between border-t border-carbon/10 pt-1 font-bold text-xs">
                          <span className="text-carbon/70">Monto Total:</span>
                          <span className="text-emerald-700 font-mono">{formatoPesos(totalMonto)}</span>
                        </div>
                      </div>

                      {/* Tabla de Conceptos */}
                      {conceptos.length > 0 && (
                        <div className="border border-carbon/10 rounded-lg overflow-hidden text-[10px]">
                          <table className="w-full text-left border-collapse">
                            <thead className="bg-[#2D4A2B] text-white text-[9px] uppercase">
                              <tr>
                                <th className="p-1.5">Concepto</th>
                                <th className="p-1.5 text-center">Cant</th>
                                <th className="p-1.5 text-right">Importe</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-carbon/10">
                              {conceptos.map((c, i) => (
                                <tr key={c.id || i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                                  <td className="p-1.5 text-carbon/80 font-medium">{c.descripcion}</td>
                                  <td className="p-1.5 text-center text-carbon/60">{c.cantidad} {c.unidad}</td>
                                  <td className="p-1.5 text-right font-mono text-carbon font-semibold">{formatoPesos(c.importe)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Badge de Documento Adjunto */}
                      <div className="bg-emerald-50 border border-emerald-200/80 p-2.5 rounded-lg flex items-center gap-2 text-emerald-900 text-[10px]">
                        <span>📎</span>
                        <span>Archivo adjunto incluido: <strong>Cotizacion-{cotizacion.id}.pdf</strong></span>
                      </div>

                      <div className="text-center pt-2">
                        <span className="inline-block bg-[#2D4A2B] text-white font-bold px-4 py-2 rounded-lg text-xs shadow-xs">
                          Ver Propuesta y Autorizar en Línea
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Botones del Pie */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-carbon/10 flex items-center justify-between flex-wrap gap-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={procesando}
            className="rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-semibold text-carbon/70 hover:bg-slate-100 transition cursor-pointer"
          >
            Cerrar
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Abrir directamente en WhatsApp Web */}
            <button
              type="button"
              onClick={handleAbrirWhatsAppWeb}
              disabled={procesando || !telefonoCliente}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#25D366] text-[#128C7E] px-3 py-2 text-xs font-semibold hover:bg-[#25D366]/10 transition cursor-pointer disabled:opacity-50"
              title="Abre WhatsApp Web en tu navegador con este mensaje listo para enviar"
            >
              <svg className="w-3.5 h-3.5 fill-current text-[#25D366]" viewBox="0 0 24 24">
                <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.37 5.054L2 22l5.13-1.346a9.945 9.945 0 004.88 1.28c5.505 0 9.988-4.478 9.989-9.984C22.01 6.477 17.528 2 12.012 2zm6.36 14.195c-.277.78-1.6 1.436-2.23 1.5-1.12.1-3.21-.6-5.71-3.1-2.07-2.07-3.07-4.14-3.07-5.13 0-1.12.77-1.74 1.1-2.04.28-.26.54-.3.72-.3.17 0 .34 0 .5.01.16 0 .38-.06.58.42.2.49.7 1.7.77 1.83.07.13.1.28.01.46-.09.18-.18.3-.32.46-.14.16-.3.36-.43.48-.15.14-.3.29-.13.58.18.29.8 1.3 1.7 2.1.86.76 1.8 1.14 2.1 1.28.3.14.47.12.65-.08.18-.2.78-.9.98-1.2.2-.3.4-.26.68-.16.27.1 1.73.81 2.03.96.3.15.5.22.58.36.08.14.08.82-.2 1.6z"/>
              </svg>
              <span>Abrir WhatsApp Web</span>
            </button>

            {/* Enviar Multicanal por CRM */}
            <button
              type="button"
              onClick={handleEnviarMulticanal}
              disabled={procesando || (!enviarWsp && !enviarEmail)}
              className="rounded-lg bg-verde-profundo hover:bg-sauce text-white px-4 py-2 text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {procesando ? (
                <>
                  <span className="animate-spin text-sm">⏳</span>
                  <span>Enviando propuesta...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>
                    Enviar Propuesta (
                    {enviarWsp ? "WhatsApp" : ""}
                    {enviarWsp && enviarEmail ? " + " : ""}
                    {enviarEmail ? "Correo" : ""}
                    {!enviarWsp && !enviarEmail ? "Selecciona canal" : ""}
                    )
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
