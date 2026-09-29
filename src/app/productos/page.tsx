import { Encabezado } from "@/components/Encabezado";
import { ProductosClient } from "@/components/productos/ProductosClient";
import { 
  listarProductosServicios, 
  listarInsumos, 
  obtenerCentrosCosto, 
  obtenerReporteVentasProductos 
} from "@/app/actions/productos";
import { usuarioActual } from "@/lib/supabase/cliente-sesion";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PaginaProductos() {
  const usuario = await usuarioActual().catch(() => null);
  if (!usuario) {
    redirect("/login");
  }

  let productos = [];
  let insumos = [];
  let centrosCosto = [];
  let metricasVenta = {
    metricas: [],
    resumen: {
      totalUnidades: 0,
      totalIngresos: 0,
      totalCosto: 0,
      totalUtilidad: 0,
      margenPromedioPct: 0,
    },
  };

  try {
    const [prodsRes, insRes, ccRes, repRes] = await Promise.all([
      listarProductosServicios(),
      listarInsumos(),
      obtenerCentrosCosto(),
      obtenerReporteVentasProductos(),
    ]);

    productos = prodsRes;
    insumos = insRes;
    centrosCosto = ccRes;
    metricasVenta = repRes;
  } catch (err) {
    console.error("Error al cargar módulo de productos:", err);
  }

  return (
    <main className="min-h-screen pb-10 bg-slate-50/30">
      <Encabezado />
      <div className="mx-auto max-w-[1700px] px-4 pt-5">
        <div className="mb-6 border-b border-carbon/10 pb-4">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            Productos y Servicios
          </h1>
          <p className="mt-1 text-sm text-carbon/60 font-cuerpo">
            Catálogo maestro comercial, insumos base para costeo APU, galería de obras para Sofía (IA) y rentabilidad por centro de costos.
          </p>
        </div>

        <ProductosClient
          productosIniciales={productos}
          insumosIniciales={insumos}
          centrosCosto={centrosCosto}
          metricasVenta={metricasVenta}
        />
      </div>
    </main>
  );
}
