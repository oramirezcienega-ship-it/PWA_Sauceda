import { jsPDF } from "jspdf";

/**
 * PDFs de los documentos de una orden de trabajo (póliza de garantía y recibos de pago)
 * generados en servidor, para enviarlos por Telegram listos para imprimir.
 */

const VERDE_PROFUNDO: [number, number, number] = [45, 74, 43];
const SAUCE: [number, number, number] = [92, 122, 82];
const DORADO: [number, number, number] = [201, 169, 97];
const CARBON: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const BORDE: [number, number, number] = [226, 232, 240];

const MARGEN = 14;

const pesos = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(n || 0);

const fecha = (f?: string | null) => {
  if (!f) return "—";
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
};

function encabezado(doc: jsPDF, titulo: string, referencia: string): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...VERDE_PROFUNDO);
  doc.rect(0, 0, w, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("SAUCEDA", MARGEN, 12);
  doc.setFontSize(7.5);
  doc.setTextColor(...DORADO);
  doc.text("SOLUCIONES INMOBILIARIAS & CONSTRUCCIÓN", MARGEN, 17.5);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(titulo.toUpperCase(), w - MARGEN, 11, { align: "right" });
  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DORADO);
  doc.text(referencia, w - MARGEN, 17.5, { align: "right" });
  return 32;
}

function pie(doc: jsPDF, texto: string) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...BORDE);
  doc.line(MARGEN, h - 14, w - MARGEN, h - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(texto, w / 2, h - 9, { align: "center" });
}

/** Pares etiqueta/valor en dos columnas dentro de una caja; devuelve la Y final. */
function cajaDatos(doc: jsPDF, y: number, datos: Array<[string, string]>): number {
  const w = doc.internal.pageSize.getWidth();
  const ancho = w - MARGEN * 2;
  const colW = ancho / 2;
  const filas = Math.ceil(datos.length / 2);
  const alto = filas * 12 + 6;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...BORDE);
  doc.roundedRect(MARGEN, y, ancho, alto, 2, 2, "FD");
  datos.forEach(([etq, val], i) => {
    const x = MARGEN + 5 + (i % 2) * colW;
    const yy = y + 8 + Math.floor(i / 2) * 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(etq.toUpperCase(), x, yy - 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...CARBON);
    const lineas = doc.splitTextToSize(val || "—", colW - 10) as string[];
    doc.text(lineas[0] ?? "—", x, yy + 2.5);
  });
  return y + alto + 6;
}

function firmas(doc: jsPDF, y: number, izq: [string, string], der: [string, string]): void {
  const w = doc.internal.pageSize.getWidth();
  const mitad = (w - MARGEN * 2) / 2;
  [izq, der].forEach(([nombre, rol], i) => {
    const x0 = MARGEN + i * mitad + 8;
    const x1 = MARGEN + (i + 1) * mitad - 8;
    doc.setDrawColor(...CARBON);
    doc.line(x0, y, x1, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...CARBON);
    doc.text(nombre, (x0 + x1) / 2, y + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(rol, (x0 + x1) / 2, y + 9, { align: "center" });
  });
}

/** Póliza de garantía: el texto se ajusta para que todo quede en UNA hoja carta. */
export function generarPdfPolizaGarantia(d: {
  titulo: string;
  contenido: string;
  clienteNombre: string;
  folioOT: string;
  anosGarantia: number;
  fechaInicio?: string | null;
  fechaVencimiento?: string | null;
  responsable: string;
  token?: string | null;
}): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  let y = encabezado(doc, d.titulo || "Póliza de garantía", d.folioOT);
  y = cajaDatos(doc, y, [
    ["Cliente beneficiario", d.clienteNombre],
    ["Vigencia", `${d.anosGarantia} años de cobertura`],
    ["Fecha de inicio", d.fechaInicio ? fecha(d.fechaInicio) : "Fecha de entrega"],
    ["Vencimiento de póliza", d.fechaVencimiento ? fecha(d.fechaVencimiento) : "Calculada a partir de la entrega"],
  ]);

  const espacioFirmas = 34;
  const maxY = h - 14 - espacioFirmas;
  const anchoTexto = w - MARGEN * 2;
  doc.setFont("courier", "normal");
  doc.setTextColor(...CARBON);

  // Reduce la letra hasta que el texto quepa en la hoja (mínimo 6 pt)
  let fs = 10;
  let lineas: string[] = [];
  let paso = 4.2;
  for (; fs >= 6; fs -= 0.25) {
    doc.setFontSize(fs);
    lineas = doc.splitTextToSize(d.contenido || "", anchoTexto) as string[];
    paso = fs * 0.4;
    if (y + lineas.length * paso <= maxY) break;
  }
  doc.setFontSize(fs);
  lineas.forEach((l, i) => doc.text(l, MARGEN, y + i * paso));
  const yFirmas = Math.min(maxY + 12, y + lineas.length * paso + 14);

  firmas(doc, yFirmas, [d.responsable || "Sauceda Construye", "Asesor que entrega la instalación"], [d.clienteNombre, "Cliente titular · Recepción a entera satisfacción"]);
  pie(doc, `${d.token ? `Token de verificación: ${d.token} · ` : ""}Póliza digital emitida por Sauceda Soluciones Inmobiliarias y Construcción.`);
  return doc;
}

