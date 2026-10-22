import { test } from "node:test";
import assert from "node:assert/strict";
import { armarConvenio, calcularComisionAliado, siguienteFolioConvenio } from "../src/lib/asesoria/convenio.ts";

const PLANTILLAS = {
  titulo: "CONVENIO DE COMISIÓN COMPARTIDA",
  partes: "Entre {prestador}, con domicilio en {prestador_domicilio}, y {aliado}, representado por {aliado_contacto}.",
  comision: "EL ALIADO recibirá el {pct}% de los honorarios del lado comprador.",
  no_contacto: "EL ALIADO no contactará directamente a los clientes presentados por SAUCEDA.",
  vigencia: "12 meses.",
  confidencialidad: "Confidencialidad de datos personales.",
  firma: "León, Gto., {fecha}.",
  objeto: "",
};

test("convenio: sustituye datos y respeta el orden; omite cláusulas vacías", () => {
  const c = armarConvenio(PLANTILLAS, {
    prestador: "SAUCEDA",
    prestadorDomicilio: "Lago de Sayula 214",
    aliado: "Inmobiliaria Norte",
    aliadoContacto: "Laura Pérez",
    pct: 50,
    fecha: "9 de octubre de 2026",
  });
  assert.equal(c.titulo, "CONVENIO DE COMISIÓN COMPARTIDA");
  assert.deepEqual(c.clausulas.map((x) => x.titulo), [
    "Partes", "Comisión compartida", "No contacto directo con el cliente", "Vigencia", "Confidencialidad", "Firma",
  ]);
  assert.match(c.clausulas[0].texto, /SAUCEDA, con domicilio en Lago de Sayula 214, y Inmobiliaria Norte, representado por Laura Pérez/);
  assert.match(c.clausulas[1].texto, /el 50% de los honorarios/);
  assert.match(c.clausulas[5].texto, /9 de octubre de 2026/);
  assert.ok(!/\{\w+\}/.test(JSON.stringify(c)), "quedaron marcadores sin sustituir");
});

test("convenio: % con decimales y contacto vacío usa el nombre del aliado", () => {
  const c = armarConvenio(PLANTILLAS, {
    prestador: "S", prestadorDomicilio: "D", aliado: "Ali", aliadoContacto: "", pct: 37.5, fecha: "hoy",
  });
  assert.match(c.clausulas[0].texto, /representado por Ali\./);
  assert.match(c.clausulas[1].texto, /37\.50%/);
});

test("comisión del aliado: precio × honorarios × % compartido", () => {
  const r = calcularComisionAliado(1_000_000, 3, 50);
  assert.equal(r.honorarios, 30000);
  assert.equal(r.montoAliado, 15000);
  assert.equal(r.pctEfectivo, 1.5);
  const r2 = calcularComisionAliado(873_500, 2.5, 40);
  assert.equal(r2.honorarios, 21837.5);
  assert.equal(r2.montoAliado, 8735);
  assert.throws(() => calcularComisionAliado(0, 3, 50));
  assert.throws(() => calcularComisionAliado(100, 3, 150));
});

test("folio de convenio", () => {
  assert.equal(siguienteFolioConvenio(null, 2026), "CONV-2026-0001");
  assert.equal(siguienteFolioConvenio("CONV-2026-0009", 2026), "CONV-2026-0010");
  assert.equal(siguienteFolioConvenio("CONV-2025-0042", 2026), "CONV-2026-0001");
});
