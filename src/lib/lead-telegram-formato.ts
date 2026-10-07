/**
 * Formato del mensaje de Telegram con el que se pasa un lead a un asesor.
 * Es puro (sin dependencias de servidor) para que la vista previa del modal
 * y el envío real usen exactamente el mismo texto.
 */

export interface DatosLeadTelegram {
  clienteNombre: string;
  /** Teléfono legible (477 752 9447). */
  telefonoLegible: string;
  /** Teléfono solo dígitos con lada (524777529447) para el enlace wa.me. */
  telefonoWa: string;
  tipoNegocio: string;
  expedienteId: string | null;
  prospectoId: string | null;
  direccion: string;
  necesidad: string;
  asignadoPor: string;
  fotosCliente: number;
  /** Imágenes comparativas de precios que se le enviaron al cliente. */
  comparativas?: number;
  totalMensajes: number;
}

/** Escapa texto de usuario para el HTML de Telegram. */
export const escHtmlTelegram = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const esc = escHtmlTelegram;

/** Mensaje principal (HTML de Telegram: solo <b>, <i> y <a>). Máx. ~4096 caracteres. */
export function armarHtmlLeadTelegram(d: DatosLeadTelegram, resumen: string, nota: string): string {
  const folios = [d.expedienteId, d.prospectoId].filter(Boolean).join(" · ");
  // null = línea omitida; "" = línea en blanco
  const partes: (string | null)[] = [
    `📨 <b>NUEVO LEAD ASIGNADO</b>`,
    ``,
    `👤 <b>Cliente:</b> ${esc(d.clienteNombre)}`,
    d.telefonoLegible
      ? `📞 <b>Teléfono:</b> ${esc(d.telefonoLegible)}${
          d.telefonoWa ? ` · <a href="https://wa.me/${esc(d.telefonoWa)}">Abrir WhatsApp</a>` : ""
        }`
      : null,
    d.tipoNegocio ? `💼 <b>Servicio:</b> ${esc(d.tipoNegocio)}` : null,
    folios ? `🗂️ <b>Folios:</b> ${esc(folios)}` : null,
    d.direccion ? `🏠 <b>Dirección:</b> ${esc(d.direccion)}` : null,
    d.necesidad ? `🎯 <b>Necesidad:</b> ${esc(d.necesidad.slice(0, 400))}` : null,
  ];
  const r = (resumen || "").trim();
  if (r) partes.push("", `🧠 <b>Resumen de la conversación:</b>`, esc(r.slice(0, 1500)));
  const n = (nota || "").trim();
  if (n) partes.push("", `🗒️ <b>Nota de ${esc(d.asignadoPor || "coordinación")}:</b> ${esc(n.slice(0, 600))}`);
  partes.push(
    "",
    `💬 Conversación completa (${d.totalMensajes} mensajes) en el archivo adjunto.`,
    d.comparativas ? `💲 Comparativa de precios que se le envió al cliente, a continuación.` : null,
    d.fotosCliente > 0 ? `📷 ${d.fotosCliente} foto(s) del cliente a continuación.` : null,
    "",
    `Asignado por: ${esc(d.asignadoPor || "SAUCEDA")}. Sofía quedó en pausa para este cliente.`,
    `👇 Confirma que lo recibiste:`
  );
  return partes
    .filter((p): p is string => p !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
