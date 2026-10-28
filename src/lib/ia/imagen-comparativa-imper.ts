import { cotizarPaquete, type PaqueteInfo } from "@/lib/impermeabilizacion-paquetes";
import { INTER_400_BASE64, INTER_700_BASE64, INTER_800_BASE64 } from "@/lib/ia/fuente-inter";

/**
 * Imagen comparativa (Acrílico / Estándar / Premium) para enviar por WhatsApp.
 * Mismo diseño que la calculadora del CRM ("Enviar Imagen Comparativa"), pero
 * renderizada en servidor con satori (texto convertido a trazos: no depende de
 * las fuentes del sistema) y sharp (SVG → PNG).
 */

const ANCHO = 1200;
const VERDE = "#2D4A2B";
const VERDE_CLARO = "#5C7A52";
const DORADO = "#C9A961";
const DORADO_OSC = "#B58E3F";

type Nodo = { type: string; props: Record<string, any> };
const h = (type: string, style: Record<string, any>, children?: any, extra: Record<string, any> = {}): Nodo => ({
  type,
  props: { style: { display: "flex", ...style }, ...(children !== undefined ? { children } : {}), ...extra },
});

const dinero = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 0 });

function tarjeta(pkg: PaqueteInfo, m2: number, cardWidth = 346): Nodo {
  const premium = !!pkg.destacado;
  const { total, m2Cobrados, precioM2, aplicaMinimo } = cotizarPaquete(pkg, m2);
  const acento = premium ? DORADO_OSC : VERDE_CLARO;
  const aniosGarantia = pkg.id === "premium" ? 10 : pkg.id === "estandar" ? 5 : 3;
  const costoMes = Math.round(total / (aniosGarantia * 12));

  return h(
    "div",
    {
      flexDirection: "column",
      width: cardWidth,
      height: 595,
      padding: 22,
      borderRadius: 20,
      backgroundColor: premium ? "#FAF7EE" : "#FFFFFF",
      border: `${premium ? 2 : 1.5}px solid ${premium ? DORADO : "#E2E8F0"}`,
      position: "relative",
      overflow: "hidden",
    },
    [
      premium
        ? h(
            "div",
            {
              position: "absolute",
              top: 30,
              right: -68,
              width: 240,
              height: 26,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: DORADO_OSC,
              color: "#FFFFFF",
              fontSize: 10.5,
              fontWeight: 800,
              transform: "rotate(45deg)",
            },
            "10 AÑOS GARANTÍA"
          )
        : null,
      h("div", { color: acento, fontSize: 12, fontWeight: 800 }, pkg.badge),
      h("div", { color: "#0F172A", fontSize: 20, fontWeight: 800, marginTop: 6, lineHeight: 1.15, maxWidth: premium ? (cardWidth > 400 ? 420 : 250) : (cardWidth > 400 ? 460 : 300) }, pkg.titulo),
      h("div", { color: "#64748B", fontSize: 13, marginTop: 4 }, pkg.subtitulo),
      // 1. Tarifa por m² (Hero principal accesible)
      h("div", { alignItems: "flex-end", marginTop: 12, color: premium ? DORADO_OSC : VERDE }, [
        h("div", { fontSize: 18, fontWeight: 800, marginBottom: 4, marginRight: 2 }, "$"),
        h("div", { fontSize: 36, fontWeight: 800, lineHeight: 1 }, dinero(precioM2)),
        h("div", { fontSize: 14, fontWeight: 700, color: "#64748B", marginLeft: 4, marginBottom: 4 }, "MXN / m²"),
      ]),
      // 2. Total estimado para los metros (Caja clara y transparente)
      h(
        "div",
        {
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 8,
          backgroundColor: premium ? "#FAF0D7" : "#F1F5F9",
          padding: "5px 10px",
          borderRadius: 8,
          border: `1px solid ${premium ? "#E2D7BE" : "#E2E8F0"}`,
        },
        [
          h(
            "div",
            { color: aplicaMinimo ? "#B45309" : "#475569", fontSize: 11.5, fontWeight: 600 },
            aplicaMinimo ? `Total est. (mín. ${m2Cobrados} m²):` : `Total est. (${m2} m²):`
          ),
          h(
            "div",
            { color: premium ? DORADO_OSC : VERDE, fontSize: 13.5, fontWeight: 800 },
            `$${dinero(total)} MXN`
          ),
        ]
      ),
      // 3. Amortización / cuota mensual psicológica
      h(
        "div",
        {
          color: "#64748B",
          fontSize: 11,
          marginTop: 6,
          fontWeight: 600,
        },
        `Equivale a ~$${dinero(costoMes)} MXN / mes (${aniosGarantia} años de protección)`
      ),
      h("div", { height: 1, backgroundColor: "#E2E8F0", marginTop: 10, marginBottom: 10 }),
      // Incluye
      h(
        "div",
        { flexDirection: "column", flexGrow: 1 },
        pkg.incluye.map((item) =>
          h("div", { marginBottom: 5 }, [
            h("div", { width: 7, height: 7, borderRadius: 4, backgroundColor: VERDE_CLARO, marginTop: 5, marginRight: 9, flexShrink: 0 }),
            h("div", { color: "#334155", fontSize: 12, flexGrow: 1, flexShrink: 1, lineHeight: 1.25 }, item),
          ])
        )
      ),
      // Garantía
      h(
        "div",
        {
          flexDirection: "column",
          padding: "6px 10px",
          borderRadius: 8,
          backgroundColor: premium ? "#FAF0D7" : "#F8FAFC",
          border: `1px solid ${premium ? "#E2D7BE" : "#E2E8F0"}`,
        },
        [
          h("div", { color: "#64748B", fontSize: 9.5, fontWeight: 800 }, "GARANTÍA POR ESCRITO"),
          h("div", { color: VERDE, fontSize: 14, fontWeight: 800, marginTop: 1 }, pkg.garantia),
        ]
      ),
      // Mejor para
      h(
        "div",
        {
          marginTop: 6,
          padding: "6px 10px",
          borderRadius: 8,
          backgroundColor: premium ? "#FFFFFF" : "#F8FAFC",
          border: `1px solid ${premium ? "#E2D7BE" : "#E2E8F0"}`,
          color: "#475569",
          fontSize: 11,
          lineHeight: 1.25,
          height: 52,
        },
        `Mejor para: ${pkg.mejorPara}`
      ),
    ]
  );
}

