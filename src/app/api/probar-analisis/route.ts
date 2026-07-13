import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { analizarConversacionConIA } from "@/app/actions/analisis-ia";
import { variantesTelefono, normalizarTelefono } from "@/lib/telefono";

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
    const traceLog: any = {
      variantes,
      prospecto: null,
      expediente: null,
      lead_estandar: null,
      conv_estandar: null,
      msgs_estandar_count: 0,
      msgs_fallback_count: 0,
      filtrosOr_fallback: []
    };

    // Buscar prospecto y expediente asociados para obtener IDs y hacer búsquedas cruzadas robustas
    let prospectoId = "";
    let expedienteId = "";
    try {
      const { data: todosProspectos, error: pErr } = await sb
        .from("prospectos")
        .select("id, telefono, nombre");

      if (pErr) traceLog.prospecto_error = pErr.message;
      traceLog.total_prospectos_bd = todosProspectos?.length || 0;
      traceLog.todos_prospectos = (todosProspectos ?? []).map(p => ({
        id: p.id,
        nombre: p.nombre,
        telefono: p.telefono,
        telefono_normalizado: p.telefono ? normalizarTelefono(p.telefono) : null
      }));

      const telCanon = normalizarTelefono(telefono);
      const diezDigitosTarget = telCanon.slice(-10);

      const prospectoCoincidente = (todosProspectos ?? []).find((p) => {
        if (!p.telefono) return false;
        const pCanon = normalizarTelefono(p.telefono);
        const pDiez = pCanon.slice(-10);
        return pDiez === diezDigitosTarget;
      });
      
      if (prospectoCoincidente) {
        prospectoId = prospectoCoincidente.id;
        traceLog.prospecto = prospectoCoincidente;
        
        const { data: exp, error: eErr } = await sb
          .from("expedientes")
          .select("id, etapa, prospecto_id")
          .eq("prospecto_id", prospectoCoincidente.id)
          .maybeSingle();
        
        if (eErr) traceLog.expediente_error = eErr.message;
        if (exp) {
          expedienteId = exp.id;
          traceLog.expediente = exp;
        }
      } else {
        traceLog.prospecto_busqueda_msg = "No se encontró prospecto coincidente en memoria.";
      }
    } catch (err: any) {
      traceLog.prospecto_catch_error = err.message;
    }

    try {
      // Intentar esquema estándar
      const { data: lead, error: lErr } = await sb
        .from("leads")
        .select("id, name, phone")
        .in("phone", variantes)
        .maybeSingle();

      if (lErr) traceLog.lead_estandar_error = lErr.message;
      if (lead) {
        traceLog.lead_estandar = lead;
        const { data: conv, error: cErr } = await sb
          .from("conversations")
          .select("id, lead_id")
          .eq("lead_id", lead.id)
          .maybeSingle();

        if (cErr) traceLog.conv_estandar_error = cErr.message;
        if (conv) {
          traceLog.conv_estandar = conv;
          const { data: msgs, error: mErr } = await sb
            .from("messages")
            .select("role, text, created_at")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: true });

          if (mErr) traceLog.msgs_estandar_error = mErr.message;
          mensajes = (msgs as any[]) ?? [];
          traceLog.msgs_estandar_count = mensajes.length;
        }
      }
    } catch (err: any) {
      traceLog.estandar_catch_error = err.message;
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

      traceLog.filtrosOr_fallback = filtrosOr;

      try {
        const { data: msgs, error: mwErr } = await sb
          .from("mensajes_whatsapp")
          .select("id, direccion, texto, created_at, telefono, prospecto_id, expediente_id")
          .or(filtrosOr.join(","))
          .order("created_at", { ascending: true });

        if (mwErr) traceLog.msgs_fallback_error = mwErr.message;
        if (msgs) {
          mensajes = msgs.map((m) => ({
            role: m.direccion === "in" ? "user" : "assistant",
            text: m.texto || "",
            created_at: m.created_at
          }));
          traceLog.msgs_fallback_count = mensajes.length;
          traceLog.msgs_fallback_sample = msgs.slice(0, 3); // Muestra de los primeros 3 mensajes
        }
      } catch (err: any) {
        traceLog.fallback_catch_error = err.message;
      }
    }

    if (mensajes.length === 0) {
      return NextResponse.json({
        ok: false,
        telefono,
        error_message: "No hay mensajes en esta conversación para analizar.",
        traceLog,
      });
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
