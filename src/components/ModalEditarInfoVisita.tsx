"use client";

import { useState, useEffect } from "react";
import type { ActividadSemanaItem } from "@/app/actions/actividades-semana";
import { actualizarInformacionComplementariaVisita } from "@/app/actions/agenda";

interface ModalEditarInfoVisitaProps {
  abierto: boolean;
  alCerrar: () => void;
  alGuardar?: () => void;
  actividad: ActividadSemanaItem | null;
}

export function ModalEditarInfoVisita({
  abierto,
  alCerrar,
  alGuardar,
  actividad,
}: ModalEditarInfoVisitaProps) {
  const [notas, setNotas] = useState("");
  const [direccion, setDireccion] = useState("");
  const [fraccionamiento, setFraccionamiento] = useState("");
  const [fecha, setFecha] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");

  const [notificarProveedor, setNotificarProveedor] = useState(true);
  const [notificarCliente, setNotificarCliente] = useState(true);
  const [mostrarOpcionesAvanzadas, setMostrarOpcionesAvanzadas] = useState(false);
  const [verPrevisualizacion, setVerPrevisualizacion] = useState(false);

  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    if (actividad) {
      setNotas(actividad.notas || "");
      setDireccion(actividad.direccion || "");
      setFraccionamiento(actividad.fraccionamiento || "");
      setFecha(actividad.fecha || "");
      setHoraInicio(actividad.horaRaw ? actividad.horaRaw.slice(0, 5) : "");
      setHoraFin("");
      setResultado(null);
      setMostrarOpcionesAvanzadas(false);
      setVerPrevisualizacion(false);
    }
  }, [actividad, abierto]);

  if (!abierto || !actividad) return null;

  const esInstalacion = actividad.tipo === "instalacion";
  const tipoLabel = esInstalacion ? "Instalación" : "Inspección Técnica";
  const tecnicoAsignado = actividad.responsables && actividad.responsables.length > 0
    ? actividad.responsables.join(", ")
    : "Técnico especialista";

  const primerNombreCliente = actividad.clienteNombre.split(" ")[0] || actividad.clienteNombre;
  const fechaLegible = fecha
    ? new Date(`${fecha}T00:00:00`).toLocaleDateString("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : actividad.diaSemanaNombre;

  const horarioTexto = horaInicio ? `${horaInicio} hrs` : actividad.horaInicio;

  // Previsualizaciones de los mensajes en tiempo real
  const msgTecnicoPreview = `🔔 *ACTUALIZACIÓN DE VISITA TÉCNICA*

Hola, el cliente ha proporcionado información complementaria para tu servicio:

👤 *Cliente:* ${actividad.clienteNombre} (${actividad.clienteTelefono || "Sin teléfono"})
📅 *Fecha:* ${fechaLegible}
⏰ *Horario:* ${horarioTexto}
📍 *Ubicación:* ${fraccionamiento || direccion || "León, Gto."}

📝 *Información complementaria / Indicaciones:*
"${notas || "(Sin notas ingresadas)"}"

Favor de tomarlo en cuenta para tu llegada al domicilio.
🔗 CRM: https://crm.saucedamx.com/agenda`;

  const msgClientePreview = `¡Hola ${primerNombreCliente}! 👋 Te confirmamos que hemos registrado la información complementaria para tu visita técnica con SAUCEDA:

📅 *Fecha:* ${fechaLegible}
⏰ *Horario:* ${horarioTexto}
📍 *Ubicación:* ${fraccionamiento || direccion || "León, Gto."}

📝 *Detalles registrados para la visita:*
"${notas || "(Sin notas ingresadas)"}"

Nuestro especialista asignado (${tecnicoAsignado}) ya cuenta con estas indicaciones para su llegada puntual. ¡Quedamos a tus órdenes! 💚`;

  // Chips para insertar rápidamente información común
  const insertarSugerencia = (texto: string) => {
    setNotas((prev) => {
      const limpio = prev.trim();
      if (!limpio) return texto;
      return `${limpio}\n• ${texto}`;
    });
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGuardando(true);
      setResultado(null);

      const res = await actualizarInformacionComplementariaVisita({
        actividadId: actividad.id,
        origen: actividad.origen,
        notasComplementarias: notas,
        direccion: direccion !== actividad.direccion ? direccion : undefined,
        fraccionamiento: fraccionamiento !== actividad.fraccionamiento ? fraccionamiento : undefined,
        fecha: fecha !== actividad.fecha ? fecha : undefined,
        horaInicio: horaInicio ? `${horaInicio}:00` : undefined,
        notificarProveedor,
        notificarCliente,
      });

      if (res.ok) {
        const avisos: string[] = [];
        if (res.proveedorNotificado) avisos.push("técnico notificado");
        if (res.clienteNotificado) avisos.push("cliente notificado por WhatsApp");
        const extra = avisos.length > 0 ? ` (${avisos.join(", ")})` : "";
        setResultado({
          tipo: "ok",
          texto: `¡Información complementaria guardada exitosamente${extra}!`,
        });

        if (alGuardar) alGuardar();
        setTimeout(() => {
          alCerrar();
        }, 1200);
      } else {
        setResultado({
          tipo: "error",
          texto: res.error || "No se pudo guardar la información.",
        });
      }
    } catch (err: any) {
      setResultado({
        tipo: "error",
        texto: err?.message || "Error al procesar la solicitud.",
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in font-cuerpo">
      <div className="relative w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl border border-carbon/10 my-8">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-carbon/10 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 text-xl text-amber-800 border border-amber-500/20">
              ✏️
            </span>
            <div>
              <h3 className="font-titular text-lg font-bold text-verde-profundo leading-tight">
                Editar Información de Visita
              </h3>
              <p className="text-xs text-carbon/60">
                {tipoLabel} · <span className="font-bold text-carbon">{actividad.clienteNombre}</span>
                {actividad.ordenTrabajoFolio ? ` (${actividad.ordenTrabajoFolio})` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            className="text-carbon/40 hover:text-carbon text-lg font-bold p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* Resumen del Servicio */}
        <div className="mt-3 p-3 bg-slate-50 rounded-2xl border border-carbon/10 text-xs grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] text-carbon/50 uppercase font-bold block">Horario Programado</span>
            <span className="font-semibold text-verde-profundo font-mono">
              {actividad.diaSemanaNombre} {actividad.horaInicio} {actividad.horaFin ? `- ${actividad.horaFin}` : ""}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-carbon/50 uppercase font-bold block">Técnico Asignado</span>
            <span className="font-semibold text-carbon truncate block" title={tecnicoAsignado}>
              👷 {tecnicoAsignado}
            </span>
          </div>
          <div className="col-span-2 border-t border-carbon/5 pt-1.5">
            <span className="text-[10px] text-carbon/50 uppercase font-bold block">Ubicación Actual</span>
            <span className="text-carbon truncate block" title={actividad.direccion}>
              📍 {actividad.fraccionamiento ? `${actividad.fraccionamiento} · ` : ""}{actividad.direccion}
            </span>
          </div>
        </div>

        {/* Mensaje de Resultado */}
        {resultado && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold my-3 animate-fade-in ${
              resultado.tipo === "ok"
                ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                : "bg-rose-50 text-rose-900 border border-rose-200"
            }`}
          >
            {resultado.texto}
          </div>
        )}

        <form onSubmit={handleGuardar} className="mt-4 space-y-4">
          {/* CAMPO PRINCIPAL: NOTAS / INFORMACIÓN COMPLEMENTARIA */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-carbon/90 flex items-center gap-1.5">
                <span>📝</span>
                <span>Información Complementaria para la Visita:</span>
              </label>
              <span className="text-[10px] text-carbon/50 italic">
                Indicaciones de acceso, timbres, referencias
              </span>
            </div>

            <textarea
              rows={4}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. El cliente indica que el portón es blanco; tocar fuerte porque no sirve el timbre. Preguntar por la Sra. Martha. Tienen perro amarrado..."
              className="w-full rounded-2xl border border-carbon/20 p-3 text-xs text-carbon focus:border-sauce outline-none bg-white font-sans shadow-2xs leading-relaxed"
              required
            />

            {/* Chips Rápidos de Sugerencias */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] text-carbon/50 self-center font-bold">Atajos:</span>
              <button
                type="button"
                onClick={() => insertarSugerencia("Timbre no sirve; favor de llamar por teléfono al llegar.")}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-carbon/75 px-2 py-0.5 rounded-lg border border-carbon/10 transition"
              >
                🔔 Timbre no sirve
              </button>
              <button
                type="button"
                onClick={() => insertarSugerencia("Portón blanco / fachada con reja.")}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-carbon/75 px-2 py-0.5 rounded-lg border border-carbon/10 transition"
              >
                🚪 Color de fachada/portón
              </button>
              <button
                type="button"
                onClick={() => insertarSugerencia("Tienen mascota en el domicilio (precaución al entrar).")}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-carbon/75 px-2 py-0.5 rounded-lg border border-carbon/10 transition"
              >
                🐕 Hay mascota
              </button>
              <button
                type="button"
                onClick={() => insertarSugerencia("Se requiere escalera alta para acceso a azotea.")}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-carbon/75 px-2 py-0.5 rounded-lg border border-carbon/10 transition"
              >
                🪜 Requiere escalera
              </button>
            </div>
          </div>

          {/* OPCIONES AVANZADAS: REPROGRAMAR / EDITAR DIRECCIÓN */}
          <div className="border-t border-carbon/10 pt-2">
            <button
              type="button"
              onClick={() => setMostrarOpcionesAvanzadas(!mostrarOpcionesAvanzadas)}
              className="text-[11px] font-bold text-sauce hover:underline flex items-center gap-1"
            >
              <span>{mostrarOpcionesAvanzadas ? "▾ Ocultar" : "▸ Ajustar"}</span>
              <span>cambio de fecha, horario o dirección precisa</span>
            </button>

            {mostrarOpcionesAvanzadas && (
              <div className="mt-2.5 p-3.5 bg-slate-50/80 rounded-2xl border border-carbon/10 space-y-3 animate-fade-in text-xs">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                      Fecha de la Visita:
                    </label>
                    <input
                      type="date"
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      className="w-full rounded-xl border border-carbon/20 p-2 text-xs bg-white text-carbon focus:border-sauce outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                      Hora de Inicio:
                    </label>
                    <input
                      type="time"
                      value={horaInicio}
                      onChange={(e) => setHoraInicio(e.target.value)}
                      className="w-full rounded-xl border border-carbon/20 p-2 text-xs bg-white text-carbon focus:border-sauce outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                      Colonia / Fraccionamiento:
                    </label>
                    <input
                      type="text"
                      value={fraccionamiento}
                      onChange={(e) => setFraccionamiento(e.target.value)}
                      placeholder="Ej. Los Sauces"
                      className="w-full rounded-xl border border-carbon/20 p-2 text-xs bg-white text-carbon focus:border-sauce outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-carbon/60 uppercase mb-1">
                      Dirección Específica:
                    </label>
                    <input
                      type="text"
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      placeholder="Ej. Calle Roble 124 interior 5"
                      className="w-full rounded-xl border border-carbon/20 p-2 text-xs bg-white text-carbon focus:border-sauce outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* CASILLAS DE NOTIFICACIÓN AUTOMÁTICA */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/50 p-3.5 space-y-2 text-xs">
            <span className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider block mb-1">
              Envío Automático de Notificaciones:
            </span>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificarProveedor}
                  onChange={(e) => setNotificarProveedor(e.target.checked)}
                  className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                />
                <span className="text-carbon font-semibold">
                  Notificar al técnico asignado ({tecnicoAsignado}) por WhatsApp / Telegram
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notificarCliente}
                  onChange={(e) => setNotificarCliente(e.target.checked)}
                  className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                />
                <span className="text-carbon font-semibold">
                  Confirmar información complementaria al Cliente por WhatsApp ({actividad.clienteTelefono || "Sin número"})
                </span>
              </label>
            </div>

            <div className="pt-1.5 border-t border-emerald-500/10 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setVerPrevisualizacion(!verPrevisualizacion)}
                className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-1"
              >
                <span>{verPrevisualizacion ? "▾ Ocultar" : "👁️ Previsualizar"}</span>
                <span>mensajes que se enviarán</span>
              </button>
            </div>

            {verPrevisualizacion && (
              <div className="mt-2 space-y-2 pt-2 border-t border-emerald-500/20 animate-fade-in">
                {notificarProveedor && (
                  <div>
                    <span className="text-[10px] font-bold text-carbon/60 uppercase block mb-0.5">
                      Mensaje al Técnico ({tecnicoAsignado}):
                    </span>
                    <pre className="p-2.5 bg-white rounded-xl border border-carbon/15 text-[10px] text-carbon/80 whitespace-pre-wrap font-sans">
                      {msgTecnicoPreview}
                    </pre>
                  </div>
                )}
                {notificarCliente && (
                  <div>
                    <span className="text-[10px] font-bold text-carbon/60 uppercase block mb-0.5">
                      Mensaje al Cliente ({actividad.clienteNombre}):
                    </span>
                    <pre className="p-2.5 bg-white rounded-xl border border-carbon/15 text-[10px] text-carbon/80 whitespace-pre-wrap font-sans">
                      {msgClientePreview}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-carbon/10">
            <button
              type="button"
              onClick={alCerrar}
              className="rounded-xl border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon/70 hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando || !notas.trim()}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 shadow-sm transition flex items-center gap-2"
            >
              <span>{guardando ? "Guardando y notificando..." : "💾 Guardar y Notificar"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
