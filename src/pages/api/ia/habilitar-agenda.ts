import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secretToken = process.env.CRON_SECRET || "saucedamkt2026sec";
  const tokenQuery = req.query.token;

  if (tokenQuery !== secretToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const sb = supabaseServidor();
    console.log("[Habilitar Agenda] Buscando perfil 'Alex' o 'Alejandro' en staging...");

    // 1. Buscar perfil
    let { data: perfil, error: errFind } = await sb
      .from("perfiles")
      .select("*")
      .or("nombre.ilike.%Alex%,nombre.ilike.%Alejandro%")
      .maybeSingle();

    if (errFind) {
      console.error("Error buscando perfil:", errFind);
    }

    const defaultHorarios = {
      lunes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      martes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      miercoles: [{ inicio: "09:00:00", fin: "18:00:00" }],
      jueves: [{ inicio: "09:00:00", fin: "18:00:00" }],
      viernes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      sabado: [{ inicio: "09:00:00", fin: "14:00:00" }], // Agregamos sábado también
      domingo: []
    };

    if (!perfil) {
      console.log("[Habilitar Agenda] No existe perfil Alex. Creándolo...");
      // Si no existe, lo creamos
      const { data: nuevoPerfil, error: errCreate } = await sb
        .from("perfiles")
        .insert({
          nombre: "Alejandro Operario",
          correo: "alejandro.test@saucedamx.com",
          activo: true,
          rol: "asesor",
          horarios_agenda: defaultHorarios,
          duracion_cita: 60
        })
        .select()
        .single();

      if (errCreate) {
        throw new Error(`Error al crear perfil de Alex: ${errCreate.message}`);
      }
      perfil = nuevoPerfil;
    } else {
      console.log("[Habilitar Agenda] Perfil encontrado. Habilitándolo y configurando disponibilidad...");
      // Si existe, lo activamos y le damos horarios completos
      const { error: errUpdate } = await sb
        .from("perfiles")
        .update({
          activo: true,
          horarios_agenda: defaultHorarios,
          duracion_cita: 60
        })
        .eq("id", perfil.id);

      if (errUpdate) {
        throw new Error(`Error al actualizar perfil de Alex: ${errUpdate.message}`);
      }
    }

    // 2. Limpiar bloqueos de agenda de la próxima semana para este perfil
    console.log(`[Habilitar Agenda] Limpiando bloqueos en agenda_bloqueos para Alex (${perfil.id})...`);
    const { error: errDeleteBloqueos } = await sb
      .from("agenda_bloqueos")
      .delete()
      .eq("perfil_id", perfil.id);

    if (errDeleteBloqueos) {
      console.warn("Advertencia al limpiar bloqueos:", errDeleteBloqueos.message);
    }

    // 3. Limpiar citas agendadas previas para liberar los horarios de la próxima semana
    console.log(`[Habilitar Agenda] Limpiando citas agendadas previas para Alex para despejar horarios...`);
    const { error: errDeleteCitas } = await sb
      .from("agenda_citas")
      .delete()
      .eq("perfil_id", perfil.id);

    if (errDeleteCitas) {
      console.warn("Advertencia al limpiar citas:", errDeleteCitas.message);
    }

    return res.status(200).json({
      ok: true,
      mensaje: `Agenda de Alejandro (Alex) habilitada al 100% de lunes a sábado de 9:00 a 18:00 en Staging.`,
      perfilId: perfil.id,
      nombre: perfil.nombre
    });
  } catch (err) {
    console.error("[Habilitar Agenda] Error general:", err);
    return res.status(500).json({ error: String(err) });
  }
}
