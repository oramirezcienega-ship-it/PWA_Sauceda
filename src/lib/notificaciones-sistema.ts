import { supabaseServidor } from "@/lib/supabase/server";
import { notificarAgenteEmail } from "@/lib/email";
import { enviarWhatsAppPlantilla } from "@/lib/whatsapp";

/**
 * Despachador central de notificaciones para eventos del sistema.
 * Cuando llega un nuevo lead, notifica a todos los asesores y administradores
 * activos a través de los tres canales: In-App, Email y WhatsApp (Plantilla).
 */
export async function notificarNuevoLead(expedienteId: string): Promise<void> {
  try {
    const sb = supabaseServidor();

    // 1. Obtener la información del expediente y su prospecto asociado
    const { data: exp, error: errExp } = await sb
      .from("expedientes")
      .select("id, cliente, etapa, situacion, prospecto_id, prospectos(origen, correo)")
      .eq("id", expedienteId)
      .maybeSingle();

    if (errExp || !exp) {
      console.error("Error al buscar expediente para notificar:", errExp?.message);
      return;
    }

    const d = exp as unknown as {
      id: string;
      cliente: string;
      etapa: string;
      situacion: string;
      prospecto_id: string | null;
      prospectos?: { origen: string; correo: string } | null;
    };

    const cliente = d.cliente || "Nuevo Lead";
    const origen = d.prospectos?.origen || "sitio-web";
    const situacion = d.situacion || "Solicitud de cotización entrante.";
    const CRM_URL = process.env.SITE_URL || "https://app.saucedamx.com";

    // 2. Obtener perfiles de usuarios activos
    const { data: perfiles, error: errPerf } = await sb
      .from("perfiles")
      .select("id, nombre, rol, activo, telefono")
      .eq("activo", true);

    if (errPerf || !perfiles || perfiles.length === 0) {
      console.warn("No hay perfiles activos para notificar.");
      return;
    }

    // 3. Crear notificación In-App para cada asesor/admin activo
    const notificacionesDB = perfiles.map((p) => ({
      perfil_id: p.id,
      titulo: `Nuevo lead: ${cliente}`,
      cuerpo: `Origen: ${origen}. Detalle: ${situacion.slice(0, 150)}`,
      enlace: `/expediente/${d.id}`,
      leido: false,
    }));

    const { error: errInsert } = await sb
      .from("notificaciones")
      .insert(notificacionesDB);

    if (errInsert) {
      console.error("Error al guardar notificaciones en la base de datos:", errInsert.message);
    }

    // 4. Notificaciones por Email (vía Resend)
    try {
      const { data: authUsers, error: errAuth } = await sb.auth.admin.listUsers();
      if (!errAuth && authUsers?.users) {
        const mapaCorreos = new Map(authUsers.users.map((u) => [u.id, u.email]));
        
        const promesasEmail = perfiles.map(async (p) => {
          const email = mapaCorreos.get(p.id);
          if (email) {
            await notificarAgenteEmail(
              email,
              `Nuevo Lead: ${cliente}`,
              `¡Nuevo Lead Captado!`,
              `Hola ${p.nombre},\n\nSe ha registrado un nuevo prospecto en la plataforma:\n\n` +
                `• Cliente: ${cliente}\n` +
                `• Origen: ${origen}\n` +
                `• Detalles: ${situacion}\n\n` +
                `Por favor, ingresa al panel para atenderlo de inmediato.`,
              `Ver expediente`,
              `${CRM_URL}/expediente/${d.id}`
            );
          }
        });
        
        await Promise.all(promesasEmail);
      }
    } catch (err) {
      console.error("Error al enviar correos de notificación:", err);
    }

    // 5. Notificaciones por WhatsApp (vía Meta Cloud API con Plantilla)
    try {
      const plantillaNombre = process.env.WHATSAPP_TEMPLATE_AGENTE_NOTIF || "notificacion_nuevo_lead";
      const plantillaIdioma = process.env.WHATSAPP_TEMPLATE_AGENTE_LANG || "es";

      const promesasWa = perfiles.map(async (p) => {
        if (p.telefono && p.telefono.trim()) {
          // Parámetros del cuerpo de la plantilla:
          // {{1}} = Cliente
          // {{2}} = Origen
          // {{3}} = Situación/Mensaje (truncado para seguridad)
          // {{4}} = Enlace al expediente
          const parametros = [
            cliente,
            origen,
            situacion.slice(0, 100),
            `${CRM_URL}/expediente/${d.id}`,
          ];

          await enviarWhatsAppPlantilla(
            p.telefono,
            plantillaNombre,
            plantillaIdioma,
            parametros
          );
        }
      });

      await Promise.all(promesasWa);
    } catch (err) {
      console.error("Error al enviar WhatsApp de notificación:", err);
    }
  } catch (err) {
    console.error("Fallo general en notificarNuevoLead:", err);
  }
}
