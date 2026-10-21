"use client";

import React, { useEffect, useMemo, useState } from "react";
import { listarProductosServicios } from "@/app/actions/productos";
import { registrarCotizacionExpress } from "@/app/actions/coordinacion-servicio-proveedor";
import type { ProductoServicio, TarifaCapacidad } from "@/lib/types";
import { MEDIDAS_TARIFA, formatoEscalon, medidaTarifa } from "@/lib/tarifas-capacidad";
import { PLAZOS_DISPONIBLES, PLAZOS_DEFAULT, calcularOpcionMeses } from "@/lib/mercadopago-meses";

// Cotización Express: propuesta rápida (una imagen) de un producto/servicio del
// catálogo de Productos y Servicios, con su precio parametrizado y la descripción
// del servicio. Misma experiencia que la calculadora de impermeabilización.

export interface ModalCotizacionExpressProps {
  abierto: boolean;
  onCerrar: () => void;
  nombreCliente?: string;
  /** Línea de negocio de la conversación: preselecciona su producto. */
  tipoNegocio?: string | null;
  onInsertarTexto?: (texto: string) => void;
  onEnviarImagenDirecta?: (file: File, caption?: string) => Promise<boolean | void>;
  /** Teléfono de la conversación: al enviar se registra lo cotizado (para el costo del proveedor). */
  telefono?: string;
}

function formatearDinero(monto: number) {
  return monto.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

/** Renglones de la descripción del servicio (una viñeta por línea). */
function renglonesDe(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•✓*·]\s*/, "").trim())
    .filter(Boolean);
}

function descripcionInicial(p: ProductoServicio): string {
  const partes = [p.descripcion, p.estandarIncluye].map((t) => (t || "").trim()).filter(Boolean);
  return partes.join("\n");
}

function tiempoLegible(t?: string): string {
  const v = (t || "").trim();
  if (!v) return "";
  return /^\d+(\.\d+)?$/.test(v) ? `${v} ${Number(v) === 1 ? "día" : "días"}` : v;
}

function garantiaLegible(p: ProductoServicio): string {
  const anios = Number(p.estandarGarantiaAnios || 0);
  const texto = (p.estandarGarantia || p.plantillaGarantia || "").trim();
  if (anios > 0) return `${anios} ${anios === 1 ? "año" : "años"}${texto ? ` — ${texto}` : ""}`;
  return texto;
}

