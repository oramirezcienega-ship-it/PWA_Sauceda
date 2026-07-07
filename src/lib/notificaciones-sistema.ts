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
      .select("id, cliente, telefono, valor_estimado, saldo_deuda, tipo_credito, fraccionamiento, situacion, prospecto_id, prospectos(origen, correo)")
      .eq("id", expedienteId)
      .maybeSingle();

    if (errExp || !exp) {
      console.error("Error al buscar expediente para notificar:", errExp?.message);
      return;
    }

    const d = exp as unknown as {
      id: string;
      cliente: string;
      telefono?: string;
      valor_estimado?: number;
      saldo_deuda?: number;
      tipo_credito?: string | null;
      fraccionamiento?: string | null;
      situacion: string;
      prospecto_id: string | null;
      prospectos?: { origen: string; correo: string } | null;
    };

    const cliente = d.cliente || "Nuevo Lead";
    const origen = d.prospectos?.origen || "sitio-web";
    const situacion = d.situacion || "Solicitud de cotización entrante.";
    const CRM_URL = process.env.SITE_URL || "https://app.saucedamx.com";

    // Formatear datos más ricos para WhatsApp
    const telefonoCliente = d.telefono ? d.telefono.trim() : "";
    const tipoCredito = d.tipo_credito || "";
    const valorEst = d.valor_estimado || 0;
    const saldoDeu = d.saldo_deuda || 0;
    const fraccionamiento = d.fraccionamiento && d.fraccionamiento !== "Por definir" ? d.fraccionamiento : "";

    // Construir parámetros planos (sin saltos de línea ni tabuladores para evitar el error 132018 de Meta)
    const paramClienteFlat = `Nombre: ${cliente} · Teléfono: ${telefonoCliente || "No registrado"}`;

    const partesOrigenFlat = [`Canal: ${origen}`];
    if (tipoCredito) partesOrigenFlat.push(`Crédito: ${tipoCredito}`);
    if (fraccionamiento) partesOrigenFlat.push(`Zona: ${fraccionamiento}`);
    const paramOrigenFlat = partesOrigenFlat.join(" · ");

    const partesDetallesFlat = [];
    if (valorEst > 0) partesDetallesFlat.push(`Valor: $${valorEst.toLocaleString()}`);
    if (saldoDeu > 0) partesDetallesFlat.push(`Deuda: $${saldoDeu.toLocaleString()}`);
    const detFinancierosFlat = partesDetallesFlat.length > 0 ? partesDetallesFlat.join(" · ") + " · " : "";
    const paramDetallesFlat = `${detFinancierosFlat}Detalles: ${situacion.slice(0, 100).replace(/[\r\n\t]/g, " ")}`;

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
      const plantillaNombre = process.env.WHATSAPP_TEMPLATE_AGENTE_NOTIF || "notificacion_nuevo_lead_v2";
      const plantillaIdioma = process.env.WHATSAPP_TEMPLATE_AGENTE_LANG || "es";

      // Intentar obtener info de la plantilla en Meta para mapear parámetros correctamente
      let bodyParamCount = 3; // Por defecto: Cliente, Origen, Detalle
      let tieneBotonDinamico = false;
      let urlPatternSuffix: "id" | "path" | "complete" = "path"; // Por defecto: 'expediente/id'
      let plantillaIdiomaReal = plantillaIdioma;

      const rTemplates = await listarPlantillasAprobadas();
      if (rTemplates.ok && rTemplates.plantillas) {
        let templateInfo = rTemplates.plantillas.find(
          (t) => t.nombre === plantillaNombre && t.idioma === plantillaIdioma
        );

        // Fallback: si no coincide con idioma exacto (ej. "es" vs "es_MX"), buscar cualquiera por nombre
        if (!templateInfo) {
          templateInfo = rTemplates.plantillas.find((t) => t.nombre === plantillaNombre);
        }

        if (templateInfo) {
          plantillaIdiomaReal = templateInfo.idioma; // Usar el idioma real de la plantilla en Meta (ej: es_MX)
          
          if (templateInfo.components) {
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
      }

      // Preparar los parámetros correspondientes
      let parametrosCuerpo: string[] = [];
      let urlBotonParam: string | undefined = undefined;

      if (bodyParamCount === 8) {
        // Formato para plantilla con 8 variables estructuradas (sin saltos de línea ni tabuladores en parámetros)
        parametrosCuerpo = [
          cliente,
          telefonoCliente || "No registrado",
          origen,
          tipoCredito || "No definido",
          fraccionamiento || "No definida",
          valorEst > 0 ? `$${valorEst.toLocaleString()}` : "No especificado",
          saldoDeu > 0 ? `$${saldoDeu.toLocaleString()}` : "No especificada",
          situacion.slice(0, 200).replace(/[\r\n\t]/g, " ")
        ];
      } else {
        if (tieneBotonDinamico) {
          // Mapear cuerpo
          if (bodyParamCount >= 1) parametrosCuerpo.push(paramClienteFlat);
          if (bodyParamCount >= 2) parametrosCuerpo.push(paramOrigenFlat);
          if (bodyParamCount >= 3) parametrosCuerpo.push(paramDetallesFlat);
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
              paramClienteFlat,
              paramOrigenFlat,
              paramDetallesFlat,
              `${CRM_URL}/expediente/${d.id}`,
            ];
          } else {
            parametrosCuerpo = [
              paramClienteFlat,
              paramOrigenFlat,
              paramDetallesFlat,
            ];
          }
        }
      }

      const promesasWa = perfiles.map(async (p) => {
        // Restringir notificaciones automáticas de nuevos leads únicamente a Oscar / rol admin
        const esOscarOAdmin = p.nombre === "Oscar" || p.rol === "admin";
        if (!esOscarOAdmin) return;

        if (!p.telefono || !p.telefono.trim()) {
          console.warn(`El asesor/admin ${p.nombre} no tiene teléfono configurado para notificaciones de WhatsApp.`);
          return;
        }

        const resWa = await enviarWhatsAppPlantilla(
          p.telefono,
          plantillaNombre,
          plantillaIdiomaReal,
          parametrosCuerpo,
          urlBotonParam
        );
        if (!resWa.ok) {
          console.error(`Error de WhatsApp para ${p.nombre} (${p.telefono}):`, resWa.error);
        } else {
          console.log(`Notificación de WhatsApp enviada exitosamente a ${p.nombre} (${p.telefono})`);
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

/**
 * Notifica in-app cuando llega un mensaje nuevo de un contacto existente.
 * No envía WhatsApp ni email (evita ruido por cada mensaje).
 */
export async function notificarMensajeEntrante(datos: {
  telefono: string;
  texto: string;
  nombre: string;
  expedienteId: string | null;
  prospectoId: string | null;
}): Promise<void> {
  try {
    const sb = supabaseServidor();
    const { data: perfiles } = await sb
      .from("perfiles")
      .select("id, rol, activo")
      .eq("activo", true);
    if (!perfiles || perfiles.length === 0) return;

    const enlace = datos.expedienteId
      ? `/conversaciones?tel=${encodeURIComponent(datos.telefono)}`
      : `/conversaciones?tel=${encodeURIComponent(datos.telefono)}`;

    const texto = (datos.texto || "").slice(0, 100);
    const notifs = perfiles.map((p) => ({
      perfil_id: p.id,
      titulo: `💬 Mensaje de ${datos.nombre}`,
      cuerpo: texto || "(mensaje sin texto)",
      enlace,
      leido: false,
    }));

    await sb.from("notificaciones").insert(notifs);
  } catch (err) {
    console.error("Error al notificar mensaje entrante:", err);
  }
}

/**
 * Notifica a un asesor específico cuando se le asigna un expediente.
 * Reutiliza el mismo formato de plantilla para mayor simplicidad y consistencia.
 */
export async function notificarAsignacionAsesor(
  expedienteId: string,
  asesorId: string
): Promise<void> {
  try {
    const sb = supabaseServidor();

    // 1. Obtener la información del expediente
    const { data: exp, error: errExp } = await sb
      .from("expedientes")
      .select("id, cliente, telefono, valor_estimado, saldo_deuda, tipo_credito, fraccionamiento, situacion, prospecto_id, prospectos(origen)")
      .eq("id", expedienteId)
      .maybeSingle();

    if (errExp || !exp) {
      console.error("Error al buscar expediente para notificar asignación:", errExp?.message);
      return;
    }

    // 2. Obtener el perfil del asesor asignado
    const { data: asesor, error: errAsesor } = await sb
      .from("perfiles")
      .select("id, nombre, telefono, activo")
      .eq("id", asesorId)
      .maybeSingle();

    if (errAsesor || !asesor || !asesor.activo) {
      console.warn("No se encontró el asesor asignado o está inactivo.");
      return;
    }

    if (!asesor.telefono || !asesor.telefono.trim()) {
      console.warn(`El asesor ${asesor.nombre} no tiene teléfono configurado.`);
      return;
    }

    const d = exp as unknown as {
      id: string;
      cliente: string;
      telefono?: string;
      valor_estimado?: number;
      saldo_deuda?: number;
      tipo_credito?: string | null;
      fraccionamiento?: string | null;
      situacion: string;
      prospecto_id: string | null;
      prospectos?: { origen: string } | null;
    };
    const cliente = `${d.cliente || "Prospecto"}`;
    const origen = d.prospectos?.origen || "CRM";
    const situacion = d.situacion || "Asignación de expediente.";
    const CRM_URL = process.env.SITE_URL || "https://app.saucedamx.com";

    const telefonoCliente = d.telefono ? d.telefono.trim() : "";
    const tipoCredito = d.tipo_credito || "";
    const valorEst = d.valor_estimado || 0;
    const saldoDeu = d.saldo_deuda || 0;
    const fraccionamiento = d.fraccionamiento && d.fraccionamiento !== "Por definir" ? d.fraccionamiento : "";

    // Construir parámetros planos (sin saltos de línea ni tabuladores para evitar el error 132018 de Meta)
    const paramClienteFlat = `Nombre: ${cliente} · Teléfono: ${telefonoCliente || "No registrado"}`;

    const partesOrigenFlat = [`Canal: ${origen}`];
    if (tipoCredito) partesOrigenFlat.push(`Crédito: ${tipoCredito}`);
    if (fraccionamiento) partesOrigenFlat.push(`Zona: ${fraccionamiento}`);
    const paramOrigenFlat = partesOrigenFlat.join(" · ");

    const partesDetallesFlat = [];
    if (valorEst > 0) partesDetallesFlat.push(`Valor: $${valorEst.toLocaleString()}`);
    if (saldoDeu > 0) partesDetallesFlat.push(`Deuda: $${saldoDeu.toLocaleString()}`);
    const detFinancierosFlat = partesDetallesFlat.length > 0 ? partesDetallesFlat.join(" · ") + " · " : "";
    const paramDetallesFlat = `${detFinancierosFlat}Detalles: ${situacion.slice(0, 100).replace(/[\r\n\t]/g, " ")}`;

    // 3. Notificación de WhatsApp
    try {
      const plantillaNombre = process.env.WHATSAPP_TEMPLATE_AGENTE_NOTIF || "notificacion_nuevo_lead_v2";
      const plantillaIdioma = process.env.WHATSAPP_TEMPLATE_AGENTE_LANG || "es";

      let bodyParamCount = 3;
      let tieneBotonDinamico = false;
      let urlPatternSuffix: "id" | "path" | "complete" = "path";
      let plantillaIdiomaReal = plantillaIdioma;

      const rTemplates = await listarPlantillasAprobadas();
      if (rTemplates.ok && rTemplates.plantillas) {
        let templateInfo = rTemplates.plantillas.find(
          (t) => t.nombre === plantillaNombre && t.idioma === plantillaIdioma
        );
        if (!templateInfo) {
          templateInfo = rTemplates.plantillas.find((t) => t.nombre === plantillaNombre);
        }
        if (templateInfo) {
          plantillaIdiomaReal = templateInfo.idioma;
          if (templateInfo.components) {
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
      }

      let parametrosCuerpo: string[] = [];
      let urlBotonParam: string | undefined = undefined;

      if (bodyParamCount === 8) {
        parametrosCuerpo = [
          cliente,
          telefonoCliente || "No registrado",
          origen,
          tipoCredito || "No definido",
          fraccionamiento || "No definida",
          valorEst > 0 ? `$${valorEst.toLocaleString()}` : "No especificado",
          saldoDeu > 0 ? `$${saldoDeu.toLocaleString()}` : "No especificada",
          situacion.slice(0, 200).replace(/[\r\n\t]/g, " ")
        ];
      } else {
        if (tieneBotonDinamico) {
          // Mapear cuerpo
          if (bodyParamCount >= 1) parametrosCuerpo.push(paramClienteFlat);
          if (bodyParamCount >= 2) parametrosCuerpo.push(paramOrigenFlat);
          if (bodyParamCount >= 3) parametrosCuerpo.push(paramDetallesFlat);
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
              paramClienteFlat,
              paramOrigenFlat,
              paramDetallesFlat,
              `${CRM_URL}/expediente/${d.id}`,
            ];
          } else {
            parametrosCuerpo = [
              paramClienteFlat,
              paramOrigenFlat,
              paramDetallesFlat,
            ];
          }
        }
      }

      const resWa = await enviarWhatsAppPlantilla(
        asesor.telefono,
        plantillaNombre,
        plantillaIdiomaReal,
        parametrosCuerpo,
        urlBotonParam
      );

      if (!resWa.ok) {
        console.error(`Error de WhatsApp al notificar asignación a ${asesor.nombre}:`, resWa.error);
      } else {
        console.log(`WhatsApp de asignación enviado exitosamente a ${asesor.nombre}`);
      }
    } catch (err) {
      console.error("Error al enviar WhatsApp de asignación:", err);
    }
  } catch (err) {
    console.error("Fallo general en notificarAsignacionAsesor:", err);
  }
}

