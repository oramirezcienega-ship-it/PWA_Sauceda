/**
 * MÓDULO: PUBLICADOR DIRECTO EN TIKTOK (TikTok Content Posting API v2)
 *
 * Permite publicar de forma nativa videos, imágenes y carruseles en la cuenta
 * oficial de TikTok de Sauceda (@saucedamxbr) via la TikTok Content Posting API.
 *
 * Obtiene credenciales desde la base de datos (tabla configuracion_agente) con
 * fallback a las variables de entorno configuradas.
 */

import { supabaseServidor } from "@/lib/supabase/server";

const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

export interface CredencialesTikTok {
  accessToken: string;
  openId?: string;
  clientKey?: string;
  clientSecret?: string;
  fuente: "bd" | "env";
}

export interface ResultadoPublicacionTikTok {
  ok: boolean;
  publishId?: string;
  shareId?: string;
  permalink?: string;
  error?: string;
  detalles?: any;
}

export interface EstadoConexionTikTok {
  ok: boolean;
  usuario?: {
    openId: string;
    unionId?: string;
    nombre?: string;
    avatar?: string;
    link?: string;
    bio?: string;
    verificado?: boolean;
  };
  tokenConfigurado: boolean;
  tokenValido: boolean;
  clientKey?: string;
  error?: string;
}

/**
 * Traduce códigos de error frecuentes de la TikTok Open API a explicaciones claras en español.
 */
export function interpretarErrorTikTok(errorObj: any): string {
  if (!errorObj) return "Error desconocido al comunicar con TikTok.";
  const code = errorObj.code || errorObj.error_code;
  const msg = errorObj.message || errorObj.error_msg || String(errorObj);

  if (code === "access_token_invalid" || msg.includes("access_token") || code === 40101) {
    return "El Token de Acceso de TikTok ha expirado, no es válido o fue revocado. Genera un nuevo Access Token en el Portal de Desarrolladores de TikTok.";
  }
  if (code === "scope_not_authorized" || msg.includes("scope") || code === 40102) {
    return "Permisos insuficientes en TikTok: Se requiere que el token tenga concedidos los permisos 'user.info.basic', 'video.publish' y 'video.upload'.";
  }
  if (code === "rate_limit_exceeded" || msg.includes("rate limit") || code === 42901) {
    return "Se ha superado el límite de solicitudes de la API de TikTok. Por favor espera unos minutos antes de reintentar.";
  }
  if (msg.includes("video_url") || msg.includes("download") || msg.includes("inaccessible")) {
    return "TikTok no pudo descargar el video desde la URL proporcionada. Asegúrate de que el video esté disponible públicamente.";
  }
  if (code === "spam_risk_user" || msg.includes("spam")) {
    return "TikTok bloqueó temporalmente la publicación por sospecha de actividad automatizada o contenido duplicado.";
  }
  return `Error de TikTok (${code || "API"}): ${msg}`;
}

/**
 * Obtiene las credenciales de TikTok desde la base de datos o variables de entorno.
 */
export async function obtenerCredencialesTikTok(): Promise<CredencialesTikTok | null> {
  try {
    const sb = supabaseServidor();
    const { data, error } = await sb
      .from("configuracion_agente")
      .select("clave, valor")
      .in("clave", [
        "tiktok_access_token",
        "tiktok_open_id",
        "tiktok_client_key",
        "tiktok_client_secret",
      ]);

    if (!error && data && data.length > 0) {
      const mapa = Object.fromEntries(data.map((r) => [r.clave, r.valor]));
      if (mapa.tiktok_access_token && mapa.tiktok_access_token.trim().length > 10) {
        return {
          accessToken: mapa.tiktok_access_token.trim(),
          openId: mapa.tiktok_open_id?.trim() || undefined,
          clientKey: mapa.tiktok_client_key?.trim() || undefined,
          clientSecret: mapa.tiktok_client_secret?.trim() || undefined,
          fuente: "bd",
        };
      }
    }
  } catch (err) {
    console.warn("No se pudieron leer credenciales de TikTok desde BD:", err);
  }

  // Fallback a variables de entorno
  const envToken = process.env.TIKTOK_ACCESS_TOKEN || process.env.TIKTOK_DEVELOPER_TOKEN;
  if (envToken && envToken.trim().length > 10) {
    return {
      accessToken: envToken.trim(),
      openId: process.env.TIKTOK_OPEN_ID?.trim() || undefined,
      clientKey: process.env.TIKTOK_CLIENT_KEY?.trim() || undefined,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET?.trim() || undefined,
      fuente: "env",
    };
  }

  return null;
}

/**
 * Consulta el estado de conexión con TikTok validando el token contra el endpoint de usuario.
 */
