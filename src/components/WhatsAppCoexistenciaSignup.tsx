"use client";

import React, { useState, useEffect, useCallback } from "react";

interface WhatsAppStatusData {
  config: {
    appIdConfigurado: boolean;
    appId: string | null;
    configIdConfigurado: boolean;
    configId: string | null;
    phoneId: string | null;
    wabaId: string | null;
    tokenConfigurado: boolean;
    coexistenciaActiva: boolean;
    lastSync: string | null;
    displayName: string | null;
    verifiedName: string | null;
  };
  meta: {
    enVivo: boolean;
    detalles: {
      id?: string;
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      code_verification_status?: string;
      name_status?: string;
      status?: string;
    } | null;
    error?: string;
  };
}

export function WhatsAppCoexistenciaSignup() {
  const [cargandoStatus, setCargandoStatus] = useState(true);
  const [estado, setEstado] = useState<WhatsAppStatusData | null>(null);
  const [notificacion, setNotificacion] = useState<{ tipo: "exito" | "error" | "info"; mensaje: string } | null>(null);
  const [pasoActual, setPasoActual] = useState<string | null>(null);

  // Formulario de PIN de Coexistencia
  const [pin, setPin] = useState("123456");
  const [tokenMeta, setTokenMeta] = useState("");
  const [phoneId, setPhoneId] = useState("1186997567823002");
  const [wabaId, setWabaId] = useState("1022532766970452");
  const [guardandoPin, setGuardandoPin] = useState(false);

  // Cargar estado actual de conexión
  const cargarEstado = useCallback(async () => {
    try {
      setCargandoStatus(true);
      const res = await fetch("/api/whatsapp/embedded-signup/status");
      const data = await res.json();
      if (data.ok) {
        setEstado(data);
        if (data.config.phoneId) setPhoneId(data.config.phoneId);
        if (data.config.wabaId) setWabaId(data.config.wabaId);
      }
    } catch (err) {
      console.error("Error al cargar estado de WhatsApp:", err);
    } finally {
      setCargandoStatus(false);
    }
  }, []);

  useEffect(() => {
    cargarEstado();
  }, [cargarEstado]);

  // Registrar PIN en Meta Cloud API
  const registrarPinCoexistencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setNotificacion({ tipo: "error", mensaje: "El PIN debe ser exactamente de 6 dígitos numéricos (ej. 123456)." });
      return;
    }

    if (!phoneId) {
      setNotificacion({ tipo: "error", mensaje: "Por favor ingresa tu Phone Number ID de Meta." });
      return;
    }

    if (!tokenMeta && !estado?.config?.tokenConfigurado) {
      setNotificacion({
        tipo: "error",
        mensaje: "Por favor copia y pega el Token de Acceso desde developers.facebook.com > WhatsApp > Configuración de la API.",
      });
      return;
    }

    setGuardandoPin(true);
    setPasoActual("Registrando PIN de 6 dígitos en Meta Cloud API...");
    setNotificacion(null);

    try {
      const res = await fetch("/api/whatsapp/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          token: tokenMeta || undefined,
          phoneId: phoneId.trim(),
          wabaId: wabaId ? wabaId.trim() : undefined,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setNotificacion({
          tipo: "exito",
          mensaje: `✅ ¡PIN (${pin}) registrado exitosamente en Meta Cloud API para el Phone ID ${phoneId}! Ahora abre WhatsApp Business en tu celular, ingresa tu número y coloca este PIN (${pin}) para completar la Coexistencia.`,
        });
        await cargarEstado();
      } else {
        setNotificacion({
          tipo: "error",
          mensaje: `Aviso de Meta: ${data.error || "No se pudo registrar el PIN."}`,
        });
      }
    } catch (err: any) {
      setNotificacion({
        tipo: "error",
        mensaje: `Error de red al registrar PIN: ${err.message}`,
      });
    } finally {
      setGuardandoPin(false);
      setPasoActual(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner Informativo sobre Coexistencia */}
      <div className="rounded-2xl border border-verde-chile/30 bg-gradient-to-br from-verde-profundo/5 via-crema/40 to-sauce/10 p-6 shadow-sm">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-verde-profundo/10 px-3 py-1 text-xs font-semibold text-verde-profundo">
            <span>📱</span> Modo Coexistencia Oficial (App Móvil + Cloud API)
          </div>
          <h2 className="text-xl font-bold text-verde-profundo">
            Habilitar Coexistencia para tu número de WhatsApp
          </h2>
          <p className="text-xs md:text-sm text-carbon/70 max-w-3xl leading-relaxed">
            Registra el <strong>PIN de 6 dígitos</strong> en Meta Cloud API para tu identificador de teléfono. Luego abre
            WhatsApp Business en el móvil e introduce este mismo PIN para que funcionen juntos simultáneamente.
          </p>
        </div>

        {/* Formulario para registrar PIN en Cloud API */}
        <form onSubmit={registrarPinCoexistencia} className="mt-6 pt-5 border-t border-carbon/10 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-verde-profundo flex items-center gap-2">
              <span>🔐</span> Paso 1: Configurar credenciales y registrar PIN en Meta
            </h3>
            <span className="text-[11px] text-carbon/50">
              Datos de <span className="font-mono">developers.facebook.com &gt; WhatsApp</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block font-medium text-carbon/70 mb-1">
                PIN de 6 dígitos (*)
              </label>
              <input
                type="text"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-carbon focus:border-verde-profundo focus:outline-none font-mono font-bold text-base tracking-widest text-center"
                required
              />
              <span className="text-[10px] text-carbon/50 block mt-1">
                PIN para el celular.
              </span>
            </div>

            <div>
              <label className="block font-medium text-carbon/70 mb-1">
                Phone Number ID (*)
              </label>
              <input
                type="text"
                value={phoneId}
                onChange={(e) => setPhoneId(e.target.value)}
                placeholder="Identificador del teléfono"
                className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-carbon focus:border-verde-profundo focus:outline-none font-mono text-xs"
                required
              />
              <span className="text-[10px] text-carbon/50 block mt-1">
                De WhatsApp &gt; Configuración API
              </span>
            </div>

            <div>
              <label className="block font-medium text-carbon/70 mb-1">
                WABA ID (Opcional)
              </label>
              <input
                type="text"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                placeholder="ID cuenta WhatsApp Business"
                className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-carbon focus:border-verde-profundo focus:outline-none font-mono text-xs"
              />
              <span className="text-[10px] text-carbon/50 block mt-1">
                ID de la cuenta WABA
              </span>
            </div>

            <div>
              <label className="block font-medium text-carbon/70 mb-1">
                Token de Acceso (*)
              </label>
              <input
                type="password"
                value={tokenMeta}
                onChange={(e) => setTokenMeta(e.target.value)}
                placeholder="Pega el Token de Meta"
                className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-carbon focus:border-verde-profundo focus:outline-none font-mono text-xs"
              />
              <span className="text-[10px] text-carbon/50 block mt-1">
                Token del Sistema / Producción
              </span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={guardandoPin}
              className="flex items-center justify-center gap-2 rounded-xl bg-verde-profundo px-6 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-verde-chile transition-all disabled:opacity-50 hover:shadow-lg active:scale-95"
            >
              {guardandoPin ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Registrando PIN en Meta...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>Registrar PIN y Habilitar Coexistencia</span>
                </>
              )}
            </button>
          </div>
        </form>

        {pasoActual && (
          <div className="mt-4 rounded-xl bg-cielo/10 border border-cielo/30 p-3 text-xs text-cielo font-medium flex items-center gap-2">
            <span className="animate-pulse">⏳</span>
            <span>{pasoActual}</span>
          </div>
        )}

        {notificacion && (
          <div
            className={`mt-4 rounded-xl p-4 text-xs md:text-sm font-medium border flex items-start gap-2.5 ${
              notificacion.tipo === "exito"
                ? "bg-verde-chile/10 border-verde-chile/30 text-verde-profundo"
                : notificacion.tipo === "error"
                ? "bg-rojo/10 border-rojo/30 text-rojo"
                : "bg-carbon/5 border-carbon/15 text-carbon"
            }`}
          >
            <span className="text-base shrink-0">
              {notificacion.tipo === "exito" ? "✅" : notificacion.tipo === "error" ? "⚠️" : "ℹ️"}
            </span>
            <div className="flex-1 leading-relaxed">{notificacion.mensaje}</div>
          </div>
        )}
      </div>

      {/* Estado del Número y Diagnóstico en Vivo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tarjeta de Diagnóstico */}
        <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-carbon flex items-center gap-2">
              <span>🔍</span> Diagnóstico de Identificadores
            </h3>
            <button
              onClick={cargarEstado}
              disabled={cargandoStatus}
              className="text-xs text-verde-profundo hover:underline flex items-center gap-1"
            >
              <span>🔄</span> Actualizar
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-carbon/5">
              <span className="text-carbon/60">Phone Number ID:</span>
              <span className="font-mono font-medium text-carbon">
                {phoneId}
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-carbon/5">
              <span className="text-carbon/60">WABA ID:</span>
              <span className="font-mono font-medium text-carbon">
                {wabaId}
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5">
              <span className="text-carbon/60">Modo de Operación:</span>
              <span className="font-semibold text-emerald-600">
                ● Coexistencia Cloud API + App Móvil
              </span>
            </div>
          </div>
        </div>

        {/* Tarjeta de Instrucciones para el Móvil */}
        <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm space-y-3">
          <h3 className="font-semibold text-sm text-carbon flex items-center gap-2">
            <span>📲</span> Paso 2: Iniciar en el Celular
          </h3>

          <div className="space-y-2 text-xs text-carbon/70 leading-relaxed">
            <p>
              1. Una vez presionado el botón <strong>&quot;Registrar PIN&quot;</strong> arriba:
            </p>
            <p>
              2. Abre <strong>WhatsApp Business</strong> en tu teléfono móvil.
            </p>
            <p>
              3. Ingresa tu número de teléfono.
            </p>
            <p>
              4. Cuando la app te pida el <strong>PIN de verificación en 2 pasos</strong>, escribe el mismo PIN (ej.{" "}
              <span className="font-mono font-bold text-verde-profundo">{pin}</span>).
            </p>
            <p className="font-medium text-verde-profundo pt-1">
              ✨ ¡Listo! Tu teléfono quedará activo sin desconectar el CRM ni la IA.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
