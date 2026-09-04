"use client";

import React, { useState, useRef, useEffect } from "react";

export interface ModalCalculadoraProps {
  abierto: boolean;
  onCerrar: () => void;
  nombreCliente?: string;
  metrosIniciales?: number;
  onInsertarTexto?: (texto: string) => void;
  onEnviarImagenDirecta?: (file: File, caption?: string) => Promise<boolean | void>;
}

interface PaqueteInfo {
  id: "acrilico" | "estandar" | "premium";
  badge: string;
  titulo: string;
  subtitulo: string;
  precioM2: number;
  garantia: string;
  ejecucion: string;
  mejorPara: string;
  destacado?: boolean;
  colorRibbon?: string;
  incluye: string[];
}

const PAQUETES: PaqueteInfo[] = [
  {
    id: "acrilico",
    badge: "ACRÍLICO",
    titulo: "Impermeabilizante Acrílico",
    subtitulo: "Acrílico elastomérico con malla de refuerzo",
    precioM2: 170,
    garantia: "2 años",
    ejecucion: "1-2 días",
    mejorPara: "Mantenimiento preventivo, azoteas con poco tráfico y presupuesto accesible.",
    incluye: [
      "Diagnóstico técnico gratuito",
      "Preparación y limpieza de superficie",
      "Sellado de grietas y fisuras",
      "Aplicación de acrílico elastomérico",
      "Malla de refuerzo intermedio",
      "Limpieza final de la zona",
    ],
  },
  {
    id: "estandar",
    badge: "ESTÁNDAR",
    titulo: "Impermeabilizante 3.5",
    subtitulo: "Con gravilla roja o gris a elegir",
    precioM2: 210,
    garantia: "5 años",
    ejecucion: "2-3 días",
    mejorPara: "Solución eficaz y económica para azoteas con buen estado estructural.",
    incluye: [
      "Diagnóstico técnico gratuito",
      "Preparación y limpieza de superficie",
      "Aplicación profesional de impermeabilizante 3.5",
      "Gravilla (roja o gris, a elegir)",
      "Sellado de bordes y boquillas",
      "Limpieza final de la zona",
    ],
  },
  {
    id: "premium",
    badge: "PREMIUM",
    titulo: "Impermeabilizante 4.0 Poliéster",
    subtitulo: "Con gravilla roja o gris a elegir",
    precioM2: 260,
    garantia: "10 años",
    ejecucion: "2-3 días",
    mejorPara: "Máxima durabilidad y tranquilidad a largo plazo. La elección más inteligente.",
    destacado: true,
    colorRibbon: "#C9A961",
    incluye: [
      "Diagnóstico técnico gratuito",
      "Preparación y limpieza de superficie",
      "Aplicación profesional de impermeabilizante 4.0 poliéster",
      "Gravilla (roja o gris, a elegir)",
      "Sellado reforzado de bordes y boquillas",
      "Limpieza final y documentación fotográfica",
      "Garantía escrita de 10 años",
    ],
  },
];

const PRESETS = [30, 45, 60, 80, 100, 120, 150, 200];

