import { jsPDF } from "jspdf";
import { dibujarLogoPdf } from "@/lib/marca-pdf";
import { formatoPesos } from "@/lib/formato";
import { formatoEscalon } from "@/lib/tarifas-capacidad";
import type { OfertaPortalProveedor } from "@/app/actions/portal-precios-proveedor";
import { textoGarantiaEstandar } from "@/lib/estandar-servicio";
import { faltantesCondiciones, textoPago, type CondicionesProveedor } from "@/lib/condiciones-proveedor";

/**
 * PDF con la ficha de servicios de un proveedor (lo mismo que ve en su link), para
 * mandárselo cuando no puede abrir el link. Carta vertical, una tarjeta por servicio:
 * costo por capacidad, condiciones, proceso estándar y una sola línea con lo que falta.
 */

type RGB = [number, number, number];
const VERDE: RGB = [45, 74, 43];
const SAUCE: RGB = [92, 122, 82];
const FONDO_TITULO: RGB = [236, 242, 233];
const FONDO_SUAVE: RGB = [247, 248, 246];
const CARBON: RGB = [35, 35, 35];
const GRIS: RGB = [115, 115, 115];
const GRIS_CLARO: RGB = [170, 170, 170];
const LINEA: RGB = [222, 226, 220];
const AMBAR: RGB = [176, 104, 12];
const FONDO_AMBAR: RGB = [254, 246, 231];
const VERDE_OK: RGB = [22, 120, 70];
const FONDO_OK: RGB = [231, 245, 236];

const MARGEN = 16;
const INTERLINEA = 0.42; // mm por punto de fuente

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

/** Lo que le falta a la ficha (mismo criterio que el link del proveedor). */
function faltantes(o: OfertaPortalProveedor): string[] {
  const f: string[] = [];
  if (!(o.costoUnitario > 0) && o.tarifasCapacidad.length === 0) f.push("costo");
  if (o.estandar) {
    if (!o.cumpleEstandar) f.push("confirmar el estándar");
  } else {
    if (!(o.garantiaAnios > 0) && !o.garantiaCondiciones.trim()) f.push("garantía");
    if (!o.descripcionProceso.trim()) f.push("proceso");
  }
  if (!o.tiempoEjecucion.trim()) f.push("tiempo");
  if (o.fotos.length === 0) f.push("fotos");
  return f;
}

function garantia(o: OfertaPortalProveedor): string {
  if (o.estandar) return textoGarantiaEstandar(o.estandar);
  return [o.garantiaAnios > 0 ? `${o.garantiaAnios} ${o.garantiaAnios === 1 ? "año" : "años"}` : "", o.garantiaCondiciones.trim()]
    .filter(Boolean)
    .join(" · ");
}

/** Filas de costo: todas las capacidades del catálogo (las no cotizadas con "—") o el costo unitario. */
function filasCosto(o: OfertaPortalProveedor): { concepto: string; valor: string; vacio: boolean }[] {
  const capacidades = o.capacidades.length > 0 ? o.capacidades : o.tarifasCapacidad.map((t) => t.hastaLitros);
  if (capacidades.length > 0) {
    return capacidades.map((h) => {
      const c = o.tarifasCapacidad.find((t) => t.hastaLitros === h);
      return { concepto: `Hasta ${formatoEscalon(h, o.productoTarifaMedida)}`, valor: c ? formatoPesos(c.costo) : "—", vacio: !c };
    });
  }
  if (o.costoUnitario > 0) {
    return [
      { concepto: `Por ${o.productoUnidad}`, valor: formatoPesos(o.costoUnitario), vacio: false },
      ...o.costosVolumen.map((r) => ({ concepto: `Hasta ${r.hasta} ${o.productoUnidad}`, valor: formatoPesos(r.costo), vacio: false })),
    ];
  }
  return [{ concepto: "Sin costo capturado", valor: "—", vacio: true }];
}

