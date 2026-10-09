import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidataAInmueble,
  criteriosDeFicha,
  describirCriterios,
  dominioDe,
  enlacesPortales,
  esDominioPortal,
  limpiarCandidatas,
  normalizarUrl,
} from "../src/lib/asesoria/busqueda-web.ts";
import { filaInmuebleDesdeFormulario } from "../src/lib/asesoria/inmueble-form.ts";

const FICHA = {
  busquedaZonas: ["Country", "Vivar"],
  busquedaPrecioMin: 1_200_000,
  busquedaPrecioMax: null,
  montoCreditoPrecalificado: 1_200_000,
  montoAhorroPropio: 200_000,
  busquedaRecamarasMin: 3,
  tipoInmueble: "casa",
  tipoCredito: "infonavit",
  busquedaIndispensables: "Planta baja",
};

test("criterios: sin máximo usa el poder de compra y no llevan datos del cliente", () => {
  const c = criteriosDeFicha(FICHA);
  assert.equal(c.precioMax, 1_400_000);
  assert.deepEqual(Object.keys(c).sort(), ["ciudad", "indispensables", "precioMax", "precioMin", "recamarasMin", "tipoCredito", "tipoInmueble", "zonas"]);
  const texto = describirCriterios(c);
  assert.match(texto, /Country, Vivar/);
  assert.match(texto, /3 o más/);
  assert.match(texto, /\$1,400,000/);
});

test("accesos directos: una búsqueda de Google por portal, limitada al sitio", () => {
  const e = enlacesPortales(criteriosDeFicha(FICHA));
  assert.ok(e.length >= 5);
  const q = decodeURIComponent(e[0].url.split("q=")[1]);
  assert.match(q, /^site:inmuebles24\.com casa en venta \("Country" OR "Vivar"\) León 3 recámaras$/);
});

test("URLs: dominio, normalización y portales", () => {
  assert.equal(dominioDe("https://www.Inmuebles24.com/propiedades/x.html"), "inmuebles24.com");
  assert.equal(dominioDe("javascript:alert(1)"), null);
  assert.equal(normalizarUrl("https://www.lamudi.com.mx/casa-123/?utm_source=x&id=9#fotos"), "https://lamudi.com.mx/casa-123?id=9");
  assert.ok(esDominioPortal("https://inmuebles.mercadolibre.com.mx/MLM-1"));
  assert.ok(!esDominioPortal("https://estafa-inmuebles24.com/x"));
});

test("candidatas: limpia tipos, quita repetidas y marca verificadas", () => {
  const r = limpiarCandidatas(
    [
      { url: "https://www.inmuebles24.com/a.html", titulo: "Casa en Country", precio: "$1,350,000", recamaras: 3.0, acepta_credito: ["INFONAVIT", "otro"] },
      { url: "https://inmuebles24.com/a.html", titulo: "Repetida" },
      { url: "ftp://x", titulo: "Mala" },
      { url: "https://vivanuncios.com.mx/b", titulo: "", precio: null },
    ],
    { urlsVistas: ["https://www.inmuebles24.com/a.html"] },
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].precio, 1_350_000);
  assert.deepEqual(r[0].aceptaCredito, ["infonavit"]);
  assert.equal(r[0].verificada, true);
  assert.equal(r[1].verificada, false);
  assert.equal(r[1].titulo, "Inmueble en venta");
  // Sin urlsVistas se conserva la marca guardada.
  assert.equal(limpiarCandidatas([{ url: "https://lamudi.com.mx/x", verificada: true }])[0].verificada, true);
});

test("candidata → inventario: guarda el link y al anunciante solo en notas internas", () => {
  const [c] = limpiarCandidatas([
    { url: "https://lamudi.com.mx/x", titulo: "Casa", precio: 1_300_000, colonia: "Country", anunciante_nombre: "Inmobiliaria X", anunciante_telefono: "477 123 4567" },
  ]);
  const r = filaInmuebleDesdeFormulario(candidataAInmueble(c));
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.fila.url_fuente, "https://lamudi.com.mx/x");
    assert.equal(r.fila.precio, 1_300_000);
    assert.match(r.fila.notas_internas, /Inmobiliaria X · 477 123 4567/);
    assert.doesNotMatch(r.fila.descripcion_publica, /lamudi|Inmobiliaria X/i);
  }
});