export function ModalCalculadoraImpermeabilizacion({
  abierto,
  onCerrar,
  nombreCliente = "Cliente",
  metrosIniciales = 30,
  onInsertarTexto,
  onEnviarImagenDirecta,
}: ModalCalculadoraProps) {
  const [metros, setMetros] = useState<number>(metrosIniciales);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [generandoImagen, setGenerandoImagen] = useState<boolean>(false);
  const [enviandoImagenChat, setEnviandoImagenChat] = useState<boolean>(false);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (abierto && metrosIniciales > 0) {
      setMetros(metrosIniciales);
    }
  }, [abierto, metrosIniciales]);

  if (!abierto) return null;

  const m2Val = Math.max(1, isNaN(metros) ? 0 : metros);
  const totalAcrilico = m2Val * 170;
  const totalEstandar = m2Val * 210;
  const totalPremium = m2Val * 260;

  function formatearDinero(monto: number) {
    return monto.toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    });
  }

  function generarTextoComparativaCompleta(): string {
    const saludo = nombreCliente && nombreCliente !== "Cliente" ? `¡Hola ${nombreCliente.split(" ")[0]}!` : "¡Hola!";
    return `${saludo} Con gusto te compartimos la propuesta comparativa para los *${m2Val} m²* de tu azotea:

📐 *COTIZACIÓN DE IMPERMEABILIZACIÓN — SAUCEDA CONSTRUYE*
Metros a impermeabilizar: *${m2Val} m²*

━━━━━━━━━━━━━━━━━━━━━━━━━━
🟢 *1. PAQUETE ACRÍLICO*
• Precio: *$170 / m²* ➔ *Total: ${formatearDinero(totalAcrilico)} MXN*
• Garantía: 2 años | Ejecución: 1-2 días
• Incluye: Acrílico elastomérico con malla de refuerzo, sellado de grietas y limpieza final.
• Ideal para: Mantenimiento preventivo y azoteas con poco tráfico.

━━━━━━━━━━━━━━━━━━━━━━━━━━
🌿 *2. PAQUETE ESTÁNDAR (3.5)*
• Precio: *$210 / m²* ➔ *Total: ${formatearDinero(totalEstandar)} MXN*
• Garantía: 5 años | Ejecución: 2-3 días
• Incluye: Impermeabilizante 3.5 con gravilla (roja/gris), sellado de bordes y boquillas.
• Ideal para: Solución eficaz y económica para azoteas en buen estado.

━━━━━━━━━━━━━━━━━━━━━━━━━━
⭐ *3. PAQUETE PREMIUM (4.0 POLIÉSTER)* — 🏆 *10 Años Garantía*
• Precio: *$260 / m²* ➔ *Total: ${formatearDinero(totalPremium)} MXN*
• Garantía: 10 años por escrito | Ejecución: 2-3 días
• Incluye: Impermeabilizante 4.0 poliéster con gravilla, sellado reforzado y reporte fotográfico.
• Ideal para: Máxima durabilidad y tranquilidad a largo plazo.

━━━━━━━━━━━━━━━━━━━━━━━━━━
🎁 *TODOS NUESTROS PAQUETES INCLUYEN:*
✓ Diagnóstico técnico gratuito en sitio
✓ Materiales de primera calidad y mano de obra especializada
✓ Garantía formal por escrito

¿Te gustaría que agendemos una visita técnica gratuita para confirmar medidas y afinar detalles?`;
  }

  function generarTextoPaqueteIndividual(paquete: PaqueteInfo): string {
    const total = m2Val * paquete.precioM2;
    const saludo = nombreCliente && nombreCliente !== "Cliente" ? `¡Hola ${nombreCliente.split(" ")[0]}!` : "¡Hola!";
    return `${saludo} Te compartimos el detalle de la cotización para tu azotea (*${m2Val} m²*):

🏠 *${paquete.titulo.toUpperCase()}* — *${paquete.badge}*
${paquete.subtitulo}

💰 *Inversión:* ${formatearDinero(total)} MXN (*$${paquete.precioM2} / m²*)
🛡️ *Garantía:* ${paquete.garantia}
⏱️ *Tiempo de ejecución:* ${paquete.ejecucion}

📋 *¿Qué incluye tu servicio?*
${paquete.incluye.map((inc) => `✓ ${inc}`).join("\n")}

💡 *Recomendado para:* ${paquete.mejorPara}

🎁 *Incluye diagnóstico técnico gratuito en sitio.* ¿Te gustaría que agendemos la visita técnica para confirmar medidas?`;
  }

  function manejarInsertar(texto: string, label: string) {
    if (onInsertarTexto) {
      onInsertarTexto(texto);
      setCopiado(`¡Insertado en el chat! (${label})`);
      setTimeout(() => {
        setCopiado(null);
        onCerrar();
      }, 700);
    } else {
      navigator.clipboard.writeText(texto);
      setCopiado(`¡Copiado al portapapeles! (${label})`);
      setTimeout(() => setCopiado(null), 2000);
    }
  }

  function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill?: string,
    stroke?: string,
    strokeWidth: number = 1
  ) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();

    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
    ctx.restore();
  }

  function construirCanvasCotizacion(): HTMLCanvasElement | null {
    const width = 1200;
    const height = 1380;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Fondo general
    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, 0, width, height);

    // Encabezado superior verde
    ctx.fillStyle = "#2D4A2B";
    ctx.fillRect(0, 0, width, 140);

    // Título y Marca
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("SAUCEDA CONSTRUYE", 54, 40);

    ctx.fillStyle = "#C9A961";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("PROPUESTA DE IMPERMEABILIZACIÓN", 54, 82);

    // Pill de Metros cuadrados
    const m2Text = `Propuesta para: ${m2Val} m²`;
    ctx.font = "bold 20px sans-serif";
    const m2TextWidth = ctx.measureText(m2Text).width;
    const pillW = m2TextWidth + 44;
    const pillH = 50;
    const pillX = width - pillW - 54;
    const pillY = 45;

    drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 25, "#5C7A52");
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(m2Text, pillX + pillW / 2, pillY + pillH / 2);

    // Dibujar las 3 tarjetas comparativas
    const cardWidth = 346;
    const cardHeight = 1180;
    const startX = 54;
    const gap = 27;
    const startY = 165;

    PAQUETES.forEach((pkg, index) => {
      const x = startX + index * (cardWidth + gap);
      const y = startY;
      const total = m2Val * pkg.precioM2;
      const esPremium = !!pkg.destacado;

      // 1. Fondo y borde de tarjeta
      const bgCard = esPremium ? "#FAF7EE" : "#FFFFFF";
      const borderCard = esPremium ? "#C9A961" : "#E2E8F0";
      const strokeW = esPremium ? 2.5 : 1.5;

      drawRoundedRect(ctx, x, y, cardWidth, cardHeight, 24, bgCard, borderCard, strokeW);

      // 2. Ribbon en Premium (10 años de garantía)
      if (esPremium) {
        ctx.save();
        // Clip al contenedor redondeado
        ctx.beginPath();
        ctx.moveTo(x + 24, y);
        ctx.lineTo(x + cardWidth - 24, y);
        ctx.arcTo(x + cardWidth, y, x + cardWidth, y + 24, 24);
        ctx.arcTo(x + cardWidth, y + cardHeight, x + cardWidth - 24, y + cardHeight, 24);
        ctx.arcTo(x, y + cardHeight, x, y + cardHeight - 24, 24);
        ctx.arcTo(x, y, x + 24, y, 24);
        ctx.closePath();
        ctx.clip();

        // Franja dorada inclinada
        ctx.translate(x + cardWidth - 48, y + 42);
        ctx.rotate((45 * Math.PI) / 180);
        ctx.fillStyle = "#B58E3F";
        ctx.fillRect(-100, -14, 200, 28);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("10 AÑOS GARANTÍA", 0, 0);
        ctx.restore();
      }

      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      // 3. Badge de Paquete (ACRÍLICO / ESTÁNDAR / PREMIUM)
      ctx.fillStyle = esPremium ? "#B58E3F" : "#5C7A52";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(pkg.badge, x + 24, y + 36);

      // 4. Título del Paquete
      ctx.fillStyle = "#0F172A";
      ctx.font = "bold 21px sans-serif";
      ctx.fillText(pkg.titulo, x + 24, y + 62);

      // 5. Subtítulo
      ctx.fillStyle = "#64748B";
      ctx.font = "12.5px sans-serif";
      ctx.fillText(pkg.subtitulo, x + 24, y + 94);

      // 6. Precio por m²
      const priceY = y + 140;
      ctx.fillStyle = esPremium ? "#B58E3F" : "#2D4A2B";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText("$", x + 24, priceY + 6);

      ctx.font = "bold 44px sans-serif";
      ctx.fillText(`${pkg.precioM2}`, x + 40, priceY - 4);

      const numWidth = ctx.measureText(`${pkg.precioM2}`).width;
      ctx.fillStyle = "#64748B";
      ctx.font = "14px sans-serif";
      ctx.fillText("por m²", x + 45 + numWidth, priceY + 18);

      // 7. Caja de Total Calculado
      const totalBoxY = priceY + 56;
      const totalBoxFill = esPremium ? "#EFE5CD" : "#F1F5F9";
      drawRoundedRect(ctx, x + 24, totalBoxY, cardWidth - 48, 44, 8, totalBoxFill);

      ctx.fillStyle = "#0F172A";
      ctx.font = "bold 14px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(`Total: ${m2Val} m² = ${formatearDinero(total)} MXN`, x + 36, totalBoxY + 22);

      // 8. Línea divisoria
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = "#E2E8F0";
      ctx.lineWidth = 1;
      ctx.moveTo(x + 24, totalBoxY + 60);
      ctx.lineTo(x + cardWidth - 24, totalBoxY + 60);
      ctx.stroke();
      ctx.restore();

      // 9. Lista de Inclusiones
      let listY = totalBoxY + 76;
      ctx.textBaseline = "top";

      pkg.incluye.forEach((item) => {
        // Checkmark
        ctx.fillStyle = "#5C7A52";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText("✓", x + 24, listY);

        // Texto
        ctx.fillStyle = "#334155";
        ctx.font = "12px sans-serif";
        const itemLines = wrapText(ctx, item, cardWidth - 75);
        itemLines.forEach((iLine, iIdx) => {
          ctx.fillText(iLine, x + 44, listY + iIdx * 16);
        });
        listY += Math.max(22, itemLines.length * 16 + 8);
      });

      // 10. Bloque Garantía y Ejecución
      const metricsY = y + cardHeight - 245;
      const colW = (cardWidth - 58) / 2;
      const metricsBg = esPremium ? "#FAF0D7" : "#F8FAFC";
      const metricsBorder = esPremium ? "#E2D7BE" : "#E2E8F0";

      drawRoundedRect(ctx, x + 24, metricsY, colW, 64, 8, metricsBg, metricsBorder, 1);
      drawRoundedRect(ctx, x + 24 + colW + 10, metricsY, colW, 64, 8, metricsBg, metricsBorder, 1);

      // Textos Garantía
      ctx.fillStyle = "#64748B";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("GARANTÍA", x + 34, metricsY + 12);

      ctx.fillStyle = "#2D4A2B";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText(pkg.garantia, x + 34, metricsY + 32);

      // Textos Ejecución
      ctx.fillStyle = "#64748B";
      ctx.font = "bold 9px sans-serif";
      ctx.fillText("EJECUCIÓN", x + 34 + colW + 10, metricsY + 12);

      ctx.fillStyle = "#0F172A";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText(pkg.ejecucion, x + 34 + colW + 10, metricsY + 32);

      // 11. Bloque "Mejor para"
      const mejorY = metricsY + 76;
      const mejorBg = esPremium ? "#FFFFFF" : "#F8FAFC";
      const mejorBorder = esPremium ? "#E2D7BE" : "#E2E8F0";

      drawRoundedRect(ctx, x + 24, mejorY, cardWidth - 48, 80, 8, mejorBg, mejorBorder, 1);

      ctx.fillStyle = "#475569";
      ctx.font = "11.5px sans-serif";
      const mejorLines = wrapText(ctx, `Mejor para: ${pkg.mejorPara}`, cardWidth - 66);
      mejorLines.forEach((mLine, mIdx) => {
        ctx.fillText(mLine, x + 34, mejorY + 14 + mIdx * 16);
      });

      // 12. Botón de Acción en el pie de tarjeta
      const btnY = y + cardHeight - 64;
      const btnH = 44;

      if (esPremium) {
        drawRoundedRect(ctx, x + 24, btnY, cardWidth - 48, btnH, 10, "#C9A961");
        ctx.fillStyle = "#FFFFFF";
      } else if (pkg.id === "estandar") {
        drawRoundedRect(ctx, x + 24, btnY, cardWidth - 48, btnH, 10, "#2D4A2B");
        ctx.fillStyle = "#FFFFFF";
      } else {
        drawRoundedRect(ctx, x + 24, btnY, cardWidth - 48, btnH, 10, "#FFFFFF", "#2D4A2B", 2);
        ctx.fillStyle = "#2D4A2B";
      }

      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`Cotizar paquete ${pkg.badge}`, x + cardWidth / 2, btnY + btnH / 2);
    });

    return canvas;
  }

  // Generación y descarga directa
  async function generarYDescargarImagen() {
    setGenerandoImagen(true);
    try {
      const canvas = construirCanvasCotizacion();
      if (!canvas) throw new Error("No se pudo inicializar canvas");

      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `Cotizacion_Impermeabilizacion_${m2Val}m2_SAUCEDA.png`;
      link.href = dataUrl;
      link.click();
      setCopiado("¡Imagen PNG descargada exitosamente!");
      setTimeout(() => setCopiado(null), 3000);
    } catch (err) {
      console.error("Error generando imagen de cotización:", err);
      alert("Hubo un detalle al generar la imagen.");
    } finally {
      setGenerandoImagen(false);
    }
  }

  // Envío directo de la imagen al chat por WhatsApp / Meta API
  async function manejarEnviarImagenAlChat() {
    if (!onEnviarImagenDirecta) return;
    setEnviandoImagenChat(true);
    try {
      const canvas = construirCanvasCotizacion();
      if (!canvas) throw new Error("No se pudo construir canvas");

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png", 0.95)
      );

      if (!blob) throw new Error("No se pudo crear el archivo de imagen");

      const filename = `Cotizacion_Impermeabilizacion_${m2Val}m2_SAUCEDA.png`;
      const file = new File([blob], filename, { type: "image/png" });
      const caption = `Propuesta de Impermeabilización para ${m2Val} m² — SAUCEDA Construye`;

      const exito = await onEnviarImagenDirecta(file, caption);
      if (exito !== false) {
        setCopiado("¡Imagen comparativa enviada directamente al chat!");
        setTimeout(() => {
          setCopiado(null);
          onCerrar();
        }, 900);
      }
    } catch (err) {
      console.error("Error al enviar imagen al chat:", err);
      alert("Hubo un detalle al enviar la imagen al chat.");
    } finally {
      setEnviandoImagenChat(false);
    }
  }

  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = words[0] || "";

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + " " + word).width;
      if (width < maxWidth) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-50 border border-carbon/15 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Cabecera del Modal */}
        <div className="bg-verde-profundo text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🧮</span>
              <h2 className="text-lg sm:text-xl font-bold font-titular tracking-tight">
                Calculadora Rápida de Impermeabilización
              </h2>
            </div>
            <p className="text-xs text-crema/80 mt-0.5">
              Genera al instante la propuesta de precios y comparativa para {nombreCliente || "el cliente"}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Botón Enviar Imagen Directa (si tiene callback de chat) */}
            {onEnviarImagenDirecta && (
              <button
                type="button"
                onClick={manejarEnviarImagenAlChat}
                disabled={enviandoImagenChat || generandoImagen}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
                title="Enviar la imagen comparativa directamente al chat del cliente"
              >
                <span>{enviandoImagenChat ? "⏳" : "📤"}</span>
                <span>{enviandoImagenChat ? "Enviando imagen..." : "Enviar Imagen al Chat"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={generarYDescargarImagen}
              disabled={generandoImagen || enviandoImagenChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dorado hover:bg-dorado/90 text-carbon font-bold text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
              title="Descargar imagen PNG lista para enviar"
            >
              <span>{generandoImagen ? "⏳" : "📸"}</span>
              <span>{generandoImagen ? "Generando..." : "Descargar Imagen"}</span>
            </button>

            <button
              type="button"
              onClick={() => manejarInsertar(generarTextoComparativaCompleta(), "Comparativa Completa")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sauce hover:bg-sauce/80 text-white font-bold text-xs shadow-sm transition cursor-pointer"
              title="Insertar comparativa de los 3 paquetes en el chat"
            >
              <span>📋</span>
              <span>Insertar Texto</span>
            </button>

            <button
              type="button"
              onClick={onCerrar}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition text-sm cursor-pointer"
              title="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Notificación de Copiado / Insertado */}
        {copiado && (
          <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 text-center animate-pulse">
            ✓ {copiado}
          </div>
        )}

        {/* Barra de Control de Metros Cuadrados */}
        <div className="bg-white p-3 sm:p-4 border-b border-carbon/10 shrink-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            
            {/* Input de m2 */}
            <div className="flex items-center gap-2">
              <label htmlFor="metros-input" className="text-xs font-bold text-carbon/70 whitespace-nowrap">
                Superficie azotea:
              </label>
              <div className="relative flex items-center">
                <input
                  id="metros-input"
                  type="number"
                  min="1"
                  step="1"
                  value={metros || ""}
                  onChange={(e) => setMetros(parseFloat(e.target.value) || 0)}
                  className="w-24 px-3 py-1.5 bg-slate-50 border border-carbon/20 rounded-lg text-sm font-bold font-mono text-verde-profundo text-center focus:outline-none focus:border-sauce focus:ring-2 focus:ring-sauce/20"
                />
                <span className="ml-1.5 text-xs font-bold text-carbon/50">m²</span>
              </div>

              {/* Botones +/- */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMetros((m) => Math.max(1, (m || 0) - 5))}
                  className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 border border-carbon/15 font-bold text-sm text-carbon transition flex items-center justify-center cursor-pointer"
                  title="Restar 5 m²"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => setMetros((m) => (m || 0) + 5)}
                  className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 border border-carbon/15 font-bold text-sm text-carbon transition flex items-center justify-center cursor-pointer"
                  title="Sumar 5 m²"
                >
                  +
                </button>
              </div>
            </div>

            {/* Presets Rápidos */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-carbon/40">Comunes:</span>
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setMetros(p)}
                  className={`px-2 py-1 rounded text-xs font-bold transition cursor-pointer ${
                    metros === p
                      ? "bg-verde-profundo text-white shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-carbon/70 border border-carbon/10"
                  }`}
                >
                  {p} m²
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Contenedor con las 3 Tarjetas de Precios */}
        <div ref={cardsRef} className="p-3 sm:p-5 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-stretch">
            
            {PAQUETES.map((pkg) => {
              const total = m2Val * pkg.precioM2;
              const esPremium = pkg.destacado;

              return (
                <div
                  key={pkg.id}
                  className={`relative rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 ${
                    esPremium
                      ? "bg-[#FAF7EE] border-2 border-dorado shadow-md hover:shadow-lg"
                      : "bg-white border border-carbon/15 shadow-xs hover:shadow-md"
                  }`}
                >
                  {/* Ribbon de Garantía en Premium */}
                  {esPremium && (
                    <div className="absolute top-0 right-0 overflow-hidden w-28 h-28 pointer-events-none">
                      <div className="absolute transform rotate-45 bg-dorado text-verde-profundo text-[9px] font-black uppercase py-1 right-[-32px] top-[18px] w-[130px] text-center shadow-xs border-b border-verde-profundo/20">
                        10 AÑOS GARANTÍA
                      </div>
                    </div>
                  )}

                  {/* Cuerpo Superior */}
                  <div className="space-y-3">
                    {/* Badge */}
                    <span
                      className={`inline-block text-[10px] font-extrabold uppercase tracking-wider ${
                        esPremium ? "text-dorado" : "text-sauce"
                      }`}
                    >
                      {pkg.badge}
                    </span>

                    {/* Título & Subtítulo */}
                    <div>
                      <h3 className="font-titular font-extrabold text-base sm:text-lg text-carbon leading-tight">
                        {pkg.titulo}
                      </h3>
                      <p className="text-xs text-carbon/60 mt-1 leading-snug">
                        {pkg.subtitulo}
                      </p>
                    </div>

                    {/* Precio por m² */}
                    <div className="pt-2">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xs font-bold text-carbon/50 self-start mt-1">$</span>
                        <span
                          className={`font-mono text-3xl sm:text-4xl font-black ${
                            esPremium ? "text-dorado" : "text-verde-profundo"
                          }`}
                        >
                          {pkg.precioM2}
                        </span>
                        <span className="text-xs font-semibold text-carbon/60">por m²</span>
                      </div>

                      {/* Box Total Calculado */}
                      <div
                        className={`mt-2 p-2 rounded-lg text-xs font-mono font-bold flex items-center justify-between ${
                          esPremium ? "bg-dorado/15 text-carbon" : "bg-slate-100 text-carbon/80"
                        }`}
                      >
                        <span className="text-[11px] font-sans text-carbon/60 font-medium">
                          Total {m2Val} m²:
                        </span>
                        <span className="text-xs font-extrabold text-verde-profundo">
                          {formatearDinero(total)} MXN
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-carbon/10 my-3"></div>

                    {/* Lista de Inclusiones */}
                    <div className="space-y-1.5 text-xs text-carbon/80">
                      {pkg.incluye.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="text-sauce font-bold shrink-0">✓</span>
                          <span className="leading-tight text-[11px]">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cuerpo Inferior (Métricas y Botón) */}
                  <div className="pt-4 mt-4 border-t border-carbon/10 space-y-3">
                    {/* Grilla Garantía / Ejecución */}
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div
                        className={`p-2 rounded-lg ${
                          esPremium ? "bg-dorado/10" : "bg-slate-50"
                        } border border-carbon/5`}
                      >
                        <span className="block text-[9px] uppercase font-bold text-carbon/40 tracking-wider">
                          Garantía
                        </span>
                        <span className="text-xs font-extrabold text-verde-profundo">
                          {pkg.garantia}
                        </span>
                      </div>

                      <div
                        className={`p-2 rounded-lg ${
                          esPremium ? "bg-dorado/10" : "bg-slate-50"
                        } border border-carbon/5`}
                      >
                        <span className="block text-[9px] uppercase font-bold text-carbon/40 tracking-wider">
                          Ejecución
                        </span>
                        <span className="text-xs font-extrabold text-carbon/80">
                          {pkg.ejecucion}
                        </span>
                      </div>
                    </div>

                    {/* Bloque "Mejor para" */}
                    <div
                      className={`p-2.5 rounded-lg text-[11px] leading-snug ${
                        esPremium ? "bg-white border border-dorado/30" : "bg-slate-50 border border-carbon/5"
                      }`}
                    >
                      <strong className="text-carbon/90 font-bold">Mejor para:</strong>{" "}
                      <span className="text-carbon/70">{pkg.mejorPara}</span>
                    </div>

                    {/* Botón de acción */}
                    <button
                      type="button"
                      onClick={() =>
                        manejarInsertar(
                          generarTextoPaqueteIndividual(pkg),
                          `Paquete ${pkg.badge}`
                        )
                      }
                      className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer ${
                        esPremium
                          ? "bg-dorado hover:bg-dorado/90 text-carbon font-extrabold"
                          : pkg.id === "estandar"
                          ? "bg-verde-profundo hover:bg-verde-profundo/90 text-white"
                          : "bg-white hover:bg-slate-50 text-verde-profundo border-2 border-verde-profundo"
                      }`}
                    >
                      <span>💬</span>
                      <span>Cotizar paquete {pkg.badge}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pie del Modal */}
        <div className="bg-white p-3 sm:p-4 border-t border-carbon/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-carbon/60 flex items-center gap-1.5">
            <span className="text-sauce font-bold">💡 Tip:</span>
            <span>
              Puedes enviar la imagen comparativa directa a WhatsApp o pegar el texto estructurado en el chat.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCerrar}
              className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-carbon/80 font-bold text-xs transition cursor-pointer"
            >
              Cerrar
            </button>

            <button
              type="button"
              onClick={() => manejarInsertar(generarTextoComparativaCompleta(), "Comparativa Completa")}
              className="px-3.5 py-2 rounded-lg bg-verde-profundo hover:bg-verde-profundo/90 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5"
            >
              <span>📋</span>
              <span>Insertar Texto Comparativo</span>
            </button>

            {/* Botón Enviar Imagen Comparativa al Chat (lado derecho) */}
            {onEnviarImagenDirecta && (
              <button
                type="button"
                onClick={manejarEnviarImagenAlChat}
                disabled={enviandoImagenChat || generandoImagen}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                title="Enviar la imagen comparativa directamente al chat"
              >
                <span>{enviandoImagenChat ? "⏳" : "📤"}</span>
                <span>{enviandoImagenChat ? "Enviando imagen..." : "Enviar Imagen Comparativa"}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
