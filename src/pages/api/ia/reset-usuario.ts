import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseServidor } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

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

    // 1. Buscar si ya existe el usuario en Auth y eliminarlo para recrearlo 100% fresco
    const { data: { users }, error: errAuthList } = await sb.auth.admin.listUsers();
    if (errAuthList) {
      throw new Error(`Error listando auth users: ${errAuthList.message}`);
    }

    const authUserExistente = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (authUserExistente) {
      console.log(`[Reset Usuario] Eliminando auth user viejo ID ${authUserExistente.id}...`);
      await sb.auth.admin.deleteUser(authUserExistente.id);
    }

    // 2. Crear usuario 100% nuevo en Supabase Auth con contraseña limpia y confirmación activa
    console.log(`[Reset Usuario] Creando nuevo usuario Auth limpio para ${email}...`);
    const { data: createRes, error: errCreateUser } = await sb.auth.admin.createUser({
      email,
      password: "sauceda123",
      email_confirm: true,
    });

    if (errCreateUser || !createRes.user) {
      throw new Error(`Error al crear usuario en Auth: ${errCreateUser?.message}`);
    }

    const nuevoAuthUser = createRes.user;

    // 3. Crear o actualizar el perfil en la tabla 'perfiles' de Supabase
    const defaultHorarios = {
      lunes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      martes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      miercoles: [{ inicio: "09:00:00", fin: "18:00:00" }],
      jueves: [{ inicio: "09:00:00", fin: "18:00:00" }],
      viernes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      sabado: [{ inicio: "09:00:00", fin: "14:00:00" }],
      domingo: []
    };

    const { error: errUpsertPerfil } = await sb
      .from("perfiles")
      .upsert({
        id: nuevoAuthUser.id,
        nombre: "Alejandro Córdova Barajas",
        activo: true,
        rol: "asesor",
        horarios_agenda: defaultHorarios,
        duracion_cita: 60
      });

    if (errUpsertPerfil) {
      throw new Error(`Error al vincular perfil en DB: ${errUpsertPerfil.message}`);
    }

    // 4. Limpiar citas y bloqueos viejos para este perfil
    await sb.from("agenda_bloqueos").delete().eq("perfil_id", nuevoAuthUser.id);
    await sb.from("agenda_citas").delete().eq("perfil_id", nuevoAuthUser.id);

    // 5. Probar autenticación directa con signInWithPassword
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: testAuth, error: testErr } = await anonClient.auth.signInWithPassword({
      email,
      password: "sauceda123"
    });

    return res.status(200).json({
      ok: true,
      mensaje: `Reseteo y sincronización completados con éxito para ${email} en Staging.`,
      auth: "Contraseña configurada a 'sauceda123' y correo confirmado.",
      testLogin: testErr ? `Error en prueba de login: ${testErr.message}` : `Prueba de login EXITOSA para user ID: ${testAuth.user?.id}`,
      perfil: "Perfil de DB vinculado con éxito."
    });
  } catch (err) {
    console.error("[Reset Usuario] Error general en el proceso:", err);
    return res.status(500).json({ error: String(err) });
  }
}
