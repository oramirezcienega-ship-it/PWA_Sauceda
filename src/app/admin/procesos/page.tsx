import { ConfiguradorProcesosClient } from "@/components/ConfiguradorProcesosClient";
import { listarProcesosMaestros, obtenerProcesoCompleto } from "@/app/actions/procesos-configuracion";

export const metadata = {
  title: "Configurador de Procesos | SAUCEDA CRM",
  description: "Configurador parametrizable de etapas, SLAs, reglas IF/THEN y automatizaciones de procesos.",
};

export const dynamic = "force-dynamic";

export default async function PaginaConfiguradorProcesos() {
  const procesosIniciales = await listarProcesosMaestros();
  let procesoInicialCompleto = null;

  if (procesosIniciales.length > 0) {
    const imp = procesosIniciales.find((p) => p.tipoNegocio === "impermeabilizacion");
    const targetId = imp ? imp.id : procesosIniciales[0].id;
    procesoInicialCompleto = await obtenerProcesoCompleto(targetId);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <ConfiguradorProcesosClient
        procesosIniciales={procesosIniciales}
        procesoInicialCompleto={procesoInicialCompleto}
      />
    </div>
  );
}
