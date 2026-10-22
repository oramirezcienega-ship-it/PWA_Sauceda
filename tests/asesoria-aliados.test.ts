import { test } from "node:test";
import assert from "node:assert/strict";
import {
  construirCriteriosSnapshot,
  armarMensajeBusqueda,
  zonasSeCruzan,
  estadoEfectivo,
  calcularCalificacionAliado,
  limpiarRequisitos,
  generarTokenCarga,
  esTokenCargaValido,
} from "../src/lib/asesoria/aliados.ts";

/** Fila de expediente con datos personales que NUNCA deben llegar al aliado. */
const EXPEDIENTE = {
  id: "EXP-701",
  cliente: "Mariana",
  primer_apellido: "Hernández",
  segundo_apellido: "Rocha",
  telefono: "4771234567",
  direccion_propiedad: "Calle Falsa 123",
  notas: "Llamar a su esposo Juan al 477 765 4321",
  busqueda_zonas: ["Villas de San Juan", "Los Castillos"],
  busqueda_precio_min: 600000,
  busqueda_precio_max: 900000,
  busqueda_recamaras_min: 2,
  busqueda_requisitos: "Planta baja; mi cel 477-123-4567 o mariana@correo.com",
  tipo_credito: "INFONAVIT",
};

test("snapshot: solo criterios de búsqueda (lista blanca)", () => {
  const c = construirCriteriosSnapshot(EXPEDIENTE);
  assert.deepEqual(Object.keys(c).sort(), ["precio_max", "precio_min", "recamaras_min", "requisitos", "tipo_credito", "zonas"]);
  assert.equal(c.tipo_credito, "infonavit");
  assert.equal(c.precio_max, 900000);
  const json = JSON.stringify(c);
  for (const prohibido of ["Mariana", "Hernández", "4771234567", "477-123-4567", "mariana@correo.com", "Falsa", "esposo", "765 4321"]) {
    assert.ok(!json.includes(prohibido), `el snapshot incluye "${prohibido}"`);
  }
});

test("snapshot: sin precio máximo usa el poder de compra", () => {
  const c = construirCriteriosSnapshot({ ...EXPEDIENTE, busqueda_precio_max: null, monto_credito_precalificado: 700000, monto_ahorro_propio: 50000 });
  assert.equal(c.precio_max, 750000);
});

test("requisitos: se omiten teléfonos y correos", () => {
  assert.equal(limpiarRequisitos("Planta baja, cel +52 477 123 4567, a@b.com"), "Planta baja, cel [dato omitido], [dato omitido]");
  assert.equal(limpiarRequisitos("  "), null);
});

test("mensaje al aliado: trae zona, rango, crédito, recámaras, fecha y link, sin datos del cliente", () => {
  const c = construirCriteriosSnapshot(EXPEDIENTE);
  for (const formato of ["html", "texto"] as const) {
    const m = armarMensajeBusqueda(c, {
      link: "https://crm.saucedamx.com/aliados/carga/TOKEN?b=123",
      fechaLimite: "2026-10-12T18:00:00Z",
      formato,
    });
    assert.match(m, /Villas de San Juan, Los Castillos/);
    assert.match(m, /\$600,000 a \$900,000/);
    assert.match(m, /INFONAVIT/);
    assert.match(m, /2 o más/);
    assert.match(m, /aliados\/carga\/TOKEN\?b=123/);
    assert.match(m, /12 de oct/i);
    for (const prohibido of ["Mariana", "Hernández", "4771234567", "477-123-4567", "mariana@correo.com", "EXP-701"]) {
      assert.ok(!m.includes(prohibido), `el mensaje incluye "${prohibido}"`);
    }
  }
});

test("mensaje HTML escapa caracteres especiales", () => {
  const c = { ...construirCriteriosSnapshot(EXPEDIENTE), requisitos: "<b>cochera</b> & jardín" };
  const m = armarMensajeBusqueda(c, { link: "https://x/y?b=1&c=2", fechaLimite: "2026-10-12T18:00:00Z", formato: "html" });
  assert.match(m, /&lt;b&gt;cochera&lt;\/b&gt; &amp; jardín/);
  assert.match(m, /b=1&amp;c=2/);
});

test("zonas: preselección por cruce de cobertura", () => {
  assert.equal(zonasSeCruzan(["Los Castillos", "Centro"], ["los castíllos"]), true);
  assert.equal(zonasSeCruzan(["San Juan"], ["Villas de San Juan"]), true);
  assert.equal(zonasSeCruzan(["Centro"], ["Villas de San Juan"]), false);
  assert.equal(zonasSeCruzan([], ["Centro"]), false);
  assert.equal(zonasSeCruzan(null, null), false);
});

test("estado efectivo: enviada o vista pasada la fecha límite → vencida", () => {
  const ahora = new Date("2026-10-10T00:00:00Z");
  assert.equal(estadoEfectivo("enviada", "2026-10-09T00:00:00Z", ahora), "vencida");
  assert.equal(estadoEfectivo("vista", "2026-10-09T00:00:00Z", ahora), "vencida");
  assert.equal(estadoEfectivo("enviada", "2026-10-11T00:00:00Z", ahora), "enviada");
  assert.equal(estadoEfectivo("respondida", "2026-10-09T00:00:00Z", ahora), "respondida");
});

test("calificación: 60% respuesta + 40% aceptación", () => {
  assert.equal(calcularCalificacionAliado({ busquedas: [], propuestasPublicadas: 0, propuestasAceptadas: 0 }), null);
  // Solo abiertas: aún no se puede evaluar
  assert.equal(calcularCalificacionAliado({ busquedas: [{ estado: "enviada" }], propuestasPublicadas: 0, propuestasAceptadas: 0 }), null);
  const b = [{ estado: "respondida" as const }, { estado: "sin_resultados" as const }, { estado: "vencida" as const }, { estado: "respondida" as const }];
  assert.equal(calcularCalificacionAliado({ busquedas: b, propuestasPublicadas: 0, propuestasAceptadas: 0 }), 75);
  assert.equal(calcularCalificacionAliado({ busquedas: b, propuestasPublicadas: 4, propuestasAceptadas: 2 }), 65); // 0.6*0.75 + 0.4*0.5
});

test("token de carga: base64url largo y validación", () => {
  const t = generarTokenCarga(new Uint8Array(32).map((_, i) => (i * 37) % 256));
  assert.ok(esTokenCargaValido(t));
  assert.ok(!/[+/=]/.test(t));
  assert.ok(!esTokenCargaValido("corto"));
  assert.ok(!esTokenCargaValido("../../etc/passwd-aaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
});