export function generarFichaProveedorPdf(
  proveedorNombre: string,
  ofertas: OfertaPortalProveedor[],
  condiciones?: CondicionesProveedor
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const util = ancho - MARGEN * 2;
  const limite = alto - 16;
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
  const altoTexto = (n: number, tam: number) => n * tam * INTERLINEA + 1;

  const encabezadoContinuacion = () => {
    fuente(8.5, "bold", SAUCE);
    doc.text(`Ficha de servicios · ${proveedorNombre}`, MARGEN, 11);
    doc.setDrawColor(...LINEA);
    doc.line(MARGEN, 13, MARGEN + util, 13);
    y = 19;
  };
  const nuevaPagina = () => {
    doc.addPage();
    encabezadoContinuacion();
  };
  const asegurar = (h: number) => {
    if (y + h > limite) nuevaPagina();
  };

  // ---------- Portada / encabezado ----------
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, ancho, 34, "F");
  dibujarLogoPdf(doc, MARGEN, 9, 9, "negativo");
  fuente(9, "normal", [210, 225, 205]);
  doc.text("FICHA DE SERVICIOS PARA SAUCEDA", ancho - MARGEN, 11, { align: "right" });
  fuente(17, "bold", [255, 255, 255]);
  doc.text(proveedorNombre, ancho - MARGEN, 20, { align: "right" });
  fuente(9, "normal", [225, 235, 222]);
  doc.text(`Actualizada al ${fecha(new Date().toISOString())}`, ancho - MARGEN, 27, { align: "right" });
  y = 44;

  const completas = ofertas.filter((o) => faltantes(o).length === 0).length;
  const resumen = `${ofertas.length} ${ofertas.length === 1 ? "servicio" : "servicios"}`;
  fuente(11, "bold", VERDE);
  doc.text(resumen, MARGEN, y);
  const anchoResumen = doc.getTextWidth(resumen);
  fuente(10, "normal", GRIS);
  doc.text(
    `·  ${completas} con ficha completa  ·  ${ofertas.length - completas} con datos por completar`,
    MARGEN + anchoResumen + 3,
    y
  );
  y += 6;
  fuente(9.5, "normal", CARBON);
  const intro = lineas(
    "Revisa que tus costos y condiciones sean correctos. Si algo cambió o falta, mándanos la corrección por WhatsApp o actualízalo en tu link de SAUCEDA.",
    util,
    9.5
  );
  doc.text(intro, MARGEN, y);
  y += altoTexto(intro.length, 9.5) + 4;

  if (condiciones) {
    const hoy = new Date().toISOString().slice(0, 10);
    const vencida = !!condiciones.vigenciaPrecios && condiciones.vigenciaPrecios < hoy;
    const filas: [string, string, boolean][] = [
      ["Anticipo y pago", textoPago(condiciones), false],
      ["Zonas donde trabajas", condiciones.zonas.join(", "), false],
      [
        "Respetas tus precios hasta",
        condiciones.vigenciaPrecios ? `${fecha(`${condiciones.vigenciaPrecios}T12:00:00`)}${vencida ? " (vencido)" : ""}` : "",
        vencida,
      ],
    ];
    const ls = filas.map(([, v]) => lineas(v || "—", util - 62, 10));
    const h = 10 + ls.reduce((acc, l) => acc + Math.max(6, altoTexto(l.length, 10) + 1.5), 0);
    const faltanCond = faltantesCondiciones(condiciones);
    doc.setDrawColor(...LINEA);
    doc.setFillColor(...FONDO_SUAVE);
    doc.roundedRect(MARGEN, y, util, h + (faltanCond.length ? 6 : 0), 2, 2, "FD");
    fuente(8, "bold", GRIS);
    doc.text("TUS CONDICIONES CON SAUCEDA (APLICAN A TODOS TUS SERVICIOS)", MARGEN + 4, y + 6);
    let yy = y + 10;
    filas.forEach(([k, v, alerta], i) => {
      fuente(9.5, "normal", GRIS);
      doc.text(k, MARGEN + 4, yy + 4);
      fuente(10, v ? "bold" : "normal", alerta ? AMBAR : v ? CARBON : GRIS_CLARO);
      doc.text(ls[i], MARGEN + 58, yy + 4);
      yy += Math.max(6, altoTexto(ls[i].length, 10) + 1.5);
    });
    if (faltanCond.length) {
      fuente(9, "bold", AMBAR);
      doc.text(`Por completar: ${faltanCond.join(", ")}.`, MARGEN + 4, yy + 4);
    }
    y += h + (faltanCond.length ? 6 : 0) + 7;
  }

  // ---------- Una tarjeta por servicio ----------
  for (const o of ofertas) {
    const falta = faltantes(o);
    const costos = filasCosto(o);
    const condiciones: [string, string][] = [
      [o.estandar ? "Garantía al cliente" : "Garantía", garantia(o)],
      ["Tu tiempo de ejecución", o.tiempoEjecucion.trim() || (o.estandar?.tiempo ? `Objetivo: ${o.estandar.tiempo}` : "")],
      [
        "Mínimo",
        [o.cantidadMinima > 0 ? `${o.cantidadMinima} ${o.productoUnidad}` : "", o.montoMinimo > 0 ? formatoPesos(o.montoMinimo) : ""]
          .filter(Boolean)
          .join(" · "),
      ],
      ["Fotos de tus trabajos", o.fotos.length ? `${o.fotos.length} en tu link` : ""],
    ];
    const proceso = (o.estandar?.proceso || o.descripcionProceso || "").trim();
    const incluye = (o.estandar?.incluye || "").trim();

    // Medidas de las dos columnas
    const anchoIzq = util * 0.4;
    const anchoDer = util - anchoIzq - 6;
    const xIzq = MARGEN + 4;
    const xDer = MARGEN + anchoIzq + 6;
    const altoFilaCosto = 6;
    const lineasCond = condiciones.map(([, v]) => lineas(v || "—", anchoDer - 46, 9.5));
    const altoCond = lineasCond.reduce((s, l) => s + Math.max(5.4, altoTexto(l.length, 9.5) + 1.2), 0);
    const altoCostos = 7 + costos.length * altoFilaCosto;
    const altoColumnas = Math.max(altoCostos, altoCond + 7) + 3;

    // Alto estimado de la tarjeta: si cabe en una página no se parte.
    const lineasProceso = proceso ? lineas(proceso, util - 8, 9.5).length : 0;
    const lineasIncluye = incluye ? lineas(incluye, util - 8, 9.5).length : 0;
    const altoTarjeta =
      16 +
      altoColumnas +
      (proceso ? 7 + lineasProceso * 9.5 * INTERLINEA : 0) +
      (incluye ? 7 + lineasIncluye * 9.5 * INTERLINEA : 0) +
      (o.estandar ? 6 : 0) +
      (falta.length ? 10 : 0) +
      15;
    asegurar(altoTarjeta <= limite - 19 ? altoTarjeta : 14 + Math.min(altoColumnas, 60));

    // Título
    doc.setFillColor(...FONDO_TITULO);
    doc.roundedRect(MARGEN, y, util, 12, 2, 2, "F");
    fuente(12.5, "bold", VERDE);
    doc.text(lineas(o.productoNombre, util - 60, 12.5)[0], MARGEN + 4, y + 7.8);
    const etiqueta = falta.length === 0 ? "FICHA COMPLETA" : `FALTAN ${falta.length} ${falta.length === 1 ? "DATO" : "DATOS"}`;
    fuente(8, "bold", falta.length === 0 ? VERDE_OK : AMBAR);
    const wEt = doc.getTextWidth(etiqueta) + 6;
    doc.setFillColor(...(falta.length === 0 ? FONDO_OK : FONDO_AMBAR));
    doc.roundedRect(MARGEN + util - wEt - 3, y + 3, wEt, 6, 3, 3, "F");
    doc.text(etiqueta, MARGEN + util - wEt / 2 - 3, y + 7.1, { align: "center" });
    y += 16;

    // Columna izquierda: costos
    const yCol = y;
    fuente(8, "bold", GRIS);
    doc.text("TU COSTO PARA SAUCEDA", xIzq, yCol);
    let yc = yCol + 4;
    for (let i = 0; i < costos.length; i++) {
      const f = costos[i];
      if (i % 2 === 0) {
        doc.setFillColor(...FONDO_SUAVE);
        doc.rect(xIzq - 1, yc - 0.5, anchoIzq - 4, altoFilaCosto, "F");
      }
      fuente(10, "normal", f.vacio ? GRIS_CLARO : CARBON);
      doc.text(f.concepto, xIzq + 1, yc + 3.9);
      fuente(10.5, "bold", f.vacio ? GRIS_CLARO : VERDE);
      doc.text(f.valor, xIzq + anchoIzq - 6, yc + 3.9, { align: "right" });
      yc += altoFilaCosto;
    }
    if (costos.some((c) => c.vacio) && costos.length > 1) {
      fuente(8, "normal", GRIS);
      doc.text("— = capacidad que no has cotizado", xIzq + 1, yc + 3.5);
      yc += 8;
    }

    // Columna derecha: condiciones
    fuente(8, "bold", GRIS);
    doc.text("CONDICIONES", xDer, yCol);
    let yd = yCol + 4;
    condiciones.forEach(([k, v], i) => {
      const l = lineasCond[i];
      fuente(9, "normal", GRIS);
      doc.text(k, xDer, yd + 3.6);
      fuente(9.5, v ? "bold" : "normal", v ? CARBON : GRIS_CLARO);
      doc.text(l, xDer + 46, yd + 3.6);
      yd += Math.max(5.4, altoTexto(l.length, 9.5) + 1.2);
    });
    y = Math.max(yc, yd) + 4;

    // Proceso e incluye (texto completo, se parte entre páginas si es largo)
    const parrafo = (titulo: string, texto: string) => {
      const ls = lineas(texto, util - 8, 9.5);
      asegurar(10);
      fuente(8, "bold", GRIS);
      doc.text(titulo, xIzq, y);
      y += 4;
      for (const l of ls) {
        asegurar(4.5);
        fuente(9.5, "normal", CARBON);
        doc.text(l, xIzq, y + 3);
        y += 9.5 * INTERLINEA;
      }
      y += 3;
    };
    if (proceso) parrafo(o.estandar ? "PROCESO (ESTÁNDAR SAUCEDA)" : "TU PROCESO DE TRABAJO", proceso);
    if (incluye) parrafo("INCLUYE / NO INCLUYE", incluye);

    // Estándar y excepciones
    if (o.estandar) {
      asegurar(7);
      fuente(9, "bold", o.cumpleEstandar ? VERDE_OK : AMBAR);
      doc.text(
        o.cumpleEstandar ? "Confirmaste que trabajas con el estándar SAUCEDA." : "Falta que confirmes que trabajas con el estándar SAUCEDA (en tu link).",
        xIzq,
        y + 3
      );
      y += 6;
      if (o.excepcionesEstandar.trim()) parrafo("TUS EXCEPCIONES O MEJORAS", o.excepcionesEstandar.trim());
    }

    // Lo que falta, en una sola línea
    if (falta.length > 0) {
      const ls = lineas(`Por completar: ${falta.join(", ")}.`, util - 10, 9.5);
      const h = altoTexto(ls.length, 9.5) + 3;
      asegurar(h + 2);
      doc.setFillColor(...FONDO_AMBAR);
      doc.roundedRect(MARGEN, y, util, h, 1.5, 1.5, "F");
      fuente(9.5, "bold", AMBAR);
      doc.text(ls, MARGEN + 4, y + 4.4);
      y += h;
    }

    // Separación entre servicios
    y += 4;
    fuente(8, "normal", GRIS);
    doc.text(
      o.actualizadoPorProveedorAt ? `Actualizado por ti el ${fecha(o.actualizadoPorProveedorAt)}` : "Aún no lo actualizas desde tu link",
      MARGEN + util,
      y,
      { align: "right" }
    );
    y += 3;
    doc.setDrawColor(...LINEA);
    doc.line(MARGEN, y, MARGEN + util, y);
    y += 8;
  }

  if (ofertas.length === 0) {
    fuente(11, "normal", GRIS);
    doc.text("Aún no tienes servicios registrados con SAUCEDA.", MARGEN, y);
  }

  // Pie de página
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    fuente(8, "normal", GRIS);
    doc.text(`SAUCEDA · Ficha de servicios de ${proveedorNombre}`, MARGEN, alto - 8);
    doc.text(`Página ${i} de ${total}`, ancho - MARGEN, alto - 8, { align: "right" });
  }
  return doc;
}

/** Genera y descarga el PDF en el navegador. */
export function descargarFichaProveedorPdf(
  proveedorNombre: string,
  ofertas: OfertaPortalProveedor[],
  condiciones?: CondicionesProveedor
) {
  const nombre = proveedorNombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  generarFichaProveedorPdf(proveedorNombre, ofertas, condiciones).save(`servicios-${nombre || "proveedor"}.pdf`);
}
