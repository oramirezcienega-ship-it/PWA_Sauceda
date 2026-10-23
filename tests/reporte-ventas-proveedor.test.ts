import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularReporteVentasProveedor } from "../src/lib/reporte-ventas-proveedor.ts";
import type { DocumentoProveedor } from "../src/lib/types.ts";

const doc = (fecha: string, monto: number, cantidad: number, producto: string, extra: Partial<DocumentoProveedor> = {}) =>
  ({
    id: `${fecha}-${monto}`,
    proveedorId: "p1",
    cotizacionId: null,
    expedienteId: null,
    ordenTrabajoId: null,
    tipo: "remision",
    folio: `REM-${fecha}`,
    concepto: "",
    fecha,
    monto,
    productoNombre: producto,
    cantidad,
    unidad: "m2",
    notas: "",
    origen: "automatico",
    createdAt: fecha,
    updatedAt: fecha,
    ...extra,
  }) as DocumentoProveedor;

const DOCS = [
  doc("2026-07-15", 5000, 50, "Impermeabilizante 3.5"),
  doc("2026-09-27", 7073, 32.15, "Impermeabilizante 4.0"),
  doc("2026-09-28", 38472, 240.45, "Impermeabilizante 3.5"),
  doc("2026-10-14", 20680, 94, "Impermeabilizante 4.0"),
  doc("2026-10-20", 23008, 104.58, "impermeabilizante 4.0"),
];

test("filtra el periodo y calcula KPIs", () => {
  const r = calcularReporteVentasProveedor(DOCS, "2026-09-01", "2026-10-31");
  assert.equal(r.operaciones, 4);
  assert.equal(r.monto, 89233);
  assert.equal(r.cantidad, 471.18);
  assert.equal(r.ticketPromedio, 22308.25);
  assert.deepEqual(r.meses.map((m) => [m.clave, m.monto, m.operaciones]), [
    ["2026-09", 45545, 2],
    ["2026-10", 43688, 2],
  ]);
});

test("agrupa productos sin importar mayúsculas y ordena por monto", () => {
  const r = calcularReporteVentasProveedor(DOCS, "2026-09-01", "2026-10-31");
  assert.equal(r.productos.length, 2);
  assert.equal(r.productos[0].nombre, "Impermeabilizante 4.0");
  assert.equal(r.productos[0].monto, 50761);
  assert.equal(r.productos[0].operaciones, 3);
  assert.equal(Math.round(r.productos.reduce((s, p) => s + p.porcentaje, 0)), 100);
});

test("incluye meses sin ventas y compara con el periodo anterior", () => {
  const r = calcularReporteVentasProveedor(DOCS, "2026-08-01", "2026-10-31");
  assert.deepEqual(r.meses.map((m) => m.monto), [0, 45545, 43688]);
  // periodo anterior del mismo largo: 2026-05-01 → 2026-07-31
  assert.equal(r.anterior.monto, 5000);
  assert.match(r.resumen.join(" "), /crecieron/);
  assert.match(r.resumen.join(" "), /mejor mes fue sep 2026/);
});

test("desglosa partidas", () => {
  const r = calcularReporteVentasProveedor(
    [
      doc("2026-10-01", 3000, 0, "", {
        partidas: [
          { descripcion: "A", cantidad: 10, unidad: "m2", costoUnitario: 200, importe: 2000 },
          { descripcion: "B", cantidad: 5, unidad: "m2", costoUnitario: 200, importe: 1000 },
        ],
      }),
    ],
    "2026-10-01",
    "2026-10-31"
  );
  assert.equal(r.operaciones, 1);
  assert.equal(r.filas.length, 2);
  assert.equal(r.cantidad, 15);
  assert.deepEqual(r.productos.map((p) => p.porcentaje), [66.7, 33.3]);
});

test("periodo vacío", () => {
  const r = calcularReporteVentasProveedor(DOCS, "2025-01-01", "2025-01-31");
  assert.equal(r.operaciones, 0);
  assert.equal(r.resumen.length, 1);
});
