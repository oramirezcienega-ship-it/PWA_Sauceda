"use client";

import React, { useState, useEffect, useCallback } from "react";

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

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

/** Carga e inicializa de forma asíncrona y segura el SDK de Facebook */
function asegurarSdkFacebook(targetAppId: string): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("Window no disponible"));

  if (window.FB) {
    try {
      window.FB.init({
        appId: targetAppId,
        autoLogAppEvents: true,
        xfbml: true,
        version: "v21.0",
      });
    } catch (e) {
      console.warn("FB.init error:", e);
    }
    return Promise.resolve(window.FB);
  }

  return new Promise((resolve, reject) => {
    window.fbAsyncInit = function () {
      if (window.FB) {
        try {
          window.FB.init({
            appId: targetAppId,
            autoLogAppEvents: true,
            xfbml: true,
            version: "v21.0",
          });
        } catch (e) {
          console.warn("FB.init error:", e);
        }
        resolve(window.FB);
      } else {
        reject(new Error("No se pudo inicializar window.FB"));
      }
    };

    const id = "facebook-jssdk";
    let script = document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = id;
      script.src = "https://connect.facebook.net/es_LA/sdk.js";
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error("No se pudo cargar el SDK de Facebook. Si tienes un bloqueador de anuncios (AdBlock), desactívalo temporalmente."));
      document.head.appendChild(script);
    } else {
      let intentos = 0;
      const interval = setInterval(() => {
        intentos++;
        if (window.FB) {
          clearInterval(interval);
          try {
            window.FB.init({
              appId: targetAppId,
              autoLogAppEvents: true,
              xfbml: true,
              version: "v21.0",
            });
          } catch (e) {
            console.warn("FB.init error:", e);
          }
          resolve(window.FB);
        } else if (intentos > 25) {
          clearInterval(interval);
          reject(new Error("Tiempo de espera agotado al cargar el SDK de Facebook."));
        }
      }, 200);
    }
  });
}

