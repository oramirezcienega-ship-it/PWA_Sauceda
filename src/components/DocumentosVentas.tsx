"use client";

import { useEffect, useRef, useState } from "react";
import {
  listarDocumentos,
  subirDocumento,
  eliminarDocumento,
  type DocumentoVenta,
} from "@/app/actions/documentos";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconoMime(mime: string | null): string {
  if (!mime) return "📄";
  if (mime.includes("pdf")) return "📕";
  if (mime.includes("word") || mime.includes("document")) return "📘";
  if (mime.includes("sheet") || mime.includes("excel")) return "📗";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "📙";
  if (mime.includes("image")) return "🖼️";
  return "📄";
}

interface Props {
  /** Modo compacto: muestra sólo la lista para elegir un doc a enviar. */
  modoSelector?: boolean;
  onSeleccionar?: (doc: DocumentoVenta) => void;
}

export function DocumentosVentas({ modoSelector = false, onSeleccionar }: Props) {
  const [documentos, setDocumentos] = useState<DocumentoVenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  // Formulario de subida
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const inputFileRef = useRef<HTMLInputElement>(null);

  async function cargar() {
    setCargando(true);
    try {
      setDocumentos(await listarDocumentos());
    } catch {
      setError("No se pudieron cargar los documentos.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { void cargar(); }, []);

  async function handleSubir(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo) { setError("Selecciona un archivo."); return; }
    if (!nombre.trim()) { setError("Escribe un nombre para el documento."); return; }

    setSubiendo(true);
    setError(null);
    setExito(null);

    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("nombre", nombre.trim());
    fd.append("descripcion", descripcion.trim());

    const r = await subirDocumento(fd);
    setSubiendo(false);

    if (!r.ok) {
      setError(r.error ?? "No se pudo subir el documento.");
      return;
    }

    setNombre("");
    setDescripcion("");
    setArchivo(null);
    if (inputFileRef.current) inputFileRef.current.value = "";
    setMostrarForm(false);
    setExito("Documento subido correctamente.");
    setTimeout(() => setExito(null), 3000);
    void cargar();
  }

  async function handleEliminar(id: string, nombreDoc: string) {
    if (!window.confirm(`¿Eliminar "${nombreDoc}"? No se podrá deshacer.`)) return;
    const r = await eliminarDocumento(id);
    if (!r.ok) { setError(r.error ?? "No se pudo eliminar."); return; }
    void cargar();
  }

  const INPUT = "w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30";

  return (
    <div className={`space-y-4 ${modoSelector ? "" : "max-w-3xl"}`}>
      {/* Cabecera */}
      {!modoSelector && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-titular text-xl font-bold text-verde-profundo">Documentos de Ventas</h2>
            <p className="text-xs text-carbon/50 mt-0.5">PDFs, presentaciones y archivos para compartir con clientes vía WhatsApp.</p>
          </div>
          <button
            type="button"
            onClick={() => setMostrarForm(!mostrarForm)}
            className="rounded-md bg-sauce px-3 py-1.5 text-sm font-semibold text-crema hover:bg-verde-profundo transition"
          >
            {mostrarForm ? "Cancelar" : "+ Subir documento"}
          </button>
        </div>
      )}

      {modoSelector && (
        <p className="text-xs text-carbon/50">Elige un documento para enviarlo al cliente por WhatsApp.</p>
      )}

      {/* Formulario de subida */}
      {mostrarForm && !modoSelector && (
        <form
          onSubmit={handleSubir}
          className="rounded-xl border border-sauce/20 bg-sauce/5 p-4 space-y-3"
        >
          <h3 className="text-sm font-bold text-verde-profundo">Nuevo documento</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-carbon/60">Nombre del documento *</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Catálogo de propiedades 2025"
                className={INPUT}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-carbon/60">Descripción (opcional)</label>
              <input
                type="text"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Para qué sirve este documento"
                className={INPUT}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-carbon/60">Archivo * (PDF, Word, Excel, PPT — máx. 16 MB)</label>
            <input
              ref={inputFileRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-carbon/70 file:mr-3 file:rounded file:border-0 file:bg-sauce/20 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-verde-profundo hover:file:bg-sauce/30 cursor-pointer"
              required
            />
            {archivo && (
              <p className="text-[11px] text-carbon/50">{archivo.name} — {formatBytes(archivo.size)}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={subiendo}
              className="rounded-md bg-sauce px-4 py-2 text-sm font-semibold text-crema hover:bg-verde-profundo disabled:opacity-50 transition"
            >
              {subiendo ? "Subiendo…" : "Subir documento"}
            </button>
            <button
              type="button"
              onClick={() => setMostrarForm(false)}
              className="rounded-md border border-carbon/20 px-4 py-2 text-sm text-carbon/60 hover:bg-carbon/5 transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Botón de subir en modo selector */}
      {modoSelector && (
        <button
          type="button"
          onClick={() => setMostrarForm(!mostrarForm)}
          className="text-xs text-sauce hover:text-verde-profundo font-semibold underline underline-offset-2"
        >
          {mostrarForm ? "Cancelar subida" : "+ Subir nuevo documento"}
        </button>
      )}

      {modoSelector && mostrarForm && (
        <form onSubmit={handleSubir} className="rounded-lg border border-sauce/20 bg-sauce/5 p-3 space-y-2">
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del documento *" className={INPUT} required />
          <input type="file" ref={inputFileRef} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-xs text-carbon/70 file:mr-2 file:rounded file:border-0 file:bg-sauce/20 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-verde-profundo" required />
          <button type="submit" disabled={subiendo} className="rounded bg-sauce px-3 py-1.5 text-xs font-semibold text-crema hover:bg-verde-profundo disabled:opacity-50">{subiendo ? "Subiendo…" : "Subir"}</button>
        </form>
      )}

      {/* Mensajes de feedback */}
      {error && (
        <p className="rounded-md border border-rojo/20 bg-rojo/5 px-3 py-2 text-xs text-rojo">{error}</p>
      )}
      {exito && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{exito}</p>
      )}

      {/* Lista de documentos */}
      {cargando ? (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-sauce border-t-transparent" />
        </div>
      ) : documentos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-carbon/20 py-12 text-center">
          <p className="text-3xl">📂</p>
          <p className="mt-2 text-sm font-semibold text-carbon/40">Sin documentos todavía</p>
          <p className="text-xs text-carbon/30 mt-0.5">Sube PDFs, catálogos o presentaciones para compartirlos con clientes.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documentos.map((doc) => (
            <div
              key={doc.id}
              className={`flex items-center gap-3 rounded-xl border bg-white p-3 transition ${
                modoSelector
                  ? "border-carbon/10 hover:border-sauce/40 hover:bg-sauce/5 cursor-pointer"
                  : "border-carbon/10"
              }`}
              onClick={modoSelector && onSeleccionar ? () => onSeleccionar(doc) : undefined}
            >
              <span className="text-2xl shrink-0">{iconoMime(doc.tipo_mime)}</span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-carbon truncate">{doc.nombre}</p>
                {doc.descripcion && (
                  <p className="text-[11px] text-carbon/50 truncate">{doc.descripcion}</p>
                )}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[10px] text-carbon/35 font-mono">{doc.nombre_archivo}</span>
                  {doc.tamano_bytes && (
                    <span className="text-[10px] text-carbon/35">{formatBytes(doc.tamano_bytes)}</span>
                  )}
                  {doc.subido_por && (
                    <span className="text-[10px] text-carbon/35">· {doc.subido_por}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="rounded border border-carbon/15 bg-carbon/5 px-2 py-1 text-[10px] font-semibold text-carbon/60 hover:text-verde-profundo transition"
                  title="Abrir documento"
                >
                  Ver
                </a>
                {!modoSelector && (
                  <button
                    type="button"
                    onClick={() => handleEliminar(doc.id, doc.nombre)}
                    className="rounded border border-rojo/20 bg-rojo/5 px-2 py-1 text-[10px] font-semibold text-rojo hover:bg-rojo/10 transition"
                  >
                    Eliminar
                  </button>
                )}
                {modoSelector && (
                  <span className="text-[10px] font-bold text-sauce">Enviar →</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
