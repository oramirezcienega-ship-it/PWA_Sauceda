import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarTelefono } from "@/lib/telefono";
import { enviarWhatsAppTexto } from "@/lib/whatsapp";
import { modeloClaude, opcionesClaude, textoDeRespuesta } from "@/lib/ia/claude";
import {
  ESTADOS_RETRO_LEAD,
  guardarRetroalimentacion,
  listarLeadsConRetro,
  type LeadCompartidoPortal,
} from "@/lib/portal-asesor";

/**
 * RETRO DE ASESORES POR WHATSAPP
 *
 * El asesor escribe "RETRO" al WhatsApp de la empresa (el link viene en la lista
 * que se le manda desde Coordinaciones). Se abre una sesión de 60 min en la que
 * todo lo que mande, texto o audio dictado (ya transcrito por el webhook), se
 * interpreta con IA como retroalimentación de sus clientes compartidos y se
 * guarda en retroalimentacion_asesor con origen "whatsapp". "LISTO" la cierra.
 */

const MINUTOS_SESION = 60;
const COMANDO_RETRO = /^\s*\*?retro\b\*?[\s:,.-]*/i;
const COMANDO_SALIR = /^\s*(listo|salir|terminar|terminé|termine|fin)\s*[.!]*\s*$/i;
const ESTADOS_FINALES = ["cerrado", "no_interesa", "no_puedo_atender"];

interface ClienteRetro {
  n: number;
  nombre: string;
  telefono: string;
  envios: LeadCompartidoPortal[];
  ultimo: LeadCompartidoPortal;
}

/** Un renglón por cliente (el mismo cliente compartido varias veces se agrupa por teléfono). */
function agruparClientes(leads: LeadCompartidoPortal[]): ClienteRetro[] {
  const mapa = new Map<string, LeadCompartidoPortal[]>();
  leads.forEach((l) => {
    const clave = normalizarTelefono(l.telefono) || `${l.clienteNombre.toLowerCase()}|${l.id}`;
    mapa.set(clave, [...(mapa.get(clave) || []), l]);
  });
  return Array.from(mapa.values()).map((envios, i) => {
    const ultimo = envios[0];
    return { n: i + 1, nombre: ultimo.clienteNombre, telefono: ultimo.telefono, envios, ultimo };
  });
}

const ultimaRetro = (c: ClienteRetro) =>
  c.envios.flatMap((e) => e.retro).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

function listaParaAsesor(clientes: ClienteRetro[]): string {
  return clientes
    .map((c) => {
      const r = ultimaRetro(c);
      return `${c.n}. *${c.nombre}* · ${c.telefono.slice(-10)} — ${r ? r.estadoLabel : "Sin respuesta"}`;
    })
    .join("\n");
}

interface RetroInterpretada {
  n: number;
  estado: string;
  comentario: string;
  siguiente_paso: string;
  siguiente_paso_fecha: string | null;
}

