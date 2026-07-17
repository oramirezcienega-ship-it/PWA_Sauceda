import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secretToken = process.env.CRON_SECRET || "saucedamkt2026sec";
  const tokenQuery = req.query.token;

  if (tokenQuery !== secretToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const email = "alex_cordova_barajas@hotmail.com";

  try {
    const sb = supabaseServidor();
    console.log(`[Reset Usuario] Buscando perfil para: ${email} en Staging...`);

    // 1. Buscar y resetear perfil de base de datos
    const { data: perfil, error: errFind } = await sb
      .from("perfiles")
      .select("*")
      .eq("correo", email)
      .maybeSingle();

    if (errFind) {
      console.error("Error al buscar perfil:", errFind);
    }

    const defaultHorarios = {
      lunes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      martes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      miercoles: [{ inicio: "09:00:00", fin: "18:00:00" }],
      jueves: [{ inicio: "09:00:00", fin: "18:00:00" }],
      viernes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      sabado: [{ inicio: "09:00:00", fin: "14:00:00" }],
      domingo: []
    };

    if (perfil) {
      console.log(`[Reset Usuario] Perfil encontrado (ID: ${perfil.id}). Restableciendo disponibilidad y citas...`);
      
      // Habilitar horarios y poner activo
      await sb
        .from("perfiles")
        .update({
          activo: true,
          horarios_agenda: defaultHorarios,
          duracion_cita: 60
        })
        .eq("id", perfil.id);

      // Limpiar bloqueos y citas
      await sb.from("agenda_bloqueos").delete().eq("perfil_id", perfil.id);
      await sb.from("agenda_citas").delete().eq("perfil_id", perfil.id);
    } else {
      console.log("[Reset Usuario] No se encontró perfil en base de datos para este correo.");
    }

    // 2. Buscar y resetear contraseña en Supabase Auth Admin
    console.log("[Reset Usuario] Buscando en Supabase Auth...");
    const { data: { users }, error: errAuthList } = await sb.auth.admin.listUsers();
    
    if (errAuthList) {
      console.error("Error al listar usuarios de Auth:", errAuthList);
      throw new Error(`Error en auth.admin: ${errAuthList.message}`);
    }

    const authUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    let authResetResult = "No encontrado en Auth";

    if (authUser) {
      console.log(`[Reset Usuario] Usuario encontrado en Auth (ID: ${authUser.id}). Restableciendo contraseña...`);
      
      // Resetear contraseña a una temporal estándar y confirmar el correo
      const { error: errUpdateUser } = await sb.auth.admin.updateUserById(
        authUser.id,
        {
          password: "Sauceda2026!",
          email_confirm: true // Confirmar correo automáticamente
        }
      );

      if (errUpdateUser) {
        console.error("Error al resetear auth usuario:", errUpdateUser);
        authResetResult = `Error al actualizar: ${errUpdateUser.message}`;
      } else {
        authResetResult = "Contraseña reseteada con éxito a 'Sauceda2026!' y correo confirmado.";
      }
    }

    return res.status(200).json({
      ok: true,
      mensaje: `Reseteo completado para ${email} en Staging.`,
      perfil: perfil ? { id: perfil.id, nombre: perfil.nombre, activo: true } : "No existe perfil en la tabla perfiles",
      auth: authResetResult
    });
  } catch (err) {
    console.error("[Reset Usuario] Error general:", err);
    return res.status(500).json({ error: String(err) });
  }
}
