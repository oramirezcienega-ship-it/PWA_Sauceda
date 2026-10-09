import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ETAPAS_ASESORIA_COMPRA_OT as ETAPAS,
  etapasAplicables,
  etapaVecina,
  normalizarEtapaActual,
} from "../src/lib/asesoria/etapas-ot.ts";

const claves = (xs: { clave: string }[]) => xs.map((x) => x.clave);

test("comprador sin casa: todas las etapas en orden", () => {
  assert.deepEqual(claves(etapasAplicables(ETAPAS, { ya_tiene_casa: false })), [
    "precalificacion", "busqueda", "negociacion", "expediente", "escrituracion", "entrega", "cerrada",
  ]);
});

test("ya tiene casa: se saltan búsqueda y negociación", () => {
  const a = etapasAplicables(ETAPAS, { ya_tiene_casa: true });
  assert.deepEqual(claves(a), ["precalificacion", "expediente", "escrituracion", "entrega", "cerrada"]);
  assert.equal(etapaVecina(a, "precalificacion", 1)?.clave, "expediente");
  assert.equal(etapaVecina(a, "expediente", -1)?.clave, "precalificacion");
});

test("vecinas en los extremos", () => {
  const a = etapasAplicables(ETAPAS, {});
  assert.equal(etapaVecina(a, "precalificacion", -1), null);
  assert.equal(etapaVecina(a, "cerrada", 1), null);
  assert.equal(etapaVecina(a, null, 1)?.clave, "precalificacion");
});

test("si la etapa actual deja de aplicar, avanza a la siguiente que sí aplica", () => {
  const conCasa = etapasAplicables(ETAPAS, { ya_tiene_casa: true });
  assert.equal(normalizarEtapaActual(ETAPAS, conCasa, "busqueda"), "expediente");
  assert.equal(normalizarEtapaActual(ETAPAS, conCasa, "negociacion"), "expediente");
  assert.equal(normalizarEtapaActual(ETAPAS, conCasa, "escrituracion"), "escrituracion");
  assert.equal(normalizarEtapaActual(ETAPAS, conCasa, null), "precalificacion");
});