export function ModalCotizacionExpress({
  abierto,
  onCerrar,
  nombreCliente = "Cliente",
  tipoNegocio,
  onInsertarTexto,
  onEnviarImagenDirecta,
  telefono,
}: ModalCotizacionExpressProps) {
  const [productos, setProductos] = useState<ProductoServicio[]>([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [productoId, setProductoId] = useState<string>("");
  const [escalon, setEscalon] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState<number>(1);
  const [precioManual, setPrecioManual] = useState<number | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [nota, setNota] = useState("");
  const [mesesActivo, setMesesActivo] = useState(false);
  const [plazos, setPlazos] = useState<number[]>(PLAZOS_DEFAULT);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setMesesActivo(false);
    setCargando(true);
    listarProductosServicios({ soloActivos: true })
      .then((lista) => {
        const vendibles = lista.filter((p) => p.tipo !== "insumo" && p.tipo !== "concepto_obra");
        setProductos(vendibles);
        // Preseleccionar el producto de la línea de negocio de la conversación
        const deLinea = vendibles.filter((p) => tipoNegocio && p.tipoNegocio === tipoNegocio && !p.esServicioEspecial);
        const inicial = deLinea.find((p) => tienePrecio(p)) || deLinea[0];
        if (inicial) elegirProducto(inicial);
      })
      .catch((e) => console.error("No se pudo cargar el catálogo para la cotización express:", e))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, tipoNegocio]);

  const producto = useMemo(() => productos.find((p) => p.id === productoId) || null, [productos, productoId]);
  const medida = medidaTarifa(producto?.tarifaMedida);
  const escalones: TarifaCapacidad[] = useMemo(
    () => (producto?.tarifasCapacidad || []).filter((t) => t.precio !== null && t.precio > 0),
    [producto]
  );
  const usaEscalones = escalones.length > 0;

  function tienePrecio(p: ProductoServicio) {
    return p.precioUnitario > 0 || (p.tarifasCapacidad || []).some((t) => (t.precio || 0) > 0);
  }

  function elegirProducto(p: ProductoServicio) {
    setProductoId(p.id);
    setDescripcion(descripcionInicial(p));
    setPrecioManual(null);
    setNota("");
    const esc = (p.tarifasCapacidad || []).filter((t) => (t.precio || 0) > 0);
    setEscalon(esc.length ? esc[0].hastaLitros : null);
    setCantidad(Math.max(1, Number(p.cantidadMinima) || 1));
  }

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = q
      ? productos.filter((p) => `${p.nombre} ${p.categoria || ""} ${p.id}`.toLowerCase().includes(q))
      : productos;
    // Primero los de la línea de la conversación, luego los que tienen precio
    return [...base].sort(
      (a, b) =>
        Number(b.tipoNegocio === tipoNegocio) - Number(a.tipoNegocio === tipoNegocio) ||
        Number(tienePrecio(b)) - Number(tienePrecio(a)) ||
        a.nombre.localeCompare(b.nombre)
    );
  }, [productos, busqueda, tipoNegocio]);

  // ── Cálculo del precio ──
  const escalonSel = usaEscalones ? escalones.find((t) => t.hastaLitros === escalon) || escalones[0] : null;
  const minimo = Number(producto?.cantidadMinima) || 0;
  const cantidadCobrada = usaEscalones ? 1 : Math.max(cantidad || 0, minimo, 0);
  const aplicaMinimo = !usaEscalones && minimo > 0 && (cantidad || 0) < minimo;
  const precioBase = escalonSel ? Number(escalonSel.precio) : Number(producto?.precioUnitario || 0);
  const precioUnit = precioManual !== null && precioManual > 0 ? precioManual : precioBase;
  const total = Math.round(precioUnit * cantidadCobrada);
  const unidad = producto?.unidad || "servicio";
  const esPorServicio = /^(servicio|pza|pieza|lote|unidad)$/i.test(unidad) && cantidadCobrada === 1;

  const plazosActivos = mesesActivo ? [...plazos].sort((a, b) => a - b) : [];
  const opcionesMeses = plazosActivos.map((m) => calcularOpcionMeses(total, m, true));

  const renglones = renglonesDe(descripcion);
  const garantia = producto ? garantiaLegible(producto) : "";
  const tiempo = tiempoLegible(producto?.estandarTiempo);

  const detallePrecio = escalonSel
    ? `Para equipo de hasta ${formatoEscalon(escalonSel.hastaLitros, medida)}`
    : esPorServicio
    ? "Precio por servicio"
    : `${cantidadCobrada.toLocaleString("es-MX")} ${unidad} × ${formatearDinero(precioUnit)}`;
  const detallePrecioTexto = escalonSel
    ? `Para equipo de hasta *${formatoEscalon(escalonSel.hastaLitros, medida)}*`
    : esPorServicio
    ? ""
    : `${cantidadCobrada.toLocaleString("es-MX")} ${unidad} × ${formatearDinero(precioUnit)}`;

  function nombreCorto() {
    return nombreCliente && nombreCliente !== "Cliente" ? nombreCliente.split(" ")[0] : "";
  }

  function generarTexto(): string {
    if (!producto) return "";
    const saludo = nombreCorto() ? `¡Hola ${nombreCorto()}!` : "¡Hola!";
    const meses = opcionesMeses.length
      ? `\n💳 *A meses con intereses (Mercado Pago):*\n${opcionesMeses
          .map((o) => `   ▸ ${o.meses} meses: *${formatearDinero(o.mensualidad)}/mes* (total ${formatearDinero(o.total)})`)
          .join("\n")}\n`
      : "";
    return `${saludo} Te compartimos tu cotización express:

🧾 *${producto.nombre.toUpperCase()} — SAUCEDA CONSTRUYE*
${detallePrecioTexto ? `${detallePrecioTexto}\n` : ""}
💰 *Inversión: ${formatearDinero(total)} MXN*${aplicaMinimo ? `\n• Mínimo de cobro: ${minimo} ${unidad}` : ""}
${meses}${renglones.length ? `\n📋 *¿Qué incluye el servicio?*\n${renglones.map((r) => `✓ ${r}`).join("\n")}\n` : ""}${
      garantia ? `\n🛡️ *Garantía:* ${garantia}` : ""
    }${tiempo ? `\n⏱️ *Tiempo estimado:* ${tiempo}` : ""}${nota.trim() ? `\n\n📌 ${nota.trim()}` : ""}

¿Te gustaría que agendemos tu servicio?`;
  }

  // ── Imagen ──
  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = words[0] || "";
    for (let i = 1; i < words.length; i++) {
      const w = words[i];
      if (ctx.measureText(current + " " + w).width < maxWidth) current += " " + w;
      else {
        lines.push(current);
        current = w;
      }
    }
    lines.push(current);
    return lines;
  }

  function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill?: string,
    stroke?: string,
    sw = 1
  ) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = sw;
      ctx.stroke();
    }
    ctx.restore();
  }

  function construirCanvas(): HTMLCanvasElement | null {
    if (!producto) return null;
    const width = 1080;
    const pad = 54;
    const cardX = pad;
    const cardW = width - pad * 2;
    const inner = cardW - 64;

    // Medir contenido para calcular el alto
    const medidor = document.createElement("canvas").getContext("2d");
    if (!medidor) return null;
    medidor.font = "bold 30px sans-serif";
    const tituloLineas = wrapText(medidor, producto.nombre, inner - 20);
    medidor.font = "17px sans-serif";
    const itemsLineas = renglones.map((r) => wrapText(medidor, r, inner - 40));
    medidor.font = "15px sans-serif";
    const notaLineas = nota.trim() ? wrapText(medidor, nota.trim(), inner - 32) : [];
    const garantiaLineas = garantia ? wrapText(medidor, garantia, (tiempo ? inner / 2 : inner) - 40) : [];

    const altoTitulo = tituloLineas.length * 38;
    const altoMeses = opcionesMeses.length ? 46 + opcionesMeses.length * 30 : 0;
    const altoItems = renglones.length ? 44 + itemsLineas.reduce((s, l) => s + l.length * 24 + 10, 0) : 0;
    const altoMetricas = garantia || tiempo ? 30 + Math.max(1, garantiaLineas.length) * 20 + 40 : 0;
    const altoNota = notaLineas.length ? notaLineas.length * 22 + 36 : 0;
    const cardH = 40 + altoTitulo + 24 + 150 + altoMeses + 20 + altoItems + altoMetricas + altoNota + 30;
    const height = 140 + 30 + cardH + 90;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, 0, width, height);

    // Encabezado
    ctx.fillStyle = "#2D4A2B";
    ctx.fillRect(0, 0, width, 140);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText("SAUCEDA CONSTRUYE", pad, 36);
    ctx.fillStyle = "#C9A961";
    ctx.font = "bold 17px sans-serif";
    ctx.fillText("COTIZACIÓN EXPRESS", pad, 80);

    const pillTxt = nombreCorto() ? `Propuesta para: ${nombreCorto()}` : "Propuesta de inversión";
    ctx.font = "bold 18px sans-serif";
    const pillW = ctx.measureText(pillTxt).width + 40;
    roundRect(ctx, width - pillW - pad, 48, pillW, 44, 22, "#5C7A52");
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pillTxt, width - pillW / 2 - pad, 70);

    // Tarjeta
    const cardY = 170;
    roundRect(ctx, cardX, cardY, cardW, cardH, 22, "#FFFFFF", "#C9A961", 2);
    let y = cardY + 40;
    const x = cardX + 32;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    ctx.fillStyle = "#B58E3F";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText((producto.categoria && producto.categoria !== "General" ? producto.categoria : producto.tipo === "producto" ? "PRODUCTO" : "SERVICIO").toUpperCase(), x, y - 18);

    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 30px sans-serif";
    tituloLineas.forEach((l, i) => ctx.fillText(l, x, y + i * 38));
    y += altoTitulo + 24;

    // Bloque de precio
    roundRect(ctx, x, y, inner, 130, 14, "#FAF7EE", "#E2D7BE", 1);
    ctx.fillStyle = "#64748B";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("INVERSIÓN", x + 24, y + 20);
    ctx.fillStyle = "#2D4A2B";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("$", x + 24, y + 52);
    ctx.font = "bold 52px sans-serif";
    const totalStr = total.toLocaleString("es-MX", { maximumFractionDigits: 0 });
    ctx.fillText(totalStr, x + 44, y + 40);
    const tw = ctx.measureText(totalStr).width;
    ctx.fillStyle = "#64748B";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("MXN", x + 54 + tw, y + 68);
    ctx.fillStyle = aplicaMinimo ? "#B45309" : "#475569";
    ctx.font = aplicaMinimo ? "bold 15px sans-serif" : "15px sans-serif";
    ctx.fillText(aplicaMinimo ? `Mínimo de cobro: ${minimo} ${unidad}  ·  ${detallePrecio}` : detallePrecio, x + 24, y + 100);
    y += 150;

    if (opcionesMeses.length) {
      roundRect(ctx, x, y, inner, altoMeses - 10, 10, "#F0F9FF", "#BAE6FD", 1);
      ctx.fillStyle = "#0369A1";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("A MESES CON INTERESES (MERCADO PAGO)", x + 20, y + 16);
      ctx.textBaseline = "middle";
      opcionesMeses.forEach((o, i) => {
        const ry = y + 52 + i * 30;
        ctx.textAlign = "left";
        ctx.fillStyle = "#334155";
        ctx.font = "bold 16px sans-serif";
        ctx.fillText(`${o.meses} meses`, x + 20, ry);
        ctx.textAlign = "right";
        ctx.fillStyle = "#2D4A2B";
        ctx.font = "bold 16px monospace";
        ctx.fillText(`${formatearDinero(o.mensualidad)}/mes  ·  total ${formatearDinero(o.total)}`, x + inner - 20, ry);
      });
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      y += altoMeses;
    }
    y += 20;

    if (renglones.length) {
      ctx.fillStyle = "#0F172A";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText("¿Qué incluye el servicio?", x, y);
      y += 44;
      itemsLineas.forEach((lineas) => {
        ctx.fillStyle = "#5C7A52";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText("✓", x + 4, y);
        ctx.fillStyle = "#334155";
        ctx.font = "17px sans-serif";
        lineas.forEach((l, i) => ctx.fillText(l, x + 32, y + i * 24));
        y += lineas.length * 24 + 10;
      });
    }

    if (garantia || tiempo) {
      y += 10;
      const boxH = Math.max(1, garantiaLineas.length) * 20 + 50;
      const colW = garantia && tiempo ? (inner - 16) / 2 : inner;
      let cx = x;
      if (garantia) {
        roundRect(ctx, cx, y, colW, boxH, 10, "#F8FAFC", "#E2E8F0", 1);
        ctx.fillStyle = "#64748B";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText("GARANTÍA", cx + 16, y + 14);
        ctx.fillStyle = "#2D4A2B";
        ctx.font = "15px sans-serif";
        garantiaLineas.forEach((l, i) => ctx.fillText(l, cx + 16, y + 34 + i * 20));
        cx += colW + 16;
      }
      if (tiempo) {
        roundRect(ctx, cx, y, colW, boxH, 10, "#F8FAFC", "#E2E8F0", 1);
        ctx.fillStyle = "#64748B";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText("TIEMPO ESTIMADO", cx + 16, y + 14);
        ctx.fillStyle = "#2D4A2B";
        ctx.font = "bold 17px sans-serif";
        ctx.fillText(tiempo, cx + 16, y + 34);
      }
      y += boxH + 20;
    }

    if (notaLineas.length) {
      const nh = notaLineas.length * 22 + 24;
      roundRect(ctx, x, y, inner, nh, 10, "#FFFBEB", "#FDE68A", 1);
      ctx.fillStyle = "#92400E";
      ctx.font = "15px sans-serif";
      notaLineas.forEach((l, i) => ctx.fillText(l, x + 16, y + 12 + i * 22));
    }

    // Pie
    ctx.textAlign = "center";
    ctx.fillStyle = "#64748B";
    ctx.font = "14px sans-serif";
    ctx.fillText("Precios en MXN. Sujeto a revisión del equipo en sitio.", width / 2, cardY + cardH + 26);
    ctx.fillStyle = "#2D4A2B";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText("SAUCEDA CONSTRUYE  ·  Calidad y garantía por escrito", width / 2, cardY + cardH + 52);

    return canvas;
  }

  function nombreArchivo() {
    const base = (producto?.nombre || "Cotizacion").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "_");
    return `Cotizacion_Express_${base}_SAUCEDA.png`;
  }

  function avisar(msg: string, cerrar = false) {
    setAviso(msg);
    setTimeout(() => {
      setAviso(null);
      if (cerrar) onCerrar();
    }, cerrar ? 900 : 2500);
  }

  function descargarImagen() {
    const canvas = construirCanvas();
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = nombreArchivo();
    a.href = canvas.toDataURL("image/png");
    a.click();
    avisar("¡Imagen PNG descargada!");
  }

  async function enviarImagenAlChat() {
    if (!onEnviarImagenDirecta) return;
    const canvas = construirCanvas();
    if (!canvas) return;
    setEnviando(true);
    try {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/png", 0.95));
      if (!blob) throw new Error("No se pudo crear la imagen");
      const file = new File([blob], nombreArchivo(), { type: "image/png" });
      const ok = await onEnviarImagenDirecta(file, `Cotización express: ${producto?.nombre} — SAUCEDA Construye`);
      if (ok !== false) {
        avisar("¡Cotización enviada al chat!", true);
        if (telefono && producto) {
          void registrarCotizacionExpress(telefono, {
            productoId: producto.id,
            productoNombre: producto.nombre,
            cantidad: escalonSel ? escalonSel.hastaLitros : cantidadCobrada,
            variacion: escalonSel ? `hasta ${formatoEscalon(escalonSel.hastaLitros, medida)}` : `${cantidadCobrada} ${unidad}`,
            total,
          });
        }
      }
    } catch (e) {
      console.error("Error al enviar la cotización express:", e);
      alert("Hubo un detalle al enviar la imagen al chat.");
    } finally {
      setEnviando(false);
    }
  }

  function insertarTexto() {
    const texto = generarTexto();
    if (!texto) return;
    if (onInsertarTexto) {
      onInsertarTexto(texto);
      avisar("¡Texto insertado en el chat!", true);
    } else {
      navigator.clipboard.writeText(texto);
      avisar("¡Copiado al portapapeles!");
    }
  }

  if (!abierto) return null;

  const listo = !!producto && total > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-50 border border-carbon/15 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Cabecera */}
        <div className="bg-verde-profundo text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚡</span>
              <h2 className="text-lg sm:text-xl font-bold font-titular tracking-tight">Cotización Express</h2>
            </div>
            <p className="text-xs text-crema/80 mt-0.5">
              Propuesta rápida en una imagen con el precio del catálogo de Productos para {nombreCliente || "el cliente"}.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition text-sm cursor-pointer"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {aviso && <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 text-center animate-pulse">✓ {aviso}</div>}

        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-[300px_1fr]">
          {/* Selector de producto */}
          <div className="border-b md:border-b-0 md:border-r border-carbon/10 bg-white p-3 flex flex-col gap-2 md:max-h-[70vh]">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o servicio…"
              className="w-full px-3 py-1.5 bg-slate-50 border border-carbon/20 rounded-lg text-xs focus:outline-none focus:border-sauce"
            />
            <div className="overflow-y-auto flex-1 space-y-1 max-h-60 md:max-h-none">
              {cargando && <p className="text-xs text-carbon/50 p-2">Cargando catálogo…</p>}
              {!cargando && productosFiltrados.length === 0 && (
                <p className="text-xs text-carbon/50 p-2">Sin productos que coincidan.</p>
              )}
              {productosFiltrados.map((p) => {
                const sel = p.id === productoId;
                const conPrecio = tienePrecio(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => elegirProducto(p)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs transition cursor-pointer ${
                      sel ? "bg-verde-profundo text-white border-verde-profundo" : "bg-white hover:bg-slate-50 border-carbon/10"
                    }`}
                  >
                    <span className="block font-bold leading-tight">{p.nombre}</span>
                    <span className={`block text-[10px] mt-0.5 ${sel ? "text-white/70" : "text-carbon/50"}`}>
                      {p.id} · {p.tipoNegocio === tipoNegocio && tipoNegocio ? "de esta línea · " : ""}
                      {conPrecio ? "con precio" : "sin precio"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configuración */}
          <div className="p-3 sm:p-5 space-y-4">
            {!producto ? (
              <p className="text-sm text-carbon/60">Elige un producto o servicio del catálogo para armar la cotización.</p>
            ) : (
              <>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-sauce">{producto.id}</span>
                  <h3 className="font-titular font-extrabold text-lg text-carbon leading-tight">{producto.nombre}</h3>
                </div>

                {usaEscalones ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-carbon/70">
                      Tamaño del equipo ({MEDIDAS_TARIFA[medida].etiqueta.toLowerCase()}):
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {escalones.map((t) => (
                        <button
                          key={t.hastaLitros}
                          type="button"
                          onClick={() => {
                            setEscalon(t.hastaLitros);
                            setPrecioManual(null);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                            escalonSel?.hastaLitros === t.hastaLitros
                              ? "bg-verde-profundo text-white shadow-xs"
                              : "bg-white hover:bg-slate-100 text-carbon/70 border border-carbon/15"
                          }`}
                        >
                          Hasta {formatoEscalon(t.hastaLitros, medida)} · {formatearDinero(Number(t.precio))}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs font-bold text-carbon/70">Cantidad:</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={cantidad || ""}
                      onChange={(e) => setCantidad(parseFloat(e.target.value) || 0)}
                      className="w-24 px-3 py-1.5 bg-white border border-carbon/20 rounded-lg text-sm font-bold font-mono text-center focus:outline-none focus:border-sauce"
                    />
                    <span className="text-xs font-bold text-carbon/50">{unidad}</span>
                    {minimo > 0 && <span className="text-[11px] text-amber-700">Mínimo de cobro: {minimo} {unidad}</span>}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-bold text-carbon/70">
                    Precio {usaEscalones || esPorServicio ? "" : `por ${unidad}`}:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={precioManual ?? precioBase ?? ""}
                    onChange={(e) => setPrecioManual(parseFloat(e.target.value) || 0)}
                    className="w-28 px-3 py-1.5 bg-white border border-carbon/20 rounded-lg text-sm font-bold font-mono text-center focus:outline-none focus:border-sauce"
                  />
                  {precioManual !== null && precioManual !== precioBase && (
                    <button
                      type="button"
                      onClick={() => setPrecioManual(null)}
                      className="text-[11px] text-sauce underline cursor-pointer"
                    >
                      Usar precio del catálogo ({formatearDinero(precioBase)})
                    </button>
                  )}
                  {precioBase <= 0 && (
                    <span className="text-[11px] text-amber-700">
                      Este producto no tiene precio en el catálogo: captúralo aquí o en Productos.
                    </span>
                  )}
                </div>

                <div className="rounded-xl border-2 border-dorado bg-[#FAF7EE] p-4">
                  <span className="block text-[10px] uppercase font-bold text-carbon/50 tracking-wider">Inversión</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-carbon/50">$</span>
                    <span className="font-mono text-4xl font-black text-verde-profundo">
                      {total.toLocaleString("es-MX", { maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-xs font-bold text-carbon/60">MXN</span>
                  </div>
                  <span className={`text-xs ${aplicaMinimo ? "text-amber-700 font-bold" : "text-carbon/60"}`}>
                    {aplicaMinimo ? `Mínimo de cobro: ${minimo} ${unidad} · ` : ""}
                    {detallePrecio}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-carbon/70">
                    Descripción del servicio (una viñeta por línea; se toma del producto):
                  </label>
                  <textarea
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 bg-white border border-carbon/20 rounded-lg text-xs leading-relaxed focus:outline-none focus:border-sauce"
                  />
                  <div className="flex flex-wrap gap-3 text-[11px] text-carbon/60">
                    {garantia && <span>🛡️ Garantía: {garantia}</span>}
                    {tiempo && <span>⏱️ Tiempo: {tiempo}</span>}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-carbon/70">Nota adicional (opcional):</label>
                  <input
                    type="text"
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Ej. Materiales extra se cotizan aparte si se requieren"
                    className="w-full px-3 py-1.5 bg-white border border-carbon/20 rounded-lg text-xs focus:outline-none focus:border-sauce"
                  />
                </div>

                <div
                  className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
                    mesesActivo ? "bg-sky-50 border-sky-200" : "bg-white border-carbon/10"
                  }`}
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={mesesActivo}
                      onChange={(e) => setMesesActivo(e.target.checked)}
                      className="w-4 h-4 accent-sky-600 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-carbon/80">💳 Agregar pago a meses</span>
                  </label>
                  {mesesActivo && (
                    <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                      {PLAZOS_DISPONIBLES.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPlazos((prev) => (prev.includes(m) ? prev.filter((p) => p !== m) : [...prev, m]))}
                          className={`px-2 py-1 rounded text-xs font-bold transition cursor-pointer ${
                            plazos.includes(m)
                              ? "bg-sky-600 text-white shadow-xs"
                              : "bg-white hover:bg-slate-100 text-carbon/60 border border-carbon/15"
                          }`}
                        >
                          {m} meses
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Pie */}
        <div className="bg-white p-3 sm:p-4 border-t border-carbon/10 flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onCerrar}
            className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-carbon/80 font-bold text-xs transition cursor-pointer"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={descargarImagen}
            disabled={!listo}
            className="px-3.5 py-2 rounded-lg bg-dorado hover:bg-dorado/90 text-carbon font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            📸 Descargar Imagen
          </button>
          <button
            type="button"
            onClick={insertarTexto}
            disabled={!listo}
            className="px-3.5 py-2 rounded-lg bg-verde-profundo hover:bg-verde-profundo/90 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            📋 Insertar Texto
          </button>
          {onEnviarImagenDirecta && (
            <button
              type="button"
              onClick={enviarImagenAlChat}
              disabled={!listo || enviando}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {enviando ? "⏳ Enviando imagen..." : "📤 Enviar Imagen al Chat"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
