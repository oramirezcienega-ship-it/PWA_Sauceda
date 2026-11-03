/**
 * A nombre de quién sale una remisión o factura. Puede ser distinto del contacto
 * que nos compró (otro titular, la empresa, quien paga):
 * - factura  → razón social capturada
 * - remisión → "A nombre de" capturado (datos_documento.nombreCliente)
 * Si no hay dato capturado, el nombre del contacto.
 * 
 * Si el dato capturado es un nombre parcial o de pila (ej. "Marco") y el contacto
 * cuenta con su nombre completo con apellidos (ej. "Marco Antonio Arredondo Zariñana"),
 * se prioriza el nombre completo para evitar que la remisión salga trunca.
 */
export function nombreTitularRemision(
  tipo: string | null | undefined,
  datosDocumento: Record<string, any> | null | undefined,
  nombreContacto: string | null | undefined
): string {
  const d = datosDocumento || {};
  const capturado = tipo === "factura" ? d.razonSocial : d.nombreCliente;
  const capturadoLimpio = typeof capturado === "string" ? capturado.trim() : "";
  const contactoLimpio = typeof nombreContacto === "string" ? nombreContacto.trim() : "";

  if (capturadoLimpio && contactoLimpio) {
    const palabrasCapturado = capturadoLimpio.split(/\s+/);
    const palabrasContacto = contactoLimpio.split(/\s+/);

    // Si capturado tiene menos palabras y el nombre de contacto empieza con el mismo texto,
    // o capturado es solo el primer nombre, utilizar el nombre completo del contacto.
    if (
      palabrasCapturado.length < palabrasContacto.length &&
      contactoLimpio.toLowerCase().startsWith(capturadoLimpio.toLowerCase())
    ) {
      return contactoLimpio;
    }
    return capturadoLimpio;
  }

  return capturadoLimpio || contactoLimpio || "Cliente";
}

/**
 * Resuelve el nombre de la persona que recibe la entrega u obra en la remisión.
 * Si viene solo el nombre de pila pero coincide con el titular/contacto con apellidos,
 * expande al nombre completo.
 */
export function personaRecibeRemision(
  personaRecibe: string | null | undefined,
  nombreCompleto: string | null | undefined
): string {
  const recibeLimpio = typeof personaRecibe === "string" ? personaRecibe.trim() : "";
  const completoLimpio = typeof nombreCompleto === "string" ? nombreCompleto.trim() : "";

  if (!recibeLimpio) return completoLimpio;
  if (!completoLimpio) return recibeLimpio;

  const palabrasRecibe = recibeLimpio.split(/\s+/);
  const palabrasCompleto = completoLimpio.split(/\s+/);

  if (
    palabrasRecibe.length < palabrasCompleto.length &&
    completoLimpio.toLowerCase().startsWith(recibeLimpio.toLowerCase())
  ) {
    return completoLimpio;
  }

  return recibeLimpio;
}
