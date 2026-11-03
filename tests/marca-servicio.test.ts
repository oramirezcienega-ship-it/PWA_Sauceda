import test from "node:test";
import assert from "node:assert/strict";
import { esServicioSeguridad, obtenerMarcaServicio } from "../src/lib/marca-servicio.ts";

test("esServicioSeguridad identifica correctamente los servicios y productos de seguridad", () => {
  assert.equal(esServicioSeguridad("seguridad"), true);
  assert.equal(esServicioSeguridad("cctv"), true);
  assert.equal(esServicioSeguridad("camaras"), true);
  assert.equal(esServicioSeguridad("dahua"), true);
  assert.equal(esServicioSeguridad("hikvision"), true);
  assert.equal(esServicioSeguridad("alarma"), true);
  assert.equal(esServicioSeguridad("Kit 4 Cámaras Dahua 2MP"), true);
  assert.equal(esServicioSeguridad("Instalación de cámaras de seguridad"), true);
  assert.equal(esServicioSeguridad("CAT-010"), true);
  assert.equal(esServicioSeguridad("CAT-021"), true);
});

test("esServicioSeguridad no confunde oficios de construcción con seguridad", () => {
  assert.equal(esServicioSeguridad("impermeabilizacion"), false);
  assert.equal(esServicioSeguridad("pintura"), false);
  assert.equal(esServicioSeguridad("remodelacion"), false);
  assert.equal(esServicioSeguridad("piso_estampado"), false);
  assert.equal(esServicioSeguridad("herreria"), false);
  assert.equal(esServicioSeguridad("losa"), false);
  assert.equal(esServicioSeguridad("construccion"), false);
  assert.equal(esServicioSeguridad("mantenimiento-tinacos"), false);
  assert.equal(esServicioSeguridad("Impermeabilización de azotea con garantía"), false);
});

test("obtenerMarcaServicio devuelve Sauceda Protege para seguridad y Sauceda Construye para obras", () => {
  const marcaSeguridad = obtenerMarcaServicio({ tipoNegocio: "seguridad" });
  assert.equal(marcaSeguridad.esSeguridad, true);
  assert.equal(marcaSeguridad.nombre, "Sauceda Protege");
  assert.equal(marcaSeguridad.nombreMayus, "SAUCEDA PROTEGE");
  assert.ok(marcaSeguridad.descriptor.includes("Seguridad Electrónica"));

  const marcaTextoSeguridad = obtenerMarcaServicio({ texto: "Instalación de sistema CCTV y control de acceso" });
  assert.equal(marcaTextoSeguridad.esSeguridad, true);
  assert.equal(marcaTextoSeguridad.nombre, "Sauceda Protege");

  const marcaConstruccion = obtenerMarcaServicio({ tipoServicio: "impermeabilizacion" });
  assert.equal(marcaConstruccion.esSeguridad, false);
  assert.equal(marcaConstruccion.nombre, "Sauceda Construye");
  assert.equal(marcaConstruccion.nombreMayus, "SAUCEDA CONSTRUYE");
});
