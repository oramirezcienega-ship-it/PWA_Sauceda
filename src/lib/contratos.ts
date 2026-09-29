/**
 * Tipos y utilidades compartidas del Contrato de Prestación de Servicios.
 * (Sin dependencias de servidor: se usa también desde componentes cliente.)
 */

export type TipoServicioContrato =
  | "impermeabilizacion"
  | "herreria"
  | "canceleria"
  | "remodelacion"
  | "tinacos"
  | "cisternas"
  | "seguridad"
  | "general";

export const TIPOS_SERVICIO_CONTRATO: { valor: TipoServicioContrato; etiqueta: string }[] = [
  { valor: "impermeabilizacion", etiqueta: "Impermeabilización" },
  { valor: "herreria", etiqueta: "Herrería / techados" },
  { valor: "canceleria", etiqueta: "Cancelería de aluminio" },
  { valor: "remodelacion", etiqueta: "Remodelación" },
  { valor: "tinacos", etiqueta: "Tinacos" },
  { valor: "cisternas", etiqueta: "Cisternas" },
  { valor: "seguridad", etiqueta: "Seguridad (cámaras, malla)" },
  { valor: "general", etiqueta: "General" },
];

export type EstadoContrato = "borrador" | "generado" | "firmado" | "cancelado";

export interface PartidaContrato {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  importe: number;
}

export interface FotoContrato {
  url: string;
  descripcion?: string;
  fecha?: string;
}

/** Datos congelados con los que se arma el contrato (datos_snapshot). */
export interface DatosContrato {
  folio: string;
  version: number;
  fechaGeneracion: string; // ISO
  ordenFolio: string;
  cotizacionFolio: string;
  cotizacionFecha: string; // ISO
  tipoServicio: TipoServicioContrato;

  prestador: { razonSocial: string; rfc: string; domicilio: string };
  cliente: { nombre: string; domicilio: string; telefono: string; correo: string };
  domicilioObra: string;

  alcanceTecnico: string;
  exclusiones: string;

  partidas: PartidaContrato[];
  subtotal: number;
  total: number;
  leyendaIva: string;

  anticipoPct: number;
  anticipoMonto: number;
  finiquitoMonto: number;
  formaPago: string;

  fechaInicio: string; // AAAA-MM-DD ("" si no se definió)
  duracionDias: number;

  garantiaTexto: string;
  garantiaObjeto: string;
  garantiaExclusiones: string;
  clausulaClima: string;

  fotos: FotoContrato[];
}

/** Campos que el usuario puede ajustar en el modal "Revisar datos del contrato". */
export type OverridesContrato = Partial<
  Pick<
    DatosContrato,
    | "tipoServicio"
    | "domicilioObra"
    | "alcanceTecnico"
    | "exclusiones"
    | "leyendaIva"
    | "anticipoPct"
    | "formaPago"
    | "fechaInicio"
    | "duracionDias"
    | "garantiaTexto"
    | "garantiaObjeto"
    | "garantiaExclusiones"
    | "clausulaClima"
  >
>;

export interface ContratoRegistro {
  id: string;
  folio: string;
  version: number;
  ordenTrabajoId: string;
  cotizacionId: string | null;
  tipoServicio: TipoServicioContrato;
  estado: EstadoContrato;
  fechaGeneracion: string;
  fechaFirma: string | null;
  pdfFirmadoUrl: string | null;
}

/** Deduce el tipo de servicio del contrato a partir del texto de la cotización/OT. */
export function mapearTipoServicio(...textos: Array<string | null | undefined>): TipoServicioContrato {
  const t = textos.filter(Boolean).join(" ").toLowerCase();
  if (t.includes("imperme")) return "impermeabilizacion";
  if (t.includes("canceler") || t.includes("aluminio") || t.includes("ventana")) return "canceleria";
  if (t.includes("herrer") || t.includes("techad") || t.includes("porton") || t.includes("pergola")) return "herreria";
  if (t.includes("remodel")) return "remodelacion";
  if (t.includes("tinaco")) return "tinacos";
  if (t.includes("cisterna")) return "cisternas";
  if (t.includes("segur") || t.includes("camara") || t.includes("cámara") || t.includes("malla")) return "seguridad";
  return "general";
}

export function etiquetaTipoServicio(tipo: TipoServicioContrato): string {
  return TIPOS_SERVICIO_CONTRATO.find((t) => t.valor === tipo)?.etiqueta || "Servicios generales";
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "29 de septiembre de 2026" a partir de AAAA-MM-DD o ISO. */
export function fechaLarga(f: string | null | undefined): string {
  if (!f) return "";
  const [y, m, d] = f.slice(0, 10).split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return f;
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

export function dinero(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
}
