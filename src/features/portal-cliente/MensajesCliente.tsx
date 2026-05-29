import { aplicarParametros } from "@/lib/parametros";
import type { MensajeEnviado } from "@/lib/types";

/** Mensajes que el cliente ve en su portal. */
export function MensajesCliente({
  mensajes,
  parametros = {},
}: {
  mensajes: MensajeEnviado[];
  parametros?: Record<string, string>;
}) {
  if (mensajes.length === 0) return null;

  return (
    <div className="mt-6 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-carbon/50">
        Mensajes
      </p>
      {mensajes.map((m) => (
        <div
          key={m.id}
          className="rounded-2xl border border-cielo/30 bg-cielo/5 p-5"
        >
          <p className="font-titular text-lg font-semibold text-verde-profundo">
            {aplicarParametros(m.titulo, parametros)}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-carbon/80">
            {aplicarParametros(m.texto, parametros)}
          </p>
        </div>
      ))}
    </div>
  );
}
