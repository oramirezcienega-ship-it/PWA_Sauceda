import { jsPDF } from "jspdf";
import type {
  EstadoResultadosReporte,
  BalanceGeneralReporte,
  FlujoEfectivoReporte
} from "@/app/actions/finanzas";

const VERDE_PROFUNDO: [number, number, number] = [45, 74, 43]; // #2D4A2B
const DORADO: [number, number, number] = [201, 169, 97]; // #C9A961
const CREMA: [number, number, number] = [245, 241, 232]; // #F5F1E8
const CARBON: [number, number, number] = [30, 41, 59]; // #1E293B
const CARBON_MUTED: [number, number, number] = [100, 116, 139]; // #64748B
const BORDE: [number, number, number] = [226, 232, 240]; // #E2E8F0

function formatMoneda(val: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(val || 0);
}

function agregarEncabezado(
  doc: jsPDF,
  titulo: string,
  subtitulo: string,
  unidad: string
) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Barra de cabecera verde profundo
  doc.setFillColor(...VERDE_PROFUNDO);
  doc.rect(0, 0, pageWidth, 28, "F");

  // Barra de acento dorado
  doc.setFillColor(...DORADO);
  doc.rect(0, 28, pageWidth, 2, "F");

  // Marca SAUCEDA
  doc.setTextColor(...CREMA);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("SAUCEDA", 14, 12);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DORADO);
  doc.text("BIENES RAÍCES & CONSTRUCCIÓN", 14, 17);

  // Título del reporte a la derecha
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(titulo.toUpperCase(), pageWidth - 14, 12, { align: "right" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...CREMA);
  doc.text(subtitulo, pageWidth - 14, 18, { align: "right" });

  if (unidad && unidad !== "Todas") {
    doc.setFontSize(8);
    doc.setTextColor(...DORADO);
    doc.text(`Unidad: ${unidad}`, pageWidth - 14, 23, { align: "right" });
  }

  doc.setTextColor(...CARBON);
}

function agregarPiePagina(doc: jsPDF, totalPaginas = 1) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setDrawColor(...BORDE);
  doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

  doc.setFontSize(7);
  doc.setTextColor(...CARBON_MUTED);
  doc.text(
    `CRM SAUCEDA · Documento Financiero Confidencial · Emitido el ${new Date().toLocaleDateString("es-MX")}`,
    14,
    pageHeight - 7
  );

  doc.text(`Página ${doc.getNumberOfPages()} de ${totalPaginas}`, pageWidth - 14, pageHeight - 7, {
    align: "right"
  });
}

