import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estadoRequisito,
  evaluarRequisitos,
  normalizarRespuestas,
  pendientesParaBusqueda,
  validarDictamen,
  type DatosCompuertaBusqueda,
  type RequisitoPrecalificacion,
} from "../src/lib/asesoria/precalificacion.ts";
import { distanciaKm, normalizarZonasGeo, zonaQueCubre, type ZonaGeo } from "../src/lib/asesoria/zonas.ts";
import { calcularMatch } from "../src/lib/asesoria/match.ts";
import { normalizarPerfil, filaAPerfil } from "../src/lib/asesoria/perfil.ts";

const req = (clave: string, extra: Partial<RequisitoPrecalificacion> = {}): RequisitoPrecalificacion => ({
  id: clave,
  tipoCredito: "infonavit",
  clave,
  etiqueta: clave,
  ayuda: "",
  tipoRespuesta: "si_no",
  minimo: null,
  obligatorio: true,
  orden: 0,
  ...extra,
});

const REQS = [req("relacion_laboral"), req("puntos", { tipoRespuesta: "numero", minimo: 1080 }), req("nota", { tipoRespuesta: "texto", obligatorio: false })];

test("estado de cada requisito según su tipo", () => {
  assert.equal(estadoRequisito(REQS[0], true), "cumple");
  assert.equal(estadoRequisito(REQS[0], false), "no_cumple");
  assert.equal(estadoRequisito(REQS[0], undefined), "pendiente");
  assert.equal(estadoRequisito(REQS[1], 1100), "cumple");
  assert.equal(estadoRequisito(REQS[1], 900), "no_cumple");
  assert.equal(estadoRequisito(req("score", { tipoRespuesta: "numero" }), 600), "cumple"); // sin mínimo, basta capturarlo
});

test("evaluación solo cuenta obligatorios", () => {
  const e = evaluarRequisitos(REQS, { relacion_laboral: true, puntos: 900 });
  assert.equal(e.total, 2);
  assert.equal(e.cumplen, 1);
  assert.deepEqual(e.noCumplen.map((r) => r.clave), ["puntos"]);
  assert.equal(e.pendientes.length, 0);
});

test("respuestas: solo claves del catálogo y con su tipo", () => {
  const r = normalizarRespuestas(REQS, { relacion_laboral: "si", puntos: "1,250", intruso: true, nota: "  ok " });
  assert.deepEqual(r, { relacion_laboral: true, puntos: 1250, nota: "ok" });
});

test("dictamen apto exige que todo cumpla y evidencia", () => {
  const todoBien = evaluarRequisitos(REQS, { relacion_laboral: true, puntos: 1200 });
  assert.deepEqual(validarDictamen({ dictamen: "apto", nota: null, retomarEl: null }, todoBien, 1), []);
  assert.equal(validarDictamen({ dictamen: "apto", nota: null, retomarEl: null }, todoBien, 0).length, 1);
  const faltaPuntos = evaluarRequisitos(REQS, { relacion_laboral: true, puntos: 900 });
  assert.match(validarDictamen({ dictamen: "apto", nota: null, retomarEl: null }, faltaPuntos, 1)[0], /No cumple/);
  // Con condiciones sí se permite, con la condición escrita.
  assert.deepEqual(validarDictamen({ dictamen: "apto_condiciones", nota: "juntar puntos", retomarEl: null }, faltaPuntos, 1), []);
  assert.equal(validarDictamen({ dictamen: "apto_condiciones", nota: " ", retomarEl: null }, faltaPuntos, 1).length, 1);
});

test("no apto pide motivo y fecha futura", () => {
  const e = evaluarRequisitos(REQS, {});
  assert.equal(validarDictamen({ dictamen: "no_apto", nota: "", retomarEl: null }, e, 0).length, 1);
  assert.deepEqual(validarDictamen({ dictamen: "no_apto", nota: "sin puntos", retomarEl: "2026-12-01" }, e, 0, "2026-10-09"), []);
  assert.equal(validarDictamen({ dictamen: "no_apto", nota: "sin puntos", retomarEl: "2026-01-01" }, e, 0, "2026-10-09").length, 1);
});

const listo = (cambios: Partial<DatosCompuertaBusqueda> = {}): DatosCompuertaBusqueda => ({
  tipoCredito: "infonavit",
  montoCreditoPrecalificado: 1_200_000,
  montoAhorroPropio: 200_000,
  busquedaPrecioMax: 1_400_000,
  justificacionPrecio: null,
  busquedaZonas: ["Country"],
  zonasConfirmadas: 1,
  dictamen: "apto",
  evidencias: 1,
  evaluacion: evaluarRequisitos(REQS, { relacion_laboral: true, puntos: 1200 }),
  ...cambios,
});
const claves = (d: DatosCompuertaBusqueda, mapaActivo = true, soloPrecalificacion = false) =>
  pendientesParaBusqueda(d, { mapaActivo, soloPrecalificacion }).map((p) => p.clave);

