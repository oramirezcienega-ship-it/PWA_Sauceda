import { NextResponse } from "next/server";
import { supabaseSesion, rolDe } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Realiza llamadas a la IA respetando IA_PROVEEDOR (Kimi, Anthropic, Ollama).
 */
async function llamarIA({
  systemPrompt,
  userPrompt,
  maxTokens = 1200,
}: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<string> {
  const proveedor = (
    process.env.IA_PROVEEDOR || (process.env.KIMI_API_KEY ? "kimi" : "anthropic")
  ).toLowerCase();

  if (proveedor === "kimi" && process.env.KIMI_API_KEY) {
    const apiKey = process.env.KIMI_API_KEY;
    const baseUrl = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
    const model = process.env.KIMI_MODEL || "kimi-k3";

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Kimi API (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return (data.choices?.[0]?.message?.content || "").trim();
  } else if (proveedor === "ollama" && process.env.OLLAMA_URL) {
    const url = process.env.OLLAMA_URL;
    const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return (data.choices?.[0]?.message?.content || data.message?.content || "").trim();
  } else {
    // Anthropic / Claude
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Falta API Key de IA (ANTHROPIC_API_KEY / KIMI_API_KEY) en las variables de entorno.");
    }

    let model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
    if (model.includes("claude-sonnet-4-6") || model.includes("claude-haiku-4-5")) {
      model = "claude-3-5-sonnet-20241022";
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic (${res.status}): ${text}`);
    }

    const data = await res.json();
    return (data.content?.[0]?.text || "").trim();
  }
}

export async function POST(req: Request) {
  try {
    // 1. Validar autenticación y rol de administrador en el servidor
    const sbSesion = supabaseSesion();
    const {
      data: { user },
      error: authError,
    } = await sbSesion.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { rol, activo } = await rolDe(user.id);
    if (rol !== "admin" || !activo) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // 2. Extraer datos del request body
    const body = await req.json();
    const { projectId, question, advisors } = body as {
      projectId: string;
      question: string;
      advisors: Array<{ id: string; name: string; prompt: string; enabled: boolean }>;
    };

    if (!projectId || !question || !advisors || advisors.length === 0) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    // 3. Obtener el contexto del proyecto desde la base de datos
    const sb = supabaseServidor();
    const { data: proyecto, error: errProj } = await sb
      .from("council_projects")
      .select("context, name")
      .eq("id", projectId)
      .maybeSingle();

    if (errProj || !proyecto) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }

    const projectContext = proyecto.context || "";

    // 4. Crear stream de respuesta (NDJSON)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendChunk = (data: any) => {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        };

        try {
          const activeAdvisors = advisors.filter((a) => a.enabled);
          if (activeAdvisors.length === 0) {
            sendChunk({ type: "error", message: "No hay asesores activos seleccionados." });
            controller.close();
            return;
          }

          sendChunk({ type: "status", message: "Reuniendo opiniones de los especialistas..." });

          const opinions: Record<string, string> = {};

          // Ejecutar llamadas a los consejeros en paralelo (Promise.all)
          const promesasAsesores = activeAdvisors.map(async (advisor) => {
            sendChunk({ type: "advisor_start", name: advisor.name });

            const systemPrompt = `Contexto del Proyecto:
${projectContext}

Tu rol y directrices específicas:
${advisor.prompt}

Instrucción importante: Responde en español de forma directa, analítica, profesional y estructurada según tu área de especialidad. Evita saludos generales y ve al grano con pros, contras, riesgos y recomendaciones específicas para la alternativa.`;

            try {
              const textResponse = await llamarIA({
                systemPrompt,
                userPrompt: `Pregunta o hipótesis a evaluar: "${question}"`,
                maxTokens: 1000,
              });

              opinions[advisor.name] = textResponse;

              sendChunk({
                type: "advisor_done",
                name: advisor.name,
                opinion: textResponse,
              });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : "Error desconocido";
              console.error(`Error en asesor ${advisor.name}:`, err);
              opinions[advisor.name] = `Error al consultar al asesor: ${errMsg}`;
              sendChunk({
                type: "advisor_done",
                name: advisor.name,
                opinion: `Error: ${errMsg}`,
                error: true,
              });
            }
          });

          // Esperar a que concluyan los análisis de todos los especialistas
          await Promise.all(promesasAsesores);

          // Convocar al Presidente del Consejo para el Veredicto Final
          sendChunk({ type: "status", message: "Generando veredicto del Presidente..." });
          sendChunk({ type: "president_start" });

          const systemPresident = `Contexto del Proyecto:
${projectContext}

Eres el Presidente de SAUCEDA Bienes Raíces. Tu función es consolidar el análisis estratégico de tus consejeros y dar un veredicto definitivo (por ejemplo: proceder, rechazar, buscar otra alternativa, ajustar condiciones). Escribe en español, de forma muy ejecutiva, clara, concisa y estructurada.`;

          const promptPresident = `Pregunta o hipótesis planteada: "${question}"

A continuación tienes las opiniones individuales de los asesores especialistas del consejo:
${Object.entries(opinions)
  .map(([name, text]) => `--- OPINIÓN DE ${name.toUpperCase()} ---\n${text}`)
  .join("\n\n")}

Genera el veredicto final consolidado. Sé claro y concluyente. Explica los pros, contras principales detectados por el consejo y la decisión recomendada.`;

          let verdict = "";
          try {
            verdict = await llamarIA({
              systemPrompt: systemPresident,
              userPrompt: promptPresident,
              maxTokens: 1500,
            });

            sendChunk({
              type: "verdict",
              verdict: verdict,
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Error desconocido";
            console.error("Error en Presidente:", err);
            verdict = `Error del Presidente al consolidar veredicto: ${errMsg}`;
            sendChunk({
              type: "verdict",
              verdict: verdict,
              error: true,
            });
          }

          // Guardar la alternativa resultante en la base de datos (Supabase)
          sendChunk({ type: "status", message: "Guardando consulta en el histórico..." });

          const { data: alternativa, error: errAlt } = await sb
            .from("council_alternatives")
            .insert({
              project_id: projectId,
              question: question,
              opinions: opinions,
              verdict: verdict,
              status: "Pendiente revisión",
            })
            .select()
            .single();

          if (errAlt) {
            console.error("Error al guardar alternativa en BD:", errAlt);
            sendChunk({
              type: "error",
              message: `Error al guardar en base de datos: ${errAlt.message}`,
            });
          } else {
            sendChunk({
              type: "done",
              alternativeId: alternativa.id,
              alternative: alternativa,
              opinions: opinions,
              verdict: verdict,
            });
          }
        } catch (err) {
          console.error("Error crítico en stream:", err);
          sendChunk({
            type: "error",
            message: err instanceof Error ? err.message : "Error crítico inesperado",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Error en API de consulta de consejo:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 }
    );
  }
}

