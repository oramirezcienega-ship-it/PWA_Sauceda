import { supabaseServidor } from "@/lib/supabase/server";
import { notificarAgenteEmail } from "@/lib/email";
import { enviarWhatsAppPlantilla, listarPlantillasAprobadas } from "@/lib/whatsapp";

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

      // Intentar obtener info de la plantilla en Meta para mapear parámetros correctamente
      let bodyParamCount = 3; // Por defecto: Cliente, Origen, Detalle
      let tieneBotonDinamico = false;
      let urlPatternSuffix: "id" | "path" | "complete" = "path"; // Por defecto: 'expediente/id'

      const rTemplates = await listarPlantillasAprobadas();
      if (rTemplates.ok && rTemplates.plantillas) {
        const templateInfo = rTemplates.plantillas.find(
          (t) => t.nombre === plantillaNombre && t.idioma === plantillaIdioma
        );
        if (templateInfo?.components) {
          const bodyComp = templateInfo.components.find((c: any) => c.type === "BODY");
          if (bodyComp && bodyComp.text) {
            const matches = bodyComp.text.match(/\{\{\d+\}\}/g);
            bodyParamCount = matches ? new Set(matches).size : 0;
          }

          const buttonComp = templateInfo.components.find((c: any) => c.type === "BUTTONS");
          if (buttonComp && buttonComp.buttons) {
            const urlBtn = buttonComp.buttons.find(
              (b: any) => b.type === "URL" && b.url && b.url.includes("{{1}}")
            );
            if (urlBtn) {
              tieneBotonDinamico = true;
              const urlPattern = urlBtn.url;
              if (urlPattern.endsWith("/expediente/{{1}}")) {
                urlPatternSuffix = "id";
              } else if (urlPattern.endsWith("/{{1}}")) {
                urlPatternSuffix = "path";
              } else {
                urlPatternSuffix = "complete";
              }
            }
          }
        }
      }

      // Preparar los parámetros correspondientes
      let parametrosCuerpo: string[] = [];
      let urlBotonParam: string | undefined = undefined;

      if (tieneBotonDinamico) {
        // Mapear cuerpo
        if (bodyParamCount >= 1) parametrosCuerpo.push(cliente);
        if (bodyParamCount >= 2) parametrosCuerpo.push(origen);
        if (bodyParamCount >= 3) parametrosCuerpo.push(situacion.slice(0, 100));
        if (bodyParamCount >= 4) parametrosCuerpo.push(`${CRM_URL}/expediente/${d.id}`);
        while (parametrosCuerpo.length < bodyParamCount) {
          parametrosCuerpo.push("");
        }

        // Mapear botón dinámico
        if (urlPatternSuffix === "id") {
          urlBotonParam = d.id;
        } else if (urlPatternSuffix === "path") {
          urlBotonParam = `expediente/${d.id}`;
        } else {
          urlBotonParam = `${CRM_URL}/expediente/${d.id}`;
        }
      } else {
        // Mapeo plano heredado / fallback
        if (bodyParamCount >= 4) {
          parametrosCuerpo = [
            cliente,
            origen,
            situacion.slice(0, 100),
            `${CRM_URL}/expediente/${d.id}`,
          ];
        } else {
          parametrosCuerpo = [
            cliente,
            origen,
            situacion.slice(0, 100),
          ];
        }
      }

      const promesasWa = perfiles.map(async (p) => {
        if (p.telefono && p.telefono.trim()) {
          const resWa = await enviarWhatsAppPlantilla(
            p.telefono,
            plantillaNombre,
            plantillaIdioma,
            parametrosCuerpo,
            urlBotonParam
          );
          if (!resWa.ok) {
            console.error(`Error de WhatsApp para ${p.nombre} (${p.telefono}):`, resWa.error);
          } else {
            console.log(`Notificación de WhatsApp enviada exitosamente a ${p.nombre} (${p.telefono})`);
          }
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
