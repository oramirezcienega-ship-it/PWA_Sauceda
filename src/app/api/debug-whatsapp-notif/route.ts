import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { enviarWhatsAppPlantilla, listarPlantillasAprobadas } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const log: any[] = [];
  try {
    const sb = supabaseServidor();

    log.push({ msg: "Iniciando depuración de notificaciones de WhatsApp..." });

    // 1. Verificar variables de entorno
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const waba = process.env.WHATSAPP_WABA_ID;
    const plantillaNombre = process.env.WHATSAPP_TEMPLATE_AGENTE_NOTIF || "notificacion_nuevo_lead";
    const plantillaIdioma = process.env.WHATSAPP_TEMPLATE_AGENTE_LANG || "es";
    
    log.push({
      config: {
        has_token: !!token,
        token_preview: token ? `${token.slice(0, 10)}...${token.slice(-10)}` : "missing",
        phone_id: phoneId || "missing",
        waba_id: waba || "missing",
        plantilla_env: plantillaNombre,
        idioma_env: plantillaIdioma,
      }
    });

    // 2. Traer plantillas aprobadas de Meta
    log.push({ msg: "Consultando plantillas aprobadas desde Meta..." });
    const rTemplates = await listarPlantillasAprobadas();
    log.push({ 
      templates_ok: rTemplates.ok, 
      templates_count: rTemplates.plantillas?.length || 0, 
      templates_error: rTemplates.error || null,
      disponibles: rTemplates.plantillas?.map(t => ({ nombre: t.nombre, idioma: t.idioma, estado: t.estado })) || []
    });

    let templateInfo = null;
    let plantillaIdiomaReal = plantillaIdioma;
    let bodyParamCount = 3;
    let tieneBotonDinamico = false;
    let urlPatternSuffix = "path";

    if (rTemplates.ok && rTemplates.plantillas) {
      templateInfo = rTemplates.plantillas.find(
        (t) => t.nombre === plantillaNombre && t.idioma === plantillaIdioma
      );
      if (!templateInfo && rTemplates.plantillas) {
        log.push({ msg: `Plantilla no encontrada con idioma exacto '${plantillaIdioma}'. Buscando fallback por nombre...` });
        templateInfo = rTemplates.plantillas.find((t) => t.nombre === plantillaNombre);
      }

      if (templateInfo) {
        plantillaIdiomaReal = templateInfo.idioma;
        log.push({ msg: `Plantilla encontrada. Idioma real: '${plantillaIdiomaReal}', Estado: '${templateInfo.estado}', Categoría: '${templateInfo.categoria}'` });
        log.push({ cuerpo_texto: templateInfo.cuerpo });

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
      } else {
        log.push({ msg: `ERROR: No se encontró ninguna plantilla en Meta con el nombre '${plantillaNombre}'.` });
      }
    }

    log.push({
      mapeo_detectado: {
        bodyParamCount,
        tieneBotonDinamico,
        urlPatternSuffix,
        idioma_a_enviar: plantillaIdiomaReal
      }
    });

    // 3. Obtener perfiles de usuarios activos
    log.push({ msg: "Buscando perfiles de usuarios activos..." });
    const { data: perfiles, error: errPerf } = await sb
      .from("perfiles")
      .select("id, nombre, rol, activo, telefono")
      .eq("activo", true);

    if (errPerf) {
      log.push({ error_perfiles: errPerf.message });
      return NextResponse.json({ ok: false, log });
    }

    log.push({ perfiles_activos: perfiles?.map(p => ({ nombre: p.nombre, rol: p.rol, telefono: p.telefono })) });

    // 4. Intentar enviar WhatsApp de prueba a cada uno
    const resultadosEnvio: any[] = [];
    const parametrosCuerpo = ["Cliente Prueba Depuracion", "sitio-web", "Detalles de prueba desde depuracion"];
    const urlBotonParam = "EXP-001"; // ID simulado

    for (const p of perfiles ?? []) {
      if (!p.telefono || !p.telefono.trim()) {
        resultadosEnvio.push({ nombre: p.nombre, status: "sin_telefono" });
        continue;
      }

      log.push({ msg: `Intentando enviar plantilla a ${p.nombre} al número '${p.telefono}'...` });
      const resWa = await enviarWhatsAppPlantilla(
        p.telefono,
        plantillaNombre,
        plantillaIdiomaReal,
        parametrosCuerpo,
        tieneBotonDinamico ? urlBotonParam : undefined
      );

      resultadosEnvio.push({
        nombre: p.nombre,
        telefono_original: p.telefono,
        resultado: resWa
      });
    }

    return NextResponse.json({ ok: true, log, resultadosEnvio });
  } catch (err: any) {
    log.push({ error_fatal: err.message || String(err) });
    return NextResponse.json({ ok: false, log });
  }
}
