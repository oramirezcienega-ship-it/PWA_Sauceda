import { proyectar, LineaPlan, SupuestoMes, FijoPlan } from "../src/lib/finanzas/proyeccion";

// 1. Definir líneas para Base Q4 2026
const lineas: LineaPlan[] = [
  {
    id: "linea-casa-compartida",
    escenario_id: "esc-q4",
    business_unit_id: "bu-br",
    business_unit_nombre: "Bienes Raíces",
    nombre: "Casa compartida + trámite",
    tipo_negocio: "traspaso_compra",
    origen: "nuevo",
    modelo: "manual",
    esquema_cobro: [
      { pct: 0.5, desfase_meses: 0 },
      { pct: 0.5, desfase_meses: 1 }
    ],
    activo: true,
    orden: 1
  },
  {
    id: "linea-casa-exclusiva",
    escenario_id: "esc-q4",
    business_unit_id: "bu-br",
    business_unit_nombre: "Bienes Raíces",
    nombre: "Casa propia en exclusiva + trámite",
    tipo_negocio: "promocion_venta",
    origen: "nuevo",
    modelo: "manual",
    esquema_cobro: [{ pct: 1, desfase_meses: 0 }],
    activo: true,
    orden: 2
  },
  {
    id: "linea-solo-tramite",
    escenario_id: "esc-q4",
    business_unit_id: "bu-br",
    business_unit_nombre: "Bienes Raíces",
    nombre: "Solo trámite INFONAVIT",
    tipo_negocio: "solo_tramite",
    origen: "nuevo",
    modelo: "manual",
    esquema_cobro: [
      { pct: 0.5, desfase_meses: 0 },
      { pct: 0.5, desfase_meses: 1 }
    ],
    activo: true,
    orden: 3
  },
  {
    id: "linea-remodelacion",
    escenario_id: "esc-q4",
    business_unit_id: "bu-br",
    business_unit_nombre: "Bienes Raíces",
    nombre: "Remodelación (venta cruzada, unidad Construye)",
    tipo_negocio: "construccion-remodelacion",
    origen: "nuevo",
    modelo: "manual",
    esquema_cobro: [{ pct: 1, desfase_meses: 0 }],
    activo: true,
    orden: 4
  }
];

// Meses Q4 2026: oct, nov, dic
// Casa compartida: ticket $26,000, costo directo $6,500 (25%), comisión asesor $4,400 (16.9230769%), ops: 0.6 / 0.9 / 1.5
// Margen directo % = 1 - (6500 / 26000) = 0.75 (75%)
// Comision asesor % = 4400 / 26000 = 0.16923076923
// Utilidad bruta por op = 26000 - 6500 - 4400 = 15100
const supuestos: SupuestoMes[] = [
  // Casa compartida (0.6, 0.9, 1.5)
  {
    linea_id: "linea-casa-compartida",
    mes: "2026-10-01",
    operaciones_manual: 0.6,
    ticket_promedio: 26000,
    margen_pct: 0.75,
    pct_comision_asesor: 4400 / 26000,
    fuente: "manual"
  },
  {
    linea_id: "linea-casa-compartida",
    mes: "2026-11-01",
    operaciones_manual: 0.9,
    ticket_promedio: 26000,
    margen_pct: 0.75,
    pct_comision_asesor: 4400 / 26000,
    fuente: "manual"
  },
  {
    linea_id: "linea-casa-compartida",
    mes: "2026-12-01",
    operaciones_manual: 1.5,
    ticket_promedio: 26000,
    margen_pct: 0.75,
    pct_comision_asesor: 4400 / 26000,
    fuente: "manual"
  },

  // Casa propia en exclusiva (0, 0, 0)
  {
    linea_id: "linea-casa-exclusiva",
    mes: "2026-10-01",
    operaciones_manual: 0,
    ticket_promedio: 37000,
    margen_pct: 1 - 15300 / 37000,
    pct_comision_asesor: 0,
    fuente: "manual"
  },
  {
    linea_id: "linea-casa-exclusiva",
    mes: "2026-11-01",
    operaciones_manual: 0,
    ticket_promedio: 37000,
    margen_pct: 1 - 15300 / 37000,
    pct_comision_asesor: 0,
    fuente: "manual"
  },
  {
    linea_id: "linea-casa-exclusiva",
    mes: "2026-12-01",
    operaciones_manual: 0,
    ticket_promedio: 37000,
    margen_pct: 1 - 15300 / 37000,
    pct_comision_asesor: 0,
    fuente: "manual"
  },

  // Solo trámite INFONAVIT (0.4, 0.6, 1.0)
  // ticket $15,000, costo $6,500, neto $8,500 -> margen_pct = 1 - (6500 / 15000) = 8500 / 15000
  {
    linea_id: "linea-solo-tramite",
    mes: "2026-10-01",
    operaciones_manual: 0.4,
    ticket_promedio: 15000,
    margen_pct: 8500 / 15000,
    pct_comision_asesor: 0,
    fuente: "manual"
  },
  {
    linea_id: "linea-solo-tramite",
    mes: "2026-11-01",
    operaciones_manual: 0.6,
    ticket_promedio: 15000,
    margen_pct: 8500 / 15000,
    pct_comision_asesor: 0,
    fuente: "manual"
  },
  {
    linea_id: "linea-solo-tramite",
    mes: "2026-12-01",
    operaciones_manual: 1.0,
    ticket_promedio: 15000,
    margen_pct: 8500 / 15000,
    pct_comision_asesor: 0,
    fuente: "manual"
  },

  // Remodelación (0.2, 0.3, 0.5)
  // ticket $12,000, costos $2,400 (asesor 20%), neto $9,600
  {
    linea_id: "linea-remodelacion",
    mes: "2026-10-01",
    operaciones_manual: 0.2,
    ticket_promedio: 12000,
    margen_pct: 1, // costo directo 0, todo es comision asesor 20%
    pct_comision_asesor: 0.20,
    fuente: "manual"
  },
  {
    linea_id: "linea-remodelacion",
    mes: "2026-11-01",
    operaciones_manual: 0.3,
    ticket_promedio: 12000,
    margen_pct: 1,
    pct_comision_asesor: 0.20,
    fuente: "manual"
  },
  {
    linea_id: "linea-remodelacion",
    mes: "2026-12-01",
    operaciones_manual: 0.5,
    ticket_promedio: 12000,
    margen_pct: 1,
    pct_comision_asesor: 0.20,
    fuente: "manual"
  }
];

