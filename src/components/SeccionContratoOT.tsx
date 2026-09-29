"use client";

import { useCallback, useEffect, useState } from "react";
import {
  generarContrato,
  listarContratosOT,
  marcarContratoFirmado,
  obtenerDatosPrecargadosContrato,
  obtenerDefaultsTipoServicio,
  urlContratoFirmado,
} from "@/app/actions/contratos";
import {
  TIPOS_SERVICIO_CONTRATO,
  type ContratoRegistro,
  type OverridesContrato,
  type TipoServicioContrato,
} from "@/lib/contratos";

interface Props {
  ordenId: string;
  /** La OT nace de una cotización (solo entonces aplica el contrato). */
  tieneCotizacion: boolean;
  soloLectura?: boolean;
}

const colorEstado: Record<string, string> = {
  generado: "bg-amber-100 text-amber-800 border-amber-200",
  firmado: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelado: "bg-slate-100 text-slate-500 border-slate-200",
  borrador: "bg-slate-100 text-slate-600 border-slate-200",
};

export function SeccionContratoOT({ ordenId, tieneCotizacion, soloLectura = false }: Props) {
  const [contratos, setContratos] = useState<ContratoRegistro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalRevisar, setModalRevisar] = useState<null | "generar" | "regenerar">(null);
  const [modalFirma, setModalFirma] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const recargar = useCallback(async () => {
    setContratos(await listarContratosOT(ordenId));
    setCargando(false);
  }, [ordenId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const vigente = contratos.find((c) => c.estado !== "cancelado") || null;
  const anteriores = contratos.filter((c) => c.estado === "cancelado");
  const urlVer = (c: ContratoRegistro) => `/ordenes-trabajo/${ordenId}/contrato/${c.id}`;

  const verFirmado = async () => {
    if (!vigente) return;
    const r = await urlContratoFirmado(vigente.id);
    if (r.ok && r.url) window.open(r.url, "_blank");
    else setMensaje({ tipo: "error", texto: r.error || "No se pudo abrir el archivo firmado." });
  };

  if (!tieneCotizacion) return null;

  return (
    <section className="rounded-2xl border border-carbon/10 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-titular text-sm font-bold text-verde-profundo flex items-center gap-2">
          <span>📝</span> Contrato de Prestación de Servicios
        </h3>
        {vigente && (
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${colorEstado[vigente.estado]}`}>
            {vigente.estado}
          </span>
        )}
      </div>

      {mensaje && (
        <div
          className={`mb-3 rounded-xl border p-2.5 text-xs font-medium ${
            mensaje.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rojo/10 border-rojo/20 text-rojo"
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {cargando ? (
        <p className="text-xs text-carbon/50">Cargando…</p>
      ) : !vigente ? (
        <div className="text-xs text-carbon/70 space-y-2">
          <p>
            Aún no se genera el contrato de esta orden. Debe firmarse antes de pasar la orden a <strong>En proceso</strong>.
          </p>
          {!soloLectura && (
            <button
              type="button"
              onClick={() => setModalRevisar("generar")}
              className="bg-verde-profundo text-crema px-4 py-2 rounded-xl text-xs font-bold"
            >
              Generar contrato
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-carbon/80">
            <span>
              Folio: <strong className="font-mono text-verde-profundo">{vigente.folio}</strong>
            </span>
            <span>Versión: <strong>{vigente.version}</strong></span>
            <span>Generado: {new Date(vigente.fechaGeneracion).toLocaleDateString("es-MX")}</span>
            {vigente.fechaFirma && <span>Firmado: {new Date(vigente.fechaFirma + "T00:00:00").toLocaleDateString("es-MX")}</span>}
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={urlVer(vigente)}
              target="_blank"
              rel="noreferrer"
              className="bg-verde-profundo text-crema px-3 py-1.5 rounded-lg font-bold"
            >
              🖨️ Ver / Imprimir
            </a>
            {!soloLectura && vigente.estado !== "firmado" && (
              <>
                <button
                  type="button"
                  onClick={() => setModalRevisar("regenerar")}
                  className="bg-slate-100 hover:bg-slate-200 text-carbon px-3 py-1.5 rounded-lg font-bold"
                >
                  🔄 Regenerar
                </button>
                <button
                  type="button"
                  onClick={() => setModalFirma(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-bold"
                >
                  ✍️ Marcar como firmado
                </button>
              </>
            )}
            {vigente.pdfFirmadoUrl && (
              <button
                type="button"
                onClick={verFirmado}
                className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-lg font-bold"
              >
                📎 Ver contrato firmado
              </button>
            )}
          </div>

          {anteriores.length > 0 && (
            <details className="text-carbon/60">
              <summary className="cursor-pointer">Versiones anteriores ({anteriores.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {anteriores.map((c) => (
                  <li key={c.id}>
                    <a href={urlVer(c)} target="_blank" rel="noreferrer" className="text-sauce hover:underline">
                      {c.folio} · v{c.version} (cancelada)
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="mt-3 text-right">
        <a href="/contratos/configuracion" className="text-[11px] text-sauce hover:underline">
          ⚙️ Configurar cláusulas y datos del prestador
        </a>
      </div>
      {modalRevisar && (
        <ModalRevisarContrato
          ordenId={ordenId}
          regenerar={modalRevisar === "regenerar"}
          alCerrar={() => setModalRevisar(null)}
          alGenerado={async (folio) => {
            setModalRevisar(null);
            setMensaje({ tipo: "ok", texto: `Contrato ${folio} generado.` });
            await recargar();
          }}
        />
      )}

      {modalFirma && vigente && (
        <ModalFirma
          contratoId={vigente.id}
          alCerrar={() => setModalFirma(false)}
          alFirmado={async () => {
            setModalFirma(false);
            setMensaje({ tipo: "ok", texto: "Contrato marcado como firmado." });
            await recargar();
          }}
        />
      )}
    </section>
  );
}

// ------------------------------------------------------------
// Modal "Revisar datos del contrato"
// ------------------------------------------------------------

function ModalRevisarContrato({
  ordenId,
  regenerar,
  alCerrar,
  alGenerado,
}: {
  ordenId: string;
  regenerar: boolean;
  alCerrar: () => void;
  alGenerado: (folio: string) => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState<any>(null);
  const [resumen, setResumen] = useState({ cliente: "", cotizacion: "", total: 0 });

  useEffect(() => {
    obtenerDatosPrecargadosContrato(ordenId).then((r) => {
      if (!r.ok || !r.datos) {
        setError(r.error || "No se pudieron cargar los datos.");
      } else {
        const d = r.datos;
        setF({
          tipoServicio: d.tipoServicio,
          domicilioObra: d.domicilioObra,
          alcanceTecnico: d.alcanceTecnico,
          exclusiones: d.exclusiones,
          leyendaIva: d.leyendaIva,
          anticipoPct: d.anticipoPct,
          formaPago: d.formaPago,
          fechaInicio: d.fechaInicio,
          duracionDias: d.duracionDias,
          garantiaTexto: d.garantiaTexto,
          garantiaObjeto: d.garantiaObjeto,
          garantiaExclusiones: d.garantiaExclusiones,
          clausulaClima: d.clausulaClima,
        });
        setResumen({ cliente: d.cliente.nombre, cotizacion: d.cotizacionFolio, total: d.total });
      }
      setCargando(false);
    });
  }, [ordenId]);

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const cambiarTipo = async (tipo: TipoServicioContrato) => {
    const d = await obtenerDefaultsTipoServicio(tipo);
    setF((p: any) => ({ ...p, tipoServicio: tipo, ...d }));
  };

  const enviar = async () => {
    setGuardando(true);
    setError("");
    const overrides: OverridesContrato = {
      ...f,
      anticipoPct: Number(f.anticipoPct),
      duracionDias: Number(f.duracionDias),
    };
    const r = await generarContrato(ordenId, overrides, { regenerar });
    setGuardando(false);
    if (r.ok && r.folio) alGenerado(r.folio);
    else setError(r.error || "No se pudo generar el contrato.");
  };

  const campo = "w-full rounded-xl border border-carbon/20 px-3 py-2 text-sm text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none";
  const etiqueta = "block font-semibold text-carbon/80 mb-1 text-xs";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-carbon/10 my-8">
        <div className="flex items-center justify-between border-b border-carbon/10 pb-3 mb-4">
          <div>
            <h3 className="font-titular text-lg font-bold text-verde-profundo">
              {regenerar ? "Regenerar contrato" : "Revisar datos del contrato"}
            </h3>
            {f && (
              <p className="text-xs text-carbon/60">
                {resumen.cliente} · Cotización {resumen.cotizacion} · Total{" "}
                {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(resumen.total)}
              </p>
            )}
          </div>
          <button type="button" onClick={alCerrar} className="text-carbon/40 hover:text-carbon text-lg font-bold p-1">
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-xl bg-rojo/10 border border-rojo/20 p-3 text-xs text-rojo font-medium">⚠️ {error}</div>
        )}

        {cargando ? (
          <p className="text-xs text-carbon/50">Cargando datos…</p>
        ) : !f ? null : (
          <div className="space-y-3 font-cuerpo">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={etiqueta}>Tipo de servicio *</label>
                <select className={campo} value={f.tipoServicio} onChange={(e) => cambiarTipo(e.target.value as TipoServicioContrato)}>
                  {TIPOS_SERVICIO_CONTRATO.map((t) => (
                    <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={etiqueta}>Fecha estimada de inicio *</label>
                <input type="date" className={campo} value={f.fechaInicio} onChange={(e) => set("fechaInicio", e.target.value)} />
              </div>
            </div>

            <div>
              <label className={etiqueta}>Domicilio de la obra *</label>
              <input className={campo} value={f.domicilioObra} onChange={(e) => set("domicilioObra", e.target.value)} />
            </div>

            <div>
              <label className={etiqueta}>Alcance técnico * (m²/cantidad, sistema, producto, capas, preparación)</label>
              <textarea rows={3} className={campo} value={f.alcanceTecnico} onChange={(e) => set("alcanceTecnico", e.target.value)} />
            </div>

            <div>
              <label className={etiqueta}>Exclusiones</label>
              <textarea rows={3} className={campo} value={f.exclusiones} onChange={(e) => set("exclusiones", e.target.value)} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={etiqueta}>% Anticipo *</label>
                <input type="number" min={0} max={100} className={campo} value={f.anticipoPct} onChange={(e) => set("anticipoPct", e.target.value)} />
              </div>
              <div>
                <label className={etiqueta}>Duración (días háb.) *</label>
                <input type="number" min={1} className={campo} value={f.duracionDias} onChange={(e) => set("duracionDias", e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={etiqueta}>Garantía *</label>
                <input className={campo} value={f.garantiaTexto} onChange={(e) => set("garantiaTexto", e.target.value)} placeholder="Ej. 3 años" />
              </div>
            </div>

            <div>
              <label className={etiqueta}>Forma de pago</label>
              <input className={campo} value={f.formaPago} onChange={(e) => set("formaPago", e.target.value)} />
            </div>

            <details className="rounded-xl border border-carbon/10 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-carbon/70">Cláusulas de garantía, clima e IVA (avanzado)</summary>
              <div className="space-y-3 mt-3">
                <div>
                  <label className={etiqueta}>La garantía cubre</label>
                  <input className={campo} value={f.garantiaObjeto} onChange={(e) => set("garantiaObjeto", e.target.value)} />
                </div>
                <div>
                  <label className={etiqueta}>La garantía no cubre</label>
                  <textarea rows={3} className={campo} value={f.garantiaExclusiones} onChange={(e) => set("garantiaExclusiones", e.target.value)} />
                </div>
                <div>
                  <label className={etiqueta}>Cláusula de clima</label>
                  <textarea rows={2} className={campo} value={f.clausulaClima} onChange={(e) => set("clausulaClima", e.target.value)} />
                </div>
                <div>
                  <label className={etiqueta}>Leyenda de IVA</label>
                  <input className={campo} value={f.leyendaIva} onChange={(e) => set("leyendaIva", e.target.value)} />
                </div>
              </div>
            </details>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={alCerrar} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-carbon">
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={enviar}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-verde-profundo text-crema disabled:opacity-50"
              >
                {guardando ? "Generando…" : regenerar ? "Regenerar contrato" : "Generar contrato"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Modal "Marcar como firmado"
// ------------------------------------------------------------

function ModalFirma({
  contratoId,
  alCerrar,
  alFirmado,
}: {
  contratoId: string;
  alCerrar: () => void;
  alFirmado: () => void;
}) {
  const [fecha, setFecha] = useState(new Date().toLocaleDateString("en-CA"));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const enviar = async () => {
    setGuardando(true);
    setError("");
    const fd = new FormData();
    fd.set("contratoId", contratoId);
    fd.set("fechaFirma", fecha);
    if (archivo) fd.set("archivo", archivo);
    const r = await marcarContratoFirmado(fd);
    setGuardando(false);
    if (r.ok) alFirmado();
    else setError(r.error || "No se pudo guardar.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-carbon/10 font-cuerpo">
        <h3 className="font-titular text-lg font-bold text-verde-profundo mb-3">Marcar contrato como firmado</h3>
        {error && <div className="mb-3 rounded-xl bg-rojo/10 border border-rojo/20 p-2.5 text-xs text-rojo">⚠️ {error}</div>}
        <label className="block text-xs font-semibold text-carbon/80 mb-1">Fecha de firma *</label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-sm mb-3"
        />
        <label className="block text-xs font-semibold text-carbon/80 mb-1">Foto o escaneo del contrato firmado (opcional)</label>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          className="w-full text-xs mb-4"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={alCerrar} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-carbon">
            Cancelar
          </button>
          <button
            type="button"
            disabled={guardando || !fecha}
            onClick={enviar}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Confirmar firma"}
          </button>
        </div>
      </div>
    </div>
  );
}
