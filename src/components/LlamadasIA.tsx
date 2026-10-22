"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  aprobarLlamadasIA,
  cancelarLlamadaIA,
  generarListaReagendarIA,
  llamarAhoraIA,
  probarLlamadaIA,
  sincronizarLlamadaIA,
  type ConfiguracionLlamadasIA,
} from "@/app/actions/llamadas-ia";
import type { LlamadaIA, EstadoLlamadaIA, ResultadoLlamadaIA } from "@/features/llamadas-ia/service";

const ESTADOS: Record<EstadoLlamadaIA, { label: string; clase: string }> = {
  pendiente: { label: "Por aprobar", clase: "bg-carbon/5 text-carbon/70 border-carbon/15" },
  aprobada: { label: "Aprobada", clase: "bg-blue-50 text-blue-800 border-blue-200" },
  en_curso: { label: "En curso", clase: "bg-yellow-100 text-yellow-800 border-yellow-200 animate-pulse" },
  completada: { label: "Completada", clase: "bg-green-100 text-green-800 border-green-200" },
  fallida: { label: "Fallida", clase: "bg-red-100 text-red-800 border-red-200" },
  cancelada: { label: "Cancelada", clase: "bg-carbon/5 text-carbon/40 border-carbon/10" },
};

const RESULTADOS: Record<ResultadoLlamadaIA, string> = {
  visita_agendada: "✅ Aceptó visita (falta anticipo)",
  transferido: "📞 Transferido a asesor",
  duda: "❓ Tiene dudas",
  no_interesado: "✖ No interesado",
  llamar_despues: "⏰ Llamar después",
  no_contesta: "— No contestó",
  buzon: "📭 Buzón",
  no_llamar: "⛔ No llamar",
  error: "⚠ Error",
};

