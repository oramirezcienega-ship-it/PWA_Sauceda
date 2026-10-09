import { test } from "node:test";
import assert from "node:assert/strict";
import { validarCompuertaEtapa } from "../src/lib/asesoria/compuerta.ts";
import { normalizarPerfil, normalizarZonas, aMonto, poderDeCompra } from "../src/lib/asesoria/perfil.ts";

const base = { tipoNegocio: "asesoria_compra", montoCreditoPrecalificado: 850000, busquedaZonas: ["Los Castillos"] };

test("compuerta: con monto y zonas puede pasar a búsqueda", () => {
  assert.deepEqual(validarCompuertaEtapa(base, "busqueda"), { ok: true });
});

test("compuerta: sin monto precalificado no pasa a búsqueda", () => {
  const r = validarCompuertaEtapa({ ...base, montoCreditoPrecalificado: null }, "busqueda");
  assert.equal(r.ok, false);
  assert.match((r as { mensaje: string }).mensaje, /monto de crédito precalificado/);
});

test("compuerta: sin zonas (o solo vacías) no pasa a búsqueda", () => {
  assert.equal(validarCompuertaEtapa({ ...base, busquedaZonas: [] }, "busqueda").ok, false);
  assert.equal(validarCompuertaEtapa({ ...base, busquedaZonas: ["  "] }, "busqueda").ok, false);
  assert.equal(validarCompuertaEtapa({ ...base, busquedaZonas: null }, "busqueda").ok, false);
});

test("compuerta: tampoco deja saltar directo a negociación", () => {
  assert.equal(validarCompuertaEtapa({ ...base, montoCreditoPrecalificado: 0 }, "negociacion").ok, false);
});

test("compuerta: otras etapas y otros tipos de negocio no se afectan", () => {
  assert.equal(validarCompuertaEtapa({ ...base, montoCreditoPrecalificado: null }, "precalificacion").ok, true);
  assert.equal(validarCompuertaEtapa({ tipoNegocio: "traspaso_compra" }, "busqueda").ok, true);
  assert.equal(validarCompuertaEtapa({ tipoNegocio: "solo_tramite" }, "negociacion").ok, true);
});

test("compuerta: si ya tiene casa, búsqueda y negociación no aplican", () => {
  assert.equal(validarCompuertaEtapa({ ...base, yaTieneCasa: true }, "busqueda").ok, false);
  assert.equal(validarCompuertaEtapa({ ...base, yaTieneCasa: true, montoCreditoPrecalificado: null }, "expediente").ok, true);
});

test("perfil: montos con formato MXN", () => {
  assert.equal(aMonto("$1,250,000"), 1250000);
  assert.equal(aMonto(""), null);
  assert.equal(aMonto(null), null);
  assert.equal(aMonto(900000), 900000);
});

test("perfil: zonas sin vacías ni repetidas (sin importar mayúsculas)", () => {
  assert.deepEqual(normalizarZonas("Centro,  los castillos ; Los Castillos\n , "), ["Centro", "los castillos"]);
  assert.deepEqual(normalizarZonas(["A", "a", " B "]), ["A", "B"]);
});

test("perfil: valida rango, recámaras, fecha y fuente", () => {
  const r = normalizarPerfil({
    busquedaPrecioMin: "$900,000",
    busquedaPrecioMax: "$800,000",
    busquedaRecamarasMin: "2.5",
    precalificacionFecha: "08/10/2026",
    precalificacionFuente: "infonavitt",
  });
  assert.equal(r.ok, false);
  assert.equal((r as { errores: string[] }).errores.length, 4);
});

test("perfil: normaliza un perfil válido y calcula el poder de compra", () => {
  const r = normalizarPerfil({
    montoCreditoPrecalificado: "$850,000",
    montoAhorroPropio: "$50,000",
    busquedaZonas: "Villas de San Juan, Centro",
    busquedaPrecioMin: "",
    busquedaPrecioMax: "$950,000",
    busquedaRecamarasMin: "2",
    precalificacionFecha: "2026-10-08",
    precalificacionFuente: "INFONAVIT",
    busquedaRequisitos: "  planta baja ",
  });
  assert.equal(r.ok, true);
  const p = (r as { perfil: any }).perfil;
  assert.equal(p.precalificacionFuente, "infonavit");
  assert.equal(p.busquedaPrecioMin, null);
  assert.equal(p.busquedaRecamarasMin, 2);
  assert.equal(p.busquedaRequisitos, "planta baja");
  assert.equal(p.yaTieneCasa, false);
  assert.equal(poderDeCompra(p), 900000);
});
