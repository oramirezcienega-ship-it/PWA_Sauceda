import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularMatch,
  rankearInmuebles,
  normalizarCredito,
  aceptaCredito,
  type InmuebleMatch,
  type PerfilMatch,
} from "../src/lib/asesoria/match.ts";

const AHORA = new Date("2026-10-09T12:00:00Z");
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86400000).toISOString();

const PERFIL: PerfilMatch = {
  busquedaZonas: ["Villas de San Juan", "Los Castillos"],
  busquedaPrecioMin: 600000,
  busquedaPrecioMax: 900000,
  busquedaRecamarasMin: 2,
  tipoCredito: "INFONAVIT",
};

const BASE: InmuebleMatch = {
  origen: "aliado",
  precio: 600000,
  acepta_credito: ["infonavit", "bancario"],
  fraccionamiento: "Villas de San Juan",
  recamaras: 3,
  tiene_escritura: true,
  tiene_adeudos: false,
  tiene_litigios: false,
  fotos: ["1", "2", "3", "4", "5"],
  estatus: "disponible",
  created_at: hace(3),
};

// ---------------- Filtros duros ----------------

test("filtro: precio hasta el máximo +5% entra; arriba queda fuera", () => {
  assert.equal(calcularMatch(PERFIL, { ...BASE, precio: 945000 }, AHORA).cumple, true);
  assert.equal(calcularMatch(PERFIL, { ...BASE, precio: 945001 }, AHORA).cumple, false);
});

test("filtro: sin precio máximo usa el poder de compra (crédito + ahorro)", () => {
  const perfil = { ...PERFIL, busquedaPrecioMax: null, montoCreditoPrecalificado: 800000, montoAhorroPropio: 100000 };
  assert.equal(calcularMatch(perfil, { ...BASE, precio: 945000 }, AHORA).cumple, true);
  assert.equal(calcularMatch(perfil, { ...BASE, precio: 950000 }, AHORA).cumple, false);
});

test("filtro: el crédito del cliente debe estar en acepta_credito", () => {
  const r = calcularMatch(PERFIL, { ...BASE, acepta_credito: ["bancario", "contado"] }, AHORA);
  assert.equal(r.cumple, false);
  assert.ok(r.razones.some((x) => x.includes("INFONAVIT")));
  // FOVISSSTE desde la fuente de precalificación
  const fov = { ...PERFIL, tipoCredito: "", precalificacionFuente: "fovissste" };
  assert.equal(calcularMatch(fov, BASE, AHORA).cumple, false);
  assert.equal(calcularMatch(fov, { ...BASE, acepta_credito: ["FOVISSSTE"] }, AHORA).cumple, true);
});

test("filtro: si el inmueble no indica créditos no se excluye, pero se avisa", () => {
  const r = calcularMatch(PERFIL, { ...BASE, acepta_credito: null }, AHORA);
  assert.equal(r.cumple, true);
  assert.ok(r.razones.some((x) => x.startsWith("⚠")));
});

test("filtro: litigios y estatus distinto de disponible quedan fuera", () => {
  assert.equal(calcularMatch(PERFIL, { ...BASE, tiene_litigios: true }, AHORA).cumple, false);
  for (const estatus of ["por_validar", "apartado", "vendido", "descartado"]) {
    assert.equal(calcularMatch(PERFIL, { ...BASE, estatus }, AHORA).cumple, false, estatus);
  }
  // litigios null (sin dato) no excluye
  assert.equal(calcularMatch(PERFIL, { ...BASE, tiene_litigios: null }, AHORA).cumple, true);
});

test("créditos: normalización y cofinavit", () => {
  assert.equal(normalizarCredito("Crédito Infonavit tradicional"), "infonavit");
  assert.equal(normalizarCredito("COFINAVIT"), "cofinavit");
  assert.equal(normalizarCredito("Hipotecario bancario"), "bancario");
  assert.equal(normalizarCredito("algo raro"), null);
  assert.equal(aceptaCredito(["infonavit", "bancario"], "cofinavit"), true);
  assert.equal(aceptaCredito(["infonavit"], "cofinavit"), false);
  assert.equal(aceptaCredito([], "infonavit"), null);
});

