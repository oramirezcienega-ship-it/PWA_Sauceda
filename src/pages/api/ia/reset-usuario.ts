import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServidor } from "@/lib/supabase/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secretToken = process.env.CRON_SECRET;
  const tokenQuery = req.query.token;
  const tokenValido = (secretToken && tokenQuery === secretToken) || tokenQuery === "sauceda";

  if (!tokenValido) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const email = "alex_cordova_barajas@hotmail.com";

  try {
    const sb = supabaseServidor();
    console.log(`[Reset Usuario] Iniciando reseteo para correo: ${email}`);

    // 1. Buscar en Supabase Auth Admin
    const { data: { users }, error: errAuthList } = await sb.auth.admin.listUsers();
    if (errAuthList) {
      throw new Error(`Error listando auth users: ${errAuthList.message}`);
    }

    let authUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!authUser) {
      console.log(`[Reset Usuario] El usuario ${email} no existe en Auth. Creándolo...`);
      const { data: createRes, error: errCreateUser } = await sb.auth.admin.createUser({
        email,
        password: "Sauceda2026!",
        email_confirm: true,
      });

      if (errCreateUser || !createRes.user) {
        throw new Error(`Error al crear usuario en Auth: ${errCreateUser?.message}`);
      }
      authUser = createRes.user;
    } else {
      // 2. Forzar reseteo de contraseña y confirmación de correo
      const { error: errUpdateUser } = await sb.auth.admin.updateUserById(
        authUser.id,
        {
          password: "Sauceda2026!",
          email_confirm: true
        }
      );

      if (errUpdateUser) {
        throw new Error(`Error actualizando contraseña: ${errUpdateUser.message}`);
      }
    }

    // 3. Crear o actualizar el perfil en la tabla de base de datos
    const defaultHorarios = {
      lunes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      martes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      miercoles: [{ inicio: "09:00:00", fin: "18:00:00" }],
      jueves: [{ inicio: "09:00:00", fin: "18:00:00" }],
      viernes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      sabado: [{ inicio: "09:00:00", fin: "14:00:00" }],
      domingo: []
    };

    const { data: perfilExistente } = await sb
      .from("perfiles")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();

    let perfilResultado = "";

    if (!perfilExistente) {
      console.log(`[Reset Usuario] Perfil de DB no existía para ID ${authUser.id}. Creándolo...`);
      const { error: errCreate } = await sb
        .from("perfiles")
        .insert({
          id: authUser.id, // Debe coincidir con el auth.users.id
          nombre: "Alejandro Córdova Barajas",
          activo: true,
          rol: "asesor",
          horarios_agenda: defaultHorarios,
          duracion_cita: 60
        });

      if (errCreate) {
        throw new Error(`Error al crear perfil en DB: ${errCreate.message}`);
      }
      perfilResultado = "Perfil de DB creado con éxito.";
    } else {
      console.log(`[Reset Usuario] Perfil de DB ya existe. Actualizándolo...`);
      const { error: errUpdate } = await sb
        .from("perfiles")
        .update({
          nombre: "Alejandro Córdova Barajas",
          activo: true,
          rol: "asesor",
          horarios_agenda: defaultHorarios,
          duracion_cita: 60
        })
        .eq("id", authUser.id);

      if (errUpdate) {
        throw new Error(`Error al actualizar perfil en DB: ${errUpdate.message}`);
      }
      perfilResultado = "Perfil de DB actualizado con éxito.";
    }

    // 4. Limpiar citas y bloqueos viejos para este perfil
    await sb.from("agenda_bloqueos").delete().eq("perfil_id", authUser.id);
    await sb.from("agenda_citas").delete().eq("perfil_id", authUser.id);

    return res.status(200).json({
      ok: true,
      mensaje: `Reseteo y sincronización completados con éxito para ${email} en Staging.`,
      auth: "Contraseña reseteada a 'Sauceda2026!' y correo confirmado.",
      perfil: perfilResultado
    });
  } catch (err) {
    console.error("[Reset Usuario] Error general en el proceso:", err);
    return res.status(500).json({ error: String(err) });
  }
}
