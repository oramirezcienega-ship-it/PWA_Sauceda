import type { Metadata } from "next";
import { obtenerPortalCliente } from "@/app/actions/asesoria-compra";
import { TusOpciones } from "@/components/asesoria-compra/TusOpciones";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu proceso · SAUCEDA",
  robots: { index: false, follow: false },
};

/**
 * Portal del cliente por `expedientes.token` (es el enlace que se envía en la
 * bienvenida y en las notificaciones). Muestra el avance del proceso y, en la
 * asesoría de compra, la sección "Tus opciones".
 */
export default async function PaginaSeguimiento({ params }: { params: { token: string } }) {
  const portal = await obtenerPortalCliente(params.token);

  if (!portal.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-crema px-4">
        <div className="max-w-sm rounded-xl border border-carbon/10 bg-white p-6 text-center shadow-sm">
          <p className="text-3xl">🔒</p>
          <p className="mt-2 font-titular text-lg text-verde-profundo">Enlace no válido</p>
          <p className="mt-1 text-sm text-carbon/60">{portal.mensaje}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-crema pb-12">
      <header className="bg-verde-profundo px-4 py-5 text-crema">
        <div className="mx-auto max-w-3xl">
          <p className="text-[11px] uppercase tracking-wider text-dorado">SAUCEDA Bienes Raíces</p>
          <h1 className="font-titular text-2xl">Hola{portal.primerNombre ? `, ${portal.primerNombre}` : ""}</h1>
          {portal.asesorNombre && <p className="text-sm text-crema/70">Tu asesor: {portal.asesorNombre}</p>}
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 pt-5">
        <section className="rounded-xl border border-carbon/10 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-carbon/50">Estatus de tu proceso</p>
          <p className="mt-1 font-titular text-xl text-verde-profundo">{portal.etapaNombre}</p>
          {portal.etapaDescripcion && <p className="mt-1 text-sm text-carbon/70">{portal.etapaDescripcion}</p>}
          {portal.pasos && portal.pasos.length > 0 && (
            <ol className="mt-4 flex flex-wrap gap-x-1 gap-y-2">
              {portal.pasos.map((p, i) => (
                <li key={p.id} className="flex items-center gap-1 text-[11px]">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                      p.estado === "hecho"
                        ? "bg-sauce text-crema"
                        : p.estado === "actual"
                        ? "bg-cielo text-white"
                        : "bg-carbon/10 text-carbon/40"
                    }`}
                  >
                    {p.estado === "hecho" ? "✓" : i + 1}
                  </span>
                  <span className={p.estado === "actual" ? "font-semibold text-carbon" : "text-carbon/50"}>{p.nombre}</span>
                  {i < portal.pasos!.length - 1 && <span className="mx-1 text-carbon/20">›</span>}
                </li>
              ))}
            </ol>
          )}
        </section>

        {(portal.procesos ?? []).map((proc) => (
          <div key={proc.folio} className="space-y-4">
            <section className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-violet-900">{proc.titulo}</p>
              <p className="mt-1 font-titular text-xl text-verde-profundo">{proc.etapaNombre}</p>
              {proc.etapaDescripcion && <p className="mt-1 text-sm text-carbon/70">{proc.etapaDescripcion}</p>}
              <ol className="mt-4 flex flex-wrap gap-x-1 gap-y-2">
                {proc.pasos.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-1 text-[11px]">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                        p.estado === "hecho"
                          ? "bg-sauce text-crema"
                          : p.estado === "actual"
                          ? "bg-cielo text-white"
                          : "bg-carbon/10 text-carbon/40"
                      }`}
                    >
                      {p.estado === "hecho" ? "✓" : i + 1}
                    </span>
                    <span className={p.estado === "actual" ? "font-semibold text-carbon" : "text-carbon/50"}>{p.nombre}</span>
                    {i < proc.pasos.length - 1 && <span className="mx-1 text-carbon/20">›</span>}
                  </li>
                ))}
              </ol>
            </section>
            {proc.conOpciones && <TusOpciones token={params.token} opciones={proc.opciones} />}
          </div>
        ))}

        <p className="text-center text-[11px] text-carbon/40">
          ¿Dudas? Responde al WhatsApp de SAUCEDA y con gusto te ayudamos.
        </p>
      </div>
    </main>
  );
}
