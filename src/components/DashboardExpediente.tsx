"use client";

import { useEffect, useState, useCallback } from "react";
import { GaleriaFotosExpediente } from "./GaleriaFotosExpediente";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StatusProceso =
  | "formulario_recibido"
  | "informacion_confirmada"
  | "fotos_agendadas"
  | "fotos_completadas"
  | "en_catalogo"
  | "primer_interesado"
  | "visita_agendada"
  | "loi_firmada"
  | "en_tramite_legal"
  | "en_notaria"
  | "operacion_cerrada";

interface Expediente {
  id: string;
  cliente: string;
  primer_apellido?: string;
  segundo_apellido?: string;
  telefono?: string;
  direccion_propiedad?: string;
  fraccionamiento?: string;
  tipo_credito?: string;
  saldo_deuda?: number;
  status_proceso: StatusProceso;
  fecha_confirmacion?: string | null;
  fecha_fotos_agendadas?: string | null;
  litigios_bloqueado?: boolean;
  hay_litigios?: boolean;
  asesor?: { nombre: string } | null;
}

interface Promocion {
  // A: Legal
  nombre_titular?: string;
  telefono_titular?: string;
  email_titular?: string;
  tipo_identificacion?: string;
  tiene_escritura?: boolean;
  tiene_comprobante_domicilio?: boolean;
  // B: Crédito
  tipo_credito?: string;
  expediente_infonavit?: string;
  saldo_credito?: number;
  tasa_credito?: number;
  // C: Propiedad
  calle?: string;
  numero_exterior?: string;
  colonia?: string;
  ciudad?: string;
  estado?: string;
  metros_construccion?: number;
  metros_terreno?: number;
  anio_construccion?: number;
  num_recamaras?: number;
  num_banos?: number;
  estado_conservacion?: string;
  servicios?: string[];
  // D: Situación
  propiedad_ocupada?: boolean;
  nombre_ocupante?: string;
  tiene_adeudos?: boolean;
  descripcion_adeudos?: string;
  tiene_litigios?: boolean;
  descripcion_litigios?: string;
  // E: Disponibilidad
  horario_fotos?: string;
  disponible_firma?: boolean;
  comentarios?: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PASOS: { status: StatusProceso; label: string; icono: string }[] = [
  { status: "formulario_recibido", label: "Información recibida", icono: "📋" },
  { status: "informacion_confirmada", label: "Información confirmada", icono: "✅" },
  { status: "fotos_agendadas", label: "Sesión de fotos agendada", icono: "📅" },
  { status: "fotos_completadas", label: "Fotos en proceso", icono: "📸" },
  { status: "en_catalogo", label: "Propiedad en línea", icono: "🌐" },
  { status: "primer_interesado", label: "Primer interesado", icono: "👥" },
  { status: "visita_agendada", label: "Visita agendada", icono: "📍" },
  { status: "loi_firmada", label: "Carta de Intención firmada", icono: "✍️" },
  { status: "en_tramite_legal", label: "Proceso legal e INFONAVIT", icono: "⚖️" },
  { status: "en_notaria", label: "Listo para firmar", icono: "🏛️" },
  { status: "operacion_cerrada", label: "¡Operación completada!", icono: "🎉" },
];

const CAMPOS_EDITABLES = new Set([
  "calle", "numero_exterior", "colonia", "ciudad", "estado",
  "metros_construccion", "metros_terreno", "anio_construccion",
  "num_recamaras", "num_banos", "estado_conservacion",
  "propiedad_ocupada", "nombre_ocupante",
  "tiene_adeudos", "descripcion_adeudos",
  "horario_fotos", "disponible_firma", "comentarios",
]);

function pasoActual(status: StatusProceso): number {
  return PASOS.findIndex((p) => p.status === status);
}

function formatFecha(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatMoney(n: number | undefined): string {
  if (!n) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}

// ─── Sub-componente: Timeline ─────────────────────────────────────────────────

function Timeline({ status }: { status: StatusProceso }) {
  const actual = pasoActual(status);
  return (
    <div className="relative flex items-start gap-0 overflow-x-auto pb-2 scrollbar-none">
      {PASOS.map((paso, i) => {
        const completado = i < actual;
        const activo = i === actual;
        return (
          <div key={paso.status} className="flex flex-col items-center min-w-[64px] relative group">
            {/* Línea conectora izquierda */}
            {i > 0 && (
              <div className={`absolute top-5 right-1/2 w-full h-0.5 ${completado || activo ? "bg-sauce" : "bg-slate-200"}`} />
            )}
            {/* Círculo */}
            <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
              ${completado ? "bg-verde-profundo border-verde-profundo text-white" :
                activo ? "bg-sauce border-sauce text-white shadow-lg scale-110" :
                "bg-white border-slate-200 text-slate-400"}`}
            >
              {completado ? "✓" : paso.icono}
            </div>
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-carbon text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
              {paso.icono} {paso.label}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-carbon" />
            </div>
            {/* Número */}
            <span className={`mt-1 text-[10px] font-mono ${activo ? "text-sauce font-bold" : "text-slate-400"}`}>
              {i + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sub-componente: Sección colapsable ───────────────────────────────────────

function SeccionInfo({
  icono, titulo, badge, children, defaultOpen = false, critico,
}: {
  icono: string;
  titulo: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  critico?: boolean;
}) {
  const [abierto, setAbierto] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{icono}</span>
          <span className="font-semibold text-verde-profundo font-titular">{titulo}</span>
          {badge}
        </div>
        <span className={`text-slate-400 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`}>▼</span>
      </button>
      {abierto && (
        <div className="px-4 pb-4 pt-2 bg-white border-t border-slate-100 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

function Campo({ label, valor, critico }: { label: string; valor?: string | number | boolean | null; critico?: boolean }) {
  const texto = valor === null || valor === undefined ? "" :
    typeof valor === "boolean" ? (valor ? "Sí" : "No") :
    String(valor);

  if (!texto) {
    return (
      <div className="flex items-start gap-2 py-1 border-b border-slate-50 last:border-0">
        <span className="text-xs text-slate-400 min-w-[120px] mt-0.5">{label}</span>
        <span className="text-xs text-slate-300 italic">Sin datos</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 py-1 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500 min-w-[120px] mt-0.5 shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-carbon font-medium">{texto}</span>
        {critico && texto && (
          <span className="text-[10px] bg-sauce text-white px-2 py-0.5 rounded-full font-bold">Verificado</span>
        )}
      </div>
    </div>
  );
}

// ─── Sub-componente: Modal Edición ────────────────────────────────────────────

function ModalEdicion({
  expedienteId, token, promocion, statusProceso,
  onClose, onGuardado,
}: {
  expedienteId: string;
  token: string;
  promocion: Promocion | null;
  statusProceso: StatusProceso;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>({
    calle: promocion?.calle ?? "",
    numero_exterior: promocion?.numero_exterior ?? "",
    colonia: promocion?.colonia ?? "",
    ciudad: promocion?.ciudad ?? "",
    estado: promocion?.estado ?? "",
    metros_construccion: String(promocion?.metros_construccion ?? ""),
    metros_terreno: String(promocion?.metros_terreno ?? ""),
    anio_construccion: String(promocion?.anio_construccion ?? ""),
    num_recamaras: String(promocion?.num_recamaras ?? ""),
    num_banos: String(promocion?.num_banos ?? ""),
    estado_conservacion: promocion?.estado_conservacion ?? "",
    horario_fotos: promocion?.horario_fotos ?? "",
    comentarios: promocion?.comentarios ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const yaConfirmado = statusProceso !== "formulario_recibido";

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      for (const [campo, valor] of Object.entries(valores)) {
        if (!CAMPOS_EDITABLES.has(campo)) continue;
        await fetch(`/api/expediente-cliente/${expedienteId}/editar-campo?token=${token}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campo, valor }),
        });
      }
      onGuardado();
      onClose();
    } catch {
      setError("Error al guardar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <h3 className="font-bold text-verde-profundo font-titular text-lg">Editar información</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
        </div>

        {yaConfirmado && (
          <div className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
            ⚠️ Tu asesor recibirá una notificación con los cambios que realices.
          </div>
        )}

        <div className="px-6 py-4 space-y-3">
          {[
            { campo: "calle", label: "Calle", tipo: "text" },
            { campo: "numero_exterior", label: "Número exterior", tipo: "text" },
            { campo: "colonia", label: "Colonia", tipo: "text" },
            { campo: "ciudad", label: "Ciudad", tipo: "text" },
            { campo: "estado", label: "Estado", tipo: "text" },
            { campo: "metros_construccion", label: "m² construcción", tipo: "number" },
            { campo: "metros_terreno", label: "m² terreno", tipo: "number" },
            { campo: "anio_construccion", label: "Año de construcción", tipo: "number" },
            { campo: "num_recamaras", label: "Recámaras", tipo: "number" },
            { campo: "num_banos", label: "Baños", tipo: "number" },
            { campo: "estado_conservacion", label: "Estado de conservación", tipo: "text" },
            { campo: "horario_fotos", label: "Horario disponible para fotos", tipo: "text" },
            { campo: "comentarios", label: "Comentarios", tipo: "textarea" },
          ].map(({ campo, label, tipo }) => (
            <div key={campo}>
              <label className="text-xs text-slate-500 font-medium block mb-1">{label}</label>
              {tipo === "textarea" ? (
                <textarea
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sauce/30 resize-none"
                  value={valores[campo] ?? ""}
                  onChange={(e) => setValores({ ...valores, [campo]: e.target.value })}
                />
              ) : (
                <input
                  type={tipo}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sauce/30"
                  value={valores[campo] ?? ""}
                  onChange={(e) => setValores({ ...valores, [campo]: e.target.value })}
                />
              )}
            </div>
          ))}

          <p className="text-xs text-slate-400 pt-2">
            Los campos de crédito (tipo, expediente INFONAVIT, saldo) no son editables aquí. Contacta a tu asesor para modificarlos.
          </p>

          {error && <p className="text-sm text-rojo">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="flex-1 py-2.5 bg-cielo text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function DashboardExpediente({
  expedienteId,
  token,
}: {
  expedienteId: string;
  token: string;
}) {
  const [expediente, setExpediente] = useState<Expediente | null>(null);
  const [promocion, setPromocion] = useState<Promocion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [modalEdicion, setModalEdicion] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/expediente-cliente/${expedienteId}?token=${token}`);
      if (!res.ok) {
        const body = await res.json() as { error: string };
        setErrorMsg(body.error ?? "Error desconocido");
        return;
      }
      const body = await res.json() as { expediente: Expediente; promocion: Promocion | null };
      setExpediente(body.expediente);
      setPromocion(body.promocion);
    } catch {
      setErrorMsg("No se pudo cargar tu expediente.");
    } finally {
      setCargando(false);
    }
  }, [expedienteId, token]);

  useEffect(() => {
    void cargar();

    // Polling cada 30 seg como fallback de Supabase Realtime
    const interval = setInterval(() => void cargar(), 30_000);
    return () => clearInterval(interval);
  }, [cargar]);

  // Supabase Realtime subscription
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    async function suscribir() {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) return;

        const client = createClient(url, key);
        const channel = client.channel("expediente-cliente:" + expedienteId);
        channel
          .on(
            "postgres_changes" as any,
            {
              event: "UPDATE",
              schema: "public",
              table: "expedientes",
              filter: `id=eq.${expedienteId}`,
            },
            () => { void cargar(); },
          )
          .subscribe();

        unsubscribe = () => { void client.removeChannel(channel); };
      } catch {
        // Si falla Realtime, el polling cubre el fallback
      }
    }

    void suscribir();
    return () => { unsubscribe?.(); };
  }, [expedienteId, cargar]);

  async function confirmar() {
    if (!expediente) return;
    setConfirmando(true);
    try {
      const res = await fetch(`/api/expediente-cliente/${expedienteId}/confirmar?token=${token}`, {
        method: "PUT",
      });
      if (!res.ok) {
        const b = await res.json() as { error: string };
        alert(b.error ?? "Error al confirmar");
        return;
      }
      setConfirmado(true);
      setExpediente({ ...expediente, status_proceso: "informacion_confirmada" });
    } catch {
      alert("No se pudo confirmar. Intenta de nuevo.");
    } finally {
      setConfirmando(false);
    }
  }

  // ─── Pantallas de error ───────────────────────────────────────────────────

  if (!cargando && errorMsg) {
    const esTokenExpirado = errorMsg === "token_expirado";
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="max-w-md w-full text-center bg-white p-8 rounded-2xl shadow border border-carbon/10 space-y-4">
          <div className="text-4xl">{esTokenExpirado ? "⏰" : "🔒"}</div>
          <h2 className="text-xl font-bold text-verde-profundo font-titular">
            {esTokenExpirado ? "Enlace expirado" : "Acceso no válido"}
          </h2>
          <p className="text-sm text-carbon/60 leading-relaxed font-cuerpo">
            {esTokenExpirado
              ? "Tu enlace de acceso expiró. Contacta a tu asesor para recibir un nuevo link."
              : "El enlace no es válido o el expediente no existe."}
          </p>
          <a
            href="https://wa.me/524771234567?text=Hola, necesito un nuevo link para mi expediente"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-sauce text-white px-6 py-3 rounded-xl font-semibold text-sm mt-2"
          >
            💬 Contactar a Sofía
          </a>
        </div>
      </main>
    );
  }

  if (cargando || !expediente) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-sauce border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400 font-cuerpo">Cargando tu expediente...</p>
        </div>
      </main>
    );
  }

  const actual = pasoActual(expediente.status_proceso);
  const pasoInfo = PASOS[actual];
  const nombreCompleto = [expediente.cliente, expediente.primer_apellido, expediente.segundo_apellido]
    .filter(Boolean).join(" ");
  const direccion = expediente.direccion_propiedad || promocion?.calle
    ? `${promocion?.calle ?? ""} ${promocion?.numero_exterior ?? ""}, ${promocion?.colonia ?? ""} — León, Gto.`
    : "León, Guanajuato";

  const esFormularioRecibido = expediente.status_proceso === "formulario_recibido";
  const estaConfirmado = !esFormularioRecibido || confirmado;

  // Mensaje de próximos pasos según status
  const proximosPasos: Record<StatusProceso, string> = {
    formulario_recibido: "En 24 hrs agendaremos tu sesión de fotos profesionales.",
    informacion_confirmada: "Propone tus horarios preferidos para la sesión de fotos. Te contactará nuestro fotógrafo.",
    fotos_agendadas: expediente.fecha_fotos_agendadas
      ? `Tu sesión es el ${formatFecha(expediente.fecha_fotos_agendadas)}. Durará aproximadamente 2 horas.`
      : "Tu sesión de fotos está programada. Recibirás confirmación por WhatsApp.",
    fotos_completadas: "Tus fotos están siendo editadas. Tu propiedad aparecerá en línea en 24-48 hrs.",
    en_catalogo: "Tu propiedad está publicada en nuestro catálogo. Recibirás notificación cuando haya interesados.",
    primer_interesado: "Estamos en contacto con un cliente interesado en tu propiedad.",
    visita_agendada: "Un cliente visitará tu propiedad. Asegúrate de tener acceso disponible.",
    loi_firmada: "Tenemos un cliente interesado. Tramitamos los documentos necesarios.",
    en_tramite_legal: "Tu expediente está en proceso legal e INFONAVIT. Tiempo estimado: 15-30 días.",
    en_notaria: "Todo está listo para firmar. Tu asesor te compartirá la cita en notaría.",
    operacion_cerrada: "¡Felicidades! La operación se cerró exitosamente. Tu asesor te informará sobre los detalles.",
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] pb-10">
      {/* ── Encabezado ── */}
      <header className="bg-verde-profundo text-white px-4 py-4 shadow-lg">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 rounded-xl px-3 py-1.5">
              <span className="font-display font-bold text-white text-lg tracking-tight">SAUCEDA</span>
            </div>
            <div>
              <p className="text-white/60 text-xs font-cuerpo">Tu Expediente</p>
              <h1 className="font-titular font-bold text-sm leading-tight">{nombreCompleto}</h1>
            </div>
          </div>
          <a
            href="https://wa.me/524771234567?text=Hola, tengo preguntas sobre mi expediente"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-3 py-2 rounded-xl transition-colors"
          >
            💬 Hablar con Sofía
          </a>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ── Dirección ── */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="text-lg">🏠</span>
            <p className="font-medium font-cuerpo">{direccion}</p>
          </div>
        </div>

        {/* ── Litigios bloqueado ── */}
        {expediente.litigios_bloqueado && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-bold text-amber-800 font-titular text-sm">Revisión legal requerida</p>
              <p className="text-amber-700 text-sm font-cuerpo mt-1">
                Esta propiedad requiere revisión legal. Nos pondremos en contacto contigo en 24-48 hrs.
              </p>
            </div>
          </div>
        )}

        {/* ── Progress bar ── */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-cuerpo">Progreso del expediente</p>
              <p className="font-bold text-verde-profundo font-titular">
                {pasoInfo?.icono} Paso {actual + 1} de {PASOS.length}: {pasoInfo?.label}
              </p>
            </div>
            <span className="text-xs bg-sauce/10 text-sauce font-bold px-3 py-1 rounded-full font-mono">
              {Math.round(((actual + 1) / PASOS.length) * 100)}%
            </span>
          </div>
          <Timeline status={expediente.status_proceso} />
        </div>

        {/* ── Resumen de información ── */}
        <div className="space-y-3">
          <h2 className="font-bold text-verde-profundo font-titular px-1">Tu información</h2>

          <SeccionInfo icono="📋" titulo="Legal" defaultOpen critico>
            <Campo label="Nombre titular" valor={promocion?.nombre_titular || nombreCompleto} critico />
            <Campo label="Teléfono" valor={promocion?.telefono_titular || expediente.telefono} />
            <Campo label="Email" valor={promocion?.email_titular} />
            <Campo label="Identificación" valor={promocion?.tipo_identificacion} />
            <Campo label="Tiene escritura" valor={promocion?.tiene_escritura} critico />
            <Campo label="Comprobante domicilio" valor={promocion?.tiene_comprobante_domicilio} />
          </SeccionInfo>

          <SeccionInfo icono="💰" titulo="Crédito">
            <Campo label="Tipo de crédito" valor={promocion?.tipo_credito || expediente.tipo_credito} critico />
            <Campo label="N° expediente INFONAVIT" valor={promocion?.expediente_infonavit} critico />
            <Campo label="Saldo del crédito" valor={promocion?.saldo_credito ? formatMoney(promocion.saldo_credito) : formatMoney(expediente.saldo_deuda)} />
            <Campo label="Tasa" valor={promocion?.tasa_credito ? `${promocion.tasa_credito}%` : undefined} />
            <p className="text-[11px] text-slate-400 pt-1 italic">Para modificar estos datos contacta a tu asesor.</p>
          </SeccionInfo>

          <SeccionInfo icono="🏠" titulo="Propiedad">
            <Campo label="Dirección" valor={[promocion?.calle, promocion?.numero_exterior, promocion?.colonia].filter(Boolean).join(", ")} />
            <Campo label="Ciudad / Estado" valor={[promocion?.ciudad, promocion?.estado].filter(Boolean).join(", ")} />
            <Campo label="m² construcción" valor={promocion?.metros_construccion} />
            <Campo label="m² terreno" valor={promocion?.metros_terreno} />
            <Campo label="Año construcción" valor={promocion?.anio_construccion} />
            <Campo label="Recámaras" valor={promocion?.num_recamaras} />
            <Campo label="Baños" valor={promocion?.num_banos} />
            <Campo label="Estado conservación" valor={promocion?.estado_conservacion} />
            {(promocion?.servicios ?? []).length > 0 && (
              <Campo label="Servicios" valor={(promocion!.servicios ?? []).join(", ")} />
            )}
          </SeccionInfo>

          <SeccionInfo icono="⚠️" titulo="Situación">
            <Campo label="¿Propiedad ocupada?" valor={promocion?.propiedad_ocupada} />
            {promocion?.propiedad_ocupada && <Campo label="Ocupante" valor={promocion?.nombre_ocupante} />}
            <Campo label="¿Tiene adeudos?" valor={promocion?.tiene_adeudos} />
            {promocion?.tiene_adeudos && <Campo label="Descripción adeudos" valor={promocion?.descripcion_adeudos} />}
            <Campo label="¿Litigios?" valor={promocion?.tiene_litigios} />
            {promocion?.tiene_litigios && <Campo label="Descripción litigios" valor={promocion?.descripcion_litigios} />}
          </SeccionInfo>

          <SeccionInfo icono="📅" titulo="Disponibilidad">
            <Campo label="Horario para fotos" valor={promocion?.horario_fotos} />
            <Campo label="Disponible para firma" valor={promocion?.disponible_firma} />
            <Campo label="Comentarios" valor={promocion?.comentarios} />
          </SeccionInfo>
        </div>

        {/* Galería de Fotos de la Propiedad (Vista Cliente) */}
        <GaleriaFotosExpediente expedienteId={expediente.id} readonly />

        {/* ── Próximos pasos ── */}
        <div className="bg-verde-profundo/5 border border-sauce/20 rounded-2xl p-5">
          <h3 className="font-bold text-verde-profundo font-titular mb-2">📅 Próximos pasos</h3>
          <p className="text-sm text-carbon/70 font-cuerpo leading-relaxed">
            {proximosPasos[expediente.status_proceso]}
          </p>
          {expediente.asesor?.nombre && (
            <p className="text-xs text-slate-400 font-cuerpo mt-3">
              Tu asesor: <span className="font-semibold text-verde-profundo">{expediente.asesor.nombre}</span>
            </p>
          )}
        </div>

        {/* ── Botones de acción ── */}
        <div className="space-y-3">
          {(esFormularioRecibido && !confirmado && !expediente.litigios_bloqueado) && (
            <button
              onClick={confirmar}
              disabled={confirmando}
              className="w-full py-4 bg-sauce hover:bg-verde-profundo text-white rounded-2xl font-bold text-base shadow-lg shadow-sauce/20 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {confirmando ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Confirmando...
                </>
              ) : "✓ Confirmo que es correcto"}
            </button>
          )}

          {(confirmado || estaConfirmado) && !esFormularioRecibido && (
            <div className="bg-sauce/10 border border-sauce/30 rounded-2xl px-4 py-3 flex items-center gap-2">
              <span className="text-sauce text-xl">✅</span>
              <div>
                <p className="font-bold text-verde-profundo text-sm font-titular">Información confirmada</p>
                {expediente.fecha_confirmacion && (
                  <p className="text-xs text-slate-400 font-cuerpo">{formatFecha(expediente.fecha_confirmacion)}</p>
                )}
              </div>
            </div>
          )}

          <button
            onClick={() => setModalEdicion(true)}
            className="w-full py-3 bg-cielo/10 hover:bg-cielo/20 text-cielo border border-cielo/30 rounded-2xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            ✏️ Editar información
          </button>

          <a
            href="https://wa.me/524771234567?text=Hola, necesito ayuda con mi expediente"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            ❓ Necesito ayuda
          </a>
        </div>

        <p className="text-center text-[10px] text-slate-300 font-cuerpo pt-2">
          © SAUCEDA Bienes Raíces · León, Guanajuato · Expediente {expediente.id}
        </p>
      </div>

      {/* ── Modal edición ── */}
      {modalEdicion && expediente && (
        <ModalEdicion
          expedienteId={expediente.id}
          token={token}
          promocion={promocion}
          statusProceso={expediente.status_proceso}
          onClose={() => setModalEdicion(false)}
          onGuardado={() => void cargar()}
        />
      )}
    </main>
  );
}