function fecha(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LlamadasIA({ inicial, config }: { inicial: LlamadaIA[]; config: ConfiguracionLlamadasIA }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [prueba, setPrueba] = useState({ telefono: "", nombre: "", servicio: "impermeabilización", colonia: "" });

  const configurado = config.vapiApiKey && config.vapiNumero;
  const hayEnCurso = inicial.some((l) => l.estado === "en_curso");

  // Mientras haya llamadas en curso, refrescar para ver el resultado al colgar.
  useEffect(() => {
    if (!hayEnCurso) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [hayEnCurso, router]);

  function ejecutar(accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) {
    setMensaje(null);
    iniciar(async () => {
      const r = await accion();
      setMensaje(r.ok ? { ok: true, texto: exito } : { ok: false, texto: r.error || "Ocurrió un error." });
      router.refresh();
    });
  }

  const reales = inicial.filter((l) => !l.es_prueba);
  const contestadas = reales.filter((l) => l.resultado && !["no_contesta", "buzon", "error"].includes(l.resultado)).length;
  const visitas = reales.filter((l) => l.resultado === "visita_agendada").length;
  const costo = inicial.reduce((s, l) => s + (Number(l.costo_usd) || 0), 0);
  const pendientes = inicial.filter((l) => l.estado === "pendiente");

  return (
    <div className="space-y-4">
      {!configurado && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
          <p className="font-semibold">Falta configurar Vapi para poder marcar.</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {!config.vapiApiKey && <li>Variable de entorno <code>VAPI_API_KEY</code> (llave privada de Vapi).</li>}
            {!config.vapiNumero && (
              <li>
                <code>VAPI_PHONE_NUMBER_ID</code>: número de Twilio importado en Vapi. Usa uno distinto al del
                conmutador, porque importarlo cambia su webhook de voz.
              </li>
            )}
          </ul>
        </div>
      )}

      {mensaje && (
        <p
          className={`rounded-lg border px-4 py-2 text-sm ${
            mensaje.ok ? "border-green-200 bg-green-50 text-green-800" : "border-rojo/30 bg-rojo/10 text-rojo"
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi titulo="En cola" valor={inicial.filter((l) => ["pendiente", "aprobada"].includes(l.estado)).length} />
        <Kpi titulo="Contestadas" valor={contestadas} />
        <Kpi titulo="Visitas aceptadas" valor={visitas} />
        <Kpi titulo="Costo Vapi" valor={`$${costo.toFixed(2)} USD`} />
      </div>

      {/* Llamada de prueba */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ejecutar(() => probarLlamadaIA(prueba), "Llamada de prueba en marcha: contesta tu teléfono.");
        }}
        className="rounded-xl border border-carbon/10 bg-white p-4 shadow-sm"
      >
        <p className="mb-3 text-sm font-semibold text-verde-profundo">Llamada de prueba a tu número</p>
        <div className="grid gap-3 md:grid-cols-4">
          <Campo label="Teléfono (10 dígitos)" value={prueba.telefono} requerido onChange={(v) => setPrueba({ ...prueba, telefono: v })} />
          <Campo label="Nombre" value={prueba.nombre} onChange={(v) => setPrueba({ ...prueba, nombre: v })} />
          <Campo label="Servicio" value={prueba.servicio} onChange={(v) => setPrueba({ ...prueba, servicio: v })} />
          <Campo label="Colonia" value={prueba.colonia} onChange={(v) => setPrueba({ ...prueba, colonia: v })} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pendiente || !configurado}
            className="rounded-lg bg-verde-profundo px-4 py-1.5 text-sm font-semibold text-crema shadow-sm transition hover:bg-sauce disabled:opacity-40"
          >
            {pendiente ? "Marcando…" : "📞 Llamarme"}
          </button>
          <span className="text-xs text-carbon/50">
            Queda marcada como prueba: no toca cotizaciones ni prospectos. Puede marcar fuera de horario.
          </span>
        </div>
      </form>

      {/* Cola */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            if (!confirm("Se agregan a la cola, SIN marcar, las cotizaciones en 'esperando visita'. Cada una se aprueba aparte. ¿Continuar?")) return;
            setMensaje(null);
            iniciar(async () => {
              const r = await generarListaReagendarIA();
              setMensaje(r.ok ? { ok: true, texto: `Se agregaron ${r.agregadas} a la cola (por aprobar).` } : { ok: false, texto: r.error || "Error" });
              router.refresh();
            });
          }}
          className="rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-xs font-semibold text-verde-profundo transition hover:border-sauce disabled:opacity-40"
        >
          Generar lista: cotizaciones esperando visita
        </button>
        {pendientes.length > 0 && (
          <button
            type="button"
            disabled={pendiente || seleccion.length === 0}
            onClick={() => ejecutar(() => aprobarLlamadasIA(seleccion), `${seleccion.length} aprobadas.`)}
            className="rounded-lg bg-sauce px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-40"
          >
            Aprobar seleccionadas ({seleccion.length})
          </button>
        )}
        <button
          type="button"
          onClick={() => router.refresh()}
          className="ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold text-carbon/60 hover:text-verde-profundo"
        >
          ↻ Actualizar
        </button>
      </div>

      <div className="overflow-auto rounded-xl border border-carbon/10 bg-white shadow-sm scrollbar-sutil">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-carbon/10 bg-crema/90 text-left">
              <Th>
                <input
                  type="checkbox"
                  aria-label="Seleccionar todas por aprobar"
                  checked={pendientes.length > 0 && seleccion.length === pendientes.length}
                  onChange={(e) => setSeleccion(e.target.checked ? pendientes.map((l) => l.id) : [])}
                />
              </Th>
              <Th>Cliente</Th>
              <Th>Estado</Th>
              <Th>Resultado</Th>
              <Th>Intentos</Th>
              <Th>Horario pedido</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {inicial.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-carbon/50">
                  Aún no hay llamadas. Haz una llamada de prueba a tu número para empezar.
                </td>
              </tr>
            ) : (
              inicial.map((ll) => (
                <FilaLlamada
                  key={ll.id}
                  ll={ll}
                  abierta={abierta === ll.id}
                  onAbrir={() => setAbierta(abierta === ll.id ? null : ll.id)}
                  seleccionada={seleccion.includes(ll.id)}
                  onSeleccionar={(v) => setSeleccion(v ? [...seleccion, ll.id] : seleccion.filter((x) => x !== ll.id))}
                  ocupado={pendiente}
                  configurado={configurado}
                  ejecutar={ejecutar}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaLlamada({
  ll,
  abierta,
  onAbrir,
  seleccionada,
  onSeleccionar,
  ocupado,
  configurado,
  ejecutar,
}: {
  ll: LlamadaIA;
  abierta: boolean;
  onAbrir: () => void;
  seleccionada: boolean;
  onSeleccionar: (v: boolean) => void;
  ocupado: boolean;
  configurado: boolean;
  ejecutar: (accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) => void;
}) {
  const est = ESTADOS[ll.estado];
  const tieneDetalle = !!(ll.resumen || ll.transcripcion || ll.grabacion_url || ll.error);
  const btn = "rounded-md border border-carbon/15 px-2 py-0.5 text-xs font-semibold text-verde-profundo transition hover:border-sauce disabled:opacity-40";

  return (
    <>
      <tr className="border-b border-carbon/5 align-top hover:bg-carbon/5">
        <td className="px-3 py-3">
          {ll.estado === "pendiente" && (
            <input type="checkbox" aria-label="Seleccionar" checked={seleccionada} onChange={(e) => onSeleccionar(e.target.checked)} />
          )}
        </td>
        <td className="px-3 py-3">
          <span className="block font-semibold text-verde-profundo">
            {ll.nombre || "Sin nombre"}
            {ll.es_prueba && (
              <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-purple-700">Prueba</span>
            )}
          </span>
          <span className="block font-mono text-xs text-carbon/60">{ll.telefono}</span>
          <span className="block text-xs text-carbon/50">
            {ll.contexto?.servicio}
            {ll.cotizacion_id && (
              <>
                {" · "}
                <Link href={`/construccion/${ll.cotizacion_id}`} className="text-sauce hover:underline">
                  {ll.cotizacion_id}
                </Link>
              </>
            )}
          </span>
        </td>
        <td className="px-3 py-3">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${est.clase}`}>{est.label}</span>
          {ll.proximo_intento && ll.estado === "aprobada" && (
            <span className="mt-1 block text-[11px] text-carbon/50">Próximo: {fecha(ll.proximo_intento)}</span>
          )}
        </td>
        <td className="px-3 py-3 text-xs">{ll.resultado ? RESULTADOS[ll.resultado] : "--"}</td>
        <td className="px-3 py-3 font-mono text-xs">
          {ll.intentos}/{ll.max_intentos}
        </td>
        <td className="px-3 py-3 text-xs">{fecha(ll.fecha_visita)}</td>
        <td className="px-3 py-3">
          <div className="flex flex-wrap gap-1">
            {ll.estado === "pendiente" && (
              <button type="button" className={btn} disabled={ocupado} onClick={() => ejecutar(() => aprobarLlamadasIA([ll.id]), "Aprobada.")}>
                Aprobar
              </button>
            )}
            {ll.estado === "aprobada" && (
              <button
                type="button"
                className={btn}
                disabled={ocupado || !configurado}
                onClick={() => ejecutar(() => llamarAhoraIA(ll.id), "Marcando…")}
              >
                Llamar ahora
              </button>
            )}
            {ll.estado === "en_curso" && (
              <button type="button" className={btn} disabled={ocupado} onClick={() => ejecutar(() => sincronizarLlamadaIA(ll.id), "Sincronizada con Vapi.")}>
                Consultar Vapi
              </button>
            )}
            {["pendiente", "aprobada", "fallida"].includes(ll.estado) && (
              <button type="button" className={btn} disabled={ocupado} onClick={() => ejecutar(() => cancelarLlamadaIA(ll.id), "Cancelada.")}>
                Cancelar
              </button>
            )}
            {tieneDetalle && (
              <button type="button" className={btn} onClick={onAbrir}>
                {abierta ? "Ocultar" : "Detalle"}
              </button>
            )}
          </div>
        </td>
      </tr>
      {abierta && (
        <tr className="border-b border-carbon/10 bg-crema/40">
          <td colSpan={7} className="space-y-2 px-6 py-4 text-sm">
            {ll.error && <p className="text-rojo">⚠ {ll.error}</p>}
            {ll.resumen && (
              <p>
                <span className="font-semibold text-verde-profundo">Resumen: </span>
                {ll.resumen}
              </p>
            )}
            {ll.grabacion_url && <audio src={ll.grabacion_url} controls className="h-8 w-full max-w-md" />}
            {ll.transcripcion && (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-cuerpo text-xs text-carbon/80">
                {ll.transcripcion}
              </pre>
            )}
            <p className="text-xs text-carbon/40">
              {ll.duracion_seg != null && `Duración ${ll.duracion_seg}s · `}
              {ll.costo_usd != null && `Costo $${Number(ll.costo_usd).toFixed(3)} USD · `}
              Creada {fecha(ll.created_at)}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function Kpi({ titulo, valor }: { titulo: string; valor: string | number }) {
  return (
    <div className="rounded-xl border border-carbon/10 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-carbon/40">{titulo}</p>
      <p className="mt-1 font-titular text-2xl font-semibold text-verde-profundo">{valor}</p>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  requerido,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  requerido?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-carbon/40">{label}</span>
      <input
        type="text"
        value={value}
        required={requerido}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-sm text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
      />
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-carbon/50">{children}</th>;
}
