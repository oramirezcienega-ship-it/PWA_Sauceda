import { jsPDF } from "jspdf";
import type { Cotizacion, CotizacionConcepto, VisitaReporte, ServicioConstruccionTipo } from "@/lib/types";

// Paleta de colores oficial Sauceda
const VERDE_PROFUNDO = [45, 74, 43]; // #2D4A2B
const SAUCE = [92, 122, 82]; // #5C7A52
const DORADO = [201, 169, 97]; // #C9A961
const CARBON = [30, 41, 59]; // slate-800 (#1E293B)
const CARBON_MUTED = [100, 116, 139]; // slate-500 (#64748B)
const CARBON_LIGHT = [148, 163, 184]; // slate-400 (#94A3B8)
const BG_CARD = [248, 250, 252]; // slate-50 (#F8FAFC)
const BORDE_CARD = [226, 232, 240]; // slate-200 (#E2E8F0)
const AMBER_BG = [255, 253, 245]; // amber-50/50 (#FFFDF5)
const AMBER_BORDER = [254, 240, 138]; // amber-200 (#FEF08A)
const AMBER_TEXT = [180, 83, 9]; // amber-700 (#B45309)

function formatMoneda(val: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(val || 0);
}

function getServicioLabel(tipo: string): string {
  switch (tipo) {
    case "pintura": return "Pintura";
    case "impermeabilizacion": return "Impermeabilización";
    case "losa": return "Construcción de Losa (Techo)";
    case "remodelacion": return "Remodelación";
    default: return "Servicios de Construcción";
  }
}

/**
 * 1. PDF DE COTIZACIÓN / PROPUESTA COMERCIAL
 * Homologado 1:1 con la vista de impresión del portal del cliente (VisualizadorCotizacionCliente.tsx)
 */
