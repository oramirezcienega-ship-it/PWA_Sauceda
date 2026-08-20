import { Encabezado } from "@/components/Encabezado";

export const dynamic = "force-dynamic";

export default function PaginaChatwoot() {
  return (
    <main className="min-h-screen flex flex-col pb-4">
      <Encabezado />
      <div className="flex-1 mx-auto w-full max-w-7xl px-4 pt-4 flex flex-col">
        <div className="mb-4">
          <h1 className="font-titular text-2xl font-semibold text-verde-profundo">
            Chatwoot (Nuevo)
          </h1>
          <p className="text-xs text-carbon/60">
            Consola central de conversaciones de clientes.
          </p>
        </div>

        <div className="flex-1 rounded-lg border border-carbon/10 bg-white overflow-hidden shadow-sm flex flex-col h-[calc(100vh-180px)]">
          <iframe
            src="https://chatwoot.saucedamx.com"
            className="w-full flex-1 border-0"
            allow="camera; microphone; clipboard-read; clipboard-write; geolocation"
          />
        </div>
      </div>
    </main>
  );
}
