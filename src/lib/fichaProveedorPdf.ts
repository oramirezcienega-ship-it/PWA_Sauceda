import { jsPDF } from "jspdf";
import { dibujarLogoPdf } from "@/lib/marca-pdf";
import { formatoPesos } from "@/lib/formato";
import { formatoEscalon } from "@/lib/tarifas-capacidad";
import type { OfertaPortalProveedor } from "@/app/actions/portal-precios-proveedor";

/**
 * PDF con el resumen de servicios de un proveedor (lo mismo que ve en su link):
 * tabla con costo, garantía, tiempo, anticipo y zonas, y después el detalle de cada
 * servicio con su proceso. Sirve para mandárselo cuando no puede abrir el link.
 */

const VERDE: [number, number, number] = [45, 74, 43];
const SAUCE: [number, number, number] = [92, 122, 82];
const CARBON: [number, number, number] = [40, 40, 40];
const GRIS: [number, number, number] = [120, 120, 120];
const LINEA: [number, number, number] = [225, 225, 225];
const AMBAR: [number, number, number] = [180, 110, 20];

const MARGEN = 12;

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function textoCosto(o: OfertaPortalProveedor): string {
  if (o.tarifasCapacidad.length > 0)
    return o.tarifasCapacidad
      .map((t) => `${formatoEscalon(t.hastaLitros, o.productoTarifaMedida)}: ${formatoPesos(t.costo)}`)
      .join("\n");
  if (o.costoUnitario > 0) {
    const vol = o.costosVolumen.map((r) => `Hasta ${r.hasta} ${o.productoUnidad}: ${formatoPesos(r.costo)}`);
    return [`${formatoPesos(o.costoUnitario)} / ${o.productoUnidad}`, ...vol].join("\n");
  }
  return "";
}

function textoGarantia(o: OfertaPortalProveedor): string {
  return o.garantiaAnios > 0 ? `${o.garantiaAnios} ${o.garantiaAnios === 1 ? "año" : "años"}` : o.garantiaCondiciones.trim();
}

function textoAnticipo(o: OfertaPortalProveedor): string {
  return o.anticipoPct > 0 ? `${o.anticipoPct}%` : o.condicionesPago.trim();
}

