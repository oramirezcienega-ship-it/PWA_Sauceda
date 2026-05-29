"use client";

import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/cliente-navegador";

/** Botón para cerrar la sesión del admin. */
export function CerrarSesion() {
  const router = useRouter();

  async function salir() {
    await supabaseNavegador().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={salir}
      className="rounded-md border border-crema/30 px-3 py-1.5 text-xs text-crema/90 transition hover:bg-crema/10"
    >
      Cerrar sesión
    </button>
  );
}