// Gastos Bienes Raíces Q4: anuncios $1,500/mes + otros $1,500/mes
const fijos: FijoPlan[] = [
  {
    escenario_id: "esc-q4",
    business_unit_id: "bu-br",
    business_unit_nombre: "Bienes Raíces",
    concepto: "Anuncios Meta Ads Bienes Raíces",
    linea_pnl: "costo_marketing",
    mes: "2026-10-01",
    monto: 1500
  },
  {
    escenario_id: "esc-q4",
    business_unit_id: "bu-br",
    business_unit_nombre: "Bienes Raíces",
    concepto: "Otros Gastos Fijos Operativos",
    linea_pnl: "opex_otros",
    mes: "2026-10-01",
    monto: 1500
  },
  {
    escenario_id: "esc-q4",
    business_unit_id: "bu-br",
    business_unit_nombre: "Bienes Raíces",
    concepto: "Anuncios Meta Ads Bienes Raíces",
    linea_pnl: "costo_marketing",
    mes: "2026-11-01",
    monto: 1500
  },
  {
    escenario_id: "esc-q4",
    business_unit_id: "bu-br",
    business_unit_nombre: "Bienes Raíces",
    concepto: "Otros Gastos Fijos Operativos",
    linea_pnl: "opex_otros",
    mes: "2026-11-01",
    monto: 1500
  },
  {
    escenario_id: "esc-q4",
    business_unit_id: "bu-br",
    business_unit_nombre: "Bienes Raíces",
    concepto: "Anuncios Meta Ads Bienes Raíces",
    linea_pnl: "costo_marketing",
    mes: "2026-12-01",
    monto: 1500
  },
  {
    escenario_id: "esc-q4",
    business_unit_id: "bu-br",
    business_unit_nombre: "Bienes Raíces",
    concepto: "Otros Gastos Fijos Operativos",
    linea_pnl: "opex_otros",
    mes: "2026-12-01",
    monto: 1500
  }
];

const res = proyectar(lineas, supuestos, fijos);

console.log("=== RESULTADOS BASE Q4 2026 ===");
console.log("Ingreso bruto total:", res.consolidado.total.ingreso_bruto);
console.log("Utilidad bruta total (margen):", res.consolidado.total.utilidad_bruta);
console.log("Gastos fijos totales:", res.consolidado.total.gastos_fijos);
console.log("Utilidad operativa total:", res.consolidado.total.utilidad_operativa);
console.log("Margen operativo %:", res.consolidado.total.margen_operativo_pct);
console.log("Cobros caja total:", res.consolidado.total.cobro_caja);
console.log("Salidas caja total:", res.consolidado.total.salidas_caja);
console.log("Flujo neto total:", res.consolidado.total.flujo_neto_caja);

const okIngreso = Math.abs(res.consolidado.total.ingreso_bruto - 120000) < 1;
const okMargen = Math.abs(res.consolidado.total.utilidad_bruta - 71900) < 1;
const okGastos = Math.abs(res.consolidado.total.gastos_fijos - 9000) < 1;
const okUtilidad = Math.abs(res.consolidado.total.utilidad_operativa - 62900) < 1;

if (okIngreso && okMargen && okGastos && okUtilidad) {
  console.log("✅ TEST PASSED: Todas las cifras coinciden exactamente con el Business Case!");
  process.exit(0);
} else {
  console.error("❌ TEST FAILED: Cifras no coinciden.");
  console.error({ okIngreso, okMargen, okGastos, okUtilidad });
  process.exit(1);
}
