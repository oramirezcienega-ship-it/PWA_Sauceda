import { jsPDF } from "jspdf";
import type { Cotizacion } from "@/lib/types";

// Paleta oficial de marca SAUCEDA
const VERDE_PROFUNDO = [45, 74, 43]; // #2D4A2B
const SAUCE = [92, 122, 82]; // #5C7A52
const DORADO = [201, 169, 97]; // #C9A961
const CREMA_MARFIL = [245, 241, 232]; // #F5F1E8
const CARBON = [26, 26, 26]; // #1A1A1A
const CARBON_MUTED = [100, 116, 139]; // slate-500
const BORDE = [226, 232, 240]; // slate-200
const BLANCO = [255, 255, 255];
const AMBER_BG = [255, 251, 235]; // amber-50
const AMBER_BORDER = [253, 230, 138]; // amber-200
const AMBER_TEXT = [146, 64, 14]; // amber-800

function formatMoneda(val: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(val || 0);
}

export function generarPdfCotizacionInfonavit(
  cotizacion: Cotizacion,
  baseUrl: string = "https://crm.saucedamx.com",
  inmuebleInfo?: { direccion?: string; fraccionamiento?: string }
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
  const nombreCliente = cotizacion.prospectoNombre || "Cliente";

  const fechaActual = new Date();
  const fechaStr = fechaActual.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // ==========================================
  // PÁGINA 1: PROPUESTA INTEGRAL
  // ==========================================

  // Encabezado sutil
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text(`SAUCEDA Bienes Raíces · Folio ${cotizacion.id}`, margin, 9);
  doc.text(`Fecha de emisión: ${fechaStr}`, pageWidth - margin, 9, { align: "right" });

  let y = 16;

  // Header SAUCEDA
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(SAUCE[0], SAUCE[1], SAUCE[2]);
  doc.text("PROPUESTA DE SERVICIOS PROFESIONALES", margin, y);

  doc.setTextColor(DORADO[0], DORADO[1], DORADO[2]);
  doc.text(cotizacion.id, margin + 74, y);

  // Logo derecha
  const logoX = pageWidth - margin - 22;
  doc.setFillColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.circle(logoX + 11, y - 5, 6, "F");
  doc.setTextColor(BLANCO[0], BLANCO[1], BLANCO[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("S", logoX + 11, y - 2.8, { align: "center" });

  doc.setFontSize(8);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("SAUCEDA", logoX + 11, y + 4, { align: "center" });
  doc.setFontSize(5);
  doc.setTextColor(DORADO[0], DORADO[1], DORADO[2]);
  doc.text("BIENES RAÍCES", logoX + 11, y + 6.5, { align: "center" });

  y += 6;
  // Título Principal
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("Gestión y Acompañamiento en Compraventa INFONAVIT", margin, y);

  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text("Preparada para: ", margin, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text(nombreCliente, margin + 26, y);

  y += 6;
  doc.setDrawColor(BORDE[0], BORDE[1], BORDE[2]);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // TARJETA DE HONORARIOS Y ESQUEMA DE PAGO 50/50
  const tarjetaPrecioHeight = 27;
  doc.setFillColor(CREMA_MARFIL[0], CREMA_MARFIL[1], CREMA_MARFIL[2]);
  doc.roundedRect(margin, y, contentWidth, tarjetaPrecioHeight, 2, 2, "F");
  doc.setDrawColor(DORADO[0], DORADO[1], DORADO[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentWidth, tarjetaPrecioHeight, 2, 2, "D");
  doc.setLineWidth(0.2);

  // Columna Izquierda: Precio Total
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text("HONORARIOS TOTALES DEL SERVICIO", margin + 6, y + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("$15,000.00 MXN", margin + 6, y + 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(SAUCE[0], SAUCE[1], SAUCE[2]);
  doc.text("Tarifa única fija · Sin comisiones ocultas", margin + 6, y + 20);

  // Divisor vertical
  doc.setDrawColor(BORDE[0], BORDE[1], BORDE[2]);
  doc.line(margin + 75, y + 4, margin + 75, y + tarjetaPrecioHeight - 4);

  // Columna Derecha: Esquema 50/50
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  doc.text("ESQUEMA DE PAGO (50% / 50%)", margin + 82, y + 6);

  // Hito 1
  doc.setFillColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.circle(margin + 85, y + 11.5, 1.8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text("Anticipo al Aceptar (50%):", margin + 89, y + 12.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("$7,500.00 MXN", margin + 140, y + 12.5);

  // Hito 2
  doc.setFillColor(DORADO[0], DORADO[1], DORADO[2]);
  doc.circle(margin + 85, y + 19, 1.8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text("Liquidación a la Firma (50%):", margin + 89, y + 20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("$7,500.00 MXN", margin + 140, y + 20);

  y += tarjetaPrecioHeight + 6;

  // SECCIÓN: QUÉ INCLUYE EL SERVICIO
  doc.setFillColor(BLANCO[0], BLANCO[1], BLANCO[2]);
  doc.roundedRect(margin, y, contentWidth, 54, 2, 2, "F");
  doc.setDrawColor(BORDE[0], BORDE[1], BORDE[2]);
  doc.roundedRect(margin, y, contentWidth, 54, 2, 2, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.text("✓ QUÉ INCLUYE NUESTRO SERVICIO INTEGRAL", margin + 5, y + 6);

  const alcances = [
    "Gestión y acompañamiento integral personalizado durante todo el trámite hasta entrega de llaves.",
    "Dictamen técnico de avalúo comercial emitido por unidad de valuación certificada por INFONAVIT.",
    "Gestión de carta saldo y liquidación de hipoteca previa en caso de deuda activa del vendedor.",
    "Certificado de Libertad de Gravamen (CLG) oficial expedido por el Registro Público de la Propiedad.",
    "Constancia oficial de alineamiento y número oficial emitida por la Dirección de Desarrollo Urbano.",
    "Cotejo y validación documental previa tanto de la parte compradora como de la vendedora.",
    "Inscripción formal del expediente del crédito y paquete técnico ante la delegación de INFONAVIT.",
    "Coordinación notarial: revisión del proyecto de escritura, citatorio y asistencia presencial a firma.",
    "Acompañamiento en el acto de entrega física y cambio de titular de servicios (predial, SAPAL, CFE).",
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);

  let alcanceY = y + 11.5;
  for (const alcance of alcances) {
    doc.setFillColor(SAUCE[0], SAUCE[1], SAUCE[2]);
    doc.circle(margin + 7, alcanceY - 1, 1.2, "F");
    const lineas = doc.splitTextToSize(alcance, contentWidth - 14);
    doc.text(lineas, margin + 11, alcanceY);
    alcanceY += 4.5;
  }

  y += 58;

  // SECCIÓN: QUÉ NO INCLUYE (EXCLUSIONES TRANSPARENTES)
  doc.setFillColor(BLANCO[0], BLANCO[1], BLANCO[2]);
  doc.roundedRect(margin, y, contentWidth, 38, 2, 2, "F");
  doc.setDrawColor(BORDE[0], BORDE[1], BORDE[2]);
  doc.roundedRect(margin, y, contentWidth, 38, 2, 2, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text("✗ QUÉ NO INCLUYE (GASTOS NOTARIALES E IMPUESTOS)", margin + 5, y + 6);

  const exclusiones = [
    "Honorarios del Notario Público por formalización de la escritura.",
    "Impuesto Sobre Adquisición de Inmuebles (ISAI) municipal y derechos de inscripción en el RPP.",
    "Impuesto Sobre la Renta (ISR) por enajenación a cargo de la parte vendedora (si no exenta).",
  ];

  let excY = y + 11.5;
  for (const exc of exclusiones) {
    doc.setFillColor(239, 68, 68); // Rojo
    doc.circle(margin + 7, excY - 1, 1.2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
    doc.text(exc, margin + 11, excY);
    excY += 4.5;
  }

  // Aclaración importante de escrituración
  doc.setFillColor(CREMA_MARFIL[0], CREMA_MARFIL[1], CREMA_MARFIL[2]);
  doc.roundedRect(margin + 5, excY - 1.5, contentWidth - 10, 11, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(SAUCE[0], SAUCE[1], SAUCE[2]);
  doc.text("NOTA IMPORTANTE:", margin + 8, excY + 2.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  const notaEscritura = "Normalmente los gastos de escrituración, derechos e impuestos se descuentan directamente del monto del crédito otorgado por INFONAVIT al momento de la firma, por lo que no siempre requieren desembolso en efectivo.";
  doc.text(doc.splitTextToSize(notaEscritura, contentWidth - 42), margin + 37, excY + 2.5);

  y += 42;

  // LEYENDA LEGAL OBLIGATORIA (AMBER ALERT BOX)
  doc.setFillColor(AMBER_BG[0], AMBER_BG[1], AMBER_BG[2]);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, "F");
  doc.setDrawColor(AMBER_BORDER[0], AMBER_BORDER[1], AMBER_BORDER[2]);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(AMBER_TEXT[0], AMBER_TEXT[1], AMBER_TEXT[2]);
  doc.text("AVISO LEGAL OBLIGATORIO SOBRE TRÁMITES ANTE INFONAVIT", margin + 5, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const textoLegal = "Los trámites directos ante el INFONAVIT son personales y gratuitos. SAUCEDA Bienes Raíces cobra exclusivamente por los servicios profesionales de gestoría técnica, integración y cotejo de expediente documental, avalúo comercial certificado, obtención de constancias y acompañamiento legal integral durante todo el proceso.";
  doc.text(doc.splitTextToSize(textoLegal, contentWidth - 10), margin + 5, y + 9.5);

  y += 22;

  // POLÍTICA DE CANCELACIÓN
  doc.setFillColor(BLANCO[0], BLANCO[1], BLANCO[2]);
  doc.roundedRect(margin, y, contentWidth, 17, 2, 2, "F");
  doc.setDrawColor(BORDE[0], BORDE[1], BORDE[2]);
  doc.roundedRect(margin, y, contentWidth, 17, 2, 2, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(CARBON[0], CARBON[1], CARBON[2]);
  doc.text("POLÍTICA DE CANCELACIÓN Y REEMBOLSOS", margin + 5, y + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(CARBON_MUTED[0], CARBON_MUTED[1], CARBON_MUTED[2]);
  const textoCanc = "El anticipo cubre los costos directos ya generados (gestión técnica, avalúo y certificados oficiales con costo). En caso de cancelación por causas atribuibles a cualquiera de las partes, los reembolsos se determinarán según la etapa procesal alcanzada y los comprobantes devengados.";
  doc.text(doc.splitTextToSize(textoCanc, contentWidth - 10), margin + 5, y + 9);

  y += 21;

  // BOTÓN / ENLACE DE ACEPTACIÓN
  doc.setFillColor(VERDE_PROFUNDO[0], VERDE_PROFUNDO[1], VERDE_PROFUNDO[2]);
  doc.roundedRect(margin, y, contentWidth, 14, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(BLANCO[0], BLANCO[1], BLANCO[2]);
  doc.text("FIRMAR Y ACEPTAR ESTA PROPUESTA EN LÍNEA:", margin + 8, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(DORADO[0], DORADO[1], DORADO[2]);
  doc.text(portalUrl, margin + 8, y + 10.5);

  return doc;
}
