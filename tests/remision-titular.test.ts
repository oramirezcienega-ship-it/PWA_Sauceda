import test from "node:test";
import assert from "node:assert/strict";
import { nombreTitularRemision, personaRecibeRemision } from "../src/lib/remision-titular.ts";

test("nombreTitularRemision: expande primer nombre a nombre completo si coincide", () => {
  const titular = nombreTitularRemision(
    "remision",
    { nombreCliente: "Marco" },
    "Marco Antonio Arredondo Zariñana"
  );
  assert.equal(titular, "Marco Antonio Arredondo Zariñana");
});

test("nombreTitularRemision: respeta nombre explícito distinto del contacto", () => {
  const titular = nombreTitularRemision(
    "remision",
    { nombreCliente: "Constructora Diamante SA de CV" },
    "Marco Antonio Arredondo Zariñana"
  );
  assert.equal(titular, "Constructora Diamante SA de CV");
});

test("nombreTitularRemision: usa razón social para factura", () => {
  const titular = nombreTitularRemision(
    "factura",
    { razonSocial: "Comercializadora Bajío SA de CV", nombreCliente: "Marco" },
    "Marco Antonio"
  );
  assert.equal(titular, "Comercializadora Bajío SA de CV");
});

test("nombreTitularRemision: fallback a contacto si no hay capturado", () => {
  const titular = nombreTitularRemision("remision", {}, "Marco Antonio Arredondo Zariñana");
  assert.equal(titular, "Marco Antonio Arredondo Zariñana");
});

test("personaRecibeRemision: expande primer nombre si coincide con el contacto", () => {
  const recibe = personaRecibeRemision("Marco", "Marco Antonio Arredondo Zariñana");
  assert.equal(recibe, "Marco Antonio Arredondo Zariñana");
});

test("personaRecibeRemision: respeta persona distinta (ej. encargado o familiar)", () => {
  const recibe = personaRecibeRemision("Juan Pérez (Arquitecto)", "Marco Antonio Arredondo Zariñana");
  assert.equal(recibe, "Juan Pérez (Arquitecto)");
});
