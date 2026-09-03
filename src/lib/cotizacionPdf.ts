import { jsPDF } from "jspdf";
import { formatoPesos } from "@/lib/formato";
import type { Cotizacion, CotizacionConcepto, VisitaReporte } from "@/lib/types";

const VERDE_PROFUNDO = [45, 74, 43]; // #2D4A2B
const SAUCE = [92, 122, 82]; // #5C7A52
const DORADO = [201, 169, 97]; // #C9A961
const CARBON = [30, 41, 59]; // slate-800
const CARBON_LIGHT = [100, 116, 139]; // slate-500
const BG_CARD = [248, 250, 252]; // slate-50
const BORDE_CARD = [226, 232, 240]; // slate-200
const AMBER_BG = [254, 252, 232]; // amber-50
const AMBER_BORDER = [253, 230, 138]; // amber-200
const AMBER_TEXT = [146, 64, 14]; // amber-800

function getServicioNombre(tipo: string): string {
  const servicioLabels: Record<string, string> = {
    impermeabilizacion: "Impermeabilización",
    pintura: "Pintura & Acabados",
    losa: "Construcción de Losa",
    remodelacion: "Remodelación Integral",
  };
  return servicioLabels[tipo] || tipo || "Construcción & Mantenimiento";
}

/**
 * 1. PDF DE COTIZACIÓN / PROPUESTA COMERCIAL (Homologado a la versión blanca del portal)
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

  const pageWidth = doc.internal.pageSize.getWidth(); // ~210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // ~297 mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const portalUrl = `${baseUrl}/cotizacion/${cotizacion.token}`;
  const servicioNombre = getServicioNombre(cotizacion.servicioTipo);
  const nombreCliente = cotizacion.prospectoNombre || "Cliente";

  // ENCABEZADO SUPERIOR DISCRETO (URL y Título)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  const fechaHoy = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  doc.text(`${fechaHoy}`, margin, 8);
  doc.text(`SAUCEDA · Propuesta Comercial (Folio ${cotizacion.id})`, pageWidth / 2, 8, { align: "center" });

  let y = 14;

  // TÍTULOS Y LOGO DERECHO
  // Subtítulo superior
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(SAUCE[0], SAUCE[1], SAUCE[2]);
  doc.text(`PROPUESTA TÉCNICA COMERCIAL  ${cotizacion.id}`, margin, y);

  // Título Principal
  y += 5.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text(`Cotización de ${servicioNombre}`, margin, y);

  // Subtítulo de Cliente
  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text(`Preparada especialmente para: `, margin, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(nombreCliente, margin + 41, y);

  // Logo a la derecha
  const logoX = pageWidth - margin - 22;
  doc.setFillColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.circle(logoX + 11, y - 6, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("S", logoX + 11, y - 3.8, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("SAUCEDA", logoX + 11, y + 3, { align: "center" });
  doc.setFontSize(5.5);
  doc.setTextColor(DORADO[0], DORADO[1], DORADO[2]);
  doc.text("CONSTRUYE", logoX + 11, y + 5.5, { align: "center" });

  y += 7;

  // LÍNEA DIVISORIA SUTIL
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  // TARJETA 1: DATOS DEL CLIENTE Y CONTACTO
  doc.setFillColor(BG_CARD[0], BG_CARD[1], BG_CARD[2]);
  doc.roundedRect(margin, y, contentWidth, 23, 2, 2, "F");
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.roundedRect(margin, y, contentWidth, 23, 2, 2, "D");

  // Columna Izquierda
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("DATOS DEL CLIENTE", margin + 5, y + 4.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text(nombreCliente, margin + 5, y + 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text(`Número de Cliente: `, margin + 5, y + 15.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(cotizacion.prospectoId || cotizacion.id, margin + 30, y + 15.5);

  // Columna Derecha
  const colDerX = margin + contentWidth / 2 + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("CONTACTO Y UBICACIÓN", colDerX, y + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("Teléfono: ", colDerX, y + 10);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(cotizacion.prospectoTelefono || "—", colDerX + 16, y + 10);

  if (cotizacion.prospectoDireccion || cotizacion.prospectoCorreo) {
    const textoSecundario = cotizacion.prospectoDireccion ? `Dirección: ${cotizacion.prospectoDireccion}` : `Correo: ${cotizacion.prospectoCorreo}`;
    doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
    const direccionTruncada = doc.splitTextToSize(textoSecundario, contentWidth / 2 - 8)[0];
    doc.text(direccionTruncada, colDerX, y + 15.5);
  }

  y += 27;

  // SECCIÓN 1: DESGLOSE E IMPORTE DE LA INVERSIÓN
  // Círculo con el número 1
  doc.setFillColor(SAUCE[0], SAUCE[1], SAUCE[2]);
  doc.circle(margin + 2.5, y + 2, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("1", margin + 2.5, y + 2.8, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
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
    unit: margin + 125,
    precio: margin + 150,
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
    doc.text(formatoPesos(c.precioUnitario || 0), colX.precio, y + 4.8, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.text(formatoPesos(c.importe || 0), colX.importe, y + 4.8, { align: "right" });

    y += 7;
  });

  y += 3;

  // TARJETA DE TOTAL LLAVE EN MANO
  const montoTotal = cotizacion.precioFinal || cotizacion.costoEstimado || 0;
  doc.setFillColor(BG_CARD[0], BG_CARD[1], BG_CARD[2]);
  doc.roundedRect(margin, y, contentWidth, 21, 2, 2, "F");
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.roundedRect(margin, y, contentWidth, 21, 2, 2, "D");

  // Lado Izquierdo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text("Presupuesto Cerrado Llave en Mano", margin + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("Incluye materiales de alta calidad, mano de obra y supervisión técnica.", margin + 4, y + 11);
  doc.text("Precios más IVA.", margin + 4, y + 15);

  // Lado Derecho Total
  const totalDerX = margin + contentWidth - 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("TOTAL DE INVERSIÓN (ANTES DE IVA)", totalDerX, y + 5.5, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text(formatoPesos(montoTotal), totalDerX, y + 13, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("+ IVA (Antes de Impuestos)", totalDerX, y + 17.5, { align: "right" });

  y += 25;

  // NOTA IMPORTANTE (CAJA ÁMBAR)
  if (cotizacion.servicioTipo === "impermeabilizacion" || cotizacion.requiereVisita) {
    doc.setFillColor(AMBER_BG[0], AMBER_BG[1], AMBER_BG[2]);
    doc.roundedRect(margin, y, contentWidth, 38, 2, 2, "F");
    doc.setDrawColor(AMBER_BORDER[0], AMBER_BORDER[1], AMBER_BORDER[2]);
    doc.roundedRect(margin, y, contentWidth, 38, 2, 2, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(AMBER_TEXT[0], AMBER_TEXT[1], AMBER_TEXT[2]);
    doc.text("!  NOTA IMPORTANTE:", margin + 4, y + 5.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
    doc.text("Las cotizaciones enviadas están basadas en los metros estimados que mencionaste.", margin + 4, y + 10);
    doc.setFont("helvetica", "bold");
    doc.text("PERO la inspección técnica EN SITIO es ESENCIAL porque:", margin + 4, y + 14);

    doc.setFont("helvetica", "normal");
    doc.text("✓  Confirmamos los metros exactos (muchas veces varían).", margin + 4, y + 18);
    doc.text("✓  Identificamos bordes, pretiles y áreas anexas que también necesitan impermeabilización.", margin + 4, y + 21.5);
    doc.text("✓  Evaluamos el estado de muros, grietas y bajadas pluviales de agua.", margin + 4, y + 25);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
    doc.text("Por eso la visita técnica es GRATUITA y SIN COMPROMISO para garantizar tu presupuesto exacto.", margin + 4, y + 31);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(SAUCE[0], SAUCE[1], SAUCE[2]);
    doc.text("¿Deseas agendar para que nuestro técnico confirme todos los detalles?", margin + 4, y + 34.5);

    y += 42;
  }

  // PÁGINA 2: CONDICIONES Y FIRMA DIGITAL
  doc.addPage();
  let y2 = 14;

  // Header superior página 2
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text(`${fechaHoy}`, margin, 8);
  doc.text(`SAUCEDA · Propuesta Comercial (Folio ${cotizacion.id})`, pageWidth / 2, 8, { align: "center" });

  // CONDICIONES COMERCIALES Y GARANTÍA
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("CONDICIONES COMERCIALES Y GARANTÍA", margin, y2);

  y2 += 4.5;
  doc.setFontSize(7.5);
  const condiciones = [
    { label: "Precios:", val: "Todos los precios expresados son más IVA (16% de Impuesto al Valor Agregado)." },
    { label: "Vigencia:", val: "Esta cotización cuenta con una vigencia de 15 días a partir de su envío." },
    { label: "Forma de pago:", val: cotizacion.condicionesPago || "Anticipo del 50% para compra de materiales y programación; 50% al término." },
    { label: "Garantía:", val: cotizacion.garantia || "Todos los trabajos cuentan con garantía técnica por escrito contra vicios ocultos." },
  ];

  condiciones.forEach((item) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
    doc.text(`• ${item.label} `, margin + 2, y2);
    const labelWidth = doc.getTextWidth(`• ${item.label} `);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
    const valTrunc = doc.splitTextToSize(item.val, contentWidth - labelWidth - 4);
    doc.text(valTrunc, margin + 2 + labelWidth, y2);
    y2 += (valTrunc.length * 4.5) + 1;
  });

  y2 += 6;

  // LÍNEA DIVISORIA
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.line(margin, y2, pageWidth - margin, y2);
  y2 += 6;

  // SECCIÓN 3: FIRMA Y AUTORIZACIÓN DE ORDEN DE TRABAJO
  doc.setFillColor(SAUCE[0], SAUCE[1], SAUCE[2]);
  doc.circle(margin + 2.5, y2 + 2, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("3", margin + 2.5, y2 + 2.8, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("Firma y Autorización de Orden de Trabajo", margin + 7, y2 + 3.2);

  y2 += 8;

  // Nombre del autorizador
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("NOMBRE COMPLETO DEL CLIENTE AUTORIZADOR", margin, y2);

  y2 += 2.5;
  doc.setFillColor(BG_CARD[0], BG_CARD[1], BG_CARD[2]);
  doc.roundedRect(margin, y2, contentWidth, 8, 1.5, 1.5, "F");
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.roundedRect(margin, y2, contentWidth, 8, 1.5, 1.5, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(nombreCliente, margin + 4, y2 + 5.2);

  y2 += 12;

  // Recuadro de Firma Digital
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("FIRMA DIGITAL (DIBUJA EN EL RECUADRO O FIRMA DIGITALMENTE EN PORTAL)", margin, y2);

  y2 += 2.5;
  const firmaBoxHeight = 36;
  doc.setFillColor(BG_CARD[0], BG_CARD[1], BG_CARD[2]);
  doc.roundedRect(margin, y2, contentWidth, firmaBoxHeight, 2, 2, "F");
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.roundedRect(margin, y2, contentWidth, firmaBoxHeight, 2, 2, "D");

  // Línea sutil de firma
  doc.setDrawColor(BORDE_CARD[0], BORDE_CARD[1], BORDE_CARD[2]);
  doc.line(margin + contentWidth / 4, y2 + firmaBoxHeight - 10, margin + (contentWidth * 3) / 4, y2 + firmaBoxHeight - 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("Firma de Conformidad y Aceptación", pageWidth / 2, y2 + firmaBoxHeight - 5, { align: "center" });

  y2 += firmaBoxHeight + 8;

  // Botón simulado "Autorizar e Iniciar Proyecto"
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(SAUCE[0], SAUCE[1], SAUCE[2]);
  doc.text("Autorizar e Iniciar Proyecto", pageWidth / 2, y2, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text(`Enlace directo para autorizar en línea: ${portalUrl}`, pageWidth / 2, y2 + 5, { align: "center" });

  // PIE DE PÁGINA DISCRETO
  const footerY = pageHeight - 10;
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text(portalUrl, margin, footerY);
  doc.text("1/2", pageWidth - margin, 8, { align: "right" });
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
  const servicioNombre = getServicioNombre(cotizacion.servicioTipo);
  const nombreCliente = cotizacion.prospectoNombre || "Cliente";

  // ENCABEZADO SUPERIOR
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  const fechaHoy = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  doc.text(`${fechaHoy}`, margin, 8);
  doc.text(`SAUCEDA · Reporte de Levantamiento Técnico (Folio ${cotizacion.id})`, pageWidth / 2, 8, { align: "center" });

  let y = 14;

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(SAUCE[0], SAUCE[1], SAUCE[2]);
  doc.text(`REPORTE DE LEVANTAMIENTO TÉCNICO  ${cotizacion.id}`, margin, y);

  y += 5.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("Ficha de Inspección y Diagnóstico", margin, y);

  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text(`Servicio: `, margin, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(`${servicioNombre}  ·  Cliente: ${nombreCliente}`, margin + 14, y);

  // Logo a la derecha
  const logoX = pageWidth - margin - 22;
  doc.setFillColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.circle(logoX + 11, y - 6, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("S", logoX + 11, y - 3.8, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("SAUCEDA", logoX + 11, y + 3, { align: "center" });
  doc.setFontSize(5.5);
  doc.setTextColor(DORADO[0], DORADO[1], DORADO[2]);
  doc.text("Construye", logoX + 11, y + 5.5, { align: "center" });

  y += 7;
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
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text("Técnico / Operario Visitador:", col1X, y + 11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(reporteVisita.inspectorNombre || "Personal Técnico Sauceda", col1X, y + 16);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
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
  const footerY = pageHeight - 10;
  doc.setFontSize(6.5);
  doc.setTextColor(CARBON_LIGHT[0], CARBON_LIGHT[1], CARBON_LIGHT[2]);
  doc.text(`SAUCEDA Construye · León, Gto. · Reporte emitido en portal`, margin, footerY);
  doc.text(`1/1`, pageWidth - margin, footerY, { align: "right" });

  return doc;
}
