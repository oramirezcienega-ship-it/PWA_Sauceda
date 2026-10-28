/**
 * Mensajes de confirmación de un servicio programado (cliente y proveedor). Se usan para la
 * vista previa en el CRM y para el envío, así lo que se ve es lo que sale.
 * El del cliente NUNCA lleva el costo del proveedor.
 */

/** Marca del folio de la OT cuando todavía no existe; se reemplaza al programar. */
export const MARCA_FOLIO_OT = "[folio OT]";

export interface DatosMensajeServicio {
  clienteNombre: string;
  trabajo: string;
  fecha: string; // YYYY-MM-DD
  horaInicio: string; // HH:MM
  horaFin: string; // HH:MM
  direccion: string;
  linkMaps: string;
  ordenFolio: string | null;
  solicitudFolio: string;
  /** Lo que cobra el proveedor: solo va en su mensaje. */
  costo: number | null;
  /** Lo que paga el cliente: va en su mensaje y en la OT. */
  precioCliente: number | null;
  /** Teléfono del cliente (dígitos con lada) para el link de WhatsApp en el mensaje del proveedor. */
  clienteTelefono: string;
  notas: string;
}

function pesosMx(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
}

export function fechaServicioLegible(fecha: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Mexico_City",
  });
}

/** "14:30" → "2:30 pm" */
export function horaLegible(hhmm: string): string {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "pm" : "am"}`;
}

function horario(d: DatosMensajeServicio): string {
  return d.horaFin ? `${horaLegible(d.horaInicio)} a ${horaLegible(d.horaFin)}` : horaLegible(d.horaInicio);
}

export function mensajeServicioCliente(d: DatosMensajeServicio): string {
  const nombre = d.clienteNombre.trim().split(/\s+/)[0] || "";
  const esInspeccion = /inspecci[oó]n|diagn[oó]stico|valoraci[oó]n/i.test(d.trabajo);
  if (esInspeccion) {
    return (
      `¡Hola${nombre ? ` ${nombre}` : ""}! ✅ Te confirmamos tu visita de inspección y diagnóstico con SAUCEDA:\n\n` +
      `🔍 *Concepto:* ${d.trabajo}\n` +
      `📅 *Fecha:* ${fechaServicioLegible(d.fecha)}\n` +
      `⏰ *Horario:* ${horario(d)}\n` +
      (d.direccion ? `📍 *Dirección:* ${d.direccion}\n` : "") +
      (d.precioCliente && d.precioCliente > 0
        ? `💰 *Costo de la visita:* ${pesosMx(d.precioCliente)}\n`
        : `💰 *Costo de la visita:* Sin costo (diagnóstico técnico en sitio)\n`) +
      `🧾 *Folio:* ${d.ordenFolio || MARCA_FOLIO_OT}\n` +
      (d.notas.trim() ? `📌 ${d.notas.trim()}\n` : "") +
      `\nNuestro técnico especialista acudirá a revisar físicamente las condiciones del equipo para diagnosticar la falla y entregarte la cotización exacta de reparación. Por favor ten libre el acceso al área. Si necesitas cambiar algo, respóndenos por aquí. 💚`
    );
  }
  return (
    `¡Hola${nombre ? ` ${nombre}` : ""}! ✅ Te confirmamos tu servicio con SAUCEDA:\n\n` +
    `🔧 *Servicio:* ${d.trabajo}\n` +
    `📅 *Fecha:* ${fechaServicioLegible(d.fecha)}\n` +
    `⏰ *Horario:* ${horario(d)}\n` +
    (d.direccion ? `📍 *Dirección:* ${d.direccion}\n` : "") +
    (d.precioCliente ? `💰 *Costo del servicio:* ${pesosMx(d.precioCliente)}\n` : "") +
    `🧾 *Orden de trabajo:* ${d.ordenFolio || MARCA_FOLIO_OT}\n` +
    (d.notas.trim() ? `📌 ${d.notas.trim()}\n` : "") +
    `\nNuestro técnico llegará en ese horario; por favor ten libre el acceso al área de trabajo. Si necesitas cambiar algo, respóndenos por aquí. 💚`
  );
}

export function mensajeServicioProveedor(d: DatosMensajeServicio): string {
  const esInspeccion = /inspecci[oó]n|diagn[oó]stico|valoraci[oó]n/i.test(d.trabajo);
  const encabezado = esInspeccion ? "Inspección / Diagnóstico confirmado" : "Servicio confirmado";
  return (
    `✅ *${encabezado} · SAUCEDA*\n\n` +
    `🧾 Folio *${d.ordenFolio || MARCA_FOLIO_OT}* (solicitud ${d.solicitudFolio})\n` +
    `🔍 ${d.trabajo}\n` +
    `📅 *${fechaServicioLegible(d.fecha)}*\n` +
    `⏰ *${horario(d)}*\n` +
    `👤 Cliente: ${d.clienteNombre.trim() || "—"}\n` +
    (d.clienteTelefono ? `📱 WhatsApp del cliente: https://wa.me/${d.clienteTelefono}\n` : "") +
    (d.direccion ? `📍 ${d.direccion}\n` : "") +
    (d.linkMaps ? `🗺 ${d.linkMaps}\n` : "") +
    (d.costo && d.costo > 0 ? `💲 Costo acordado: ${pesosMx(d.costo)}\n` : "") +
    (d.notas.trim() ? `📌 ${d.notas.trim()}\n` : "") +
    (esInspeccion
      ? `\n📌 *Objetivo de la visita:* Revisar en sitio el equipo/instalación, diagnosticar la falla o fugas y definir lo necesario para cotizar la reparación definitiva.\n\nPor favor confírmanos de recibido. ¡Gracias!`
      : `\nPor favor confírmanos de recibido. ¡Gracias!`)
  );
}

