/**
 * Tipos y mapeos del inventario de inmuebles (asesoría de compra).
 * Sin dependencias de servidor: lo pueden importar componentes de cliente.
 */

import type { OrigenInmueble } from "./match";

export const ESTATUS_INMUEBLE = ["por_validar", "disponible", "apartado", "vendido", "descartado"] as const;
export type EstatusInmueble = (typeof ESTATUS_INMUEBLE)[number];

export const ETIQUETA_ESTATUS_INMUEBLE: Record<EstatusInmueble, string> = {
  por_validar: "Por validar",
  disponible: "Disponible",
  apartado: "Apartado",
  vendido: "Vendido",
  descartado: "Descartado",
};

export const ETIQUETA_ORIGEN: Record<OrigenInmueble, string> = {
  propio: "Propio",
  aliado: "Aliado",
  portal: "Portal",
};

export const ESTATUS_PROPUESTA = [
  "sugerida",
  "publicada",
  "vista",
  "me_interesa",
  "descartada",
  "visita_agendada",
  "visitada",
  "ofertada",
  "elegida",
] as const;
export type EstatusPropuesta = (typeof ESTATUS_PROPUESTA)[number];

export const ETIQUETA_ESTATUS_PROPUESTA: Record<EstatusPropuesta, string> = {
  sugerida: "Sugerida",
  publicada: "Publicada",
  vista: "Vista por el cliente",
  me_interesa: "Le interesa",
  descartada: "Descartada",
  visita_agendada: "Visita agendada",
  visitada: "Visitada",
  ofertada: "Ofertada",
  elegida: "Elegida",
};

export const MOTIVOS_DESCARTE = ["precio", "zona", "tamano", "estado", "otro"] as const;
export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number];
export const ETIQUETA_MOTIVO_DESCARTE: Record<MotivoDescarte, string> = {
  precio: "Precio",
  zona: "Zona",
  tamano: "Tamaño",
  estado: "Estado de la casa",
  otro: "Otro",
};

/** Máximo recomendado de opciones publicadas por ronda (más de esto solo advierte). */
export const MAX_PUBLICADAS_POR_RONDA = 5;

export interface Inmueble {
  id: string;
  folio: string;
  origen: OrigenInmueble;
  expedienteOrigenId: string | null;
  aliadoId: string | null;
  aliadoNombre: string | null;
  urlFuente: string | null;
  precio: number;
  aceptaCredito: string[];
  zona: string | null;
  fraccionamiento: string | null;
  colonia: string | null;
  ciudad: string | null;
  direccionPrivada: string | null;
  metrosConstruccion: number | null;
  metrosTerreno: number | null;
  recamaras: number | null;
  banos: number | null;
  estacionamientos: number | null;
  niveles: number | null;
  anioConstruccion: number | null;
  estadoConservacion: string | null;
  tieneEscritura: boolean | null;
  tieneAdeudos: boolean | null;
  tieneLitigios: boolean | null;
  descripcionPublica: string | null;
  notasInternas: string | null;
  /** Rutas guardadas (bucket `inmuebles` o URL completa). */
  fotos: string[];
  /** URLs listas para mostrar (firmadas). Mismo orden que `fotos`. */
  fotosUrl: string[];
  estatus: EstatusInmueble;
  validadoEn: string | null;
  createdAt: string;
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Fila de `inmuebles` → modelo. `fotosUrl` se llena después (firmado en el servidor). */
export function filaAInmueble(f: Record<string, any>): Inmueble {
  return {
    id: f.id,
    folio: f.folio,
    origen: f.origen,
    expedienteOrigenId: f.expediente_origen_id ?? null,
    aliadoId: f.aliado_id ?? null,
    aliadoNombre: f.aliado?.nombre ?? null,
    urlFuente: f.url_fuente ?? null,
    precio: Number(f.precio),
    aceptaCredito: f.acepta_credito ?? [],
    zona: f.zona ?? null,
    fraccionamiento: f.fraccionamiento ?? null,
    colonia: f.colonia ?? null,
    ciudad: f.ciudad ?? null,
    direccionPrivada: f.direccion_privada ?? null,
    metrosConstruccion: num(f.metros_construccion),
    metrosTerreno: num(f.metros_terreno),
    recamaras: num(f.recamaras),
    banos: num(f.banos),
    estacionamientos: num(f.estacionamientos),
    niveles: num(f.niveles),
    anioConstruccion: num(f.anio_construccion),
    estadoConservacion: f.estado_conservacion ?? null,
    tieneEscritura: f.tiene_escritura ?? null,
    tieneAdeudos: f.tiene_adeudos ?? null,
    tieneLitigios: f.tiene_litigios ?? null,
    descripcionPublica: f.descripcion_publica ?? null,
    notasInternas: f.notas_internas ?? null,
    fotos: f.fotos ?? [],
    fotosUrl: [],
    estatus: f.estatus,
    validadoEn: f.validado_en ?? null,
    createdAt: f.created_at,
  };
}

/** Descripción pública generada a partir de los datos (sin dirección exacta). */
export function descripcionAutomatica(i: {
  fraccionamiento?: string | null;
  zona?: string | null;
  recamaras?: number | null;
  banos?: number | null;
  metrosConstruccion?: number | null;
  metrosTerreno?: number | null;
  niveles?: number | null;
}): string {
  const partes: string[] = [];
  const lugar = i.fraccionamiento || i.zona;
  partes.push(`Casa${lugar ? ` en ${lugar}` : ""}`);
  const detalles: string[] = [];
  if (i.recamaras) detalles.push(`${i.recamaras} recámara${i.recamaras === 1 ? "" : "s"}`);
  if (i.banos) detalles.push(`${i.banos} baño${i.banos === 1 ? "" : "s"}`);
  if (i.niveles) detalles.push(`${i.niveles} nivel${i.niveles === 1 ? "" : "es"}`);
  if (i.metrosConstruccion) detalles.push(`${i.metrosConstruccion} m² de construcción`);
  if (i.metrosTerreno) detalles.push(`${i.metrosTerreno} m² de terreno`);
  return detalles.length > 0 ? `${partes[0]} con ${detalles.join(", ")}.` : `${partes[0]}.`;
}
