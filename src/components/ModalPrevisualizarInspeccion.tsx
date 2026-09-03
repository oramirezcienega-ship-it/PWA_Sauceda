"use client";

import React, { useState, useEffect } from "react";

export interface DatosPrevisualizacionInspeccion {
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail?: string | null;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  perfilId: string;
  asesorNombre: string;
  asesorTelefono?: string | null;
  telefonoContacto: string;
  notas?: string;
  tipoCita?: "inspeccion" | "instalacion" | "llamada" | "venta" | "asesoria";
  fechaPrevia?: string;
}

interface ModalPrevisualizarInspeccionProps {
  abierto: boolean;
  onCerrar: () => void;
  datos: DatosPrevisualizacionInspeccion;
  onConfirmar: (opciones: {
    mensajeWhatsApp: string;
    enviarWhatsApp: boolean;
    enviarEmail: boolean;
    emailDestino: string;
    telefonoContacto: string;
  }) => Promise<void>;
  procesando?: boolean;
  modoReagendar?: boolean;
}

export function ModalPrevisualizarInspeccion({
  abierto,
  onCerrar,
  datos,
  onConfirmar,
  procesando = false,
  modoReagendar = false,
}: ModalPrevisualizarInspeccionProps) {
  const [pestaña, setPestaña] = useState<"whatsapp" | "email">("whatsapp");
  const [enviarWsp, setEnviarWsp] = useState(true);
  const [enviarEmail, setEnviarEmail] = useState(false);
  const [emailInput, setEmailInput] = useState(datos.clienteEmail || "");
  const [telefonoContacto, setTelefonoContacto] = useState(datos.telefonoContacto || "477 465 4700");
  const [mensajeWsp, setMensajeWsp] = useState("");
  const [editandoWsp, setEditandoWsp] = useState(false);

  // Formateo de fecha
  const fechaObj = new Date(`${datos.fecha}T00:00:00`);
  const fechaLegible = !isNaN(fechaObj.getTime())
    ? fechaObj.toLocaleDateString("es-MX", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : datos.fecha;

  const primerNombre = datos.clienteNombre.split(" ")[0] || datos.clienteNombre;
  const esInspeccion = datos.tipoCita === "inspeccion" || !datos.tipoCita;

  // Generador de mensaje base de WhatsApp
  const generarTextoBaseWhatsApp = (tel: string) => {
    if (modoReagendar) {
      if (esInspeccion) {
        return `¡Hola ${primerNombre}! 🗓️ Te confirmamos que tu inspección técnica en sitio con SAUCEDA ha sido *reagendada* para el día:\n\n🗓️ *Nueva Fecha:* ${fechaLegible}\n⏰ *Horario:* ${datos.horaInicio} a ${datos.horaFin} hrs\n👷 *Asesor / Técnico que te visitará:* ${datos.asesorNombre}\n📞 *Teléfono de contacto:* ${tel}\n\nCualquier duda o ajuste de horario quedamos a tus órdenes respondiendo a este mensaje o comunicándote al número de contacto. ¡Que tengas un excelente día! 💚`;
      } else {
        return `¡Hola ${primerNombre}! 🗓️ Te confirmamos que tu cita de ${datos.tipoCita || "servicio"} con SAUCEDA ha sido *reagendada* para el día:\n\n🗓️ *Nueva Fecha:* ${fechaLegible}\n⏰ *Horario:* ${datos.horaInicio} a ${datos.horaFin} hrs\n👷 *Responsable:* ${datos.asesorNombre}\n📞 *Teléfono de contacto:* ${tel}\n\n¡Cualquier duda quedamos a tus órdenes! 💚`;
      }
    }

    if (esInspeccion) {
      return `¡Hola ${primerNombre}! 📅 Te confirmamos que tu inspección técnica en sitio con SAUCEDA ha quedado programada:\n\n🗓️ *Fecha:* ${fechaLegible}\n⏰ *Horario:* ${datos.horaInicio} a ${datos.horaFin} hrs\n👷 *Asesor / Técnico que te visitará:* ${datos.asesorNombre}\n📞 *Teléfono de contacto para cualquier tema:* ${tel}\n\nCualquier duda o cambio de horario quedamos a tus órdenes respondiendo a este mensaje o comunicándote al número de contacto. ¡Que tengas un excelente día! 💚`;
    } else {
      return `¡Hola ${primerNombre}! 🛠️ Te confirmamos que tu instalación profesional de impermeabilización con SAUCEDA ha quedado programada:\n\n🗓️ *Fecha:* ${fechaLegible}\n⏰ *Horario:* ${datos.horaInicio} a ${datos.horaFin} hrs\n👷 *Responsable que te visitará:* ${datos.asesorNombre}\n📞 *Teléfono de contacto:* ${tel}\n\nPor favor asegúrate de tener libre el acceso a la azotea. ¡Cualquier duda quedamos a tus órdenes! 💚`;
    }
  };

  useEffect(() => {
    if (abierto) {
      const tel = datos.telefonoContacto || datos.asesorTelefono || "477 465 4700";
      setTelefonoContacto(tel);
      setEmailInput(datos.clienteEmail || "");
      setEnviarEmail(Boolean(datos.clienteEmail && datos.clienteEmail.includes("@")));
      setEnviarWsp(true);
      setMensajeWsp(generarTextoBaseWhatsApp(tel));
      setEditandoWsp(false);
    }
  }, [abierto, datos, modoReagendar]);

  // Si cambia el teléfono de contacto y no se ha editado manualmente el WhatsApp, actualizar
  const handleCambioTelefonoContacto = (nuevoTel: string) => {
    setTelefonoContacto(nuevoTel);
    if (!editandoWsp) {
      setMensajeWsp(generarTextoBaseWhatsApp(nuevoTel));
    }
  };

  const handleAbrirWhatsAppWeb = () => {
    const telLimpio = (datos.clienteTelefono || "").replace(/\D/g, "");
    const telFinal = telLimpio.startsWith("52") && telLimpio.length >= 12
      ? telLimpio
      : telLimpio.length === 10
      ? `52${telLimpio}`
      : telLimpio;
    const url = `https://wa.me/${telFinal}?text=${encodeURIComponent(mensajeWsp)}`;
    window.open(url, "_blank");
  };

  if (!abierto) return null;

  const handleEnviar = async () => {
    await onConfirmar({
      mensajeWhatsApp: mensajeWsp,
      enviarWhatsApp: enviarWsp,
      enviarEmail: enviarEmail && Boolean(emailInput.includes("@")),
      emailDestino: emailInput.trim(),
      telefonoContacto,
    });
  };

  const handleGuardarSinEnviar = async () => {
    await onConfirmar({
      mensajeWhatsApp: "",
      enviarWhatsApp: false,
      enviarEmail: false,
      emailDestino: "",
      telefonoContacto,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-carbon/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-carbon/10 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className={`p-4 sm:p-5 flex items-center justify-between text-white ${modoReagendar ? "bg-amber-700" : "bg-verde-profundo"}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl p-2 bg-white/10 rounded-xl">{modoReagendar ? "🗓️" : "🔍"}</span>
            <div>
              <h3 className="font-titular text-base sm:text-lg font-bold">
                {modoReagendar ? "Previsualizar Reagendamiento de Cita" : `Previsualizar Confirmación de ${esInspeccion ? "Inspección Técnica" : "Cita"}`}
              </h3>
              <p className="text-xs text-crema/80">
                {modoReagendar
                  ? "Revisa el mensaje de reagendamiento antes de enviarlo por WhatsApp y/o correo"
                  : "Revisa el mensaje antes de enviarlo al cliente por WhatsApp y/o correo"}
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

        {/* Resumen Superior de la Cita */}
        <div className="bg-slate-50 border-b border-carbon/10 p-3 sm:p-4 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-carbon/50 block font-medium">Cliente</span>
              <strong className="text-carbon block truncate">{datos.clienteNombre}</strong>
              <span className="text-carbon/60 text-[11px]">{datos.clienteTelefono}</span>
            </div>
            <div>
              <span className="text-carbon/50 block font-medium">Fecha & Horario</span>
              <strong className="text-carbon block capitalize">{datos.fecha}</strong>
              <span className="text-carbon/60 text-[11px]">{datos.horaInicio} - {datos.horaFin} hrs</span>
            </div>
            <div>
              <span className="text-carbon/50 block font-medium">Asesor / Técnico</span>
              <strong className="text-verde-profundo block truncate">{datos.asesorNombre}</strong>
              <span className="text-carbon/60 text-[11px]">{datos.asesorTelefono || "Sin cel personal"}</span>
            </div>
            <div>
              <label className="text-carbon/70 block font-medium">Tel. Contacto en Mensaje</label>
              <input
                type="text"
                value={telefonoContacto}
                onChange={(e) => handleCambioTelefonoContacto(e.target.value)}
                placeholder="477 465 4700"
                className="mt-0.5 w-full rounded border border-carbon/20 bg-white px-2 py-1 text-xs font-semibold text-carbon focus:border-sauce focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Pestañas de Previsualización */}
        <div className="flex border-b border-carbon/10 px-4 pt-3 bg-white gap-2">
          <button
            type="button"
            onClick={() => setPestaña("whatsapp")}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer ${
              pestaña === "whatsapp"
                ? "border-[#25D366] text-carbon bg-[#25D366]/5 rounded-t-lg"
                : "border-transparent text-carbon/50 hover:text-carbon"
            }`}
          >
            <span>💬</span>
            WhatsApp
            {enviarWsp && <span className="w-2 h-2 rounded-full bg-[#25D366]"></span>}
          </button>

          <button
            type="button"
            onClick={() => setPestaña("email")}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer ${
              pestaña === "email"
                ? "border-sauce text-carbon bg-sauce/5 rounded-t-lg"
                : "border-transparent text-carbon/50 hover:text-carbon"
            }`}
          >
            <span>✉️</span>
            Correo Electrónico
            {enviarEmail && emailInput.includes("@") && (
              <span className="w-2 h-2 rounded-full bg-sauce"></span>
            )}
          </button>
        </div>

        {/* Contenido de la Previsualización */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {pestaña === "whatsapp" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enviarWsp}
                    onChange={(e) => setEnviarWsp(e.target.checked)}
                    className="w-4 h-4 rounded text-[#25D366] focus:ring-[#25D366] cursor-pointer"
                  />
                  <span className="text-xs font-bold text-carbon">
                    Enviar mensaje de confirmación por WhatsApp a {datos.clienteTelefono}
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMensajeWsp(generarTextoBaseWhatsApp(telefonoContacto));
                      setEditandoWsp(false);
                    }}
                    className="text-[11px] text-sauce hover:underline font-semibold cursor-pointer"
                  >
                    Restablecer texto original
                  </button>
                </div>
              </div>

              {/* Burbuja estilo WhatsApp */}
              <div className="rounded-xl border border-carbon/15 bg-[#EFEAE2] p-4 relative overflow-hidden shadow-inner">
                <div className="text-[10px] text-carbon/40 text-center mb-3 uppercase tracking-wider font-semibold">
                  Previsualización exacta del chat
                </div>

                <div className="flex justify-end">
                  <div className="max-w-[85%] sm:max-w-[75%] bg-[#DCF8C6] text-carbon rounded-2xl rounded-tr-xs p-3 shadow-xs text-xs space-y-2 border border-[#b8e59e]">
                    <div className="whitespace-pre-wrap leading-relaxed font-sans text-carbon/90">
                      {mensajeWsp}
                    </div>
                    <div className="flex items-center justify-end gap-1 text-[10px] text-carbon/50 pt-1">
                      <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="text-[#34B7F1] font-bold">✓✓</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Editor de Mensaje */}
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
                  placeholder="Escribe el mensaje..."
                />
                <p className="text-[10px] text-carbon/50 text-right mt-0.5">
                  {mensajeWsp.length} caracteres
                </p>
              </div>
            </div>
          )}

          {pestaña === "email" && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-carbon/15 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enviarEmail}
                    onChange={(e) => setEnviarEmail(e.target.checked)}
                    className="w-4 h-4 rounded text-sauce focus:ring-sauce cursor-pointer"
                  />
                  <span className="text-xs font-bold text-carbon">
                    Enviar confirmación por correo electrónico
                  </span>
                </label>

                <div className="pt-1">
                  <label className="block text-[11px] font-semibold text-carbon/70 mb-1">
                    Correo del cliente:
                  </label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      if (e.target.value.includes("@")) setEnviarEmail(true);
                    }}
                    placeholder="ejemplo@correo.com"
                    className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
                  />
                  {!emailInput && (
                    <span className="text-[11px] text-amber-600 block mt-1 font-medium">
                      ⚠️ El prospecto no tiene correo registrado. Puedes agregarlo aquí para enviarle la confirmación.
                    </span>
                  )}
                </div>
              </div>

              {/* Vista Previa del Correo */}
              <div className="border border-carbon/15 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-slate-100 border-b border-carbon/15 px-3 py-2 text-xs flex items-center justify-between">
                  <span className="font-medium text-carbon/70">
                    Asunto: <strong>{modoReagendar ? "🗓️ Cita Reagendada: Inspección Técnica - SAUCEDA" : "📅 Confirmación de Inspección Técnica - SAUCEDA"}</strong>
                  </span>
                  <span className="text-[10px] bg-white px-2 py-0.5 rounded text-carbon/60 font-mono">
                    HTML Branded
                  </span>
                </div>

                <div className="p-4 bg-[#F5F1E8] text-xs">
                  <div className="max-w-md mx-auto bg-white rounded-xl shadow-xs overflow-hidden border border-carbon/10">
                    <div className="bg-[#2D4A2B] p-4 text-center text-white">
                      <div className="font-bold text-sm tracking-wider">SAUCEDA</div>
                      <div className="text-[9px] text-[#C9A961] tracking-widest uppercase">
                        Construcción & Impermeabilización
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <h4 className="font-bold text-sm text-[#2D4A2B]">
                        {modoReagendar
                          ? `¡Hola, ${primerNombre}! Tu cita ha sido reagendada`
                          : `¡Hola, ${primerNombre}! Tu inspección técnica está confirmada`}
                      </h4>
                      <p className="text-carbon/70 text-xs leading-relaxed">
                        {modoReagendar
                          ? "Te confirmamos que tu visita técnica de valoración con el equipo de SAUCEDA ha sido reprogramada exitosamente. A continuación te compartimos los nuevos detalles:"
                          : "Nos complace confirmarte que tu visita técnica de valoración con el equipo de SAUCEDA ha quedado programada exitosamente:"}
                      </p>
                      <div className="bg-slate-50 p-3 rounded-lg border border-carbon/10 space-y-1 text-xs">
                        <div>🗓️ <strong>Fecha:</strong> {fechaLegible}</div>
                        <div>⏰ <strong>Horario:</strong> {datos.horaInicio} a {datos.horaFin} hrs</div>
                        <div>👷 <strong>Asesor/Técnico:</strong> {datos.asesorNombre}</div>
                        <div>📞 <strong>Contacto directo:</strong> {telefonoContacto}</div>
                      </div>
                      <div className="text-center pt-2">
                        <span className="inline-block bg-[#25D366] text-white font-bold px-3 py-1.5 rounded-lg text-xs">
                          💬 Contactar por WhatsApp
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
            Volver a Editar
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleAbrirWhatsAppWeb}
              disabled={procesando || !datos.clienteTelefono}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#25D366] text-[#128C7E] px-3 py-2 text-xs font-semibold hover:bg-[#25D366]/10 transition cursor-pointer disabled:opacity-50"
              title="Abre WhatsApp Web con este mensaje listo para enviar manualmente"
            >
              <svg className="w-3.5 h-3.5 fill-current text-[#25D366]" viewBox="0 0 24 24">
                <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.37 5.054L2 22l5.13-1.346a9.945 9.945 0 004.88 1.28c5.505 0 9.988-4.478 9.989-9.984C22.01 6.477 17.528 2 12.012 2zm6.36 14.195c-.277.78-1.6 1.436-2.23 1.5-1.12.1-3.21-.6-5.71-3.1-2.07-2.07-3.07-4.14-3.07-5.13 0-1.12.77-1.74 1.1-2.04.28-.26.54-.3.72-.3.17 0 .34 0 .5.01.16 0 .38-.06.58.42.2.49.7 1.7.77 1.83.07.13.1.28.01.46-.09.18-.18.3-.32.46-.14.16-.3.36-.43.48-.15.14-.3.29-.13.58.18.29.8 1.3 1.7 2.1.86.76 1.8 1.14 2.1 1.28.3.14.47.12.65-.08.18-.2.78-.9.98-1.2.2-.3.4-.26.68-.16.27.1 1.73.81 2.03.96.3.15.5.22.58.36.08.14.08.82-.2 1.6z"/>
              </svg>
              <span>Abrir WhatsApp Web</span>
            </button>

            <button
              type="button"
              onClick={handleGuardarSinEnviar}
              disabled={procesando}
              className="rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-semibold text-carbon/60 hover:text-carbon hover:bg-slate-100 transition cursor-pointer"
              title="Guarda el reagendamiento en la agenda sin disparar notificaciones automáticas"
            >
              Guardar sin Enviar
            </button>

            <button
              type="button"
              onClick={handleEnviar}
              disabled={procesando || (!enviarWsp && !enviarEmail)}
              className={`rounded-lg text-white px-4 py-2 text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                modoReagendar ? "bg-amber-600 hover:bg-amber-700" : "bg-verde-profundo hover:bg-sauce"
              }`}
            >
              {procesando ? (
                <>
                  <span className="animate-spin text-sm">⏳</span>
                  <span>{modoReagendar ? "Reagendando..." : "Enviando confirmación..."}</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>
                    {modoReagendar ? "Confirmar y Reagendar" : "Confirmar y Enviar"} (
                    {enviarWsp ? "WhatsApp" : ""}
                    {enviarWsp && enviarEmail ? " + " : ""}
                    {enviarEmail ? "Correo" : ""}
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
