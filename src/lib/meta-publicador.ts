/**
 * MÓDULO: PUBLICADOR DIRECTO EN META (Facebook Pages & Instagram Professional API)
 *
 * Permite publicar de forma nativa imágenes, videos y reels en:
 * - Página de Facebook de Sauceda (via Facebook Graph API v21.0)
 * - Cuenta Profesional de Instagram de Sauceda (via Instagram Content Publishing API)
 *
 * Obtiene credenciales desde la base de datos (tabla configuracion_agente) con
 * fallback a las variables de entorno configuradas.
 */

import { supabaseServidor } from "@/lib/supabase/server";

const META_GRAPH_VERSION = "v21.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export interface CredencialesMeta {
  pageId: string;
  pageAccessToken: string;
  instagramAccountId?: string;
  fuente: "bd" | "env";
}

export interface ResultadoPublicacionMeta {
  ok: boolean;
  postId?: string;
  mediaId?: string;
  permalink?: string;
  error?: string;
  plataforma: "facebook" | "instagram";
  detalles?: any;
}

export interface EstadoConexionMeta {
  ok: boolean;
  pagina?: {
    id: string;
    nombre: string;
    seguidores?: number;
    link?: string;
  };
  instagram?: {
    id: string;
    usuario?: string;
    nombre?: string;
    fotoPerfil?: string;
  };
  tokenConfigurado: boolean;
  tokenValido: boolean;
  error?: string;
}

/**
 * Traduce códigos de error frecuentes de la Graph API de Meta a explicaciones claras en español.
 */
export function interpretarErrorGraphApi(errorObj: any): string {
  if (!errorObj) return "Error desconocido al comunicar con Meta.";
  const code = errorObj.code;
  const subcode = errorObj.error_subcode;
  const message = errorObj.message || "";

  if (code === 190) {
    return "El Token de Acceso de Meta ha expirado o fue revocado. Genera un nuevo Page Access Token o System User Token en Meta Business Suite.";
  }
  if (code === 200 || code === 294) {
    return `Permisos insuficientes en Meta: Se requiere que el token tenga concedido el permiso 'pages_manage_posts' e 'instagram_content_publish'. (${message})`;
  }
  if (code === 100 && message.includes("aspect ratio")) {
    return "La relación de aspecto de la imagen no es compatible con Instagram (debe ser cuadrada 1:1, vertical 4:5 o vertical 9:16).";
  }
  if (code === 36000 || message.includes("Instagram account")) {
    return "La cuenta de Instagram no está vinculada como cuenta Profesional/Comercial a la Página de Facebook, o falta el ID de Instagram.";
  }
  if (code === 10) {
    return `Acceso denegado por Meta: Verifica que la aplicación de Meta tenga los permisos aprobados o esté en modo activo. (${message})`;
  }

  return message ? `Meta Graph API: ${message}` : `Error de Meta (Código ${code})`;
}

/**
 * Obtiene las credenciales activas de Meta:
 * Primero consulta en configuracion_agente; si no están o faltan campos, recurre al entorno.
 */
export async function obtenerCredencialesMeta(): Promise<CredencialesMeta> {
  let pageId = "";
  let pageAccessToken = "";
  let instagramAccountId = "";
  let fuente: "bd" | "env" = "env";

  try {
    const sb = supabaseServidor();
    const { data: configs } = await sb
      .from("configuracion_agente")
      .select("clave, valor")
      .in("clave", [
        "meta_page_id",
        "meta_page_access_token",
        "meta_instagram_id",
      ]);

    if (configs && configs.length > 0) {
      const mapa = new Map(configs.map((c) => [c.clave, c.valor]));
      const dbPageId = mapa.get("meta_page_id");
      const dbToken = mapa.get("meta_page_access_token");
      const dbIgId = mapa.get("meta_instagram_id");

      if (dbPageId) pageId = dbPageId.trim();
      if (dbToken) pageAccessToken = dbToken.trim();
      if (dbIgId) instagramAccountId = dbIgId.trim();

      if (pageAccessToken) {
        fuente = "bd";
      }
    }
  } catch (err) {
    console.warn("No se pudo leer credenciales Meta desde BD, recurriendo a variables de entorno:", err);
  }

  // Fallback a variables de entorno
  if (!pageId) {
    pageId = (
      process.env.META_PAGE_ID ||
      process.env.FACEBOOK_PAGE_ID ||
      "61589957630232" // ID oficial de la página Sauceda
    ).trim();
  }

  if (!pageAccessToken) {
    pageAccessToken = (
      process.env.META_PAGE_ACCESS_TOKEN ||
      process.env.FACEBOOK_PAGE_TOKEN ||
      process.env.WHATSAPP_TOKEN ||
      ""
    ).trim();
  }

  if (!instagramAccountId) {
    instagramAccountId = (
      process.env.META_INSTAGRAM_ACCOUNT_ID ||
      process.env.INSTAGRAM_ACCOUNT_ID ||
      ""
    ).trim();
  }

  return {
    pageId,
    pageAccessToken,
    instagramAccountId: instagramAccountId || undefined,
    fuente,
  };
}

