import { test } from "node:test";
import assert from "node:assert/strict";
import { esModeloRetirado, modeloClaude, opcionesClaude, textoDeRespuesta } from "../src/lib/ia/claude.ts";

test("modelo: los retirados caen al predeterminado; los vigentes se respetan", () => {
  const antes = process.env.ANTHROPIC_MODEL;
  try {
    process.env.ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";
    assert.equal(modeloClaude(), "claude-sonnet-5-5");
    process.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";
    assert.equal(modeloClaude(), "claude-sonnet-4-6");
    delete process.env.ANTHROPIC_MODEL;
    assert.equal(modeloClaude("claude-haiku-5-5"), "claude-haiku-5-5");
  } finally {
    if (antes === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = antes;
  }
  assert.ok(esModeloRetirado("claude-3-7-sonnet-20250219"));
  assert.ok(!esModeloRetirado("claude-sonnet-5-5"));
});

test("opciones: los modelos nuevos no reciben temperature y piensan poco", () => {
  assert.deepEqual(opcionesClaude("claude-sonnet-5-5", { maxTokens: 1000, temperature: 0.1 }), {
    max_tokens: 2048,
    output_config: { effort: "low" },
  });
  assert.deepEqual(opcionesClaude("claude-sonnet-4-6", { maxTokens: 1000, temperature: 0.1 }), { max_tokens: 1000, temperature: 0.1 });
  assert.equal(opcionesClaude("claude-haiku-5-5", { maxTokens: 9000 }).max_tokens, 16000);
});

test("texto de la respuesta ignora los bloques de pensamiento", () => {
  assert.equal(textoDeRespuesta({ content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Hola" }, { type: "text", text: " mundo" }] }), "Hola mundo");
  assert.equal(textoDeRespuesta({}), "");
});
