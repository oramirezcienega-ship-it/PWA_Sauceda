import type { Expediente } from "./types";

/**
 * Datos mock en memoria (Incremento 1).
 * NO hay backend ni base de datos todavía: estos expedientes son el
 * estado inicial del tablero. Más adelante se reemplazará por la capa
 * de datos real (API / DB).
 *
 * Fraccionamientos reales de León, Gto., para que el demo se sienta real.
 */
export const EXPEDIENTES_MOCK: Expediente[] = [
  {
    id: "EXP-001",
    cliente: "María Guadalupe Hernández",
    fraccionamiento: "Brisas del Campestre",
    etapa: "nuevo-lead",
    situacion: "Crédito al corriente, busca traspasar por cambio de ciudad.",
    telefono: "477 123 4567",
    valorEstimado: 980000,
    saldoDeuda: 410000,
    ultimoMovimiento: "2026-05-28",
    notas: "Llegó por recomendación. Pide informes por WhatsApp.",
  },
  {
    id: "EXP-002",
    cliente: "José Antonio Ramírez",
    fraccionamiento: "Villas de San Juan",
    etapa: "contactado",
    situacion: "Dos mensualidades atrasadas, quiere evitar embargo.",
    telefono: "477 234 5678",
    valorEstimado: 720000,
    saldoDeuda: 530000,
    ultimoMovimiento: "2026-05-27",
    notas: "Se le explicó el proceso. Agendar visita de valuación.",
  },
  {
    id: "EXP-003",
    cliente: "Laura Patricia Méndez",
    fraccionamiento: "Punta del Este",
    etapa: "valuacion",
    situacion: "Crédito al corriente, inmueble en buen estado.",
    telefono: "477 345 6789",
    valorEstimado: 1250000,
    saldoDeuda: 295000,
    ultimoMovimiento: "2026-05-26",
    notas: "Valuación agendada. Probable buen margen de traspaso.",
  },
  {
    id: "EXP-004",
    cliente: "Carlos Eduardo Torres",
    fraccionamiento: "San Pedro de los Hernández",
    etapa: "oferta",
    situacion: "Interesado en vender rápido, urge liquidez.",
    telefono: "477 456 7890",
    valorEstimado: 845000,
    saldoDeuda: 380000,
    ultimoMovimiento: "2026-05-25",
    notas: "Oferta presentada. En espera de respuesta del cliente.",
  },
  {
    id: "EXP-005",
    cliente: "Ana Sofía Gutiérrez",
    fraccionamiento: "Valle de Señora",
    etapa: "documentos",
    situacion: "Aceptó oferta. Recopilando documentación.",
    telefono: "477 567 8901",
    valorEstimado: 1100000,
    saldoDeuda: 260000,
    ultimoMovimiento: "2026-05-24",
    notas: "Falta comprobante de saldo INFONAVIT y CURP actualizada.",
  },
  {
    id: "EXP-006",
    cliente: "Roberto Carlos Aguilar",
    fraccionamiento: "Joyas del Castillo",
    etapa: "notaria",
    situacion: "Documentación completa, trámite en notaría.",
    telefono: "477 678 9012",
    valorEstimado: 690000,
    saldoDeuda: 175000,
    ultimoMovimiento: "2026-05-23",
    notas: "Cita en notaría confirmada. Pendiente firma de escrituras.",
  },
];