// ============================================================
// 1. ESTADO DE RESULTADOS PDF
// ============================================================
export function exportarEstadoResultadosPdf(
  data: EstadoResultadosReporte,
  periodoStr: string,
  unidadStr = "Consolidado Todas"
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  agregarEncabezado(
    doc,
    "Estado de Resultados",
    `Periodo: ${periodoStr}`,
    unidadStr
  );

  let y = 38;

  // Cabecera de la tabla
  doc.setFillColor(...CREMA);
  doc.rect(14, y, pageWidth - 28, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...VERDE_PROFUNDO);

  doc.text("CONCEPTO CONTABLE", 18, y + 5.5);
  doc.text("% VERT.", pageWidth - 55, y + 5.5, { align: "right" });
  doc.text("MONTO TOTAL (MXN)", pageWidth - 18, y + 5.5, { align: "right" });

  y += 10;

  data.lineas.forEach((lin) => {
    if (y > 270) {
      doc.addPage();
      agregarEncabezado(doc, "Estado de Resultados", `Periodo: ${periodoStr}`, unidadStr);
      y = 36;
    }

    if (lin.esEncabezado) {
      y += 2;
      doc.setFillColor(241, 245, 249);
      doc.rect(14, y - 4, pageWidth - 28, 6.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...VERDE_PROFUNDO);
      doc.text(lin.concepto, 16, y);
      y += 5.5;
      return;
    }

    if (lin.esTotal) {
      doc.setFillColor(...CREMA);
      doc.rect(14, y - 4, pageWidth - 28, 6.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...VERDE_PROFUNDO);
      doc.text(lin.concepto, 18, y);
      doc.text(`${lin.porcentajeVertical.toFixed(1)}%`, pageWidth - 55, y, { align: "right" });
      doc.text(formatMoneda(lin.monto), pageWidth - 18, y, { align: "right" });
      y += 7.5;
      return;
    }

    // Fila estándar
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...CARBON);
    doc.text(lin.concepto, 22, y);

    doc.setTextColor(...CARBON_MUTED);
    doc.text(`${lin.porcentajeVertical.toFixed(1)}%`, pageWidth - 55, y, { align: "right" });

    doc.setTextColor(...CARBON);
    doc.setFont("courier", "normal"); // JetBrains / courier para números
    doc.text(formatMoneda(lin.monto), pageWidth - 18, y, { align: "right" });

    // Línea separadora sutil
    doc.setDrawColor(...BORDE);
    doc.line(18, y + 2, pageWidth - 18, y + 2);

    y += 5.5;
  });

  // Resumen al pie
  y += 4;
  if (y > 250) {
    doc.addPage();
    y = 36;
  }
  doc.setFillColor(...VERDE_PROFUNDO);
  doc.roundedRect(14, y, pageWidth - 28, 18, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...CREMA);
  doc.text("UTILIDAD NETA DEL PERIODO:", 20, y + 7);
  doc.text(formatMoneda(data.totales.utilidadNeta), pageWidth - 20, y + 7, { align: "right" });

  doc.setFontSize(8);
  doc.setTextColor(...DORADO);
  doc.text(`MARGEN NETO SOBRE INGRESOS: ${data.totales.margenNetoPct.toFixed(1)}%`, 20, y + 13);
  doc.text(`UTILIDAD BRUTA: ${formatMoneda(data.totales.utilidadBruta)} (${data.totales.margenBrutoPct.toFixed(1)}%)`, pageWidth - 20, y + 13, { align: "right" });

  agregarPiePagina(doc, doc.getNumberOfPages());
  doc.save(`Estado_Resultados_SAUCEDA_${new Date().toISOString().split("T")[0]}.pdf`);
}

