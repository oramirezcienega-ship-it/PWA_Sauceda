import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarMetrosEnHistorial, sanitizarRespuestaImper } from "../src/lib/ia/imper-reglas.ts";

test("buscarMetrosEnHistorial: extrae metros desde exp.necesidad", () => {
  const exp = { necesidad: "Impermeabilización de 18 m² - Paquete por definir" };
  const m = buscarMetrosEnHistorial([], exp);
  assert.equal(m, 18);
});

test("buscarMetrosEnHistorial: extrae metros desde la marca de comparativa previa", () => {
  const historia = [
    { direccion: "out", texto: "¡Hola! Con gusto te paso opciones" },
    { direccion: "out", texto: "[image:123] Comparativa de impermeabilización para 18 m². Precios sin factura." },
  ];
  const m = buscarMetrosEnHistorial(historia, null);
  assert.equal(m, 18);
});

test("sanitizarRespuestaImper: corrige '3 opciones' a '2 opciones' si m < 25", () => {
  const entrada = "Aquí tienes tu cotización de impermeabilización para tus 18 m² 👇\n¿Cuál de las 3 opciones te interesa más?";
  const salida = sanitizarRespuestaImper(entrada, 18, true);
  assert.ok(salida.includes("2 opciones"), "Debe decir 2 opciones");
  assert.ok(!salida.includes("3 opciones"), "No debe decir 3 opciones");
});

test("sanitizarRespuestaImper: limpia acrílico y corrige cálculos menores a $5,625 para 18 m²", () => {
  const entrada = `Aquí tienes tu cotización para tus 18 m²:
1. Acrílico con malla: $2,970 MXN ($165/m²)
2. Manto Estándar 3.5 mm: $4,050 MXN ($225/m²)
3. Manto Premium 4.0 mm: $4,950 MXN ($275/m²)`;

  const salida = sanitizarRespuestaImper(entrada, 18, true);
  assert.ok(!salida.toLowerCase().includes("acrílico"), "No debe incluir acrílico");
  assert.ok(!salida.includes("$4,050"), "No debe decir $4,050");
  assert.ok(!salida.includes("$4,950"), "No debe decir $4,950");
  assert.ok(salida.includes("$5,625 MXN"), "Debe sustituir por tarifa mínima $5,625");
  assert.ok(salida.includes("$6,875 MXN"), "Debe sustituir por tarifa mínima $6,875");
});

test("sanitizarRespuestaImper: quita dedo apuntador si no se va a enviar imagen", () => {
  const entrada = "Aquí tienes la cotización para tu azotea 👇\nQuedamos a tus órdenes.";
  const salida = sanitizarRespuestaImper(entrada, 50, false);
  assert.ok(!salida.includes("👇"), "No debe quedar el dedo apuntando al vacío");
});
