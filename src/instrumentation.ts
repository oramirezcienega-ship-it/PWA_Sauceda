/**
 * Arranque del servidor (Next.js instrumentation).
 *
 * Producción corre en Coolify con `next start` (proceso siempre encendido).
 * Cada push a main redespliega y reemplaza el contenedor: si en ese momento
 * Sofía estaba respondiendo, el proceso muere y el cliente se queda sin
 * respuesta (caso EXP-638). Esta red de seguridad revisa al arrancar y cada
 * 2 minutos los chats que quedaron sin contestar.
 */

export async function register() {
  // Patrón documentado de Next: el import condicional evita empaquetar código
  // de Node en el runtime edge.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { iniciarRescateIA } = await import("@/lib/ia/rescate-periodico");
    iniciarRescateIA();
  }
}
