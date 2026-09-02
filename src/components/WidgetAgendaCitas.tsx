"use client";

import { useState, useEffect } from "react";
import { 
  obtenerCitasDeEntidad, 
  programarCitaManual, 
  cancelarCita,
  obtenerEstadoNotificacionCita,
  type Cita 
} from "@/app/actions/agenda";
import { listarPerfilesActivos } from "@/app/actions/usuarios";
import { 
  ModalPrevisualizarInspeccion, 
  type DatosPrevisualizacionInspeccion 
} from "./ModalPrevisualizarInspeccion";

interface WidgetAgendaCitasProps {
  prospectoId?: string | null;
  expedienteId?: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail?: string | null;
  onRefresh?: () => Promise<void> | void;
}

export function WidgetAgendaCitas({
  prospectoId,
  expedienteId,
  clienteNombre,
  clienteTelefono,
  clienteEmail,
  onRefresh,
}: WidgetAgendaCitasProps) {
  const [citas, setCitas] = useState<Cita[]>([]);
  const [perfiles, setPerfiles] = useState<{ id: string; nombre: string; rol: string; telefono?: string | null }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [tipoForm, setTipoForm] = useState<"inspeccion" | "instalacion">("inspeccion");

  // Form states
  const [fecha, setFecha] = useState("");
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [horaFin, setHoraFin] = useState("10:00");
  const [perfilId, setPerfilId] = useState("");
  const [notas, setNotas] = useState("");
  const [telefonoCliente, setTelefonoCliente] = useState(clienteTelefono || "");
  const [emailCliente, setEmailCliente] = useState(clienteEmail || "");
  const [notificarCliente, setNotificarCliente] = useState(true);
  
  // Modal de Previsualización
  const [modalPrevisualizar, setModalPrevisualizar] = useState(false);
  const [datosPrevisualizacion, setDatosPrevisualizacion] = useState<DatosPrevisualizacionInspeccion | null>(null);

  const [procesando, setProcesando] = useState(false);
  const [actualizandoEstadoId, setActualizandoEstadoId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  // Load appointments
  const cargarDatos = async () => {
    try {
      setCargando(true);
      const lista = await obtenerCitasDeEntidad(prospectoId, expedienteId);
      setCitas(lista);
    } catch (err) {
      console.error("Error al cargar citas de la entidad:", err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
    listarPerfilesActivos()
      .then((p) => {
        setPerfiles(p);
        if (p.length > 0) setPerfilId(p[0].id);
      })
      .catch(console.error);
  }, [prospectoId, expedienteId]);

  useEffect(() => {
    if (clienteTelefono) setTelefonoCliente(clienteTelefono);
    if (clienteEmail) setEmailCliente(clienteEmail);
  }, [clienteTelefono, clienteEmail]);

  // Adjust end time when start time changes (default +1 hour for inspection, +4 hours for installation)
  useEffect(() => {
    if (!horaInicio) return;
    const [hrs, mins] = horaInicio.split(":").map(Number);
    const date = new Date();
    date.setHours(hrs, mins, 0, 0);
    
    if (tipoForm === "inspeccion") {
      date.setHours(date.getHours() + 1);
    } else {
      date.setHours(date.getHours() + 4);
    }
    
    const formattedEnd = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    setHoraFin(formattedEnd);
  }, [horaInicio, tipoForm]);

  // Disparar la previsualización del mensaje antes de agendar
  const handleAbrirPrevisualizacion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fecha || !horaInicio || !horaFin || !perfilId) {
      setMensaje({ tipo: "error", texto: "Por favor completa la fecha, horario y asesor asignado." });
      return;
    }

    const asesorSel = perfiles.find((p) => p.id === perfilId);
    const asesorNombre = asesorSel?.nombre || "Asesor Técnico";
    const telContacto = asesorSel?.telefono || "477 465 4700";

    const datos: DatosPrevisualizacionInspeccion = {
      clienteNombre,
      clienteTelefono: telefonoCliente || clienteTelefono,
      clienteEmail: emailCliente || clienteEmail,
      fecha,
      horaInicio,
      horaFin,
      perfilId,
      asesorNombre,
      asesorTelefono: asesorSel?.telefono,
      telefonoContacto: telContacto,
      notas,
      tipoCita: tipoForm,
    };

    setDatosPrevisualizacion(datos);
    setModalPrevisualizar(true);
  };

  // Confirmación y guardado desde el modal
  const handleConfirmarYAgendar = async (opciones: {
    mensajeWhatsApp: string;
    enviarWhatsApp: boolean;
    enviarEmail: boolean;
    emailDestino: string;
    telefonoContacto: string;
  }) => {
    if (!datosPrevisualizacion) return;

    try {
      setProcesando(true);
      setMensaje(null);

      const res = await programarCitaManual({
        prospectoId,
        expedienteId,
        perfilId: datosPrevisualizacion.perfilId,
        clienteNombre,
        clienteTelefono: datosPrevisualizacion.clienteTelefono,
        clienteEmail: opciones.emailDestino || datosPrevisualizacion.clienteEmail,
        tipoCita: datosPrevisualizacion.tipoCita || "inspeccion",
        fecha: datosPrevisualizacion.fecha,
        horaInicio: datosPrevisualizacion.horaInicio,
        horaFin: datosPrevisualizacion.horaFin,
        notas: datosPrevisualizacion.notas,
        notificarCliente: opciones.enviarWhatsApp,
        mensajeWhatsAppPersonalizado: opciones.mensajeWhatsApp,
        enviarEmail: opciones.enviarEmail,
        telefonoContacto: opciones.telefonoContacto,
      });

      if (res.ok) {
        setModalPrevisualizar(false);
        setMostrarForm(false);
        setMensaje({ 
          tipo: "ok", 
          texto: `¡${tipoForm === "inspeccion" ? "Inspección Técnica" : "Instalación"} programada con éxito! ${
            opciones.enviarWhatsApp ? "💬 WhatsApp enviado. " : ""
          }${opciones.enviarEmail ? "✉️ Correo enviado." : ""}` 
        });
        
        // Reset form
        setFecha("");
        setNotas("");
        
        await cargarDatos();
        if (onRefresh) await onRefresh();
      } else {
        setMensaje({ tipo: "error", texto: res.error || "Ocurrió un error al agendar." });
      }
    } catch (err: any) {
      setMensaje({ tipo: "error", texto: err.message || "Error al agendar." });
    } finally {
      setProcesando(false);
    }
  };

  // Verificar estado de lectura / entrega de una cita
  const handleVerificarEstado = async (citaId: string) => {
    try {
      setActualizandoEstadoId(citaId);
      const res = await obtenerEstadoNotificacionCita(citaId);
      if (res.ok) {
        setCitas((prev) =>
          prev.map((c) =>
            c.id === citaId
              ? {
                  ...c,
                  mensaje_whatsapp_estado: res.estadoWhatsApp,
                  email_enviado: res.emailEnviado,
                  email_destinatario: res.emailDestinatario,
                }
              : c
          )
        );
      }
    } catch (e) {
      console.error("Error al verificar estado:", e);
    } finally {
      setActualizandoEstadoId(null);
    }
  };

  const handleCancelar = async (citaId: string) => {
    if (!confirm("¿Estás seguro de que deseas cancelar esta cita?")) return;

    try {
      setCargando(true);
      await cancelarCita(citaId);
      await cargarDatos();
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      alert("Error al cancelar la cita: " + err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-carbon/10 bg-white p-4 sm:p-6 shadow-sm space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-titular text-base sm:text-lg font-semibold text-carbon flex items-center gap-1.5">
            📅 Agenda & Programaciones
          </h3>
          <p className="text-xs text-carbon/50">
            Control de visitas de inspección e instalaciones con confirmación y rastreo de lectura
          </p>
        </div>
        
        {!mostrarForm && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setTipoForm("inspeccion");
                setMostrarForm(true);
                setMensaje(null);
              }}
              className="rounded-lg bg-sauce/10 border border-sauce/20 hover:bg-sauce hover:text-white transition px-3 py-1.5 text-xs font-semibold text-sauce flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>🔍</span> Programar Inspección
            </button>
            <button
              type="button"
              onClick={() => {
                setTipoForm("instalacion");
                setMostrarForm(true);
                setMensaje(null);
              }}
              className="rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-600 hover:text-white transition px-3 py-1.5 text-xs font-semibold text-emerald-700 flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>🛠️</span> Programar Instalación
            </button>
          </div>
        )}
      </div>

      {mensaje && (
        <div className={`p-3 rounded-lg text-xs font-semibold border ${
          mensaje.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"
        }`}>
          {mensaje.texto}
        </div>
      )}

      {/* Programar Form */}
      {mostrarForm && (
        <form onSubmit={handleAbrirPrevisualizacion} className="p-4 rounded-xl border border-carbon/15 bg-slate-50/70 space-y-4 transition-all">
          <div className="flex items-center justify-between border-b pb-2">
            <h4 className="text-xs font-bold text-verde-profundo uppercase tracking-wider flex items-center gap-1.5">
              <span>{tipoForm === "inspeccion" ? "🔍" : "🛠️"}</span>
              Programar Nueva {tipoForm === "inspeccion" ? "Inspección Técnica en Sitio" : "Instalación Profesional"}
            </h4>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setTipoForm(tipoForm === "inspeccion" ? "instalacion" : "inspeccion")}
                className="text-[10px] text-sauce hover:underline font-bold"
              >
                Cambiar a {tipoForm === "inspeccion" ? "Instalación" : "Inspección"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Fecha</label>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Hora Inicio</label>
              <input
                type="time"
                required
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Hora Fin (Estimada)</label>
              <input
                type="time"
                required
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-carbon/70 mb-1">
                Asignar Responsable (Técnico / Asesor)
              </label>
              <select
                value={perfilId}
                onChange={(e) => setPerfilId(e.target.value)}
                required
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
              >
                {perfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.rol === "admin" ? "Admin" : p.rol === "asesor" ? "Asesor" : "Operario"}) {p.telefono ? `· ${p.telefono}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Teléfono WhatsApp Cliente</label>
              <input
                type="text"
                value={telefonoCliente}
                onChange={(e) => setTelefonoCliente(e.target.value)}
                placeholder="477 123 4567"
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Correo Electrónico (Opcional)</label>
              <input
                type="email"
                value={emailCliente}
                onChange={(e) => setEmailCliente(e.target.value)}
                placeholder="cliente@correo.com"
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-carbon/70 mb-1">Notas internas para la visita</label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder={tipoForm === "inspeccion" ? "Ej: Revisar losa, goteras en cocina y fisuras..." : "Ej: Llevar soplete y rollos..."}
              className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-xs font-medium text-carbon focus:border-sauce focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-carbon/10">
            <button
              type="button"
              onClick={() => setMostrarForm(false)}
              className="rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs font-medium text-carbon/70 hover:bg-slate-100 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-verde-profundo hover:bg-sauce text-white px-4 py-1.5 text-xs font-semibold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>👁️</span>
              <span>Previsualizar Mensajes y Agendar</span>
            </button>
          </div>
        </form>
      )}

      {/* Appointments List */}
      {cargando ? (
        <div className="py-6 text-center text-xs text-carbon/40 font-medium">
          Cargando agenda de citas...
        </div>
      ) : citas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-carbon/15 p-6 text-center text-xs text-carbon/40 font-medium bg-slate-50/50">
          No hay inspecciones ni instalaciones programadas para este cliente.
        </div>
      ) : (
        <div className="space-y-2.5">
          {citas.map((c) => {
            const isInstalacion = c.tipo_cita === "instalacion";
            const isInspeccion = c.tipo_cita === "inspeccion";
            const isCancelada = c.estado === "cancelada";

            return (
              <div 
                key={c.id} 
                className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 shadow-xs transition-all ${
                  isCancelada
                    ? "bg-slate-50 border-slate-200 opacity-60"
                    : isInstalacion
                      ? "bg-emerald-50/30 border-emerald-100"
                      : isInspeccion
                        ? "bg-sauce/5 border-sauce/15"
                        : "bg-slate-50/50 border-carbon/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {isInstalacion ? "🛠️" : isInspeccion ? "🔍" : "📅"}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        isCancelada
                          ? "bg-slate-200 text-slate-700"
                          : isInstalacion
                            ? "bg-emerald-100 text-emerald-800"
                            : isInspeccion
                              ? "bg-sauce/15 text-sauce"
                              : "bg-blue-100 text-blue-800"
                      }`}>
                        {c.tipo_cita === "inspeccion" ? "Inspección Técnica" : c.tipo_cita === "instalacion" ? "Instalación" : c.tipo_cita}
                      </span>
                      <span className="text-xs font-bold text-carbon/85">
                        {new Date(c.fecha + "T00:00:00").toLocaleDateString("es-MX", { dateStyle: "long" })} · {c.hora_inicio.slice(0, 5)} a {c.hora_fin.slice(0, 5)} hrs
                      </span>
                    </div>
                    
                    <p className="text-[11px] text-carbon/60 mt-1">
                      Asignado: <strong className="text-carbon/80">{c.perfil_nombre || "Sin asignar"}</strong>
                      {c.notas && <span className="italic block mt-0.5 text-carbon/50">Notas: "{c.notas}"</span>}
                    </p>

                    {/* Insignias de Notificación y Seguimiento en Tiempo Real */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {/* Estado WhatsApp */}
                      {c.mensaje_whatsapp_estado === "read" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300" title="Mensaje leído por el cliente">
                          <span className="text-[#34B7F1] font-black">✓✓</span> WhatsApp Leído
                        </span>
                      ) : c.mensaje_whatsapp_estado === "delivered" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200" title="Mensaje recibido / entregado en el celular del cliente">
                          <span className="text-carbon/50 font-black">✓✓</span> WhatsApp Recibido
                        </span>
                      ) : c.mensaje_whatsapp_estado === "enviado" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200" title="Mensaje enviado, esperando entrega">
                          <span className="text-amber-600 font-bold">✓</span> WhatsApp Enviado
                        </span>
                      ) : c.mensaje_whatsapp_estado === "error" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200" title="Error al enviar mensaje por WhatsApp">
                          ⚠️ WhatsApp no entregado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-carbon/60">
                          💬 WhatsApp
                        </span>
                      )}

                      {/* Estado Correo */}
                      {c.email_enviado ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200" title={`Correo enviado a ${c.email_destinatario || ''}`}>
                          ✉️ Correo enviado
                        </span>
                      ) : c.cliente_email ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-carbon/60">
                          ✉️ {c.cliente_email}
                        </span>
                      ) : null}

                      {/* Botón Verificar Estado */}
                      {!isCancelada && (
                        <button
                          type="button"
                          onClick={() => handleVerificarEstado(c.id)}
                          disabled={actualizandoEstadoId === c.id}
                          className="text-[10px] font-bold text-sauce hover:underline flex items-center gap-1 cursor-pointer bg-white px-2 py-0.5 rounded border border-carbon/15 hover:bg-slate-50 transition"
                          title="Consultar si el cliente ya recibió o leyó el mensaje"
                        >
                          <span className={actualizandoEstadoId === c.id ? "animate-spin" : ""}>
                            {actualizandoEstadoId === c.id ? "⏳" : "🔄"}
                          </span>
                          <span>{actualizandoEstadoId === c.id ? "Consultando..." : "Actualizar lectura"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`rounded-full text-[10px] font-bold px-2.5 py-0.5 uppercase border ${
                    isCancelada
                      ? "bg-slate-100 border-slate-300 text-slate-600"
                      : c.estado === "confirmada"
                        ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                        : "bg-amber-100 border-amber-300 text-amber-800"
                  }`}>
                    {c.estado}
                  </span>

                  {!isCancelada && (
                    <button
                      type="button"
                      onClick={() => handleCancelar(c.id)}
                      className="text-[10px] font-bold text-rose-600 hover:text-rose-800 transition hover:underline cursor-pointer"
                    >
                      Cancelar Cita
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Previsualización antes de Enviar */}
      {datosPrevisualizacion && (
        <ModalPrevisualizarInspeccion
          abierto={modalPrevisualizar}
          onCerrar={() => setModalPrevisualizar(false)}
          datos={datosPrevisualizacion}
          onConfirmar={handleConfirmarYAgendar}
          procesando={procesando}
        />
      )}
    </div>
  );
}