test("compuerta: completa no tiene pendientes", () => {
  assert.deepEqual(claves(listo()), []);
});

test("compuerta: precio máximo arriba del poder de compra necesita justificación (caso real $1.5M vs $1.4M)", () => {
  assert.deepEqual(claves(listo({ busquedaPrecioMax: 1_500_000 })), ["precio"]);
  assert.deepEqual(claves(listo({ busquedaPrecioMax: 1_500_000, justificacionPrecio: "pondrá más enganche" })), []);
});

test("compuerta: sin dictamen, sin evidencia ni zona confirmada", () => {
  assert.deepEqual(claves(listo({ dictamen: null, evidencias: 0, zonasConfirmadas: 0 })), ["evidencia", "dictamen", "zonas_mapa"]);
  // Sin Google Maps configurado no se exige confirmar en el mapa.
  assert.deepEqual(claves(listo({ zonasConfirmadas: 0 }), false), []);
});

test("compuerta: no apto = en pausa", () => {
  assert.deepEqual(claves(listo({ dictamen: "no_apto" })), ["pausa"]);
});

test("compuerta: si ya tiene casa no pide zonas ni precio", () => {
  assert.deepEqual(claves(listo({ busquedaZonas: [], zonasConfirmadas: 0, busquedaPrecioMax: 9_000_000 }), true, true), []);
});

test("compuerta: contado no pide monto de crédito pero sí recursos", () => {
  assert.deepEqual(claves(listo({ tipoCredito: "contado", montoCreditoPrecalificado: null, montoAhorroPropio: 1_500_000, busquedaPrecioMax: 1_500_000 })), []);
  assert.deepEqual(claves(listo({ tipoCredito: "contado", montoCreditoPrecalificado: null, montoAhorroPropio: null })), ["monto"]);
});

// --- Zonas en el mapa -----------------------------------------------------------

const COUNTRY: ZonaGeo = { nombre: "Country", placeId: "abc", lat: 21.15, lng: -101.69, direccion: "León, Gto.", radioKm: 2 };

test("zonas: limpia, quita repetidas y deja sin confirmar las que no traen ubicación", () => {
  const z = normalizarZonasGeo([COUNTRY, { ...COUNTRY }, "Vivar", { nombre: "  " }, { nombre: "X", placeId: "p", lat: 999, lng: 0 }]);
  assert.deepEqual(z.map((x) => [x.nombre, x.placeId]), [["Country", "abc"], ["Vivar", null], ["X", null]]);
  assert.equal(normalizarZonasGeo([{ ...COUNTRY, radioKm: 7 }])[0].radioKm, 2); // radio no permitido → default
});

test("distancia y cobertura por radio", () => {
  const km = distanciaKm({ lat: 21.15, lng: -101.69 }, { lat: 21.16, lng: -101.69 });
  assert.ok(km > 1.0 && km < 1.2);
  assert.equal(zonaQueCubre([COUNTRY], { lat: 21.16, lng: -101.69 })?.zona.nombre, "Country");
  assert.equal(zonaQueCubre([COUNTRY], { lat: 21.25, lng: -101.69 }), null);
  assert.equal(zonaQueCubre([COUNTRY], { lat: null, lng: null }), null);
});

test("match: un inmueble dentro del radio suma la zona aunque el nombre no coincida", () => {
  const inm = { origen: "propio" as const, precio: 1_300_000, estatus: "disponible", colonia: "Fracc. Country Club", lat: 21.155, lng: -101.69, acepta_credito: ["infonavit"] };
  const r = calcularMatch({ zonasGeo: [COUNTRY], busquedaZonas: ["Country"], busquedaPrecioMax: 1_400_000, tipoCredito: "infonavit" }, inm);
  assert.ok(r.razones.some((x) => x.startsWith("+40 A ") && x.includes("Country")));
  const lejos = calcularMatch({ zonasGeo: [COUNTRY], busquedaZonas: ["Country"], busquedaPrecioMax: 1_400_000, tipoCredito: "infonavit" }, { ...inm, lat: 21.3 });
  assert.ok(!lejos.razones.some((x) => x.startsWith("+40")));
});

test("perfil: las zonas del mapa llenan también los nombres", () => {
  const r = normalizarPerfil({ zonasGeo: [COUNTRY, { nombre: "Vivar" }], tipoInmueble: "casa", plazoMudanza: "1_3_meses" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.perfil.busquedaZonas, ["Country", "Vivar"]);
    assert.equal(r.perfil.zonasGeo[0].placeId, "abc");
  }
  assert.equal(normalizarPerfil({ tipoInmueble: "castillo" }).ok, false);
  // Fichas viejas solo con nombres siguen funcionando.
  assert.deepEqual(filaAPerfil({ busqueda_zonas: ["Centro"] }).zonasGeo.map((z) => z.nombre), ["Centro"]);
});
