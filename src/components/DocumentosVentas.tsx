"use client";

import { useEffect, useRef, useState } from "react";
import {
  listarDocumentos,
  subirDocumento,
  eliminarDocumento,
  editarDocumento,
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

  // Edición en línea
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editDescripcion, setEditDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);

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
    if (archivo.size === 0) {
      setError(
        `"${archivo.name}" se seleccionó pero está vacío (0 bytes). Si el archivo está en OneDrive/Google Drive marcado como "solo en la nube", ábrelo primero para descargarlo por completo y vuelve a intentar.`
      );
      return;
    }

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
    if (editandoId === id) setEditandoId(null);
    void cargar();
  }

  function iniciarEdicion(doc: DocumentoVenta) {
    setEditandoId(doc.id);
    setEditNombre(doc.nombre);
    setEditDescripcion(doc.descripcion ?? "");
    setError(null);
  }

  async function handleGuardarEdicion(e: React.FormEvent) {
    e.preventDefault();
    if (!editandoId) return;
    if (!editNombre.trim()) { setError("El nombre no puede quedar vacío."); return; }
    setGuardando(true);
    const r = await editarDocumento(editandoId, editNombre, editDescripcion);
    setGuardando(false);
    if (!r.ok) { setError(r.error ?? "No se pudo guardar."); return; }
    setDocumentos((prev) =>
      prev.map((d) =>
        d.id === editandoId
          ? { ...d, nombre: editNombre.trim(), descripcion: editDescripcion.trim() || null }
          : d,
      ),
    );
    setEditandoId(null);
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
            <label className="text-xs font-semibold text-carbon/60">Archivo * (PDF, Word, Excel, PPT, imágenes — máx. 16 MB)</label>
            <input
              ref={inputFileRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.webp"
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
          <input type="file" ref={inputFileRef} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="block w-full text-xs text-carbon/70 file:mr-2 file:rounded file:border-0 file:bg-sauce/20 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-verde-profundo" required />
          {archivo && (
            <p className={`text-[10px] ${archivo.size === 0 ? "text-rojo font-semibold" : "text-carbon/50"}`}>
              {archivo.name} — {archivo.size === 0 ? "⚠️ 0 bytes (archivo vacío)" : formatBytes(archivo.size)}
            </p>
          )}
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
          {documentos.map((doc) =>
            editandoId === doc.id ? (
              <form
                key={doc.id}
                onSubmit={handleGuardarEdicion}
                className="rounded-xl border border-sauce/40 bg-sauce/5 p-3 space-y-2"
              >
                <div className="flex items-center gap-2 text-[11px] text-carbon/50">
                  <span className="text-base">{iconoMime(doc.tipo_mime)}</span>
                  <span className="truncate font-mono" title={doc.nombre_archivo}>{doc.nombre_archivo}</span>
                </div>
                <input
                  type="text"
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  placeholder="Nombre del documento *"
                  className={INPUT}
                  autoFocus
                  required
                />
                <input
                  type="text"
                  value={editDescripcion}
                  onChange={(e) => setEditDescripcion(e.target.value)}
                  placeholder="Descripción (opcional)"
                  className={INPUT}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditandoId(null)}
                    className="rounded-md border border-carbon/20 px-3 py-1.5 text-xs text-carbon/60 hover:bg-carbon/5 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardando}
                    className="rounded-md bg-sauce px-3 py-1.5 text-xs font-semibold text-crema hover:bg-verde-profundo disabled:opacity-50 transition"
                  >
                    {guardando ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </form>
            ) : (
              <div
                key={doc.id}
                className="rounded-xl border border-carbon/10 bg-white transition hover:border-sauce/30"
              >
                <div className="flex items-start gap-2.5 p-3 pb-2">
                  <span className="text-xl leading-none shrink-0 mt-0.5">{iconoMime(doc.tipo_mime)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-carbon leading-snug line-clamp-2 break-words" title={doc.nombre}>
                      {doc.nombre}
                    </p>
                    {doc.descripcion && (
                      <p className="mt-0.5 text-[11px] text-carbon/55 line-clamp-2">{doc.descripcion}</p>
                    )}
                    <p className="mt-1 text-[10px] text-carbon/40 truncate" title={doc.nombre_archivo}>
                      {[formatBytes(doc.tamano_bytes), doc.subido_por].filter(Boolean).join(" · ")}
                      {!modoSelector && <span className="font-mono"> · {doc.nombre_archivo}</span>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 border-t border-carbon/5 px-2 py-1.5">
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded px-2 py-1 text-[11px] font-semibold text-carbon/55 hover:bg-carbon/5 hover:text-verde-profundo transition"
                    title="Abrir documento"
                  >
                    Ver
                  </a>
                  <button
                    type="button"
                    onClick={() => iniciarEdicion(doc)}
                    className="rounded px-2 py-1 text-[11px] font-semibold text-carbon/55 hover:bg-carbon/5 hover:text-verde-profundo transition"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEliminar(doc.id, doc.nombre)}
                    className="rounded px-2 py-1 text-[11px] font-semibold text-rojo/70 hover:bg-rojo/5 hover:text-rojo transition"
                  >
                    Eliminar
                  </button>
                  {modoSelector && onSeleccionar && (
                    <button
                      type="button"
                      onClick={() => onSeleccionar(doc)}
                      className="ml-auto rounded-md bg-sauce px-3 py-1 text-[11px] font-bold text-crema hover:bg-verde-profundo transition"
                    >
                      Enviar →
                    </button>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
