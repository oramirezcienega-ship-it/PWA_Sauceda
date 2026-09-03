import { Encabezado } from "@/components/Encabezado";

export const dynamic = "force-dynamic";

export default function PaginaChatwoot() {
  return (
    <main className="min-h-screen flex flex-col pb-4 bg-crema/10">
      <Encabezado />
      <div className="flex-1 mx-auto w-full max-w-7xl px-4 pt-4 flex flex-col">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-titular text-2xl font-semibold text-verde-profundo flex items-center gap-2">
              <span>💬 Chatwoot</span>
              <span className="text-[11px] font-bold uppercase tracking-wider bg-sauce/20 text-verde-profundo px-2 py-0.5 rounded-full">
                Multicanal
              </span>
            </h1>
            <p className="text-xs text-carbon/60 mt-0.5">
              Consola central de conversaciones con clientes (WhatsApp, Facebook, Instagram y Web).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://chatwoot.saucedamx.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-verde-profundo hover:bg-verde-profundo/90 text-white text-xs font-bold shadow-xs transition"
            >
              <span>Abrir en Pantalla Completa</span>
              <span>↗</span>
            </a>
          </div>
        </div>

        {/* Contenedor del iFrame con tarjeta de soporte */}
        <div className="flex-1 rounded-xl border border-carbon/15 bg-white overflow-hidden shadow-xs flex flex-col h-[calc(100vh-190px)] min-h-[500px]">
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