/**
 * Realiza un handshake de diagnóstico con Meta Graph API para validar el token y
 * descubrir los datos de la Página de Facebook y la cuenta de Instagram vinculada.
 */
export async function probarConexionMeta(tokenManual?: string, pageIdManual?: string): Promise<EstadoConexionMeta> {
  const creds = await obtenerCredencialesMeta();
  const token = (tokenManual || creds.pageAccessToken).trim();
  const pageId = (pageIdManual || creds.pageId).trim();

  if (!token) {
    return {
      ok: false,
      tokenConfigurado: false,
      tokenValido: false,
      error: "No hay Token de Acceso configurado para Meta.",
    };
  }

  if (!pageId) {
    return {
      ok: false,
      tokenConfigurado: true,
      tokenValido: false,
      error: "No se ha configurado el ID de la Página de Facebook.",
    };
  }

  try {
    const url = `${META_GRAPH_BASE}/${encodeURIComponent(pageId)}?fields=id,name,link,fan_count,instagram_business_account{id,username,name,profile_picture_url},connected_instagram_account{id,username,name,profile_picture_url}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { method: "GET" });
    const data = await res.json();

    if (!res.ok || data.error) {
      return {
        ok: false,
        tokenConfigurado: true,
        tokenValido: false,
        error: interpretarErrorGraphApi(data.error),
      };
    }

    const resultado: EstadoConexionMeta = {
      ok: true,
      tokenConfigurado: true,
      tokenValido: true,
      pagina: {
        id: data.id,
        nombre: data.name,
        seguidores: data.fan_count,
        link: data.link || `https://www.facebook.com/${data.id}`,
      },
    };

    const cuentaIg = data.instagram_business_account || data.connected_instagram_account;
    if (cuentaIg) {
      resultado.instagram = {
        id: cuentaIg.id,
        usuario: cuentaIg.username,
        nombre: cuentaIg.name,
        fotoPerfil: cuentaIg.profile_picture_url,
      };
    } else if (creds.instagramAccountId) {
      // Si no viene en la página pero el usuario configuró un ID manual de Instagram
      try {
        const igDirectUrl = `${META_GRAPH_BASE}/${encodeURIComponent(creds.instagramAccountId)}?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(token)}`;
        const igRes = await fetch(igDirectUrl, { method: "GET" });
        const igData = await igRes.json();
        if (igRes.ok && !igData.error && igData.id) {
          resultado.instagram = {
            id: igData.id,
            usuario: igData.username,
            nombre: igData.name,
            fotoPerfil: igData.profile_picture_url,
          };
        }
      } catch (e) {
        console.warn("Fallo al verificar ID manual de Instagram:", e);
      }
    }

    return resultado;
  } catch (err: any) {
    console.error("Error al probar conexión con Meta:", err);
    return {
      ok: false,
      tokenConfigurado: true,
      tokenValido: false,
      error: `Error de red al conectar con Meta Graph API: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Publica contenido en la Página de Facebook de Sauceda.
 */
export async function publicarEnFacebook(params: {
  contenido: string;
  urlImagen?: string;
  urlVideo?: string;
  tipoFormato: "imagen" | "carrusel" | "video" | "reel";
}): Promise<ResultadoPublicacionMeta> {
  const creds = await obtenerCredencialesMeta();
  if (!creds.pageAccessToken || !creds.pageId) {
    return {
      ok: false,
      plataforma: "facebook",
      error: "Falta configurar el Token de Acceso o ID de Página de Facebook.",
    };
  }

  const { contenido, urlImagen, urlVideo, tipoFormato } = params;

  try {
    // 1. Publicación de Video
    if ((tipoFormato === "video" || tipoFormato === "reel") && urlVideo) {
      const endpoint = `${META_GRAPH_BASE}/${creds.pageId}/videos`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: urlVideo,
          description: contenido,
          access_token: creds.pageAccessToken,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return {
          ok: false,
          plataforma: "facebook",
          error: interpretarErrorGraphApi(data.error),
        };
      }
      const videoId = data.id;
      return {
        ok: true,
        plataforma: "facebook",
        postId: videoId,
        permalink: `https://www.facebook.com/${videoId}`,
        detalles: data,
      };
    }

    // 2. Publicación con Fotografía / Imagen
    if (urlImagen && urlImagen.length > 5 && !urlImagen.includes("placeholder")) {
      const endpoint = `${META_GRAPH_BASE}/${creds.pageId}/photos`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlImagen,
          caption: contenido,
          access_token: creds.pageAccessToken,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return {
          ok: false,
          plataforma: "facebook",
          error: interpretarErrorGraphApi(data.error),
        };
      }

      const idPost = data.post_id || data.id;
      return {
        ok: true,
        plataforma: "facebook",
        postId: idPost,
        permalink: `https://www.facebook.com/${idPost}`,
        detalles: data,
      };
    }

    // 3. Publicación sólo de Texto en el Feed
    const endpoint = `${META_GRAPH_BASE}/${creds.pageId}/feed`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: contenido,
        access_token: creds.pageAccessToken,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return {
        ok: false,
        plataforma: "facebook",
        error: interpretarErrorGraphApi(data.error),
      };
    }

    return {
      ok: true,
      plataforma: "facebook",
      postId: data.id,
      permalink: `https://www.facebook.com/${data.id}`,
      detalles: data,
    };
  } catch (err: any) {
    console.error("Excepción al publicar en Facebook:", err);
    return {
      ok: false,
      plataforma: "facebook",
      error: `Error al conectar con Facebook: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Publica contenido en la cuenta Profesional de Instagram (Content Publishing API).
 * Requiere que la imagen o video sea una URL accesible públicamente desde la web.
 */
export async function publicarEnInstagram(params: {
  contenido: string;
  urlImagen?: string;
  urlVideo?: string;
  tipoFormato: "imagen" | "carrusel" | "video" | "reel";
}): Promise<ResultadoPublicacionMeta> {
  const creds = await obtenerCredencialesMeta();
  if (!creds.pageAccessToken) {
    return {
      ok: false,
      plataforma: "instagram",
      error: "Falta configurar el Token de Acceso para Instagram.",
    };
  }

  // Si no tenemos el ID de Instagram directo, intentamos auto-descubrirlo desde la página
  let instagramId = creds.instagramAccountId;
  if (!instagramId) {
    const estado = await probarConexionMeta(creds.pageAccessToken, creds.pageId);
    if (!estado.ok) {
      return {
        ok: false,
        plataforma: "instagram",
        error: `Fallo de autenticación con Meta: ${estado.error || "Token inválido o expirado"}. Por favor abre el botón 'Conexión Meta' en la parte superior para ingresar o renovar tu Token de Acceso.`,
      };
    }
    if (estado.instagram?.id) {
      instagramId = estado.instagram.id;
    } else {
      return {
        ok: false,
        plataforma: "instagram",
        error: "No se detectó una cuenta de Instagram Business vinculada a tu Página de Facebook en Meta Business Suite. Puedes vincularla en la Configuración de tu Página de Facebook -> Cuentas Vinculadas -> Instagram, o ingresar directamente tu ID de Instagram en el modal 'Conexión Meta'.",
      };
    }
  }

  const { contenido, urlImagen, urlVideo, tipoFormato } = params;
  const esReelOVideo = tipoFormato === "reel" || tipoFormato === "video";

  if (!urlImagen && !urlVideo) {
    return {
      ok: false,
      plataforma: "instagram",
      error: "Instagram requiere obligatoriamente una imagen o video para publicar.",
    };
  }

  try {
    // PASO 1: Crear Contenedor de Medios (Media Container)
    const mediaContainerEndpoint = `${META_GRAPH_BASE}/${instagramId}/media`;
    let containerPayload: any = {
      caption: contenido,
      access_token: creds.pageAccessToken,
    };

    if (esReelOVideo && urlVideo) {
      containerPayload = {
        ...containerPayload,
        media_type: "REELS",
        video_url: urlVideo,
        share_to_feed: true,
      };
    } else if (urlImagen) {
      containerPayload = {
        ...containerPayload,
        image_url: urlImagen,
      };
    } else {
      return {
        ok: false,
        plataforma: "instagram",
        error: "No se proporcionó un medio compatible para publicar en Instagram.",
      };
    }

    console.log(`[Meta Instagram] Creando contenedor de medios en ${instagramId}...`);
    const containerRes = await fetch(mediaContainerEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(containerPayload),
    });
    const containerData = await containerRes.json();

    if (!containerRes.ok || containerData.error) {
      return {
        ok: false,
        plataforma: "instagram",
        error: interpretarErrorGraphApi(containerData.error),
      };
    }

    const creationId = containerData.id;
    if (!creationId) {
      return {
        ok: false,
        plataforma: "instagram",
        error: "Instagram no devolvió un ID de contenedor de medios válido.",
      };
    }

    // PASO 1.5: Si es Video / Reel, esperar brevemente a que Instagram termine de procesar el video
    if (esReelOVideo) {
      let listo = false;
      let intentos = 0;
      while (!listo && intentos < 6) {
        await new Promise((r) => setTimeout(r, 4000));
        const statusRes = await fetch(
          `${META_GRAPH_BASE}/${creationId}?fields=status_code&access_token=${creds.pageAccessToken}`
        );
        const statusData = await statusRes.json();
        if (statusData.status_code === "FINISHED") {
          listo = true;
          break;
        } else if (statusData.status_code === "ERROR") {
          return {
            ok: false,
            plataforma: "instagram",
            error: "Instagram reportó un fallo al procesar el archivo de video/reel.",
          };
        }
        intentos++;
      }
    } else {
      // Breve pausa de 1 segundo para asegurar disponibilidad de la imagen en los servidores de Meta
      await new Promise((r) => setTimeout(r, 1000));
    }

    // PASO 2: Publicar el Contenedor (Media Publish)
    console.log(`[Meta Instagram] Publicando contenedor ${creationId}...`);
    const publishEndpoint = `${META_GRAPH_BASE}/${instagramId}/media_publish`;
    const publishRes = await fetch(publishEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: creds.pageAccessToken,
      }),
    });
    const publishData = await publishRes.json();

    if (!publishRes.ok || publishData.error) {
      return {
        ok: false,
        plataforma: "instagram",
        error: interpretarErrorGraphApi(publishData.error),
      };
    }

    const igMediaId = publishData.id;

    // PASO 3: Obtener el permalink oficial de la publicación
    let permalink = `https://www.instagram.com/`;
    try {
      const infoRes = await fetch(
        `${META_GRAPH_BASE}/${igMediaId}?fields=permalink&access_token=${creds.pageAccessToken}`
      );
      const infoData = await infoRes.json();
      if (infoData.permalink) {
        permalink = infoData.permalink;
      }
    } catch {
      // Mantener fallback genérico
    }

    return {
      ok: true,
      plataforma: "instagram",
      postId: igMediaId,
      mediaId: igMediaId,
      permalink,
      detalles: publishData,
    };
  } catch (err: any) {
    console.error("Excepción al publicar en Instagram:", err);
    return {
      ok: false,
      plataforma: "instagram",
      error: `Error al publicar en Instagram: ${err?.message || String(err)}`,
    };
  }
}