// ============================================================
// 2. BALANCE GENERAL PDF
// ============================================================
export function exportarBalanceGeneralPdf(
  data: BalanceGeneralReporte,
  fechaCorteStr: string,
  unidadStr = "Consolidado Todas"
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  agregarEncabezado(
    doc,
    "Balance General",
    `Corte al: ${fechaCorteStr}`,
    unidadStr
  );

  let y = 36;

  // Banner de estado cuadrado
  if (data.estaCuadrado) {
    doc.setFillColor(236, 253, 245); // emerald-50
    doc.setDrawColor(52, 211, 153);
    doc.roundedRect(14, y, pageWidth - 28, 9, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(6, 95, 70);
    doc.text("BALANCE CUADRADO ✓  (Activo = Pasivo + Capital Contable al centavo)", 18, y + 6);
  } else {
    doc.setFillColor(254, 242, 242); // rose-50
    doc.setDrawColor(248, 113, 113);
    doc.roundedRect(14, y, pageWidth - 28, 9, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(153, 27, 27);
    doc.text(`DESCUADRE CONTABLE: Diferencia de ${formatMoneda(data.diferencia)} MXN`, 18, y + 6);
  }

  y += 14;

  const anchoCol = (pageWidth - 34) / 2;

  // COLUMNA IZQUIERDA: ACTIVO
  let yAct = y;
  doc.setFillColor(...CREMA);
  doc.rect(14, yAct, anchoCol, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...VERDE_PROFUNDO);
  doc.text("ACTIVO", 18, yAct + 5);
  doc.text(formatMoneda(data.activo.totalActivo), 14 + anchoCol - 4, yAct + 5, { align: "right" });
  yAct += 10;

  // Activo Circulante
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...CARBON);
  doc.text("Activo Circulante", 16, yAct);
  yAct += 5;

  data.activo.circulante.efectivoYBancos.cuentas.forEach((c) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...CARBON_MUTED);
    doc.text(`• ${c.nombre}`, 20, yAct);
    doc.setTextColor(...CARBON);
    doc.setFont("courier", "normal");
    doc.text(formatMoneda(c.saldo), 14 + anchoCol - 4, yAct, { align: "right" });
    yAct += 4.5;
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...CARBON_MUTED);
  doc.text("Cuentas por Cobrar a Clientes", 20, yAct);
  doc.setTextColor(...CARBON);
  doc.setFont("courier", "normal");
  doc.text(formatMoneda(data.activo.circulante.cuentasPorCobrar), 14 + anchoCol - 4, yAct, { align: "right" });
  yAct += 6;

  // Activo No Circulante
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...CARBON);
  doc.text("Activo No Circulante", 16, yAct);
  yAct += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...CARBON_MUTED);
  doc.text("Mobiliario, Equipo y Activo Fijo", 20, yAct);
  doc.setTextColor(...CARBON);
  doc.setFont("courier", "normal");
  doc.text(formatMoneda(data.activo.noCirculante.activoFijoNeto), 14 + anchoCol - 4, yAct, { align: "right" });
  yAct += 8;

  // COLUMNA DERECHA: PASIVO Y CAPITAL
  let yPas = y;
  const colDerX = 14 + anchoCol + 6;

  doc.setFillColor(...CREMA);
  doc.rect(colDerX, yPas, anchoCol, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...VERDE_PROFUNDO);
  doc.text("PASIVO", colDerX + 4, yPas + 5);
  doc.text(formatMoneda(data.pasivo.totalPasivo), colDerX + anchoCol - 4, yPas + 5, { align: "right" });
  yPas += 10;

  // Pasivo Corto Plazo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...CARBON);
  doc.text("Pasivo a Corto Plazo", colDerX + 2, yPas);
  yPas += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...CARBON_MUTED);
  doc.text("Cuentas por Pagar Proveedores", colDerX + 6, yPas);
  doc.setTextColor(...CARBON);
  doc.setFont("courier", "normal");
  doc.text(formatMoneda(data.pasivo.cortoPlazo.cuentasPorPagar), colDerX + anchoCol - 4, yPas, { align: "right" });
  yPas += 4.5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...CARBON_MUTED);
  doc.text("Tarjetas de Crédito Corporativas", colDerX + 6, yPas);
  doc.setTextColor(...CARBON);
  doc.setFont("courier", "normal");
  doc.text(formatMoneda(data.pasivo.cortoPlazo.tarjetasCredito), colDerX + anchoCol - 4, yPas, { align: "right" });
  yPas += 4.5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...CARBON_MUTED);
  doc.text("Impuestos por Pagar (ISR)", colDerX + 6, yPas);
  doc.setTextColor(...CARBON);
  doc.setFont("courier", "normal");
  doc.text(formatMoneda(data.pasivo.cortoPlazo.impuestosPorPagar), colDerX + anchoCol - 4, yPas, { align: "right" });
  yPas += 6;

  // Pasivo Largo Plazo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...CARBON);
  doc.text("Pasivo a Largo Plazo", colDerX + 2, yPas);
  yPas += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...CARBON_MUTED);
  doc.text("Préstamos por Pagar", colDerX + 6, yPas);
  doc.setTextColor(...CARBON);
  doc.setFont("courier", "normal");
  doc.text(formatMoneda(data.pasivo.largoPlazo.prestamos), colDerX + anchoCol - 4, yPas, { align: "right" });
  yPas += 8;

  // CAPITAL CONTABLE
  doc.setFillColor(...CREMA);
  doc.rect(colDerX, yPas, anchoCol, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...VERDE_PROFUNDO);
  doc.text("CAPITAL CONTABLE", colDerX + 4, yPas + 5);
  doc.text(formatMoneda(data.capital.totalCapital), colDerX + anchoCol - 4, yPas + 5, { align: "right" });
  yPas += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...CARBON_MUTED);
  doc.text("Aportaciones de Socios / Dueño", colDerX + 6, yPas);
  doc.setTextColor(...CARBON);
  doc.setFont("courier", "normal");
  doc.text(formatMoneda(data.capital.aportaciones), colDerX + anchoCol - 4, yPas, { align: "right" });
  yPas += 4.5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...CARBON_MUTED);
  doc.text("Retiros de Socios / Dueño (-)", colDerX + 6, yPas);
  doc.setTextColor(...CARBON);
  doc.setFont("courier", "normal");
  doc.text(`-${formatMoneda(data.capital.retiros)}`, colDerX + anchoCol - 4, yPas, { align: "right" });
  yPas += 4.5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...CARBON_MUTED);
  doc.text("Utilidades de Ejercicios Anteriores", colDerX + 6, yPas);
  doc.setTextColor(...CARBON);
  doc.setFont("courier", "normal");
  doc.text(formatMoneda(data.capital.utilidadesAnteriores), colDerX + anchoCol - 4, yPas, { align: "right" });
  yPas += 4.5;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...VERDE_PROFUNDO);
  doc.text("Utilidad del Ejercicio Actual", colDerX + 6, yPas);
  doc.setFont("courier", "bold");
  doc.text(formatMoneda(data.capital.utilidadEjercicio), colDerX + anchoCol - 4, yPas, { align: "right" });
  yPas += 8;

  // TOTALES FINALES
  const yFinal = Math.max(yAct, yPas) + 6;

  doc.setFillColor(...VERDE_PROFUNDO);
  doc.rect(14, yFinal, anchoCol, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...CREMA);
  doc.text("TOTAL ACTIVO:", 18, yFinal + 6.5);
  doc.text(formatMoneda(data.activo.totalActivo), 14 + anchoCol - 4, yFinal + 6.5, { align: "right" });

  doc.setFillColor(...VERDE_PROFUNDO);
  doc.rect(colDerX, yFinal, anchoCol, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...CREMA);
  doc.text("TOTAL PASIVO + CAPITAL:", colDerX + 4, yFinal + 6.5);
  doc.text(formatMoneda(data.totalPasivoYCapital), colDerX + anchoCol - 4, yFinal + 6.5, { align: "right" });

  agregarPiePagina(doc, doc.getNumberOfPages());
  doc.save(`Balance_General_SAUCEDA_${fechaCorteStr}.pdf`);
}

