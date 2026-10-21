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
  costo: number | null;
  notas: string;
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
  return (
    `¡Hola${nombre ? ` ${nombre}` : ""}! ✅ Te confirmamos tu servicio con SAUCEDA:\n\n` +
    `🔧 *Servicio:* ${d.trabajo}\n` +
    `📅 *Fecha:* ${fechaServicioLegible(d.fecha)}\n` +
    `⏰ *Horario:* ${horario(d)}\n` +
    (d.direccion ? `📍 *Dirección:* ${d.direccion}\n` : "") +
    `🧾 *Orden de trabajo:* ${d.ordenFolio || MARCA_FOLIO_OT}\n` +
    (d.notas.trim() ? `📌 ${d.notas.trim()}\n` : "") +
    `\nNuestro técnico llegará en ese horario; por favor ten libre el acceso al área de trabajo. Si necesitas cambiar algo, respóndenos por aquí. 💚`
  );
}

export function mensajeServicioProveedor(d: DatosMensajeServicio): string {
  return (
    `✅ *Servicio confirmado · SAUCEDA*\n\n` +
    `🧾 Orden de trabajo *${d.ordenFolio || MARCA_FOLIO_OT}* (solicitud ${d.solicitudFolio})\n` +
    `🔧 ${d.trabajo}\n` +
    `📅 *${fechaServicioLegible(d.fecha)}*\n` +
    `⏰ *${horario(d)}*\n` +
    `👤 Cliente: ${d.clienteNombre.trim().split(/\s+/)[0] || "—"}\n` +
    (d.direccion ? `📍 ${d.direccion}\n` : "") +
    (d.linkMaps ? `🗺 ${d.linkMaps}\n` : "") +
    (d.costo ? `💲 Costo acordado: ${d.costo.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 })}\n` : "") +
    (d.notas.trim() ? `📌 ${d.notas.trim()}\n` : "") +
    `\nPor favor confírmanos de recibido. ¡Gracias!`
  );
}

/** Para avisar si el mensaje al cliente trae un monto (no debe ver el costo del proveedor). */
export function mencionaMonto(texto: string, costo: number | null): boolean {
  if (/\$\s?\d/.test(texto)) return true;
  if (!costo) return false;
  const n = String(Math.round(costo));
  return new RegExp(`(^|[^\\d])${n.replace(/\B(?=(\d{3})+(?!\d))/g, ",?")}([^\\d]|$)`).test(texto);
}
