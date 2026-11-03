import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const VAPI_URL = "https://api.vapi.ai";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { llamadaId, identity = "oscar" } = body;

    if (!llamadaId) {
      return NextResponse.json({ ok: false, error: "Falta el ID de la llamada." }, { status: 400 });
    }

    const sb = supabaseServidor();
    const { data: llamada, error: dbErr } = await sb
      .from("llamadas_campana")
      .select("*")
      .eq("id", llamadaId)
      .maybeSingle();

    if (dbErr || !llamada) {
      return NextResponse.json({ ok: false, error: "Llamada no encontrada en el sistema." }, { status: 404 });
    }

    const vapiCallId = llamada.vapi_call_id;
    if (!vapiCallId) {
      return NextResponse.json({ ok: false, error: "La llamada no tiene ID de Vapi asociado." }, { status: 400 });
    }

    const vapiKey = process.env.VAPI_API_KEY;
    if (!vapiKey) {
      return NextResponse.json({ ok: false, error: "Falta VAPI_API_KEY." }, { status: 500 });
    }

    // 1. Obtener los detalles de la llamada activa desde Vapi
    const vapiRes = await fetch(`${VAPI_URL}/call/${vapiCallId}`, {
      headers: {
        Authorization: `Bearer ${vapiKey}`,
        "User-Agent": "Sauceda-CRM/1.0",
      },
      cache: "no-store",
    });

    if (!vapiRes.ok) {
      const errTxt = await vapiRes.text();
      return NextResponse.json(
        { ok: false, error: `Error de Vapi al consultar la llamada: ${errTxt}` },
        { status: 500 }
      );
    }

    const vapiCall = await vapiRes.json();
    const twilioCallSid = vapiCall.twilioCallSid || vapiCall.phoneCallProviderDetails?.twilioCallSid;
    const controlUrl = vapiCall.monitor?.controlUrl;

    // 2. Silenciar o desconectar a Sofía en Vapi de inmediato
    if (controlUrl) {
      try {
        await fetch(controlUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${vapiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "control",
            control: "mute-assistant",
          }),
        });
      } catch (e) {
        console.warn("No se pudo enviar mute-assistant a controlUrl:", e);
      }
    }

    // 3. Redirigir el audio en vivo de Twilio hacia el WebRTC del navegador (AirPods de Oscar)
    if (twilioCallSid) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;

      if (!accountSid || !authToken) {
        return NextResponse.json(
          { ok: false, error: "Faltan credenciales de Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)." },
          { status: 500 }
        );
      }

      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX" voice="Polly.Mia-Neural">Conectando con el especialista técnico...</Say>
  <Dial>
    <Client>${identity}</Client>
  </Dial>
</Response>`;

      const twilioParams = new URLSearchParams();
      twilioParams.append("Twiml", twiml);

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${twilioCallSid}.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: twilioParams.toString(),
        }
      );

      if (!twilioRes.ok) {
        const errDetail = await twilioRes.text();
        console.error("Twilio falló al redirigir la llamada:", errDetail);
        return NextResponse.json({
          ok: false,
          error: `Twilio no pudo transferir al navegador: ${errDetail}`,
        });
      }
    }

    // 4. Actualizar estado en base de datos
    await sb
      .from("llamadas_campana")
      .update({
        resultado: "transferido",
        resumen: "Intervención manual del supervisor vía WebRTC.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", llamadaId);

    return NextResponse.json({
      ok: true,
      mensaje: "Intervención ejecutada. La llamada ha sido transferida a tus AirPods.",
      twilioCallSid,
    });
  } catch (error) {
    console.error("Error crítico en intervenir llamada:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error interno al intervenir." },
      { status: 500 }
    );
  }
}
