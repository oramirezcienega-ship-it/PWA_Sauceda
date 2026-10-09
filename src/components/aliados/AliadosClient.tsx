"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listarAliados,
  guardarAliado,
  cambiarConvenioAliado,
  generarConvenioAliado,
  marcarConvenioFirmado,
  listarComisionesAliados,
  obtenerLinkCarga,
  type Aliado,
  type ComisionAliado,
  type DatosAliado,
} from "@/app/actions/aliados";
import { ETIQUETA_CONVENIO, type ConvenioEstatus } from "@/lib/asesoria/aliados";
import { formatoPesos, formatoFecha } from "@/lib/formato";

const INPUT = "w-full rounded-md border border-carbon/20 bg-white px-2.5 py-1.5 text-sm focus:border-sauce focus:outline-none";

const COLOR_CONVENIO: Record<ConvenioEstatus, string> = {
  sin_convenio: "bg-slate-100 text-slate-700 border-slate-300",
  enviado: "bg-amber-50 text-amber-900 border-amber-300",
  firmado: "bg-emerald-50 text-emerald-900 border-emerald-300",
  suspendido: "bg-rojo/10 text-rojo border-rojo/30",
};

const VACIO: DatosAliado & { zonasTexto: string } = {
  nombre: "",
  contactoNombre: "",
  telefono: "",
  whatsapp: "",
  email: "",
  zonasTexto: "",
  comisionCompartidaPct: "",
  notas: "",
};

