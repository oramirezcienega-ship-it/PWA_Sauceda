import type { PaqueteInfo } from "@/lib/impermeabilizacion-paquetes";
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

function tarjeta(pkg: PaqueteInfo, m2: number): Nodo {
  const premium = !!pkg.destacado;
  const total = m2 * pkg.precioM2;
  const acento = premium ? DORADO_OSC : VERDE_CLARO;

  return h(
    "div",
    {
      flexDirection: "column",
      width: 346,
      height: 585,
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
      h("div", { color: "#0F172A", fontSize: 20, fontWeight: 800, marginTop: 6, lineHeight: 1.15, maxWidth: premium ? 250 : 300 }, pkg.titulo),
      h("div", { color: "#64748B", fontSize: 13, marginTop: 6 }, pkg.subtitulo),
      // Precio total
      h("div", { alignItems: "flex-end", marginTop: 14, color: premium ? DORADO_OSC : VERDE }, [
        h("div", { fontSize: 20, fontWeight: 800, marginBottom: 6, marginRight: 4 }, "$"),
        h("div", { fontSize: 42, fontWeight: 800, lineHeight: 1 }, dinero(total)),
        h("div", { fontSize: 14, fontWeight: 800, color: "#64748B", marginLeft: 6, marginBottom: 5 }, "MXN"),
      ]),
      h("div", { color: "#64748B", fontSize: 13, marginTop: 8 }, `$${dinero(pkg.precioM2)} por m²  ·  ${m2} m²`),
      h("div", { height: 1, backgroundColor: "#E2E8F0", marginTop: 14, marginBottom: 12 }),
      // Incluye
      h(
        "div",
        { flexDirection: "column", flexGrow: 1 },
        pkg.incluye.map((item) =>
          h("div", { marginBottom: 6 }, [
            h("div", { width: 7, height: 7, borderRadius: 4, backgroundColor: VERDE_CLARO, marginTop: 5, marginRight: 9, flexShrink: 0 }),
            h("div", { color: "#334155", fontSize: 12.5, flexGrow: 1, flexShrink: 1, lineHeight: 1.25 }, item),
          ])
        )
      ),
      // Garantía
      h(
        "div",
        {
          flexDirection: "column",
          padding: "8px 10px",
          borderRadius: 8,
          backgroundColor: premium ? "#FAF0D7" : "#F8FAFC",
          border: `1px solid ${premium ? "#E2D7BE" : "#E2E8F0"}`,
        },
        [
          h("div", { color: "#64748B", fontSize: 9.5, fontWeight: 800 }, "GARANTÍA POR ESCRITO"),
          h("div", { color: VERDE, fontSize: 15, fontWeight: 800, marginTop: 2 }, pkg.garantia),
        ]
      ),
      // Mejor para
      h(
        "div",
        {
          marginTop: 8,
          padding: "8px 10px",
          borderRadius: 8,
          backgroundColor: premium ? "#FFFFFF" : "#F8FAFC",
          border: `1px solid ${premium ? "#E2D7BE" : "#E2E8F0"}`,
          color: "#475569",
          fontSize: 11.5,
          lineHeight: 1.3,
          height: 62,
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

  const textoPill = `Propuesta para: ${m2} m²`;
  const alto = 770;

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
      h("div", { padding: "22px 54px 0", justifyContent: "space-between" }, paquetes.map((p) => tarjeta(p, m2))),
      h(
        "div",
        { justifyContent: "center", marginTop: 14, color: "#64748B", fontSize: 13 },
        "Precios más IVA · Diagnóstico técnico gratuito en sitio · Pago en efectivo o transferencia"
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