export function generarPdfCotizacion(
  cotizacion: Cotizacion,
  conceptos: CotizacionConcepto[],
  baseUrl: string = "https://crm.saucedamx.com"
): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182 mm
  const portalUrl = `${baseUrl}/cotizacion/${cotizacion.token}`;
  const servicioLabel = getServicioLabel(cotizacion.servicioTipo);
  const nombreCliente = cotizacion.prospectoNombre || "Cliente";

  const fechaActual = new Date();
  const fechaTopLeft = `${fechaActual.getMonth() + 1}/${fechaActual.getDate()}/${String(fechaActual.getFullYear()).slice(-2)}, ${fechaActual.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  // ==========================================
  // PÁGINA 1
  // ==========================================

  // Header superior de navegador / portal
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text(fechaTopLeft, margin, 7.5);
  doc.text(`SAUCEDA · Propuesta Comercial (Folio ${cotizacion.id})`, pageWidth / 2, 7.5, { align: "center" });

  let y = 14;

  // Encabezado Principal
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(SAUCE[0], SAUCE[1], SAUCE[2]);
  doc.text("PROPUESTA TÉCNICA COMERCIAL", margin, y);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(DORADO[0], DORADO[1], DORADO[2]);
  doc.text(cotizacion.id, margin + 50, y);

  // Título: Cotización de Impermeabilización
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text(`Cotización de ${servicioLabel}`, margin, y);

  // Preparada especialmente para: Enrique Medina
  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text("Preparada especialmente para: ", margin, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(nombreCliente, margin + 41, y);

  // LOGO DERECHO (SAUCEDA Construye)
  const logoX = pageWidth - margin - 22;
  doc.setFillColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.circle(logoX + 11, y - 6.5, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("S", logoX + 11, y - 4.2, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("SAUCEDA", logoX + 11, y + 2.5, { align: "center" });
  doc.setFontSize(5.5);
  doc.setTextColor(DORADO[0], DORADO[1], DORADO[2]);
  doc.text("CONSTRUYE", logoX + 11, y + 5.2, { align: "center" });

  y += 7.5;

  // LÍNEA DIVISORIA SUTIL
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  // TARJETA DE DATOS DEL CLIENTE Y CONTACTO
  const cardHeight = 22;
  doc.setFillColor(BG_CARD[0], BG_CARD[1], BG_CARD[2]);
  doc.roundedRect(margin, y, contentWidth, cardHeight, 2, 2, "F");
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.roundedRect(margin, y, contentWidth, cardHeight, 2, 2, "D");

  // Columna Izquierda: Datos del Cliente
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("DATOS DEL CLIENTE", margin + 4.5, y + 4.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text(nombreCliente, margin + 4.5, y + 9.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text("Número de Cliente: ", margin + 4.5, y + 15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(cotizacion.prospectoId || cotizacion.id, margin + 28, y + 15);

  // Columna Derecha: Contacto y Ubicación
  const colDerX = margin + contentWidth / 2 + 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("CONTACTO Y UBICACIÓN", colDerX, y + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text("Teléfono:", colDerX, y + 9.5);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(cotizacion.prospectoTelefono || "—", colDerX + 14, y + 9.5);

  if (cotizacion.prospectoDireccion || cotizacion.prospectoCorreo) {
    const textoUb = cotizacion.prospectoDireccion ? `Dirección: ${cotizacion.prospectoDireccion}` : `Correo: ${cotizacion.prospectoCorreo}`;
    doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
    const ubTrunc = doc.splitTextToSize(textoUb, contentWidth / 2 - 6)[0];
    doc.text(ubTrunc, colDerX, y + 15);
  }

  y += cardHeight + 5;

  // 1. DESGLOSE E IMPORTE DE LA INVERSIÓN
  doc.setFillColor(SAUCE[0], SAUCE[1], SAUCE[2]);
  doc.circle(margin + 2.5, y + 2, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("1", margin + 2.5, y + 2.8, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("Desglose e Importe de la Inversión", margin + 7, y + 3.2);

  y += 5.5;

  // TABLA DE CONCEPTOS
  const tableHeaderHeight = 6;
  doc.setFillColor(BG_CARD[0], BG_CARD[1], BG_CARD[2]);
  doc.rect(margin, y, contentWidth, tableHeaderHeight, "F");
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.line(margin, y + tableHeaderHeight, margin + contentWidth, y + tableHeaderHeight);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);

  const colX = {
    desc: margin + 3,
    cant: margin + 105,
    unit: margin + 124,
    precio: margin + 148,
    importe: margin + contentWidth - 3,
  };

  doc.text("Descripción del Concepto / Insumo", colX.desc, y + 4);
  doc.text("Cantidad", colX.cant, y + 4, { align: "center" });
  doc.text("Unidad", colX.unit, y + 4, { align: "center" });
  doc.text("P. Unitario", colX.precio, y + 4, { align: "right" });
  doc.text("Importe", colX.importe, y + 4, { align: "right" });

  y += tableHeaderHeight;

  doc.setFontSize(7.5);
  conceptos.forEach((c) => {
    doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
    doc.line(margin, y + 7, margin + contentWidth, y + 7);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);

    const desc = doc.splitTextToSize(c.descripcion, 98)[0] || c.descripcion;
    doc.text(desc, colX.desc, y + 4.8);

    doc.setFont("helvetica", "bold");
    doc.text(String(c.cantidad), colX.cant, y + 4.8, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.text(c.unidad || "pza", colX.unit, y + 4.8, { align: "center" });
    doc.text(formatMoneda(c.precioUnitario || 0), colX.precio, y + 4.8, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.text(formatMoneda(c.importe || 0), colX.importe, y + 4.8, { align: "right" });

    y += 7;
  });

  y += 4;

  // TARJETA DE PRESUPUESTO CERRADO LLAVE EN MANO & TOTAL
  const montoTotal = cotizacion.precioFinal || cotizacion.costoEstimado || 0;
  doc.setFillColor(BG_CARD[0], BG_CARD[1], BG_CARD[2]);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, "F");
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, "D");

  // Lado Izquierdo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text("Presupuesto Cerrado Llave en Mano", margin + 4.5, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text("Incluye materiales de alta calidad, mano de obra y supervisión técnica. Precios", margin + 4.5, y + 11.5);
  doc.text("más IVA.", margin + 4.5, y + 15.5);

  // Lado Derecho: Total
  const totalDerX = margin + contentWidth - 4.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("TOTAL DE INVERSIÓN (ANTES DE IVA)", totalDerX, y + 5.5, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15.5);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text(formatMoneda(montoTotal), totalDerX, y + 13, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("+ IVA (Antes de Impuestos)", totalDerX, y + 17.5, { align: "right" });

  y += 26;

  // NOTA IMPORTANTE (CAJA ÁMBAR IDÉNTICA AL PORTAL)
  if (cotizacion.servicioTipo === "impermeabilizacion" || cotizacion.requiereVisita) {
    doc.setFillColor(AMBER_BG[0], AMBER_BG[1], AMBER_BG[2]);
    doc.roundedRect(margin, y, contentWidth, 48, 2, 2, "F");
    doc.setDrawColor(AMBER_BORDER[0], AMBER_BORDER[1], AMBER_BORDER[2]);
    doc.roundedRect(margin, y, contentWidth, 48, 2, 2, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(AMBER_TEXT[0], AMBER_TEXT[1], AMBER_TEXT[2]);
    doc.text("!   NOTA IMPORTANTE:", margin + 4.5, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
    doc.text("Las cotizaciones que te envié están basadas en los metros que mencionaste.", margin + 4.5, y + 11);
    doc.setFont("helvetica", "bold");
    doc.text("PERO la inspección técnica EN SITIO es ESENCIAL porque:", margin + 4.5, y + 15.5);

    doc.setFont("helvetica", "normal");
    doc.text("✓   Confirmamos los metros exactos (muchas veces varían).", margin + 4.5, y + 20);
    doc.text("✓   Identificamos bordes, cornisas y áreas anexas que también necesitan impermeabilización.", margin + 4.5, y + 24);
    doc.text("✓   Evaluamos el estado de muros, drenajes y bajadas de agua.", margin + 4.5, y + 28);
    doc.text("✓   Detectamos trabajos adicionales que pudieran ser necesarios.", margin + 4.5, y + 32);

    doc.setFont("helvetica", "normal");
    doc.text("En ocasiones, lo que parece 30m² en realidad son 35-40m² cuando se incluyen todos los lados y áreas adyacentes.", margin + 4.5, y + 37);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
    doc.text("Por eso la visita técnica es GRATUITA y SIN COMPROMISO. Te damos la cotización final exacta después de inspeccionarlo.", margin + 4.5, y + 41.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(SAUCE[0], SAUCE[1], SAUCE[2]);
    doc.text("¿Agendamos para que nuestro técnico confirme todos los detalles?", margin + 4.5, y + 45.5);

    y += 52;
  }

  // Footer Página 1
  const footerY = pageHeight - 7;
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text(portalUrl, margin, footerY);
  doc.text("1/2", pageWidth - margin, footerY, { align: "right" });

  // ==========================================
  // PÁGINA 2: CONDICIONES Y FIRMA
  // ==========================================
  doc.addPage();
  let y2 = 14;

  // Header superior Página 2
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text(fechaTopLeft, margin, 7.5);
  doc.text(`SAUCEDA · Propuesta Comercial (Folio ${cotizacion.id})`, pageWidth / 2, 7.5, { align: "center" });

  // CONDICIONES COMERCIALES Y GARANTÍA
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("CONDICIONES COMERCIALES Y GARANTÍA", margin, y2);

  y2 += 5;
  doc.setFontSize(7.5);
  const condiciones = [
    { label: "Precios:", val: "Todos los precios expresados son más IVA (16% de Impuesto al Valor Agregado)." },
    { label: "Vigencia:", val: "Esta cotización cuenta con una vigencia de 15 días a partir de su envío." },
    { label: "Forma de pago:", val: cotizacion.condicionesPago || "Anticipo del 50% para compra de materiales y programación de inicio; 50% al término a entera satisfacción." },
    { label: "Garantía:", val: cotizacion.garantia || "Todos los trabajos cuentan con garantía técnica contra vicios ocultos de acuerdo al servicio contratado." },
  ];

  condiciones.forEach((item) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
    doc.text(`•  ${item.label} `, margin + 2, y2);
    const labelWidth = doc.getTextWidth(`•  ${item.label} `);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
    const valTrunc = doc.splitTextToSize(item.val, contentWidth - labelWidth - 4);
    doc.text(valTrunc, margin + 2 + labelWidth, y2);
    y2 += (valTrunc.length * 4.5) + 1.5;
  });

  y2 += 6;

  // LÍNEA DIVISORIA
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.line(margin, y2, pageWidth - margin, y2);
  y2 += 6;

  // 3. FIRMA Y AUTORIZACIÓN DE ORDEN DE TRABAJO
  doc.setFillColor(SAUCE[0], SAUCE[1], SAUCE[2]);
  doc.circle(margin + 2.5, y2 + 2, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("3", margin + 2.5, y2 + 2.8, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("Firma y Autorización de Orden de Trabajo", margin + 7, y2 + 3.2);

  y2 += 8;

  // Campo Nombre Completo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("NOMBRE COMPLETO DEL CLIENTE AUTORIZADOR", margin, y2);

  y2 += 2.5;
  doc.setFillColor(BG_CARD[0], BG_CARD[1], BG_CARD[2]);
  doc.roundedRect(margin, y2, contentWidth, 8.5, 1.5, 1.5, "F");
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.roundedRect(margin, y2, contentWidth, 8.5, 1.5, 1.5, "D");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(nombreCliente || "Escribe tu nombre completo", margin + 4, y2 + 5.5);

  y2 += 13;

  // Campo Firma Digital
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("FIRMA DIGITAL (DIBUJA EN EL RECUADRO)", margin, y2);

  y2 += 2.5;
  const firmaHeight = 38;
  doc.setFillColor(BG_CARD[0], BG_CARD[1], BG_CARD[2]);
  doc.roundedRect(margin, y2, contentWidth, firmaHeight, 2, 2, "F");
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.roundedRect(margin, y2, contentWidth, firmaHeight, 2, 2, "D");

  // Botón Limpiar en esquina inferior derecha del recuadro
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("Limpiar", margin + contentWidth - 8, y2 + firmaHeight - 3, { align: "right" });

  // Línea sutil para firmar
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.line(margin + contentWidth / 4, y2 + firmaHeight - 12, margin + (contentWidth * 3) / 4, y2 + firmaHeight - 12);
  doc.text("Firma de Conformidad", pageWidth / 2, y2 + firmaHeight - 6, { align: "center" });

  y2 += firmaHeight + 10;

  // Botón simulado "Autorizar e Iniciar Proyecto"
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text("Autorizar e Iniciar Proyecto", pageWidth / 2, y2, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text(`Enlace del portal: ${portalUrl}`, pageWidth / 2, y2 + 5, { align: "center" });

  // Footer Página 2
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text(portalUrl, margin, footerY);
  doc.text("2/2", pageWidth - margin, footerY, { align: "right" });

  return doc;
}

/**
 * 2. PDF DE REPORTE DE LEVANTAMIENTO TÉCNICO Y DIAGNÓSTICO
 */
export function generarPdfReporteVisita(
  cotizacion: Cotizacion,
  reporteVisita: VisitaReporte,
  baseUrl: string = "https://crm.saucedamx.com"
): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const servicioLabel = getServicioLabel(cotizacion.servicioTipo);
  const nombreCliente = cotizacion.prospectoNombre || "Cliente";

  const fechaActual = new Date();
  const fechaTopLeft = `${fechaActual.getMonth() + 1}/${fechaActual.getDate()}/${String(fechaActual.getFullYear()).slice(-2)}, ${fechaActual.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  // ENCABEZADO SUPERIOR
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text(fechaTopLeft, margin, 7.5);
  doc.text(`SAUCEDA · Reporte de Levantamiento Técnico (Folio ${cotizacion.id})`, pageWidth / 2, 7.5, { align: "center" });

  let y = 14;

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(SAUCE[0], SAUCE[1], SAUCE[2]);
  doc.text(`REPORTE DE LEVANTAMIENTO TÉCNICO  ${cotizacion.id}`, margin, y);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("Ficha de Inspección y Diagnóstico", margin, y);

  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text(`Servicio: `, margin, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(`${servicioLabel}  ·  Cliente: ${nombreCliente}`, margin + 14, y);

  // Logo a la derecha
  const logoX = pageWidth - margin - 22;
  doc.setFillColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.circle(logoX + 11, y - 6.5, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("S", logoX + 11, y - 4.2, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("SAUCEDA", logoX + 11, y + 2.5, { align: "center" });
  doc.setFontSize(5.5);
  doc.setTextColor(DORADO[0], DORADO[1], DORADO[2]);
  doc.text("CONSTRUYE", logoX + 11, y + 5.2, { align: "center" });

  y += 7.5;
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  // 1. INFORMACIÓN DE LA VISITA
  doc.setFillColor(BG_CARD[0], BG_CARD[1], BG_CARD[2]);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, "F");
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("INFORMACIÓN DE LA VISITA", margin + 5, y + 5);

  const col1X = margin + 5;
  const col2X = margin + contentWidth / 2 + 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text("Técnico / Operario Visitador:", col1X, y + 11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(reporteVisita.inspectorNombre || "Personal Técnico Sauceda", col1X, y + 16);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text("Fecha & Horario de la Inspección:", col2X, y + 11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  const fechaVisita = reporteVisita.fechaInspeccion
    ? new Date(reporteVisita.fechaInspeccion).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "Conforme a agenda";
  doc.text(fechaVisita, col2X, y + 16);

  y += 28;

  // 2. DIAGNÓSTICO Y OBSERVACIONES TÉCNICAS
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("Diagnóstico y Observaciones Técnicas", margin, y);

  y += 3.5;
  doc.setFillColor(BG_CARD[0], BG_CARD[1], BG_CARD[2]);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, "F");
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, "D");

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  const obsLines = doc.splitTextToSize(`"${reporteVisita.observacionesTecnicas || "Sin observaciones específicas capturadas."}"`, contentWidth - 8);
  doc.text(obsLines, margin + 4, y + 6);

  y += 32;

  // 3. CONDICIONES Y MEDIDAS
  const mitadW = (contentWidth - 4) / 2;

  // Condiciones
  doc.setFillColor(BG_CARD[0], BG_CARD[1], BG_CARD[2]);
  doc.roundedRect(margin, y, mitadW, 26, 2, 2, "F");
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.roundedRect(margin, y, mitadW, 26, 2, 2, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("CONDICIONES DETECTADAS", margin + 4, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  const condText = doc.splitTextToSize(reporteVisita.condicionesSitio || "Condiciones normales de obra sin afectaciones críticas.", mitadW - 8);
  doc.text(condText, margin + 4, y + 10);

  // Medidas y Dimensionamiento
  const colMedidasX = margin + mitadW + 4;
  doc.setFillColor(BG_CARD[0], BG_CARD[1], BG_CARD[2]);
  doc.roundedRect(colMedidasX, y, mitadW, 26, 2, 2, "F");
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.roundedRect(colMedidasX, y, mitadW, 26, 2, 2, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("MEDIDAS Y DIMENSIONAMIENTO", colMedidasX + 4, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(`Largo: ${reporteVisita.medidas?.largo || 0} m`, colMedidasX + 4, y + 10);
  doc.text(`Ancho: ${reporteVisita.medidas?.ancho || 0} m`, colMedidasX + 4, y + 14.5);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text(`Área Estimada: ${reporteVisita.medidas?.areaCalculada || 0} m²`, colMedidasX + 4, y + 20);

  y += 30;

  // PIE DE PÁGINA
  const footerY = pageHeight - 7;
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text(`SAUCEDA Construye · León, Gto. · Reporte emitido en portal`, margin, footerY);
  doc.text(`1/1`, pageWidth - margin, footerY, { align: "right" });

  return doc;
}