/** Devuelve el PNG de la comparativa para `m2` metros cuadrados. */
export async function generarImagenComparativaImper(paquetes: PaqueteInfo[], m2: number): Promise<Buffer> {
  const satori = (await import("satori")).default;
  const sharp = (await import("sharp")).default;

  // Si la superficie es menor a 25 m², omitimos el acrílico y mostramos solo las 2 opciones en manto asfáltico
  const pkgsParaMostrar = m2 < 25 ? paquetes.filter((p) => p.id !== "acrilico") : paquetes;
  const dosTarjetas = pkgsParaMostrar.length === 2;
  const cardWidth = dosTarjetas ? 515 : 346;

  const textoPill = m2 < 25 ? `Propuesta: ${m2} m² (Mínimo 25 m²)` : `Propuesta para: ${m2} m²`;
  const alto = 780;

  const arbol = h(
    "div",
    { flexDirection: "column", width: ANCHO, height: alto, backgroundColor: "#F8FAFC", fontFamily: "Inter" },
    [
      h("div", { height: 118, backgroundColor: VERDE, padding: "0 54px", alignItems: "center", justifyContent: "space-between" }, [
        h("div", { flexDirection: "column" }, [
          h("div", { color: "#FFFFFF", fontSize: 32, fontWeight: 800 }, "SAUCEDA CONSTRUYE"),
          h("div", { color: DORADO, fontSize: 16, fontWeight: 800, marginTop: 6 }, "PROPUESTA DE IMPERMEABILIZACIÓN"),
        ]),
        h("div", { backgroundColor: VERDE_CLARO, color: "#FFFFFF", fontSize: 19, fontWeight: 800, padding: "11px 22px", borderRadius: 24 }, textoPill),
      ]),
      h(
        "div",
        { padding: dosTarjetas ? "20px 60px 0" : "20px 54px 0", justifyContent: "space-between" },
        pkgsParaMostrar.map((p) => tarjeta(p, m2, cardWidth))
      ),
      h(
        "div",
        { justifyContent: "center", marginTop: 12, color: "#64748B", fontSize: 12.5 },
        "Precios sin factura (con factura se agrega IVA) · Medición exacta y diagnóstico técnico sin costo en tu domicilio"
      ),
    ]
  );

  const fuente = (b64: string) => Buffer.from(b64, "base64");
  const svg = await satori(arbol as any, {
    width: ANCHO,
    height: alto,
    fonts: [
      { name: "Inter", data: fuente(INTER_400_BASE64), weight: 400, style: "normal" },
      { name: "Inter", data: fuente(INTER_700_BASE64), weight: 700, style: "normal" },
      { name: "Inter", data: fuente(INTER_800_BASE64), weight: 800, style: "normal" },
    ],
  });

  return sharp(Buffer.from(svg)).png().toBuffer();
}