export function WhatsAppCoexistenciaSignup() {
  const [sdkListo, setSdkListo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [cargandoStatus, setCargandoStatus] = useState(true);
  const [estado, setEstado] = useState<WhatsAppStatusData | null>(null);
  const [notificacion, setNotificacion] = useState<{ tipo: "exito" | "error" | "info"; mensaje: string } | null>(null);
  const [pasoActual, setPasoActual] = useState<string | null>(null);
  const [datosSesion, setDatosSesion] = useState<{ wabaId?: string; phoneNumberId?: string }>({});

  // Campos para configuración manual / inline
  const [mostrarConfigManual, setMostrarConfigManual] = useState(false);
  const [formAppId, setFormAppId] = useState("");
  const [formConfigId, setFormConfigId] = useState("");
  const [formAppSecret, setFormAppSecret] = useState("");
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  const appId =
    process.env.NEXT_PUBLIC_META_APP_ID ||
    process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ||
    estado?.config?.appId ||
    formAppId ||
    "";

  const configId =
    process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID ||
    estado?.config?.configId ||
    formConfigId ||
    "";

  // Cargar estado actual de conexión
  const cargarEstado = useCallback(async () => {
    try {
      setCargandoStatus(true);
      const res = await fetch("/api/whatsapp/embedded-signup/status");
      const data = await res.json();
      if (data.ok) {
        setEstado(data);
        if (data.config.appId) setFormAppId(data.config.appId);
        if (data.config.configId) setFormConfigId(data.config.configId);
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

  // Cargar SDK automáticamente en cuanto tengamos appId
  useEffect(() => {
    if (!appId) return;

    asegurarSdkFacebook(appId)
      .then(() => setSdkListo(true))
      .catch((err) => {
        console.warn("Aviso SDK:", err.message);
      });
  }, [appId]);

  // Escuchar mensajes de postMessage de Meta Embedded Signup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.includes("facebook.com")) return;

      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        if (data.type === "WA_EMBEDDED_SIGNUP") {
          console.log("[Meta Embedded Signup Event]", data);

          if (data.event === "FINISH") {
            const { phone_number_id, waba_id } = data.data || {};
            setDatosSesion((prev) => ({
              ...prev,
              wabaId: waba_id || prev.wabaId,
              phoneNumberId: phone_number_id || prev.phoneNumberId,
            }));
            setPasoActual("Flujo completado en la ventana de Meta. Procesando registro...");
          } else if (data.event === "CANCEL") {
            setPasoActual("Flujo cancelado por el usuario.");
            setCargando(false);
          } else if (data.event === "ERROR") {
            setNotificacion({
              tipo: "error",
              mensaje: `Error en Meta Signup: ${data.data?.error_message || "Error desconocido"}`,
            });
            setCargando(false);
          }
        }
      } catch {
        // Mensaje no relevante
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Guardar configuración manual
  const guardarConfiguracion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAppId || !formConfigId) {
      setNotificacion({ tipo: "error", mensaje: "Por favor ingresa tanto el Meta App ID como el Configuration ID." });
      return;
    }

    setGuardandoConfig(true);
    setNotificacion(null);

    try {
      const res = await fetch("/api/whatsapp/embedded-signup/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: formAppId,
          configId: formConfigId,
          appSecret: formAppSecret || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotificacion({ tipo: "exito", mensaje: "¡Credenciales guardadas con éxito! Inicializando SDK..." });
        setMostrarConfigManual(false);
        await cargarEstado();

        // Inicializar SDK de inmediato
        try {
          await asegurarSdkFacebook(formAppId);
          setSdkListo(true);
        } catch (sdkErr: any) {
          console.warn(sdkErr);
        }
      } else {
        setNotificacion({ tipo: "error", mensaje: data.error || "No se pudo guardar la configuración." });
      }
    } catch (err: any) {
      setNotificacion({ tipo: "error", mensaje: err.message || "Error de red al guardar." });
    } finally {
      setGuardandoConfig(false);
    }
  };

  // Lanzar ventana emergente de Embedded Signup
  const iniciarEmbeddedSignup = async () => {
    setNotificacion(null);

    if (!appId) {
      setMostrarConfigManual(true);
      setNotificacion({
        tipo: "error",
        mensaje: "Por favor ingresa tu Meta App ID en el formulario de configuración.",
      });
      return;
    }

    if (!configId) {
      setMostrarConfigManual(true);
      setNotificacion({
        tipo: "error",
        mensaje: "Por favor ingresa tu Configuration ID (Login Configuration) en el formulario de configuración.",
      });
      return;
    }

    setCargando(true);
    setPasoActual("Cargando SDK de Meta e iniciando ventana de Coexistencia...");

    try {
      const fb = await asegurarSdkFacebook(appId);
      setSdkListo(true);

      fb.login(
        async function (response: any) {
          console.log("[FB.login Response]", response);

          if (response.authResponse?.code) {
            const code = response.authResponse.code;
            setPasoActual("Código de autorización recibido. Intercambiando credenciales en el servidor...");

            try {
              const res = await fetch("/api/whatsapp/embedded-signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  code,
                  wabaId: datosSesion.wabaId,
                  phoneNumberId: datosSesion.phoneNumberId,
                }),
              });

              const resultado = await res.json();

              if (resultado.ok) {
                setNotificacion({
                  tipo: "exito",
                  mensaje:
                    "¡WhatsApp Coexistence configurado exitosamente! El número ha sido vinculado y registrado en Cloud API manteniendo activo el acceso en la app móvil.",
                });
                await cargarEstado();
              } else {
                setNotificacion({
                  tipo: "error",
                  mensaje: `Error al registrar: ${resultado.error || "No se pudo completar el intercambio."}`,
                });
              }
            } catch (backendErr: any) {
              setNotificacion({
                tipo: "error",
                mensaje: `Error de red con el servidor: ${backendErr.message}`,
              });
            } finally {
              setCargando(false);
              setPasoActual(null);
            }
          } else {
            setCargando(false);
            setPasoActual(null);
            if (response.status !== "connected") {
              setNotificacion({
                tipo: "info",
                mensaje: "Inicio de sesión no completado o ventana cerrada.",
              });
            }
          }
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: "whatsapp_coexistence",
            sessionInfoVersion: "3",
          },
        }
      );
    } catch (err: any) {
      console.error("Error al ejecutar FB.login:", err);
      setCargando(false);
      setPasoActual(null);
      setNotificacion({
        tipo: "error",
        mensaje: `Error al abrir ventana de Meta: ${err.message}`,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner Informativo sobre Coexistencia */}
      <div className="rounded-2xl border border-verde-chile/30 bg-gradient-to-br from-verde-profundo/5 via-crema/40 to-sauce/10 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full bg-verde-profundo/10 px-3 py-1 text-xs font-semibold text-verde-profundo">
              <span>📱</span> Modo Coexistencia Oficial de WhatsApp
            </div>
            <h2 className="text-xl font-bold text-verde-profundo">
              Vincular WhatsApp (App Móvil + Cloud API Simultáneos)
            </h2>
            <p className="text-xs md:text-sm text-carbon/70 max-w-2xl leading-relaxed">
              El modo de <strong>Coexistencia</strong> permite atender clientes directamente desde la aplicación de{" "}
              <strong>WhatsApp Business en tu teléfono móvil</strong> y, al mismo tiempo, recibir los mensajes en el{" "}
              <strong>CRM Web / Sofía IA</strong> sin desconectar ni bloquear la cuenta.
            </p>
          </div>

          <div className="shrink-0 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => setMostrarConfigManual((prev) => !prev)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-carbon/20 bg-white px-3.5 py-2.5 text-xs font-semibold text-carbon shadow-sm hover:bg-carbon/5 transition"
            >
              <span>⚙️</span>
              <span>{mostrarConfigManual ? "Ocultar IDs" : "Configurar IDs"}</span>
            </button>

            <button
              onClick={iniciarEmbeddedSignup}
              disabled={cargando}
              className="flex items-center justify-center gap-2 rounded-xl bg-verde-profundo px-5 py-3 text-sm font-semibold text-white shadow-md hover:bg-verde-chile transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg active:scale-95"
            >
              {cargando ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <span className="text-base">🚀</span>
                  <span>Conectar WhatsApp con Coexistencia</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Formulario de Configuración Manual de IDs */}
        {mostrarConfigManual && (
          <form onSubmit={guardarConfiguracion} className="mt-5 pt-5 border-t border-carbon/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-verde-profundo flex items-center gap-2">
                <span>🔑</span> Ingresa tus IDs de Meta Developers
              </h3>
              <span className="text-[11px] text-carbon/50">
                Obtenidos en <span className="font-mono">developers.facebook.com</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-medium text-carbon/70 mb-1">Meta App ID (*)</label>
                <input
                  type="text"
                  value={formAppId}
                  onChange={(e) => setFormAppId(e.target.value)}
                  placeholder="Ej. 1864394571206909"
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-carbon focus:border-verde-profundo focus:outline-none font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-carbon/70 mb-1">Configuration ID (Login Config) (*)</label>
                <input
                  type="text"
                  value={formConfigId}
                  onChange={(e) => setFormConfigId(e.target.value)}
                  placeholder="Ej. 987654321098765"
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-carbon focus:border-verde-profundo focus:outline-none font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-carbon/70 mb-1">App Secret (Opcional)</label>
                <input
                  type="password"
                  value={formAppSecret}
                  onChange={(e) => setFormAppSecret(e.target.value)}
                  placeholder="Secreto de la App"
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-carbon focus:border-verde-profundo focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMostrarConfigManual(false)}
                className="px-3 py-1.5 rounded-lg border border-carbon/20 text-xs font-medium text-carbon/70 hover:bg-carbon/5"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoConfig}
                className="px-4 py-1.5 rounded-lg bg-verde-profundo text-xs font-semibold text-white hover:bg-verde-chile shadow-sm disabled:opacity-50"
              >
                {guardandoConfig ? "Guardando..." : "Guardar Credenciales"}
              </button>
            </div>
          </form>
        )}

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
              <span>🔍</span> Diagnóstico de Conexión
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
              <span className="text-carbon/60">Meta App ID:</span>
              <span className="font-mono font-medium text-carbon">
                {appId ? `${appId.slice(0, 6)}...${appId.slice(-4)}` : "❌ No configurado"}
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-carbon/5">
              <span className="text-carbon/60">Config ID (Embedded):</span>
              <span className="font-mono font-medium text-carbon">
                {configId ? `${configId.slice(0, 6)}...${configId.slice(-4)}` : "❌ No configurado"}
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-carbon/5">
              <span className="text-carbon/60">WABA ID:</span>
              <span className="font-mono font-medium text-carbon">
                {estado?.config?.wabaId || "Sin registrar"}
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-carbon/5">
              <span className="text-carbon/60">Phone Number ID:</span>
              <span className="font-mono font-medium text-carbon">
                {estado?.config?.phoneId || "Sin registrar"}
              </span>
            </div>

            <div className="flex justify-between items-center py-1.5">
              <span className="text-carbon/60">SDK de Facebook:</span>
              <span
                className={`font-semibold ${
                  sdkListo ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                {sdkListo ? "● Listo en navegador" : "○ Cargando SDK..."}
              </span>
            </div>
          </div>
        </div>

        {/* Tarjeta de Estado del Número en Meta */}
        <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm space-y-3">
          <h3 className="font-semibold text-sm text-carbon flex items-center gap-2">
            <span>📞</span> Estado del Número en Meta Cloud API
          </h3>

          {cargandoStatus ? (
            <div className="py-8 text-center text-xs text-carbon/40">Cargando estado en vivo...</div>
          ) : estado?.meta?.enVivo && estado.meta.detalles ? (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-carbon/5">
                <span className="text-carbon/60">Número Registrado:</span>
                <span className="font-semibold font-mono text-verde-profundo text-sm">
                  {estado.meta.detalles.display_phone_number || "No disponible"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-carbon/5">
                <span className="text-carbon/60">Nombre Comercial:</span>
                <span className="font-medium text-carbon">
                  {estado.meta.detalles.verified_name || "Sin nombre verificado"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-carbon/5">
                <span className="text-carbon/60">Calidad de Envío:</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                  {estado.meta.detalles.quality_rating || "GREEN (Buena)"}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5">
                <span className="text-carbon/60">Modo Coexistencia:</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-verde-profundo/10 text-verde-profundo">
                  ● Habilitado y Activo
                </span>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-carbon/50 space-y-2">
              <p>No se ha detectado un número vinculado en vivo.</p>
              <p className="text-[11px] text-carbon/40">
                Haz clic en el botón de arriba para iniciar el flujo de vinculación asistida.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Guía Paso a Paso para el Usuario */}
      <div className="rounded-xl border border-carbon/10 bg-white p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-sm text-carbon flex items-center gap-2">
          <span>📋</span> Guía para Configurar el Modo Coexistencia
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="rounded-lg border border-carbon/10 bg-carbon/5 p-3.5 space-y-1.5">
            <div className="font-bold text-verde-profundo flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-verde-profundo text-white inline-flex items-center justify-center text-[10px]">
                1
              </span>
              <span>Preparar App Móvil</span>
            </div>
            <p className="text-carbon/70 leading-relaxed">
              Descarga e instala <strong>WhatsApp Business</strong> en tu teléfono móvil con el número de la empresa
              antes de iniciar el flujo.
            </p>
          </div>

          <div className="rounded-lg border border-carbon/10 bg-carbon/5 p-3.5 space-y-1.5">
            <div className="font-bold text-verde-profundo flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-verde-profundo text-white inline-flex items-center justify-center text-[10px]">
                2
              </span>
              <span>Lanzar Embedded Signup</span>
            </div>
            <p className="text-carbon/70 leading-relaxed">
              Haz clic en <strong>Conectar WhatsApp</strong>. Selecciona tu cuenta comercial de Meta y autoriza los
              permisos solicitados.
            </p>
          </div>

          <div className="rounded-lg border border-carbon/10 bg-carbon/5 p-3.5 space-y-1.5">
            <div className="font-bold text-verde-profundo flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-verde-profundo text-white inline-flex items-center justify-center text-[10px]">
                3
              </span>
              <span>Listo para Trabajar</span>
            </div>
            <p className="text-carbon/70 leading-relaxed">
              El sistema completará el registro en Cloud API. Podrás responder desde el teléfono o desde este CRM
              indistintamente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