/** Pide a la IA que convierta el mensaje del asesor en retro por cliente. */
async function interpretarRetro(texto: string, clientes: ClienteRetro[]): Promise<RetroInterpretada[]> {
  const hoy = new Date().toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" });
  const system = `Eres el coordinador comercial de SAUCEDA. Un asesor de ventas te manda (por texto o audio transcrito) cómo va con sus clientes.
Convierte su mensaje en retroalimentación por cliente. Solo usa clientes de la lista (por número o por nombre, acepta nombres aproximados o apodos).
Estados válidos: ${Object.entries(ESTADOS_RETRO_LEAD).map(([k, v]) => `"${k}" (${v})`).join(", ")}.
Responde SOLO un JSON: [{"n": número del cliente, "estado": estado válido, "comentario": resumen breve y fiel de lo que dijo de ese cliente, "siguiente_paso": "" o lo que sigue, "siguiente_paso_fecha": null o "AAAA-MM-DD"}].
Hoy es ${hoy} (día/mes/año). Si no menciona a ningún cliente de la lista, responde [].`;
  const user = `Clientes del asesor:\n${clientes
    .map((c) => `${c.n}. ${c.nombre} (${c.telefono.slice(-10)})${c.ultimo.detalle?.tipoNegocio ? ` · ${c.ultimo.detalle.tipoNegocio}` : ""}`)
    .join("\n")}\n\nMensaje del asesor:\n${texto}`;

  let salida = "";
  const proveedor = process.env.IA_PROVEEDOR || (process.env.KIMI_API_KEY ? "kimi" : "anthropic");
  if (proveedor === "kimi" && process.env.KIMI_API_KEY) {
    const res = await fetch(`${process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1"}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.KIMI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.KIMI_MODEL || "kimi-k3",
        temperature: 0.1,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (res.ok) salida = String((await res.json()).choices?.[0]?.message?.content || "");
  } else if (process.env.ANTHROPIC_API_KEY) {
    const modelo = modeloClaude("claude-haiku-5-5");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelo,
        ...opcionesClaude(modelo, { maxTokens: 1200, temperature: 0.1 }),
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (res.ok) salida = textoDeRespuesta(await res.json());
  }

  const json = salida.match(/\[[\s\S]*\]/)?.[0];
  if (!json) return [];
  try {
    const lista = JSON.parse(json);
    return (Array.isArray(lista) ? lista : []).filter(
      (r: any) => clientes.some((c) => c.n === Number(r?.n)) && String(r?.estado) in ESTADOS_RETRO_LEAD
    );
  } catch {
    return [];
  }
}

/**
 * Si el mensaje es de un asesor en modo retro, lo procesa y responde por WhatsApp.
 * Devuelve true cuando el mensaje se consumió (no debe tratarse como lead).
 */
export async function procesarRetroAsesorWhatsApp(
  sb: SupabaseClient,
  mensaje: { telefono: string; texto: string; waMessageId?: string }
): Promise<boolean> {
  const tel = normalizarTelefono(mensaje.telefono);
  if (!tel) return false;

  const { data: perfiles } = await sb
    .from("perfiles")
    .select("id, nombre, telefono, telefono_whatsapp, retro_whatsapp_hasta, retro_whatsapp_ultimo_msg")
    .eq("activo", true);
  const asesor = (perfiles || []).find(
    (p: any) => [p.telefono_whatsapp, p.telefono].some((t) => t && normalizarTelefono(t) === tel)
  );
  if (!asesor) return false;

  const textoOriginal = (mensaje.texto || "").replace(/^\[audio:[^\]]*\]\s*/, "").trim();
  const esComando = COMANDO_RETRO.test(textoOriginal);
  const sesionActiva = asesor.retro_whatsapp_hasta && new Date(asesor.retro_whatsapp_hasta).getTime() > Date.now();
  if (!esComando && !sesionActiva) return false;

  // Meta reintenta el webhook: no procesar dos veces el mismo mensaje
  if (mensaje.waMessageId && asesor.retro_whatsapp_ultimo_msg === mensaje.waMessageId) return true;

  const responder = (t: string) => enviarWhatsAppTexto(tel, t).catch(() => null);
  const nombre = String(asesor.nombre || "").split(" ")[0];

  if (!esComando && COMANDO_SALIR.test(textoOriginal)) {
    await sb.from("perfiles").update({ retro_whatsapp_hasta: null, retro_whatsapp_ultimo_msg: mensaje.waMessageId || null }).eq("id", asesor.id);
    await responder(`¡Gracias, ${nombre}! 🙌 Ya quedó tu retro en el CRM. Cuando quieras dar más, escribe *RETRO*.`);
    return true;
  }

  await sb
    .from("perfiles")
    .update({
      retro_whatsapp_hasta: new Date(Date.now() + MINUTOS_SESION * 60000).toISOString(),
      retro_whatsapp_ultimo_msg: mensaje.waMessageId || null,
    })
    .eq("id", asesor.id);

  const clientes = agruparClientes(await listarLeadsConRetro(sb, { asesorId: asesor.id }));
  if (clientes.length === 0) {
    await responder(`Hola ${nombre} 👋 No tienes clientes compartidos recientes para dar retro.`);
    return true;
  }

  const texto = textoOriginal.replace(COMANDO_RETRO, "").trim();
  if (/\(mensaje de tipo audio\)/.test(texto)) {
    await responder("No pude escuchar tu audio 😕 ¿Me lo mandas otra vez o me lo escribes?");
    return true;
  }

  // Solo "RETRO": se manda la lista y se espera el audio o texto
  if (!texto) {
    const pendientes = clientes.filter((c) => !ESTADOS_FINALES.includes(ultimaRetro(c)?.estado || ""));
    await responder(
      [
        `Hola ${nombre} 👋 Estos son tus clientes compartidos:`,
        "",
        listaParaAsesor(pendientes.length ? pendientes : clientes),
        "",
        `🎙️ Mándame un *audio* o *texto* diciendo cómo vas con cada uno (por nombre o número): si ya lo contactaste, si no contesta, si ya cotizaste, si se cerró o no le interesa, y qué sigue.`,
        `Cuando termines escribe *LISTO*.`,
      ].join("\n")
    );
    return true;
  }

  const interpretadas = await interpretarRetro(texto, clientes);
  if (interpretadas.length === 0) {
    await responder(
      `No identifiqué a qué cliente te refieres 🤔 Dime el nombre o número de la lista y cómo vas con él.\n\n${listaParaAsesor(clientes)}`
    );
    return true;
  }

  const guardadas: string[] = [];
  for (const r of interpretadas) {
    const c = clientes.find((x) => x.n === Number(r.n))!;
    try {
      // Se registra en todos los envíos del mismo cliente para que ninguno quede "Sin respuesta"
      for (const envio of c.envios) {
        await guardarRetroalimentacion(sb, {
          asesorId: asesor.id,
          tipo: "lead",
          referenciaId: envio.id,
          estado: r.estado,
          siguientePaso: r.siguiente_paso || "",
          siguientePasoFecha: /^\d{4}-\d{2}-\d{2}$/.test(r.siguiente_paso_fecha || "") ? r.siguiente_paso_fecha : null,
          comentario: r.comentario || "",
          origen: "whatsapp",
        });
      }
      const etiqueta = (ESTADOS_RETRO_LEAD as Record<string, string>)[r.estado];
      guardadas.push(`✅ *${c.nombre}*: ${etiqueta}${r.comentario ? ` — ${r.comentario}` : ""}${r.siguiente_paso ? `\n   ➡️ ${r.siguiente_paso}` : ""}`);
    } catch (err) {
      console.error("[Retro WhatsApp] No se pudo guardar la retro:", err);
      guardadas.push(`⚠️ *${c.nombre}*: no se pudo guardar, inténtalo de nuevo.`);
    }
  }

  await responder(
    [`Listo, registré tu retro:`, "", ...guardadas, "", `¿Algún otro cliente? Mándame otro audio o escribe *LISTO*.`].join("\n")
  );
  return true;
}