export function generarPdfRecibo(r: {
  folio: string;
  fechaPago: string;
  clienteNombre: string;
  monto: number;
  montoLetra?: string | null;
  metodoPago: string;
  referenciaPago?: string | null;
  concepto: string;
  saldoAnterior: number;
  saldoRestante: number;
  recibidoPorNombre?: string | null;
  folioOT: string;
  notas?: string | null;
}): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const w = doc.internal.pageSize.getWidth();

  let y = encabezado(doc, "Recibo oficial de pago", r.folio);
  y = cajaDatos(doc, y, [
    ["Cliente", r.clienteNombre],
    ["Fecha de pago", fecha(r.fechaPago)],
    ["Orden de trabajo", r.folioOT],
    ["Método de pago", (r.metodoPago || "").replace(/_/g, " ")],
    ["Referencia", r.referenciaPago || "—"],
    ["Recibido por", r.recibidoPorNombre || "—"],
  ]);

  // Monto destacado
  doc.setFillColor(...VERDE_PROFUNDO);
  doc.roundedRect(MARGEN, y, w - MARGEN * 2, 24, 2, 2, "F");
  doc.setTextColor(...DORADO);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("MONTO RECIBIDO", MARGEN + 6, y + 8);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(pesos(r.monto), MARGEN + 6, y + 18);
  if (r.montoLetra) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(226, 232, 240);
    const l = doc.splitTextToSize(r.montoLetra, 92) as string[];
    doc.text(l.slice(0, 2), w - MARGEN - 6, y + 10, { align: "right" });
  }
  y += 32;

  doc.setTextColor(...SAUCE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CONCEPTO", MARGEN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...CARBON);
  const conc = doc.splitTextToSize(r.concepto || "Pago", w - MARGEN * 2) as string[];
  doc.text(conc, MARGEN, y + 6);
  y += 6 + conc.length * 5 + 6;

  y = cajaDatos(doc, y, [
    ["Saldo anterior", pesos(r.saldoAnterior)],
    ["Saldo restante", pesos(r.saldoRestante)],
  ]);

  if (r.notas) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(`Notas: ${r.notas}`, w - MARGEN * 2) as string[], MARGEN, y);
  }

  firmas(doc, y + 50, [r.recibidoPorNombre || "Sauceda Construye", "Recibió el pago"], [r.clienteNombre, "Cliente"]);
  pie(doc, "Recibo digital emitido por Sauceda Soluciones Inmobiliarias y Construcción.");
  return doc;
}