/** Para avisar si el mensaje al cliente trae el costo del proveedor (el precio del servicio sí puede ir). */
export function mencionaMonto(texto: string, costo: number | null, precioCliente?: number | null): boolean {
  if (!costo || costo === precioCliente) return false;
  const n = String(Math.round(costo));
  return new RegExp(`(^|[^\\d])${n.replace(/\B(?=(\d{3})+(?!\d))/g, ",?")}([^\\d]|$)`).test(texto);
}

/** "24 de octubre", "23 oct", "5 de enero de 2027" */
const RE_DIA_MES = /(\d{1,2})\s+(?:de\s+)?((?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-záéíóú]*)\.?(?:\s+(?:de\s+)?(\d{4}))?/;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * Fecha de un horario escrito: "sábado, 24 de octubre · 14:30", "24/10", "2026-10-24".
 * Sin año, el próximo que no haya pasado. "" si no se entiende.
 */
export function fechaDeTexto(texto: string, hoy: Date = new Date()): string {
  const t = texto.toLowerCase();
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  let dia = 0;
  let mes = -1;
  let anio = 0;
  const conMes = t.match(RE_DIA_MES);
  if (conMes) {
    dia = Number(conMes[1]);
    mes = MESES.findIndex((m) => conMes[2].startsWith(m.slice(0, 3)));
    anio = Number(conMes[3] || 0);
  } else {
    const num = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (num) {
      dia = Number(num[1]);
      mes = Number(num[2]) - 1;
      anio = num[3] ? Number(num[3].length === 2 ? `20${num[3]}` : num[3]) : 0;
    }
  }
  if (!(dia >= 1 && dia <= 31) || mes < 0 || mes > 11) return "";
  if (!anio) {
    anio = hoy.getFullYear();
    const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (new Date(anio, mes, dia) < hoySinHora) anio += 1;
  }
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** "2:30 a 3:00 pm" → ["14:30", "15:00"]; "por la mañana" → ["09:00", "13:00"]. Ignora el día del mes. */
export function horasDeTexto(texto: string): [string, string] {
  // Se quita la fecha para que el "24" de "24 de octubre" no cuente como hora.
  const t = texto
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}/g, " ")
    .replace(new RegExp(RE_DIA_MES.source, "g"), " ")
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, " ");
  const tarde = /p\.?\s*m|tarde|noche/.test(t);
  const horas = Array.from(t.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(h\b|hrs?\b|am|pm|a\.\s*m|p\.\s*m)?/g))
    .filter((m) => m[2] || m[3] || /\d{1,2}\s*(a|-|–)\s*\d|\blas?\s+\d/.test(t))
    .map((m) => {
      let h = Number(m[1]);
      if (tarde && h <= 9) h += 12;
      return h <= 23 ? `${String(h).padStart(2, "0")}:${m[2] || "00"}` : "";
    })
    .filter(Boolean);
  if (horas.length) return [horas[0], horas[1] && horas[1] > horas[0] ? horas[1] : ""];
  if (/tarde/.test(t)) return ["14:00", "18:00"];
  if (/ma[ñn]ana/.test(t)) return ["09:00", "13:00"];
  return ["", ""];
}
