"use client";

import { useCallback, useEffect, useState } from "react";
import {
  desvincularTelegramUsuarioAction,
  obtenerVinculacionTelegramAction,
  registrarWebhookTelegramAction,
  type EstadoVinculacionTelegram,
} from "@/app/actions/telegram-vinculacion";

const ROL: Record<string, string> = {
  admin: "Administrador",
  asesor: "Asesor",
  operaciones: "Operaciones / Instalador",
};

/**
 * Vincula a cada usuario con el bot de Telegram mediante un enlace personal:
 * el usuario lo abre en su celular, pulsa "Iniciar" y queda ligado solo.
 */
export function PanelVinculacionTelegram({ tokenGuardado }: { tokenGuardado: boolean }) {
  const [estado, setEstado] = useState<EstadoVinculacionTelegram | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string>("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setEstado(await obtenerVinculacionTelegramAction());
    setCargando(false);
  }, []);

  useEffect(() => {
    if (tokenGuardado) cargar();
  }, [tokenGuardado, cargar]);

  const copiar = async (enlace: string, nombre: string) => {
    try {
      await navigator.clipboard.writeText(enlace);
      setAviso(`Enlace de ${nombre} copiado. Mándaselo por WhatsApp o en persona; al abrirlo y pulsar "Iniciar" queda vinculado.`);
    } catch {
      window.prompt("Copia este enlace:", enlace);
    }
  };

  const registrarWebhook = async () => {
    setAviso("");
    const r = await registrarWebhookTelegramAction();
    setAviso(r.ok ? "Webhook registrado: el bot ya puede recibir mensajes y botones." : `No se pudo registrar: ${r.error}`);
    await cargar();
  };

  const desvincular = async (id: string, nombre: string) => {
    if (!window.confirm(`¿Quitar el Telegram vinculado de ${nombre}?`)) return;
    await desvincularTelegramUsuarioAction(id);
    await cargar();
  };

  if (!tokenGuardado) {
    return (
      <p className="text-[11px] text-sky-800">
        Guarda primero el token del bot para poder vincular a los usuarios.
      </p>
    );
  }

  return (
    <div className="space-y-2 border-t border-sky-200 pt-2">
      <div className="font-bold text-sky-900">👥 Vincular usuarios con el bot</div>

      {cargando && !estado && <p className="text-[11px] text-slate-500">Consultando Telegram…</p>}

      {estado && !estado.ok && <p className="text-[11px] text-rose-700 font-semibold">⚠️ {estado.error}</p>}

      {estado?.ok && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 font-mono">@{estado.botUsername}</span>
            <span
              className={`rounded-full border px-2 py-0.5 font-semibold ${
                estado.webhookActivo
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-300 bg-amber-50 text-amber-800"
              }`}
            >
              {estado.webhookActivo ? "✓ Webhook activo" : "⚠️ Webhook sin registrar"}
            </span>
            {!estado.webhookActivo && (
              <button
                type="button"
                onClick={registrarWebhook}
                className="rounded bg-sky-700 hover:bg-sky-800 text-white font-bold px-2 py-0.5"
              >
                Registrar webhook
              </button>
            )}
            {estado.webhookError && (
              <span className="text-rose-700" title={estado.webhookError}>
                Último error de Telegram: {estado.webhookError}
              </span>
            )}
          </div>

          <div className="rounded-lg border border-sky-100 bg-white divide-y divide-slate-100">
            {estado.usuarios.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]">
                <div>
                  <span className="font-semibold text-slate-800">{u.nombre}</span>{" "}
                  <span className="text-slate-500">· {ROL[u.rol] || u.rol}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded-full border px-2 py-0.5 font-semibold ${
                      u.vinculado
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    {u.vinculado ? "✓ Vinculado" : "Sin vincular"}
                  </span>
                  {u.enlace && (
                    <button
                      type="button"
                      onClick={() => copiar(u.enlace!, u.nombre)}
                      className="rounded border border-sky-300 bg-sky-50 text-sky-800 px-2 py-0.5 font-semibold hover:bg-sky-100"
                    >
                      📋 Copiar enlace
                    </button>
                  )}
                  {u.vinculado && (
                    <button
                      type="button"
                      onClick={() => desvincular(u.id, u.nombre)}
                      className="text-slate-400 hover:text-rose-600 underline"
                    >
                      desvincular
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {aviso && <p className="text-[11px] text-emerald-700 font-semibold">{aviso}</p>}
          <p className="text-[10px] text-slate-500">
            Cada persona abre su enlace desde el celular con Telegram instalado y pulsa <strong>Iniciar</strong>. El bot le
            confirma "Tu Telegram quedó vinculado".
          </p>
        </>
      )}
    </div>
  );
}
