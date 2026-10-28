import { test } from "node:test";
import assert from "node:assert/strict";
import { extraerDireccionDeTexto, linkMapsDeDireccion, pareceDireccionValida } from "../src/lib/direccion.ts";

test("extraerDireccionDeTexto: Caso real de Ernesto con prefijo y multilínea", () => {
  const texto = "Perfecto, mi domicilio es:\nCalle  Josefina Camarena #203. Col. Leon 2. Entre Calle Esteban de laris y Eufrasia Pantoja";
  const dir = extraerDireccionDeTexto(texto);
  assert.ok(dir);
  assert.equal(dir, "Calle Josefina Camarena #203. Col. Leon 2. Entre Calle Esteban de laris y Eufrasia Pantoja");
});

test("extraerDireccionDeTexto: Caso real de Bernabe (vialidad 'Convento' con indicación y sin prefijo)", () => {
  const texto = "Convento del Carmen 112 colinas del Carmen hay que avisar por wattsap para abrir la reja de la entrada a la calle, si de favor pudieran este viernes 30/10/2026 por favor";
  const dir = extraerDireccionDeTexto(texto);
  assert.ok(dir);
  assert.equal(dir, "Convento del Carmen 112 colinas del Carmen hay que avisar por wattsap para abrir la reja de la entrada a la calle");
});

test("extraerDireccionDeTexto: Domicilio con 'domicilio es' o 'mi dirección es'", () => {
  const t1 = "Mi domicilio es Calle Santa Rita 124, Col. San Miguel por favor";
  assert.equal(extraerDireccionDeTexto(t1), "Calle Santa Rita 124, Col. San Miguel");

  const t2 = "Dirección: Paseo de las Lomas #405 fracc Valle del Sol. Gracias";
  assert.equal(extraerDireccionDeTexto(t2), "Paseo de las Lomas #405 fracc Valle del Sol");

  const t3 = "El domicilio sería en Privada Gardenias #12, León II";
  assert.equal(extraerDireccionDeTexto(t3), "Privada Gardenias #12, León II");
});

test("extraerDireccionDeTexto: Vialidad directa con calle y número", () => {
  const t1 = "Calle Roble 145 Col. León 2";
  assert.equal(extraerDireccionDeTexto(t1), "Calle Roble 145 Col. León 2");

  const t2 = "Av. Olímpica 1402 int 5";
  assert.equal(extraerDireccionDeTexto(t2), "Av. Olímpica 1402 int 5");

  const t3 = "Blvd. Mariano Escobedo 4502 col. León Moderno";
  assert.equal(extraerDireccionDeTexto(t3), "Blvd. Mariano Escobedo 4502 col. León Moderno");

  const t4 = "Paseo de los Cisnes 310, Col. San Jerónimo";
  assert.equal(extraerDireccionDeTexto(t4), "Paseo de los Cisnes 310, Col. San Jerónimo");
});

test("extraerDireccionDeTexto: Frases conversacionales no deben extraerse falsamente", () => {
  assert.equal(extraerDireccionDeTexto("Hola buenas tardes"), null);
  assert.equal(extraerDireccionDeTexto("¿Cuál es la dirección de sus oficinas?"), null);
  assert.equal(extraerDireccionDeTexto("¿Tienen alguna dirección para ir?"), null);
  assert.equal(extraerDireccionDeTexto("Mi correo es contacto@gmail.com"), null);
  assert.equal(extraerDireccionDeTexto("Ok. Gracias"), null);
  assert.equal(extraerDireccionDeTexto("¿A qué hora vendrían mañana?"), null);
});

test("linkMapsDeDireccion: Genera URL válida con León, Gto por defecto", () => {
  const url1 = linkMapsDeDireccion("Calle Josefina Camarena #203, León 2");
  assert.ok(url1.includes("https://www.google.com/maps/search/?api=1&query="));
  assert.ok(url1.includes("Josefina%20Camarena"));

  const url2 = linkMapsDeDireccion("Av Hidalgo 123");
  assert.ok(url2.includes("Le%C3%B3n%2C%20Gto."));
});
