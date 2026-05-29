import type { EnvioConFormulario, Expediente } from "@/lib/types";
import { ETAPAS, ETAPAS_POR_ID } from "@/lib/etapas";
import { formatoFecha } from "@/lib/formato";
import { FormulariosCliente } from "./FormulariosCliente";

/**
 * Portal del cliente — vista de SEGUIMIENTO (solo lectura).
 *
 * Es lo que ve el cliente vendedor al abrir su enlace privado. Muestra
 * únicamente lo que le concierne de SU expediente: en qué etapa va y el
 * avance del trámite. NO muestra notas internas, saldos ni otros expedientes.
 */
export function SeguimientoCliente({
  expediente,
  token,
  envios = [],
}: {
  expediente: Expediente;
  token?: string;
  envios?: EnvioConFormulario[];
}) {
  const etapaActual = ETAPAS_POR_ID[expediente.etapa];
  const total = ETAPAS.length;
  const completadas = etapaActual.orden + 1;
  const porcentaje = Math.round((completadas / total) * 100);

  return (
    <main className="min-h-screen bg-crema">
      {/* Encabezado de marca */}
      <header className="bg-verde-profundo text-crema">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-5 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="SAUCEDA" className="h-10 w-10" />
          <div>
            <p className="font-display text-2xl font-semibold tracking-tight">
              SAUCEDA
            </p>
            <p className="font-titular text-sm italic text-dorado">
              Tradición con tecnología.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-5 py-6">
        {/* Saludo */}
        <p className="text-sm text-carbon/60">Seguimiento de tu traspaso</p>
        <h1 className="mt-1 font-titular text-3xl font-semibold text-verde-profundo">
          Hola, {expediente.cliente || expediente.nombreCompleto}
        </h1>
        <p className="mt-1 text-sm text-carbon/70">
          Tu propiedad en <strong>{expediente.fraccionamiento}</strong>, León, Gto.
        </p>

        {/* Etapa actual destacada */}
        <div className="mt-6 rounded-2xl border border-sauce/30 bg-white p-5 text-center shadow-sm">
          <p className="text-xs uppercase tracking-wide text-carbon/40">
            Tu trámite está en
          </p>
          <p className="mt-1 font-titular text-2xl font-semibold text-sauce">
            {etapaActual.nombre}
          </p>
          <p className="mt-2 text-sm text-carbon/70">
            {etapaActual.descripcion}
          </p>

          {/* Barra de avance */}
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-carbon/10">
            <div
              className="h-full rounded-full bg-sauce transition-all"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
          <p className="mt-1 font-mono text-xs text-carbon/50">
            Etapa {completadas} de {total} · {porcentaje}%
          </p>
        </div>

        {/* Formularios pendientes / respondidos */}
        {token && (
          <FormulariosCliente
            token={token}
            envios={envios}
            parametros={{
              nombre: expediente.cliente,
              primer_apellido: expediente.primerApellido,
              segundo_apellido: expediente.segundoApellido,
              nombre_completo: expediente.nombreCompleto,
              fraccionamiento: expediente.fraccionamiento,
            }}
          />
        )}

        {/* Contacto */}
        <div className="mt-6 rounded-2xl border border-dorado/40 bg-dorado/5 p-5 text-center">
          <p className="text-sm text-carbon/70">
            ¿Tienes dudas sobre tu trámite?
          </p>
          <a
            href="https://wa.me/524771234567"
            className="mt-2 inline-block rounded-md bg-sauce px-4 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo"
          >
            Contactar a mi asesor
          </a>
        </div>

        <p className="mt-6 text-center font-mono text-[11px] text-carbon/40">
          Última actualización: {formatoFecha(expediente.ultimoMovimiento)}
        </p>
      </div>
    </main>
  );
}
