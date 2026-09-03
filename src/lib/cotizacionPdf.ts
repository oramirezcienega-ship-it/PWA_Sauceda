import { jsPDF } from "jspdf";
import { formatoPesos } from "@/lib/formato";
import type { Cotizacion, CotizacionConcepto } from "@/lib/types";

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
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // Paleta de colores
  const verdeProfundo = [45, 74, 43]; // #2D4A2B
  const verdeSauce = [92, 122, 82]; // #5C7A52
  const dorado = [201, 169, 97]; // #C9A961
  const cremaFondo = [245, 241, 232]; // #F5F1E8
  const carbon = [30, 41, 59]; // slate-800
  const textoGris = [100, 116, 139]; // slate-500
  const bordeGris = [226, 232, 240]; // slate-200

  // 1. BANNER SUPERIOR
  doc.setFillColor(verdeProfundo[0], verdeProfundo[1], verdeProfundo[2]);
  doc.rect(0, 0, pageWidth, 28, "F");

  // Acento dorado inferior en el banner
  doc.setFillColor(dorado[0], dorado[1], dorado[2]);
  doc.rect(0, 27, pageWidth, 1.5, "F");

  // Logo / Marca
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("SAUCEDA", margin, 13);

  doc.setTextColor(dorado[0], dorado[1], dorado[2]);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("CONSTRUCCIÓN & SERVICIOS INTEGRALES", margin, 19);

  // Folio y Documento (A la derecha del banner)
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`COTIZACIÓN ${cotizacion.id}`, pageWidth - margin, 13, { align: "right" });

  doc.setTextColor(245, 241, 232);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const fechaDoc = cotizacion.createdAt
    ? new Date(cotizacion.createdAt).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("es-MX");
  doc.text(`Fecha de emisión: ${fechaDoc}`, pageWidth - margin, 19, { align: "right" });

  let y = 36;

  // 2. TARJETA DE DATOS DEL CLIENTE Y SERVICIO
  doc.setFillColor(cremaFondo[0], cremaFondo[1], cremaFondo[2]);
  doc.roundedRect(margin, y, contentWidth, 32, 2, 2, "F");
  doc.setDrawColor(bordeGris[0], bordeGris[1], bordeGris[2]);
  doc.roundedRect(margin, y, contentWidth, 32, 2, 2, "D");

  // Columna Izquierda: Cliente
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(verdeSauce[0], verdeSauce[1], verdeSauce[2]);
  doc.text("DATOS DEL CLIENTE", margin + 5, y + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(carbon[0], carbon[1], carbon[2]);
  doc.text(cotizacion.prospectoNombre || "Cliente General", margin + 5, y + 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(textoGris[0], textoGris[1], textoGris[2]);
  if (cotizacion.prospectoTelefono) {
    doc.text(`Tel: ${cotizacion.prospectoTelefono}`, margin + 5, y + 18);
  }
  if (cotizacion.prospectoCorreo) {
    doc.text(`Correo: ${cotizacion.prospectoCorreo}`, margin + 5, y + 23);
  }

  // Columna Derecha: Servicio & Proyecto
  const colDerX = margin + contentWidth / 2 + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(verdeSauce[0], verdeSauce[1], verdeSauce[2]);
  doc.text("DETALLES DEL PROYECTO", colDerX, y + 6);

  const servicioLabels: Record<string, string> = {
    impermeabilizacion: "Impermeabilización de Azotea",
    pintura: "Pintura & Acabados",
    losa: "Construcción de Losa",
    remodelacion: "Remodelación Integral",
  };
  const servicioNombre = servicioLabels[cotizacion.servicioTipo] || cotizacion.servicioTipo || "Servicio General";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(carbon[0], carbon[1], carbon[2]);
  doc.text(servicioNombre, colDerX, y + 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(textoGris[0], textoGris[1], textoGris[2]);
  doc.text(`Estatus: ${cotizacion.estatus?.toUpperCase() || "AUTORIZADA"}`, colDerX, y + 18);
  doc.text(`Portal en línea: ${baseUrl}/cotizacion/${cotizacion.token}`, colDerX, y + 23);

  y += 38;

  // 3. TABLA DE CONCEPTOS
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(verdeProfundo[0], verdeProfundo[1], verdeProfundo[2]);
  doc.text("DESGLOSE DE CONCEPTOS Y PRESUPUESTO", margin, y);
  y += 4;

  // Encabezado de tabla
  const headerHeight = 7;
  doc.setFillColor(verdeProfundo[0], verdeProfundo[1], verdeProfundo[2]);
  doc.rect(margin, y, contentWidth, headerHeight, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);

  const colX = {
    num: margin + 3,
    desc: margin + 12,
    cant: margin + 105,
    unit: margin + 122,
    precio: margin + 145,
    importe: margin + contentWidth - 3,
  };

  doc.text("#", colX.num, y + 4.8);
  doc.text("Descripción del Concepto / Partida", colX.desc, y + 4.8);
  doc.text("Cant.", colX.cant, y + 4.8, { align: "center" });
  doc.text("Unidad", colX.unit, y + 4.8, { align: "center" });
  doc.text("P. Unitario", colX.precio, y + 4.8, { align: "right" });
  doc.text("Importe", colX.importe, y + 4.8, { align: "right" });

  y += headerHeight;

  // Filas de conceptos
  doc.setFontSize(7.5);
  conceptos.forEach((c, index) => {
    // Si se acerca al final de página, crear nueva página
    if (y > pageHeight - 45) {
      doc.addPage();
      y = 20;
    }

    const esPar = index % 2 === 0;
    if (esPar) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y, contentWidth, 7, "F");
    }

    doc.setDrawColor(bordeGris[0], bordeGris[1], bordeGris[2]);
    doc.line(margin, y + 7, margin + contentWidth, y + 7);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(carbon[0], carbon[1], carbon[2]);

    doc.text(String(index + 1), colX.num, y + 4.8);

    // Truncar descripción si es muy larga
    const desc = doc.splitTextToSize(c.descripcion, 90)[0] || c.descripcion;
    doc.text(desc, colX.desc, y + 4.8);

    doc.text(String(c.cantidad), colX.cant, y + 4.8, { align: "center" });
    doc.text(c.unidad || "pza", colX.unit, y + 4.8, { align: "center" });
    doc.text(formatoPesos(c.precioUnitario || 0), colX.precio, y + 4.8, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setTextColor(verdeProfundo[0], verdeProfundo[1], verdeProfundo[2]);
    doc.text(formatoPesos(c.importe || 0), colX.importe, y + 4.8, { align: "right" });

    y += 7;
  });

  y += 4;

  // 4. RESUMEN DE TOTALES
  const totalBoxWidth = 70;
  const totalBoxX = margin + contentWidth - totalBoxWidth;
  const montoTotal = cotizacion.precioFinal || cotizacion.costoEstimado || 0;

  doc.setFillColor(cremaFondo[0], cremaFondo[1], cremaFondo[2]);
  doc.roundedRect(totalBoxX, y, totalBoxWidth, 20, 2, 2, "F");
  doc.setDrawColor(dorado[0], dorado[1], dorado[2]);
  doc.roundedRect(totalBoxX, y, totalBoxWidth, 20, 2, 2, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(textoGris[0], textoGris[1], textoGris[2]);
  doc.text("TOTAL DE PROPUESTA:", totalBoxX + 5, y + 7);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(verdeProfundo[0], verdeProfundo[1], verdeProfundo[2]);
  doc.text(formatoPesos(montoTotal), totalBoxX + totalBoxWidth - 5, y + 8, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(textoGris[0], textoGris[1], textoGris[2]);
  doc.text("Precios expresados en Moneda Nacional (MXN). Incluye IVA y mano de obra garantizada.", totalBoxX + 5, y + 15);

  y += 26;

  // 5. CONDICIONES Y GARANTÍA
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, "F");
  doc.setDrawColor(bordeGris[0], bordeGris[1], bordeGris[2]);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(verdeSauce[0], verdeSauce[1], verdeSauce[2]);
  doc.text("CONDICIONES COMERCIALES & GARANTÍA SAUCEDA", margin + 4, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(textoGris[0], textoGris[1], textoGris[2]);
  doc.text("• Validez de la cotización: 15 días naturales a partir de la fecha de emisión.", margin + 4, y + 10);
  doc.text("• Autorización en línea: Puedes revisar a detalle, firmar y aprobar tu proyecto desde el portal del cliente.", margin + 4, y + 14);
  doc.text("• Garantía por escrito: Aplicable tras la entrega y liquidación del servicio, respaldada por SAUCEDA.", margin + 4, y + 18);

  // 6. PIE DE PÁGINA
  const footerY = pageHeight - 14;
  doc.setFillColor(verdeProfundo[0], verdeProfundo[1], verdeProfundo[2]);
  doc.rect(0, footerY, pageWidth, 14, "F");

  doc.setTextColor(245, 241, 232);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("SAUCEDA BIENES RAÍCES & CONSTRUCCIÓN · Tradición con tecnología", margin, footerY + 8);

  doc.setTextColor(dorado[0], dorado[1], dorado[2]);
  doc.setFont("helvetica", "bold");
  doc.text("WhatsApp: 477 465 4700  ·  crm.saucedamx.com", pageWidth - margin, footerY + 8, { align: "right" });

  return doc;
}