export function AliadosClient() {
  const [aliados, setAliados] = useState<Aliado[]>([]);
  const [comisiones, setComisiones] = useState<ComisionAliado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<string | "nuevo" | null>(null);
  const [form, setForm] = useState(VACIO);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([listarAliados(), listarComisionesAliados()]);
      setAliados(a);
      setComisiones(c);
    } catch (e: any) {
      setAviso(e?.message || "No se pudieron cargar los aliados.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function abrir(a?: Aliado) {
    setEditando(a ? a.id : "nuevo");
    setForm(
      a
        ? {
            nombre: a.nombre,
            contactoNombre: a.contactoNombre,
            telefono: a.telefono,
            whatsapp: a.whatsapp ?? "",
            email: a.email,
            zonasTexto: a.zonasCobertura.join(", "),
            comisionCompartidaPct: a.comisionCompartidaPct ?? "",
            notas: a.notas,
          }
        : VACIO,
    );
  }

  async function guardar() {
    const r = await guardarAliado(
      { ...form, zonasCobertura: form.zonasTexto },
      editando && editando !== "nuevo" ? editando : undefined,
    );
    if (!r.ok) {
      setAviso(r.mensaje);
      return;
    }
    setEditando(null);
    setAviso("Aliado guardado.");
    await cargar();
  }

  async function copiar(texto: string, mensaje: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso(mensaje);
    } catch {
      window.prompt("Copia el link:", texto);
    }
  }

  return (
    <div className="space-y-4">
      {aviso && (
        <div className="flex justify-between gap-3 rounded-lg border border-sauce/30 bg-sauce/10 px-3 py-2 text-sm text-verde-profundo">
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso(null)}>×</button>
        </div>
      )}

      <button type="button" onClick={() => abrir()} className="rounded-md bg-sauce px-3 py-2 text-sm font-semibold text-crema hover:bg-verde-profundo">
        ＋ Alta de aliado
      </button>

      {editando && (
        <section className="max-w-2xl rounded-xl border border-carbon/10 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold uppercase text-verde-profundo">{editando === "nuevo" ? "Nuevo aliado" : "Editar aliado"}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre / inmobiliaria *"><input className={INPUT} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></Campo>
            <Campo etiqueta="Contacto"><input className={INPUT} value={form.contactoNombre} onChange={(e) => setForm({ ...form, contactoNombre: e.target.value })} /></Campo>
            <Campo etiqueta="Teléfono"><input className={INPUT} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></Campo>
            <Campo etiqueta="WhatsApp"><input className={INPUT} value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="524771234567" /></Campo>
            <Campo etiqueta="Correo"><input className={INPUT} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
            <Campo etiqueta="% comisión compartida (lado comprador)">
              <input className={INPUT} inputMode="decimal" value={String(form.comisionCompartidaPct ?? "")} onChange={(e) => setForm({ ...form, comisionCompartidaPct: e.target.value })} placeholder="50" />
            </Campo>
            <Campo etiqueta="Zonas de cobertura (separadas por coma)" ancho>
              <input className={INPUT} value={form.zonasTexto} onChange={(e) => setForm({ ...form, zonasTexto: e.target.value })} placeholder="Villas de San Juan, Los Castillos, Centro" />
            </Campo>
            <Campo etiqueta="Notas" ancho><textarea rows={2} className={INPUT} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Campo>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setEditando(null)} className="rounded-md border border-carbon/15 px-3 py-1.5 text-xs">Cancelar</button>
            <button type="button" onClick={guardar} className="rounded-md bg-sauce px-3 py-1.5 text-xs font-semibold text-crema">Guardar</button>
          </div>
        </section>
      )}

      {cargando ? (
        <p className="text-sm text-carbon/50">Cargando…</p>
      ) : aliados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-carbon/15 bg-white p-8 text-center text-sm text-carbon/50">
          Aún no hay aliados. Da de alta el primero.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-carbon/10 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-carbon/5 text-[10px] uppercase text-carbon/50">
              <tr>
                <th className="px-3 py-2">Aliado</th>
                <th className="px-3 py-2">Zonas</th>
                <th className="px-3 py-2">Convenio</th>
                <th className="px-3 py-2">Calificación</th>
                <th className="px-3 py-2">Búsquedas</th>
                <th className="px-3 py-2">Casas</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {aliados.map((a) => (
                <tr key={a.id} className="border-t border-carbon/5 align-top">
                  <td className="px-3 py-2">
                    <p className="font-semibold text-carbon">{a.nombre}</p>
                    <p className="text-carbon/50">{[a.contactoNombre, a.whatsapp || a.telefono].filter(Boolean).join(" · ")}</p>
                    <p className="text-carbon/50">
                      {a.comisionCompartidaPct != null ? `${a.comisionCompartidaPct}% compartido` : "Sin % definido"} ·{" "}
                      {a.telegramVinculado ? "✅ Telegram" : "Sin Telegram"}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex max-w-[220px] flex-wrap gap-1">
                      {a.zonasCobertura.length ? a.zonasCobertura.map((z) => (
                        <span key={z} className="rounded-full border border-carbon/15 px-2 py-0.5 text-[10px]">{z}</span>
                      )) : <span className="text-carbon/40">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COLOR_CONVENIO[a.convenioEstatus]}`}>
                      {ETIQUETA_CONVENIO[a.convenioEstatus]}
                    </span>
                    <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
                      {(a.convenioEstatus === "sin_convenio" || a.convenioEstatus === "enviado") && (
                        <button
                          type="button"
                          className="text-left text-sauce underline"
                          onClick={async () => {
                            const r = await generarConvenioAliado(a.id);
                            if (!r.ok) setAviso(r.mensaje || "No se pudo generar el convenio.");
                            else if (r.porTelegram) setAviso(`Convenio ${r.folio} enviado por Telegram.`);
                            else if (r.link) await copiar(r.link, `Convenio ${r.folio} generado. Link para el aliado copiado.`);
                            await cargar();
                          }}
                        >
                          {a.convenioEstatus === "enviado" ? "Reenviar convenio" : "Enviar convenio"}
                        </button>
                      )}
                      {a.convenioContratoId && (
                        <a href={`/aliados/${a.id}/convenio`} target="_blank" rel="noopener noreferrer" className="text-sauce underline">
                          Ver / imprimir
                        </a>
                      )}
                      {a.convenioEstatus === "enviado" && (
                        <button
                          type="button"
                          className="text-left text-sauce underline"
                          onClick={async () => {
                            const fecha = window.prompt("Fecha de firma (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
                            if (!fecha) return;
                            const r = await marcarConvenioFirmado(a.id, fecha);
                            setAviso(r.ok ? `Convenio de ${a.nombre} firmado: ya puede recibir búsquedas.` : r.mensaje || "No se pudo registrar.");
                            await cargar();
                          }}
                        >
                          Registrar firma
                        </button>
                      )}
                      {a.convenioEstatus === "firmado" && (
                        <button
                          type="button"
                          className="text-left text-rojo underline"
                          onClick={async () => {
                            if (!window.confirm(`¿Suspender el convenio de ${a.nombre}? Dejará de recibir búsquedas y su link de carga se desactiva.`)) return;
                            const r = await cambiarConvenioAliado(a.id, "suspendido");
                            setAviso(r.ok ? "Convenio suspendido." : r.mensaje || "No se pudo suspender.");
                            await cargar();
                          }}
                        >
                          Suspender
                        </button>
                      )}
                      {a.convenioEstatus === "suspendido" && (
                        <button
                          type="button"
                          className="text-left text-sauce underline"
                          onClick={async () => {
                            const r = await cambiarConvenioAliado(a.id, "sin_convenio");
                            setAviso(r.ok ? "Aliado reactivado: genera y firma un convenio nuevo." : r.mensaje || "No se pudo reactivar.");
                            await cargar();
                          }}
                        >
                          Reactivar (nuevo convenio)
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono">{a.calificacion != null ? `${a.calificacion}/100` : "—"}</td>
                  <td className="px-3 py-2">
                    {a.busquedasRespondidas}/{a.busquedasTotal} respondidas
                    {a.busquedasAbiertas > 0 && <span className="block text-carbon/50">{a.busquedasAbiertas} abiertas</span>}
                  </td>
                  <td className="px-3 py-2 font-mono">{a.casasAportadas}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <button type="button" className="text-left text-sauce underline" onClick={() => abrir(a)}>Editar</button>
                      <button
                        type="button"
                        className="text-left text-sauce underline"
                        onClick={async () => {
                          const r = await obtenerLinkCarga(a.id);
                          if (r.ok && r.link) await copiar(r.link, `Link de carga de ${a.nombre} copiado.`);
                          else setAviso(r.mensaje || "No se pudo obtener el link.");
                        }}
                      >
                        Copiar link de carga
                      </button>
                      {a.enlaceTelegram && !a.telegramVinculado && (
                        <button type="button" className="text-left text-sauce underline" onClick={() => copiar(a.enlaceTelegram!, "Enlace para vincular Telegram copiado: compártelo con el aliado.")}>
                          Copiar enlace de Telegram
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && <TablaComisionesAliados comisiones={comisiones} />}
    </div>
  );
}

function TablaComisionesAliados({ comisiones }: { comisiones: ComisionAliado[] }) {
  const pendiente = comisiones.reduce((s, c) => s + c.saldoPendiente, 0);
  return (
    <section className="rounded-xl border border-carbon/10 bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold uppercase text-verde-profundo">Comisiones a aliados</h2>
        <span className="font-mono text-sm text-rojo">Por pagar: {formatoPesos(pendiente)}</span>
      </div>
      {comisiones.length === 0 ? (
        <p className="text-xs text-carbon/50">Se generan al registrar el cierre de una casa aportada por un aliado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase text-carbon/50">
              <tr>
                <th className="py-1.5 pr-3">Fecha</th>
                <th className="py-1.5 pr-3">Aliado</th>
                <th className="py-1.5 pr-3">Expediente</th>
                <th className="py-1.5 pr-3 text-right">Compraventa</th>
                <th className="py-1.5 pr-3 text-right">Honorarios</th>
                <th className="py-1.5 pr-3 text-right">Comisión</th>
                <th className="py-1.5 pr-3 text-right">Saldo</th>
                <th className="py-1.5">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {comisiones.map((c) => (
                <tr key={c.id} className="border-t border-carbon/5">
                  <td className="py-1.5 pr-3">{formatoFecha(`${c.fecha}T12:00:00`)}</td>
                  <td className="py-1.5 pr-3">{c.aliadoNombre}</td>
                  <td className="py-1.5 pr-3">
                    {c.expedienteId ? <a href={`/expediente/${c.expedienteId}`} className="text-sauce underline">{c.expedienteId}</a> : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">{formatoPesos(c.montoVenta)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {c.detalle.honorarios != null ? `${formatoPesos(Number(c.detalle.honorarios))} (${c.detalle.pctHonorarios}%)` : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {formatoPesos(c.montoComision)}
                    {c.detalle.pctAliado != null && <span className="text-carbon/50"> ({c.detalle.pctAliado}%)</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">{formatoPesos(c.saldoPendiente)}</td>
                  <td className="py-1.5">{c.estatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Campo({ etiqueta, children, ancho }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <label className={`block ${ancho ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-[10px] font-bold uppercase text-carbon/50">{etiqueta}</span>
      {children}
    </label>
  );
}
