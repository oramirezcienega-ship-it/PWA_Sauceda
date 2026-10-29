import { test } from "node:test";
import assert from "node:assert/strict";

function siguienteId(ids: string[]): string {
  const numeros = ids
    .map((id) => parseInt(id.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `COT-${String(max + 1).padStart(3, "0")}`;
}

function calcularMontoBaseRemision(ot: { precio_cliente?: number | null; cotizaciones?: { precio_final?: number | null } | null }): number {
  return Number(ot.cotizaciones?.precio_final || ot.precio_cliente || 0);
}

function calcularMargenCotizacion(total: number, costoProv: number) {
  const utilidad = Math.max(0, total - costoProv);
  const pct = total > 0 ? Math.round(((total - costoProv) / total) * 10000) / 100 : 0;
  return { utilidad, pct };
}

test("siguienteId: genera folios correlativos válidos", () => {
  assert.equal(siguienteId([]), "COT-001");
  assert.equal(siguienteId(["COT-001", "COT-002"]), "COT-003");
  assert.equal(siguienteId(["COT-196", "COT-197"]), "COT-198");
});

test("calcularMontoBaseRemision: toma precio_final de cotización cuando existe", () => {
  const ot = {
    precio_cliente: null,
    cotizaciones: { precio_final: 1385.0 },
  };
  assert.equal(calcularMontoBaseRemision(ot), 1385.0);
});

test("calcularMontoBaseRemision: toma precio_cliente de la OT si no hay cotización", () => {
  const ot = {
    precio_cliente: 750.0,
    cotizaciones: null,
  };
  assert.equal(calcularMontoBaseRemision(ot), 750.0);
});

test("calcularMontoBaseRemision: no cae en 0 cuando alguno de los dos está presente", () => {
  const ot = {
    precio_cliente: 1050.0,
    cotizaciones: { precio_final: 0 },
  };
  assert.equal(calcularMontoBaseRemision(ot), 1050.0);
});

test("calcularMargenCotizacion: calcula utilidad y porcentaje correctamente", () => {
  const m = calcularMargenCotizacion(1385, 1050);
  assert.equal(m.utilidad, 335);
  assert.equal(m.pct, 24.19);
});
