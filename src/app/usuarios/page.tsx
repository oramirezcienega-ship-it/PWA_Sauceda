import Link from "next/link";
import { Encabezado } from "@/components/Encabezado";
import { TablaUsuarios } from "@/components/TablaUsuarios";
import { listarUsuarios, obtenerUsuarioActual } from "@/app/actions/usuarios";

export const dynamic = "force-dynamic";

/** Panel de administración de usuarios (solo administradores). */
export default async function PaginaUsuarios() {
  const userActual = await obtenerUsuarioActual();
  const usuarioActualId = userActual?.id || "";
  let usuarios;
  try {
    usuarios = await listarUsuarios();
  } catch (err) {
    const mensaje =
      err instanceof Error ? err.message : "No se pudo cargar.";
    return (
      <main className="min-h-screen pb-10">
        <Encabezado />
        <div className="mx-auto max-w-4xl px-4 pt-5">
          <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
            Usuarios
          </h1>
          <p className="mt-4 rounded-lg border border-rojo/30 bg-rojo/10 px-4 py-3 text-sm text-rojo">
            {mensaje.includes("administrador")
              ? "Solo los administradores pueden gestionar usuarios."
              : `No se pudo cargar. Si es la primera vez, corre la migración 0010_perfiles.sql. (${mensaje})`}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-10">
      <Encabezado />
      <div className="mx-auto max-w-4xl px-4 pt-5">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-titular text-3xl font-semibold text-verde-profundo">
              Usuarios
            </h1>
            <p className="mt-1 text-sm text-carbon/60">
              Equipo operativo: nombre, rol y estado.
            </p>
          </div>
          <Link
            href="/usuarios/nuevo"
            className="rounded-md bg-sauce px-4 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo"
          >
            + Nuevo usuario
          </Link>
        </div>

        <TablaUsuarios inicial={usuarios} usuarioActualId={usuarioActualId} />
      </div>
    </main>
  );
}
