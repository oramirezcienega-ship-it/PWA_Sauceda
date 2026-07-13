import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { analizarConversacionConIA } from "@/app/actions/analisis-ia";
import { variantesTelefono } from "@/lib/telefono";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let telefono = searchParams.get("telefono");

  const sb = supabaseServidor();

  try {
    // Si no se especifica teléfono, buscar el último de mensajes_whatsapp
    if (!telefono) {
      const { data: ultimoMsg } = await sb
        .from("mensajes_whatsapp")
        .select("telefono")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ultimoMsg) {
        telefono = ultimoMsg.telefono;
      }
    }

    if (!telefono) {
      return NextResponse.json({
        ok: false,
        error: "No se proporcionó un teléfono ni se encontraron mensajes en mensajes_whatsapp.",
      });
    }

    console.log(`[API PROBAR ANALISIS] Iniciando análisis para teléfono: ${telefono}`);
    
    // Ejecutamos directamente sin requireAdmin en este endpoint de test para que corra
    // de forma pública y no falle por sesión al abrirlo en navegador
    
    // Copia simplificada de la lógica de analizarConversacionConIA pero sin validación de sesión
    let mensajes: Array<{ role: "user" | "assistant"; text: string; created_at: string }> = [];
    const variantes = variantesTelefono(telefono);

    // Buscar prospecto y expediente asociados para obtener IDs y hacer búsquedas cruzadas robustas
    let prospectoId = "";
    let expedienteId = "";
    try {
      const { data: prospecto } = await sb
        .from("prospectos")
        .select("id")
        .in("telefono", variantes)
        .maybeSingle();
      
      if (prospecto) {
        prospectoId = prospecto.id;
        const { data: exp } = await sb
          .from("expedientes")
          .select("id")
          .eq("prospecto_id", prospecto.id)
          .maybeSingle();
        if (exp) {
          expedienteId = exp.id;
        }
      }
    } catch {
      // Ignorar si la tabla prospectos/expedientes no existe
    }

    try {
      // Intentar esquema estándar
      const { data: lead } = await sb
        .from("leads")
        .select("id")
        .in("phone", variantes)
        .maybeSingle();

      if (lead) {
        const { data: conv } = await sb
          .from("conversations")
          .select("id")
          .eq("lead_id", lead.id)
          .maybeSingle();

        if (conv) {
          const { data: msgs } = await sb
            .from("messages")
            .select("role, text, created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: true });

          mensajes = (msgs as any[]) ?? [];
        }
      }
    } catch {
      // Si falla, se asume esquema fallback
    }

    // Fallback si no hay mensajes en esquema estándar
    if (mensajes.length === 0) {
      const filtrosOr = [`telefono.in.(${variantes.map(v => `"${v}"`).join(",")})`];
      if (prospectoId) {
        filtrosOr.push(`prospecto_id.eq.${prospectoId}`);
      }
      if (expedienteId) {
        filtrosOr.push(`expediente_id.eq.${expedienteId}`);
      }

      const { data: msgs } = await sb
        .from("mensajes_whatsapp")
        .select("direccion, texto, created_at")
        .or(filtrosOr.join(","))
        .order("created_at", { ascending: true });

      mensajes = (msgs ?? []).map((m) => ({
        role: m.direccion === "in" ? "user" : "assistant",
        text: m.texto || "",
        created_at: m.created_at
      }));
    }

    if (mensajes.length === 0) {
      throw new Error("No hay mensajes en esta conversación para analizar.");
    }

    const conversacionFormateada = mensajes
      .map((m) => {
        const remitente = m.role === "user" ? "Cliente" : "Sofía (IA)";
        return `${remitente} [${new Date(m.created_at).toLocaleString()}]: ${m.text}`;
      })
      .join("\n\n");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Falta la API Key de Anthropic (ANTHROPIC_API_KEY) en las variables de entorno.");
    }

    const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
    const prompt = `Eres un analista de ventas para SAUCEDA Bienes Raíces, especialistas en traspasos INFONAVIT en León, Guanajuato.

Analiza esta conversación entre Sofía (agente IA) y un lead:

${conversacionFormateada}

Responde EXCLUSIVAMENTE con un objeto JSON válido. No incluyas explicaciones antes ni después del JSON. El formato debe ser exactamente:
{
  "resumen": "2 líneas de qué pasó",
  "punto_de_quiebre": "en qué momento o mensaje se perdió el lead",
  "razon_perdida": "por qué no avanzó",
  "calidad_lead": "alta / media / baja",
  "recomendacion": "qué debería haber dicho Sofía diferente",
  "recuperable": true
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic respondió error ${response.status}: ${errorText}`);
    }

    const resultJson = await response.json();
    return NextResponse.json({
      ok: true,
      telefono,
      conversacionFormateada,
      resultJson,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      telefono,
      error_message: err.message,
      error_stack: err.stack,
    });
  }
}
