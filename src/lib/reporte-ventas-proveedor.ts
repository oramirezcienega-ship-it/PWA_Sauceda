import type { DocumentoProveedor } from "./types";

/**
 * Cálculos del reporte de ventas que se le manda a un proveedor: todo lo que SAUCEDA le
 * ha comprado (remisiones y facturas) en un periodo, con KPIs, venta por mes, venta por
 * producto y un resumen en texto. Sin dependencias de UI para poder probarse con `npm test`.
 */

export interface MesReporte {
  /** "YYYY-MM" */
  clave: string;
  /** "oct 2026" */
  etiqueta: string;
  monto: number;
  operaciones: number;
  cantidad: number;
}

export interface ProductoReporte {
  nombre: string;
  unidad: string;
  monto: number;
  cantidad: number;
  operaciones: number;
  /** 0–100 del monto del periodo */
  porcentaje: number;
}

export interface FilaReporte {
  fecha: string;
  folio: string;
  tipo: DocumentoProveedor["tipo"];
  orden: string;
  producto: string;
  cantidad: number;
  unidad: string;
  costoUnitario: number;
  monto: number;
}

export interface ReporteVentasProveedor {
  desde: string;
  hasta: string;
  operaciones: number;
  monto: number;
  cantidad: number;
  /** $ por unidad, ponderado (monto / cantidad) */
  costoPromedio: number;
  ticketPromedio: number;
  meses: MesReporte[];
  productos: ProductoReporte[];
  filas: FilaReporte[];
  /** Mismo largo de periodo inmediatamente anterior, para comparar. */
  anterior: { monto: number; operaciones: number };
  resumen: string[];
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Fecha del documento como "YYYY-MM-DD" (acepta ISO con hora). */
function dia(fecha: string): string {
  return (fecha || "").slice(0, 10);
}

function etiquetaMes(clave: string): string {
  const [a, m] = clave.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

/** Todos los meses entre dos fechas "YYYY-MM-DD", inclusive. */
function mesesEntre(desde: string, hasta: string): string[] {
  let [a, m] = desde.slice(0, 7).split("-").map(Number);
  const [aF, mF] = hasta.slice(0, 7).split("-").map(Number);
  const claves: string[] = [];
  while (a < aF || (a === aF && m <= mF)) {
    claves.push(`${a}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
    if (claves.length > 120) break;
  }
  return claves;
}

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000) + 1;
}

/** Partidas del documento (o una sola con los datos generales si no tiene desglose). */
function partidasDe(d: DocumentoProveedor): Omit<FilaReporte, "fecha" | "folio" | "tipo" | "orden">[] {
  if (Array.isArray(d.partidas) && d.partidas.length > 0) {
    return d.partidas.map((p) => {
      const cantidad = Number(p.cantidad) || 0;
      const costoUnitario = Number(p.costoUnitario) || 0;
      return {
        producto: (p.descripcion || "Partida general").trim(),
        cantidad,
        unidad: p.unidad || "m2",
        costoUnitario,
        monto: Number(p.importe) || costoUnitario * cantidad || 0,
      };
    });
  }
  const cantidad = Number(d.cantidad) || 0;
  const monto = Number(d.monto) || 0;
  let costoUnitario = Number(d.costoUnitario) || 0;
  if (costoUnitario <= 0 && cantidad > 0 && monto > 0) costoUnitario = redondear(monto / cantidad);
  return [
    {
      producto: (d.productoNombre || d.concepto || "Trabajo general").trim(),
      cantidad,
      unidad: d.unidad || "m2",
      costoUnitario,
      monto,
    },
  ];
}

const pesos = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
const numero = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 1 });
const unidadBonita = (u: string) => (u === "m2" ? "m²" : u);

export function calcularReporteVentasProveedor(
  documentos: DocumentoProveedor[],
  desde: string,
  hasta: string
): ReporteVentasProveedor {
  const enPeriodo = documentos
    .filter((d) => {
      const f = dia(d.fecha);
      return f >= desde && f <= hasta;
    })
    .sort((a, b) => dia(a.fecha).localeCompare(dia(b.fecha)) || (a.folio || "").localeCompare(b.folio || ""));

  const meses = new Map<string, MesReporte>(
    mesesEntre(desde, hasta).map((c) => [c, { clave: c, etiqueta: etiquetaMes(c), monto: 0, operaciones: 0, cantidad: 0 }])
  );
  const productos = new Map<string, ProductoReporte>();
  const filas: FilaReporte[] = [];
  let monto = 0;
  let cantidad = 0;

  for (const d of enPeriodo) {
    const montoDoc = Number(d.monto) || 0;
    monto += montoDoc;
    const mes = meses.get(dia(d.fecha).slice(0, 7));
    const partidas = partidasDe(d);
    const cantidadDoc = partidas.reduce((s, p) => s + p.cantidad, 0);
    cantidad += cantidadDoc;
    if (mes) {
      mes.monto += montoDoc;
      mes.operaciones += 1;
      mes.cantidad += cantidadDoc;
    }
    for (const p of partidas) {
      const clave = p.producto.toLowerCase();
      const prod = productos.get(clave) ?? { nombre: p.producto, unidad: p.unidad, monto: 0, cantidad: 0, operaciones: 0, porcentaje: 0 };
      prod.monto += p.monto;
      prod.cantidad += p.cantidad;
      prod.operaciones += 1;
      productos.set(clave, prod);
      filas.push({
        fecha: dia(d.fecha),
        folio: d.folio || "—",
        tipo: d.tipo,
        orden: d.ordenTrabajoFolio || d.cotizacionFolio || d.cotizacionId || "",
        ...p,
      });
    }
  }

  const totalProductos = Array.from(productos.values()).reduce((s, p) => s + p.monto, 0);
  const listaProductos = Array.from(productos.values())
    .map((p) => ({
      ...p,
      monto: redondear(p.monto),
      cantidad: redondear(p.cantidad),
      porcentaje: totalProductos > 0 ? Math.round((p.monto / totalProductos) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.monto - a.monto);

  // Periodo anterior del mismo largo
  const largo = diasEntre(desde, hasta);
  const hastaAnt = restarDias(desde, 1);
  const desdeAnt = restarDias(desde, largo);
  const anteriores = documentos.filter((d) => {
    const f = dia(d.fecha);
    return f >= desdeAnt && f <= hastaAnt;
  });
  const anterior = {
    monto: anteriores.reduce((s, d) => s + (Number(d.monto) || 0), 0),
    operaciones: anteriores.length,
  };

  const reporte: ReporteVentasProveedor = {
    desde,
    hasta,
    operaciones: enPeriodo.length,
    monto: redondear(monto),
    cantidad: redondear(cantidad),
    costoPromedio: cantidad > 0 ? redondear(monto / cantidad) : 0,
    ticketPromedio: enPeriodo.length > 0 ? redondear(monto / enPeriodo.length) : 0,
    meses: Array.from(meses.values()).map((m) => ({ ...m, monto: redondear(m.monto), cantidad: redondear(m.cantidad) })),
    productos: listaProductos,
    filas,
    anterior,
    resumen: [],
  };
  reporte.resumen = resumirReporte(reporte);
  return reporte;
}

/** Tres o cuatro frases sencillas de lo que pasó en el periodo. */
export function resumirReporte(r: ReporteVentasProveedor): string[] {
  if (r.operaciones === 0) return ["En este periodo no hubo trabajos registrados contigo."];
  const frases: string[] = [];
  const unidad = r.productos.length > 0 ? unidadBonita(r.productos[0].unidad) : "m²";
  frases.push(
    `En el periodo realizaste ${r.operaciones} ${r.operaciones === 1 ? "trabajo" : "trabajos"} con SAUCEDA por un total de ${pesos(r.monto)}` +
      (r.cantidad > 0 ? `, ${numero(r.cantidad)} ${unidad} en total.` : ".")
  );

  if (r.anterior.monto > 0) {
    const cambio = Math.round(((r.monto - r.anterior.monto) / r.anterior.monto) * 100);
    if (cambio > 0) frases.push(`Tus ventas crecieron ${cambio}% contra el periodo anterior del mismo largo (${pesos(r.anterior.monto)}).`);
    else if (cambio < 0) frases.push(`Tus ventas bajaron ${Math.abs(cambio)}% contra el periodo anterior del mismo largo (${pesos(r.anterior.monto)}).`);
    else frases.push(`Tus ventas se mantuvieron igual que en el periodo anterior del mismo largo.`);
  }

  const conVenta = r.meses.filter((m) => m.monto > 0);
  if (r.meses.length > 1 && conVenta.length > 0) {
    const mejor = conVenta.reduce((a, b) => (b.monto > a.monto ? b : a));
    frases.push(`Tu mejor mes fue ${mejor.etiqueta} con ${pesos(mejor.monto)} en ${mejor.operaciones} ${mejor.operaciones === 1 ? "trabajo" : "trabajos"}.`);
  }

  const top = r.productos[0];
  if (top) {
    frases.push(
      r.productos.length === 1
        ? `Todo lo trabajado fue ${top.nombre}.`
        : `Lo que más vendiste fue ${top.nombre} (${top.porcentaje}% del total, ${numero(top.cantidad)} ${unidadBonita(top.unidad)}).`
    );
  }
  return frases;
}
