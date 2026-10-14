import type { ConvenioAliado } from "@/app/actions/aliados";
import { fechaLarga } from "@/lib/contratos";

/** Texto del convenio de comisión compartida (para leer o imprimir). */
export function DocumentoConvenio({ convenio }: { convenio: ConvenioAliado }) {
  return (
    <article className="mx-auto max-w-2xl bg-white px-6 py-8 text-[13px] leading-relaxed text-carbon shadow-sm print:shadow-none">
      <p className="text-right font-mono text-xs text-carbon/50">{convenio.folio}</p>
      <h1 className="mb-6 text-center font-titular text-lg font-bold">{convenio.convenio.titulo}</h1>
      {convenio.convenio.clausulas.map((c, i) => (
        <section key={c.titulo} className="mb-4">
          <h2 className="mb-1 font-bold uppercase">
            {i === 0 ? c.titulo : `${["Primera", "Segunda", "Tercera", "Cuarta", "Quinta", "Sexta", "Séptima", "Octava"][i - 1] ?? i}. ${c.titulo}`}
          </h2>
          <p className="whitespace-pre-line text-justify">{c.texto}</p>
        </section>
      ))}
      <div className="mt-12 grid grid-cols-2 gap-10 text-center text-xs">
        <div className="border-t border-carbon pt-2">SAUCEDA</div>
        <div className="border-t border-carbon pt-2">{convenio.aliado}</div>
      </div>
      <p className="mt-6 text-center text-[11px] text-carbon/50">
        {convenio.estado === "firmado" && convenio.fechaFirma
          ? `Firmado el ${fechaLarga(convenio.fechaFirma)}.`
          : `Generado el ${fechaLarga(convenio.fechaGeneracion)}. Pendiente de firma.`}
      </p>
    </article>
  );
}