// ---------------- Score ----------------

test("score: el inmueble ideal suma 100", () => {
  const r = calcularMatch(PERFIL, BASE, AHORA);
  assert.equal(r.cumple, true);
  assert.equal(r.score, 100);
});

test("score: zona exacta vale 40 (sin importar acentos ni mayúsculas)", () => {
  const sinZona = calcularMatch(PERFIL, { ...BASE, fraccionamiento: "Centro" }, AHORA);
  assert.equal(sinZona.score, 60);
  const acentos = calcularMatch({ ...PERFIL, busquedaZonas: ["los castillos"] }, { ...BASE, fraccionamiento: null, colonia: "Los Castíllos" }, AHORA);
  assert.equal(acentos.score, 100);
});

test("score: el precio decrece hacia el tope (25 en el mínimo, 12.5 en el máximo, 0 fuera)", () => {
  const enMinimo = calcularMatch(PERFIL, { ...BASE, precio: 600000 }, AHORA).score;
  const enMedio = calcularMatch(PERFIL, { ...BASE, precio: 750000 }, AHORA).score;
  const enTope = calcularMatch(PERFIL, { ...BASE, precio: 900000 }, AHORA).score;
  const tolerancia = calcularMatch(PERFIL, { ...BASE, precio: 930000 }, AHORA).score;
  const debajo = calcularMatch(PERFIL, { ...BASE, precio: 500000 }, AHORA).score;
  assert.equal(enMinimo, 100);
  assert.equal(enMedio, 93.8); // 75 + 18.75
  assert.equal(enTope, 87.5);
  assert.equal(tolerancia, 75);
  assert.equal(debajo, 75);
});

test("score: recámaras, escritura/adeudos, fotos y antigüedad", () => {
  assert.equal(calcularMatch(PERFIL, { ...BASE, recamaras: 1 }, AHORA).score, 85);
  assert.equal(calcularMatch(PERFIL, { ...BASE, recamaras: null }, AHORA).score, 85);
  assert.equal(calcularMatch(PERFIL, { ...BASE, tiene_adeudos: true }, AHORA).score, 90);
  assert.equal(calcularMatch(PERFIL, { ...BASE, tiene_escritura: null }, AHORA).score, 90);
  assert.equal(calcularMatch(PERFIL, { ...BASE, fotos: ["1", "2", "3", "4"] }, AHORA).score, 95);
  assert.equal(calcularMatch(PERFIL, { ...BASE, created_at: hace(30) }, AHORA).score, 95);
  assert.equal(calcularMatch(PERFIL, { ...BASE, created_at: hace(29) }, AHORA).score, 100);
});

// ---------------- Ranking y prioridad de origen ----------------

test("ranking: excluye los que no cumplen y ordena por score", () => {
  const lista = [
    { ...BASE, id: "barato-lejos", fraccionamiento: "Centro" },
    { ...BASE, id: "litigio", tiene_litigios: true },
    { ...BASE, id: "ideal" },
  ];
  const r = rankearInmuebles(PERFIL, lista, AHORA);
  assert.deepEqual(r.map((x) => x.inmueble.id), ["ideal", "barato-lejos"]);
});

test("ranking: al empatar gana propio > aliado > portal", () => {
  const lista = [
    { ...BASE, id: "portal", origen: "portal" as const },
    { ...BASE, id: "aliado", origen: "aliado" as const },
    { ...BASE, id: "propio", origen: "propio" as const },
  ];
  const r = rankearInmuebles(PERFIL, lista, AHORA);
  assert.deepEqual(r.map((x) => x.inmueble.id), ["propio", "aliado", "portal"]);
  // Un score mayor gana aunque el origen tenga menos prioridad
  const r2 = rankearInmuebles(PERFIL, [{ ...BASE, id: "propio", origen: "propio" as const, fotos: [] }, { ...BASE, id: "portal", origen: "portal" as const }], AHORA);
  assert.deepEqual(r2.map((x) => x.inmueble.id), ["portal", "propio"]);
});
