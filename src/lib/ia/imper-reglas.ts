/**
 * Reglas de negocio y guardrails para el flujo de impermeabilización:
 * - Detección de metros en historial.
 * - Validación y sanitización de respuestas (mínimo de cobro 25 m², exclusión de acrílico en áreas chicas).
 */

/** Busca metros cuadrados discutidos previamente en el expediente o en el historial de mensajes. */
export function buscarMetrosEnHistorial(
  historia: Array<{ direccion?: string; texto?: string | null }>,
  exp?: { necesidad?: string | null } | null
): number | null {
  if (exp?.necesidad) {
    const mMatch = exp.necesidad.match(/(\d+)\s*m[²2]/i);
    if (mMatch) {
      const n = Number(mMatch[1]);
      if (Number.isFinite(n) && n >= 5 && n <= 5000) return n;
    }
  }
  for (let i = historia.length - 1; i >= 0; i--) {
    const txt = historia[i]?.texto ?? "";
    const mComp = txt.match(/Comparativa de impermeabilización para (\d+) m²/i);
    if (mComp) {
      const n = Number(mComp[1]);
      if (Number.isFinite(n) && n >= 5 && n <= 5000) return n;
    }
    const mGen = txt.match(/para\s+(?:tus|tu\s+azotea\s+de)?\s*(\d+)\s*m[²2]?/i);
    if (mGen) {
      const n = Number(mGen[1]);
      if (Number.isFinite(n) && n >= 5 && n <= 5000) return n;
    }
  }
  return null;
}

/**
 * Validador y guardrail post-generación para impermeabilización:
 * 1. Para superficies < 25 m², elimina menciones de acrílico y corrige cálculos alucinados a la tarifa mínima oficial ($5,625 / $6,875).
 * 2. Si no se va a enviar imagen multimedia, elimina emojis o textos que apunten al vacío.
 */
export function sanitizarRespuestaImper(texto: string, metros: number | null, vaAEnviarImagen: boolean): string {
  let res = texto;

  if (metros && metros < 25) {
    // 1. Quitar menciones de 3 opciones y cambiarlas a 2 opciones
    res = res.replace(/3\s*opciones/gi, "2 opciones");
    res = res.replace(/las\s*tres\s*opciones/gi, "las dos opciones");
    res = res.replace(/tres\s*opciones/gi, "dos opciones");

    // 2. Limpiar ofertas de rango con acrílico ($165)
    res = res.replace(/desde\s*\$165(?:\/m²|\s*pesos|\s*mxn)?\s*en\s*sistema\s*acr[ií]lico\s*hasta\s*\$225(?:\/m²|\s*pesos|\s*mxn)?\s*en\s*manto\s*asf[aá]ltico[^\n]*/gi, "manto asfáltico termo-fusionado con gravilla (tarifa mínima de 25 m²: $5,625 MXN Estándar y $6,875 MXN Premium)");
    res = res.replace(/desde\s*\$165(?:\/m²|\s*pesos|\s*mxn)?\s*hasta\s*\$225(?:\/m²|\s*pesos|\s*mxn)?/gi, "tarifa mínima de 25 m² ($5,625 Estándar / $6,875 Premium)");

    // 3. Quitar cualquier línea completa que liste o mencione acrílico
    res = res.replace(/^[^\n]*acr[ií]lico[^\n]*\n?/gmi, "");

    // 4. Si queda alguna mención residual de acrílico en texto continuo
    res = res.replace(/\b(?:sistema\s+)?acr[ií]lico(?:\s+con\s+malla)?\b/gi, "manto asfáltico");

    // 5. Corregir cálculos alucinados lineales por debajo de la tarifa mínima ($5,625 / $6,875)
    res = res.replace(/\$4[,.]?050(?:\s*MXN)?/gi, "$5,625 MXN");
    res = res.replace(/\$4[,.]?950(?:\s*MXN)?/gi, "$6,875 MXN");
    res = res.replace(/\$2[,.]?970(?:\s*MXN)?/gi, "$5,625 MXN");
  } else {
    // Para >= 25 m²: corregir alucinaciones de rango donde se tope en $225 diciendo que es de 10 años (el Premium cuesta $275/m²)
    res = res.replace(
      /desde\s*\$165(?:\/m²|\s*pesos|\s*mxn)?\s*en\s*sistema\s*acr[ií]lico\s*hasta\s*\$225(?:\/m²|\s*pesos|\s*mxn)?\s*en\s*manto\s*asf[aá]ltico[^\n]*/gi,
      "va desde $165/m² en Acrílico (3 años), $225/m² en Manto Estándar 3.5 mm (5 años) hasta $275/m² en Manto Premium 4.0 mm (10 años)."
    );
    res = res.replace(
      /(?:^|\n)\s*el\s+comparativo\s+de\s+las\s+3\s+opciones\s+con\s+su\s+inversión\s+estimada\s+total[^\n]*/gi,
      "\nTe comparto la comparativa de nuestras 3 opciones con su inversión estimada total ya con material, sellado de grietas y mano de obra incluidos 👇"
    );
    res = res.replace(/va\s+va\s+desde/gi, "va desde");
  }

  // Si no se va a enviar imagen y el texto apunta hacia abajo al vacío
  if (!vaAEnviarImagen && !/(?:fotos?|im[aá]genes)/i.test(res)) {
    res = res.replace(/👇/g, "").replace(/en\s+la\s+siguiente\s+imagen\s+(?:puedes\s+ver\s+)?/gi, "");
  }

  return res.trim();
}
