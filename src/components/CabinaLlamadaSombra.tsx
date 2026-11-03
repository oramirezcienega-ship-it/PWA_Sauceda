"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  llamadaId: string;
  vapiCallId?: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  listenUrl?: string | null;
  onCerrar?: () => void;
}

export function CabinaLlamadaSombra({
  llamadaId,
  vapiCallId,
  clienteNombre,
  clienteTelefono,
  listenUrl: initialListenUrl,
  onCerrar,
}: Props) {
  const [listenUrl, setListenUrl] = useState<string | null>(initialListenUrl || null);
  const [conectadoSombra, setConectadoSombra] = useState(false);
  const [audioActivo, setAudioActivo] = useState(true);
  const [intervenido, setIntervenido] = useState(false);
  const [cargandoIntervencion, setCargandoIntervencion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volumenNivel, setVolumenNivel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const twilioDeviceRef = useRef<any>(null);
  const activeCallRef = useRef<any>(null);

  // 1. Obtener listenUrl si no vino inicial
  useEffect(() => {
    if (listenUrl || !vapiCallId) return;
    let cancelado = false;
    const fetchMonitor = async () => {
      try {
        const res = await fetch(`/api/conmutador/monitor?id=${llamadaId}`);
        const data = await res.json();
        if (!cancelado && data.ok && data.listenUrl) {
          setListenUrl(data.listenUrl);
        }
      } catch (e) {
        console.warn("No se pudo obtener monitorUrl:", e);
      }
    };
    fetchMonitor();
    return () => {
      cancelado = true;
    };
  }, [llamadaId, vapiCallId, listenUrl]);

  // 2. Conectar al WebSocket de audio en vivo (Modo Sombra para AirPods)
  useEffect(() => {
    if (!listenUrl || intervenido) return;

    let ctx: AudioContext | null = null;
    let ws: WebSocket | null = null;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AudioCtx({ sampleRate: 16000 });
      audioContextRef.current = ctx;

      ws = new WebSocket(listenUrl);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      let nextStartTime = ctx.currentTime;

      ws.onopen = () => {
        setConectadoSombra(true);
      };

      ws.onmessage = (event) => {
        if (!audioActivo || !ctx) return;
        if (typeof event.data === "string") {
          return; // Metadatos iniciales
        }

        // Buffer PCM lineal 16-bit
        const rawBuffer = event.data as ArrayBuffer;
        const int16Array = new Int16Array(rawBuffer);
        const float32Array = new Float32Array(int16Array.length);

        let sumSquares = 0;
        for (let i = 0; i < int16Array.length; i++) {
          const sample = int16Array[i] / 32768;
          float32Array[i] = sample;
          sumSquares += sample * sample;
        }

        const rms = Math.sqrt(sumSquares / int16Array.length);
        setVolumenNivel(Math.min(100, Math.round(rms * 400)));

        if (ctx.state === "suspended") {
          ctx.resume();
        }

        const audioBuffer = ctx.createBuffer(1, float32Array.length, 16000);
        audioBuffer.copyToChannel(float32Array, 0);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        const now = ctx.currentTime;
        const start = Math.max(now, nextStartTime);
        source.start(start);
        nextStartTime = start + audioBuffer.duration;
      };

      ws.onerror = (e) => {
        console.warn("[CabinaSombra] WebSocket error:", e);
      };

      ws.onclose = () => {
        setConectadoSombra(false);
      };
    } catch (err: any) {
      console.error("[CabinaSombra] Error inicializando Web Audio:", err);
    }

    return () => {
      if (ws) ws.close();
      if (ctx) ctx.close().catch(() => {});
    };
  }, [listenUrl, audioActivo, intervenido]);

  // 3. Inicializar Twilio Voice SDK en segundo plano para estar listos para la intervención
  useEffect(() => {
    let montado = true;

    async function initTwilioWebRTC() {
      try {
        // Cargar script de Twilio si no está presente
        if (!(window as any).Twilio?.Device) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://media.twiliocdn.com/sdk/js/voice/v2.11/twilio.min.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("No se pudo cargar Twilio Voice SDK"));
            document.body.appendChild(script);
          });
        }

        if (!montado) return;

        // Obtener Access Token
        const res = await fetch("/api/conmutador/voice-token?identity=oscar");
        const data = await res.json();
        if (!data.ok || !data.token) {
          console.warn("No se pudo obtener el voice token de Twilio:", data.error);
          return;
        }

        const Twilio = (window as any).Twilio;
        const device = new Twilio.Device(data.token, {
          codecPreferences: ["opus", "pcmu"],
          fakeLocalDTMF: true,
          enableRingingState: true,
        });

        twilioDeviceRef.current = device;
        await device.register();

        device.on("incoming", (call: any) => {
          activeCallRef.current = call;
          call.accept(); // Acepta la llamada transferida inmediatamente en los AirPods
          setIntervenido(true);
          setCargandoIntervencion(false);

          // Cerrar el stream sombra para evitar eco
          if (wsRef.current) wsRef.current.close();
          if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
        });

        device.on("error", (err: any) => {
          console.warn("Twilio Device error:", err);
        });
      } catch (e: any) {
        console.warn("Error inicializando Twilio WebRTC:", e);
      }
    }

    initTwilioWebRTC();

    return () => {
      montado = false;
      if (activeCallRef.current) activeCallRef.current.disconnect();
      if (twilioDeviceRef.current) twilioDeviceRef.current.destroy();
    };
  }, []);

  // 4. Acción de Intervención: tomar la llamada
  const ejecutarIntervencion = async () => {
    setCargandoIntervencion(true);
    setError(null);
    try {
      const res = await fetch("/api/conmutador/intervenir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llamadaId, identity: "oscar" }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "No se pudo transferir la llamada.");
      }
    } catch (err: any) {
      setError(err?.message || "Error al intervenir llamada.");
      setCargandoIntervencion(false);
    }
  };

  // 5. Colgar llamada activa
  const colgarLlamada = () => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
    }
    if (onCerrar) onCerrar();
  };

  return (
    <div className="rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-b from-emerald-950/90 to-slate-950 p-5 text-white shadow-2xl backdrop-blur-md animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-xl border border-emerald-500/40">
            {intervenido ? "🎙️" : "🎧"}
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-emerald-400 uppercase tracking-wider">
                {intervenido ? "EN VIVO CON EL CLIENTE" : "MODO SOMBRA ACTIVO (AIRPODS)"}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                {clienteTelefono}
              </span>
            </div>
            <p className="text-xs text-white/70">
              Cliente: <strong className="text-white">{clienteNombre || "Prospecto"}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!intervenido && (
            <button
              type="button"
              onClick={() => setAudioActivo(!audioActivo)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                audioActivo
                  ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                  : "border-white/20 bg-white/5 text-white/50"
              }`}
            >
              {audioActivo ? "🔊 Audio AirPods: ON" : "🔇 Audio AirPods: MUTE"}
            </button>
          )}

          {onCerrar && (
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-lg border border-white/10 p-1.5 text-xs text-white/60 hover:bg-white/10"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-950/60 p-2.5 text-xs text-red-200">
          ⚠️ {error}
        </div>
      )}

      {/* Ecualizador Visual de Voz */}
      <div className="my-4 flex items-center justify-between rounded-xl bg-black/40 border border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60">Actividad de Audio:</span>
          <div className="flex items-end gap-1 h-5">
            {[40, 70, 100, 60, 90, 50, 80].map((h, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-emerald-400 transition-all duration-75"
                style={{
                  height: conectadoSombra ? `${Math.max(15, (volumenNivel * h) / 100)}%` : "15%",
                  opacity: conectadoSombra ? 0.9 : 0.2,
                }}
              />
            ))}
          </div>
        </div>

        <span className="text-[11px] text-white/50 font-mono">
          {intervenido
            ? "Tus AirPods están transmitiendo tu voz al cliente."
            : conectadoSombra
            ? "Escuchando en tiempo real · Tu micrófono está apagado."
            : "Conectando audio en sombra..."}
        </span>
      </div>

      {/* Controles de Acción */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {!intervenido ? (
          <>
            <p className="text-xs text-white/60 max-w-md">
              Sofía está llevando la llamada. Si necesitas corregir, responder una duda o amarrar la visita técnica tú
              mismo:
            </p>
            <button
              type="button"
              disabled={cargandoIntervencion}
              onClick={ejecutarIntervencion}
              className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-red-500 active:scale-95 disabled:opacity-50"
            >
              <span>🚨</span>
              <span>{cargandoIntervencion ? "Transfiriendo a AirPods…" : "INTERVENIR / TOMAR LLAMADA"}</span>
            </button>
          </>
        ) : (
          <div className="w-full flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              Llamada en curso: Hablando directamente por AirPods
            </span>
            <button
              type="button"
              onClick={colgarLlamada}
              className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-red-500"
            >
              Finalizar y Colgar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
