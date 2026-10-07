/** Constantes y tipos del portal del asesor (seguros para el navegador). */

export const ESTADOS_RETRO_COORDINACION = {
  realizada: "Se realizó",
  no_realizada: "No se realizó",
  reprogramar: "Hay que reprogramar",
} as const;

export const ESTADOS_RETRO_LEAD = {
  contactado: "Ya lo contacté",
  no_contesta: "No contesta",
  cotizado: "Ya cotizado",
  cerrado: "Cerrado / vendido",
  no_interesa: "No le interesa",
  no_puedo_atender: "No lo puedo atender",
} as const;

export type EstadoRetroCoordinacion = keyof typeof ESTADOS_RETRO_COORDINACION;
export type EstadoRetroLead = keyof typeof ESTADOS_RETRO_LEAD;

export const ETIQUETA_ESTADO_COORDINACION: Record<string, string> = {
  propuesta_enviada: "Esperando respuesta de asesores",
  evaluando: "Esperando respuesta de asesores",
  enviado_cliente: "Opciones enviadas al cliente",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
};

export interface Retroalimentacion {
  id: string;
  asesorId: string;
  asesorNombre: string;
  estado: string;
  estadoLabel: string;
  clientePresente: boolean | null;
  siguientePaso: string;
  siguientePasoFecha: string | null;
  comentario: string;
  createdAt: string;
}

export interface OpcionHorario {
  id: string;
  label: string;
  fecha: string;
}

export interface CoordinacionPortal {
  id: string;
  clienteNombre: string;
  clienteTelefono: string;
  servicioNombre: string;
  ubicacion: string;
  fraccionamiento: string;
  detalles: string;
  estado: string;
  estadoLabel: string;
  asesores: Array<{ id: string; nombre: string; respondio: boolean }>;
  opciones: OpcionHorario[];
  opcionesValidadas: string[];
  /** Votos del asesor del portal (en la vista del CRM queda vacío). */
  misVotos: Record<string, boolean>;
  puedeVotar: boolean;
  horarioConfirmado: string | null;
  fechaInspeccion: string | null;
  createdAt: string;
  retro: Retroalimentacion[];
}

export interface LeadCompartidoPortal {
  id: string;
  clienteNombre: string;
  telefono: string;
  nota: string;
  resumen: string;
  asesorId: string;
  asesorNombre: string;
  enviadoPor: string;
  estadoEnvio: string;
  createdAt: string;
  retro: Retroalimentacion[];
}

export interface AsesorPortal {
  id: string;
  nombre: string;
}
