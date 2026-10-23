import { jsPDF } from "jspdf";
import { dibujarLogoPdf } from "@/lib/marca-pdf";
import { formatoPesos } from "@/lib/formato";
import type { MesReporte, ReporteVentasProveedor } from "@/lib/reporte-ventas-proveedor";

/**
 * PDF del reporte de ventas que se le manda al proveedor: KPIs del periodo, resumen en texto,
 * gráficas de venta y trabajos por mes, venta por producto y el detalle de cada operación.
 * Carta vertical, mismo estilo que la ficha de servicios.
 */

type RGB = [number, number, number];
const VERDE: RGB = [45, 74, 43];
const SAUCE: RGB = [92, 122, 82];
const SAUCE_CLARO: RGB = [168, 190, 158];
const FONDO_TITULO: RGB = [236, 242, 233];
const FONDO_SUAVE: RGB = [247, 248, 246];
const CARBON: RGB = [35, 35, 35];
const GRIS: RGB = [115, 115, 115];
const GRIS_CLARO: RGB = [170, 170, 170];
const LINEA: RGB = [222, 226, 220];
const DORADO: RGB = [176, 132, 40];

const MARGEN = 16;
const INTERLINEA = 0.42; // mm por punto de fuente

function fecha(dia: string, mes: "short" | "long" = "short"): string {
  return new Date(`${dia.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: mes, year: "numeric" });
}

const numero = (n: number, dec = 1) => n.toLocaleString("es-MX", { maximumFractionDigits: dec });
const unidadBonita = (u: string) => (u === "m2" ? "m²" : u);

/** Monto corto para etiquetas de gráfica: $1.2M, $45k, $900. */
function pesosCorto(n: number): string {
  if (n >= 1_000_000) return `$${numero(n / 1_000_000, 1)}M`;
  if (n >= 10_000) return `$${Math.round(n / 1000)}k`;
  if (n >= 1000) return `$${numero(n / 1000, 1)}k`;
  return `$${Math.round(n)}`;
}

export function generarReporteVentasProveedorPdf(proveedorNombre: string, r: ReporteVentasProveedor): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const util = ancho - MARGEN * 2;
  const limite = alto - 16;
  const periodo = `${fecha(r.desde)} al ${fecha(r.hasta)}`;
  let y = 0;

  const fuente = (tam: number, estilo: "normal" | "bold" = "normal", color: RGB = CARBON) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tam);
    doc.setTextColor(...color);
  };
  const lineas = (texto: string, w: number, tam: number) => {
    doc.setFontSize(tam);
    return doc.splitTextToSize(texto, w) as string[];
  };
  const nuevaPagina = () => {
    doc.addPage();
    fuente(8.5, "bold", SAUCE);
    doc.text(`Reporte de ventas · ${proveedorNombre} · ${periodo}`, MARGEN, 11);
    doc.setDrawColor(...LINEA);
    doc.line(MARGEN, 13, MARGEN + util, 13);
    y = 20;
  };
  const asegurar = (h: number) => {
    if (y + h > limite) nuevaPagina();
  };
  const tituloSeccion = (texto: string, nota?: string) => {
    fuente(11, "bold", VERDE);
    doc.text(texto, MARGEN, y);
    if (nota) {
      const w = doc.getTextWidth(texto);
      fuente(8.5, "normal", GRIS);
      doc.text(nota, MARGEN + w + 3, y);
    }
    y += 5;
  };

  // ---------- Encabezado ----------
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, ancho, 36, "F");
  dibujarLogoPdf(doc, MARGEN, 10, 9, "negativo");
  fuente(9, "normal", [210, 225, 205]);
  doc.text("REPORTE DE VENTAS A SAUCEDA", ancho - MARGEN, 11, { align: "right" });
  fuente(17, "bold", [255, 255, 255]);
  doc.text(lineas(proveedorNombre, util - 70, 17)[0], ancho - MARGEN, 20, { align: "right" });
  fuente(9.5, "normal", [225, 235, 222]);
  doc.text(`Periodo: ${periodo}`, ancho - MARGEN, 28, { align: "right" });
  y = 45;

  // ---------- KPIs ----------
  const unidad = r.productos.length > 0 ? unidadBonita(r.productos[0].unidad) : "m²";
  const variacion =
    r.anterior.monto > 0 ? Math.round(((r.monto - r.anterior.monto) / r.anterior.monto) * 100) : null;
  const kpis: [string, string, string][] = [
    ["VENTAS DEL PERIODO", formatoPesos(r.monto), variacion === null ? "Total facturado y remisionado" : `${variacion > 0 ? "+" : ""}${variacion}% vs periodo anterior`],
    ["TRABAJOS REALIZADOS", String(r.operaciones), r.anterior.operaciones > 0 ? `${r.anterior.operaciones} en el periodo anterior` : "Remisiones y facturas"],
    [`${unidad.toUpperCase()} TRABAJADOS`, r.cantidad > 0 ? numero(r.cantidad) : "—", r.costoPromedio > 0 ? `Promedio ${formatoPesos(r.costoPromedio)}/${unidad}` : "Superficie total"],
    ["TICKET PROMEDIO", r.ticketPromedio > 0 ? formatoPesos(r.ticketPromedio) : "—", `${r.productos.length} ${r.productos.length === 1 ? "producto" : "productos"} distintos`],
  ];
  const gap = 4;
  const wKpi = (util - gap * 3) / 4;
  kpis.forEach(([titulo, valor, nota], i) => {
    const x = MARGEN + i * (wKpi + gap);
    doc.setDrawColor(...LINEA);
    doc.setFillColor(...FONDO_SUAVE);
    doc.roundedRect(x, y, wKpi, 22, 2, 2, "FD");
    fuente(6.8, "bold", GRIS);
    doc.text(titulo, x + 3.5, y + 5.5);
    fuente(14, "bold", i === 0 ? VERDE : CARBON);
    doc.text(valor, x + 3.5, y + 13);
    const negativa = i === 0 && variacion !== null && variacion < 0;
    fuente(7, "normal", negativa ? [170, 60, 50] : GRIS);
    doc.text(lineas(nota, wKpi - 6, 7)[0], x + 3.5, y + 18.5);
  });
  y += 30;

  // ---------- Resumen ----------
  const textos = r.resumen.map((f) => lineas(f, util - 14, 9.5));
  const altoResumen = 10 + textos.reduce((s, l) => s + l.length * 9.5 * INTERLINEA + 1.6, 0);
  doc.setFillColor(...FONDO_TITULO);
  doc.roundedRect(MARGEN, y, util, altoResumen, 2, 2, "F");
  fuente(8, "bold", SAUCE);
  doc.text("RESUMEN DEL PERIODO", MARGEN + 4, y + 6);
  let yr = y + 11;
  for (const l of textos) {
    doc.setFillColor(...SAUCE);
    doc.circle(MARGEN + 5.5, yr - 1.1, 0.8, "F");
    fuente(9.5, "normal", CARBON);
    doc.text(l, MARGEN + 9, yr);
    yr += l.length * 9.5 * INTERLINEA + 1.6;
  }
  y += altoResumen + 9;

  // ---------- Gráficas por mes ----------
  const graficaMeses = (titulo: string, nota: string, valor: (m: MesReporte) => number, etiqueta: (n: number) => string, color: RGB) => {
    const altoGrafica = 46;
    asegurar(altoGrafica + 18);
    tituloSeccion(titulo, nota);
    const meses = r.meses;
    const max = Math.max(...meses.map(valor), 0);
    const xEje = MARGEN + 2;
    const wArea = util - 4;
    const yBase = y + altoGrafica;
    // Líneas guía
    doc.setDrawColor(...LINEA);
    doc.setLineWidth(0.2);
    for (let i = 0; i <= 3; i++) doc.line(xEje, yBase - (altoGrafica - 6) * (i / 3), xEje + wArea, yBase - (altoGrafica - 6) * (i / 3));
    const paso = wArea / Math.max(meses.length, 1);
    const wBarra = Math.min(16, paso * 0.62);
    const cadaCuanto = Math.ceil(meses.length / 14); // etiquetas de mes que caben
    meses.forEach((m, i) => {
      const v = valor(m);
      const cx = xEje + paso * i + paso / 2;
      const h = max > 0 ? (v / max) * (altoGrafica - 8) : 0;
      if (h > 0) {
        doc.setFillColor(...color);
        doc.roundedRect(cx - wBarra / 2, yBase - h, wBarra, h, 0.8, 0.8, "F");
        doc.rect(cx - wBarra / 2, yBase - Math.min(h, 1), wBarra, Math.min(h, 1), "F");
      }
      if (v > 0 && meses.length <= 18) {
        fuente(meses.length > 10 ? 6.3 : 7.2, "bold", CARBON);
        doc.text(etiqueta(v), cx, yBase - h - 1.5, { align: "center" });
      }
      if (i % cadaCuanto === 0) {
        fuente(meses.length > 10 ? 6.3 : 7.5, "normal", GRIS);
        doc.text(m.etiqueta, cx, yBase + 4, { align: "center" });
      }
    });
    doc.setDrawColor(...GRIS_CLARO);
    doc.line(xEje, yBase, xEje + wArea, yBase);
    y = yBase + 13;
  };

  graficaMeses("Ventas por mes", "monto en pesos", (m) => m.monto, pesosCorto, SAUCE);
  graficaMeses("Trabajos por mes", "número de remisiones y facturas", (m) => m.operaciones, (n) => String(n), SAUCE_CLARO);

  // ---------- Ventas por producto ----------
  if (r.productos.length > 0) {
    const filaH = 9;
    asegurar(14 + Math.min(r.productos.length, 4) * filaH);
    tituloSeccion("Ventas por producto", "participación sobre el total del periodo");
    const max = r.productos[0].monto || 1;
    const wNombre = util * 0.42;
    const xBarra = MARGEN + wNombre + 4;
    const wBarraMax = util - wNombre - 4 - 34;
    for (const p of r.productos) {
      asegurar(filaH + 1);
      const nombre = lineas(p.nombre, wNombre - 6, 8.5);
      fuente(8.5, "bold", CARBON);
      doc.text(nombre[0] + (nombre.length > 1 ? "…" : ""), MARGEN, y + 3);
      fuente(7.2, "normal", GRIS);
      doc.text(`${p.operaciones} ${p.operaciones === 1 ? "trabajo" : "trabajos"} · ${numero(p.cantidad)} ${unidadBonita(p.unidad)}`, MARGEN, y + 6.8);
      doc.setFillColor(...FONDO_SUAVE);
      doc.roundedRect(xBarra, y + 1, wBarraMax, 4.6, 1, 1, "F");
      doc.setFillColor(...(p === r.productos[0] ? VERDE : SAUCE));
      doc.roundedRect(xBarra, y + 1, Math.max(1.5, (p.monto / max) * wBarraMax), 4.6, 1, 1, "F");
      fuente(8.5, "bold", VERDE);
      doc.text(formatoPesos(p.monto), MARGEN + util, y + 3.6, { align: "right" });
      fuente(7.2, "normal", GRIS);
      doc.text(`${numero(p.porcentaje)}%`, MARGEN + util, y + 7.2, { align: "right" });
      y += filaH;
    }
    y += 7;
  }

  // ---------- Detalle de operaciones ----------
  const cols = [
    { t: "FECHA", w: 20, a: "left" as const },
    { t: "FOLIO", w: 34, a: "left" as const },
    { t: "PRODUCTO / ORDEN", w: util - 20 - 34 - 22 - 24 - 26, a: "left" as const },
    { t: "CANTIDAD", w: 22, a: "right" as const },
    { t: "COSTO UNIT.", w: 24, a: "right" as const },
    { t: "TOTAL", w: 26, a: "right" as const },
  ];
  const encabezadoTabla = () => {
    doc.setFillColor(...VERDE);
    doc.rect(MARGEN, y, util, 7, "F");
    fuente(7, "bold", [255, 255, 255]);
    let x = MARGEN;
    for (const c of cols) {
      doc.text(c.t, c.a === "right" ? x + c.w - 2 : x + 2, y + 4.7, { align: c.a });
      x += c.w;
    }
    y += 7;
  };
  asegurar(30);
  tituloSeccion("Detalle de operaciones", `${r.filas.length} ${r.filas.length === 1 ? "partida" : "partidas"}`);
  encabezadoTabla();
  r.filas.forEach((f, i) => {
    const producto = lineas(f.producto, cols[2].w - 4, 8);
    const prodVisible = producto.slice(0, 3);
    if (producto.length > 3) prodVisible[2] = prodVisible[2].replace(/\s*\S*$/, "…");
    const h = Math.max(9, prodVisible.length * 8 * INTERLINEA + (f.orden ? 7 : 3));
    if (y + h > limite) {
      nuevaPagina();
      encabezadoTabla();
    }
    if (i % 2 === 1) {
      doc.setFillColor(...FONDO_SUAVE);
      doc.rect(MARGEN, y, util, h, "F");
    }
    let x = MARGEN;
    fuente(8, "normal", CARBON);
    doc.text(fecha(f.fecha), x + 2, y + 4.5);
    x += cols[0].w;
    fuente(7.5, "bold", CARBON);
    doc.text(f.folio, x + 2, y + 4.5);
    fuente(6.5, "normal", GRIS);
    doc.text(f.tipo === "factura" ? "Factura" : "Remisión", x + 2, y + 7.6);
    x += cols[1].w;
    fuente(8, "normal", CARBON);
    doc.text(prodVisible, x + 2, y + 4.5);
    if (f.orden) {
      fuente(6.5, "normal", GRIS);
      doc.text(f.orden, x + 2, y + 4.5 + prodVisible.length * 8 * INTERLINEA + 0.6);
    }
    x += cols[2].w;
    fuente(8, "normal", CARBON);
    doc.text(f.cantidad > 0 ? `${numero(f.cantidad, 2)} ${unidadBonita(f.unidad)}` : "—", x + cols[3].w - 2, y + 4.5, { align: "right" });
    x += cols[3].w;
    doc.text(f.costoUnitario > 0 ? `$${f.costoUnitario.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—", x + cols[4].w - 2, y + 4.5, { align: "right" });
    x += cols[4].w;
    fuente(8.5, "bold", VERDE);
    doc.text(formatoPesos(f.monto), x + cols[5].w - 2, y + 4.5, { align: "right" });
    y += h;
  });
  if (r.filas.length === 0) {
    fuente(9.5, "normal", GRIS);
    doc.text("Sin operaciones en este periodo.", MARGEN + 2, y + 6);
    y += 10;
  }
  // Totales
  asegurar(10);
  doc.setDrawColor(...VERDE);
  doc.setLineWidth(0.4);
  doc.line(MARGEN, y, MARGEN + util, y);
  doc.setLineWidth(0.2);
  fuente(9, "bold", VERDE);
  doc.text("TOTAL DEL PERIODO", MARGEN + 2, y + 5.5);
  const xCant = MARGEN + cols[0].w + cols[1].w + cols[2].w + cols[3].w - 2;
  fuente(8.5, "bold", CARBON);
  if (r.cantidad > 0) doc.text(`${numero(r.cantidad, 2)} ${unidad}`, xCant, y + 5.5, { align: "right" });
  fuente(10, "bold", DORADO);
  doc.text(formatoPesos(r.monto), MARGEN + util - 2, y + 5.5, { align: "right" });
  y += 12;

  // Nota de cierre
  asegurar(12);
  fuente(8.5, "normal", GRIS);
  doc.text(
    lineas("Si encuentras alguna diferencia con tus registros, avísanos por WhatsApp para revisarla. ¡Gracias por trabajar con SAUCEDA!", util, 8.5),
    MARGEN,
    y
  );

  // Pie de página
  const total = doc.getNumberOfPages();
  const generado = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    fuente(7.5, "normal", GRIS);
    doc.text(`SAUCEDA · Reporte de ventas de ${proveedorNombre} · Generado el ${generado}`, MARGEN, alto - 8);
    doc.text(`Página ${i} de ${total}`, ancho - MARGEN, alto - 8, { align: "right" });
  }
  return doc;
}

export function nombreArchivoReporte(proveedorNombre: string, r: ReporteVentasProveedor): string {
  const nombre = proveedorNombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `reporte-ventas-${nombre || "proveedor"}-${r.desde}-a-${r.hasta}.pdf`;
}
