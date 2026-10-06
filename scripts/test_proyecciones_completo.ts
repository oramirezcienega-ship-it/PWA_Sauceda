import {
  proyectar,
  LineaPlan,
  SupuestoMes,
  FijoPlan,
  normalizarPorcentaje
} from "../src/lib/finanzas/proyeccion";

console.log("=== INICIANDO TEST COMPLETO DE PROYECCIONES FINANCIERAS ===");

// 1. Test normalizarPorcentaje
console.log("Test normalizarPorcentaje:");
console.assert(normalizarPorcentaje(20) === 0.20, "20 debe ser 0.20");
console.assert(normalizarPorcentaje(0.20) === 0.20, "0.20 debe ser 0.20");
console.assert(normalizarPorcentaje(100) === 1.0, "100 debe ser 1.0");
console.assert(normalizarPorcentaje(0) === 0, "0 debe ser 0");
console.log("✓ normalizarPorcentaje OK");

// 2. Test horizonte extendido a 2027 (15 meses: 2026-10 a 2027-12)
const meses: string[] = [];
for (let y = 2026; y <= 2027; y++) {
  const mStart = y === 2026 ? 10 : 1;
  const mEnd = 12;
  for (let m = mStart; m <= mEnd; m++) {
    meses.push(`${y}-${String(m).padStart(2, "0")}-01`);
  }
}
console.log(`Horizonte: ${meses.length} meses (${meses[0]} al ${meses[meses.length - 1]})`);
console.assert(meses.length === 15, "Deben ser 15 meses");

// Línea A: Embudo (Construcción - Impermeabilización)
// 50 leads/mes, 30% a cotización, 20% cierre => 3 ops/mes
// Ticket: $25,000, Margen: 40% ($10,000 utilidad bruta por op), Comisión: 5% ($1,250)
// Marketing: $3,000/mes ($60 por lead)
// Contribución: 3 * ($25,000 * 0.40 - $25,000 * 0.05) - $3,000 = 3 * $8,750 - $3,000 = $26,250 - $3,000 = $23,250/mes
const lineaEmbudo: LineaPlan = {
  id: "l-imper",
  escenario_id: "esc-2027",
  business_unit_id: "bu-construye",
  business_unit_nombre: "Construye",
  nombre: "Impermeabilización",
  tipo_negocio: "construccion-impermeabilizacion",
  origen: "existente",
  modelo: "embudo",
  esquema_cobro: [{ pct: 1, desfase_meses: 0 }],
  activo: true,
  orden: 1
};

// Línea B: Manual (Bienes Raíces - Trámite Infonavit)
// 2 ops/mes, Ticket $15,000, Margen 56.67%, Comisión 0%
// Esquema: 50% mes 0, 50% mes +1
const lineaManual: LineaPlan = {
  id: "l-tramite",
  escenario_id: "esc-2027",
  business_unit_id: "bu-br",
  business_unit_nombre: "Bienes Raíces",
  nombre: "Trámite INFONAVIT",
  tipo_negocio: "solo_tramite",
  origen: "nuevo",
  modelo: "manual",
  esquema_cobro: [
    { pct: 0.5, desfase_meses: 0 },
    { pct: 0.5, desfase_meses: 1 }
  ],
  activo: true,
  orden: 2
};

const supuestos: SupuestoMes[] = [];
meses.forEach((m) => {
  supuestos.push({
    linea_id: "l-imper",
    mes: m,
    leads: 50,
    pct_a_cotizacion: 0.30,
    pct_cierre: 0.20,
    ticket_promedio: 25000,
    margen_pct: 0.40,
    pct_comision_asesor: 0.05,
    gasto_ads: 3000,
    fuente: "promedio_real"
  });

  supuestos.push({
    linea_id: "l-tramite",
    mes: m,
    operaciones_manual: 2,
    ticket_promedio: 15000,
    margen_pct: 8500 / 15000,
    pct_comision_asesor: 0,
    fuente: "manual"
  });
});

const fijos: FijoPlan[] = [];
meses.forEach((m) => {
  fijos.push({
    escenario_id: "esc-2027",
    business_unit_id: "bu-construye",
    business_unit_nombre: "Construye",
    concepto: "Nómina Operativa",
    linea_pnl: "opex_nomina",
    mes: m,
    monto: 15000
  });

  fijos.push({
    escenario_id: "esc-2027",
    business_unit_id: "bu-br",
    business_unit_nombre: "Bienes Raíces",
    concepto: "Servicios y Software",
    linea_pnl: "opex_servicios",
    mes: m,
    monto: 3000
  });
});

const res = proyectar([lineaEmbudo, lineaManual], supuestos, fijos, 10000);

console.log("\nResultados Proyección 2027:");
console.log(`Meses procesados: ${res.meses.length}`);
console.log(`Ingreso total consolidado: $${res.kpis.ingreso_total.toLocaleString()} MXN`);
console.log(`Utilidad operativa consolidada: $${res.kpis.utilidad_operativa_total.toLocaleString()} MXN`);
console.log(`Margen operativo: ${res.kpis.margen_pct}%`);
console.log(`Punto de equilibrio: ${res.kpis.punto_equilibrio_mes}`);
console.log(`Caja mínima: $${res.kpis.caja_minima.toLocaleString()} MXN`);
console.log(`Saldo caja final: $${res.kpis.saldo_caja_final.toLocaleString()} MXN`);

// Validaciones
console.assert(res.meses.length === 15, "Deben ser 15 meses en la proyección");
console.assert(res.kpis.ingreso_total > 0, "Ingreso total debe ser positivo");
console.assert(res.kpis.utilidad_operativa_total > 0, "Utilidad debe ser positiva");
console.assert(res.por_unidad["bu-construye"] !== undefined, "Debe existir unidad Construye");
console.assert(res.por_unidad["bu-br"] !== undefined, "Debe existir unidad Bienes Raíces");

console.log("\n✅ TODOS LOS TESTS DE PROYECCIÓN 2027 PASARON EXITOSAMENTE!");
