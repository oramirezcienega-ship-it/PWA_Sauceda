import { test } from "node:test";
import assert from "node:assert/strict";
import { aOpcionCliente, validarFechaVisita, esMotivoDescarte, esTokenPortalValido } from "../src/lib/asesoria/portal.ts";

/** Fila completa de `inmuebles` tal como sale de la base (con datos que el cliente NO debe ver). */
const INMUEBLE = {
  id: "inm-1",
  folio: "INM-0007",
  origen: "aliado",
  aliado_id: "ali-99",
  aliado: { nombre: "Inmobiliaria Secreta", telefono: "4779998888", whatsapp: "524779998888" },
  expediente_origen_id: "EXP-500",
  url_fuente: "https://portal.example/casa-123",
  precio: "850000",
  fraccionamiento: "Los Castillos",
  zona: "Norte",
  colonia: "Castillos Viejos",
  ciudad: "León",
  direccion_privada: "Calle Torre 45",
  metros_construccion: "90",
  metros_terreno: "105",
  recamaras: 3,
  banos: "1.5",
  descripcion_publica: "Casa amplia con cochera",
  notas_internas: "El aliado pide 3% y el dueño acepta 820 mil",
  tiene_adeudos: true,
  validado_por: "perfil-1",
};

const CAMPOS_PROHIBIDOS = ["Inmobiliaria Secreta", "4779998888", "524779998888", "ali-99", "portal.example", "820 mil", "EXP-500", "perfil-1"];

test("opción publicada: no expone aliado, contacto, fuente, notas ni dirección", () => {
  const o = aOpcionCliente({ id: "p1", estatus: "publicada" }, INMUEBLE, ["https://firmada/1.jpg"]);
  const json = JSON.stringify(o);
  for (const x of CAMPOS_PROHIBIDOS) assert.ok(!json.includes(x), `expone "${x}"`);
  assert.ok(!json.includes("Calle Torre"), "expone la dirección antes de la visita");
  assert.equal(o.direccion, null);
  assert.equal(o.precio, 850000);
  assert.equal(o.zona, "Los Castillos");
  assert.equal(o.puedeResponder, true);
  assert.deepEqual(Object.keys(o).sort(), [
    "banos", "descripcion", "direccion", "estatus", "etiquetaEstatus", "fotos", "id", "metrosConstruccion",
    "metrosTerreno", "precio", "puedeResponder", "recamaras", "visita", "zona",
  ].sort());
});

test("vista y me_interesa tampoco revelan la dirección", () => {
  for (const estatus of ["vista", "me_interesa"] as const) {
    assert.equal(aOpcionCliente({ id: "p", estatus }, INMUEBLE, []).direccion, null);
  }
});

test("con visita agendada se revela la dirección (y nada del aliado)", () => {
  const o = aOpcionCliente({ id: "p1", estatus: "visita_agendada" }, INMUEBLE, [], { fecha: "2026-10-15", hora_inicio: "11:00:00" });
  assert.equal(o.direccion, "Calle Torre 45, Castillos Viejos, León");
  assert.deepEqual(o.visita, { fecha: "2026-10-15", hora: "11:00" });
  assert.equal(o.puedeResponder, false);
  const json = JSON.stringify(o);
  for (const x of CAMPOS_PROHIBIDOS) assert.ok(!json.includes(x), `expone "${x}"`);
});

test("fecha de visita: anticipación, horario y rango", () => {
  const ahora = new Date("2026-10-09T15:00:00-06:00");
  assert.equal(validarFechaVisita("2026-10-09", "16:00", ahora).ok, false); // < 2 h
  assert.equal(validarFechaVisita("2026-10-09", "18:00", ahora).ok, true);
  assert.equal(validarFechaVisita("2026-10-10", "07:30", ahora).ok, false); // antes de las 8
  assert.equal(validarFechaVisita("2026-10-10", "19:30", ahora).ok, false); // después de las 19
  assert.equal(validarFechaVisita("2026-12-20", "10:00", ahora).ok, false); // > 60 días
  assert.equal(validarFechaVisita("10/10/2026", "10:00", ahora).ok, false);
  const r = validarFechaVisita("2026-10-10", "10:30", ahora);
  assert.ok(r.ok && r.horaFin === "11:30");
});

test("motivos de descarte y token del portal", () => {
  assert.ok(esMotivoDescarte("precio"));
  assert.ok(!esMotivoDescarte("aliado"));
  assert.ok(esTokenPortalValido("0b6f2c1e-1a2b-4c3d-8e9f-0123456789ab"));
  assert.ok(!esTokenPortalValido("EXP-001"));
});