// ============================================================
// 3. FLUJO DE EFECTIVO PDF
// ============================================================
export function exportarFlujoEfectivoPdf(
  data: FlujoEfectivoReporte,
  periodoStr: string,
  unidadStr = "Consolidado Todas"
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  agregarEncabezado(
    doc,
    "Flujo de Efectivo",
    `Base Caja · Periodo: ${periodoStr}`,
    unidadStr
  );

  let y = 38;

  // Saldo Inicial
  doc.setFillColor(...CREMA);
  doc.roundedRect(14, y, pageWidth - 28, 9, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...VERDE_PROFUNDO);
  doc.text("SALDO INICIAL DE EFECTIVO Y BANCOS:", 18, y + 6);
  doc.text(formatMoneda(data.saldoInicial), pageWidth - 18, y + 6, { align: "right" });

  y += 15;

  const agregarSeccion = (
    titulo: string,
    subtotal: number,
    filas: Array<{ concepto: string; monto: number }>
  ) => {
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, pageWidth - 28, 6.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...VERDE_PROFUNDO);
    doc.text(titulo, 18, y + 4.5);
    doc.text(formatMoneda(subtotal), pageWidth - 18, y + 4.5, { align: "right" });
    y += 9;

    filas.forEach((f) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...CARBON);
      doc.text(f.concepto, 22, y);

      doc.setFont("courier", "normal");
      doc.text(formatMoneda(f.monto), pageWidth - 18, y, { align: "right" });
      y += 5;
    });

    y += 3;
  };

  // 1. Operación
  agregarSeccion("1. ACTIVIDADES DE OPERACIÓN", data.operacion.flujoNetoOperacion, [
    { concepto: "Cobros a clientes (ventas y comisiones)", monto: data.operacion.cobrosClientes },
    { concepto: "Pagos de costos directos de obra y gestoría (-)", monto: -data.operacion.pagosProveedoresCostos },
    { concepto: "Pagos de marketing y publicidad (-)", monto: -data.operacion.pagosMarketing },
    { concepto: "Pagos de nómina y asesores (-)", monto: -data.operacion.pagosNomina },
    { concepto: "Pagos de renta y servicios (-)", monto: -data.operacion.pagosRentaServicios },
    { concepto: "Pagos de impuestos (-)", monto: -data.operacion.pagosImpuestos }
  ]);

  // 2. Inversión
  agregarSeccion("2. ACTIVIDADES DE INVERSIÓN", data.inversion.flujoNetoInversion, [
    { concepto: "Compra de mobiliario, equipo y activo fijo (-)", monto: -data.inversion.compraEquipoActivo }
  ]);

  // 3. Financiamiento
  agregarSeccion("3. ACTIVIDADES DE FINANCIAMIENTO", data.financiamiento.flujoNetoFinanciamiento, [
    { concepto: "Aportaciones de capital recibidas", monto: data.financiamiento.aportacionesCapital },
    { concepto: "Retiros de socios / dueño (-)", monto: -data.financiamiento.retirosDueno },
    { concepto: "Préstamos bancarios y de terceros recibidos", monto: data.financiamiento.prestamosRecibidos },
    { concepto: "Pagos de capital a préstamos (-)", monto: -data.financiamiento.pagosPrestamos }
  ]);

  // Saldo Final
  y += 2;
  doc.setFillColor(...VERDE_PROFUNDO);
  doc.roundedRect(14, y, pageWidth - 28, 14, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...CREMA);
  doc.text("VARIACIÓN NETA DE EFECTIVO:", 18, y + 6);
  doc.text(formatMoneda(data.flujoNetoTotal), pageWidth - 18, y + 6, { align: "right" });

  doc.setFontSize(10.5);
  doc.setTextColor(...DORADO);
  doc.text("SALDO FINAL DISPONIBLE EN CAJA Y BANCOS:", 18, y + 11);
  doc.text(formatMoneda(data.saldoFinal), pageWidth - 18, y + 11, { align: "right" });

  agregarPiePagina(doc, doc.getNumberOfPages());
  doc.save(`Flujo_Efectivo_SAUCEDA_${new Date().toISOString().split("T")[0]}.pdf`);
}

// ============================================================
// 4. EXPORTADOR A EXCEL / CSV CON FORMATO
// ============================================================
export function exportarAExcelCSV(
  nombreArchivo: string,
  encabezados: string[],
  filas: Array<Array<string | number>>
): void {
  // UTF-8 BOM para que Excel respete acentos en español
  const BOM = "\uFEFF";
  const lineas = [
    encabezados.map(e => `"${e.replace(/"/g, '""')}"`).join(","),
    ...filas.map(f =>
      f.map(val => `"${String(val ?? "").replace(/"/g, '""')}"`).join(",")
    )
  ];

  const blob = new Blob([BOM + lineas.join("\r\n")], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombreArchivo}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
