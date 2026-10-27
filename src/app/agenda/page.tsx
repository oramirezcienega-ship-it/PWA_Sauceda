import { obtenerUsuarioActual, listarAsesoresActivos } from "@/app/actions/usuarios";
import { AgendaContenedorTabs } from "@/components/AgendaContenedorTabs";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PaginaAgendaAdministrativa() {
  const usuario = await obtenerUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  // Si es administrador, obtenemos todos los asesores activos para que pueda visualizar sus agendas
  let asesoresActivos: { id: string; nombre: string }[] = [];
  if (usuario.rol === "admin") {
    try {
      asesoresActivos = await listarAsesoresActivos();
    } catch (err) {
      console.error("Error al listar asesores activos:", err);
    }
  }

  const siteUrl = process.env.SITE_URL || "http://localhost:3000";

  return (
    <main className="min-h-screen pb-10">
      <div className="mx-auto max-w-[1300px] px-4 pt-5">
        <AgendaContenedorTabs
          usuarioActual={{
            id: usuario.id,
            nombre: usuario.nombre,
            rol: usuario.rol,
          }}
          asesoresActivos={asesoresActivos}
          siteUrl={siteUrl}
        />
      </div>
    </main>
  );
}
