"use server";

/**
 * Programar el servicio cuando el proveedor ya aceptó y el cliente eligió horario:
 * confirma la solicitud, deja la orden de trabajo programada para ese día, agenda la
 * visita (aparece en Actividades de la semana) y manda la confirmación por WhatsApp al
 * cliente (queda en su conversación con sus palomitas) y al proveedor.
 */

import { revalidatePath } from "next/cache";
import { supabaseServidor } from "@/lib/supabase/server";
import { requireAdmin, usuarioActual } from "@/lib/supabase/cliente-sesion";
import { normalizarTelefono } from "@/lib/telefono";
import { registrarActividad } from "@/lib/actividades";
import { costosProveedoresDe, loCotizadoAlCliente } from "@/lib/costo-servicio";
import { MARCA_FOLIO_OT, mensajeServicioCliente, mensajeServicioProveedor } from "@/lib/mensajes-servicio";

export interface DatosProgramacionServicio {
  folio: string;
  clienteNombre: string;
  direccion: string;
  linkMaps: string;
  trabajo: string;
  proveedorNombre: string;
  costo: number | null;
  /** De dónde salió el costo cuando no venía acordado ("" si se acordó al coordinar). */
  origenCosto: string;
  ordenFolio: string | null;
  /** Sugeridos a partir de la opción elegida (solo si vino con día y franja). */
  fecha: string;
  horaInicio: string;
  horaFin: string;
}

async function cargar(sb: ReturnType<typeof supabaseServidor>, solicitudId: string) {
  const { data: sol } = await sb
    .from("solicitudes_proveedor")
    .select(
      "id, folio, estado, descripcion, expediente_id, cotizacion_id, orden_trabajo_id, proveedor_asignado_id, costo_acordado, notas_internas, productos_servicios:producto_id ( nombre ), proveedores:proveedor_asignado_id ( nombre, contacto_nombre, whatsapp, telefono, telegram_chat_id, canal_preferido ), ordenes_trabajo:orden_trabajo_id ( folio )"
    )
    .eq("id", solicitudId)
    .maybeSingle();
  if (!sol) return null;
  const exp = sol.expediente_id
    ? (
        await sb
          .from("expedientes")
          .select("id, prospecto_id, cliente, primer_apellido, telefono, fraccionamiento, direccion_propiedad, link_google_maps, necesidad")
          .eq("id", sol.expediente_id)
          .maybeSingle()
      ).data
    : null;
  // Solo lo que se va a hacer: la necesidad trae notas ("…; agua tibia. Solicita agendar…").
  const trabajo =
    (sol as any).productos_servicios?.nombre ||
    String(exp?.necesidad || "").split(/[;.]/)[0].trim() ||
    String(sol.descripcion || "").split("\n")[0].replace(/^(Servicio|Instalación):\s*/i, "").split(/[;.]/)[0].trim() ||
    "Servicio";
  return { sol: sol as any, exp: exp as any, trabajo };
}

