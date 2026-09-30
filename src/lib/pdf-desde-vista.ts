import type { Browser } from "puppeteer-core";

/**
 * Genera PDF a partir de las MISMAS páginas públicas que el usuario imprime desde el navegador
 * (cotización, recibo, póliza), con un Chromium sin pantalla. Así el PDF que se manda por
 * Telegram es idéntico al que se imprime.
 *
 * Es best-effort: si Chromium no está disponible o la página no carga, devuelve null y quien
 * llama usa su PDF de respaldo (jsPDF).
 *
 * Ejecutable: CHROMIUM_EXECUTABLE_PATH (opcional) o el binario empaquetado de @sparticuz/chromium.
 */

const TIMEOUT_CARGA_MS = 30_000;

async function abrirNavegador(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  const propio = process.env.CHROMIUM_EXECUTABLE_PATH;
  if (propio) {
    return puppeteer.launch({
      executablePath: propio,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--font-render-hinting=none"],
    });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: [...chromium.args, "--font-render-hinting=none"],
  });
}

export interface VistaPdf {
  url: string;
  /** Texto que, si aparece en la página, indica que no es el documento (p. ej. "no está disponible"). */
  textosDeError?: string[];
  /** Si el documento debe quedar en UNA sola hoja (se reduce la escala solo lo necesario). */
  unaHoja?: boolean;
}

/** Número de páginas de un PDF generado por Chromium. */
function paginasPdf(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
}

/** Convierte cada URL en un PDF tamaño carta; devuelve null en las que fallen. */
export async function pdfsDesdeVistas(vistas: VistaPdf[]): Promise<(Buffer | null)[]> {
  if (vistas.length === 0) return [];
  let navegador: Browser | null = null;
  const resultados: (Buffer | null)[] = vistas.map(() => null);
  try {
    navegador = await abrirNavegador();
    for (let i = 0; i < vistas.length; i++) {
      const v = vistas[i];
      const pagina = await navegador.newPage();
      try {
        // La vista de impresión llama a window.print(): aquí no debe hacer nada
        await pagina.evaluateOnNewDocument(() => {
          window.print = () => {};
        });
        await pagina.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });
        const resp = await pagina.goto(v.url, { waitUntil: "networkidle0", timeout: TIMEOUT_CARGA_MS });
        if (!resp || resp.status() >= 400) {
          console.warn(`[PDF vista] ${v.url} respondió ${resp?.status()}`);
          continue;
        }
        await pagina.evaluate(() => (document as any).fonts?.ready);

        const texto: string = await pagina.evaluate(() => document.body?.innerText || "");
        if ((v.textosDeError || []).some((t) => texto.toLowerCase().includes(t.toLowerCase()))) {
          console.warn(`[PDF vista] ${v.url} no muestra el documento (texto de error detectado).`);
          continue;
        }

        await pagina.emulateMediaType("print");

        const generar = async (escala: number) =>
          Buffer.from(
            await pagina.pdf({
              width: "8.5in",
              height: "11in",
              scale: escala,
              printBackground: true,
              preferCSSPageSize: false,
              displayHeaderFooter: false,
              margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
            })
          );

        if (!v.unaHoja) {
          resultados[i] = await generar(1);
        } else {
          // UNA sola hoja: se busca la escala más grande (≤ 1) con la que la impresión real
          // sigue ocupando una página (reducir la escala también reacomoda el texto).
          let ok: { esc: number; pdf: Buffer } | null = null;
          let falla = 1.0001;
          let esc = 1;
          for (let k = 0; k < 10 && !ok; k++) {
            const pdf = await generar(esc);
            if (paginasPdf(pdf) <= 1) ok = { esc, pdf };
            else {
              falla = esc;
              esc = Math.max(0.3, esc * 0.92);
            }
          }
          if (ok && falla > ok.esc) {
            // Afina hacia arriba entre la última escala que cabe y la primera que no
            let bajo = ok.esc;
            let alto = Math.min(falla, 1);
            for (let k = 0; k < 4; k++) {
              const medio = (bajo + alto) / 2;
              const pdf = await generar(medio);
              if (paginasPdf(pdf) <= 1) {
                ok = { esc: medio, pdf };
                bajo = medio;
              } else {
                alto = medio;
              }
            }
          }
          resultados[i] = ok ? ok.pdf : await generar(0.3);
        }
      } catch (err) {
        console.warn(`[PDF vista] Error con ${v.url}:`, err);
      } finally {
        await pagina.close().catch(() => {});
      }
    }
  } catch (err) {
    console.warn("[PDF vista] No se pudo iniciar Chromium; se usarán los PDF de respaldo:", err);
  } finally {
    await navegador?.close().catch(() => {});
  }
  return resultados;
}
