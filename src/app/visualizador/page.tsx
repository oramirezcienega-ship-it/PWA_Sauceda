import { Metadata } from "next";
import { VisualizerAndEstimator } from "@/components/VisualizerAndEstimator";
import Link from "next/link";
import { MARCA } from "@/lib/marca";

export const metadata: Metadata = {
  title: "Visualizador de Fachadas y Cotizador IA | Portones y Pérgolas · SAUCEDA",
  description:
    "Sube una foto de tu cochera o patio, estima dimensiones métricas en m² con IA, cotiza en tiempo real y visualiza cómo lucirá tu portón o pérgola antes de fabricar.",
};

export default function PaginaVisualizador() {
  return (
    <main className="min-h-screen bg-slate-50/50 pb-16 font-cuerpo">
      {/* Barra superior institucional SAUCEDA */}
      <header className="bg-white border-b border-carbon/10 sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-verde-profundo text-white font-titular font-black flex items-center justify-center text-sm shadow-sm">
                S
              </span>
              <div>
                <span className="font-titular font-bold text-verde-profundo tracking-tight text-base block leading-none">
                  SAUCEDA
                </span>
                <span className="text-[10px] text-carbon/60 font-semibold tracking-wider uppercase block">
                  Construye & Herrería
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={`https://wa.me/${MARCA.whatsapp}?text=${encodeURIComponent(
                "Hola SAUCEDA, tengo una duda sobre el visualizador de portones y pérgolas."
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
            >
              <span>💬</span>
              <span className="hidden sm:inline">WhatsApp directo</span>
              <span className="sm:hidden">WhatsApp</span>
            </a>
          </div>
        </div>
      </header>

      {/* Contenido principal con el visualizador */}
      <div className="max-w-5xl mx-auto px-4 pt-6 sm:pt-8">
        <VisualizerAndEstimator />

        {/* Sección Informativa y de Confianza */}
        <section className="mt-12 pt-8 border-t border-carbon/10">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h3 className="font-titular font-bold text-xl sm:text-2xl text-verde-profundo">
              ¿Por qué cotizar y fabricar con SAUCEDA?
            </h3>
            <p className="text-xs sm:text-sm text-carbon/70 mt-1">
              Herrería contemporánea, pérgolas estructurales y acabados arquitectónicos en León y el Bajío.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-carbon/10 shadow-xs">
              <span className="text-2xl mb-2 block">📐</span>
              <h4 className="font-bold text-sm text-carbon mb-1">
                Validación Técnica en Sitio
              </h4>
              <p className="text-xs text-carbon/60">
                Un perito técnico visita tu domicilio sin costo para calibrar niveles, plomos y anclajes con rayo láser.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-carbon/10 shadow-xs">
              <span className="text-2xl mb-2 block">🛡️</span>
              <h4 className="font-bold text-sm text-carbon mb-1">
                Garantía por Escrito de 3 a 10 Años
              </h4>
              <p className="text-xs text-carbon/60">
                Pintura anticorrosiva grado automotriz / electrostática y soldadura de microalambre con desbaste estético.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-carbon/10 shadow-xs">
              <span className="text-2xl mb-2 block">⚡</span>
              <h4 className="font-bold text-sm text-carbon mb-1">
                Automatización Certificada
              </h4>
              <p className="text-xs text-carbon/60">
                Motores Merik y LiftMaster residenciales e industriales con controles de largo alcance y respaldo de refacciones.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
