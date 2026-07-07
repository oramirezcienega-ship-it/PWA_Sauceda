"use client";

import { useState, useEffect } from "react";
import {
  obtenerSlotsDisponibles,
  crearCita,
  obtenerProspectoPublico,
} from "@/app/actions/agenda";

interface ReservarCitaClienteProps {
  asesor: {
    id: string;
    nombre: string;
    telefono: string;
    duracion_cita: number;
  };
  prospectoId?: string;
}

export function ReservarCitaCliente({
  asesor,
  prospectoId,
}: ReservarCitaClienteProps) {
  // Configuración del calendario
  const hoy = new Date();
  const [añoActivo, setAñoActivo] = useState(hoy.getFullYear());
  const [mesActivo, setMesActivo] = useState(hoy.getMonth()); // 0-11
  const [diaSeleccionado, setDiaSeleccionado] = useState<number | null>(null);

  // Estados de reserva
  const [slots, setSlots] = useState<{ inicio: string; fin: string }[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [slotSeleccionado, setSlotSeleccionado] = useState<{ inicio: string; fin: string } | null>(null);

  // Datos del cliente
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [tipoCita, setTipoCita] = useState<"venta" | "asesoria">("venta");
  const [notas, setNotas] = useState("");

  const [guardandoCita, setGuardandoCita] = useState(false);
  const [citaConfirmada, setCitaConfirmada] = useState<any | null>(null);

  const [clienteNombrePublico, setClienteNombrePublico] = useState("");

  // Pre-llenar datos si viene prospectoId
  useEffect(() => {
    if (!prospectoId) return;

    async function cargarProspecto() {
      try {
        const datos = await obtenerProspectoPublico(prospectoId!);
        if (datos) {
          setNombre(datos.nombre);
          setClienteNombrePublico(datos.nombre);
          setTelefono(datos.telefono);
          setCorreo(datos.correo);
        }
      } catch (err) {
        console.error("Error al cargar datos del prospecto:", err);
      }
    }

    cargarProspecto();
  }, [prospectoId]);

  // Cargar slots cuando cambia la fecha seleccionada
  useEffect(() => {
    if (diaSeleccionado === null) {
      setSlots([]);
      return;
    }

    const fechaStr = `${añoActivo}-${String(mesActivo + 1).padStart(2, "0")}-${String(
      diaSeleccionado
    ).padStart(2, "0")}`;

    async function cargarSlots() {
      setCargandoSlots(true);
      setSlotSeleccionado(null);
      try {
        const data = await obtenerSlotsDisponibles(asesor.id, fechaStr);
        setSlots(data);
      } catch (err) {
        console.error("Error al cargar disponibilidad:", err);
      } finally {
        setCargandoSlots(false);
      }
    }

    cargarSlots();
  }, [diaSeleccionado, mesActivo, añoActivo, asesor.id]);

  // Lógica del Calendario
  const nombresMeses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  // Obtener primer día de la semana y total de días en el mes activo
  const primerDiaMes = new Date(añoActivo, mesActivo, 1).getDay();
  const totalDiasMes = new Date(añoActivo, mesActivo + 1, 0).getDate();

  // Cambiar mes
  const irMesAnterior = () => {
    setDiaSeleccionado(null);
    if (mesActivo === 0) {
      setMesActivo(11);
      setAñoActivo(añoActivo - 1);
    } else {
      setMesActivo(mesActivo - 1);
    }
  };

  const irMesSiguiente = () => {
    setDiaSeleccionado(null);
    if (mesActivo === 11) {
      setMesActivo(0);
      setAñoActivo(añoActivo + 1);
    } else {
      setMesActivo(mesActivo + 1);
    }
  };

  // Validar si un día ya pasó
  const esDiaPasado = (dia: number) => {
    const fechaComparar = new Date(añoActivo, mesActivo, dia, 23, 59, 59);
    return fechaComparar < hoy;
  };

  // Enviar formulario de reserva
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!diaSeleccionado || !slotSeleccionado || !nombre.trim() || !telefono.trim()) {
      alert("Por favor completa los campos obligatorios y selecciona un horario.");
      return;
    }

    const fechaStr = `${añoActivo}-${String(mesActivo + 1).padStart(2, "0")}-${String(
      diaSeleccionado
    ).padStart(2, "0")}`;

    setGuardandoCita(true);
    try {
      const cita = await crearCita({
        perfil_id: asesor.id,
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        cliente_email: correo || undefined,
        tipo_cita: tipoCita,
        fecha: fechaStr,
        hora_inicio: slotSeleccionado.inicio,
        hora_fin: slotSeleccionado.fin,
        notas: notas || undefined,
        prospecto_id: prospectoId || undefined,
      });

      setCitaConfirmada(cita);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "No se pudo agendar la cita. Intenta con otro horario.");
    } finally {
      setGuardandoCita(false);
    }
  }

  // Generar link de confirmación de WhatsApp
  const obtenerWhatsAppLink = () => {
    if (!citaConfirmada) return "#";
    const [y, m, d] = citaConfirmada.fecha.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const fechaLegible = date.toLocaleDateString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

    const mensaje = `Hola, acabo de reservar una cita de ${
      citaConfirmada.tipo_cita === "venta" ? "Venta" : "Asesoría"
    } con ${asesor.nombre} para el día ${fechaLegible} a las ${citaConfirmada.hora_inicio.slice(
      0,
      5
    )}hs. Por favor confírmenme si todo está correcto.`;

    let telAsesor = asesor.telefono ? asesor.telefono.replace(/\D/g, "") : "";
    if (telAsesor && telAsesor.length === 10 && !telAsesor.startsWith("52")) {
      telAsesor = "52" + telAsesor;
    }

    // fallback al conmutador o número general si el asesor no tiene número
    return `https://wa.me/${telAsesor || "526622100000"}?text=${encodeURIComponent(mensaje)}`;
  };

  // Pantalla de Confirmación Exitosa
  if (citaConfirmada) {
    const [y, m, d] = citaConfirmada.fecha.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const fechaLegible = dateObj.toLocaleDateString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl border border-sauce/20 p-8 shadow-xl text-center space-y-6 animate-fade-in">
          {/* Animación del Check */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sauce/15 text-verde-profundo text-3xl">
            ✓
          </div>

          <div className="space-y-2">
            <h2 className="font-titular text-2xl font-bold text-verde-profundo">
              ¡Cita Programada Exitosamente!
            </h2>
            <p className="text-sm text-carbon/60">
              Hemos registrado tu solicitud. Te sugerimos confirmar la cita enviando un mensaje directo a tu asesor por WhatsApp.
            </p>
          </div>

          {/* Resumen */}
          <div className="rounded-2xl bg-crema/40 border border-carbon/5 p-5 text-left text-sm space-y-3">
            <div className="flex justify-between border-b border-carbon/5 pb-2">
              <span className="text-carbon/50">Asesor Comercial:</span>
              <span className="font-bold text-verde-profundo">{asesor.nombre}</span>
            </div>
            <div className="flex justify-between border-b border-carbon/5 pb-2">
              <span className="text-carbon/50">Fecha:</span>
              <span className="font-semibold text-carbon capitalize">{fechaLegible}</span>
            </div>
            <div className="flex justify-between border-b border-carbon/5 pb-2">
              <span className="text-carbon/50">Horario:</span>
              <span className="font-semibold font-mono text-carbon">
                {citaConfirmada.hora_inicio.slice(0, 5)} - {citaConfirmada.hora_fin.slice(0, 5)}hs
              </span>
            </div>
            <div className="flex justify-between border-b border-carbon/5 pb-2">
              <span className="text-carbon/50">Tipo de cita:</span>
              <span className="font-semibold text-carbon">
                {citaConfirmada.tipo_cita === "venta" ? "Cita de Venta" : "Asesoría Comercial"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-carbon/50">Cliente:</span>
              <span className="font-semibold text-carbon">{citaConfirmada.cliente_nombre}</span>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="pt-2 space-y-3 flex flex-col">
            <a
              href={obtenerWhatsAppLink()}
              target="_blank"
              rel="noreferrer"
              className="w-full rounded-xl bg-green-600 px-6 py-3.5 text-sm font-bold text-white shadow hover:bg-green-700 transition flex items-center justify-center gap-2"
            >
              Confirmar por WhatsApp 💬
            </a>
            <p className="text-[10px] text-carbon/40 italic">
              Al hacer clic, se abrirá WhatsApp con los detalles de tu cita listos para enviar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white rounded-3xl border border-carbon/10 shadow-lg overflow-hidden grid grid-cols-1 md:grid-cols-12">
        
        {/* Panel Izquierdo: Info del Asesor */}
        <div className="md:col-span-4 bg-verde-profundo p-8 text-white flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-sauce/20 flex items-center justify-center font-bold text-lg text-sauce border border-sauce/40 shadow-inner">
                {asesor.nombre.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-white/50 font-bold">Tu Asesor</p>
                <h3 className="font-titular text-lg font-bold text-crema leading-tight">{asesor.nombre}</h3>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-sauce">📅</span>
                <p className="text-white/80 leading-snug">
                  Agenda tu cita de venta presencial o asesoría virtual de manera sencilla.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sauce">🕒</span>
                <p className="text-white/80">Duración: {asesor.duracion_cita} minutos</p>
              </div>
            </div>

            {clienteNombrePublico && (
              <div className="border-t border-white/10 pt-4 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Invitación para</p>
                <p className="font-titular text-sm font-semibold text-crema leading-snug">{clienteNombrePublico}</p>
              </div>
            )}
          </div>

          <div className="text-[10px] text-white/40 leading-relaxed pt-6 border-t border-white/5">
            SAUCEDA Bienes Raíces © 2026. Todos los derechos reservados.
          </div>
        </div>

        {/* Panel Derecho: Selector de Fecha y Formulario */}
        <div className="md:col-span-8 p-6 md:p-8 space-y-6">
          <div className="border-b border-carbon/10 pb-4">
            <h1 className="font-titular text-2xl font-bold text-verde-profundo">
              {clienteNombrePublico ? `¡Hola, ${clienteNombrePublico.split(" ")[0]}! 👋` : "Selecciona fecha y hora"}
            </h1>
            <p className="text-xs text-carbon/50 mt-1">
              {clienteNombrePublico
                ? `Elige el horario que mejor te convenga para tu cita con ${asesor.nombre}.`
                : "Busca los espacios disponibles en la agenda de tu asesor."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            
            {/* Calendario Mensual */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-bold text-carbon/80 capitalize">
                  {nombresMeses[mesActivo]} {añoActivo}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={irMesAnterior}
                    disabled={mesActivo === hoy.getMonth() && añoActivo === hoy.getFullYear()}
                    className="p-1 rounded-lg border border-carbon/10 text-carbon hover:bg-carbon/5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={irMesSiguiente}
                    className="p-1 rounded-lg border border-carbon/10 text-carbon hover:bg-carbon/5"
                  >
                    ▶
                  </button>
                </div>
              </div>

              {/* Grid del calendario */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {/* Cabecera semana */}
                {diasSemana.map((d) => (
                  <div key={d} className="py-1 font-semibold text-carbon/40">
                    {d}
                  </div>
                ))}

                {/* Celdas vacías previas */}
                {Array.from({ length: primerDiaMes }).map((_, idx) => (
                  <div key={`empty-${idx}`} className="py-2" />
                ))}

                {/* Días del mes */}
                {Array.from({ length: totalDiasMes }).map((_, idx) => {
                  const dia = idx + 1;
                  const esPasado = esDiaPasado(dia);
                  const esSeleccionado = diaSeleccionado === dia;

                  return (
                    <button
                      key={`day-${dia}`}
                      type="button"
                      disabled={esPasado}
                      onClick={() => setDiaSeleccionado(dia)}
                      className={`py-2 rounded-lg font-semibold transition-all ${
                        esSeleccionado
                          ? "bg-sauce text-white shadow-md font-bold"
                          : esPasado
                          ? "text-carbon/20 cursor-not-allowed"
                          : "text-carbon/80 hover:bg-sauce/10 hover:text-verde-profundo"
                      }`}
                    >
                      {dia}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selector de Horarios */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-carbon/50">
                Horarios Disponibles
              </label>

              {diaSeleccionado === null ? (
                <div className="rounded-xl border border-dashed border-carbon/10 p-6 text-center text-xs text-carbon/40 italic">
                  Haz clic en un día del calendario para ver las horas disponibles.
                </div>
              ) : cargandoSlots ? (
                <div className="py-6 text-center text-xs text-carbon/50">
                  Cargando disponibilidad...
                </div>
              ) : slots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-rojo/20 bg-rojo/5 p-6 text-center text-xs text-rojo/70 font-semibold">
                  No hay horarios libres para este día. Por favor, selecciona otra fecha.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                  {slots.map((s) => {
                    const esSeleccionado = slotSeleccionado?.inicio === s.inicio;
                    return (
                      <button
                        key={s.inicio}
                        type="button"
                        onClick={() => setSlotSeleccionado(s)}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                          esSeleccionado
                            ? "bg-verde-profundo border-verde-profundo text-white font-bold shadow"
                            : "bg-white border-carbon/15 text-carbon hover:border-sauce/50 hover:bg-sauce/5"
                        }`}
                      >
                        {s.inicio.slice(0, 5)} hs
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Formulario de contacto si seleccionó horario */}
          {slotSeleccionado && (
            <form onSubmit={handleSubmit} className="border-t border-carbon/10 pt-6 space-y-4 animate-slide-up">
              <div className="bg-crema/30 rounded-xl border border-carbon/5 p-3.5 text-xs text-carbon/70 flex justify-between items-center">
                <span>Horario seleccionado:</span>
                <strong className="text-verde-profundo font-mono text-sm">
                  {diaSeleccionado} de {nombresMeses[mesActivo]} | {slotSeleccionado.inicio.slice(0, 5)} hs
                </strong>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-carbon/50 mb-1">
                    Tu Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nombre completo"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon outline-none focus:border-sauce focus:ring-2 focus:ring-sauce/20"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-carbon/50 mb-1">
                    Teléfono / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="10 dígitos con lada"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon outline-none focus:border-sauce focus:ring-2 focus:ring-sauce/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-carbon/50 mb-1">
                    Correo Electrónico (Opcional)
                  </label>
                  <input
                    type="email"
                    placeholder="ejemplo@correo.com"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon outline-none focus:border-sauce focus:ring-2 focus:ring-sauce/20"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-carbon/50 mb-1">
                    Motivo de la Cita
                  </label>
                  <select
                    value={tipoCita}
                    onChange={(e) => setTipoCita(e.target.value as "venta" | "asesoria")}
                    className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon outline-none focus:border-sauce focus:ring-2 focus:ring-sauce/20"
                  >
                    <option value="venta">Cita de Venta (Presencial)</option>
                    <option value="asesoria">Asesoría de Traspaso (Virtual/Presencial)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-carbon/50 mb-1">
                  Notas / Comentarios extras
                </label>
                <textarea
                  placeholder="Compártenos si tienes dudas o algún requerimiento específico..."
                  rows={2}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon outline-none focus:border-sauce resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={guardandoCita}
                className="w-full rounded-xl bg-sauce px-6 py-3 text-sm font-bold text-crema shadow hover:bg-verde-profundo transition disabled:opacity-50"
              >
                {guardandoCita ? "Agendando..." : "Confirmar Cita 📅"}
              </button>
            </form>
          )}

        </div>

      </div>
    </div>
  );
}
