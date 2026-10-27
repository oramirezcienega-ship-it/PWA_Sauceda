import { test } from "node:test";
import assert from "node:assert/strict";

function formatearRutaWhatsApp(citas: Array<{
  hora_inicio: string;
  cliente_nombre: string;
  expediente_id?: string | null;
  direccion_completa: string;
  cliente_telefono?: string;
  estado: string;
  tecnico_asignado: string;
}>): string {
  let texto = "";
  citas.forEach((c, idx) => {
    const estIcon = c.estado === "confirmada" ? "🟢" : "🟡";
    texto += `${idx + 1}. ${estIcon} *${c.hora_inicio}* — *${c.cliente_nombre}* ${c.expediente_id ? `(${c.expediente_id})` : ""}\n`;
    texto += `   📍 *Dirección:* ${c.direccion_completa}\n`;
    if (c.cliente_telefono) {
      texto += `   📞 *Teléfono:* ${c.cliente_telefono}\n`;
    }
    texto += `   👷 *Asignado:* ${c.tecnico_asignado}\n\n`;
  });
  return texto.trim();
}

test("formatearRutaWhatsApp genera texto estructurado con iconos de estatus", () => {
  const citas = [
    {
      hora_inicio: "13:30",
      cliente_nombre: "Ana Rivera",
      expediente_id: "EXP-853",
      direccion_completa: "Villa Piamonte #102, Villas del Country",
      cliente_telefono: "4777294683",
      estado: "confirmada",
      tecnico_asignado: "Alejandro Córdova",
    },
    {
      hora_inicio: "17:00",
      cliente_nombre: "Mary",
      expediente_id: "EXP-870",
      direccion_completa: "Blvd. Puma #901 Int. 102, Lomas de Echeveste",
      cliente_telefono: "4731737305",
      estado: "confirmada",
      tecnico_asignado: "Alejandro Córdova",
    },
  ];

  const res = formatearRutaWhatsApp(citas);
  assert.ok(res.includes("1. 🟢 *13:30* — *Ana Rivera* (EXP-853)"));
  assert.ok(res.includes("📍 *Dirección:* Villa Piamonte #102, Villas del Country"));
  assert.ok(res.includes("2. 🟢 *17:00* — *Mary* (EXP-870)"));
  assert.ok(res.includes("👷 *Asignado:* Alejandro Córdova"));
});
