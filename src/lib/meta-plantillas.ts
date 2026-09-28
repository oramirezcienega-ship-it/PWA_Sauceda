/**
 * Definiciones y especificaciones de Plantillas de WhatsApp (Meta Cloud API).
 * 
 * Estas plantillas están redactadas y categorizadas según los lineamientos de Meta
 * para su registro y aprobación en Meta Business Manager (categoría UTILITY).
 */

export interface MetaPlantillaDef {
  nombre: string;
  categoria: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  idioma: string;
  titulo: string;
  descripcion: string;
  encabezado?: {
    tipo: "TEXT" | "IMAGE" | "DOCUMENT";
    texto?: string;
  };
  cuerpoTexto: string;
  pieDePagina?: string;
  variablesEjemplo: Record<string, string>;
  botones: Array<{
    tipo: "URL" | "QUICK_REPLY" | "PHONE_NUMBER";
    texto: string;
    url?: string;
  }>;
}

/**
 * Plantilla oficial para notificación de conclusión y entrega de servicio técnico.
 * Categoría: UTILITY (garantiza entrega rápida y aprobación sin restricciones promocionales).
 */
export const PLANTILLA_ENTREGA_SERVICIO: MetaPlantillaDef = {
  nombre: "sauceda_entrega_servicio",
  categoria: "UTILITY",
  idioma: "es_MX",
  titulo: "Entrega de Servicio y Conclusión de Orden de Trabajo",
  descripcion:
    "Notificación transaccional formal al cliente al concluir una orden de trabajo. Incluye folio, título del proyecto, fecha y botón con liga personalizada a su reporte digital con evidencias, remisión/factura y póliza de garantía.",
  encabezado: {
    tipo: "TEXT",
    texto: "Entrega de Servicio · SAUCEDA",
  },
  cuerpoTexto:
    "Estimado/a {{1}}, le confirmamos que los trabajos de su orden {{2}} han sido concluidos exitosamente a entera satisfacción.\n\n" +
    "📋 *Proyecto:* {{3}}\n" +
    "📅 *Fecha de entrega:* {{4}}\n\n" +
    "Puede consultar su reporte de entrega, fotos de avance, remisión/factura y póliza de garantía oficial en el siguiente enlace:",
  pieDePagina: "SAUCEDA · Tradición con Tecnología",
  variablesEjemplo: {
    "{{1}}": "Lic. Roberto González",
    "{{2}}": "OT-2026-0005",
    "{{3}}": "Instalación de Sistema de Impermeabilización",
    "{{4}}": "27 de Septiembre de 2026",
  },
  botones: [
    {
      tipo: "URL",
      texto: "Ver Reporte y Garantía",
      url: "https://crm.saucedamx.com/orden-trabajo/entrega/{{1}}",
    },
  ],
};

/**
 * Genera el texto plano formateado para envío por WhatsApp Web / directo (wa.me)
 * o para previsualizar antes de enviar.
 */
export function generarMensajeEntregaDirecto(params: {
  clienteNombre: string;
  folioOT: string;
  tituloOT: string;
  fechaEntrega: string;
  tokenOT: string;
  notasConclusion?: string;
  urlBase?: string;
  tokenCotizacion?: string;
  tokenGarantia?: string;
}): string {
  const base = params.urlBase || "https://crm.saucedamx.com";
  const urlEntrega = `${base}/orden-trabajo/entrega/${params.tokenOT}`;

  let texto = `¡Hola *${params.clienteNombre}*! 🛠️\n\n`;
  texto += `Le informamos que los trabajos de su orden *${params.folioOT}* (*${params.tituloOT}*) han sido *concluidos exitosamente* a entera satisfacción.\n\n`;

  if (params.notasConclusion && params.notasConclusion.trim()) {
    texto += `📝 *Comentarios de entrega técnica:*\n"${params.notasConclusion.trim()}"\n\n`;
  }

  texto += `📂 *Reporte digital con fotos de evidencia, remisión y garantía:*\n👉 ${urlEntrega}\n\n`;

  if (params.tokenCotizacion) {
    texto += `🧾 *Remisión de Entrega / Factura:*\n${base}/cotizacion/remision/${params.tokenCotizacion}\n\n`;
  }

  if (params.tokenGarantia) {
    texto += `🛡️ *Póliza de Garantía Oficial:*\n${base}/garantia/${params.tokenGarantia}\n\n`;
  }

  texto += `Quedamos a sus órdenes para cualquier duda o servicio adicional.\n\n_SAUCEDA · Tradición con Tecnología_`;

  return texto;
}
