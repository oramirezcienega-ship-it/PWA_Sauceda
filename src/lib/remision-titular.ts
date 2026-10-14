/**
 * A nombre de quién sale una remisión o factura. Puede ser distinto del contacto
 * que nos compró (otro titular, la empresa, quien paga):
 * - factura  → razón social capturada
 * - remisión → "A nombre de" capturado (datos_documento.nombreCliente)
 * Si no hay dato capturado, el nombre del contacto.
 */
export function nombreTitularRemision(
  tipo: string | null | undefined,
  datosDocumento: Record<string, any> | null | undefined,
  nombreContacto: string | null | undefined
): string {
  const d = datosDocumento || {};
  const capturado = tipo === "factura" ? d.razonSocial : d.nombreCliente;
  return (typeof capturado === "string" && capturado.trim()) || (nombreContacto || "").trim() || "Cliente";
}
