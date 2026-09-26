"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  iniciarPropuestaCoordinacionAction,
  registrarVotosAsesorAction,
  enviarOpcionesClienteAction,
  confirmarCitaFinalCoordinacionAction,
  obtenerCoordinacionActivaProspectoAction,
  cancelarCoordinacionActivaAction,
  obtenerConfiguracionTelegramAction,
  guardarConfiguracionTelegramAction,
} from "@/app/actions/inspecciones-coordinacion";
import type {
  OpcionHorarioPropuesta,
  CoordinacionInspeccionDetalle,
} from "@/lib/coordinacion-inspecciones";
import { labelTipoNegocio } from "@/lib/types";

interface PerfilSimple {
  id: string;
  nombre: string;
  rol: string;
  telefono?: string | null;
}

interface CabinaCoordinacionInspeccionProps {
  prospectoId: string;
  expedienteId?: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  tipoNegocioInicial?: string;
  ubicacionInicial?: string;
  detallesIniciales?: string;
  perfiles: PerfilSimple[];
  asesorPredefinidoId?: string | null;
  operadorPredefinidoId?: string | null;
  onCitaConfirmada?: () => void;
}

function generarOpcionesPorDefecto(): OpcionHorarioPropuesta[] {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  if (manana.getDay() === 0) manana.setDate(manana.getDate() + 1); // saltar domingo

  const pasado = new Date(manana);
  pasado.setDate(pasado.getDate() + 1);
  if (pasado.getDay() === 0) pasado.setDate(pasado.getDate() + 1);

  const formatoFechaISO = (d: Date) => d.toISOString().split("T")[0];
  const formatoLegible = (d: Date, hora: string) => {
    const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} · ${hora}`;
  };

  return [
    {
      id: "A",
      fecha: formatoFechaISO(manana),
      horaInicio: "11:00",
      horaFin: "12:00",
      label: formatoLegible(manana, "11:00 AM"),
    },
    {
      id: "B",
      fecha: formatoFechaISO(manana),
      horaInicio: "16:00",
      horaFin: "17:00",
      label: formatoLegible(manana, "04:00 PM"),
    },
    {
      id: "C",
      fecha: formatoFechaISO(pasado),
      horaInicio: "10:00",
      horaFin: "11:00",
      label: formatoLegible(pasado, "10:00 AM"),
    },
  ];
}

export function CabinaCoordinacionInspeccion({
  prospectoId,
  expedienteId,
  clienteNombre,
  clienteTelefono,
  tipoNegocioInicial = "mantenimiento_cisternas",
  ubicacionInicial = "",
  detallesIniciales = "",
  perfiles,
  asesorPredefinidoId,
  operadorPredefinidoId,
  onCitaConfirmada,
}: CabinaCoordinacionInspeccionProps) {
  const [isPending, startTransition] = useTransition();
  const [coordinacion, setCoordinacion] = useState<CoordinacionInspeccionDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error" | "info"; texto: string } | null>(null);

  // Form states para NUEVA propuesta
  const [servicioNombre, setServicioNombre] = useState(
    tipoNegocioInicial ? labelTipoNegocio(tipoNegocioInicial) : "Limpieza y Sellado de Cisterna / Aljibe"
  );
  const [ubicacion, setUbicacion] = useState(ubicacionInicial || "León, Gto.");
  const [detalles, setDetalles] = useState(detallesIniciales || "Revisión técnica completa y presupuesto sin compromiso");
  const [asesoresSeleccionados, setAsesoresSeleccionados] = useState<string[]>([]);
  const [opcionesPropuestas, setOpcionesPropuestas] = useState<OpcionHorarioPropuesta[]>(generarOpcionesPorDefecto());
  const [opcionSeleccionadaFinal, setOpcionSeleccionadaFinal] = useState<string>("A");

  // Configuración y Canal Telegram
  const [canalNotif, setCanalNotif] = useState<"telegram" | "whatsapp">("telegram");
  const [mostrarConfigTelegram, setMostrarConfigTelegram] = useState(false);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatIdGrupo, setTelegramChatIdGrupo] = useState("");
  const [telegramGuardado, setTelegramGuardado] = useState(false);

  // Timer para SLA
  const [segundosRestantes, setSegundosRestantes] = useState<number>(0);

  // Cargar estado inicial de la coordinación
  const cargarCoordinacion = async () => {
    try {
      setCargando(true);
      const res = await obtenerCoordinacionActivaProspectoAction(prospectoId);
      if (res.ok && res.coordinacion) {
        setCoordinacion(res.coordinacion);
        if (res.coordinacion.opcionesValidadas.length > 0) {
          setOpcionSeleccionadaFinal(res.coordinacion.opcionesValidadas[0]);
        }
      } else {
        setCoordinacion(null);
      }
    } catch (err) {
      console.error("Error al cargar coordinación:", err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarCoordinacion();
    obtenerConfiguracionTelegramAction().then((cfg) => {
      if (cfg.ok) {
        setTelegramToken(cfg.botToken || "");
        setTelegramChatIdGrupo(cfg.chatIdGrupo || "");
      }
    });
  }, [prospectoId]);

  const handleGuardarConfigTelegram = () => {
    startTransition(async () => {
      const res = await guardarConfiguracionTelegramAction(telegramToken, telegramChatIdGrupo);
      if (res.ok) {
        setTelegramGuardado(true);
        setTimeout(() => setTelegramGuardado(false), 3000);
      } else {
        alert("Error al guardar configuración de Telegram: " + res.error);
      }
    });
  };

  const generarUrlWhatsAppWeb = (tel: string, nombreAsesor: string) => {
    const listaOpciones = opcionesPropuestas.map((o) => `• Opción ${o.id}: ${o.label}`).join("\n");
    const texto = `🚨 *PROPUESTA DE INSPECCIÓN TÉCNICA*\n\nHola ${nombreAsesor}, requerimos validar tu disponibilidad para una inspección:\n\n🛠️ *Servicio:* ${servicioNombre}\n📍 *Ubicación:* ${ubicacion}\n👤 *Cliente:* ${clienteNombre}\n📝 *Detalle:* ${detalles}\n\n📅 *Opciones tentativas:*\n${listaOpciones}\n\nFavor de confirmar cuáles de estos horarios puedes cubrir.`;
    const cleanTel = tel.replace(/\D/g, "");
    const telInt = cleanTel.startsWith("52") ? cleanTel : `52${cleanTel}`;
    return `https://wa.me/${telInt}?text=${encodeURIComponent(texto)}`;
  };

  // Preseleccionar 2 asesores si no hay coordinación activa
  useEffect(() => {
    if (perfiles.length > 0 && asesoresSeleccionados.length === 0) {
      const ids: string[] = [];
      if (asesorPredefinidoId && perfiles.some((p) => p.id === asesorPredefinidoId)) {
        ids.push(asesorPredefinidoId);
      }
      if (operadorPredefinidoId && operadorPredefinidoId !== asesorPredefinidoId && perfiles.some((p) => p.id === operadorPredefinidoId)) {
        ids.push(operadorPredefinidoId);
      }
      // Rellenar hasta 2 si falta
      for (const p of perfiles) {
        if (ids.length >= 2) break;
        if (!ids.includes(p.id)) ids.push(p.id);
      }
      setAsesoresSeleccionados(ids);
    }
  }, [perfiles, asesorPredefinidoId, operadorPredefinidoId]);

  // Actualizar timer de SLA
  useEffect(() => {
    if (!coordinacion || coordinacion.estado === "confirmada" || coordinacion.estado === "cancelada") {
      return;
    }
    const tick = () => {
      const limite = new Date(coordinacion.slaLimiteAt).getTime();
      const dif = Math.max(0, Math.floor((limite - Date.now()) / 1000));
      setSegundosRestantes(dif);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [coordinacion]);

  const toggleAsesor = (id: string) => {
    setAsesoresSeleccionados((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 2) {
        // Reemplazar el segundo
        return [prev[0], id];
      }
      return [...prev, id];
    });
  };

  // 1. INICIAR CONSULTA A LOS ASESORES
  const handleIniciarPropuesta = () => {
    if (asesoresSeleccionados.length < 2) {
      setMensaje({ tipo: "error", texto: "Debes seleccionar a los 2 asesores que asistirán a la inspección." });
      return;
    }
    if (!ubicacion.trim()) {
      setMensaje({ tipo: "error", texto: "Ingresa la ubicación o fraccionamiento de la visita." });
      return;
    }

    startTransition(async () => {
      setMensaje(null);
      const res = await iniciarPropuestaCoordinacionAction({
        prospectoId,
        expedienteId,
        clienteNombre,
        clienteTelefono,
        servicioTipo: tipoNegocioInicial || "inspeccion",
        servicioNombre,
        ubicacion,
        fraccionamiento: ubicacion,
        detallesTecnicos: detalles,
        asesoresIds: asesoresSeleccionados,
        opcionesHorarios: opcionesPropuestas,
        slaMinutos: 15,
        canalNotificacion: canalNotif,
      });

      if (res.ok) {
        setMensaje({
          tipo: "ok",
          texto:
            canalNotif === "telegram"
              ? "🚨 ¡Propuesta enviada por Telegram Bot con botones interactivos a los asesores! Corre el reloj de SLA (15 min)."
              : "🚨 ¡Propuesta enviada a los asesores! Corre el reloj de SLA (15 min).",
        });
        await cargarCoordinacion();
      } else {
        setMensaje({ tipo: "error", texto: res.error || "No se pudo iniciar la coordinación." });
      }
    });
  };

  // 2. REGISTRAR VOTO DE ASESOR (SÍ/NO)
  const handleVotoAsesor = (asesorId: string, opcionId: string, puede: boolean) => {
    if (!coordinacion) return;
    startTransition(async () => {
      const res = await registrarVotosAsesorAction(
        coordinacion.id,
        asesorId,
        { [opcionId]: puede },
        undefined,
        prospectoId
      );
      if (res.ok) {
        await cargarCoordinacion();
      }
    });
  };

  // 3. ENVIAR OPCIONES VALIDADAS AL CLIENTE POR WHATSAPP
  const handleEnviarACliente = () => {
    if (!coordinacion) return;
    if (coordinacion.opcionesValidadas.length === 0) {
      setMensaje({ tipo: "error", texto: "No hay opciones coincidentes aprobadas por ambos asesores todavía." });
      return;
    }

    startTransition(async () => {
      setMensaje(null);
      const res = await enviarOpcionesClienteAction(coordinacion.id, prospectoId);
      if (res.ok) {
        setMensaje({
          tipo: "ok",
          texto: `💬 ¡Opciones aprobadas enviadas a ${clienteNombre} por WhatsApp! Esperando su elección.`,
        });
        await cargarCoordinacion();
      } else {
        setMensaje({ tipo: "error", texto: res.error || "No se pudo enviar el mensaje al cliente." });
      }
    });
  };

  // 4. CONFIRMAR CITA FINAL Y NOTIFICAR A TODOS
  const handleConfirmarCitaFinal = () => {
    if (!coordinacion || !opcionSeleccionadaFinal) return;

    startTransition(async () => {
      setMensaje(null);
      const res = await confirmarCitaFinalCoordinacionAction(
        coordinacion.id,
        opcionSeleccionadaFinal,
        prospectoId
      );

      if (res.ok) {
        setMensaje({
          tipo: "ok",
          texto: `🎉 ¡Inspección técnica confirmada con éxito! Se agendó en el sistema, se confirmó a ${clienteNombre} y se notificó de vuelta a los 2 asesores.`,
        });
        await cargarCoordinacion();
        if (onCitaConfirmada) onCitaConfirmada();
      } else {
        setMensaje({ tipo: "error", texto: res.error || "No se pudo confirmar la cita." });
      }
    });
  };

  // 5. CANCELAR O REINICIAR PROPUESTA
  const handleCancelarPropuesta = () => {
    if (!coordinacion) return;
    if (!confirm("¿Deseas cancelar esta propuesta de coordinación activa?")) return;

    startTransition(async () => {
      await cancelarCoordinacionActivaAction(coordinacion.id, prospectoId);
      setCoordinacion(null);
      setMensaje({ tipo: "info", texto: "Propuesta de coordinación cancelada." });
    });
  };

  if (cargando) {
    return (
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 text-center text-xs text-indigo-700 animate-pulse">
        Cargando cabina de coordinación...
      </div>
    );
  }

  // TIEMPO RESTANTE SLA
  const formatoSLA = () => {
    const mins = Math.floor(segundosRestantes / 60);
    const segs = segundosRestantes % 60;
    return `${mins.toString().padStart(2, "0")}:${segs.toString().padStart(2, "0")}`;
  };

  const estaVencidoSLA = coordinacion?.estado === "evaluando" && segundosRestantes === 0;

  return (
    <div className="rounded-2xl border-2 border-indigo-500/30 bg-gradient-to-br from-indigo-950/5 via-white to-blue-50/30 p-4 sm:p-6 shadow-sm space-y-4">
      {/* Encabezado Cabina */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-indigo-100 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-base shadow-sm">
            ⚡
          </span>
          <div>
            <h3 className="font-titular text-base font-bold text-indigo-950 flex items-center gap-2">
              Cabina de Coordinación de Inspección
              <span className="text-[10px] font-mono font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase">
                2 Asesores + SLA
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Valida horarios con tu equipo técnico antes de comprometerlos con el cliente
            </p>
          </div>
        </div>

        {coordinacion && coordinacion.estado !== "confirmada" && (
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-xs font-bold px-3 py-1 rounded-full border shadow-2xs flex items-center gap-1 ${
                estaVencidoSLA
                  ? "bg-red-100 text-red-700 border-red-300 animate-pulse"
                  : segundosRestantes < 300
                  ? "bg-amber-100 text-amber-700 border-amber-300"
                  : "bg-emerald-100 text-emerald-800 border-emerald-300"
              }`}
            >
              ⏱️ SLA: {formatoSLA()} min {estaVencidoSLA && "(Vencido)"}
            </span>

            <button
              type="button"
              onClick={handleCancelarPropuesta}
              disabled={isPending}
              className="text-xs text-slate-400 hover:text-red-600 transition underline"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Alertas de Notificación */}
      {mensaje && (
        <div
          className={`p-3 rounded-xl text-xs font-medium border flex items-start gap-2 ${
            mensaje.tipo === "ok"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : mensaje.tipo === "error"
              ? "bg-rose-50 text-rose-800 border-rose-200"
              : "bg-slate-50 text-slate-700 border-slate-200"
          }`}
        >
          <span>{mensaje.tipo === "ok" ? "✅" : mensaje.tipo === "error" ? "⚠️" : "ℹ️"}</span>
          <span className="flex-1">{mensaje.texto}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CASO A: NO HAY COORDINACIÓN ACTIVA -> FORMULARIO DE PROPUESTA TENTATIVA */}
      {/* ========================================================================= */}
      {!coordinacion && (
        <div className="space-y-4">
          {/* Selector de Canal Operativo */}
          <div className="rounded-xl border border-indigo-100 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Canal para Asesores:</span>
                <button
                  type="button"
                  onClick={() => setCanalNotif("telegram")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    canalNotif === "telegram"
                      ? "bg-sky-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <span>✈️</span>
                  <span>Telegram Bot ($0 Costo · Botones)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCanalNotif("whatsapp")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    canalNotif === "whatsapp"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <span>💬</span>
                  <span>WhatsApp</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setMostrarConfigTelegram(!mostrarConfigTelegram)}
                className="text-[11px] text-sky-700 hover:text-sky-900 font-semibold underline flex items-center gap-1 cursor-pointer"
              >
                ⚙️ {mostrarConfigTelegram ? "Cerrar Configuración" : "Configurar Bot de Telegram"}
              </button>
            </div>

            {/* Panel de Configuración Telegram */}
            {mostrarConfigTelegram && (
              <div className="mt-2 p-3 rounded-lg border border-sky-200 bg-sky-50/50 space-y-2 text-xs">
                <div className="font-bold text-sky-900 flex items-center justify-between">
                  <span>🤖 Credenciales del Bot de Telegram:</span>
                  {telegramGuardado && <span className="text-emerald-700 font-bold">✓ Guardado</span>}
                </div>
                <p className="text-[11px] text-sky-800">
                  Crea tu bot en 30 segundos con <strong>@BotFather</strong> en Telegram y pega aquí su Token. Para el grupo de técnicos, agrega el bot y pega el Chat ID (ej. <code>-100...</code>).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">TELEGRAM BOT TOKEN:</label>
                    <input
                      type="text"
                      value={telegramToken}
                      onChange={(e) => setTelegramToken(e.target.value)}
                      placeholder="123456789:ABCdefGHIjkl..."
                      className="w-full text-xs font-mono rounded border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">CHAT ID GRUPO TÉCNICO (Opcional):</label>
                    <input
                      type="text"
                      value={telegramChatIdGrupo}
                      onChange={(e) => setTelegramChatIdGrupo(e.target.value)}
                      placeholder="-1001234567890 o ID personal"
                      className="w-full text-xs font-mono rounded border border-slate-300 bg-white px-2.5 py-1.5"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleGuardarConfigTelegram}
                    disabled={isPending || !telegramToken.trim()}
                    className="px-3 py-1 rounded bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    Guardar Configuración
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                🛠️ Tipo de Inspección / Negocio:
              </label>
              <input
                type="text"
                value={servicioNombre}
                onChange={(e) => setServicioNombre(e.target.value)}
                placeholder="ej. Limpieza y Sellado de Cisterna / Aljibe"
                className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                📍 Ubicación / Fraccionamiento:
              </label>
              <input
                type="text"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                placeholder="ej. Fracc. Las Flores / Lyrata (León, Gto)"
                className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              📝 Detalle / Necesidad del Cliente:
            </label>
            <input
              type="text"
              value={detalles}
              onChange={(e) => setDetalles(e.target.value)}
              placeholder="ej. Revisión completa de cisterna de 5000L con posible fisura"
              className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-indigo-500"
            />
          </div>

          {/* Selección de los 2 Asesores */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>👷 Asesores Técnicos Requeridos (Selecciona 2):</span>
              <span className="font-mono text-[11px] text-indigo-600 font-bold">
                {asesoresSeleccionados.length} / 2 seleccionados
              </span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {perfiles.map((p) => {
                const sel = asesoresSeleccionados.includes(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => toggleAsesor(p.id)}
                    className={`p-2.5 rounded-xl border text-left text-xs transition cursor-pointer ${
                      sel
                        ? "bg-indigo-50 border-indigo-400 text-indigo-900 font-semibold ring-1 ring-indigo-400"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{p.nombre}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{p.rol}</div>
                      </div>
                      <span>{sel ? "✅" : "➕"}</span>
                    </div>

                    {p.telefono && (
                      <a
                        href={generarUrlWhatsAppWeb(p.telefono, p.nombre)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1.5 text-[10px] text-emerald-700 hover:text-emerald-900 font-medium block underline"
                        title="Abrir WhatsApp Web con la propuesta preparada para este asesor"
                      >
                        💬 Enviar por WhatsApp Web →
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Opciones Tentativas Propuestas */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              📅 Opciones Tentativas que se consultarán a los asesores:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {opcionesPropuestas.map((opc, idx) => (
                <div
                  key={opc.id}
                  className="p-3 rounded-xl border border-indigo-200 bg-white shadow-2xs space-y-1"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                    <span>Opción {opc.id}</span>
                    <span className="text-[10px] text-indigo-500 font-mono">1 hora</span>
                  </div>
                  <input
                    type="text"
                    value={opc.label}
                    onChange={(e) => {
                      const nuevo = [...opcionesPropuestas];
                      nuevo[idx].label = e.target.value;
                      setOpcionesPropuestas(nuevo);
                    }}
                    className="w-full text-xs font-medium rounded border border-slate-200 px-2 py-1 text-slate-700"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Botón de Disparo Fase 1 */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleIniciarPropuesta}
              disabled={isPending || asesoresSeleccionados.length < 2}
              className={`w-full py-3 px-4 rounded-xl text-white font-titular text-sm font-bold shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed ${
                canalNotif === "telegram"
                  ? "bg-gradient-to-r from-sky-600 to-indigo-700 hover:from-sky-700 hover:to-indigo-800"
                  : "bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800"
              }`}
            >
              <span>{canalNotif === "telegram" ? "✈️" : "📲"}</span>
              <span>
                {isPending
                  ? "Despachando consulta..."
                  : canalNotif === "telegram"
                  ? "Consultar Opciones por Telegram Bot (Costo $0 · SLA 15 min)"
                  : "Consultar Opciones por WhatsApp (SLA 15 min)"}
              </span>
            </button>
            <p className="text-[11px] text-slate-500 text-center mt-1.5">
              {canalNotif === "telegram"
                ? "Disparará una alerta a Telegram con botones interactivos a los dos asesores con negocio, ubicación y opciones."
                : "Disparará el mensaje de consulta a ambos asesores con negocio, ubicación y opciones."}
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CASO B: HAY COORDINACIÓN ACTIVA -> SEMÁFORO EN VIVO + ACCIONES RÁPIDAS    */}
      {/* ========================================================================= */}
      {coordinacion && (
        <div className="space-y-4">
          {/* Ficha Resumen de la Cita */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 text-xs text-indigo-950 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-bold">🛠️ {coordinacion.servicioNombre}</span> ·{" "}
              <span className="text-slate-600">📍 {coordinacion.ubicacion}</span>
              {coordinacion.detallesTecnicos && (
                <div className="text-[11px] text-slate-500 mt-0.5">
                  📝 {coordinacion.detallesTecnicos}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500">Estado:</span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase font-mono ${
                  coordinacion.estado === "confirmada"
                    ? "bg-emerald-100 text-emerald-800"
                    : coordinacion.estado === "enviado_cliente"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-amber-100 text-amber-800 animate-pulse"
                }`}
              >
                {coordinacion.estado === "evaluando"
                  ? "Esperando Asesores"
                  : coordinacion.estado === "enviado_cliente"
                  ? "Enviado al Cliente"
                  : coordinacion.estado}
              </span>
            </div>
          </div>

          {/* Semáforo de Validación por Asesor */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
              <span>🚦 Validación de Opciones por Asesor:</span>
              <span className="text-[10px] text-slate-500 font-normal">
                (Haz clic en Sí/No para registrar su respuesta si te avisaron por llamada/voz)
              </span>
            </h4>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 font-semibold">Asesor Asignado</th>
                    {coordinacion.opcionesHorarios.map((opc) => (
                      <th key={opc.id} className="p-2.5 font-semibold text-center">
                        <div className="font-bold text-indigo-900">Opción {opc.id}</div>
                        <div className="text-[10px] font-normal text-slate-500">{opc.label}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {coordinacion.asesoresIds.map((aId) => {
                    const asesorData = coordinacion.respuestasAsesores[aId];
                    const nombre = asesorData?.nombre || perfiles.find((p) => p.id === aId)?.nombre || "Asesor";
                    const votos = asesorData?.votos || {};

                    return (
                      <tr key={aId} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-medium text-slate-800">
                          <div>👷 {nombre}</div>
                          {asesorData?.respondidoAt && (
                            <div className="text-[9px] text-emerald-600 font-mono">
                              ✓ Respondió {new Date(asesorData.respondidoAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </td>

                        {coordinacion.opcionesHorarios.map((opc) => {
                          const voto = votos[opc.id];
                          const puede = voto === true;
                          const noPuede = voto === false;

                          return (
                            <td key={opc.id} className="p-2 text-center">
                              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                                <button
                                  type="button"
                                  onClick={() => handleVotoAsesor(aId, opc.id, true)}
                                  disabled={isPending || coordinacion.estado === "confirmada"}
                                  className={`px-2 py-1 rounded text-[11px] font-bold transition ${
                                    puede
                                      ? "bg-emerald-600 text-white shadow-xs"
                                      : "text-slate-500 hover:text-emerald-700"
                                  }`}
                                  title="El asesor puede en este horario"
                                >
                                  🟢 Sí
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleVotoAsesor(aId, opc.id, false)}
                                  disabled={isPending || coordinacion.estado === "confirmada"}
                                  className={`px-2 py-1 rounded text-[11px] font-bold transition ${
                                    noPuede
                                      ? "bg-rose-600 text-white shadow-xs"
                                      : "text-slate-500 hover:text-rose-700"
                                  }`}
                                  title="El asesor no puede"
                                >
                                  🔴 No
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-indigo-50/50 font-bold border-t border-slate-200">
                  <tr>
                    <td className="p-2.5 text-indigo-950 font-titular">Resultado Coincidencias:</td>
                    {coordinacion.opcionesHorarios.map((opc) => {
                      const coincide = coordinacion.opcionesValidadas.includes(opc.id);
                      return (
                        <td key={opc.id} className="p-2 text-center">
                          {coincide ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300">
                              ✓ Coinciden
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-slate-400 text-[10px]">
                              Pendiente / No
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ACCIÓN FASE 3: ENVIAR A CLIENTE POR WHATSAPP */}
          {coordinacion.estado !== "confirmada" && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>💬</span>
                    <span>Paso 3: Enviar Opciones Validadas al Cliente</span>
                  </h5>
                  <p className="text-[11px] text-slate-500">
                    {coordinacion.opcionesValidadas.length > 0
                      ? `Se le enviarán las ${coordinacion.opcionesValidadas.length} opciones donde ambos asesores coincidieron libres.`
                      : "Aún no hay horarios aprobados por ambos asesores para enviarle al cliente."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleEnviarACliente}
                  disabled={isPending || coordinacion.opcionesValidadas.length === 0}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-titular text-xs font-bold shadow-sm transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  <span>📲</span>
                  <span>Enviar Opciones a {clienteNombre} por WhatsApp</span>
                </button>
              </div>

              {/* ACCIÓN FASE 4: EL CLIENTE ELIGIÓ Y SE CONFIRMA DEFINITIVA */}
              <div className="border-t border-slate-100 pt-3">
                <h5 className="text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                  <span>🎯</span>
                  <span>Paso 4: El Cliente ya eligió horario · Confirmar Cita y Notificar Asesores</span>
                </h5>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <select
                      value={opcionSeleccionadaFinal}
                      onChange={(e) => setOpcionSeleccionadaFinal(e.target.value)}
                      disabled={isPending}
                      className="w-full text-xs rounded-lg border border-slate-300 bg-white px-3 py-2 font-medium text-slate-800"
                    >
                      {coordinacion.opcionesHorarios.map((opc) => {
                        const coincide = coordinacion.opcionesValidadas.includes(opc.id);
                        return (
                          <option key={opc.id} value={opc.id}>
                            Opción {opc.id}: {opc.label} {coincide ? " (Aprobada por asesores)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmarCitaFinal}
                    disabled={isPending || !opcionSeleccionadaFinal}
                    className="px-5 py-2 rounded-xl bg-indigo-900 hover:bg-indigo-950 text-white font-titular text-xs font-bold shadow-md transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <span>✅</span>
                    <span>Confirmar Cita Definitiva y Notificar Retorno</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Al confirmar, se guardará en la Agenda, se le confirmará al cliente y se mandará la notificación con la fecha acordada a ambos asesores.
                </p>
              </div>
            </div>
          )}

          {/* ESTADO CONFIRMADA */}
          {coordinacion.estado === "confirmada" && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 text-xs text-emerald-950 flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-sm text-emerald-900 flex items-center gap-1.5">
                  <span>🎉</span>
                  <span>¡Inspección Técnica Confirmada y Cerrada!</span>
                </div>
                <p className="text-emerald-800 mt-0.5">
                  La cita ya se encuentra registrada en la agenda de los dos asesores y el cliente cuenta con su confirmación de visita.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCoordinacion(null)}
                className="px-3 py-1.5 rounded-lg border border-emerald-400 text-emerald-900 bg-white hover:bg-emerald-100 font-semibold text-xs"
              >
                + Nueva Coordinación
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
