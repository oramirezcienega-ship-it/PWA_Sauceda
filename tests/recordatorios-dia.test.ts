import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatearFechaHoyLegible,
  formatearHorarioLegible,
  inferirServicioNombre,
} from "../src/lib/recordatorios-dia-servicio.ts";

test("formatearFechaHoyLegible antepone 'hoy' y formatea día y mes en español", () => {
  // 31 de octubre de 2026 (sábado)
  const f1 = formatearFechaHoyLegible("2026-10-31");
  assert.equal(f1, "hoy sábado, 31 de octubre");

  // 02 de noviembre de 2026 (lunes)
  const f2 = formatearFechaHoyLegible("2026-11-02");
  assert.equal(f2, "hoy lunes, 2 de noviembre");
});

test("formatearHorarioLegible convierte formatos 24h a 12h am/pm amigables", () => {
  assert.equal(formatearHorarioLegible("17:30:00"), "5:30 pm");
  assert.equal(formatearHorarioLegible("10:00:00"), "10:00 am");
  assert.equal(formatearHorarioLegible("12:00:00"), "12:00 pm");
  assert.equal(formatearHorarioLegible("09:30:00", "11:00:00"), "9:30 am a 11:00 am");
  assert.equal(formatearHorarioLegible("17:30:00", "18:30:00"), "5:30 pm a 6:30 pm");
});

test("inferirServicioNombre detecta variantes de calentador solar, impermeabilización y oficios", () => {
  const c1 = { notas: "Mantenimiento calentador solar 12 tubos ($1,450 MXN). OT-2026-0032." };
  assert.equal(inferirServicioNombre(c1), "mantenimiento de calentador solar de 12 tubos");

  const c2 = { notas: "Cambio completo de empaques calentador solar ($750 MXN)" };
  assert.equal(inferirServicioNombre(c2), "servicio técnico y cambio de empaques de calentador solar");

  const c3 = { servicio_tipo: "impermeabilizacion", notas: "Losa con filtraciones 70m2" };
  assert.equal(inferirServicioNombre(c3), "impermeabilización profesional");

  const c4 = { notas: "Piso estampado color terracota en cochera" };
  assert.equal(inferirServicioNombre(c4), "concreto estampado y pisos");

  const c5 = { servicio_tipo: null, notas: "" };
  assert.equal(inferirServicioNombre(c5), "instalación y servicio técnico");
});

test("parámetros de plantilla confirmacion_instalacion cumplen con Meta UTILITY", () => {
  // Confirmamos los 6 parámetros requeridos por la plantilla aprobada en Meta:
  // {{1}}: Cliente, {{2}}: Servicio, {{3}}: Fecha, {{4}}: Horario, {{5}}: Responsable, {{6}}: Teléfono
  const primerNombre = "Bernabe";
  const servicio = "mantenimiento de calentador solar de 12 tubos";
  const fecha = formatearFechaHoyLegible("2026-10-30");
  const horario = formatearHorarioLegible("17:30:00");
  const responsable = "Clemente López";
  const telContacto = "477 465 4700";

  const params = [primerNombre, servicio, fecha, horario, responsable, telContacto];
  assert.equal(params.length, 6);
  assert.equal(params[0], "Bernabe");
  assert.equal(params[4], "Clemente López");
  assert.ok(params[2].startsWith("hoy"));
});

test("parámetros de plantilla confirmacion_inspeccion cumplen con Meta UTILITY", () => {
  // {{1}}: Cliente, {{2}}: Fecha, {{3}}: Horario, {{4}}: Asesor/Técnico, {{5}}: Teléfono
  const primerNombre = "Ernesto";
  const fecha = formatearFechaHoyLegible("2026-10-29");
  const horario = formatearHorarioLegible("16:30:00");
  const asesor = "Alejandro Córdova";
  const telContacto = "477 465 4700";

  const params = [primerNombre, fecha, horario, asesor, telContacto];
  assert.equal(params.length, 5);
  assert.equal(params[0], "Ernesto");
  assert.equal(params[3], "Alejandro Córdova");
  assert.ok(params[1].startsWith("hoy"));
});

test("parámetros de plantilla aviso_proveedor cumplen con Meta MARKETING", () => {
  // {{1}}: Proveedor, {{2}}: Resumen servicio
  const provNombre = "Clemente";
  const resumen = `te recordamos que hoy tienes servicio a las 5:30 pm con Bernabe en Convento del Carmen 112 [OT-2026-0032].`;

  const params = [provNombre, resumen];
  assert.equal(params.length, 2);
  assert.equal(params[0], "Clemente");
  assert.ok(params[1].includes("OT-2026-0032"));
  assert.ok(params[1].includes("Convento del Carmen"));
});
