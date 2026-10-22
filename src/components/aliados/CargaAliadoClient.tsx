"use client";

import { useState } from "react";
import {
  enviarInmuebleAliado,
  marcarSinResultadosAliado,
  prepararSubidaFotoAliado,
  type ContextoCarga,
} from "@/app/actions/aliados";
import { formatoPesos } from "@/lib/formato";
import { ETIQUETA_CREDITO } from "@/lib/asesoria/match";
import { formatoFechaLimite } from "@/lib/asesoria/aliados";
import { FormularioInmuebleRapido } from "@/components/asesoria-compra/FormularioInmuebleRapido";

type Busqueda = NonNullable<ContextoCarga["busqueda"]>;

/** Link de carga del aliado: subir varias casas seguidas desde el celular. */
export function CargaAliadoClient({
  token,
  aliadoNombre,
  busqueda,
}: {
  token: string;
  aliadoNombre: string;
  busqueda: Busqueda | null;
}) {
  const [enviadas, setEnviadas] = useState<string[]>([]);
  const [formKey, setFormKey] = useState(0);
  const [sinResultados, setSinResultados] = useState(busqueda?.estado === "sin_resultados");
  const c = busqueda?.criterios;
  const vencida = busqueda?.estado === "vencida";

  const rango =
    c?.precio_min && c?.precio_max
      ? `${formatoPesos(c.precio_min)} a ${formatoPesos(c.precio_max)}`
      : c?.precio_max
      ? `hasta ${formatoPesos(c.precio_max)}`
      : null;

  return (
    <div className="mx-auto max-w-lg px-4">
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-carbon/10 bg-verde-profundo px-4 py-3 text-crema">
        <p className="text-[11px] uppercase tracking-wider text-dorado">SAUCEDA · Aliados</p>
        <p className="font-titular text-lg">Hola, {aliadoNombre}</p>
      </header>

      {busqueda && c && (
        <section className="mb-4 rounded-xl border border-violet-200 bg-white p-4 text-sm shadow-sm">
          <p className="mb-2 text-xs font-bold uppercase text-violet-900">Lo que busca el comprador</p>
          <ul className="space-y-1 text-carbon/80">
            <li>📍 <strong>Zona:</strong> {c.zonas.length ? c.zonas.join(", ") : "León (abierta)"}</li>
            {rango && <li>💰 <strong>Rango:</strong> {rango}</li>}
            <li>🏦 <strong>Crédito:</strong> {c.tipo_credito ? ETIQUETA_CREDITO[c.tipo_credito] : "por definir"}</li>
            <li>🛏️ <strong>Recámaras:</strong> {c.recamaras_min ? `${c.recamaras_min} o más` : "indistinto"}</li>
            {c.requisitos && <li>📝 <strong>Requisitos:</strong> {c.requisitos}</li>}
            <li>⏰ <strong>Fecha límite:</strong> {formatoFechaLimite(busqueda.fechaLimite)}</li>
          </ul>
          {vencida && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              La fecha límite ya pasó, pero todavía puedes enviar casas: las revisaremos.
            </p>
          )}
          {!sinResultados && enviadas.length === 0 && busqueda.inmueblesRecibidos === 0 && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("¿Confirmas que no tienes casas para esta búsqueda?")) return;
                const r = await marcarSinResultadosAliado(token, busqueda.id);
                if (r.ok) setSinResultados(true);
              }}
              className="mt-3 w-full rounded-md border border-carbon/15 px-3 py-2 text-xs text-carbon/60"
            >
              🚫 No tengo casas para esta búsqueda
            </button>
          )}
          {sinResultados && (
            <p className="mt-2 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-700">
              Registramos que no tienes casas para esta búsqueda. Si consigues una, súbela aquí mismo.
            </p>
          )}
        </section>
      )}

      {enviadas.length > 0 && (
        <section className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          ✅ {enviadas.length} casa{enviadas.length === 1 ? "" : "s"} enviada{enviadas.length === 1 ? "" : "s"}: {enviadas.join(", ")}.
          <br />
          <span className="text-xs">Puedes subir otra abajo.</span>
        </section>
      )}

      <section className="rounded-xl border border-carbon/10 bg-white p-4 shadow-sm">
        <h1 className="mb-1 font-titular text-lg text-verde-profundo">
          {enviadas.length > 0 ? "Subir otra casa" : "Subir una casa"}
        </h1>
        <p className="mb-3 text-xs text-carbon/60">
          Toma 2 minutos: precio, zona, datos básicos y de 5 a 15 fotos. La dirección solo la ve SAUCEDA.
        </p>
        <FormularioInmuebleRapido
          key={formKey}
          modo="aliado"
          minimoFotos={5}
          maximoFotos={15}
          preparar={(nombre) => prepararSubidaFotoAliado(token, nombre)}
          onGuardar={async (datos) => {
            const r = await enviarInmuebleAliado(token, busqueda?.id ?? null, datos);
            if (r.ok && r.folio) {
              setEnviadas((x) => [...x, r.folio!]);
              setFormKey((k) => k + 1);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
            return { ok: r.ok, mensaje: r.mensaje };
          }}
        />
      </section>

      <p className="mt-6 text-center text-[11px] text-carbon/40">
        El cliente es presentado por SAUCEDA; todo contacto es a través de nosotros.
      </p>
    </div>
  );
}