/** Datos para el formulario de programación. `opcion` es el horario que eligió el cliente. */
export async function prepararProgramacionServicio(
  solicitudId: string,
  opcion: string
): Promise<{ ok: boolean; datos?: DatosProgramacionServicio; error?: string }> {
  try {
    await requireAdmin();
    const sb = supabaseServidor();
    const c = await cargar(sb, solicitudId);
    if (!c) return { ok: false, error: "Solicitud no encontrada." };
    const { sol, exp, trabajo } = c;

    // Si la opción vino de Telegram (código día + franja) se conoce la fecha y el horario.
    let fecha = "";
    let horaInicio = "";
    let horaFin = "";
    const { data: aceptado } = await sb
      .from("solicitudes_proveedor_envios")
      .select("fechas_propuestas, tg_opciones")
      .eq("solicitud_id", solicitudId)
      .eq("estado", "aceptada")
      .maybeSingle();
    const idx = Array.isArray(aceptado?.fechas_propuestas) ? aceptado!.fechas_propuestas.map(String).indexOf(opcion) : -1;
    const codigo = idx >= 0 && Array.isArray(aceptado?.tg_opciones) ? String(aceptado!.tg_opciones[idx] || "") : "";
    if (/^\d{8}[MT]$/.test(codigo)) {
      fecha = `${codigo.slice(0, 4)}-${codigo.slice(4, 6)}-${codigo.slice(6, 8)}`;
      [horaInicio, horaFin] = codigo.endsWith("M") ? ["09:00", "13:00"] : ["14:00", "18:00"];
    }

    // Sin costo acordado: el del proveedor según lo que se le cotizó al cliente.
    let costo = sol.costo_acordado === null ? null : Number(sol.costo_acordado);
    let origenCosto = "";
    if (!costo && sol.proveedor_asignado_id) {
      const cotizado = await loCotizadoAlCliente(sb, { expedienteId: sol.expediente_id, prospectoId: exp?.prospecto_id || null });
      const sugerido = cotizado ? (await costosProveedoresDe(sb, cotizado))[sol.proveedor_asignado_id] : undefined;
      if (sugerido) {
        costo = sugerido;
        origenCosto = cotizado!.origen;
      }
    }

    return {
      ok: true,
      datos: {
        folio: sol.folio,
        clienteNombre: [exp?.cliente, exp?.primer_apellido].filter(Boolean).join(" "),
        direccion: exp?.direccion_propiedad || exp?.fraccionamiento || "",
        linkMaps: exp?.link_google_maps || "",
        trabajo,
        proveedorNombre: sol.proveedores?.nombre || "Proveedor",
        costo,
        origenCosto,
        ordenFolio: sol.ordenes_trabajo?.folio || null,
        fecha,
        horaInicio,
        horaFin,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudieron cargar los datos." };
  }
}

export interface ResultadoProgramacionServicio {
  ok: boolean;
  ordenFolio?: string;
  cliente?: { enviado: boolean; error?: string };
  proveedor?: { enviado: boolean; canal?: "whatsapp" | "telegram"; urlWhatsApp?: string; error?: string };
  error?: string;
}

export async function programarServicioSolicitud(input: {
  solicitudId: string;
  /** Teléfono de la conversación del cliente (ahí se manda y se ve la confirmación). */
  telefono: string;
  opcion: string;
  fecha: string; // YYYY-MM-DD
  horaInicio: string; // HH:MM
  horaFin: string; // HH:MM
  costo: number | null;
  notas: string;
  avisarCliente: boolean;
  avisarProveedor: boolean;
  /** Textos revisados en la vista previa; si faltan se arman igual que la vista previa. */
  mensajeCliente?: string;
  mensajeProveedor?: string;
}): Promise<ResultadoProgramacionServicio> {
  try {
    await requireAdmin();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return { ok: false, error: "Indica la fecha del servicio." };
    if (!/^\d{2}:\d{2}$/.test(input.horaInicio)) return { ok: false, error: "Indica la hora de llegada." };
    const horaFin = /^\d{2}:\d{2}$/.test(input.horaFin) && input.horaFin > input.horaInicio ? input.horaFin : sumarHoras(input.horaInicio, 2);
    const sb = supabaseServidor();
    const usuario = await usuarioActual();

    const previo = await cargar(sb, input.solicitudId);
    if (!previo) return { ok: false, error: "Solicitud no encontrada." };
    if (previo.sol.estado !== "asignada" && previo.sol.estado !== "confirmada") {
      return { ok: false, error: "Solo se programa una solicitud que el proveedor ya aceptó." };
    }
    const fechaLeg = fechaLegible(input.fecha);
    const cuando = `${fechaLeg} · ${input.horaInicio} a ${horaFin} h`;

    if (input.costo && input.costo > 0) {
      await sb.from("solicitudes_proveedor").update({ costo_acordado: input.costo }).eq("id", input.solicitudId);
    }
    // 1. Confirmar la solicitud (aviso por Telegram si lo tiene y OT si viene de cotización).
    if (previo.sol.estado === "asignada") {
      const { confirmarSolicitudProveedor } = await import("@/app/actions/solicitudes-proveedor");
      const r = await confirmarSolicitudProveedor(input.solicitudId, cuando);
      if (!r.ok) return { ok: false, error: r.error };
    } else {
      await sb.from("solicitudes_proveedor").update({ fecha_acordada: cuando, updated_at: new Date().toISOString() }).eq("id", input.solicitudId);
    }

    const c = (await cargar(sb, input.solicitudId))!;
    const { sol, exp, trabajo } = c;
    const prov = sol.proveedores || {};
    const costo = input.costo && input.costo > 0 ? input.costo : sol.costo_acordado === null ? null : Number(sol.costo_acordado);
    const clienteNombre = [exp?.cliente, exp?.primer_apellido].filter(Boolean).join(" ") || "Cliente";
    const direccion = exp?.direccion_propiedad || exp?.fraccionamiento || "";
    const concepto = `${trabajo} · ${sol.folio} · ${cuando}`;
    const descripcion = [
      `SERVICIO PROGRAMADO: ${cuando}`,
      `Proveedor: ${prov.nombre || "—"}${costo ? ` · costo acordado ${pesos(costo)}` : ""}`,
      direccion ? `Dirección: ${direccion}` : "",
      exp?.link_google_maps ? `Maps: ${exp.link_google_maps}` : "",
      input.notas.trim() ? `Indicaciones: ${input.notas.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // 2. Orden de trabajo programada para ese día (se crea si no hay).
    let otId: string | null = sol.orden_trabajo_id;
    let otFolio: string | null = sol.ordenes_trabajo?.folio || null;
    if (!otId) {
      const { crearOrdenTrabajo } = await import("@/app/actions/ordenes-trabajo");
      const ot = await crearOrdenTrabajo({
        expedienteId: sol.expediente_id,
        cotizacionId: sol.cotizacion_id,
        titulo: `${trabajo} — ${clienteNombre}`,
        descripcion,
        fechaProgramada: input.fecha,
        proveedorId: sol.proveedor_asignado_id,
        costoProveedor: costo,
        proveedorConcepto: concepto,
      });
      if (!ot.ok || !ot.id) return { ok: false, error: `Se confirmó con el proveedor, pero no se pudo crear la orden de trabajo: ${ot.error || "error desconocido"}` };
      otId = ot.id;
      otFolio = ot.folio || null;
      await sb.from("solicitudes_proveedor").update({ orden_trabajo_id: ot.id }).eq("id", input.solicitudId);
    } else {
      await sb
        .from("ordenes_trabajo")
        .update({
          fecha_programada: input.fecha,
          proveedor_id: sol.proveedor_asignado_id,
          ...(costo ? { costo_proveedor: costo } : {}),
          proveedor_concepto: concepto,
          descripcion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", otId)
        .neq("estatus", "completada");
    }

    // 3. Visita en la agenda con su horario: aparece en Actividades de la semana.
    const notasCita = [`Servicio ${sol.folio}${otFolio ? ` · OT ${otFolio}` : ""} con ${prov.nombre || "proveedor"}`, trabajo, input.notas.trim()]
      .filter(Boolean)
      .join(" · ");
    const { data: citaPrevia } = await sb
      .from("agenda_citas")
      .select("id")
      .eq("tipo_cita", "instalacion")
      .ilike("notas", `Servicio ${sol.folio}%`)
      .limit(1)
      .maybeSingle();
    const cita = {
      fecha: input.fecha,
      hora_inicio: input.horaInicio,
      hora_fin: horaFin,
      notas: notasCita,
      estado: "confirmada",
    };
    if (citaPrevia) {
      await sb.from("agenda_citas").update(cita).eq("id", citaPrevia.id);
    } else {
      const { error: errCita } = await sb.from("agenda_citas").insert({
        ...cita,
        perfil_id: usuario?.id,
        prospecto_id: exp?.prospecto_id || null,
        expediente_id: sol.expediente_id || null,
        cotizacion_id: sol.cotizacion_id || null,
        cliente_nombre: clienteNombre,
        cliente_telefono: normalizarTelefono(input.telefono || exp?.telefono || ""),
        fraccionamiento: exp?.fraccionamiento || direccion,
        tipo_cita: "instalacion",
      });
      if (errCita) console.error("No se pudo agendar el servicio:", errCita.message);
    }
    if (sol.expediente_id) {
      await sb.from("expedientes").update({ fecha_instalacion: `${input.fecha}T${input.horaInicio}:00-06:00` }).eq("id", sol.expediente_id);
    }

    // 4. Confirmaciones por WhatsApp.
    const resultado: ResultadoProgramacionServicio = { ok: true, ordenFolio: otFolio || undefined };
    const datosMensaje = {
      clienteNombre: exp?.cliente || "",
      trabajo,
      fecha: input.fecha,
      horaInicio: input.horaInicio,
      horaFin,
      direccion,
      linkMaps: exp?.link_google_maps || "",
      ordenFolio: otFolio,
      solicitudFolio: sol.folio,
      costo,
      notas: input.notas,
    };
    const conFolio = (t: string) => t.split(MARCA_FOLIO_OT).join(otFolio || "por asignar");
    if (input.avisarCliente) {
      const texto = conFolio(input.mensajeCliente?.trim() || mensajeServicioCliente(datosMensaje));
      const { responderConversacion } = await import("@/app/actions/conversaciones");
      const r = await responderConversacion(input.telefono, texto);
      resultado.cliente = r.ok ? { enviado: true } : { enviado: false, error: r.error || "No se pudo enviar." };
    }
    if (input.avisarProveedor && sol.proveedor_asignado_id) {
      const texto = conFolio(input.mensajeProveedor?.trim() || mensajeServicioProveedor(datosMensaje));
      resultado.proveedor = await avisarProveedor(sb, prov, texto);
    }

    // 5. Bitácora.
    await registrarActividad(sb, {
      expedienteId: sol.expediente_id,
      prospectoId: exp?.prospecto_id || null,
      tipo: "servicio_programado",
      titulo: `📅 Servicio programado: ${cuando}`,
      detalle: [
        `${trabajo} con ${prov.nombre || "proveedor"}${costo ? ` · costo ${pesos(costo)}` : ""}`,
        otFolio ? `Orden de trabajo ${otFolio}` : "",
        resultado.cliente ? `Confirmación al cliente: ${resultado.cliente.enviado ? "enviada por WhatsApp" : `no se envió (${resultado.cliente.error})`}` : "",
        resultado.proveedor
          ? `Confirmación al proveedor: ${resultado.proveedor.enviado ? `enviada por ${resultado.proveedor.canal === "telegram" ? "Telegram" : "WhatsApp"}` : "pendiente de mandar desde el WhatsApp del asesor"}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    revalidatePath("/ordenes-trabajo");
    revalidatePath("/dashboard");
    return resultado;
  } catch (err: any) {
    return { ok: false, error: err?.message || "No se pudo programar el servicio." };
  }
}

/** Proveedor: WhatsApp de la línea secundaria; si no, Telegram; si no, link wa.me para el asesor. */
async function avisarProveedor(
  sb: ReturnType<typeof supabaseServidor>,
  prov: any,
  texto: string
): Promise<NonNullable<ResultadoProgramacionServicio["proveedor"]>> {
  const telefono = normalizarTelefono(prov.whatsapp || prov.telefono || "");
  if (telefono && prov.canal_preferido !== "telegram") {
    try {
      const { enviarMensajeTextoEvolution } = await import("@/lib/evolution-api");
      const r = await enviarMensajeTextoEvolution(telefono, texto);
      if (r.ok) return { enviado: true, canal: "whatsapp" };
    } catch {
      // sigue con Telegram / wa.me
    }
  }
  if (prov.telegram_chat_id) {
    try {
      const { obtenerConfiguracionTelegram, enviarMensajeTelegram } = await import("@/lib/telegram");
      const { botToken } = await obtenerConfiguracionTelegram(sb);
      if (botToken) {
        const r = await enviarMensajeTelegram({ botToken, chatId: prov.telegram_chat_id, texto: texto.replace(/\*/g, "") });
        if (r.ok) return { enviado: true, canal: "telegram" };
      }
    } catch {
      // sigue con wa.me
    }
  }
  return telefono
    ? { enviado: false, canal: "whatsapp", urlWhatsApp: `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}` }
    : { enviado: false, error: "El proveedor no tiene WhatsApp ni Telegram registrado." };
}

export interface CoordinacionServicioPendiente {
  id: string;
  folio: string;
  estado: "abierta" | "asignada" | "sin_proveedor";
  estadoLabel: string;
  clienteNombre: string;
  telefono: string;
  trabajo: string;
  proveedorNombre: string;
  opciones: string[];
  createdAt: string;
  horas: number;
}

/** Solicitudes a proveedor sin programar todavía, de la más antigua a la más reciente. */
export async function listarCoordinacionesServicioPendientes(): Promise<CoordinacionServicioPendiente[]> {
  await requireAdmin();
  const sb = supabaseServidor();
  const { data } = await sb
    .from("solicitudes_proveedor")
    .select(
      "id, folio, estado, descripcion, expediente_id, created_at, productos_servicios:producto_id ( nombre ), proveedor:proveedor_asignado_id ( nombre ), solicitudes_proveedor_envios ( estado, fechas_propuestas, proveedores:proveedor_id ( nombre ) )"
    )
    .in("estado", ["abierta", "asignada", "sin_proveedor"])
    .order("created_at", { ascending: true })
    .limit(100);
  const filas = (data || []) as any[];
  const expIds = Array.from(new Set(filas.map((f) => f.expediente_id).filter(Boolean)));
  const exps = new Map<string, any>();
  if (expIds.length) {
    const { data: e } = await sb.from("expedientes").select("id, cliente, primer_apellido, telefono, necesidad").in("id", expIds);
    for (const x of e || []) exps.set(x.id, x);
  }
  const ahora = Date.now();
  return filas.map((f) => {
    const exp = exps.get(f.expediente_id);
    const envios = f.solicitudes_proveedor_envios || [];
    const aceptado = envios.find((e: any) => e.estado === "aceptada");
    const activo = envios.find((e: any) => e.estado === "enviada" || e.estado === "vista");
    return {
      id: f.id,
      folio: f.folio,
      estado: f.estado,
      estadoLabel:
        f.estado === "asignada"
          ? "Proveedor aceptó: falta que el cliente elija horario"
          : f.estado === "sin_proveedor"
          ? "Ningún proveedor aceptó"
          : activo?.estado === "vista"
          ? "El proveedor la vio, sin responder"
          : "Esperando al proveedor",
      clienteNombre: [exp?.cliente, exp?.primer_apellido].filter(Boolean).join(" ") || "Cliente",
      telefono: normalizarTelefono(exp?.telefono || ""),
      trabajo: f.productos_servicios?.nombre || exp?.necesidad || String(f.descripcion || "").split("\n")[0] || "Servicio",
      proveedorNombre: f.proveedor?.nombre || aceptado?.proveedores?.nombre || activo?.proveedores?.nombre || "—",
      opciones: Array.isArray(aceptado?.fechas_propuestas) ? aceptado.fechas_propuestas.map(String) : [],
      createdAt: f.created_at,
      horas: Math.floor((ahora - new Date(f.created_at).getTime()) / 3600000),
    };
  });
}

function sumarHoras(hhmm: string, horas: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String(Math.min(23, h + horas)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fechaLegible(fecha: string): string {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Mexico_City",
  });
}

function pesos(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}
