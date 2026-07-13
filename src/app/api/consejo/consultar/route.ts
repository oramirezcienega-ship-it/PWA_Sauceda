import { NextResponse } from "next/server";
import { supabaseSesion, rolDe } from "@/lib/supabase/cliente-sesion";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // 1. Validar autenticación y rol de administrador en el servidor
    const sbSesion = supabaseSesion();
    const { data: { user }, error: authError } = await sbSesion.auth.getUser();
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

    // 4. Configurar llamadas a la API de Anthropic (Claude)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta la API Key de Anthropic (ANTHROPIC_API_KEY) en las variables de entorno." },
        { status: 500 }
      );
    }
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

    // 5. Crear stream de respuesta (NDJSON)
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

            // El contexto del proyecto se inyecta en el system prompt
            const systemPrompt = `Contexto del Proyecto:
${projectContext}

Tu rol y directrices específicas:
${advisor.prompt}

Instrucción importante: Responde en español de forma directa, analítica, profesional y estructurada según tu área de especialidad. Evita saludos generales y ve al grano con pros, contras, riesgos y recomendaciones específicas para la alternativa.`;

            try {
              const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                  "x-api-key": apiKey,
                  "anthropic-version": "2023-06-01",
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  model: model,
                  max_tokens: 1000,
                  system: systemPrompt,
                  messages: [
                    {
                      role: "user",
                      content: `Pregunta o hipótesis a evaluar: "${question}"`,
                    },
                  ],
                }),
              });

              if (!res.ok) {
                const text = await res.text();
                throw new Error(`Anthropic error: ${res.status} - ${text}`);
              }

              const data = await res.json();
              const textResponse = data.content?.[0]?.text || "Sin respuesta.";

              opinions[advisor.name] = textResponse;

              // Emitir opinión en cuanto se genera para el streaming visual
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
            const res = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                model: model,
                max_tokens: 1500,
                system: systemPresident,
                messages: [
                  {
                    role: "user",
                    content: promptPresident,
                  },
                ],
              }),
            });

            if (!res.ok) {
              const text = await res.text();
              throw new Error(`Anthropic error (President): ${res.status} - ${text}`);
            }

            const data = await res.json();
            verdict = data.content?.[0]?.text || "No se pudo generar el veredicto.";

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
        "Connection": "keep-alive",
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
