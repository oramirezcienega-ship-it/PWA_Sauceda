import test from "node:test";
import assert from "node:assert/strict";
import { inferirPausaDesdeTexto, calcularFechaRetomar } from "../src/lib/pausa-leads.ts";

test("inferirPausaDesdeTexto: detecta 'Una semana más por favor..'", () => {
  const base = "2026-10-29";
  const res = inferirPausaDesdeTexto("Una semana más por favor..", base);
  assert.equal(res.detectado, true);
  assert.equal(res.dias, 7);
  assert.equal(res.fecha, "2026-11-05");
  assert.match(res.motivo, /semana/i);
});

test("inferirPausaDesdeTexto: detecta variantes de semana", () => {
  const base = "2026-10-29";
  assert.equal(inferirPausaDesdeTexto("la proxima semana te aviso", base).fecha, "2026-11-05");
  assert.equal(inferirPausaDesdeTexto("esperame una semana", base).fecha, "2026-11-05");
  assert.equal(inferirPausaDesdeTexto("dame 1 semana", base).fecha, "2026-11-05");
  assert.equal(inferirPausaDesdeTexto("la semana que viene", base).fecha, "2026-11-05");
});

test("inferirPausaDesdeTexto: detecta 15 días / dos semanas / quincena", () => {
  const base = "2026-10-29";
  const res = inferirPausaDesdeTexto("en 15 dias lo checamos", base);
  assert.equal(res.detectado, true);
  assert.equal(res.dias, 14);
  assert.equal(res.fecha, "2026-11-12");
});

test("inferirPausaDesdeTexto: detecta 1 mes / próximo mes", () => {
  const base = "2026-10-29";
  const res = inferirPausaDesdeTexto("el proximo mes", base);
  assert.equal(res.detectado, true);
  assert.equal(res.dias, 30);
  assert.equal(res.fecha, "2026-11-28");
});

test("inferirPausaDesdeTexto: detecta mes específico como diciembre", () => {
  const base = "2026-10-29";
  const res = inferirPausaDesdeTexto("hasta diciembre", base);
  assert.equal(res.detectado, true);
  assert.equal(res.fecha, "2026-12-01");
});

test("calcularFechaRetomar: no descuenta anticipación para fecha de corto plazo (1 semana)", () => {
  // Si se le pasa fecha de 1 semana ("2026-11-05"), debe mantenerse "2026-11-05"
  const res = calcularFechaRetomar("2026-11-05");
  assert.equal(res, "2026-11-05");
});

test("calcularFechaRetomar: procesa texto en lenguaje natural 'una semana más'", () => {
  const res = calcularFechaRetomar("una semana más");
  assert.match(res, /^\d{4}-\d{2}-\d{2}$/);
});
