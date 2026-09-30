/**
 * CATÁLOGO DE PLANTILLAS OFICIALES DE WHATSAPP (META CLOUD API)
 * Módulo: Gestión de Compraventa INFONAVIT · SAUCEDA Bienes Raíces
 * 
 * Regla de Meta: Fuera de la ventana de 24 horas, todo mensaje saliente
 * debe enviarse a través de una plantilla aprobada bajo la categoría UTILITY.
 */

export interface PlantillaMetaInfo {
  nombrePlantilla: string;
  categoria: "UTILITY" | "MARKETING";
  idioma: "es_MX";
  descripcion: string;
  variables: string[];
  textoPropuesto: string;
}

export const PLANTILLAS_INFONAVIT_META: Record<string, PlantillaMetaInfo> = {
  // 1. Bienvenida + Enlace único al formulario al aceptar la propuesta
  BIENVENIDA_EXPEDIENTE: {
    nombrePlantilla: "infonavit_bienvenida_expediente",
    categoria: "UTILITY",
    idioma: "es_MX",
    descripcion: "Se envía automáticamente cuando se crea la orden de trabajo tras aceptar la cotización.",
    variables: ["{{1}} = Nombre del cliente", "{{2}} = Folio OT", "{{3}} = Enlace al formulario"],
    textoPropuesto:
      "Hola {{1}}, ¡felicidades por dar el paso con SAUCEDA Bienes Raíces! Hemos aperturado tu expediente de compraventa INFONAVIT con folio {{2}}. Para iniciar la revisión técnica, por favor ingresa a tu enlace personalizado y sube tus documentos con fotos claras desde tu celular: {{3}} . Si tienes dudas, tu asesor asignado te apoyará en todo momento.",
  },

  // 2. Recordatorio periódico mientras falten documentos obligatorios
  RECORDATORIO_DOCUMENTOS: {
    nombrePlantilla: "infonavit_recordatorio_docs",
    categoria: "UTILITY",
    idioma: "es_MX",
    descripcion: "Disparado cada 3 días si la OT continúa en Etapa 3 (Integración de expediente).",
    variables: ["{{1}} = Nombre del cliente", "{{2}} = Cantidad de documentos faltantes", "{{3}} = Enlace al formulario"],
    textoPropuesto:
      "Hola {{1}}, te saludamos de SAUCEDA. Te recordamos que aún tienes {{2}} documento(s) pendiente(s) para avanzar con el avalúo y la inscripción de tu crédito INFONAVIT. Puedes subir tus fotos pendientes ingresando aquí: {{3}} . Mantener tu expediente al día agiliza la fecha de firma en notaría.",
  },

  // 3. Documento rechazado con motivo claro de corrección
  DOCUMENTO_RECHAZADO: {
    nombrePlantilla: "infonavit_documento_rechazado",
    categoria: "UTILITY",
    idioma: "es_MX",
    descripcion: "Disparado en cuanto el asesor técnico marca un documento como 'rechazado' en el CRM.",
    variables: ["{{1}} = Nombre del cliente", "{{2}} = Nombre del documento", "{{3}} = Motivo del rechazo", "{{4}} = Enlace al formulario"],
    textoPropuesto:
      "Hola {{1}}, en la revisión técnica de tu expediente de compraventa INFONAVIT requerimos corregir tu {{2}}. Motivo: {{3}}. Por favor vuelve a tomar la foto asegurándote de que sea legible y súbela en tu enlace: {{4}} . Agradecemos tu apoyo para evitar observaciones en notaría.",
  },

  // 4. Citatorio de firma de escritura en notaría + qué llevar
  CITA_FIRMA_NOTARIA: {
    nombrePlantilla: "infonavit_cita_firma_notaria",
    categoria: "UTILITY",
    idioma: "es_MX",
    descripcion: "Disparado al alcanzar la Etapa 7 / 8 cuando la notaría confirma día, hora y notaría.",
    variables: [
      "{{1}} = Nombre del cliente",
      "{{2}} = Número de Notaría y Ciudad",
      "{{3}} = Fecha y Hora de la cita",
      "{{4}} = Documentos originales a llevar (INE original, comprobante, etc.)",
    ],
    textoPropuesto:
      "¡Buenas noticias {{1}}! Tenemos fecha confirmada para la firma de tu escritura ante Notaría Pública. Te esperamos en la Notaría {{2}} el día {{3}}. Es indispensable llevar contigo en original: {{4}}. Tu asesor de SAUCEDA estará presente para acompañarte en la firma.",
  },

  // 5. Cierre formal del trámite + solicitud de testimonio / reseña
  CIERRE_Y_TESTIMONIO: {
    nombrePlantilla: "infonavit_cierre_testimonio",
    categoria: "UTILITY",
    idioma: "es_MX",
    descripcion: "Disparado al alcanzar la Etapa 10 (Escritura inscrita / Cierre).",
    variables: ["{{1}} = Nombre del cliente", "{{2}} = Enlace de Google Maps / Reseñas"],
    textoPropuesto:
      "Hola {{1}}, ¡muchas felicidades! Tu trámite de compraventa INFONAVIT ha concluido con éxito y tu escritura quedó formalmente inscrita. En SAUCEDA fue un honor acompañarte. ¿Nos apoyarías regalándonos tu opinión y calificación sobre nuestro servicio en este enlace? {{2}} ¡Gracias por tu confianza y éxito en tu nuevo hogar!",
  },
};
