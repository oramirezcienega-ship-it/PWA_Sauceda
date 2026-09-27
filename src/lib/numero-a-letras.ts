/**
 * Convierte un importe numérico a texto formal en pesos mexicanos (MXN).
 * Ejemplo: 15450.50 -> "QUINCE MIL CUATROCIENTOS CINCUENTA PESOS 50/100 M.N."
 */

function unidades(num: number): string {
  switch (num) {
    case 1: return "UN";
    case 2: return "DOS";
    case 3: return "TRES";
    case 4: return "CUATRO";
    case 5: return "CINCO";
    case 6: return "SEIS";
    case 7: return "SIETE";
    case 8: return "OCHO";
    case 9: return "NUEVE";
    default: return "";
  }
}

function decenas(num: number): string {
  const dec = Math.floor(num / 10);
  const uni = num - (dec * 10);

  switch (dec) {
    case 1:
      switch (uni) {
        case 0: return "DIEZ";
        case 1: return "ONCE";
        case 2: return "DOCE";
        case 3: return "TRECE";
        case 4: return "CATORCE";
        case 5: return "QUINCE";
        default: return `DIECI${unidades(uni)}`;
      }
    case 2:
      if (uni === 0) return "VEINTE";
      return `VEINTI${unidades(uni)}`;
    case 3: return uni === 0 ? "TREINTA" : `TREINTA Y ${unidades(uni)}`;
    case 4: return uni === 0 ? "CUARENTA" : `CUARENTA Y ${unidades(uni)}`;
    case 5: return uni === 0 ? "CINCUENTA" : `CINCUENTA Y ${unidades(uni)}`;
    case 6: return uni === 0 ? "SESENTA" : `SESENTA Y ${unidades(uni)}`;
    case 7: return uni === 0 ? "SETENTA" : `SETENTA Y ${unidades(uni)}`;
    case 8: return uni === 0 ? "OCHENTA" : `OCHENTA Y ${unidades(uni)}`;
    case 9: return uni === 0 ? "NOVENTA" : `NOVENTA Y ${unidades(uni)}`;
    default: return unidades(uni);
  }
}

function centenas(num: number): string {
  const cen = Math.floor(num / 100);
  const dec = num - (cen * 100);

  switch (cen) {
    case 1:
      if (dec > 0) return `CIENTO ${decenas(dec)}`;
      return "CIEN";
    case 2: return `DOSCIENTOS ${decenas(dec)}`.trim();
    case 3: return `TRESCIENTOS ${decenas(dec)}`.trim();
    case 4: return `CUATROCIENTOS ${decenas(dec)}`.trim();
    case 5: return `QUINIENTOS ${decenas(dec)}`.trim();
    case 6: return `SEISCIENTOS ${decenas(dec)}`.trim();
    case 7: return `SETECIENTOS ${decenas(dec)}`.trim();
    case 8: return `OCHOCIENTOS ${decenas(dec)}`.trim();
    case 9: return `NOVECIENTOS ${decenas(dec)}`.trim();
    default: return decenas(dec);
  }
}

function seccion(num: number, divisor: number, strSingular: string, strPlural: string): string {
  const cientos = Math.floor(num / divisor);
  const resto = num - (cientos * divisor);

  let letras = "";
  if (cientos > 0) {
    if (cientos > 1) {
      letras = `${centenas(cientos)} ${strPlural}`;
    } else {
      letras = `${strSingular}`;
    }
  }
  if (resto > 0) {
    letras = `${letras} `.trim();
  }
  return letras;
}

export function numeroALetras(monto: number): string {
  const valor = Math.abs(Number(monto) || 0);
  const enteros = Math.floor(valor);
  const centavos = Math.round((valor - enteros) * 100);

  if (enteros === 0) {
    return `CERO PESOS ${String(centavos).padStart(2, "0")}/100 M.N.`;
  }

  let letras = "";

  // Millones
  const millones = Math.floor(enteros / 1000000);
  const restoMillones = enteros % 1000000;
  if (millones > 0) {
    if (millones === 1) {
      letras += "UN MILLÓN ";
    } else {
      letras += `${centenas(millones)} MILLONES `;
    }
  }

  // Miles
  const miles = Math.floor(restoMillones / 1000);
  const restoMiles = restoMillones % 1000;
  if (miles > 0) {
    if (miles === 1) {
      letras += "MIL ";
    } else {
      letras += `${centenas(miles)} MIL `;
    }
  }

  // Centenas finales
  if (restoMiles > 0) {
    letras += `${centenas(restoMiles)} `;
  }

  const sufijoPesos = enteros === 1 ? "PESO" : "PESOS";
  return `${letras.trim()} ${sufijoPesos} ${String(centavos).padStart(2, "0")}/100 M.N.`;
}
