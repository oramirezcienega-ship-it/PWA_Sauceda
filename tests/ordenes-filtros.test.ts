import test from "node:test";
import assert from "node:assert/strict";
import {
  expandirTiposNegocio,
  tipoCoincideConSeleccion,
  VALORES_CONSTRUCCION,
  VALORES_BIENES_RAICES,
  FILTROS_OT_DEFAULT,
} from "../src/lib/ordenes-filtros.ts";

test("FILTROS_OT_DEFAULT: viene predeterminado con solo construcción y estatus en proceso", () => {
  assert.deepEqual(FILTROS_OT_DEFAULT.estatuses, ["en_proceso"]);
  assert.equal(FILTROS_OT_DEFAULT.lineas.length, VALORES_CONSTRUCCION.length);
  assert.ok(FILTROS_OT_DEFAULT.lineas.includes("construccion-impermeabilizacion"));
  assert.ok(FILTROS_OT_DEFAULT.lineas.includes("construccion-piso-estampado"));
  assert.ok(!FILTROS_OT_DEFAULT.lineas.includes("asesoria_compra"));
  assert.ok(!FILTROS_OT_DEFAULT.lineas.includes("solo_tramite"));
});

test("expandirTiposNegocio: 'construccion' expande a todas las especialidades de obra y mantenimiento", () => {
  const expandidos = expandirTiposNegocio(["construccion"]);
  assert.ok(expandidos.includes("construccion"));
  assert.ok(expandidos.includes("construccion-impermeabilizacion"));
  assert.ok(expandidos.includes("impermeabilizacion"));
  assert.ok(expandidos.includes("construccion-piso-estampado"));
  assert.ok(expandidos.includes("piso_estampado"));
  assert.ok(expandidos.includes("construccion-mantenimiento-calentadores"));
  assert.ok(expandidos.includes("construccion-mantenimiento-cisternas"));
  assert.ok(expandidos.includes("construccion-herreria"));
  assert.ok(expandidos.includes("seguridad"));
  // No debe incluir bienes raíces
  assert.ok(!expandidos.includes("asesoria_compra"));
  assert.ok(!expandidos.includes("solo_tramite"));
});

test("expandirTiposNegocio: sinonimia bidireccional entre prefijo construccion-* y clave corta", () => {
  const conPrefijo = expandirTiposNegocio(["construccion-piso-estampado"]);
  assert.ok(conPrefijo.includes("construccion-piso-estampado"));
  assert.ok(conPrefijo.includes("piso_estampado"));

  const sinPrefijo = expandirTiposNegocio(["piso_estampado"]);
  assert.ok(sinPrefijo.includes("construccion-piso-estampado"));
  assert.ok(sinPrefijo.includes("piso_estampado"));
});

test("tipoCoincideConSeleccion: clasifica adecuadamente si una orden es de construcción", () => {
  // Cuando solo está seleccionada construcción
  assert.equal(tipoCoincideConSeleccion("construccion-piso-estampado", VALORES_CONSTRUCCION), true);
  assert.equal(tipoCoincideConSeleccion("piso_estampado", VALORES_CONSTRUCCION), true);
  assert.equal(tipoCoincideConSeleccion("construccion-mantenimiento-calentadores", VALORES_CONSTRUCCION), true);
  assert.equal(tipoCoincideConSeleccion("impermeabilizacion", VALORES_CONSTRUCCION), true);

  // Bienes raíces quedan fuera
  assert.equal(tipoCoincideConSeleccion("asesoria_compra", VALORES_CONSTRUCCION), false);
  assert.equal(tipoCoincideConSeleccion("solo_tramite", VALORES_CONSTRUCCION), false);
  assert.equal(tipoCoincideConSeleccion("traspaso_compra", VALORES_CONSTRUCCION), false);
});