export async function probarConexionTikTok(
  tokenPrueba?: string,
  openIdPrueba?: string
): Promise<EstadoConexionTikTok> {
  const creds = tokenPrueba
    ? { accessToken: tokenPrueba, openId: openIdPrueba, fuente: "env" as const }
    : await obtenerCredencialesTikTok();

  if (!creds?.accessToken) {
    return {
      ok: false,
      tokenConfigurado: false,
      tokenValido: false,
      clientKey: creds?.clientKey,
      error: "No se ha configurado ningún Token de Acceso para TikTok. Usa el botón de autorización o ingresa un token.",
    };
  }

  try {
    const url = `${TIKTOK_API_BASE}/user/info/?fields=open_id,union_id,avatar_url,display_name,profile_deep_link,bio_description,is_verified`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
      },
      cache: "no-store",
    });

    const json = await res.json();

    if (!res.ok || json.error?.code !== "ok" && json.error?.code !== 0 && json.error?.code !== undefined) {
      const errorMsg = json.error ? interpretarErrorTikTok(json.error) : `Error HTTP ${res.status} al consultar TikTok.`;
      return {
        ok: false,
        tokenConfigurado: true,
        tokenValido: false,
        error: errorMsg,
      };
    }

    const u = json.data?.user;
    return {
      ok: true,
      tokenConfigurado: true,
      tokenValido: true,
      usuario: {
        openId: u?.open_id || creds.openId || "Conectado",
        unionId: u?.union_id,
        nombre: u?.display_name || "Sauceda Oficial",
        avatar: u?.avatar_url,
        link: u?.profile_deep_link || "https://www.tiktok.com/@saucedamxbr",
        bio: u?.bio_description,
        verificado: u?.is_verified,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      tokenConfigurado: true,
      tokenValido: false,
      error: `Fallo de conexión de red con la API de TikTok: ${err.message || String(err)}`,
    };
  }
}

/**
 * Publica contenido en TikTok (Video directo o Imagen/Foto en formato vertical).
 */
export async function publicarEnTikTok(params: {
  titulo: string;
  contenido: string;
  urlMedia?: string;
  esVideo?: boolean;
}): Promise<ResultadoPublicacionTikTok> {
  const creds = await obtenerCredencialesTikTok();
  if (!creds?.accessToken) {
    return {
      ok: false,
      error: "No hay credenciales de TikTok configuradas en el CRM. Ve a 'Conectar TikTok' para ingresar tu Access Token.",
      plataforma: "tiktok",
    } as any;
  }

  const { titulo, contenido, urlMedia, esVideo } = params;
  const urlMediaFinal = urlMedia ? urlMedia.trim() : "";

  if (!urlMediaFinal) {
    return {
      ok: false,
      error: "TikTok requiere un archivo multimedia (video o imagen vertical) para publicar.",
    };
  }

  try {
    // Si es formato video
    if (esVideo) {
      const initUrl = `${TIKTOK_API_BASE}/post/publish/video/init/`;
      const body = {
        post_info: {
          title: titulo.slice(0, 150),
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_stitch: false,
          disable_comment: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: urlMediaFinal,
        },
      };

      const res = await fetch(initUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok || (json.error?.code && json.error.code !== "ok" && json.error.code !== 0)) {
        return {
          ok: false,
          error: interpretarErrorTikTok(json.error || json),
          detalles: json,
        };
      }

      const publishId = json.data?.publish_id;
      return {
        ok: true,
        publishId,
        permalink: "https://www.tiktok.com/@saucedamxbr",
        detalles: json.data,
      };
    }

    // Si es formato imagen / foto
    const initPhotoUrl = `${TIKTOK_API_BASE}/post/publish/content/init/`;
    const bodyPhoto = {
      post_info: {
        title: titulo.slice(0, 90),
        description: contenido ? contenido.slice(0, 2000) : titulo,
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_comment: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: 1,
        photo_images: [urlMediaFinal],
      },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    };

    const resPhoto = await fetch(initPhotoUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(bodyPhoto),
    });

    const jsonPhoto = await resPhoto.json();
    if (!resPhoto.ok || (jsonPhoto.error?.code && jsonPhoto.error.code !== "ok" && jsonPhoto.error.code !== 0)) {
      return {
        ok: false,
        error: interpretarErrorTikTok(jsonPhoto.error || jsonPhoto),
        detalles: jsonPhoto,
      };
    }

    const publishId = jsonPhoto.data?.publish_id;
    return {
      ok: true,
      publishId,
      permalink: "https://www.tiktok.com/@saucedamxbr",
      detalles: jsonPhoto.data,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: `Error de red al publicar en TikTok: ${err.message || String(err)}`,
    };
  }
}
