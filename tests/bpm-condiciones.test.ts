import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarCondicionCampo, resolverPasosAplicables } from "../src/lib/bpm/condiciones.ts";

const SIN_CASA = { campo: "ya_tiene_casa", igual: false };

/** Mismos pasos que siembra la migración 0136 para `asesoria_compra`. */
const PASOS = [
  ["captacion", "Contactar y levantar perfil del comprador", "inmediato", null],
  ["precalificacion", "Solicitar NSS / datos y obtener precalificación", "Contactar y levantar perfil del comprador", null],
  ["precalificacion", "Registrar monto autorizado y perfil de búsqueda", "Solicitar NSS / datos y obtener precalificación", null],
  ["busqueda", "Cruzar perfil contra inventario propio", "Registrar monto autorizado y perfil de búsqueda", SIN_CASA],
  ["busqueda", "Enviar solicitud a aliados de la zona", "Cruzar perfil contra inventario propio", SIN_CASA],
  ["busqueda", "Validar y publicar 3 a 5 opciones al cliente", "Enviar solicitud a aliados de la zona", SIN_CASA],
  ["busqueda", "Agendar y realizar visitas", "Validar y publicar 3 a 5 opciones al cliente", SIN_CASA],
  ["negociacion", "Presentar oferta y confirmar fee con el aliado", "Agendar y realizar visitas", SIN_CASA],
  ["negociacion", "Firmar apartado / promesa", "Presentar oferta y confirmar fee con el aliado", SIN_CASA],
  ["expediente", "Generar orden de trabajo del trámite", "Firmar apartado / promesa", null],
  ["expediente", "Avalúo, libertad de gravamen, alineamiento, documentos", "Generar orden de trabajo del trámite", null],
  ["escrituracion", "Coordinar notaría y fecha de firma", "Avalúo, libertad de gravamen, alineamiento, documentos", null],
  ["entrega", "Entrega de llaves, testimonio y oferta de Construye", "Coordinar notaría y fecha de firma", null],
].map(([etapa, titulo, condicion, campo], i) => ({
  id: `p${i + 1}`,
  etapa: etapa as string,
  titulo_tarea: titulo as string,
  condicion_activacion: condicion as string,
  condicion_campo: campo as typeof SIN_CASA | null,
}));

test("sin condición siempre aplica", () => {
  assert.equal(evaluarCondicionCampo(null, {}), true);
  assert.equal(evaluarCondicionCampo(undefined, { ya_tiene_casa: true }), true);
});

test("booleano nulo cuenta como false", () => {
  assert.equal(evaluarCondicionCampo(SIN_CASA, { ya_tiene_casa: null }), true);
  assert.equal(evaluarCondicionCampo(SIN_CASA, {}), true);
  assert.equal(evaluarCondicionCampo(SIN_CASA, { ya_tiene_casa: true }), false);
});

test("lista de condiciones es AND y soporta 'distinto'", () => {
  const cond = [SIN_CASA, { campo: "tipo_credito", distinto: "contado" }];
  assert.equal(evaluarCondicionCampo(cond, { ya_tiene_casa: false, tipo_credito: "infonavit" }), true);
  assert.equal(evaluarCondicionCampo(cond, { ya_tiene_casa: false, tipo_credito: "contado" }), false);
});

test("comprador sin casa: genera los 13 pasos con su condición original", () => {
  const r = resolverPasosAplicables(PASOS, { ya_tiene_casa: false });
  assert.equal(r.length, 13);
  assert.ok(r.every((x) => !x.condicionHeredada));
});

test("ya_tiene_casa = true: no genera tareas de búsqueda ni de negociación", () => {
  const r = resolverPasosAplicables(PASOS, { ya_tiene_casa: true });
  assert.equal(r.length, 7);
  assert.ok(r.every((x) => x.paso.etapa !== "busqueda" && x.paso.etapa !== "negociacion"));
});

test("ya_tiene_casa = true: la orden de trabajo se encadena a la precalificación", () => {
  const r = resolverPasosAplicables(PASOS, { ya_tiene_casa: true });
  const ot = r.find((x) => x.paso.titulo_tarea === "Generar orden de trabajo del trámite")!;
  assert.equal(ot.condicionEfectiva, "Registrar monto autorizado y perfil de búsqueda");
  assert.equal(ot.condicionHeredada, true);
  // Los demás conservan la del paso.
  assert.equal(r.filter((x) => x.condicionHeredada).length, 1);
});

test("hereda condiciones con el formato completar_<id>", () => {
  const pasos = [
    { id: "a", titulo_tarea: "A", condicion_activacion: "inmediato", condicion_campo: null },
    { id: "b", titulo_tarea: "B", condicion_activacion: "completar_a", condicion_campo: SIN_CASA },
    { id: "c", titulo_tarea: "C", condicion_activacion: "completar_b", condicion_campo: null },
  ];
  const r = resolverPasosAplicables(pasos, { ya_tiene_casa: true });
  assert.deepEqual(r.map((x) => [x.paso.id, x.condicionEfectiva]), [["a", "inmediato"], ["c", "completar_a"]]);
});

test("si el primer paso se omite, el siguiente queda inmediato", () => {
  const pasos = [
    { id: "a", titulo_tarea: "A", condicion_activacion: "inmediato", condicion_campo: SIN_CASA },
    { id: "b", titulo_tarea: "B", condicion_activacion: "A", condicion_campo: null },
  ];
  const r = resolverPasosAplicables(pasos, { ya_tiene_casa: true });
  assert.deepEqual(r.map((x) => x.condicionEfectiva), ["inmediato"]);
});

test("condiciones de evento (no son pasos) no se alteran", () => {
  const pasos = [{ id: "a", titulo_tarea: "A", condicion_activacion: "reporte_visita_subido", condicion_campo: null }];
  const r = resolverPasosAplicables(pasos, {});
  assert.equal(r[0].condicionEfectiva, "reporte_visita_subido");
  assert.equal(r[0].condicionHeredada, false);
});
