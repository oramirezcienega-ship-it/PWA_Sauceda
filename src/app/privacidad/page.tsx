import type { Metadata } from "next";
import { MARCA } from "@/lib/marca";

export const metadata: Metadata = {
  title: "Aviso de Privacidad · SAUCEDA Bienes Raíces",
  description:
    "Aviso de privacidad de SAUCEDA Bienes Raíces sobre el tratamiento de datos personales.",
};

/**
 * Aviso de privacidad PÚBLICO (sin login). Sirve como URL de política de
 * privacidad para Meta / WhatsApp Business y para los clientes.
 */
export default function PrivacidadPage() {
  const actualizado = "5 de junio de 2026";
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-carbon">
      <header className="mb-8 border-b border-carbon/10 pb-6">
        <h1 className="font-display text-3xl font-semibold text-verde-profundo">
          Aviso de Privacidad
        </h1>
        <p className="mt-2 text-sm text-carbon/60">
          SAUCEDA Bienes Raíces · León, Guanajuato, México
        </p>
        <p className="mt-1 text-xs text-carbon/40">
          Última actualización: {actualizado}
        </p>
      </header>

      <div className="space-y-6 text-sm leading-relaxed text-carbon/80">
        <section>
          <h2 className="mb-2 font-titular text-lg font-medium text-verde-profundo">
            1. Responsable del tratamiento
          </h2>
          <p>
            SAUCEDA Bienes Raíces (en adelante &ldquo;SAUCEDA&rdquo;), con
            domicilio en León, Guanajuato, México, es responsable del uso y
            protección de sus datos personales conforme a este Aviso de
            Privacidad y a la Ley Federal de Protección de Datos Personales en
            Posesión de los Particulares.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-titular text-lg font-medium text-verde-profundo">
            2. Datos que recopilamos
          </h2>
          <p>
            Podemos recopilar: nombre, número telefónico, correo electrónico,
            mensajes que usted nos envía (incluidos los enviados por WhatsApp) e
            información relacionada con el trámite de traspaso o crédito
            INFONAVIT que solicite.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-titular text-lg font-medium text-verde-profundo">
            3. Finalidad del tratamiento
          </h2>
          <p>Usamos sus datos para:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Atender sus solicitudes y dar seguimiento a su trámite.</li>
            <li>
              Comunicarnos con usted por WhatsApp, llamada o correo, incluyendo
              respuestas automáticas de atención.
            </li>
            <li>
              Brindarle información sobre propiedades, traspasos y servicios
              inmobiliarios.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-titular text-lg font-medium text-verde-profundo">
            4. Mensajería por WhatsApp
          </h2>
          <p>
            Al escribirnos por WhatsApp, sus mensajes se procesan a través de la
            plataforma de WhatsApp Business (Meta Platforms, Inc.) para poder
            atenderle. El tratamiento de datos por parte de Meta se rige también
            por sus propias políticas de privacidad. No compartimos sus datos
            con terceros con fines de venta o publicidad ajena a SAUCEDA.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-titular text-lg font-medium text-verde-profundo">
            5. Conservación de los datos
          </h2>
          <p>
            Conservamos sus datos únicamente durante el tiempo necesario para
            cumplir las finalidades descritas y las obligaciones legales
            aplicables.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-titular text-lg font-medium text-verde-profundo">
            6. Derechos ARCO
          </h2>
          <p>
            Usted puede solicitar el Acceso, Rectificación, Cancelación u
            Oposición (derechos ARCO) al tratamiento de sus datos personales, así
            como revocar su consentimiento, escribiéndonos a los datos de
            contacto que aparecen abajo.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-titular text-lg font-medium text-verde-profundo">
            7. Contacto
          </h2>
          <p>
            Para cualquier asunto relacionado con sus datos personales o este
            aviso, contáctenos:
          </p>
          <ul className="mt-2 space-y-1">
            <li>
              WhatsApp / Teléfono:{" "}
              <span className="font-medium text-carbon">
                {MARCA.whatsappTexto}
              </span>
            </li>
            <li>
              Sitio web:{" "}
              <a
                href={MARCA.web}
                className="text-sauce underline hover:text-verde-profundo"
              >
                {MARCA.web}
              </a>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-titular text-lg font-medium text-verde-profundo">
            8. Cambios a este aviso
          </h2>
          <p>
            Este Aviso de Privacidad puede actualizarse. Publicaremos cualquier
            cambio en esta misma página.
          </p>
        </section>
      </div>

      <footer className="mt-10 border-t border-carbon/10 pt-5 text-center text-xs text-carbon/40">
        © {new Date().getFullYear()} SAUCEDA Bienes Raíces. Todos los derechos
        reservados.
      </footer>
    </main>
  );
}
