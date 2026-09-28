import { Encabezado } from "@/components/Encabezado";
import { TablaProveedores } from "@/components/TablaProveedores";
import { listarProveedores } from "@/app/actions/proveedores";
import { CATEGORIAS_PROVEEDOR, type Proveedor } from "@/lib/types";
import { obtenerUsuarioActual } from "@/app/actions/usuarios";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Vista de Lista (Index) de Proveedores. */
export default async function PaginaProveedores() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    redirect("/login");
  }

  let proveedores: Proveedor[] = [];

  try {
    proveedores = await listarProveedores();
  } catch (err: any) {
    if (err instanceof Error && err.message.includes("No autorizado")) {
      redirect("/login");
    }
    console.error("Error al cargar proveedores:", err);
  }

  const categoriasSet = new Set<string>(CATEGORIAS_PROVEEDOR);
  proveedores.forEach((p) => {
    if (p.categoria && p.categoria.trim()) categoriasSet.add(p.categoria.trim());
  });
  const categoriasDisponibles = Array.from(categoriasSet);

  const totalPagado = proveedores.reduce((acc, p) => acc + (p.montoTotal || 0), 0);
  const totalDocumentos = proveedores.reduce((acc, p) => acc + (p.totalDocumentos || 0), 0);

  return (
    <main className="min-h-screen pb-12 bg-carbon/5">
      <Encabezado />
      <div className="mx-auto max-w-[1700px] px-4 pt-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-verde-profundo/10 text-base text-verde-profundo border border-verde-profundo/20">
                🧾
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-verde-profundo font-titular">
                Costos de Terceros · Cuentas por Pagar
              </span>
            </div>
            <h1 className="mt-1 font-titular text-3xl font-bold text-carbon">Proveedores</h1>
            <p className="mt-1 text-xs text-carbon/60 max-w-xl">
              Registra a tus proveedores y contratistas, y liga sus facturas o remisiones a la orden de
              trabajo/cotización correspondiente para conocer el costo real pagado a terceros por cada
              proyecto.
            </p>
          </div>

          <div className="flex gap-3">
            <div className="rounded-xl border border-carbon/10 bg-white px-4 py-2.5 text-right shadow-xs">
              <div className="text-[10px] font-semibold uppercase text-carbon/50">Documentos Registrados</div>
              <div className="font-mono text-lg font-bold text-carbon">{totalDocumentos}</div>
            </div>
            <div className="rounded-xl border border-carbon/10 bg-white px-4 py-2.5 text-right shadow-xs">
              <div className="text-[10px] font-semibold uppercase text-carbon/50">Total Pagado a Proveedores</div>
              <div className="font-mono text-lg font-bold text-rojo">
                {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(totalPagado)}
              </div>
            </div>
          </div>
        </div>

        <TablaProveedores proveedoresIniciales={proveedores} categoriasDisponibles={categoriasDisponibles} />
      </div>
    </main>
  );
}
