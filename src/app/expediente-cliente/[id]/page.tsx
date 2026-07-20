import { DashboardExpediente } from "@/components/DashboardExpediente";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
  searchParams: { token?: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: `SAUCEDA · Tu Expediente ${params.id}`,
    description: "Revisa y confirma la información de tu propiedad en SAUCEDA Bienes Raíces.",
  };
}

export default function PaginaDashboardCliente({ params, searchParams }: Props) {
  const token = searchParams.token ?? "";

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow border border-carbon/10 space-y-4">
          <div className="text-4xl">🔒</div>
          <h2 className="text-xl font-bold text-verde-profundo font-titular">Enlace inválido</h2>
          <p className="text-sm text-carbon/60 leading-relaxed font-cuerpo">
            El enlace que usaste no es válido. Por favor usa el link que te enviamos por WhatsApp.
          </p>
          <a
            href="https://wa.me/524771234567"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-sauce text-white px-6 py-3 rounded-xl font-semibold text-sm"
          >
            💬 Contactar a Sofía
          </a>
        </div>
      </main>
    );
  }

  return <DashboardExpediente expedienteId={params.id} token={token} />;
}
