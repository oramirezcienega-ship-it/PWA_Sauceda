"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  votarHorariosPortal,
  retroCoordinacionPortal,
  retroLeadPortal,
  type DatosPortalAsesor,
} from "@/app/actions/portal-asesor";
import {
  ESTADOS_RETRO_COORDINACION,
  ESTADOS_RETRO_LEAD,
  type CoordinacionPortal,
  type LeadCompartidoPortal,
  type Retroalimentacion,
} from "@/lib/portal-asesor-tipos";

interface Props {
  token: string;
  datos: DatosPortalAsesor;
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const soloDigitos = (t: string) => t.replace(/\D/g, "");
const telWhatsApp = (t: string) => {
  const d = soloDigitos(t);
  return d.length === 10 ? `52${d}` : d;
};

/** Portal del asesor: sus coordinaciones y clientes compartidos, con retroalimentación. */
export function PortalAsesor({ token, datos }: Props) {
  const [pestana, setPestana] = useState<"coordinaciones" | "clientes">("coordinaciones");
  const { asesor, coordinaciones, leads } = datos;

  const coordPendientes = coordinaciones.filter((c) => c.puedeVotar && !c.asesores.find((a) => a.id === asesor.id)?.respondio).length;
  const leadsSinRespuesta = leads.filter((l) => l.retro.length === 0).length;

  return (
    <main className="min-h-screen bg-[#F5F1E8] pb-16">
      <header className="bg-[#2D4A2B] text-white px-4 pt-6 pb-4">
        <p className="text-[11px] uppercase tracking-widest text-[#C9A961] font-bold">SAUCEDA · Portal del asesor</p>
        <h1 className="text-xl font-extrabold mt-1 text-white">Hola, {asesor.nombre.split(" ")[0]}</h1>
        <p className="text-xs text-white/70 mt-0.5">
          Responde aquí tus coordinaciones y cuéntanos cómo vas con tus clientes. Guarda este link en tu celular.
        </p>
      </header>

      <nav className="sticky top-0 z-10 bg-white border-b border-slate-200 flex">
        {[
          { id: "coordinaciones" as const, label: "Coordinaciones", n: coordPendientes },
          { id: "clientes" as const, label: "Mis clientes", n: leadsSinRespuesta },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPestana(t.id)}
            className={`flex-1 py-3 text-sm font-bold border-b-2 transition ${
              pestana === t.id ? "border-[#2D4A2B] text-[#2D4A2B]" : "border-transparent text-slate-400"
            }`}
          >
            {t.label}
            {t.n > 0 && (
              <span className="ml-1.5 inline-block min-w-[20px] rounded-full bg-red-500 px-1.5 text-[11px] text-white">
                {t.n}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="max-w-xl mx-auto px-4 pt-4 space-y-3">
        {pestana === "coordinaciones" ? (
          coordinaciones.length === 0 ? (
            <Vacio texto="No tienes coordinaciones recientes." />
          ) : (
            coordinaciones.map((c) => <TarjetaCoordinacion key={c.id} token={token} asesorId={asesor.id} c={c} />)
          )
        ) : leads.length === 0 ? (
          <Vacio texto="No tienes clientes compartidos recientes." />
        ) : (
          leads.map((l) => <TarjetaLead key={l.id} token={token} l={l} />)
        )}
      </div>
    </main>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p className="text-center text-sm text-slate-500 py-12">{texto}</p>;
}

function Chip({ texto, tono }: { texto: string; tono: "verde" | "ambar" | "gris" | "rojo" }) {
  const tonos = {
    verde: "bg-emerald-100 text-emerald-800",
    ambar: "bg-amber-100 text-amber-800",
    gris: "bg-slate-100 text-slate-600",
    rojo: "bg-red-100 text-red-700",
  };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tonos[tono]}`}>{texto}</span>;
}

function Historial({ retro }: { retro: Retroalimentacion[] }) {
  if (retro.length === 0) return null;
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tus respuestas</p>
      {retro.slice(0, 3).map((r) => (
        <div key={r.id} className="text-xs text-slate-700">
          <span className="font-bold">{r.estadoLabel}</span>
          <span className="text-slate-400"> · {fechaCorta(r.createdAt)}</span>
          {r.clientePresente !== null && (
            <span className="text-slate-500"> · Cliente {r.clientePresente ? "estaba" : "no estaba"}</span>
          )}
          {r.siguientePaso && (
            <div className="text-slate-500">
              Siguiente: {r.siguientePaso}
              {r.siguientePasoFecha ? ` (${r.siguientePasoFecha})` : ""}
            </div>
          )}
          {r.comentario && <div className="text-slate-500 italic">“{r.comentario}”</div>}
        </div>
      ))}
    </div>
  );
}

function BotonOpcion({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
        activo ? "bg-[#2D4A2B] border-[#2D4A2B] text-white" : "bg-white border-slate-200 text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function useGuardar() {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const guardar = async (fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) => {
    setGuardando(true);
    setMensaje(null);
    const r = await fn();
    setGuardando(false);
    setMensaje(r.ok ? { ok: true, texto: exito } : { ok: false, texto: r.error || "No se pudo guardar." });
    if (r.ok) router.refresh();
    return r.ok;
  };
  return { guardando, mensaje, guardar };
}

function Aviso({ mensaje }: { mensaje: { ok: boolean; texto: string } | null }) {
  if (!mensaje) return null;
  return <p className={`text-xs font-bold mt-2 ${mensaje.ok ? "text-emerald-700" : "text-red-600"}`}>{mensaje.texto}</p>;
}

function TarjetaCoordinacion({ token, asesorId, c }: { token: string; asesorId: string; c: CoordinacionPortal }) {
  const [votos, setVotos] = useState<Record<string, boolean>>(c.misVotos);
  const [estado, setEstado] = useState("");
  const [clientePresente, setClientePresente] = useState<boolean | null>(null);
  const [comentario, setComentario] = useState("");
  const votacion = useGuardar();
  const retro = useGuardar();

  const companeros = c.asesores.filter((a) => a.id !== asesorId).map((a) => a.nombre);
  const yaRespondi = c.asesores.find((a) => a.id === asesorId)?.respondio;
  const tono = c.estado === "confirmada" ? "verde" : c.estado === "cancelada" ? "rojo" : c.puedeVotar ? "ambar" : "gris";

  return (
    <article className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-slate-800">{c.clienteNombre}</h2>
          <p className="text-xs text-slate-600">{c.servicioNombre}</p>
        </div>
        <Chip texto={c.estadoLabel} tono={tono} />
      </div>
      <div className="mt-2 text-xs text-slate-600 space-y-0.5">
        {(c.fraccionamiento || c.ubicacion) && (
          <p>📍 {[c.fraccionamiento, c.ubicacion].filter((x) => x && x !== "Por definir").join(" · ") || "Por definir"}</p>
        )}
        {companeros.length > 0 && <p>👥 Vas con {companeros.join(", ")}</p>}
        {c.horarioConfirmado && <p className="font-bold text-emerald-700">🗓️ {c.horarioConfirmado}</p>}
        {c.detalles && <p className="text-slate-500">{c.detalles}</p>}
      </div>

      {c.puedeVotar && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-xs font-bold text-slate-700 mb-2">
            ¿Qué horarios puedes?{yaRespondi && <span className="font-normal text-slate-400"> (ya respondiste, puedes cambiar)</span>}
          </p>
          <div className="space-y-2">
            {c.opciones.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-700">{o.label}</span>
                <div className="flex gap-1.5">
                  <BotonOpcion activo={votos[o.id] === true} onClick={() => setVotos({ ...votos, [o.id]: true })}>
                    Puedo
                  </BotonOpcion>
                  <BotonOpcion activo={votos[o.id] === false} onClick={() => setVotos({ ...votos, [o.id]: false })}>
                    No puedo
                  </BotonOpcion>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={votacion.guardando || Object.keys(votos).length === 0}
            onClick={() => votacion.guardar(() => votarHorariosPortal(token, c.id, votos), "¡Listo! Guardamos tus horarios.")}
            className="mt-3 w-full rounded-xl bg-[#2D4A2B] py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {votacion.guardando ? "Guardando…" : "Guardar horarios"}
          </button>
          <Aviso mensaje={votacion.mensaje} />
        </div>
      )}

      {!c.puedeVotar && c.estado !== "cancelada" && (
        <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
          <p className="text-xs font-bold text-slate-700">¿Cómo te fue con esta inspección?</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ESTADOS_RETRO_COORDINACION).map(([id, label]) => (
              <BotonOpcion key={id} activo={estado === id} onClick={() => setEstado(id)}>
                {label}
              </BotonOpcion>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <span>¿El cliente estaba?</span>
            <BotonOpcion activo={clientePresente === true} onClick={() => setClientePresente(true)}>
              Sí
            </BotonOpcion>
            <BotonOpcion activo={clientePresente === false} onClick={() => setClientePresente(false)}>
              No
            </BotonOpcion>
          </div>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={2}
            placeholder="Comentarios (qué encontraste, qué sigue…)"
            className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
          />
          <button
            type="button"
            disabled={retro.guardando || !estado}
            onClick={async () => {
              const ok = await retro.guardar(
                () => retroCoordinacionPortal(token, c.id, { estado, clientePresente, comentario }),
                "¡Gracias! Guardamos tu respuesta."
              );
              if (ok) {
                setEstado("");
                setClientePresente(null);
                setComentario("");
              }
            }}
            className="w-full rounded-xl bg-[#2D4A2B] py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {retro.guardando ? "Enviando…" : "Enviar retroalimentación"}
          </button>
          <Aviso mensaje={retro.mensaje} />
        </div>
      )}

      <Historial retro={c.retro.filter((r) => r.asesorId === asesorId)} />
    </article>
  );
}

function TarjetaLead({ token, l }: { token: string; l: LeadCompartidoPortal }) {
  const [estado, setEstado] = useState("");
  const [siguientePaso, setSiguientePaso] = useState("");
  const [fecha, setFecha] = useState("");
  const [comentario, setComentario] = useState("");
  const [verResumen, setVerResumen] = useState(false);
  const { guardando, mensaje, guardar } = useGuardar();

  const ultima = l.retro[0];

  return (
    <article className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-slate-800">{l.clienteNombre}</h2>
          <p className="text-[11px] text-slate-400">
            Te lo compartió {l.enviadoPor || "Sauceda"} · {fechaCorta(l.createdAt)}
          </p>
        </div>
        <Chip texto={ultima ? ultima.estadoLabel : "Sin respuesta"} tono={ultima ? "verde" : "ambar"} />
      </div>

      {l.telefono && (
        <div className="mt-2 flex gap-2">
          <a href={`tel:${soloDigitos(l.telefono)}`} className="flex-1 rounded-xl bg-slate-100 py-2 text-center text-xs font-bold text-slate-700">
            📞 Llamar
          </a>
          <a
            href={`https://wa.me/${telWhatsApp(l.telefono)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-xl bg-emerald-50 py-2 text-center text-xs font-bold text-emerald-700"
          >
            💬 WhatsApp
          </a>
        </div>
      )}

      {l.nota && <p className="mt-2 text-xs text-slate-700">📝 {l.nota}</p>}
      {l.resumen && (
        <div className="mt-1">
          <button type="button" onClick={() => setVerResumen(!verResumen)} className="text-[11px] font-bold text-blue-700">
            {verResumen ? "Ocultar resumen" : "Ver resumen de la conversación"}
          </button>
          {verResumen && <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{l.resumen}</p>}
        </div>
      )}

      <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
        <p className="text-xs font-bold text-slate-700">¿Cómo vas con este cliente?</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(ESTADOS_RETRO_LEAD).map(([id, label]) => (
            <BotonOpcion key={id} activo={estado === id} onClick={() => setEstado(id)}>
              {label}
            </BotonOpcion>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={siguientePaso}
            onChange={(e) => setSiguientePaso(e.target.value)}
            placeholder="Siguiente paso (ej. visita, enviar cotización)"
            className="flex-1 min-w-0 rounded-xl border border-slate-200 p-2.5 text-sm"
          />
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-36 rounded-xl border border-slate-200 p-2 text-sm"
          />
        </div>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={2}
          placeholder="Comentarios"
          className="w-full rounded-xl border border-slate-200 p-2.5 text-sm"
        />
        <button
          type="button"
          disabled={guardando || !estado}
          onClick={async () => {
            const ok = await guardar(
              () => retroLeadPortal(token, l.id, { estado, siguientePaso, siguientePasoFecha: fecha || null, comentario }),
              "¡Gracias! Guardamos tu respuesta."
            );
            if (ok) {
              setEstado("");
              setSiguientePaso("");
              setFecha("");
              setComentario("");
            }
          }}
          className="w-full rounded-xl bg-[#2D4A2B] py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {guardando ? "Enviando…" : "Enviar retroalimentación"}
        </button>
        <Aviso mensaje={mensaje} />
      </div>

      <Historial retro={l.retro} />
    </article>
  );
}
