import { ConfiguradorProcesosClient } from "@/components/ConfiguradorProcesosClient";

export const metadata = {
  title: "Configurador de Procesos | SAUCEDA CRM",
  description: "Configurador parametrizable de etapas, SLAs, reglas IF/THEN y automatizaciones de procesos.",
};

export default function PaginaConfiguradorProcesos() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <ConfiguradorProcesosClient />
    </div>
  );
}
