"use server";

import { requireAdmin } from "@/lib/supabase/cliente-sesion";
import { obtenerProspecto } from "@/app/actions/prospectos";
import { listarPerfilesActivos } from "@/app/actions/usuarios";

export interface DatosCoordinacionProspecto {
  prospectoId: string;
  expedienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  tipoNegocioInicial?: string;
  ubicacionInicial: string;
  detallesIniciales?: string;
  perfiles: { id: string; nombre: string; rol: string; telefono?: string | null; telefono_whatsapp?: string | null }[];
  asesorPredefinidoId: string | null;
  operadorPredefinidoId: string | null;
}

/**
 * Datos que necesita la Cabina de Coordinación de Inspección para un prospecto,
 * para poder abrirla desde otras pantallas (p. ej. desde una conversación).
 */
export async function obtenerDatosCoordinacionProspecto(
  prospectoId: string
): Promise<{ ok: boolean; datos?: DatosCoordinacionProspecto; error?: string }> {
  try {
    await requireAdmin();
    const resultado = await obtenerProspecto(prospectoId);
    if (!resultado) return { ok: false, error: "No se encontró el prospecto de esta conversación." };

    const { prospecto, expedientes } = resultado;
    const perfiles = await listarPerfilesActivos();

    return {
      ok: true,
      datos: {
        prospectoId: prospecto.id,
        expedienteId: expedientes[0]?.id ?? null,
        clienteNombre: prospecto.nombreCompleto,
        clienteTelefono: prospecto.telefono || "",
        tipoNegocioInicial: prospecto.tipoNegocioPrincipal || expedientes[0]?.tipoNegocio || undefined,
        ubicacionInicial:
          expedientes[0]?.fraccionamiento || prospecto.direccion || prospecto.ciudad || "León, Gto.",
        detallesIniciales: prospecto.notas || undefined,
        perfiles,
        asesorPredefinidoId: prospecto.asesorId ?? null,
        operadorPredefinidoId: prospecto.operadorId ?? null,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Error al cargar los datos del prospecto." };
  }
}