export function generarFichaProveedorPdf(proveedorNombre: string, ofertas: OfertaPortalProveedor[]): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const util = ancho - MARGEN * 2;
  let y = 0;

  const pie = () => {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GRIS);
      doc.text(`SAUCEDA · Ficha de servicios de ${proveedorNombre}`, MARGEN, alto - 6);
      doc.text(`Página ${i} de ${total}`, ancho - MARGEN, alto - 6, { align: "right" });
    }
  };

  const nuevaPagina = () => {
    doc.addPage();
    y = MARGEN;
  };
  const asegurar = (h: number) => {
    if (y + h > alto - 12) nuevaPagina();
  };

  // Encabezado
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, ancho, 28, "F");
  dibujarLogoPdf(doc, MARGEN, 7, 9, "negativo");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(proveedorNombre, ancho - MARGEN, 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Ficha de servicios · ${fecha(new Date().toISOString())}`, ancho - MARGEN, 18, { align: "right" });
  const completas = ofertas.filter((o) => textoCosto(o) && textoGarantia(o) && o.tiempoEjecucion.trim()).length;
  doc.text(`${ofertas.length} servicios · ${completas} con costo, garantía y tiempo`, ancho - MARGEN, 23, {
    align: "right",
  });
  y = 36;

  doc.setTextColor(...CARBON);
  doc.setFontSize(9);
  doc.text(
    doc.splitTextToSize(
      "Revisa que tus costos y condiciones estén correctos. Si algo cambió o falta (marcado como \"Sin capturar\"), mándanos la corrección por WhatsApp o actualízalo en tu link.",
      util
    ),
    MARGEN,
    y
  );
  y += 10;

  // Tabla resumen
  const cols = [
    { titulo: "Servicio", w: 0.24 },
    { titulo: "Tu costo", w: 0.2 },
    { titulo: "Garantía", w: 0.14 },
    { titulo: "Tiempo", w: 0.13 },
    { titulo: "Anticipo / pago", w: 0.13 },
    { titulo: "Zonas", w: 0.16 },
  ].map((c) => ({ ...c, w: c.w * util }));

  const encabezadoTabla = () => {
    doc.setFillColor(...SAUCE);
    doc.rect(MARGEN, y, util, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    let x = MARGEN;
    for (const c of cols) {
      doc.text(c.titulo.toUpperCase(), x + 2, y + 4.8);
      x += c.w;
    }
    y += 7;
  };
  encabezadoTabla();

  ofertas.forEach((o, idx) => {
    const celdas = [
      o.productoNombre,
      textoCosto(o),
      textoGarantia(o),
      o.tiempoEjecucion.trim(),
      textoAnticipo(o),
      o.zonasCobertura.trim(),
    ];
    doc.setFontSize(8.5);
    const lineas = celdas.map((t, i) => (t ? doc.splitTextToSize(t, cols[i].w - 4) : ["Sin capturar"]) as string[]);
    const h = Math.max(...lineas.map((l) => l.length)) * 3.8 + 4;
    if (y + h > alto - 12) {
      nuevaPagina();
      encabezadoTabla();
    }
    if (idx % 2 === 1) {
      doc.setFillColor(247, 248, 246);
      doc.rect(MARGEN, y, util, h, "F");
    }
    let x = MARGEN;
    lineas.forEach((l, i) => {
      const vacio = !celdas[i];
      doc.setFont("helvetica", i === 0 || i === 1 ? "bold" : "normal");
      doc.setTextColor(...(vacio ? AMBAR : i === 0 ? VERDE : CARBON));
      doc.text(l, x + 2, y + 5);
      x += cols[i].w;
    });
    doc.setDrawColor(...LINEA);
    doc.line(MARGEN, y + h, MARGEN + util, y + h);
    y += h;
  });

  // Detalle por servicio
  y += 8;
  asegurar(14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...VERDE);
  doc.text("Detalle por servicio", MARGEN, y);
  y += 6;

  for (const o of ofertas) {
    const filas: [string, string][] = [
      ["Proceso de trabajo", o.descripcionProceso.trim()],
      ["Qué cubre la garantía", o.garantiaCondiciones.trim()],
      ["Condiciones de pago", o.condicionesPago.trim()],
      ["Mínimo", [o.cantidadMinima > 0 ? `${o.cantidadMinima} ${o.productoUnidad}` : "", o.montoMinimo > 0 ? formatoPesos(o.montoMinimo) : ""].filter(Boolean).join(" · ")],
      ["Precio vigente hasta", o.vigenciaPrecio ? fecha(`${o.vigenciaPrecio}T12:00:00`) : ""],
      ["Fotos de trabajos", o.fotos.length ? `${o.fotos.length} en tu link` : ""],
      ["Última actualización", o.actualizadoPorProveedorAt ? fecha(o.actualizadoPorProveedorAt) : ""],
    ];
    doc.setFontSize(8.5);
    const anchoValor = util - 50;
    const bloques = filas.map(([k, v]) => ({
      k,
      v: v || "Sin capturar",
      vacio: !v,
      l: doc.splitTextToSize(v || "Sin capturar", anchoValor) as string[],
    }));
    const hTotal = 9 + bloques.reduce((s, b) => s + b.l.length * 3.8 + 1.5, 0);
    asegurar(Math.min(hTotal, 60));

    doc.setFillColor(240, 244, 238);
    doc.rect(MARGEN, y, util, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...VERDE);
    doc.text(o.productoNombre, MARGEN + 2, y + 4.9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(o.productoCategoria, MARGEN + util - 2, y + 4.9, { align: "right" });
    y += 9;

    for (const b of bloques) {
      const h = b.l.length * 3.8 + 1.5;
      asegurar(h);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GRIS);
      doc.text(b.k, MARGEN + 2, y + 3);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...(b.vacio ? AMBAR : CARBON));
      doc.text(b.l, MARGEN + 50, y + 3);
      y += h;
    }
    y += 4;
  }

  if (ofertas.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...GRIS);
    doc.text("Aún no tienes servicios registrados con SAUCEDA.", MARGEN, y);
  }

  pie();
  return doc;
}

/** Genera y descarga el PDF en el navegador. */
export function descargarFichaProveedorPdf(proveedorNombre: string, ofertas: OfertaPortalProveedor[]) {
  const nombre = proveedorNombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  generarFichaProveedorPdf(proveedorNombre, ofertas).save(`servicios-${nombre || "proveedor"}.pdf`);
}
