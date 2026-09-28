import { Metadata } from "next";
import {
  listarComisiones,
  listarPagosComisiones,
  listarReglasComision,
  obtenerResumenEstadoCuenta,
} from "@/app/actions/comisiones";
import { listarAsesoresActivos } from "@/app/actions/usuarios";
import { ModuloComisiones } from "@/components/comisiones/ModuloComisiones";

export const metadata: Metadata = {
  title: "Módulo de Comisiones · Sauceda",
  description: "Control de comisiones de asesores, remisiones, facturas, balance y estado de cuenta.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ComisionesPage() {
  const [comisiones, pagos, reglas, resumen, asesores] = await Promise.all([
    listarComisiones().catch((err) => {
      console.error("Error al cargar comisiones iniciales:", err);
      return [];
    }),
    listarPagosComisiones().catch(() => []),
    listarReglasComision().catch(() => []),
    obtenerResumenEstadoCuenta().catch(() => ({
      general: {
        totalVentas: 0,
        totalComisiones: 0,
        totalPagado: 0,
        saldoPendiente: 0,
        comisionesCount: 0,
        pendientesCount: 0,
      },
      porAsesor: [],
    })),
    listarAsesoresActivos().catch(() => []),
  ]);

  return (
    <main className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <ModuloComisiones
          comisionesIniciales={comisiones}
          pagosIniciales={pagos}
          reglasIniciales={reglas}
          resumenInicial={resumen}
          asesores={asesores}
        />
      </div>
    </main>
  );
}
